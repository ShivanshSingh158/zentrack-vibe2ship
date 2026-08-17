// ─── NL Task Parser — Best-in-Class NLP (Universal Web & Mobile) ─────────────
// DATES:      "16 aug to 19 aug"  "16 september to 25 october"  "aug 16 to aug 19"
//             "kal"  "aaj"  "parso"  "tonight"  "this morning"  "this evening"
//             "in 30 minutes"  "in 2 hours"  "EOW"  "EOM"  "EOQ"  "SOW"
//             "16/8"  "16/8/2026"  "16-08-2026"  "Aug 15 2026"
//             "first monday of september"  "last friday of this month"
// TIMES:      "noon"  "midnight"  "morning"  "afternoon"  "evening"  "night"
//             "EOD"  "COB"  "3 o'clock"  bare "3" without am/pm → smart-PM
// PRIORITY:   "🔴" "!1" "p:high" "urgent"  "🟡" "medium"  "🟢" "low"
// DURATION:   "half an hour"  "a couple hours"  "2.5h"  "1h30m"  "45min"
// RECURRENCE: "fortnightly"  "biweekly"  "quarterly"  "annually"  "twice a week"
//             "every morning"  "every evening"  "every other tuesday"

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_SHORT  = ['sun','mon','tue','wed','thu','fri','sat'];
const MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LONG  = ['january','february','march','april','may','june','july','august','september','october','november','december'];

const MONTH_ALIASES: Record<string, number> = {
  jan:1,january:1,janu:1,
  feb:2,february:2,febr:2,
  mar:3,march:3,
  apr:4,april:4,
  may:5,
  jun:6,june:6,
  jul:7,july:7,
  aug:8,august:8,
  sep:9,sept:9,september:9,
  oct:10,octo:10,october:10,octu:10,
  nov:11,november:11,
  dec:12,dece:12,december:12,
};

const ALL_MONTH_FORMS = Object.keys(MONTH_ALIASES).sort((a,b) => b.length - a.length);

export interface NLPToken {
  type: 'date' | 'time' | 'priority' | 'recurrence' | 'tag' | 'duration';
  start: number;
  end: number;
  display: string;
}

export interface ParsedTask {
  title: string;
  date: string | null;
  timeSlot: string | null;
  endTimeSlot?: string | null;
  priority: 'high' | 'medium' | 'low';
  isRecurring: boolean;
  recurrenceRule: { type: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[] } | null;
  multiDays?: number;
  tags?: string[];
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
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLocalDateString(date: Date = new Date()): string {
  return toYMD(date);
}

export const formatLocalDateStr = getLocalDateString;

export function nextWeekday(targetDayIndex: number, forceNext = false): Date {
  const d = new Date();
  const currentDay = d.getDay();
  let diff = targetDayIndex - currentDay;
  if (diff < 0 || (diff === 0 && forceNext)) {
    diff += 7;
  }
  d.setDate(d.getDate() + diff);
  return d;
}

function resolveMonthDay(monthStr: string, dayNum: number): Date | null {
  const mLow = monthStr.toLowerCase().trim();
  const monthNum = MONTH_ALIASES[mLow] ?? MONTH_ALIASES[mLow.slice(0, 3)];
  if (!monthNum || dayNum < 1 || dayNum > 31) return null;
  const monthIdx = monthNum - 1;
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
  let priority: 'high' | 'medium' | 'low' = 'medium';
  let isRecurring = false;
  let recurrenceRule: ParsedTask['recurrenceRule'] = null;
  let multiDays: number | undefined;
  let durationMinutes: number | null = null;
  const extractedTags: string[] = [];

  function registerToken(type: NLPToken['type'], matchStr: string, display: string) {
    const idx = text.toLowerCase().indexOf(matchStr.toLowerCase());
    if (idx === -1) return;
    tokens.push({ type, start: idx, end: idx + matchStr.length, display });
    text = text.slice(0, idx) + ' '.repeat(matchStr.length) + text.slice(idx + matchStr.length);
  }

  // 0. TAGS (#hashtag)
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
    for (let i = tagMatches.length - 1; i >= 0; i--) {
      const t = tagMatches[i];
      text = text.slice(0, t.start) + ' '.repeat(t.full.length) + text.slice(t.start + t.full.length);
    }
  }

  // 1. PRIORITY
  const priorityPatterns: Array<[RegExp, 'high' | 'medium' | 'low', string]> = [
    [/\bp:(?:high|1|urgent|critical)\b/i,               'high',   'High'],
    [/\bp:(?:medium|2|mid|normal|med)\b/i,              'medium', 'Medium'],
    [/\bp:(?:low|3|someday|whenever)\b/i,               'low',    'Low'],
    [/\b!1\b/,                                          'high',   'High'],
    [/\b!2\b/,                                          'medium', 'Medium'],
    [/\b!3\b/,                                          'low',    'Low'],
    [/🔴|❗|🚨/,                                           'high',   'High'],
    [/🟡|⚠️|⏰/,                                           'medium', 'Medium'],
    [/🟢|✅|💤/,                                           'low',    'Low'],
    [/\b(urgent|critical|asap|p1|fire|blocker|high\s+priority|highest\s+priority|super\s+important)\b/i, 'high', 'High'],
    [/\b(important|p2|medium\s+priority|mid\s+priority|kinda\s+important|semi.?urgent)\b/i,              'medium', 'Medium'],
    [/\b(low\s+priority|p3|someday|whenever|not\s+urgent|low\s+key|no\s+rush|chill|whenever\s+you\s+can|when\s+free)\b/i, 'low', 'Low'],
    [/\bhigh\b/i,                                       'high',   'High'],
    [/\bmedium\b/i,                                     'medium', 'Medium'],
  ];
  for (const [pat, pri, label] of priorityPatterns) {
    const m = text.match(pat);
    if (m) { priority = pri; registerToken('priority', m[0], label); break; }
  }

  // 2. DURATION
  const durationPatterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\bhalf\s+an?\s+hour\b/i,                                             _ => 30],
    [/\ban?\s+hour\s+and\s+a\s+half\b/i,                                  _ => 90],
    [/\ba\s+couple\s+(?:of\s+)?hours?\b/i,                                _ => 120],
    [/\ban?\s+hour\b/i,                                                    _ => 60],
    [/\ba\s+few\s+minutes?\b/i,                                           _ => 10],
    [/\b(\d+\.\d+)\s*h(?:(?:ou)?rs?)?\b/i,                              m => Math.round(parseFloat(m[1])*60)],
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

  // 3. RECURRENCE
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
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], 'Weekdays');
  } else if (/\b(every\s+weekend|weekends)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekend|weekends)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [0, 6] };
    dateResult = nextWeekday(6);
    registerToken('recurrence', m[0], 'Weekends');
  } else if (/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week)\b/i.test(text)) {
    const m = text.match(/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 2 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Fortnightly');
  } else if (/\b(quarterly|every\s+quarter|every\s+3\s+months)\b/i.test(text)) {
    const m = text.match(/\b(quarterly|every\s+quarter|every\s+3\s+months)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'monthly', interval: 3 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Quarterly');
  } else if (/\b(annually|yearly|every\s+year)\b/i.test(text)) {
    const m = text.match(/\b(annually|yearly|every\s+year)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'monthly', interval: 12 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Yearly');
  } else if (/\b(every\s+week|weekly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+week|weekly)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Weekly');
  } else if (/\b(every\s+month|monthly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+month|monthly)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'monthly', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Monthly');
  }

  // 4. TIME
  if (!timeSlot) {
    if (/\bnoon\b/i.test(text)) {
      const m = text.match(/\bnoon\b/i)!;
      timeSlot = '12:00'; registerToken('time', m[0], '12:00pm');
    } else if (/\bmidnight\b/i.test(text)) {
      const m = text.match(/\bmidnight\b/i)!;
      timeSlot = '00:00'; registerToken('time', m[0], '12:00am');
    } else if (/\b(EOD|end\s+of\s+day|close\s+of\s+business|COB)\b/i.test(text)) {
      const m = text.match(/\b(EOD|end\s+of\s+day|close\s+of\s+business|COB)\b/i)!;
      timeSlot = '17:00'; registerToken('time', m[0], '5:00pm');
    } else if (/\bmorning\b/i.test(text)) {
      const m = text.match(/\bmorning\b/i)!;
      timeSlot = '09:00'; registerToken('time', m[0], '9:00am');
    } else if (/\bafternoon\b/i.test(text)) {
      const m = text.match(/\bafternoon\b/i)!;
      timeSlot = '14:00'; registerToken('time', m[0], '2:00pm');
    } else if (/\bevening\b/i.test(text)) {
      const m = text.match(/\bevening\b/i)!;
      timeSlot = '18:00'; registerToken('time', m[0], '6:00pm');
    } else if (/\bnight\b/i.test(text)) {
      const m = text.match(/\bnight\b/i)!;
      timeSlot = '21:00'; registerToken('time', m[0], '9:00pm');
    }
  }

  // Single / Range numeric time patterns
  if (!timeSlot) {
    const rangePattern = /\b(?:at\s+|from\s+)?(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)?\s*(?:to|-|until)\s*(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)\b/i;
    const rangeMatch = text.match(rangePattern);
    if (rangeMatch) {
      const p1 = rangeMatch[3] || rangeMatch[6];
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
        const mm = mins.toString().padStart(2,'00');
        timeSlot = `${hh}:${mm}`;
        const hr12 = h % 12 || 12;
        const ampm = h >= 12 ? 'pm' : 'am';
        registerToken('time', m[0], `${hr12}:${mm}${ampm}`);
        break;
      }
    }
  }

  // 5. DATE
  if (!dateResult) {
    if (/\b(today|aaj)\b/i.test(text)) {
      const m = text.match(/\b(today|aaj)\b/i)!;
      dateResult = new Date(now); registerToken('date', m[0], 'Today');
    } else if (/\b(tomorrow|tom|tmrw|kal)\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tom|tmrw|kal)\b/i)!;
      const d = new Date(now); d.setDate(d.getDate() + 1);
      dateResult = d; registerToken('date', m[0], 'Tomorrow');
    } else if (/\b(day\s+after\s+tomorrow|parso|overmorrow)\b/i.test(text)) {
      const m = text.match(/\b(day\s+after\s+tomorrow|parso|overmorrow)\b/i)!;
      const d = new Date(now); d.setDate(d.getDate() + 2);
      dateResult = d; registerToken('date', m[0], 'In 2 Days');
    } else if (/\b(next\s+week)\b/i.test(text)) {
      const m = text.match(/\b(next\s+week)\b/i)!;
      const d = new Date(now); d.setDate(d.getDate() + 7);
      dateResult = d; registerToken('date', m[0], 'Next Week');
    } else {
      // Day of week
      for (let di = 0; di < DAY_NAMES.length; di++) {
        const dn = DAY_NAMES[di], ds = DAY_SHORT[di];
        const pat = new RegExp(`\\b(?:on\\s+)?(?:this\\s+|next\\s+)?(${dn}|${ds})\\b`, 'i');
        const m = text.match(pat);
        if (m) {
          const forceNext = /\bnext\b/i.test(m[0]);
          dateResult = nextWeekday(di, forceNext);
          const label = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
          registerToken('date', m[0], label);
          break;
        }
      }

      // Explicit Month/Day
      if (!dateResult) {
        const mPat = `(${ALL_MONTH_FORMS.join('|')})`;
        const monthDayPat = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
        const dayMonthPat = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\b`, 'i');
        const m1 = text.match(monthDayPat);
        const m2 = text.match(dayMonthPat);
        if (m1) {
          const d = resolveMonthDay(m1[1], parseInt(m1[2], 10));
          if (d) {
            dateResult = d;
            const mL = m1[1].slice(0,1).toUpperCase() + m1[1].slice(1,3).toLowerCase();
            registerToken('date', m1[0], `${mL} ${m1[2]}`);
          }
        } else if (m2) {
          const d = resolveMonthDay(m2[2], parseInt(m2[1], 10));
          if (d) {
            dateResult = d;
            const mL = m2[2].slice(0,1).toUpperCase() + m2[2].slice(1,3).toLowerCase();
            registerToken('date', m2[0], `${m2[1]} ${mL}`);
          }
        }
      }
    }
  }

  // Clean title
  let cleanedTitle = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '')
    .trim();

  if (!cleanedTitle) cleanedTitle = raw.trim();

  return {
    title: cleanedTitle,
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const monthName = MONTHS[parseInt(m, 10) - 1];
    return `${d} ${monthName} ${y}`;
  }
  return dateStr;
}

export function formatHoursDisplay(val: string | number | undefined): string {
  if (val === undefined || val === null || val === '') return '';
  const numVal = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(numVal)) return String(val);
  const totalMinutes = Math.round(numVal * 60);
  if (totalMinutes === 0) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

export function isSilenceOrNoise(text: string | null | undefined): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  if (clean.length === 0) return true;
  if (/^[\s.?!,\-–—_"'`~*#@$%^&()\[\]{}|\\/<>:;+=]*$/.test(clean)) return true;
  const silenceTokens = [
    'silence','[silence]','(silence)','blank audio','[blank_audio]',
    'background noise','[background noise]','thank you','thanks',
    'am','task','task.','add task','listening','you','the'
  ];
  return silenceTokens.includes(clean);
}
