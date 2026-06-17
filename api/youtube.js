// Vercel Serverless — YouTube playlist fetcher via InnerTube API
// Properly handles both initial browse responses AND continuation responses.
// No video count limit — will fetch all pages until no continuation token is found.

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

// ── InnerTube request ────────────────────────────────────────────────────────
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

// ── Extract videos + continuation token from a flat items array ─────────────
// Works for BOTH old (playlistVideoRenderer) and new 2024+ (lockupViewModel) formats.
function extractFromItems(items) {
  const videos = [];
  let token = null;

  for (const item of (items || [])) {
    // ── Continuation token ──────────────────────────────────────────────────
    if (item.continuationItemRenderer) {
      const t = item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (t) token = t;
      continue;
    }

    // ── New 2024+ format: richItemRenderer wrapping lockupViewModel ─────────
    const lockup =
      item.richItemRenderer?.content?.lockupViewModel ||
      item.richSectionRenderer?.content?.richShelfRenderer?.contents?.[0]?.richItemRenderer?.content?.lockupViewModel ||
      item.lockupViewModel;

    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const t = lockup.metadata?.lockupMetadataViewModel?.title?.content || '';
      const id = lockup.contentId;
      if (id && t && t !== '[Private video]' && t !== '[Deleted video]')
        videos.push({ videoId: id, title: t });
      continue;
    }

    // ── Old format: playlistVideoRenderer ───────────────────────────────────
    const pvr = item.playlistVideoRenderer;
    if (pvr?.videoId) {
      const t = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || '';
      if (t && t !== '[Private video]' && t !== '[Deleted video]')
        videos.push({ videoId: pvr.videoId, title: t });
    }
  }

  return { videos, token };
}

// ── Deep-walk a value and return the first non-null token found ──────────────
function deepFindToken(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 25) return null;
  if (obj.continuationItemRenderer) {
    return obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) { const t = deepFindToken(v, depth + 1); if (t) return t; }
    return null;
  }
  for (const v of Object.values(obj)) { const t = deepFindToken(v, depth + 1); if (t) return t; }
  return null;
}

// ── Parse the INITIAL browse response (browseId) ────────────────────────────
function parseInitialResponse(data) {
  // Title extraction
  let title =
    data.metadata?.playlistMetadataRenderer?.title ||
    data.header?.pageHeaderRenderer?.pageTitle ||
    null;

  // Try to reach the items array through known paths (faster than full walk)
  let items = null;

  // Path A: twoColumnBrowseResultsRenderer → sectionList → playlistVideoListRenderer
  try {
    const tab = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content;
    const sl = tab.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0];
    if (sl?.playlistVideoListRenderer) items = sl.playlistVideoListRenderer.contents;
  } catch {}

  // Path B: twoColumnBrowseResultsRenderer → richGridRenderer (newer layout)
  if (!items) {
    try {
      const tab = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content;
      if (tab.richGridRenderer?.contents) items = tab.richGridRenderer.contents;
    } catch {}
  }

  // Path C: deep walk for playlistVideoListRenderer or richGridRenderer
  if (!items) {
    function findList(obj, d = 0) {
      if (!obj || typeof obj !== 'object' || d > 15) return null;
      if (obj.playlistVideoListRenderer?.contents) return obj.playlistVideoListRenderer.contents;
      if (obj.richGridRenderer?.contents) return obj.richGridRenderer.contents;
      if (Array.isArray(obj)) {
        for (const v of obj) { const r = findList(v, d + 1); if (r) return r; }
        return null;
      }
      for (const v of Object.values(obj)) { const r = findList(v, d + 1); if (r) return r; }
      return null;
    }
    items = findList(data);
  }

  if (!items) return { videos: [], token: null, title };

  return { ...extractFromItems(items), title };
}

// ── Parse a CONTINUATION response (onResponseReceivedActions) ───────────────
function parseContinuationResponse(data) {
  // Standard path
  for (const action of (data.onResponseReceivedActions || [])) {
    const items = action.appendContinuationItemsAction?.continuationItems;
    if (items) return extractFromItems(items);
  }

  // Fallback: walk to find continuation items anywhere
  const token = deepFindToken(data);

  // Also walk for any video items
  const videos = [];
  function walkForVideos(obj, d = 0) {
    if (!obj || typeof obj !== 'object' || d > 20) return;
    if (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const lv = obj.lockupViewModel;
      const t = lv.metadata?.lockupMetadataViewModel?.title?.content || '';
      if (lv.contentId && t) videos.push({ videoId: lv.contentId, title: t });
      return;
    }
    if (obj.playlistVideoRenderer?.videoId) {
      const t = obj.playlistVideoRenderer.title?.runs?.[0]?.text || '';
      if (t) videos.push({ videoId: obj.playlistVideoRenderer.videoId, title: t });
      return;
    }
    if (Array.isArray(obj)) { obj.forEach(v => walkForVideos(v, d + 1)); return; }
    Object.values(obj).forEach(v => walkForVideos(v, d + 1));
  }
  walkForVideos(data);

  return { videos, token };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });

  try {
    const allVideos = [];
    const seen = new Set();
    let playlistTitle = null;
    let continuation = null;
    let page = 0;
    let emptyPageStreak = 0;

    do {
      const data = await browseInnerTube(playlistId, continuation);

      // Check for YouTube error alerts on first page
      if (page === 0 && data.alerts) {
        const err = data.alerts.find(a => a.alertRenderer?.type === 'ERROR');
        if (err) {
          const msg =
            err.alertRenderer?.text?.runs?.[0]?.text ||
            err.alertRenderer?.text?.simpleText ||
            'Playlist not found';
          return res.status(404).json({ error: msg });
        }
      }

      const { videos, token, title } = page === 0
        ? parseInitialResponse(data)
        : parseContinuationResponse(data);

      if (page === 0 && title) playlistTitle = title;

      let added = 0;
      for (const v of videos) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          allVideos.push(v);
          added++;
        }
      }

      // Break if multiple consecutive pages gave us nothing new (safety valve)
      emptyPageStreak = added === 0 ? emptyPageStreak + 1 : 0;
      if (emptyPageStreak >= 3) break;

      continuation = token || null;
      page++;

    } while (continuation && page < 500); // 500 × ~100 = up to 50,000 videos

    if (allVideos.length === 0) {
      return res.status(404).json({
        error: 'No videos found. The playlist may be empty, private, or the URL is incorrect.',
      });
    }

    res.status(200).json({
      title: playlistTitle || `Playlist (${allVideos.length} videos)`,
      videos: allVideos, // { videoId, title } — link is added by youtube.ts on client
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Unknown server error' });
  }
}
