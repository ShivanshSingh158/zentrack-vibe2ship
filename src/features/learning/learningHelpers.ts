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

export const SPEED_KEY = 'learning_playback_speed';
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const TS_KEY = (videoId: string) => `yt_ts_${videoId}`;

export const progressColor = (pct: number) => {
  if (pct === 100) return '#10b981';
  if (pct >= 75)   return '#a599ff';
  if (pct >= 25)   return '#f59e0b';
  return '#ef4444';
};

export { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
export { fetchVideoTranscript, transcriptToPlainText, formatSeconds } from '../../services/youtubeTranscriptService';
export type { TranscriptCue, TranscriptResult } from '../../services/youtubeTranscriptService';

