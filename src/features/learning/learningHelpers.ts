export const sanitize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, sanitize(v)])
    );
  }
  return obj;
};

export const uniqueId = () => crypto.randomUUID();

export const extractYoutubeId = (url: string) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
};

export const formatDuration = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const fetchVideoTitle = async (url: string): Promise<string> => {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.title || '';
  } catch {
    return '';
  }
};

export const CW_KEY = 'learning_continue_watching';
export const EXPANDED_KEY = 'learning_expanded_topic';
export const SPEED_KEY = 'learning_playback_speed';
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const TS_KEY = (videoId: string) => `yt_ts_${videoId}`;
export const UNDO_DELAY = 3500;

export const progressColor = (pct: number) => {
  if (pct === 100) return '#10b981';
  if (pct >= 75)   return '#3b82f6';
  if (pct >= 25)   return '#f59e0b';
  return '#ef4444';
};

export { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
