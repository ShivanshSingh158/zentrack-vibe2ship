// Vercel Serverless — YouTube playlist fetcher using InnerTube API
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

async function browseInnerTube(playlistId, continuation) {
  const body = { context: { client: INNERTUBE_CLIENT } };
  if (continuation) {
    body.continuation = continuation;
  } else {
    body.browseId = `VL${playlistId}`;
  }
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  return res.json();
}

function parseData(data) {
  const videos = [];
  let nextContinuation = null;
  let title = null;

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }

    if (!title && obj.metadata?.playlistMetadataRenderer?.title)
      title = obj.metadata.playlistMetadataRenderer.title;
    if (!title && obj.header?.pageHeaderRenderer?.pageTitle)
      title = obj.header.pageHeaderRenderer.pageTitle;

    // New format 2024+
    if (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const v = obj.lockupViewModel;
      const t = v.metadata?.lockupMetadataViewModel?.title?.content || '';
      if (v.contentId && t && t !== '[Private video]' && t !== '[Deleted video]')
        videos.push({ videoId: v.contentId, title: t });
      return;
    }

    // Old format
    if (obj.playlistVideoRenderer?.videoId) {
      const v = obj.playlistVideoRenderer;
      const t = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
      if (t && t !== '[Private video]' && t !== '[Deleted video]')
        videos.push({ videoId: v.videoId, title: t });
      return;
    }

    // Continuation token
    if (obj.continuationItemRenderer) {
      const token = obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (token && !nextContinuation) nextContinuation = token;
      return;
    }

    Object.values(obj).forEach(walk);
  }

  walk(data);
  return { videos, nextContinuation, title };
}

export default async function handler(req, res) {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });

  try {
    const allVideos = [];
    const seen = new Set();
    let playlistTitle = null;
    let continuation = null;
    let page = 0;

    do {
      const data = await browseInnerTube(playlistId, continuation);

      if (page === 0) {
        // Check for error alerts
        if (data.alerts) {
          const err = data.alerts.find(a => a.alertRenderer?.type === 'ERROR');
          if (err) {
            const msg = err.alertRenderer?.text?.runs?.[0]?.text ||
                        err.alertRenderer?.text?.simpleText ||
                        'Playlist not found';
            return res.status(404).json({ error: msg });
          }
        }
      }

      const extracted = parseData(data);
      if (page === 0 && extracted.title) playlistTitle = extracted.title;

      for (const v of extracted.videos) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          allVideos.push(v);
        }
      }

      if (extracted.videos.length === 0) break;

      continuation = extracted.nextContinuation;
      page++;
    } while (continuation && page < 200); // 200 pages × ~100 videos = up to 20,000 videos — no practical limit

    if (allVideos.length === 0) {
      return res.status(404).json({
        error: 'No videos found. The playlist may be empty, private, or the URL is incorrect.',
      });
    }

    res.status(200).json({
      title: playlistTitle || `Playlist (${allVideos.length} videos)`,
      videos: allVideos,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
