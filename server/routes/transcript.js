import express from 'express';
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

// ─── Direct YouTube Page Fallback Scraper ─────────────────────────────────────
// When youtube-transcript npm library fails (e.g. YouTube consent page, User-Agent requirement,
// auto-generated caption track format changes), directly parse ytInitialPlayerResponse from the HTML page.
async function fetchDirectYouTubeCaptions(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const html = await response.text();
  
  // Extract ytInitialPlayerResponse
  let jsonStr = '';
  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
  if (match) {
    jsonStr = match[1];
  } else {
    const altMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (altMatch) jsonStr = altMatch[1];
  }

  if (!jsonStr) {
    throw new Error('Transcript unavailable (could not parse player response)');
  }

  const playerResponse = JSON.parse(jsonStr);
  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('Transcript unavailable (no captions found on YouTube for this video)');
  }

  // Prefer English (manual or auto-generated), otherwise first track
  let selectedTrack = captionTracks.find(t => t.languageCode === 'en' || t.languageCode === 'en-US' || t.languageCode?.startsWith('en'));
  if (!selectedTrack) {
    selectedTrack = captionTracks[0];
  }

  if (!selectedTrack || !selectedTrack.baseUrl) {
    throw new Error('No valid caption track URL found');
  }

  // Fetch the XML caption track
  const xmlResponse = await fetch(selectedTrack.baseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    },
  });

  const xmlText = await xmlResponse.text();

  // Parse XML text tags <text start="12.34" dur="5.67">Hello world</text>
  const textMatches = [...xmlText.matchAll(/<text\s+start="([\d.]+)"[^>]*>(.*?)<\/text>/gi)];
  if (textMatches.length === 0) {
    throw new Error('Empty transcript XML');
  }

  const formattedLines = textMatches.map(m => {
    const startSec = Math.floor(parseFloat(m[1]));
    const mm = Math.floor(startSec / 60);
    const ss = String(startSec % 60).padStart(2, '0');
    const cleanText = m[2]
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n/g, ' ')
      .trim();
    return `[${mm}:${ss}] ${cleanText}`;
  }).filter(line => line.length > 8);

  return formattedLines.join('\n');
}

const router = express.Router();
router.all('/', async (req, res) => {
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
  const IS_LOCAL_DEV = process.env.NODE_ENV !== 'production';

  if (!IS_LOCAL_DEV) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Firebase ID token required' });
    }
    try {
      await admin.auth().verifyIdToken(authHeader.replace('Bearer ', ''));
    } catch {
      return res.status(401).json({ error: 'Invalid or expired Firebase token' });
    }
  }

  // ── Fetch Transcript ──────────────────────────────────────────────────────
  const { videoId } = req.query;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid videoId' });
  }

  // Primary: Direct YouTube page scraper (fastest, supports auto-generated + manual captions)
  try {
    const text = await fetchDirectYouTubeCaptions(videoId);
    console.log(`[transcript] Direct scraper succeeded for ${videoId} (${text.length} chars)`);
    return res.status(200).json({ transcript: text });
  } catch (e1) {
    console.warn(`[transcript] Direct scraper failed for ${videoId}:`, e1.message, '— trying YoutubeTranscript library...');

    // Fallback: YoutubeTranscript library
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      const firstOffset = transcript[0]?.offset ?? 0;
      const isMilliseconds = firstOffset > 10000 || (transcript.length > 1 && transcript[1]?.offset > 10000);
      const text = transcript
        .map(item => {
          const startSec = isMilliseconds
            ? Math.floor(item.offset / 1000)
            : Math.floor(item.offset);
          const mm = Math.floor(startSec / 60);
          const ss = String(startSec % 60).padStart(2, '0');
          return `[${mm}:${ss}] ${item.text.replace(/\n/g, ' ')}`;
        })
        .join('\n');

      return res.status(200).json({ transcript: text });
    } catch (e2) {
      console.error(`[transcript] Both transcript methods failed for ${videoId}:`, e2.message);
      return res.status(500).json({ error: e1.message || e2.message || 'Transcript not found or unavailable' });
    }
  }
});

export default router;
