export const extractPlaylistId = (url: string): string | null => {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

// Invidious public instances — periodically updated list of reliable mirrors
// More instances = more redundancy if some go offline
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://iv.ggtyler.dev',
  'https://invidious.privacyredirect.com',
  'https://yt.drgnz.club',
  'https://invidious.slipfox.xyz',
  'https://invidious.reallyaweso.me',
  'https://invidious.fdn.fr',
];

interface InvidiousVideo {
  title: string;
  videoId: string;
  lengthSeconds: number;
}

interface InvidiousPlaylistResponse {
  title: string;
  videoCount: number;
  videos: InvidiousVideo[];
}

/**
 * Fetch a single page from one Invidious instance with a strict 8s timeout.
 * Fails fast so we can try the next instance quickly.
 */
const fetchFromInvidious = async (
  playlistId: string,
  page: number,
  instanceUrl: string
): Promise<InvidiousPlaylistResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000); // 8s per instance

  try {
    const url = `${instanceUrl}/api/v1/playlists/${playlistId}?page=${page}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data || !Array.isArray(data.videos)) throw new Error('Invalid response format');
    return data;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

export const fetchYouTubePlaylist = async (playlistId: string) => {
  if (!playlistId || playlistId.length < 5) {
    throw new Error('Invalid playlist ID. Please check the URL and try again.');
  }

  let workingInstance: string | null = null;
  let firstPageData: InvidiousPlaylistResponse | null = null;
  const errors: string[] = [];

  // Shuffle instances slightly to distribute load, but keep first 4 stable
  const shuffleTail = [...INVIDIOUS_INSTANCES.slice(4)].sort(() => Math.random() - 0.5);
  const instances = [...INVIDIOUS_INSTANCES.slice(0, 4), ...shuffleTail];

  for (const instance of instances) {
    try {
      firstPageData = await fetchFromInvidious(playlistId, 1, instance);
      if (firstPageData?.videos?.length > 0) {
        workingInstance = instance;
        break;
      }
    } catch (error: any) {
      const msg = error.name === 'AbortError' ? 'timeout' : error.message;
      errors.push(`${instance.replace('https://', '')}: ${msg}`);
      console.warn(`[YouTube] Instance failed (${instance}): ${msg}`);
    }
  }

  if (!workingInstance || !firstPageData) {
    throw new Error(
      'Could not fetch the playlist. Possible reasons:\n' +
      '• The playlist is Private or Unlisted\n' +
      '• All mirror servers are temporarily down — try again in 1 minute\n' +
      '• Your network may be blocking the request\n\n' +
      'If this keeps happening, try a different playlist or check if it\'s public.'
    );
  }

  const seenIds = new Set<string>();
  const allVideos: InvidiousVideo[] = [];

  // Deduplicate first page videos
  for (const v of firstPageData.videos) {
    if (v.videoId && !seenIds.has(v.videoId)) {
      seenIds.add(v.videoId);
      allVideos.push(v);
    }
  }

  const totalExpected = firstPageData.videoCount || allVideos.length;
  const playlistTitle = firstPageData.title || 'YouTube Playlist';

  // Paginate if needed (Invidious returns ~100 videos per page)
  if (allVideos.length < totalExpected) {
    let page = 2;
    const maxPages = 20;

    while (allVideos.length < totalExpected && page <= maxPages) {
      try {
        const pageData = await fetchFromInvidious(playlistId, page, workingInstance!);
        if (!pageData.videos?.length) break;

        for (const v of pageData.videos) {
          if (v.videoId && !seenIds.has(v.videoId)) {
            seenIds.add(v.videoId);
            allVideos.push(v);
          }
        }
        page++;
      } catch {
        break; // Partial import is OK — don't fail the whole thing
      }
    }
  }

  if (allVideos.length === 0) {
    throw new Error('Playlist appears to be empty or all videos are unavailable.');
  }

  return {
    title: playlistTitle,
    videos: allVideos.map(v => ({
      title: v.title || 'Untitled Video',
      link: `https://www.youtube.com/watch?v=${v.videoId}`,
      videoId: v.videoId,
    })),
  };
};
