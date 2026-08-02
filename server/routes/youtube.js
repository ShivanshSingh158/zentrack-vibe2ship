import express from 'express';
import admin from 'firebase-admin';

/**
 * api/youtube.js
 *
 * ZenTrack — Resilient Serverless YouTube Playlist Fetcher.
 * Uses a 2-tier fetch strategy:
 *   Tier 1: Public YouTube RSS Feed (No API keys needed, 100% reliable for public playlists)
 *   Tier 2: InnerTube API (/youtubei/v1/next) if INNERTUBE_KEY is configured
 */

// ── CORS Helper ───────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0] || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Firebase Admin Init ────────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (Object.keys(serviceAccount).length > 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (err) {
    console.warn('[youtube] Firebase Admin init skipped/failed:', err.message);
  }
}

// ── XML Entity Unescape Helper ────────────────────────────────────────────────
const decodeXmlEntities = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

// ── Tier 1: YouTube Public RSS Feed Fetcher (Zero API keys required) ──────────
async function fetchPlaylistViaRSS(playlistId) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
    const res = await fetch(rssUrl);
    if (!res.ok) return null;
    
    const xml = await res.text();
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
    const playlistTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'YouTube Playlist';

    const entries = xml.split('<entry>');
    const videos = [];

    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i];
      const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);

      if (videoIdMatch && videoIdMatch[1]) {
        const vId = videoIdMatch[1].trim();
        const vTitle = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : 'Untitled Video';
        if (vTitle !== '[Private video]' && vTitle !== '[Deleted video]') {
          videos.push({ videoId: vId, title: vTitle });
        }
      }
    }

    if (videos.length > 0) {
      return { title: playlistTitle, videos };
    }
    return null;
  } catch (err) {
    console.warn('[youtube] RSS fetch failed, trying InnerTube fallback:', err.message);
    return null;
  }
}

// ── Tier 2: InnerTube API Fetcher ─────────────────────────────────────────────
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

async function fetchNextInnerTube(playlistId, playlistIndex, apiKey) {
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

async function fetchPlaylistViaInnerTube(playlistId, apiKey) {
  const allVideos = new Map();
  let playlistTitle = null;
  let currentIndex = 0;

  for (let page = 0; page < 50; page++) {
    const data = await fetchNextInnerTube(playlistId, currentIndex, apiKey);

    if (page === 0) {
      if (data.alerts) {
        const err = data.alerts.find(a => a.alertRenderer?.type === 'ERROR');
        if (err) {
          const msg =
            err.alertRenderer?.text?.runs?.[0]?.text ||
            err.alertRenderer?.text?.simpleText ||
            'Playlist not found';
          throw new Error(msg);
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
          }
        }
      }
      if (Array.isArray(obj)) obj.forEach(check); else Object.values(obj).forEach(check);
    }
    check(data);

    if (added === 0) break;
    currentIndex += 190;
  }

  const validVideos = Array.from(allVideos.values());
  if (validVideos.length === 0) return null;
  return { title: playlistTitle || 'YouTube Playlist', videos: validVideos };
}

// ── Main Route Handler ────────────────────────────────────────────────────────
const router = express.Router();
router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Optional Auth verification (soft guard) ─────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && admin.apps.length > 0) {
    try {
      await admin.auth().verifyIdToken(authHeader.replace('Bearer ', '').trim());
    } catch {
      // Allow read-only public playlist fetching even if token is expired/invalid
    }
  }

  const { playlistId } = req.query;
  if (!playlistId || typeof playlistId !== 'string' || playlistId.trim().length < 3) {
    return res.status(400).json({ error: 'Missing or invalid playlistId' });
  }

  const cleanPlaylistId = playlistId.trim();

  try {
    // 1. Try Tier 1: Public RSS Feed (fast, zero key required)
    const rssResult = await fetchPlaylistViaRSS(cleanPlaylistId);
    if (rssResult && rssResult.videos.length > 0) {
      return res.status(200).json(rssResult);
    }

    // 2. Try Tier 2: InnerTube API if key exists
    const INNERTUBE_KEY = process.env.INNERTUBE_KEY;
    if (INNERTUBE_KEY) {
      const innerTubeResult = await fetchPlaylistViaInnerTube(cleanPlaylistId, INNERTUBE_KEY);
      if (innerTubeResult && innerTubeResult.videos.length > 0) {
        return res.status(200).json(innerTubeResult);
      }
    }

    return res.status(404).json({
      error: 'No videos found in playlist. Please make sure the playlist is set to Public.',
    });

  } catch (e) {
    console.error('[youtube] API Error:', e.message);
    return res.status(500).json({ error: e.message || 'Unknown server error' });
  }
});

export default router;
