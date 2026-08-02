import express from 'express';
/**
 * server/routes/gemini-proxy-stream.js
 *
 * ZenTrack — Server-Side Gemini Streaming API Proxy
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  CRITICAL FIX: Keys are read LAZILY inside each request  ║
 * ║  NOT as a module-level const. This is essential because  ║
 * ║  Vercel serverless injects env vars AFTER module load on  ║
 * ║  cold starts. Using `const KEYS = process.env...` at the ║
 * ║  top of the file means it always reads an empty string.  ║
 * ╚══════════════════════════════════════════════════════════╝
 */

import admin from 'firebase-admin';
import * as Sentry from '@sentry/node';

export const config = {
  supportsResponseStreaming: true,
};

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://examplePublicKey@o0.ingest.sentry.io/0',
  tracesSampleRate: 1.0,
});

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (Object.keys(serviceAccount).length > 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (err) {
    console.error('[gemini-stream] Firebase Admin init failed:', err.message);
  }
}

let db;
try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
  }
} catch (e) {
  console.warn('[gemini-stream] Firestore not available.');
}

const IS_LOCAL_DEV = process.env.NODE_ENV !== 'production';

// ── LAZY key pool — called per-request so Vercel env vars are always fresh ──
const getKeysPool = () => {
  const raw = process.env.GEMINI_API_KEYS
    || process.env.GEMINI_API_KEY
    || process.env.VITE_GEMINI_API_KEY
    || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  console.log(`[gemini-stream] Key pool size: ${keys.length}`);
  return keys;
};

// ── Model Normalizer ──────────────────────────────────────────────────────────
// AQ. format keys: gemini-2.5-flash ✅, gemini-2.0-flash ❌ (limit:0), gemini-1.5-flash ❌ (404)
const normalizeModel = (name) => {
  if (!name || typeof name !== 'string') return 'gemini-2.5-flash';
  const clean = name.trim();
  // Only reject completely unknown prefixes
  if (!clean.startsWith('gemini-')) return 'gemini-2.5-flash';
  return clean;
};

// ── CORS Helper ──────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (process.env.ALLOWED_ORIGINS
    || 'https://zentrackworld.vercel.app,https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Main Handler ─────────────────────────────────────────────────────────────
const router = express.Router();

router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  let uid;

  if (IS_LOCAL_DEV) {
    uid = 'local-dev-user';
    console.log('[gemini-stream] LOCAL DEV mode: auth bypassed');
  } else {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing Firebase ID token.', code: 401 } });
    }
    const idToken = authHeader.slice(7).trim();
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      console.error('[gemini-stream] Token verification failed:', err.message);
      return res.status(401).json({ error: { message: 'Invalid or expired Firebase ID token.', code: 401 } });
    }
  }

  // ── 2. Rate Limiting ──────────────────────────────────────────────────────
  if (db) {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const rateLimitRef = db.collection('rate_limits').doc(`${uid}_${minuteBucket}`);
    try {
      const count = await db.runTransaction(async (tx) => {
        const snap = await tx.get(rateLimitRef);
        const current = snap.exists ? (snap.data().count || 0) : 0;
        if (current >= 100) return -1;
        tx.set(rateLimitRef, {
          count: current + 1, uid,
          expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 120_000),
        }, { merge: true });
        return current + 1;
      });
      if (count === -1) {
        return res.status(429).json({ error: 'Rate limit exceeded. Max 100 requests per minute.' });
      }
    } catch (rlErr) {
      console.warn('[gemini-stream] Rate limit check failed (allowing):', rlErr.message);
    }
  }

  // ── 3. Parse Request Body ────────────────────────────────────────────────
  const {
    model = 'gemini-2.5-flash',
    contents,
    generationConfig,
    systemInstruction,
    safetySettings,
    tools,
    toolConfig,
  } = req.body || {};

  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty `contents` array.' });
  }

  const targetModel = normalizeModel(model);

  // ── 4. LAZY key pool read — THIS IS THE CRITICAL FIX ────────────────────
  // Keys are read HERE inside the request handler, NOT at module load time.
  // This ensures Vercel has fully injected env vars before we read them.
  const keys = getKeysPool();
  if (keys.length === 0) {
    console.error('[gemini-stream] GEMINI_API_KEYS is empty — check Vercel Dashboard env vars');
    return res.status(500).json({
      error: 'AI service not configured: GEMINI_API_KEYS is missing in environment. Add it in your Vercel Dashboard under Settings → Environment Variables.',
    });
  }

  const requestBody = { contents };
  if (generationConfig) requestBody.generationConfig = generationConfig;
  if (systemInstruction) requestBody.systemInstruction = systemInstruction;
  if (safetySettings) requestBody.safetySettings = safetySettings;
  if (tools) requestBody.tools = tools;
  if (toolConfig) requestBody.toolConfig = toolConfig;

  // ── 5. Round-robin key rotation with retry on 429 ───────────────────────
  // Pick a random starting key index per-request so all keys share load
  // evenly even across separate serverless cold starts.
  let startIndex = Math.floor(Math.random() * keys.length);
  let geminiRes = null;
  let lastError = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = (startIndex + attempt) % keys.length;
    const apiKey = keys[keyIndex];
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    console.log(`[gemini-stream] Attempt ${attempt + 1}/${keys.length} with key #${keyIndex + 1}, model=${targetModel}`);

    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (geminiRes.ok) {
        console.log(`[gemini-stream] Success with key #${keyIndex + 1}`);
        break;
      }

      const errData = await geminiRes.json().catch(() => ({}));
      lastError = errData?.error?.message || `Gemini error HTTP ${geminiRes.status}`;
      lastStatus = geminiRes.status;
      console.error(`[gemini-stream] Key #${keyIndex + 1} failed: ${geminiRes.status} — ${lastError.slice(0, 150)}`);


      // Only stop retrying on 400 (bad request body) or 404 (model not found)
      // — those failures are about the request itself, not the key.
      // Retry on EVERYTHING else: 401 (invalid key → try next), 429 (quota), 500/503 (server error).
      if (geminiRes.status === 400 || geminiRes.status === 404) {
        break;
      }
      geminiRes = null; // Reset so we try next key
    } catch (fetchErr) {
      lastError = fetchErr.message;
      lastStatus = 500;
      geminiRes = null;
      console.error(`[gemini-stream] Fetch error on attempt ${attempt + 1}:`, fetchErr.message);
    }
  }

  if (!geminiRes || !geminiRes.ok) {
    Sentry.captureException(new Error(lastError || 'All keys failed'), { tags: { uid, status: lastStatus } });
    return res.status(lastStatus || 500).json({
      error: { message: lastError || 'All API keys failed. Try again later.', code: lastStatus || 500 },
    });
  }

  // ── 6. Stream Gemini response back to client ─────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (geminiRes.body) {
      const reader = geminiRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
  } catch (streamErr) {
    console.error('[gemini-stream] Stream error:', streamErr.message);
  }

  return res.end();
});

export default router;
