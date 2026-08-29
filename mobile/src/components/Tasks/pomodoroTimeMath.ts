export type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
  focus: number;
  shortBreak: number;
  longBreak: number;
  sessionsUntilLong: number;
}

export const DEFAULT_CONFIG: PomodoroConfig = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  sessionsUntilLong: 4,
};

/** Parses time strings like "5:00 PM", "5pm", "17:00", "5" to minutes from midnight (0..1439) */
export function parseTimeToMinutes(tStr: string, defaultPM?: boolean): number | null {
  if (!tStr) return null;
  const raw = tStr.trim().toLowerCase();
  const isPM = raw.includes('pm') || (defaultPM && !raw.includes('am'));
  const isAM = raw.includes('am');

  const clean = raw.replace(/[apm\s]/g, '');
  const parts = clean.split(':');
  if (parts.length === 0 || parts[0] === '') return null;

  let hours = parseInt(parts[0], 10);
  let minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  if (isNaN(hours)) return null;
  if (isNaN(minutes)) minutes = 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Auto-calculates task duration in seconds:
 * - If timeSlot has a range (e.g., "5 to 7 pm", "5:00 PM - 7:00 PM", "17:00-19:00") -> computes exact difference (e.g. 2 hours).
 * - If title has duration (e.g., "Dsa 2 hours", "1.5h study", "45 mins") -> computes duration.
 * - If estimatedMinutes is set -> uses estimatedMinutes * 60.
 * - If only single time point (e.g. "5:00 PM") or unspecified -> defaults to standard 25 mins (1500s).
 */
export function calculateTaskDurationSeconds(task?: any): number {
  if (!task) return 25 * 60;

  // 1. Check timeSlot for a range (e.g., "5 to 7 pm", "5:00 PM - 7:00 PM", "17:00-19:00")
  const slot = task.timeSlot || '';
  if (slot) {
    const rangeMatch = slot.split(/[-–—•]| to /i);
    if (rangeMatch.length >= 2) {
      const part1 = rangeMatch[0].trim();
      const part2 = rangeMatch[1].trim();

      const isPart2PM = part2.toLowerCase().includes('pm');
      const startMin = parseTimeToMinutes(part1, isPart2PM && !part1.toLowerCase().includes('am'));
      const endMin = parseTimeToMinutes(part2);

      if (startMin !== null && endMin !== null) {
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60; // wraps past midnight
        if (diff > 0 && diff <= 1440) {
          return diff * 60;
        }
      }
    }
  }

  // 2. Check title for time range embedded in text (e.g., "Study 5 to 7 pm", "Work 2pm - 4:30pm")
  const title = task.title || (task as any).text || '';
  if (title) {
    const titleRangeMatch = title.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (titleRangeMatch) {
      const part1 = titleRangeMatch[1].trim();
      const part2 = titleRangeMatch[2].trim();
      const isPart2PM = part2.toLowerCase().includes('pm');
      const startMin = parseTimeToMinutes(part1, isPart2PM && !part1.toLowerCase().includes('am'));
      const endMin = parseTimeToMinutes(part2);
      if (startMin !== null && endMin !== null) {
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60;
        if (diff > 0 && diff <= 1440) {
          return diff * 60;
        }
      }
    }

    // 3. Check title for natural language duration (e.g. "Dsa 2 hours", "1.5h study", "45 mins coding")
    const hoursMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/i);
    if (hoursMatch) {
      const h = parseFloat(hoursMatch[1]);
      if (!isNaN(h) && h > 0 && h <= 12) {
        return Math.round(h * 3600);
      }
    }

    const minsMatch = title.match(/(\d+)\s*(?:minutes?|mins?|min|m)\b/i);
    if (minsMatch) {
      const m = parseInt(minsMatch[1], 10);
      if (!isNaN(m) && m > 0 && m <= 720) {
        return m * 60;
      }
    }
  }

  // 4. Check estimatedMinutes property
  if (task.estimatedMinutes && typeof task.estimatedMinutes === 'number' && task.estimatedMinutes > 0) {
    return task.estimatedMinutes * 60;
  }

  // Default standard 25 mins
  return 25 * 60;
}

export function formatTime(secs: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (secs >= 3600) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

export function formatDurationLabel(secs: number): string {
  if (secs >= 3600) {
    const h = (secs / 3600);
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  return `${Math.round(secs / 60)}m`;
}
