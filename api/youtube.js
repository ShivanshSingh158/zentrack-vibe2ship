// Vercel Serverless — YouTube playlist fetcher via InnerTube API
// Uses the `/next` endpoint with `playlistIndex` overlapping pagination.
// Bypasses the broken `continuation` token structure completely.
// Returns ALL videos in a playlist regardless of size, even with the new layout.

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

async function fetchNext(playlistId, playlistIndex) {
  const body = { 
    context: { client: INNERTUBE_CLIENT },
    playlistId,
    playlistIndex
  };
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });

  try {
    const allVideos = new Map();
    let playlistTitle = null;
    let currentIndex = 0;
    
    // Safety limit of 50 pages (approx 50 * 190 = 9500 videos)
    // Most YouTube playlists max out at 5000 items anyway.
    for (let page = 0; page < 50; page++) {
      const data = await fetchNext(playlistId, currentIndex);
      
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
              // The next API returns the title in the header
              playlistTitle = data.header?.playlistHeaderRenderer?.title?.simpleText ||
                              data.metadata?.playlistMetadataRenderer?.title ||
                              null;
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
