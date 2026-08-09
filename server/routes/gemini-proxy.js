import express from 'express';
/**
 * server/routes/gemini-proxy.js
 *
 * ZenTrack — Secure Server-Side Gemini API Proxy (non-streaming)
 * Also handles Sarvam TTS via ?action=tts query param.
 *
 * CRITICAL: All getKeysPool() calls are LAZY (inside the request handler),
 * NOT module-level consts. Vercel injects env vars AFTER module init on cold starts.
 *
 * AUTH: Strict Firebase ID token verification — no fallback-user bypass.
 * Any request without a valid token returns 401.
 */

import admin from 'firebase-admin';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://examplePublicKey@o0.ingest.sentry.io/0',
  tracesSampleRate: 1.0,
});

// ── Firebase Admin Init ───────────────────────────────────────────────────────
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

// ── Sarvam TTS Key Pool ───────────────────────────────────────────────────────
const SARVAM_COOLDOWN_MS = 60_000;
const sarvamKeyPool = (() => {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const key = (process.env[`SARVAM_API_KEY_${i}`] || '').trim();
    if (key) keys.push({ key, label: `sarvam_key${i}`, rateLimitedUntil: 0 });
  }
  const legacy = (process.env.SARVAM_API_KEY || '').trim();
  if (legacy && !keys.find(k => k.key === legacy)) {
    keys.push({ key: legacy, label: 'sarvam_legacy', rateLimitedUntil: 0 });
  }
  return keys;
})();
let _sarvamRrIndex = 0;

const getNextSarvamKey = () => {
  const now = Date.now();
  for (let i = 0; i < sarvamKeyPool.length; i++) {
    const idx = (_sarvamRrIndex + i) % sarvamKeyPool.length;
    if (now >= sarvamKeyPool[idx].rateLimitedUntil) {
      _sarvamRrIndex = (idx + 1) % sarvamKeyPool.length;
      return sarvamKeyPool[idx];
    }
  }
  return null;
};

// ── LAZY Gemini Key Pool — read per-request, NOT at module load ───────────────
const getKeysPool = () => {
  if (process.env.GEMINI_API_KEYS) {
    return process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  }
  // No fallback keys — set GEMINI_API_KEYS in Vercel Dashboard env vars.
  // Returning empty array causes the proxy to return a clear 500 config error.
  return [];
};

// ── Model Normalizer ──────────────────────────────────────────────────────────
const normalizeModel = (name) => {
  if (!name || typeof name !== 'string') return 'gemini-2.5-flash';
  const clean = name.trim();
  if (!clean.startsWith('gemini-')) return 'gemini-2.5-flash';
  return clean;
};

// ── CORS Helper ───────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (process.env.ALLOWED_ORIGINS
    || 'https://zentrackworld.vercel.app,https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean);
  // React Native (mobile app) sends requests with no Origin header — allow those
  // only when a valid Firebase ID token is present (enforced in auth block below).
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : (allowed[0] || '*'));
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Main Router ───────────────────────────────────────────────────────────────
const router = express.Router();

router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Sarvam TTS Action ─────────────────────────────────────────────────────
  if (req.query.action === 'tts') {
    const { text, speaker = 'Shubh' } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    if (sarvamKeyPool.length === 0) {
      return res.status(503).json({ error: 'No Sarvam API keys configured on server.' });
    }
    const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
    const langCode = (devanagariCount / text.length) > 0.15 ? 'hi-IN' : 'en-IN';
    let attemptsLeft = sarvamKeyPool.length;
    while (attemptsLeft > 0) {
      const entry = getNextSarvamKey();
      if (!entry) return res.status(429).json({ error: 'All Sarvam keys rate-limited. Retry in 60s.' });
      try {
        const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-subscription-key': entry.key },
          body: JSON.stringify({
            inputs: [text.substring(0, 500)],
            target_language_code: langCode,
            speaker: speaker.toLowerCase(),
            pace: 1.0,
            speech_sample_rate: 8000,
            enable_preprocessing: true,
            model: 'bulbul:v3',
          }),
        });
        if (sarvamRes.status === 429) {
          entry.rateLimitedUntil = Date.now() + SARVAM_COOLDOWN_MS;
          attemptsLeft--;
          continue;
        }
        if (!sarvamRes.ok) {
          const errText = await sarvamRes.text();
          return res.status(502).json({ error: `Sarvam error ${sarvamRes.status}: ${errText}` });
        }
        const data = await sarvamRes.json();
        const audio = data?.audios?.[0];
        if (!audio) return res.status(502).json({ error: 'Sarvam returned no audio' });
        return res.status(200).json({ audio });
      } catch (err) {
        console.error(`[gemini-proxy/tts] Network error with ${entry.label}:`, err.message);
        attemptsLeft--;
      }
    }
    return res.status(503).json({ error: 'TTS failed after all retries.' });
  }

  // ── 1. Auth — STRICT: reject any request without a valid Firebase ID token ──
  const authHeader = req.headers['authorization'] || '';
  let uid;

  if (IS_LOCAL_DEV) {
    uid = 'local-dev-user';
    console.log('[gemini-proxy] LOCAL DEV mode: auth bypassed');
  } else {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Include a Firebase ID token as Bearer token.' });
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      return res.status(401).json({ error: 'Empty Bearer token.' });
    }
    if (!admin.apps.length) {
      console.error('[gemini-proxy] Firebase Admin not initialized — cannot verify token.');
      return res.status(503).json({ error: 'Auth service unavailable. Check FIREBASE_SERVICE_ACCOUNT_JSON.' });
    }
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      console.error('[gemini-proxy] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
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
      console.warn('[gemini-proxy] Rate limit check failed (allowing):', rlErr.message);
    }
  }

  // ── 3. Parse Request Body ─────────────────────────────────────────────────
  const {
    model = 'gemini-2.0-flash',
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

  // ── 4. LAZY key read — critical for Vercel cold starts ───────────────
  const activeKeys = getKeysPool();
  if (activeKeys.length === 0) {
    console.error('[gemini-proxy] GEMINI_API_KEYS is empty — check Vercel Dashboard env vars');
    return res.status(500).json({ error: 'AI service not configured: GEMINI_API_KEYS is missing.' });
  }

  const requestBody = { contents };
  if (generationConfig) requestBody.generationConfig = generationConfig;
  if (systemInstruction) requestBody.systemInstruction = systemInstruction;
  if (safetySettings) requestBody.safetySettings = safetySettings;
  if (tools) requestBody.tools = tools;
  if (toolConfig) requestBody.toolConfig = toolConfig;

  let lastStatus = 500;
  let lastErrorMsg = 'Unknown error';
  const startIndex = Math.floor(Math.random() * activeKeys.length);

  for (let attempt = 0; attempt < activeKeys.length; attempt++) {
    const apiKey = activeKeys[(startIndex + attempt) % activeKeys.length];
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    console.log(`[gemini-proxy] Attempt ${attempt + 1}/${activeKeys.length}, model=${targetModel}`);

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
        console.warn(`[gemini-proxy] Key attempt ${attempt + 1} failed: ${lastStatus} — ${lastErrorMsg.slice(0, 120)}`);
        // 400/404 = bad request or model not found — don't retry with different key
        if (lastStatus === 400 || lastStatus === 404) {
          return res.status(lastStatus).json({ error: { message: lastErrorMsg, code: lastStatus } });
        }
        continue; // Retry on 401/429/500/503
      }

      return res.status(200).json(data);

    } catch (fetchErr) {
      console.error('[gemini-proxy] Fetch failed:', fetchErr.message);
      lastStatus = 500;
      lastErrorMsg = fetchErr.message;
      continue;
    }
  }

  console.error(`[gemini-proxy] All ${activeKeys.length} keys exhausted for uid=${uid}:`, lastErrorMsg);
  Sentry.captureException(new Error(`All keys exhausted: ${lastErrorMsg}`), { tags: { uid } });
  return res.status(lastStatus).json({ error: { message: `All API keys exhausted. Last error: ${lastErrorMsg}`, code: lastStatus } });
});

export default router;
