/**
 * timeUtils.ts — ZenTrack Mobile
 *
 * Shared time-parsing utilities for Dashboard components.
 *
 * Previously duplicated across:
 *   - screens/dashboard/useDashboardData.ts (nextClass useMemo)
 *   - components/Dashboard/AgendaWidget.tsx (two separate useMemos)
 *
 * Centralising here eliminates ~100 lines of duplication and — critically —
 * removes these functions from useMemo dependency arrays where they were
 * defined inline (creating new function references on every recompute,
 * cascading unnecessary re-runs of downstream memos).
 *
 * All functions are pure (no side effects) and safe to call anywhere.
 */

// ─── parseTimeToMins ─────────────────────────────────────────────────────────
/**
 * Parse the *start* time of a time-range string (e.g. "10:30am", "2pm",
 * "10:30am - 12pm", "10:30–12:00") into total minutes since midnight.
 *
 * Returns 9999 (sentinel: sort-last) if the string is empty / unparseable.
 */
export function parseTimeToMins(tStr: string): number {
  if (!tStr) return 9999;
  const startStr = tStr.split(/[-–—•]| to /i)[0].trim().toLowerCase();
  let h = 0;
  let m = 0;
  const isPM = startStr.includes('pm');
  const isAM = startStr.includes('am');
  const cleanStr = startStr.replace(/[a-z\s]/g, '');
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
  } else {
    h = parseInt(parts[0], 10) || 0;
  }
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

// ─── getEndTimeMins ──────────────────────────────────────────────────────────
/**
 * Parse the *end* time of a time-range string.
 *
 * If the string has an explicit end segment (split by `-–—•` or " to "),
 * that is used. Otherwise the start time is used and a default duration
 * is added: 120 min for labs, 60 min for everything else.
 *
 * Returns 9999 if unparseable.
 */
export function getEndTimeMins(tStr: string, type = 'class'): number {
  if (!tStr) return 9999;
  const parts = tStr.split(/[-–—•]| to /i);
  const hasExplicitEnd = parts.length > 1;
  const endStr = (hasExplicitEnd ? parts[1] : parts[0]).trim().toLowerCase();
  let h = 0;
  let m = 0;
  const isPM = endStr.includes('pm');
  const isAM = endStr.includes('am');
  const cleanStr = endStr.replace(/[a-z\s]/g, '');
  const timeParts = cleanStr.split(':');
  if (timeParts.length >= 2) {
    h = parseInt(timeParts[0], 10) || 0;
    m = parseInt(timeParts[1], 10) || 0;
  } else {
    h = parseInt(timeParts[0], 10) || 0;
  }
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  let totalMins = h * 60 + m;
  if (!hasExplicitEnd) {
    totalMins += type === 'lab' ? 120 : 60;
  }
  return totalMins;
}

// ─── formatTimeStr ────────────────────────────────────────────────────────────
/**
 * Normalise a raw time string to compact 12-hour format.
 *
 * Examples:
 *   "14:30"          → "2:30pm"
 *   "9:00 AM"        → "9:00am"
 *   "9am - 10:30pm"  → "9am - 10:30pm"  (range — each half processed)
 *   ""               → ""
 */
export function formatTimeStr(tStr: string): string {
  if (!tStr) return '';
  const rangeMatch = tStr.search(/[-–—•]| to /i);
  if (rangeMatch !== -1) {
    return tStr
      .split(/[-–—•]| to /i)
      .map(s => formatTimeStr(s.trim()))
      .join(' - ');
  }
  const lower = tStr.toLowerCase();
  if (lower.includes('am') || lower.includes('pm')) {
    return lower.replace(/\s+/g, '');
  }
  const parts = tStr.split(':');
  if (parts.length < 2) return tStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return tStr;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
}
