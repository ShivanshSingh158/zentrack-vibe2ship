/**
 * api/transcript.js
 *
 * ZenTrack — Vercel Serverless: YouTube video transcript fetcher.
 * Returns a timestamped transcript for a given videoId.
 *
 * SEC: Requires Firebase ID token (Authorization: Bearer <token>) so that
 * only authenticated ZenTrack users can fetch transcripts using our server.
 * This prevents the endpoint from being used as a free public proxy.
 *
 * CORS: Dynamic origin matching — only allows ALLOWED_ORIGINS.
 */

import { YoutubeTranscript } from 'youtube-transcript';
import admin from 'firebase-admin';

// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[transcript] Failed to initialize Firebase Admin:', err.message);
  }
}

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174')
    .split(',').map(s => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth: Firebase ID Token ───────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Firebase ID token required' });
  }
  try {
    await admin.auth().verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase token' });
  }

  // ── Fetch Transcript ──────────────────────────────────────────────────────
  const { videoId } = req.query;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid videoId' });
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    const text = transcript
      .map(item => {
        const startSec = Math.floor(item.offset / 1000);
        const mm = Math.floor(startSec / 60);
        const ss = String(startSec % 60).padStart(2, '0');
        return `[${mm}:${ss}] ${item.text.replace(/\n/g, ' ')}`;
      })
      .join('\n');

    return res.status(200).json({ transcript: text });
  } catch (e) {
    console.error('[transcript] Error:', e.message);
    return res.status(500).json({ error: e.message || 'Transcript not found or unavailable' });
  }
}
