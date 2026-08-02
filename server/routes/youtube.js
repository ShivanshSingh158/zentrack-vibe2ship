import express from 'express';
import admin from 'firebase-admin';

/**
 * api/youtube.js
 *
 * ZenTrack — Serverless YouTube Playlist Fetcher.
 * Features:
 * 1. Official YouTube Data API v3 (if YOUTUBE_API_KEY is set)
 * 2. InnerTube API (if INNERTUBE_KEY is set)
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

// ── 1. YouTube Data API v3 Fetcher ───────────────────────────────────────────────
async function fetchPlaylistViaDataAPI(playlistId, apiKey) {
  let allVideos = [];
  let playlistTitle = 'YouTube Playlist';

  const titleRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`);
  if (titleRes.ok) {
    const plData = await titleRes.json();
    if (plData.items && plData.items.length > 0) {
      playlistTitle = plData.items[0].snippet.title;
    } else {
      throw new Error('Playlist not found or is private.');
    }
  } else {
    throw new Error(`YouTube Data API error (title): ${titleRes.status}`);
  }

  let nextPageToken = '';
  while (true) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`YouTube Data API error: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    
    if (data.items) {
      for (const item of data.items) {
        const vId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        const vTitle = item.snippet?.title || 'Untitled Video';
        if (vId && vTitle !== 'Private video' && vTitle !== 'Deleted video') {
          allVideos.push({ videoId: vId, title: vTitle });
        }
      }
    }
    
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }
  
  if (allVideos.length > 0) return { title: playlistTitle, videos: allVideos };
  throw new Error('No public videos found in playlist.');
}

// ── 2. InnerTube API Fetcher ─────────────────────────────────────────────
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
          if (t !== '[Private video]' && t !== '[Deleted video]') {
            allVideos.set(v.videoId, { videoId: v.videoId, title: t });
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

// ── URL Extraction Helper ────────────────────────────────────────────────────
function extractPlaylistId(input) {
  if (!input) return null;
  if (input.includes('youtube.com/') || input.includes('youtu.be/')) {
    try {
      const url = new URL(input);
      if (url.searchParams.has('list')) {
        return url.searchParams.get('list');
      }
    } catch (e) {
      // Ignore
    }
  }
  return input.trim();
}

// ── Main Route Handler ────────────────────────────────────────────────────────
const router = express.Router();
router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ') && admin.apps.length > 0) {
    try {
      await admin.auth().verifyIdToken(authHeader.replace('Bearer ', '').trim());
    } catch { }
  }

  const { playlistId } = req.query;
  const cleanPlaylistId = extractPlaylistId(playlistId);

  if (!cleanPlaylistId || cleanPlaylistId.length < 3) {
    return res.status(400).json({ error: 'Missing or invalid playlistId. Please provide a valid ID or URL.' });
  }

  try {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    const INNERTUBE_KEY = process.env.INNERTUBE_KEY;

    if (!YOUTUBE_API_KEY && !INNERTUBE_KEY) {
      return res.status(500).json({ error: 'Server misconfiguration: No YOUTUBE_API_KEY or INNERTUBE_KEY is set in the environment.' });
    }

    // 1. Try Data API v3 if key exists
    if (YOUTUBE_API_KEY) {
      try {
        const dataApiResult = await fetchPlaylistViaDataAPI(cleanPlaylistId, YOUTUBE_API_KEY);
        console.log(`[youtube] Fetched ${dataApiResult.videos.length} videos via Data API v3`);
        return res.status(200).json(dataApiResult);
      } catch (err) {
        console.warn('[youtube] Data API v3 failed, falling back to InnerTube:', err.message);
      }
    }

    // 2. Try InnerTube API if key exists
    if (INNERTUBE_KEY) {
      const innerTubeResult = await fetchPlaylistViaInnerTube(cleanPlaylistId, INNERTUBE_KEY);
      if (innerTubeResult && innerTubeResult.videos.length > 0) {
        console.log(`[youtube] Fetched ${innerTubeResult.videos.length} videos via InnerTube API`);
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
