import express from 'express';
/**
 * api/gemini-proxy-stream.js
 *
 * ZenTrack — Server-Side Gemini API Proxy
 *
 * WHY THIS EXISTS:
 *   Gemini API keys must NEVER be in the browser bundle. Any `VITE_` prefixed
 *   env var is baked into the compiled JS and visible to anyone in DevTools.
 *   This proxy holds the keys server-side and forwards authenticated requests.
 *
 * HOW IT WORKS:
 *   1. Browser sends Firebase ID Token (proves user is logged into ZenTrack)
 *   2. This function verifies the token via Firebase Admin SDK
 *   3. Per-user rate limiting: 100 req/min tracked in Firestore
 *   4. Round-robin key rotation across GEMINI_API_KEYS pool
 *   5. Returns raw Gemini API response — identical shape to calling Gemini directly
 *
 * REQUIRED ENV VARS (Vercel Dashboard — server-only, NO VITE_ prefix):
 *   GEMINI_API_KEYS              — comma-separated API keys (all 10 of your keys)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase service account JSON string
 *   ALLOWED_ORIGINS              — comma-separated allowed CORS origins
 *
 * REMOVE FROM .env:
 *   VITE_GEMINI_API_KEY — DELETE this entirely, keys live server-side now
 */

import admin from 'firebase-admin';
import * as Sentry from '@sentry/node';

export const config = {
  supportsResponseStreaming: true,
};

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://examplePublicKey@o0.ingest.sentry.io/0",
  tracesSampleRate: 1.0,
});
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (Object.keys(serviceAccount).length > 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (err) {
    console.error('[gemini-proxy] Firebase Admin init failed:', err.message);
  }
}

// Safely get db reference if app is initialized
let db;
try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
  }
} catch (e) {
  console.warn('[gemini-proxy] Firestore not available.');
}

// ── Local dev mode detection ──────────────────────────────────────────────────
// Skip Firebase auth verification when running locally (non-production).
// The sarvamGateway server runs locally, so NODE_ENV is never 'production' here.
const IS_LOCAL_DEV = process.env.NODE_ENV !== 'production';

// ── Key Rotation (round-robin across the pool) ────────────────────────────────
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
let _keyIndex = 0;

const getNextKey = () => {
  if (GEMINI_KEYS.length === 0) return null;
  const key = GEMINI_KEYS[_keyIndex % GEMINI_KEYS.length];
  _keyIndex = (_keyIndex + 1) % GEMINI_KEYS.length;
  return key;
};

// ── CORS Helper ───────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174')
    .split(',').map(s => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Main Handler ──────────────────────────────────────────────────────────────
const router = express.Router();
router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Auth (bypass in local dev, strict in production) ─────────────────────
  const authHeader = req.headers['authorization'] || '';
  let uid;

  if (IS_LOCAL_DEV) {
    // Local dev: accept any token (or no token) — just extract uid if present
    uid = 'local-dev-user';
    console.log('[gemini-proxy] LOCAL DEV mode: auth bypassed');
  } else {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing Firebase ID token in Authorization header.', code: 401, status: 'UNAUTHENTICATED' } });
    }
    const idToken = authHeader.replace('Bearer ', '').trim();
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      console.error('[gemini-proxy-stream] Token verification failed:', err.message);
      return res.status(401).json({ error: { message: 'Invalid or expired Firebase ID token.', code: 401, status: 'UNAUTHENTICATED' } });
    }
  }

  const minuteBucket = Math.floor(Date.now() / 60_000);
  const rateLimitKey = `${uid}_${minuteBucket}`;
  
  if (db) {
    const rateLimitRef = db.collection('rate_limits').doc(rateLimitKey);
    try {
      const count = await db.runTransaction(async (tx) => {
        const doc = await tx.get(rateLimitRef);
        const current = doc.exists ? (doc.data().count || 0) : 0;
        if (current >= 100) return -1; // Signal: over limit
        tx.set(
          rateLimitRef,
          {
            count: current + 1,
            uid,
            // Firestore TTL field — auto-deleted after 2 minutes (configure TTL policy in console)
            expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 120_000),
          },
          { merge: true }
        );
        return current + 1;
      });

      if (count === -1) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Max 100 Gemini requests per minute.',
        });
      }
    } catch (rateLimitErr) {
      // Don't block the request if rate limit check fails — log and continue
      console.warn('[gemini-proxy] Rate limit check failed (allowing):', rateLimitErr.message);
    }
  }

  // ── 3. Validate Request Body ──────────────────────────────────────────────────
  const {
    model = 'gemini-2.5-flash',
    contents,
    generationConfig,
    systemInstruction,
    safetySettings,
    tools,       // ✅ CRITICAL: Forward function declarations to enable agent tool calling
    toolConfig,  // ✅ CRITICAL: Forward tool config (mode: ANY/AUTO + allowedFunctionNames)
  } = req.body || {};

  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty `contents` array.' });
  }

  // ── 4. Pick API Key & Forward to Gemini ──────────────────────────────────────
  if (GEMINI_KEYS.length === 0) {
    console.error('[gemini-proxy] No GEMINI_API_KEYS configured in environment.');
    return res.status(500).json({ error: 'AI service not configured. Contact admin.' });
  }

  const requestBody = { contents };
  if (generationConfig) requestBody.generationConfig = generationConfig;
  if (systemInstruction) requestBody.systemInstruction = systemInstruction;
  if (safetySettings) requestBody.safetySettings = safetySettings;
  // ✅ CRITICAL: Forward tools and toolConfig so agents can call functions in production
  if (tools) requestBody.tools = tools;
  if (toolConfig) requestBody.toolConfig = toolConfig;

  let geminiRes;
  let lastError;
  let lastStatus;

  // Try up to GEMINI_KEYS.length times to find a key that isn't rate-limited
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = getNextKey();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (geminiRes.ok) {
        break; // Success! Break out of the loop
      }

      const data = await geminiRes.json().catch(() => ({}));
      const errMsg = data?.error?.message || `Gemini API error (HTTP ${geminiRes.status})`;
      console.error(`[gemini-proxy-stream] Gemini error ${geminiRes.status} for uid=${uid} (attempt ${attempt + 1}/${GEMINI_KEYS.length}):`, errMsg.slice(0, 200));
      lastError = errMsg;
      lastStatus = geminiRes.status;

      // Only retry on quota exceeded (429) or server errors (500, 503)
      if (geminiRes.status !== 429 && geminiRes.status !== 503 && geminiRes.status !== 500) {
        break; // Bad Request (400) or Not Found (404) etc., should not be retried with a different key
      }
    } catch (fetchErr) {
      console.error(`[gemini-proxy] Fetch failed on attempt ${attempt + 1}:`, fetchErr.message);
      lastError = fetchErr.message;
      lastStatus = 500;
    }
  }

  if (!geminiRes || !geminiRes.ok) {
    Sentry.captureException(new Error(lastError || 'All API keys failed'), {
      tags: { uid, status: lastStatus }
    });
    return res.status(lastStatus || 500).json({ error: { message: lastError || 'All API keys failed. Rate limited.', code: lastStatus || 500 } });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (geminiRes.body) {
    const reader = geminiRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  return res.end();
}


export default router;
