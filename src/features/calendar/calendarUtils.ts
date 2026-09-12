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
    submission:     { bg: 'rgba(165, 153, 255, 0.15)', text: '#1C1C1E', border: '#a599ff', label: 'Submission', icon: '📤' },
    todo:           { bg: 'rgba(59, 130, 246, 0.12)', text: '#1C1C1E', border: '#2563EB', label: 'Task', icon: '✅' },
    job:            { bg: 'rgba(217, 119, 6, 0.12)', text: '#1C1C1E', border: '#D97706', label: 'Interview', icon: '💼' },
    goal:           { bg: 'rgba(236, 72, 153, 0.12)', text: '#1C1C1E', border: '#DB2777', label: 'Goal', icon: '🎯' },
    gcal:           { bg: 'rgba(99, 102, 241, 0.12)', text: '#1C1C1E', border: '#4F46E5', label: 'Google Cal', icon: '📅' },
    class:          { bg: 'rgba(165, 153, 255, 0.15)', text: '#1C1C1E', border: '#a599ff', label: 'Class', icon: '📚' },
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
  let upper = timeStr.trim().toUpperCase();

  // If full ISO timestamp like "2026-09-12T14:30:00Z", extract time portion
  if (upper.includes('T')) {
    const parts = upper.split('T');
    if (parts[1]) {
      upper = parts[1].replace(/Z.*$/, '').replace(/[+-].*$/, '').trim();
    }
  }

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
  if (count <= 2) return 'rgba(165, 153, 255, 0.12)';  // faint lilac
  if (count <= 5) return 'rgba(165, 153, 255, 0.24)';  // medium lilac
  return 'rgba(165, 153, 255, 0.38)';                   // rich royal lilac
}

// ─────────────────────────────────────────────────────────────────────────────
// Algorithmic Free Slot Analyzer (Zero AI, Pure Interval Scheduling Math)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculatedFreeSlot {
  id: string;
  startMinutes: number;
  endMinutes: number;
  startTimeStr: string;   // "09:30"
  endTimeStr: string;     // "11:00"
  formattedStart: string; // "9:30 AM"
  formattedEnd: string;   // "11:00 AM"
  timeRange: string;      // "9:30 AM – 11:00 AM"
  durationMinutes: number;
  durationLabel: string;  // "1h 30m"
  period: 'morning' | 'afternoon' | 'evening';
  isOptimalFocus: boolean;
}

export interface BusyBlockInfo {
  title: string;
  startMinutes: number;
  endMinutes: number;
  formattedStart: string;
  formattedEnd: string;
  durationMinutes: number;
  type?: string;
}

export interface DayFreeSlotAnalysis {
  date: string;
  totalFreeMinutes: number;
  totalBusyMinutes: number;
  totalEventsCount: number;
  freeSlots: CalculatedFreeSlot[];
  optimalSlot: CalculatedFreeSlot | null;
  busyBlocks: BusyBlockInfo[];
}

/**
 * Pure deterministic interval algorithm to compute free focus slots on any day.
 * Analyzes all scheduled commitments, merges overlapping intervals, and extracts
 * exact open focus windows between waking/working hours (default 08:00 to 22:00).
 */
export function calculateDayFreeSlots(
  dateStr: string,
  events: { startTime?: string; endTime?: string; title?: string; type?: string }[],
  dayStartHour: number = 8,
  dayEndHour: number = 22
): DayFreeSlotAnalysis {
  const dayStartMinutes = dayStartHour * 60;
  const dayEndMinutes = dayEndHour * 60;

  // 1. Collect all busy intervals
  interface RawInterval {
    start: number;
    end: number;
    title: string;
    type?: string;
  }

  const rawBusy: RawInterval[] = [];

  events.forEach(evt => {
    if (!evt.startTime) return;
    const s = parseTimeTo24h(evt.startTime);
    const startM = s.hour * 60 + s.min;

    let endM: number;
    if (evt.endTime) {
      const e = parseTimeTo24h(evt.endTime);
      endM = e.hour * 60 + e.min;
      if (endM <= startM) {
        endM = Math.min(24 * 60, startM + 60);
      }
    } else {
      endM = Math.min(24 * 60, startM + 60);
    }

    rawBusy.push({
      start: startM,
      end: endM,
      title: evt.title || 'Busy Event',
      type: evt.type,
    });
  });

  // Sort raw intervals by start time ascending
  rawBusy.sort((a, b) => a.start - b.start || a.end - b.end);

  // 2. Merge overlapping or contiguous busy intervals
  interface MergedBusy {
    start: number;
    end: number;
    titles: string[];
    types: string[];
  }
  const mergedBusy: MergedBusy[] = [];

  for (const interval of rawBusy) {
    if (mergedBusy.length === 0) {
      mergedBusy.push({
        start: interval.start,
        end: interval.end,
        titles: [interval.title],
        types: interval.type ? [interval.type] : [],
      });
    } else {
      const last = mergedBusy[mergedBusy.length - 1];
      if (interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
        last.titles.push(interval.title);
        if (interval.type && !last.types.includes(interval.type)) {
          last.types.push(interval.type);
        }
      } else {
        mergedBusy.push({
          start: interval.start,
          end: interval.end,
          titles: [interval.title],
          types: interval.type ? [interval.type] : [],
        });
      }
    }
  }

  // Calculate total busy minutes clamped to day scanning boundary
  let totalBusyMinutes = 0;
  mergedBusy.forEach(b => {
    const clampedStart = Math.max(dayStartMinutes, b.start);
    const clampedEnd = Math.min(dayEndMinutes, b.end);
    if (clampedEnd > clampedStart) {
      totalBusyMinutes += (clampedEnd - clampedStart);
    }
  });

  // 3. Invert merged busy intervals to locate all free windows
  let cursor = dayStartMinutes;
  const candidateSlots: { start: number; end: number }[] = [];

  for (const busy of mergedBusy) {
    if (busy.end <= dayStartMinutes) continue;
    if (busy.start >= dayEndMinutes) break;

    const busyStart = Math.max(dayStartMinutes, busy.start);
    const busyEnd = Math.min(dayEndMinutes, busy.end);

    if (busyStart > cursor) {
      const diff = busyStart - cursor;
      if (diff >= 15) { // Minimum 15-minute slot
        candidateSlots.push({ start: cursor, end: busyStart });
      }
    }
    cursor = Math.max(cursor, busyEnd);
  }

  if (cursor < dayEndMinutes) {
    const diff = dayEndMinutes - cursor;
    if (diff >= 15) {
      candidateSlots.push({ start: cursor, end: dayEndMinutes });
    }
  }

  // Format helpers
  const minutesToTimeStr = (totalM: number): string => {
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const formatDurationLabel = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // 4. Transform candidate slots into structured CalculatedFreeSlot objects
  const freeSlots: CalculatedFreeSlot[] = candidateSlots.map((slot, idx) => {
    const duration = slot.end - slot.start;
    const startStr = minutesToTimeStr(slot.start);
    const endStr = minutesToTimeStr(slot.end);
    const fStart = format12Hour(startStr);
    const fEnd = format12Hour(endStr);

    let period: 'morning' | 'afternoon' | 'evening' = 'morning';
    if (slot.start >= 17 * 60) {
      period = 'evening';
    } else if (slot.start >= 12 * 60) {
      period = 'afternoon';
    }

    return {
      id: `slot_${idx}_${slot.start}`,
      startMinutes: slot.start,
      endMinutes: slot.end,
      startTimeStr: startStr,
      endTimeStr: endStr,
      formattedStart: fStart,
      formattedEnd: fEnd,
      timeRange: `${fStart} – ${fEnd}`,
      durationMinutes: duration,
      durationLabel: formatDurationLabel(duration),
      period,
      isOptimalFocus: false,
    };
  });

  // 5. Select Optimal Focus Window
  // Prioritizes slots with 60m - 180m duration during prime cognitive windows (10-12:30 or 14-17:00)
  let optimalSlot: CalculatedFreeSlot | null = null;
  if (freeSlots.length > 0) {
    let bestScore = -999;
    freeSlots.forEach(slot => {
      let score = Math.min(180, slot.durationMinutes);

      // Prime work hours bonus (09:00 - 18:00)
      if (slot.startMinutes >= 9 * 60 && slot.endMinutes <= 18 * 60) {
        score += 40;
      }
      // Peak cognitive window overlap (10:00 - 12:30)
      if (slot.startMinutes <= 750 && slot.endMinutes >= 600) {
        score += 25;
      }
      // Afternoon energy window overlap (14:00 - 16:30)
      if (slot.startMinutes <= 990 && slot.endMinutes >= 840) {
        score += 20;
      }
      // Discourage tiny slots under 30m for deep focus
      if (slot.durationMinutes < 30) {
        score -= 50;
      }

      if (score > bestScore) {
        bestScore = score;
        optimalSlot = slot;
      }
    });

    if (optimalSlot) {
      (optimalSlot as CalculatedFreeSlot).isOptimalFocus = true;
    }
  }

  const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.durationMinutes, 0);

  const busyBlocks: BusyBlockInfo[] = mergedBusy.map(b => ({
    title: b.titles.join(', '),
    startMinutes: b.start,
    endMinutes: b.end,
    formattedStart: format12Hour(minutesToTimeStr(b.start)),
    formattedEnd: format12Hour(minutesToTimeStr(b.end)),
    durationMinutes: b.end - b.start,
    type: b.types[0],
  }));

  return {
    date: dateStr,
    totalFreeMinutes,
    totalBusyMinutes,
    totalEventsCount: events.filter(e => !!e.startTime).length,
    freeSlots,
    optimalSlot,
    busyBlocks,
  };
}
