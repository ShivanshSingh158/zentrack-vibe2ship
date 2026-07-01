/**
 * api/gemini-proxy.js
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

// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[gemini-proxy] Firebase Admin init failed:', err.message);
  }
}

const db = admin.firestore();

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

  // ── 1. Verify Firebase ID Token ──────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Missing Firebase ID token in Authorization header.', code: 401, status: 'UNAUTHENTICATED' } });
  }
  const idToken = authHeader.replace('Bearer ', '').trim();

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired Firebase ID token.', code: 401, status: 'UNAUTHENTICATED' } });
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
  } = req.body || {};

  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty `contents` array.' });
  }

  // ── 4. Pick API Key & Forward to Gemini ──────────────────────────────────────
  const apiKey = getNextKey();
  if (!apiKey) {
    console.error('[gemini-proxy] No GEMINI_API_KEYS configured in environment.');
    return res.status(500).json({ error: 'AI service not configured. Contact admin.' });
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = { contents };
  if (generationConfig) requestBody.generationConfig = generationConfig;
  if (systemInstruction) requestBody.systemInstruction = systemInstruction;
  if (safetySettings) requestBody.safetySettings = safetySettings;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || `Gemini API error (HTTP ${geminiRes.status})`;
      console.error(`[gemini-proxy] Gemini error ${geminiRes.status} for uid=${uid}:`, errMsg.slice(0, 200));

      // Return the same status code so the client can handle 429 / 503 etc.
      return res.status(geminiRes.status).json({ error: { message: errMsg, code: geminiRes.status } });
    }

    return res.status(200).json(data);

  } catch (fetchErr) {
    console.error('[gemini-proxy] Fetch failed:', fetchErr.message);
    return res.status(500).json({ error: 'Failed to reach Gemini API. Please retry.' });
  }
}
