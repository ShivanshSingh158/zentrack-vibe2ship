/**
 * calendarUtils.ts
 * Pure constants and utility functions for the Calendar module.
 * 1-to-1 parity with mobile calendar utilities and Obsidian Cosmos color system.
 */

export const HOUR_HEIGHT = 60; // 60px per hour in timeline grid

export interface EventColorSpec {
  bg: string;
  text: string;
  border: string;
  label?: string;
  icon?: string;
}

export const getEventColors = (isDark: boolean = true): Record<string, EventColorSpec> => {
  if (isDark) {
    return {
      exam:           { bg: 'rgba(242, 139, 130, 0.15)', text: '#ffffff', border: '#F28B82', label: 'Exam', icon: '📝' },
      assignment_due: { bg: 'rgba(195, 155, 211, 0.15)', text: '#ffffff', border: '#C39BD3', label: 'Assignment', icon: '📋' },
      holiday:        { bg: 'rgba(129, 201, 149, 0.15)', text: '#ffffff', border: '#81C995', label: 'Holiday', icon: '🌴' },
      viva:           { bg: 'rgba(250, 215, 161, 0.15)', text: '#ffffff', border: '#FAD7A1', label: 'Viva', icon: '🎤' },
      submission:     { bg: 'rgba(165, 153, 255, 0.15)', text: '#ffffff', border: '#A599FF', label: 'Submission', icon: '📤' },
      todo:           { bg: 'rgba(174, 203, 250, 0.15)', text: '#ffffff', border: '#AECBFA', label: 'Task', icon: '✅' },
      job:            { bg: 'rgba(253, 226, 147, 0.15)', text: '#ffffff', border: '#FDE293', label: 'Interview', icon: '💼' },
      goal:           { bg: 'rgba(255, 139, 203, 0.15)', text: '#ffffff', border: '#FF8BCB', label: 'Goal', icon: '🎯' },
      gcal:           { bg: 'rgba(165, 153, 255, 0.15)', text: '#ffffff', border: '#A599FF', label: 'Google Cal', icon: '📅' },
      class:          { bg: 'rgba(195, 155, 211, 0.15)', text: '#ffffff', border: '#C39BD3', label: 'Class', icon: '📚' },
      lab:            { bg: 'rgba(250, 215, 161, 0.15)', text: '#ffffff', border: '#FAD7A1', label: 'Lab', icon: '🔬' },
      gym:            { bg: 'rgba(94, 218, 158, 0.15)', text: '#ffffff', border: '#5EDA9E', label: 'Gym', icon: '🏋️' },
    };
  }

  // Light Mode ("Frost Quartz")
  return {
    exam:           { bg: 'rgba(239, 68, 68, 0.12)', text: '#1C1C1E', border: '#DC2626', label: 'Exam', icon: '📝' },
    assignment_due: { bg: 'rgba(147, 51, 234, 0.12)', text: '#1C1C1E', border: '#7C3AED', label: 'Assignment', icon: '📋' },
    holiday:        { bg: 'rgba(245, 158, 11, 0.12)', text: '#1C1C1E', border: '#D97706', label: 'Holiday', icon: '🌴' },
    viva:           { bg: 'rgba(2, 132, 199, 0.12)', text: '#1C1C1E', border: '#0284C7', label: 'Viva', icon: '🎤' },
    submission:     { bg: 'rgba(108, 92, 231, 0.12)', text: '#1C1C1E', border: '#6C5CE7', label: 'Submission', icon: '📤' },
    todo:           { bg: 'rgba(59, 130, 246, 0.12)', text: '#1C1C1E', border: '#2563EB', label: 'Task', icon: '✅' },
    job:            { bg: 'rgba(217, 119, 6, 0.12)', text: '#1C1C1E', border: '#D97706', label: 'Interview', icon: '💼' },
    goal:           { bg: 'rgba(236, 72, 153, 0.12)', text: '#1C1C1E', border: '#DB2777', label: 'Goal', icon: '🎯' },
    gcal:           { bg: 'rgba(99, 102, 241, 0.12)', text: '#1C1C1E', border: '#4F46E5', label: 'Google Cal', icon: '📅' },
    class:          { bg: 'rgba(108, 92, 231, 0.12)', text: '#1C1C1E', border: '#6C5CE7', label: 'Class', icon: '📚' },
    lab:            { bg: 'rgba(2, 132, 199, 0.12)', text: '#1C1C1E', border: '#0284C7', label: 'Lab', icon: '🔬' },
    gym:            { bg: 'rgba(16, 185, 129, 0.12)', text: '#1C1C1E', border: '#059669', label: 'Gym', icon: '🏋️' },
  };
};

/**
 * Format 24-hour time "14:30" or "09:00" to "2:30 PM", "9:00 AM"
 */
export const format12Hour = (time24: string | undefined): string => {
  if (!time24) return '';
  const upper = time24.toUpperCase().trim();
  if (upper.includes('AM') || upper.includes('PM')) {
    return upper.replace(/([0-9])([AP]M)/, '$1 $2');
  }
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0], 10);
  const m = parts[1].replace(/[^0-9]/g, '').padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${m} ${ampm}`;
};

/**
 * Parse time string into { hour, min } 24-hour format
 */
export const parseTimeTo24h = (timeStr: string | undefined): { hour: number; min: number } => {
  if (!timeStr) return { hour: 9, min: 0 };
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const colonParts = cleaned.split(':');
  let h = parseInt(colonParts[0], 10) || 0;
  const m = colonParts.length >= 2 ? (parseInt(colonParts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  h = Math.max(0, Math.min(23, h));
  return { hour: h, min: Math.max(0, Math.min(59, m)) };
};

/**
 * Parse task timeSlot into { startTime, endTime }
 */
export const parseTaskTimeSlot = (timeSlot: string | null | undefined): { startTime: string; endTime: string } => {
  if (!timeSlot) return { startTime: '09:00', endTime: '10:00' };
  const normalized = timeSlot.replace(/\u2013|\u2014/g, '-');
  const sepIdx = normalized.indexOf(' - ');

  if (sepIdx !== -1) {
    const rawStart = normalized.slice(0, sepIdx).trim();
    const rawEnd = normalized.slice(sepIdx + 3).trim();
    const { hour: sh, min: sm } = parseTimeTo24h(rawStart);
    const { hour: eh, min: em } = parseTimeTo24h(rawEnd);
    return {
      startTime: `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
      endTime: `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`,
    };
  }

  const { hour: sh, min: sm } = parseTimeTo24h(normalized.trim());
  const endH = Math.min(23, sh + 1);
  return {
    startTime: `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
    endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
  };
};

/**
 * Heat map density tier based on event count per day
 */
export function getDensityTint(count: number, isDark: boolean = true): string | undefined {
  if (count === 0 || count === undefined) return undefined;
  if (isDark) {
    if (count <= 2) return 'rgba(165, 153, 255, 0.10)'; // faint purple
    if (count <= 5) return 'rgba(165, 153, 255, 0.22)'; // medium purple
    return 'rgba(165, 153, 255, 0.38)';                  // hot purple
  }
  if (count <= 2) return 'rgba(108, 92, 231, 0.08)';  // faint lilac
  if (count <= 5) return 'rgba(108, 92, 231, 0.18)';  // medium lilac
  return 'rgba(108, 92, 231, 0.30)';                   // rich royal lilac
}
