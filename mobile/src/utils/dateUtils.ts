// ─── NL Task Parser — Best-in-Class NLP ────────────────────────────────────────
// Handles: "Submit lab report next Tuesday at 3pm p:high #work for 45m"
//          "Gym class monday to friday 6am"   "every weekday at 9am !1"
//          "Call doctor aug 15 at 2pm"        "every other tuesday 1h"
// Returns: parsed fields + token spans for live inline text highlighting

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_SHORT  = ['sun','mon','tue','wed','thu','fri','sat'];
const MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LONG  = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/** A single detected token in the raw text (for inline highlighting) */
export interface NLPToken {
  type: 'date' | 'time' | 'priority' | 'recurrence' | 'tag' | 'duration';
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
  /** Auto-extracted #hashtag values, lowercased, without the # */
  tags?: string[];
  /** Parsed duration in minutes (e.g. "for 45m" → 45, "1h30m" → 90) */
  durationMinutes?: number | null;
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

/** Resolve a month name + day number to a local Date (pushes to next year if already past) */
function resolveMonthDay(monthStr: string, dayNum: number): Date | null {
  const mLow = monthStr.toLowerCase().slice(0, 3);
  const monthIdx = MONTH_SHORT.findIndex(m => m === mLow);
  if (monthIdx === -1 || dayNum < 1 || dayNum > 31) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = new Date(now.getFullYear(), monthIdx, dayNum);
  if (candidate < today) candidate = new Date(now.getFullYear() + 1, monthIdx, dayNum);
  return candidate;
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
  let durationMinutes: number | null = null;
  const extractedTags: string[] = [];

  function registerToken(type: NLPToken['type'], matchStr: string, display: string) {
    const idx = text.toLowerCase().indexOf(matchStr.toLowerCase());
    if (idx === -1) return;
    tokens.push({ type, start: idx, end: idx + matchStr.length, display });
    // Blank with spaces (same length) so subsequent searches skip this span
    text = text.slice(0, idx) + ' '.repeat(matchStr.length) + text.slice(idx + matchStr.length);
  }

  // ── 0. TAGS (#hashtag) ─────────────────────────────────────────────────────
  // Extract all #tag tokens from raw BEFORE modifying `text`, so positions are
  // correct for the highlighting layer. Process in reverse to preserve indices.
  {
    const tagRe = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let tm: RegExpExecArray | null;
    const tagMatches: Array<{ full: string; name: string; start: number }> = [];
    while ((tm = tagRe.exec(raw)) !== null) {
      tagMatches.push({ full: tm[0], name: tm[1].toLowerCase(), start: tm.index });
    }
    for (const t of tagMatches) {
      extractedTags.push(t.name);
      tokens.push({ type: 'tag', start: t.start, end: t.start + t.full.length, display: `#${t.name}` });
    }
    // Blank tags in working text in reverse order to preserve earlier indices
    for (let i = tagMatches.length - 1; i >= 0; i--) {
      const t = tagMatches[i];
      text = text.slice(0, t.start) + ' '.repeat(t.full.length) + text.slice(t.start + t.full.length);
    }
  }

  // ── 1. PRIORITY ──────────────────────────────────────────────────────────────
  // Supports: p:high p:1 !1 !2 !3  urgent  high priority  high
  const priorityPatterns: Array<[RegExp, 'high' | 'medium' | 'low', string]> = [
    [/\bp:(?:high|1|urgent|critical)\b/i,               'high',   'High'],
    [/\bp:(?:medium|2|mid|normal|med)\b/i,              'medium', 'Medium'],
    [/\bp:(?:low|3|someday|whenever)\b/i,               'low',    'Low'],
    [/\b!1\b/,                                          'high',   'High'],
    [/\b!2\b/,                                          'medium', 'Medium'],
    [/\b!3\b/,                                          'low',    'Low'],
    [/\b(urgent|critical|asap|p1|high\s+priority|highest\s+priority)\b/i, 'high',   'High'],
    [/\b(important|p2|medium\s+priority|mid\s+priority)\b/i,              'medium', 'Medium'],
    [/\b(low\s+priority|p3|someday|whenever)\b/i,                         'low',    'Low'],
    [/\bhigh\b/i,                                       'high',   'High'],
    [/\bmedium\b/i,                                     'medium', 'Medium'],
  ];
  for (const [pat, pri, label] of priorityPatterns) {
    const m = text.match(pat);
    if (m) { priority = pri; registerToken('priority', m[0], label); break; }
  }

  // ── 2. DURATION ──────────────────────────────────────────────────────────────
  // Supports: "for 45m"  "for 1h30m"  "for 2 hours"  "1h"  "45min"  "1h 30m"
  const durationPatterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\bfor\s+(\d+)\s*h(?:(?:ou)?rs?)?\s+(\d+)\s*m(?:in(?:utes?)?)?\b/i, m => parseInt(m[1])*60 + parseInt(m[2])],
    [/\bfor\s+(\d+)\s*h(\d{2})\b/i,                                        m => parseInt(m[1])*60 + parseInt(m[2])],
    [/\bfor\s+(\d+)\s*h(?:(?:ou)?rs?)?\b/i,                               m => parseInt(m[1])*60],
    [/\bfor\s+(\d+)\s*m(?:in(?:utes?)?)?\b/i,                             m => parseInt(m[1])],
    [/\bfor\s+(\d+)\s+hours?\b/i,                                          m => parseInt(m[1])*60],
    [/\bfor\s+(\d+)\s+minutes?\b/i,                                        m => parseInt(m[1])],
    [/\b(\d+)h(\d+)m\b/i,                                                  m => parseInt(m[1])*60 + parseInt(m[2])],
    [/\b(\d+)h\b(?!\d)/i,                                                  m => parseInt(m[1])*60],
    [/\b(\d+)min\b/i,                                                       m => parseInt(m[1])],
  ];
  for (const [pat, calc] of durationPatterns) {
    const m = text.match(pat);
    if (m) {
      durationMinutes = calc(m);
      const hh = Math.floor(durationMinutes / 60);
      const mm = durationMinutes % 60;
      const disp = hh > 0 ? (mm > 0 ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
      registerToken('duration', m[0], disp);
      break;
    }
  }

  // ── 3. RECURRENCE ─────────────────────────────────────────────────────────────
  const getDayIdx = (s: string) => {
    s = s.toLowerCase();
    let idx = DAY_NAMES.findIndex(d => s.startsWith(d));
    if (idx !== -1) return idx;
    return DAY_SHORT.findIndex(d => s.startsWith(d));
  };
  const dayRegexStr = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)s?';

  if (/\b(every\s+day|daily|each\s+day)\b/i.test(text)) {
    const m = text.match(/\b(every\s+day|daily|each\s+day)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Daily');
  } else if (/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1,2,3,4,5] };
    dateResult = nextWeekday(1); // snap to next Monday
    registerToken('recurrence', m[0], 'Weekdays');
  } else if (/\b(every\s+weekend|weekends)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekend|weekends)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [0, 6] };
    dateResult = nextWeekday(6); // snap to next Saturday
    registerToken('recurrence', m[0], 'Weekends');
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
  } else if (/\bevery\s+(\d+)\s+weeks?\b/i.test(text)) {
    const m = text.match(/\bevery\s+(\d+)\s+weeks?\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: parseInt(m[1], 10) }; dateResult = new Date(now);
    registerToken('recurrence', m[0], `Every ${m[1]} Weeks`);
  } else {
    // "every other tuesday" → biweekly
    const everyOtherPat = new RegExp(`\\bevery\\s+other\\s+${dayRegexStr}\\b`, 'i');
    const eom = text.match(everyOtherPat);
    if (eom) {
      const di = getDayIdx(eom[1]);
      if (di !== -1) {
        isRecurring = true; recurrenceRule = { type: 'weekly', interval: 2, daysOfWeek: [di] };
        dateResult = nextWeekday(di);
        const lbl = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
        registerToken('recurrence', eom[0], `Every Other ${lbl}`);
      }
    }

    if (!isRecurring) {
      // Day range: "monday to friday", "mon-fri"
      const rangePat = new RegExp(`\\b(?:every\\s+)?${dayRegexStr}\\s+(?:to|-)\\s+${dayRegexStr}\\b`, 'i');
      const andPat   = new RegExp(`\\b(?:every\\s+)?${dayRegexStr}\\s+(?:and|&)\\s+${dayRegexStr}\\b`, 'i');
      const rm = text.match(rangePat);
      const am = text.match(andPat);

      if (rm) {
        const start = getDayIdx(rm[1]);
        const end   = getDayIdx(rm[2]);
        if (start !== -1 && end !== -1) {
          const days: number[] = [];
          let curr = start;
          while (true) {
            days.push(curr);
            if (curr === end) break;
            curr = (curr + 1) % 7;
            if (days.length > 7) break;
          }
          isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days.sort() };
          dateResult = nextWeekday(start);
          const sLbl = DAY_NAMES[start]?.charAt(0).toUpperCase() + DAY_NAMES[start]?.slice(1);
          const eLbl = DAY_NAMES[end]?.charAt(0).toUpperCase() + DAY_NAMES[end]?.slice(1);
          registerToken('recurrence', rm[0], `${sLbl} – ${eLbl}`);
        }
      } else if (am) {
        const d1 = getDayIdx(am[1]);
        const d2 = getDayIdx(am[2]);
        if (d1 !== -1 && d2 !== -1) {
          const days = [d1, d2].sort();
          isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days };
          dateResult = nextWeekday(days[0]);
          const l1 = DAY_NAMES[d1]?.charAt(0).toUpperCase() + DAY_NAMES[d1]?.slice(1);
          const l2 = DAY_NAMES[d2]?.charAt(0).toUpperCase() + DAY_NAMES[d2]?.slice(1);
          registerToken('recurrence', am[0], `${l1} & ${l2}`);
        }
      } else {
        for (let di = 0; di < DAY_NAMES.length; di++) {
          const dn = DAY_NAMES[di], ds = DAY_SHORT[di];
          const pat = new RegExp(`\\bevery\\s+(${dn}s?|${ds}s?)\\b`, 'i');
          const m = text.match(pat);
          if (m) {
            isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [di] };
            dateResult = nextWeekday(di);
            const label = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
            registerToken('recurrence', m[0], `Every ${label}`); break;
          }
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
    } else if (/\bin\s+(\d+)\s+months?\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s+months?\b/i)!;
      const n = parseInt(m[1], 10); dateResult = new Date(now); dateResult.setMonth(dateResult.getMonth() + n);
      registerToken('date', m[0], `In ${n} Month${n === 1 ? '' : 's'}`);
    } else {
      // Specific dates: "Aug 15", "15 Aug", "August 15th", "15th August"
      const mPat = `(${MONTH_LONG.join('|')}|${MONTH_SHORT.join('|')})`;
      const mdPat = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
      const dmPat = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\b`, 'i');
      const mdM = text.match(mdPat);
      const dmM = text.match(dmPat);
      if (mdM) {
        const d = resolveMonthDay(mdM[1], parseInt(mdM[2], 10));
        if (d) {
          dateResult = d;
          const mLabel = mdM[1].charAt(0).toUpperCase() + mdM[1].slice(1).toLowerCase();
          registerToken('date', mdM[0], `${mLabel} ${mdM[2]}`);
        }
      } else if (dmM) {
        const d = resolveMonthDay(dmM[2], parseInt(dmM[1], 10));
        if (d) {
          dateResult = d;
          const mLabel = dmM[2].charAt(0).toUpperCase() + dmM[2].slice(1).toLowerCase();
          registerToken('date', dmM[0], `${dmM[1]} ${mLabel}`);
        }
      }
    }

    if (!dateResult) {
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

  return {
    title,
    date: dateResult ? toYMD(dateResult) : null,
    timeSlot,
    endTimeSlot,
    priority,
    isRecurring,
    recurrenceRule,
    multiDays,
    tags: extractedTags,
    durationMinutes,
    tokens,
  };
}

// Legacy compat for QuickCaptureSheet
export function parseNLDate(text: string): { date: string | null; timeSlot: string | null; cleanTitle: string; multiDays?: number } {
  const r = parseNLTask(text);
  return { date: r.date, timeSlot: r.timeSlot, cleanTitle: r.title, multiDays: r.multiDays };
}

export interface ParsedEvent {
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  type: 'exam' | 'assignment_due' | 'holiday' | 'todo' | 'job';
  typeLabel: string;
  typeIcon: string;
  typeColor: string;
  tokens: NLPToken[];
}

export function parseNLEvent(raw: string): ParsedEvent {
  const task = parseNLTask(raw);
  let type: ParsedEvent['type'] = 'todo';
  let typeLabel = 'Task';
  let typeIcon = '✅';
  let typeColor = '#7c3aed';

  const lower = raw.toLowerCase();
  if (/\b(exam|test|quiz|viva|midterm|endsem|finals?|theory|practical|paper|assessment)\b/i.test(lower)) {
    type = 'exam';
    typeLabel = 'Exam';
    typeIcon = '📝';
    typeColor = '#ef4444';
  } else if (/\b(assignment|homework|submission|report|project|submit|lab report|presentation)\b/i.test(lower)) {
    type = 'assignment_due';
    typeLabel = 'Assignment';
    typeIcon = '📋';
    typeColor = '#8b5cf6';
  } else if (/\b(holiday|vacation|leave|break|trip|festival|off)\b/i.test(lower)) {
    type = 'holiday';
    typeLabel = 'Holiday';
    typeIcon = '🌴';
    typeColor = '#10b981';
  } else if (/\b(interview|placement|job|drive|meeting|call|webinar|conference|hiring|oa|round)\b/i.test(lower)) {
    type = 'job';
    typeLabel = 'Interview';
    typeIcon = '💼';
    typeColor = '#fbbf24';
  }

  let startTime = task.timeSlot;
  let endTime = task.endTimeSlot || null;
  if (startTime && !endTime) {
    const [hh, mm] = startTime.split(':').map(Number);
    const dur = task.durationMinutes || (type === 'exam' ? 120 : (type === 'job' ? 60 : 60));
    const totalMin = hh * 60 + mm + dur;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  }

  return {
    title: task.title,
    date: task.date,
    startTime,
    endTime,
    type,
    typeLabel,
    typeIcon,
    typeColor,
    tokens: task.tokens,
  };
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
