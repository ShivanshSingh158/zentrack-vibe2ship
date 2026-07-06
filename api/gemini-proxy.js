/**
 * @file gemini-proxy.js
 * @module api/gemini-proxy
 *
 * ZenTrack — Secure Server-Side Gemini API Proxy (Vercel Serverless Function)
 *
 * ## Why This Exists
 *
 * Gemini API keys must NEVER appear in the browser bundle. Any `VITE_`-prefixed
 * env var is compiled into the JavaScript bundle and visible to anyone via DevTools.
 * This proxy holds the real keys server-side and forwards only authenticated requests.
 *
 * ## Request Flow
 * ```
 * 1. Browser sends: POST /api/gemini-proxy
 *    Headers: { Authorization: "Bearer <Firebase ID Token>" }
 *    Body:    { model, contents, tools, toolConfig, systemInstruction, ... }
 *
 * 2. Proxy verifies Firebase ID token via Admin SDK
 * 3. Per-user rate limiting: 100 req/min tracked in Firestore
 * 4. Round-robin key rotation across GEMINI_API_KEYS pool
 * 5. Forward to Gemini API — returns identical response shape
 * ```
 *
 * ## CRITICAL: tools and toolConfig Must Be Forwarded
 *
 * Without `tools` and `toolConfig` in the forwarded request, Gemini has no
 * knowledge that any functions exist. Agents silently degrade to text-only
 * mode and can never call create_task, read_gmail, or any other tool.
 * This was the root cause of the "agents can't do anything on production" bug.
 *
 * ## Required Vercel Environment Variables
 *
 * | Variable | Description |
 * |---|---|
 * | `GEMINI_API_KEYS` | Comma-separated Gemini API keys (all 10 of your keys) |
 * | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin service account JSON (stringified) |
 * | `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `https://yourapp.vercel.app`) |
 *
 * @note Do NOT put `VITE_GEMINI_API_KEY` on Vercel — keys live server-side only.
 */


import admin from 'firebase-admin';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://examplePublicKey@o0.ingest.sentry.io/0",
  tracesSampleRate: 1.0,
});
// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
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

let db;
try {
  if (admin.apps.length > 0) db = admin.firestore();
} catch (e) {
  console.warn('[gemini-proxy] Firestore not available.');
}

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
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Verify Firebase ID Token (skipped in local dev) ─────────────────────
  const authHeader = req.headers['authorization'] || '';
  let uid;

  if (IS_LOCAL_DEV) {
    uid = 'local-dev-user';
  } else {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing Firebase ID token.', code: 401, status: 'UNAUTHENTICATED' } });
    }
    const idToken = authHeader.replace('Bearer ', '').trim();
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      return res.status(401).json({ error: { message: 'Invalid or expired Firebase ID token.', code: 401, status: 'UNAUTHENTICATED' } });
    }
  }

  // ── 2. Per-User Rate Limiting (100 req/min) ──────────────────────────────────
  // Uses a time-bucketed document key: uid_MINUTETIMESTAMP
  // Admin SDK writes bypass Firestore security rules — no client can touch this collection.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const rateLimitKey = `${uid}_${minuteBucket}`;
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

  // ── 3. Validate Request Body ──────────────────────────────────────────────────
  const {
    model = 'gemini-2.5-flash',
    contents,
    generationConfig,
    systemInstruction,
    safetySettings,
    tools,       // ✅ CRITICAL FIX: Forward function declarations to enable agent tool calling
    toolConfig,  // ✅ CRITICAL FIX: Forward tool config (mode: ANY/AUTO + allowedFunctionNames)
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

  let lastStatus = 500;
  let lastErrorMsg = 'Unknown error';

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = getNextKey();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        lastStatus = geminiRes.status;
        lastErrorMsg = data?.error?.message || `Gemini API error (HTTP ${geminiRes.status})`;
        
        console.warn(`[gemini-proxy] Key failed with ${lastStatus}. Trying next... (${attempt + 1}/${GEMINI_KEYS.length})`);
        
        // 400/404 usually means the prompt/model is invalid, not the key. Don't waste keys on it.
        if (lastStatus === 400 || lastStatus === 404) {
          return res.status(lastStatus).json({ error: { message: lastErrorMsg, code: lastStatus } });
        }
        
        continue;
      }

      // Success!
      return res.status(200).json(data);

    } catch (fetchErr) {
      console.error('[gemini-proxy] Fetch failed:', fetchErr.message);
      lastStatus = 500;
      lastErrorMsg = fetchErr.message;
      continue;
    }
  }

  console.error(`[gemini-proxy] All keys exhausted for uid=${uid}:`, lastErrorMsg);
  Sentry.captureException(new Error(`All keys exhausted: ${lastErrorMsg}`), { tags: { uid } });
  return res.status(lastStatus).json({ error: { message: `All API keys exhausted. Last error: ${lastErrorMsg}`, code: lastStatus } });
}
