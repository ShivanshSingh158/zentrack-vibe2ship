/**
 * attendanceConstants.ts
 * All pure constants and pure helper functions for the Attendance module.
 * Zero React deps — safe to import anywhere.
 */

import { formatDateWithDay } from '../../utils/dateUtils';
import { calculateBunkMath } from '../../utils/academicMath';

// ─── Schema ──────────────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 1;

export const defaultSchedule = {
  '0': { classCount: 0, labCount: 0 },
  '1': { classCount: 1, labCount: 0 },
  '2': { classCount: 1, labCount: 0 },
  '3': { classCount: 1, labCount: 0 },
  '4': { classCount: 1, labCount: 0 },
  '5': { classCount: 1, labCount: 0 },
  '6': { classCount: 0, labCount: 0 },
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
export function getLocalDateString(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  return formatDateWithDay(dateStr);
}

export function getWeekDates(dateStr: string): string[] {
  const d   = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d);
    dt.setDate(d.getDate() - day + i);
    return getLocalDateString(dt);
  });
}

// ─── Attendance Math ──────────────────────────────────────────────────────────
export const calculateStatus = (attended: number, total: number, target: number) => {
  attended = attended || 0; total = total || 0; target = target || 75;
  if (total === 0) return { pct: null, safe: true, bunkInfo: 'No classes yet', urgency: 'safe' };

  const pct  = (attended / total) * 100;
  const safe = pct >= target;

  const bunkResult = calculateBunkMath(attended, total, target);

  let urgency  = 'safe';
  let bunkInfo = '';

  if (bunkResult.status === 'safe') {
    urgency  = (pct >= target - 5 && pct < target) ? 'warning' : 'safe';
    bunkInfo = `✓ ${bunkResult.message.replace('You can safely bunk', 'Can miss').replace(' and stay above ' + target + '%', '')}`;
  } else if (bunkResult.status === 'warning') {
    urgency  = 'warning';
    bunkInfo = '⚠️ On the edge — 0 misses left';
  } else {
    urgency  = 'danger';
    bunkInfo = `⚠️ Must attend next ${bunkResult.count} classes`;
  }

  return { pct, safe, bunkInfo, urgency };
};

export const getProgressColor = (urgency: string) =>
  urgency === 'danger' ? '#ef4444' : urgency === 'warning' ? '#f59e0b' : '#10b981';

// ─── Time Parsing ─────────────────────────────────────────────────────────────
/**
 * Converts a time string (12h or 24h) to total minutes from midnight for sorting.
 * Handles: "10:00 AM", "2:00 PM", "10:00", "14:00", "9:00 AM"
 */
export function parseTimeToMinutes(timeStr: string | undefined): number {
  if (!timeStr) return 0;
  const upper   = timeStr.trim().toUpperCase();
  const isPM    = upper.includes('PM');
  const isAM    = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const parts   = cleaned.split(':');
  let h         = parseInt(parts[0], 10) || 0;
  const m       = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return h * 60 + m;
}
