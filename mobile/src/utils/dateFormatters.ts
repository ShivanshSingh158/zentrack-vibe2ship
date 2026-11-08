/**
 * ZenTrack Mobile — High-Performance Pure Date Formatters & Helpers
 * Lightweight standalone module (~1KB) with zero NLP or RegExp dependencies.
 * Prevents importing the 96KB dateUtils NLP parsing engine for basic date math.
 */

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const mStr = m < 10 ? `0${m}` : `${m}`;
  const dStr = day < 10 ? `0${day}` : `${day}`;
  return `${y}-${mStr}-${dStr}`;
}

export function getLocalDateString(date: Date = new Date()): string {
  return toYMD(date);
}

export const formatLocalDateStr = getLocalDateString;

export function getTodayLocalDateStr(): string {
  return toYMD(new Date());
}

/**
 * Parse a YYYY-MM-DD string safely as a LOCAL date (avoids UTC midnight shift).
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Safely adds/subtracts days to a local "YYYY-MM-DD" string without UTC shifts.
 */
export function offsetDateStr(dateStr: string, offsetDays: number): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + offsetDays);
    return toYMD(dt);
  } catch {
    const dt = new Date();
    dt.setDate(dt.getDate() + offsetDays);
    return toYMD(dt);
  }
}
