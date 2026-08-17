/**
 * calendarUtils.ts
 * Pure constants and utility functions for the Calendar module — no React, no Firestore.
 */

// ─── Hour height constant (pixels per hour in timeline) ───────────────────────
export const HOUR_HEIGHT = 60;

// ─── Event Colors ─────────────────────────────────────────────────────────────
export const getEventColors = (colors: any, isDark: boolean = true): Record<string, { bg: string; text: string; border: string }> => {
  if (isDark) {
    return {
      exam:           { bg: '#F28B82', text: '#202124', border: '#F28B82' },
      assignment_due: { bg: '#C39BD3', text: '#202124', border: '#C39BD3' },
      holiday:        { bg: '#81C995', text: '#202124', border: '#81C995' },
      viva:           { bg: '#FAD7A1', text: '#202124', border: '#FAD7A1' },
      submission:     { bg: colors.accentPrimary || '#a599ff', text: '#202124', border: colors.accentPrimary || '#a599ff' },
      todo:           { bg: '#AECBFA', text: '#202124', border: '#AECBFA' },
      job:            { bg: '#FDE293', text: '#202124', border: '#FDE293' },
      goal:           { bg: '#FF8BCB', text: '#202124', border: '#FF8BCB' },
      gcal:           { bg: colors.accentPrimary || '#a599ff', text: '#202124', border: colors.accentPrimary || '#a599ff' },
      class:          { bg: '#C39BD3', text: '#202124', border: '#C39BD3' },
      lab:            { bg: '#FAD7A1', text: '#202124', border: '#FAD7A1' },
      gym:            { bg: '#5EDA9E', text: '#202124', border: '#5EDA9E' },
    };
  }

  // Light Mode ("Frost Quartz"): 12-15% tinted alpha washes, solid 3px left border, deep contrast text
  return {
    exam:           { bg: 'rgba(239, 68, 68, 0.12)', text: '#1C1C1E', border: '#DC2626' },
    assignment_due: { bg: 'rgba(147, 51, 234, 0.12)', text: '#1C1C1E', border: '#7C3AED' },
    holiday:        { bg: 'rgba(245, 158, 11, 0.12)', text: '#1C1C1E', border: '#D97706' },
    viva:           { bg: 'rgba(2, 132, 199, 0.12)', text: '#1C1C1E', border: '#0284C7' },
    submission:     { bg: 'rgba(108, 92, 231, 0.12)', text: '#1C1C1E', border: '#6C5CE7' },
    todo:           { bg: 'rgba(59, 130, 246, 0.12)', text: '#1C1C1E', border: '#2563EB' },
    job:            { bg: 'rgba(217, 119, 6, 0.12)', text: '#1C1C1E', border: '#D97706' },
    goal:           { bg: 'rgba(236, 72, 153, 0.12)', text: '#1C1C1E', border: '#DB2777' },
    gcal:           { bg: 'rgba(99, 102, 241, 0.12)', text: '#1C1C1E', border: '#4F46E5' },
    class:          { bg: 'rgba(108, 92, 231, 0.12)', text: '#1C1C1E', border: '#6C5CE7' },
    lab:            { bg: 'rgba(2, 132, 199, 0.12)', text: '#1C1C1E', border: '#0284C7' },
    gym:            { bg: 'rgba(16, 185, 129, 0.12)', text: '#1C1C1E', border: '#059669' },
  };
};

// ─── Time Formatting ──────────────────────────────────────────────────────────
export const format12Hour = (time24: string | undefined): string => {
  if (!time24) return '';
  const upper = time24.toUpperCase();
  if (upper.includes('AM') || upper.includes('PM')) {
    return upper.replace(/([0-9])([AP]M)/, '$1 $2');
  }
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  const h    = parseInt(parts[0], 10);
  const m    = parts[1].replace(/[^0-9]/g, '');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr   = h % 12 || 12;
  return `${hr}:${m} ${ampm}`;
};

/**
 * Parses both 12-hour ("2:00 PM", "10:00 AM") and 24-hour ("14:00", "09:00")
 * time strings into { hour, min } in 24-hour terms.
 */
export const parseTimeTo24h = (timeStr: string | undefined): { hour: number; min: number } => {
  if (!timeStr) return { hour: 9, min: 0 };
  const upper   = timeStr.trim().toUpperCase();
  const isPM    = upper.includes('PM');
  const isAM    = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const colonParts = cleaned.split(':');
  let h  = parseInt(colonParts[0], 10) || 0;
  const m = colonParts.length >= 2 ? (parseInt(colonParts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  h = Math.max(0, Math.min(23, h));
  return { hour: h, min: Math.max(0, Math.min(59, m)) };
};

/**
 * Parses a task timeSlot string into { startTime, endTime } 24h-compatible strings.
 * Handles ALL separator variants: "5:30 AM - 6:30 AM", "17:30 - 18:30", "09:00"
 */
export const parseTaskTimeSlot = (timeSlot: string | null | undefined): { startTime: string; endTime: string } => {
  if (!timeSlot) return { startTime: '09:00', endTime: '10:00' };
  const normalized = timeSlot.replace(/\u2013|\u2014/g, '-');
  const sepIdx     = normalized.indexOf(' - ');

  if (sepIdx !== -1) {
    const rawStart = normalized.slice(0, sepIdx).trim();
    const rawEnd   = normalized.slice(sepIdx + 3).trim();
    const { hour: sh, min: sm } = parseTimeTo24h(rawStart);
    const { hour: eh, min: em } = parseTimeTo24h(rawEnd);
    return {
      startTime: `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
      endTime:   `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`,
    };
  }

  const { hour: sh, min: sm } = parseTimeTo24h(normalized.trim());
  const endH = Math.min(23, sh + 1);
  return {
    startTime: `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
    endTime:   `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
  };
};
