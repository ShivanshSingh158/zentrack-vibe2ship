import { auth } from './firebase';

export const extractPlaylistId = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch) return listMatch[1];

  // Support raw playlist IDs directly (e.g. PLd1s-PEC5Pio or OLAK5uy_...)
  if (/^(PL|OL|FL|UU|LL|RD)[a-zA-Z0-9_-]+$/.test(trimmed) || (trimmed.length >= 12 && /^[a-zA-Z0-9_-]+$/.test(trimmed))) {
    return trimmed;
  }
  return null;
};


// ─── Main Export ───────────────────────────────────────────────────────────────
// All fetching is done server-side via /api/youtube (Vercel Serverless Function)
// with a 2-tier fallback system (Public RSS Feed -> InnerTube API).
export const fetchYouTubePlaylist = async (playlistId: string) => {
  const cleanId = extractPlaylistId(playlistId) || playlistId.trim();
  if (!cleanId || cleanId.length < 3) {
    throw new Error('Invalid playlist ID or URL. Please check the link and try again.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    console.log(`[YouTube] Fetching playlist: ${cleanId}`);

    // Auth: send Firebase ID token if available (soft guard)
    let idToken = '';
    try {
      idToken = await auth.currentUser?.getIdToken() ?? '';
    } catch {
      // Continue without token if user auth is loading
    }

    const res = await fetch(`/api/youtube?playlistId=${encodeURIComponent(cleanId)}`, {
      signal: controller.signal,
      headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {},
    });

    const responseText = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Server returned invalid response (${res.status}). Please try again.`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    if (!data.videos || data.videos.length === 0) {
      throw new Error(
        'No videos were found in this playlist.\n\n' +
        '• Make sure the playlist is set to Public (not Private or Unlisted)\n' +
        '• Make sure it has at least one video'
      );
    }

    console.log(`[YouTube] ✅ Got ${data.videos.length} videos: "${data.title}"`);

    return {
      title: data.title || 'YouTube Playlist',
      videos: data.videos.map((v: { videoId: string; title: string; durationStr?: string }) => ({
        title: v.title,
        link: `https://www.youtube.com/watch?v=${v.videoId}`,
        videoId: v.videoId,
        durationStr: v.durationStr || ''
      })),
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(
        'Import timed out.\n\n' +
        '• Check your internet connection\n' +
        '• Make sure the playlist is Public\n' +
        '• Try again in a minute'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};
