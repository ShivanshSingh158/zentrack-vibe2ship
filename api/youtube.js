/**
 * api/youtube.js
 *
 * ZenTrack — Vercel Serverless: YouTube playlist fetcher via InnerTube API.
 * Uses the `/next` endpoint with `playlistIndex` overlapping pagination.
 * Bypasses the broken `continuation` token structure completely.
 * Returns ALL videos in a playlist regardless of size.
 *
 * REQUIRED ENV VAR (Vercel Dashboard — server-only, NO VITE_ prefix):
 *   INNERTUBE_KEY  — YouTube InnerTube API key
 *                   (previously was VITE_INNERTUBE_KEY — rename it!)
 */

// ── CORS Helper ───────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174')
    .split(',').map(s => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
import admin from 'firebase-admin';
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[youtube] Failed to initialize Firebase Admin:', err.message);
  }
}

// ── Key from server env var (NEVER from VITE_ prefix) ────────────────────────
// In Vercel: Settings → Environment Variables → Name: INNERTUBE_KEY, Value: AIzaSy...
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

async function fetchNext(playlistId, playlistIndex, apiKey) {
  const body = {
    context: { client: INNERTUBE_CLIENT },
    playlistId,
    playlistIndex,
  };
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/next?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth: Firebase ID Token ─────────────────────────────────────────────
  // Prevents unauthenticated actors from draining the InnerTube key's quota.
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Firebase ID token required' });
  }
  try {
    await admin.auth().verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase token' });
  }

  // Read key from server-side env (never VITE_ prefix)
  const INNERTUBE_KEY = process.env.INNERTUBE_KEY;
  if (!INNERTUBE_KEY) {
    console.error('[youtube] INNERTUBE_KEY env var is not set in Vercel.');
    return res.status(500).json({ error: 'YouTube API not configured on server.' });
  }

  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });

  try {
    const allVideos = new Map();
    let playlistTitle = null;
    let currentIndex = 0;
    
    // Safety limit of 50 pages (approx 50 * 190 = 9500 videos)
    // Most YouTube playlists max out at 5000 items anyway.
    for (let page = 0; page < 50; page++) {
      const data = await fetchNext(playlistId, currentIndex, INNERTUBE_KEY);
      
      // On the first fetch, extract title or errors
      if (page === 0) {
          if (data.alerts) {
            const err = data.alerts.find(a => a.alertRenderer?.type === 'ERROR');
            if (err) {
              const msg =
                err.alertRenderer?.text?.runs?.[0]?.text ||
                err.alertRenderer?.text?.simpleText ||
                'Playlist not found';
              return res.status(404).json({ error: msg });
            }
          }
          if (!playlistTitle) {
              function findTitle(obj) {
                  if (!obj || typeof obj !== 'object') return null;
                  if (obj.playlist && typeof obj.playlist.title === 'string') return obj.playlist.title;
                  if (Array.isArray(obj)) {
                      for (const v of obj) { const t = findTitle(v); if (t) return t; }
                  } else {
                      for (const v of Object.values(obj)) { const t = findTitle(v); if (t) return t; }
                  }
                  return null;
              }
              playlistTitle = findTitle(data);
          }
      }

      let added = 0;
      function check(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.playlistPanelVideoRenderer) {
              const v = obj.playlistPanelVideoRenderer;
              if (v.videoId && !allVideos.has(v.videoId)) {
                  const t = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
                  const durationStr = v.lengthText?.runs?.[0]?.text || v.lengthText?.simpleText || '';
                  if (t !== '[Private video]' && t !== '[Deleted video]') {
                      allVideos.set(v.videoId, { videoId: v.videoId, title: t, durationStr });
                      added++;
                  } else {
                      // Still track it so we don't count it as a missing hole, 
                      // but we don't output it to the user.
                      allVideos.set(v.videoId, { videoId: v.videoId, title: t, isDeleted: true });
                      added++;
                  }
              }
          }
          if (Array.isArray(obj)) obj.forEach(check); else Object.values(obj).forEach(check);
      }
      check(data);

      if (added === 0) {
          break; // We reached the end, no new videos found surrounding this index
      }
      
      // The API returns ~200 items surrounding the requested index.
      // E.g., requesting index 0 returns 0-199. Requesting index 190 returns 90-289.
      // Advancing by 190 guarantees overlap so we don't skip any items.
      currentIndex += 190;
    }

    // Filter out deleted/private videos before sending response
    const validVideos = Array.from(allVideos.values()).filter(v => !v.isDeleted);

    if (validVideos.length === 0) {
      return res.status(404).json({
        error: 'No videos found. The playlist may be empty, private, or the URL is incorrect.',
      });
    }

    res.status(200).json({
      title: playlistTitle || `Playlist (${validVideos.length} videos)`,
      videos: validVideos, // { videoId, title } — link is added by youtube.ts on client
    });
  } catch (e) {
    console.error('API Error:', e);
    res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
