// ─── NL Task Parser — Todoist-level intelligence ──────────────────────────────
// Handles: "Submit lab report next Tuesday at 3pm high priority"
// Returns: parsed fields + token spans for live inline text highlighting

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_SHORT  = ['sun','mon','tue','wed','thu','fri','sat'];

/** A single detected token in the raw text (for inline highlighting) */
export interface NLPToken {
  type: 'date' | 'time' | 'priority' | 'recurrence';
  start: number;
  end: number;
  display: string;
}

/** Full result returned by parseNLTask */
export interface ParsedTask {
  title: string;
  date: string | null;
  timeSlot: string | null;
  endTimeSlot?: string | null;
  priority: 'high' | 'medium' | 'low';
  isRecurring: boolean;
  recurrenceRule: { type: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[] } | null;
  multiDays?: number;
  tokens: NLPToken[];
}

function parseSingleTime(hStr: string, mStr: string, pStr: string): { hh: string; mm: string; display: string } {
  let h = parseInt(hStr, 10);
  const mins = mStr ? parseInt(mStr, 10) : 0;
  const period = (pStr || '').toLowerCase();
  if (period === 'pm' && h < 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  const hh = h.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const hr12 = h % 12 || 12;
  const ampm = h >= 12 ? 'pm' : 'am';
  return { hh, mm, display: `${hr12}:${mm}${ampm}` };
}

export function toYMD(d: Date): string {
  // Use local date parts to avoid UTC timezone shift (critical for IST UTC+5:30)
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextWeekday(targetDayIndex: number, forceNext = false): Date {
  const d = new Date();
  const currentDay = d.getDay();
  let diff = targetDayIndex - currentDay;
  // Only push to next week if forceNext is explicitly true,
  // OR if diff is negative (the target day already passed this week).
  // diff === 0 means TODAY is the target day — return today, not next week.
  if (diff < 0 || (diff === 0 && forceNext)) {
    diff += 7;
  }
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseNLTask(raw: string): ParsedTask {
  const now = new Date();
  let text = raw;
  const tokens: NLPToken[] = [];
  let dateResult: Date | null = null;
  let timeSlot: string | null = null;
  let endTimeSlot: string | null = null;
  let priority: 'high' | 'medium' | 'low' = 'low';
  let isRecurring = false;
  let recurrenceRule: ParsedTask['recurrenceRule'] = null;
  let multiDays: number | undefined;

  function registerToken(type: NLPToken['type'], matchStr: string, display: string) {
    const idx = text.toLowerCase().indexOf(matchStr.toLowerCase());
    if (idx === -1) return;
    tokens.push({ type, start: idx, end: idx + matchStr.length, display });
    text = text.slice(0, idx) + ' '.repeat(matchStr.length) + text.slice(idx + matchStr.length);
  }

  // 1. PRIORITY
  const priorityPatterns: Array<[RegExp, 'high' | 'medium' | 'low', string]> = [
    [/\b(urgent|critical|asap|p1|high priority|highest priority)\b/i, 'high',   'High'],
    [/\b(important|p2|medium priority|mid priority)\b/i,              'medium', 'Medium'],
    [/\b(low priority|p3|someday|whenever)\b/i,                       'low',    'Low'],
    [/\bhigh\b/i,                                                       'high',   'High'],
    [/\bmedium\b/i,                                                     'medium', 'Medium'],
  ];
  for (const [pat, pri, label] of priorityPatterns) {
    const m = text.match(pat);
    if (m) { priority = pri; registerToken('priority', m[0], label); break; }
  }

  // 2. RECURRENCE
  if (/\b(every\s+day|daily|each\s+day)\b/i.test(text)) {
    const m = text.match(/\b(every\s+day|daily|each\s+day)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Daily');
  } else if (/\b(every\s+week|weekly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+week|weekly)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Weekly');
  } else if (/\b(every\s+month|monthly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+month|monthly)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'monthly', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Monthly');
  } else if (/\bevery\s+(\d+)\s+days?\b/i.test(text)) {
    const m = text.match(/\bevery\s+(\d+)\s+days?\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: parseInt(m[1], 10) }; dateResult = new Date(now);
    registerToken('recurrence', m[0], `Every ${m[1]} Days`);
  } else {
    // Check for day ranges ("monday to friday", "tue and wed")
    const getDayIdx = (s: string) => {
      s = s.toLowerCase();
      let idx = DAY_NAMES.findIndex(d => s.startsWith(d));
      if (idx !== -1) return idx;
      return DAY_SHORT.findIndex(d => s.startsWith(d));
    };
    
    const dayRegexStr = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)s?';
    const rangePat = new RegExp(`\\b(?:every\\s+)?${dayRegexStr}\\s+(?:to|-)\\s+${dayRegexStr}\\b`, 'i');
    const andPat = new RegExp(`\\b(?:every\\s+)?${dayRegexStr}\\s+(?:and|&)\\s+${dayRegexStr}\\b`, 'i');
    
    const rm = text.match(rangePat);
    const am = text.match(andPat);

    if (rm) {
      const start = getDayIdx(rm[1]);
      const end = getDayIdx(rm[2]);
      if (start !== -1 && end !== -1) {
        const days = [];
        let curr = start;
        while (true) {
          days.push(curr);
          if (curr === end) break;
          curr = (curr + 1) % 7;
        }
        isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days.sort() }; 
        dateResult = nextWeekday(start);
        registerToken('recurrence', rm[0], `${rm[1]} to ${rm[2]}`);
      }
    } else if (am) {
      const d1 = getDayIdx(am[1]);
      const d2 = getDayIdx(am[2]);
      if (d1 !== -1 && d2 !== -1) {
        const days = [d1, d2].sort();
        isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days }; 
        dateResult = nextWeekday(days[0]);
        registerToken('recurrence', am[0], `${am[1]} & ${am[2]}`);
      }
    } else {
      for (let di = 0; di < DAY_NAMES.length; di++) {
        const dn = DAY_NAMES[di], ds = DAY_SHORT[di];
        const pat = new RegExp(`\\bevery\\s+(${dn}s?|${ds}s?)\\b`, 'i');
        const m = text.match(pat);
        if (m) {
          isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [di] }; dateResult = nextWeekday(di);
          const label = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
          registerToken('recurrence', m[0], `Every ${label}`); break;
        }
      }
    }
  }

  // 3. TIME (RANGES & SINGLE)
  // Range pattern e.g. "at 6:30 am to 8:30 am", "from 6:30am - 8:30am", "6 30 am to 8 30 am"
  const rangePattern = /\b(?:at\s+|from\s+)?(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)?\s*(?:to|-|until)\s*(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)\b/i;
  const rangeMatch = text.match(rangePattern);

  if (rangeMatch) {
    const p1 = rangeMatch[3] || rangeMatch[6]; // infer period for start if omitted (e.g. 6 to 8pm)
    const t1 = parseSingleTime(rangeMatch[1], rangeMatch[2], p1);
    const t2 = parseSingleTime(rangeMatch[4], rangeMatch[5], rangeMatch[6]);
    timeSlot = `${t1.hh}:${t1.mm}`;
    endTimeSlot = `${t2.hh}:${t2.mm}`;
    registerToken('time', rangeMatch[0], `${t1.display} - ${t2.display}`);
  } else {
    const timePatterns: RegExp[] = [
      /\bat\s?(\d{1,2}):(\d{2})\s?(am|pm)?\b/i,
      /\bat\s?(\d{1,2})\s?(am|pm)\b/i,
      /\b(\d{1,2}):(\d{2})\s?(am|pm)\b/i,
      /\b(\d{1,2})\s?(am|pm)\b/i,
    ];
    for (const pat of timePatterns) {
      const m = text.match(pat);
      if (!m) continue;
      let h = parseInt(m[1], 10);
      const secondGroup = m[2] ?? '';
      const thirdGroup  = m[3] ?? '';
      const mins   = /^\d+$/.test(secondGroup) ? parseInt(secondGroup, 10) : 0;
      const period = /^\d+$/.test(secondGroup) ? thirdGroup.toLowerCase() : secondGroup.toLowerCase();
      if (period === 'pm' && h < 12) h += 12;
      if (period === 'am' && h === 12) h = 0;
      const hh = h.toString().padStart(2,'0');
      const mm = mins.toString().padStart(2,'0');
      timeSlot = `${hh}:${mm}`;
      const hr12 = h % 12 || 12;
      const ampm = h >= 12 ? 'pm' : 'am';
      registerToken('time', m[0], `${hr12}:${mm}${ampm}`); break;
    }
  }

  // 4. DATE
  if (!dateResult) {
    if (/\btoday\b/i.test(text)) {
      const m = text.match(/\btoday\b/i)!; dateResult = new Date(now);
      registerToken('date', m[0], 'Today');
    } else if (/\b(tomorrow|tmr|tmrw)\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tmr|tmrw)\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      registerToken('date', m[0], 'Tomorrow');
    } else if (/\bday after tomorrow\b/i.test(text)) {
      const m = text.match(/\bday after tomorrow\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 2);
      registerToken('date', m[0], 'Day After Tomorrow');
    } else if (/\bthis\s+weekend\b/i.test(text)) {
      const m = text.match(/\bthis\s+weekend\b/i)!;
      dateResult = nextWeekday(6); registerToken('date', m[0], 'This Weekend');
    } else if (/\bend\s+of\s+(?:the\s+)?week\b/i.test(text)) {
      const m = text.match(/\bend\s+of\s+(?:the\s+)?week\b/i)!;
      dateResult = nextWeekday(5); registerToken('date', m[0], 'End of Week');
    } else if (/\bend\s+of\s+(?:the\s+)?month\b/i.test(text)) {
      const m = text.match(/\bend\s+of\s+(?:the\s+)?month\b/i)!;
      dateResult = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      registerToken('date', m[0], 'End of Month');
    } else if (/\bnext\s+month\b/i.test(text)) {
      const m = text.match(/\bnext\s+month\b/i)!;
      dateResult = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      registerToken('date', m[0], 'Next Month');
    } else if (/\b(?:for\s+(?:the\s+)?)?next\s+(\d+)\s+days?\b/i.test(text)) {
      const m = text.match(/\b(?:for\s+(?:the\s+)?)?next\s+(\d+)\s+days?\b/i)!;
      multiDays = parseInt(m[1], 10); dateResult = new Date(now);
      registerToken('date', m[0], `Next ${m[1]} Days`);
    } else if (/\bin\s+(\d+)\s+days?\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s+days?\b/i)!;
      const n = parseInt(m[1], 10); dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + n);
      registerToken('date', m[0], `In ${n} Day${n === 1 ? '' : 's'}`);
    } else if (/\bin\s+(\d+)\s+weeks?\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s+weeks?\b/i)!;
      const n = parseInt(m[1], 10); dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + n * 7);
      registerToken('date', m[0], `In ${n} Week${n === 1 ? '' : 's'}`);
    } else {
      const byMatch = text.match(/\b(?:by|due)\s+(next\s+)?([a-z]+)\b/i);
      if (byMatch) {
        const forceNext = !!byMatch[1], dayStr = byMatch[2].toLowerCase();
        const di = DAY_NAMES.indexOf(dayStr) !== -1 ? DAY_NAMES.indexOf(dayStr) : DAY_SHORT.indexOf(dayStr);
        if (di !== -1) {
          dateResult = nextWeekday(di, forceNext);
          const dl = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
          registerToken('date', byMatch[0], `By ${dl}`);
        }
      }
    }

    if (!dateResult) {
      for (let di = 0; di < DAY_NAMES.length; di++) {
        const dn = DAY_NAMES[di], ds = DAY_SHORT[di];
        const nextPat  = new RegExp(`\\bnext\\s+(${dn}|${ds})\\b`, 'i');
        const thisPat  = new RegExp(`\\bthis\\s+(${dn}|${ds})\\b`, 'i');
        const onPat    = new RegExp(`\\bon\\s+(${dn}|${ds})\\b`, 'i');
        const plainPat = new RegExp(`\\b(${dn}|${ds})\\b`, 'i');
        let m: RegExpMatchArray | null = null, forceNext = false;
        if      ((m = text.match(nextPat)))  forceNext = true;
        else if ((m = text.match(thisPat)))  forceNext = false;
        else if ((m = text.match(onPat)))    forceNext = false;
        else if ((m = text.match(plainPat))) forceNext = false;
        if (m) {
          dateResult = nextWeekday(di, forceNext);
          const label = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
          registerToken('date', m[0], `${forceNext ? 'Next ' : ''}${label}`); break;
        }
      }
    }
  }

  // 5. BUILD CLEAN TITLE
  let title = raw;
  const sortedTokens = [...tokens].sort((a, b) => b.start - a.start);
  for (const tok of sortedTokens) {
    title = title.slice(0, tok.start) + title.slice(tok.end);
  }
  title = title.replace(/\s{2,}/g, ' ').replace(/^[\s,.:]+|[\s,.:]+$/g, '').trim();
  if (!title) title = raw.trim();

  return { title, date: dateResult ? toYMD(dateResult) : null, timeSlot, endTimeSlot, priority, isRecurring, recurrenceRule, multiDays, tokens };
}

// Legacy compat for QuickCaptureSheet
export function parseNLDate(text: string): { date: string | null; timeSlot: string | null; cleanTitle: string; multiDays?: number } {
  const r = parseNLTask(text);
  return { date: r.date, timeSlot: r.timeSlot, cleanTitle: r.title, multiDays: r.multiDays };
}

export function timeAgo(dateInput: any): string {
  if (!dateInput) return '';
  let date: Date;
  if (typeof dateInput.toDate === 'function') date = dateInput.toDate();
  else if (typeof dateInput.toMillis === 'function') date = new Date(dateInput.toMillis());
  else if (typeof dateInput === 'number' || typeof dateInput === 'string') date = new Date(dateInput);
  else if (dateInput instanceof Date) date = dateInput;
  else return '';
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// ─── Centralised Date Display Helpers (DD-MM-YYYY, Indian convention) ─────────
// Import these everywhere instead of scattering toLocaleDateString('en-US', …).

const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_LONG     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/**
 * Parse a YYYY-MM-DD string safely as a LOCAL date (avoids UTC midnight shift).
 * Always use this instead of `new Date(dateStr)` for ISO date strings.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * "03 Aug 2026" — full date, day-first.
 * Use for task detail views, headers, exports.
 */
export function formatDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * "03 Aug" — short date without year.
 * Use for list items, chips, compact displays.
 */
export function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * "Mon, 03 Aug" — weekday + short date (no year).
 * Use for section headers, calendar labels.
 */
export function formatDateWithDay(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
}

/**
 * "Monday, 03 August 2026" — full long form.
 * Use for calendar month headers, SARA context.
 */
export function formatDateFull(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * "03-08-2026" — pure DD-MM-YYYY numeric format.
 * Use for exports, PDF footers, RecurrencePicker end-date chip.
 */
export function formatDateNumeric(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
}

/**
 * Format a JS Date object (not an ISO string) to "03 Aug" short form.
 * Use in gym charts or anywhere you have a Date object, not a YYYY-MM-DD string.
 */
export function formatDateObjShort(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT[date.getMonth()]}`;
}
