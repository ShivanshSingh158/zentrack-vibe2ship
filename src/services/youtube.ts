import { auth } from './firebase';

export const extractPlaylistId = (url: string): string | null => {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};


// ─── Main Export ───────────────────────────────────────────────────────────────
// All fetching is done server-side via /api/youtube (Vercel Serverless Function)
// to avoid CORS restrictions that block YouTube API calls from the browser.
export const fetchYouTubePlaylist = async (playlistId: string) => {
  if (!playlistId || playlistId.length < 5) {
    throw new Error('Invalid playlist ID. Please check the URL and try again.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    console.log(`[YouTube] Fetching playlist via server API: ${playlistId}`);

    // Auth: send Firebase ID token so the server can verify this is a ZenTrack user
    const idToken = await auth.currentUser?.getIdToken() ?? '';
    const res = await fetch(`/api/youtube?playlistId=${encodeURIComponent(playlistId)}`, {
      signal: controller.signal,
      headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {},
    });

    const data = await res.json();

    if (!res.ok) {
      // Surface server error messages directly (e.g. "Playlist does not exist")
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
        'Import timed out (60s).\n\n' +
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
