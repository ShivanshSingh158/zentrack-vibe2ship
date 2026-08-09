/**
 * taskConstants.ts — ZenTrack Tasks Module
 *
 * Pure constants and pure utility functions for the Tasks domain.
 * No imports of heavy libraries. Loaded once at module init.
 */

export const TAG_STORAGE_KEY = 'zentrack_task_tags_v1';

export const TAG_PALETTE = [
  '#a599ff', '#60a5fa', '#34d399', '#f87171',
  '#fb923c', '#e879f9', '#facc15', '#38bdf8',
];

export function tagColorFor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

export type Priority = 'high' | 'medium' | 'low';

export const PRIORITY_LABELS: Record<string, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
  P1: 'High', P2: 'Medium', P3: 'Low',
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: '#ff6961', medium: '#ff9f4d', low: '#5eda9e',
  P1: '#ff6961', P2: '#ff9f4d', P3: '#5eda9e',
};

const _t = new Date();
export const today = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;

export const formatDisplayDate = (d: string): string => {
  if (!d || d.length !== 10) return d;
  const [year, month, day] = d.split('-');
  return `${day}-${month}-${year.slice(2)}`;
};

export const formatTimeDisplay = (t: string): string => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
};

export const parseTimeFloat = (timeStr?: string | null): number => {
  if (!timeStr) return Infinity;
  const t = timeStr.trim().toUpperCase();
  const isPM = t.includes('PM');
  const isAM = t.includes('AM');
  const cleaned = t.replace(/[\sAPM]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return Infinity;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return h + m / 60;
};
