// ─── NL Task Parser — Best-in-Class Universal NLP Engine (Web & Mobile) ─────────────
// DATES:      "16 aug to 19 aug"  "16 september to 25 october"  "aug 16 to aug 19"
//             "kal"  "aaj"  "parso"  "tonight"  "this morning"  "this evening"
//             "in 30 minutes"  "in 2 hours"  "EOW"  "EOM"  "EOQ"  "SOW"
//             "16/8"  "16/8/2026"  "16-08-2026"  "Aug 15 2026"  "1st of March"  "on the 5th"
//             "first monday of september"  "last friday of this month"  "last day of august"
// TIMES:      "noon"  "midnight"  "morning"  "afternoon"  "evening"  "night"  "dawn"  "dusk"
//             "EOD"  "COB"  "3 o'clock"  "half past 3"  "a quarter to 5"  "quarter past 6"
//             "before lunch"  "after lunch"  "5 baje"  "shaam 6 baje"  bare "3" → smart-PM
//             "4 30 pm"  "9.30pm"  "430pm"  "1030am"  "1230pm"  "10am to 12pm"
// PRIORITY:   "🔴" "!1" "p:high" "urgent"  "🟡" "medium"  "🟢" "low"  "critical"  "asap"
// DURATION:   "half an hour"  "a couple hours"  "2.5h"  "1h30m"  "45min"  "block of 2 hours"
// RECURRENCE: "fortnightly"  "biweekly"  "quarterly"  "annually"  "twice a week"  "3x a week"
//             "every morning"  "every evening"  "every other tuesday"  "every mon, wed, fri"
//             "monday to saturday"  "daily from monday to friday"  "mon and wed"
// SUBTASKS:   "with subtasks: a, b, c"  "checklist: a, b"  "buy groceries: milk, eggs, bread"
// MULTI-TASK: "1. task one 2. task two"  "task one and then task two"  "task one; task two"

export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_LONG = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const MONTHS_SHORT_CAP = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG_CAP = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT_CAP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG_CAP = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Alternate / common typo spellings → canonical 1-indexed month number (1-12)
 */
export const MONTH_ALIASES: Record<string, number> = {
  jan: 1, january: 1, janu: 1,
  feb: 2, february: 2, febr: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, octo: 10, october: 10, octu: 10,
  nov: 11, november: 11,
  dec: 12, dece: 12, december: 12,
};

export const ALL_MONTH_FORMS = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length);

/** A single detected token in the raw text (for inline highlighting & chips) */
export interface NLPToken {
  type: 'date' | 'time' | 'priority' | 'recurrence' | 'tag' | 'duration' | 'reminder' | 'subtask' | 'location';
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
  recurrenceRule: { type: 'daily' | 'weekly' | 'monthly' | 'custom'; interval?: number; daysOfWeek?: number[]; endDate?: string } | null;
  multiDays?: number;
  oneTimeDates?: string[];
  tags?: string[];
  durationMinutes?: number | null;
  isReminder?: boolean;
  subtasks?: string[];
  locationReminder?: any;
  locationName?: string;
  tokens: NLPToken[];
}

/** Parsed calendar event structure */
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

function parseSingleTime(hStr: string, mStr: string, pStr: string): { hh: string; mm: string; display: string } {
  let h = parseInt(hStr, 10);
  const mins = mStr ? parseInt(mStr, 10) : 0;
  const period = (pStr || '').toLowerCase().replace(/[^a-z]/g, '');
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

export function getTodayLocalDateStr(): string {
  return getLocalDateString(new Date());
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
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    const dt = new Date();
    dt.setDate(dt.getDate() + offsetDays);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

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

export function extractDayListFromText(raw: string): number[] {
  const parts = raw
    .toLowerCase()
    .split(/[,&+]|\band\b/)
    .map(p => p.trim())
    .filter(Boolean);

  const seen = new Set<number>();
  const result: number[] = [];

  for (const part of parts) {
    let idx = DAY_NAMES.findIndex(d => part.startsWith(d));
    if (idx === -1) idx = DAY_SHORT.findIndex(d => part.startsWith(d));
    if (idx !== -1 && !seen.has(idx)) {
      seen.add(idx);
      result.push(idx);
    }
  }

  return result;
}

export function thisWeekDate(dayIndex: number): Date {
  const d = new Date();
  const todayDay = d.getDay();
  const diff = dayIndex - todayDay;
  d.setDate(d.getDate() + diff);
  return d;
}

export function resolveMonthDay(monthStr: string, dayNum: number): Date | null {
  const mLow = monthStr.toLowerCase().trim();
  const monthNum = MONTH_ALIASES[mLow] ?? MONTH_ALIASES[mLow.slice(0, 3)];
  if (!monthNum || dayNum < 1 || dayNum > 31) return null;
  const monthIdx = monthNum - 1;
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = new Date(now.getFullYear(), monthIdx, dayNum);
  if (candidate < todayDate) candidate = new Date(now.getFullYear() + 1, monthIdx, dayNum);
  return candidate;
}

/**
 * Strips conversational command prefixes, carrier words, filler phrases,
 * trailing prepositions, normalizes inverted voice grammar,
 * capitalizes sentences, and preserves standard tech/academic acronyms.
 */
export function cleanTaskTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let t = rawTitle.trim();

  // 1. Assistant / Conversational wrappers
  t = t.replace(/^(?:hey\s+)?sara[,:\s]+/i, '');
  t = t.replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, '');
  t = t.replace(/^please\s+(?:kindly\s+)?/i, '');
  t = t.replace(/^kindly\s+/i, '');

  // 2. Command Prefixes & spoken preambles
  const commandPrefixes = [
    /^create\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^create\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^create\s+(?:a\s+|an\s+)?/i,
    /^add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^add\s+(?:a\s+|an\s+)?/i,
    /^make\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^make\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^make\s+(?:a\s+|an\s+)?/i,
    /^schedule\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^schedule\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^schedule\s+(?:a\s+|an\s+)?/i,
    /^set\s+(?:up\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:reminder|alarm|task|event)\s+(?:to|for|at|about)\s+/i,
    /^set\s+(?:up\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:reminder|alarm|task|event)\s*[:\-]?\s+/i,
    /^set\s+alarm\s+(?:for|at|to)\s+/i,
    /^remind\s+me\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|that|to|for|about)?\s*/i,
    /^remind\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|that|to|for|about)?\s*/i,
    /^reminder\s*[:\-]\s*/i,
    /^reminder\s+(?:to|for|about)\s+/i,
    /^(?:don'?t\s+forget|dont\s+forget)\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|to\s+)?/i,
    /^remember\s+(?:to\s+)?/i,
    /^(?:make|be)\s+sure\s+to\s+/i,
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:was\s+thinking\s+(?:of|about)|was\s+planning\s+(?:to|on)|am\s+planning\s+(?:to|on)|plan\s+to|planning\s+(?:to|on))\s+/i,
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:am\s+supposed\s+to|are\s+supposed\s+to|supposed\s+to)\s+/i,
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:have\s+got\s+to|'ve\s+gotta|have\s+to|need\s+to|want\s+to|wanna|wish\s+to|just\s+need\s+to|got\s+to|gotta)\s+/i,
    /^(?:that\s+)?(?:i|we)\s+(?:should|must)\s+/i,
    /^(?:gotta|wanna|need\s+to)\s+/i,
    /^(?:hit|do)\s+(?:the\s+)?(?=(?:chest|back|legs|biceps|triceps|shoulders|push|pull|gym|workout)\b)/i,
    /^(?:bhai|yaar|bro|dude)[,\s]+/i,
    /^(?:put|write|note|take)\s+down\s+(?:a\s+|the\s+)?(?:task\s+)?(?:to|for)?\s*/i,
    /^(?:log|record|enter|track)\s+(?:a\s+|the\s+)?(?:task\s+)?(?:to|for)?\s*/i,
    /^(?:to-?do|task|action\s+item|new\s+task|note)\s*[:\-]\s*/i,
    /^(?:um+|uh+|er+|ah+|like|you\s+know|basically|actually|literally|honestly|i\s+mean|to\s+be\s+honest|just\s+wanted\s+to|i\s+think\s+i\s+should|just|so|well)[,\s]+/i,
    /^(?:i\s+want\s+you\s+to|can\s+you\s+help\s+me\s+to|help\s+me\s+to|i\s+need\s+you\s+to|can\s+you\s+make\s+sure\s+to)\s+/i,
    /^(?:make\s+sure\s+(?:that\s+)?(?:i|we)\s+(?:have\s+to|need\s+to|don'?t\s+forget\s+to)?|ensure\s+(?:that\s+)?|ensure\s+to)\s*/i,
    /^(?:note\s+to\s+self|memo|quick\s+note)[,\s:]+/i,
    /^(?:bhai\s+sun|ek\s+kaam\s+kar|dekh\s+bhai|dekh\s+yaar|yaar\s+ek|mujhe\s+lagta\s+hai|suno)[,\s:]+/i,
    /^(?:please\s+yaar|pls\s+yaar|bhai\s+please|yaar\s+please)[,\s]+/i,
    /^(?:mujhe\s+)?(?:aaj|kal|parso)?\s*(?:subah|shaam|dopahar|raat)?\s*(?:ko)?\s*(?:ek\s+)?task\s+(?:bana\s+(?:do|o)|add\s+(?:karo|kar\s+do)|create\s+(?:karo|kar\s+do))\s*/i,
    /^mujhe\s+/i,
    /^(?:yaad\s+(?:dilana|dila\s+do|rakhna))\s+(?:ki\s+)?/i,
    /^(?:ek\s+kaam|ek\s+task|mere\s+liye|meri\s+help)[,\s]+/i,
    /^(?:padhai|padhna|likhna)\s+(?:ka\s+|ki\s+)?(?:task|kaam|reminder)\s*/i,
  ];

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const pat of commandPrefixes) {
      if (pat.test(t)) {
        t = t.replace(pat, '').trim();
        changed = true;
        break;
      }
    }
  }

  // 3. Gerund-to-imperative action verb normalization
  const GERUNDS: Record<string, string> = {
    submitting: 'submit', studying: 'study', calling: 'call', buying: 'buy',
    paying: 'pay', sending: 'send', scheduling: 'schedule', revising: 'revise',
    writing: 'write', reading: 'read', booking: 'book', cleaning: 'clean',
    practicing: 'practice', checking: 'check', meeting: 'meet', fixing: 'fix',
    working: 'work', cooking: 'cook', attending: 'attend', completing: 'complete',
    finishing: 'finish', preparing: 'prepare', ordering: 'order', learning: 'learn',
    visiting: 'visit', taking: 'take', doing: 'do', going: 'go', watching: 'watch',
    deploying: 'deploy', reviewing: 'review', organizing: 'organize', printing: 'print',
    updating: 'update', renewing: 'renew', canceling: 'cancel', cancelling: 'cancel',
    exercising: 'exercise', washing: 'wash', ironing: 'iron', emailing: 'email',
    messaging: 'message', texting: 'text', dropping: 'drop', picking: 'pick',
    collecting: 'collect', downloading: 'download', uploading: 'upload', installing: 'install',
    uninstalling: 'uninstall', testing: 'test', debugging: 'debug', discussing: 'discuss',
    presenting: 'present', tracking: 'track', logging: 'log', registering: 'register',
    applying: 'apply', filing: 'file', signing: 'sign', verifying: 'verify',
    confirming: 'confirm', informing: 'inform', notifying: 'notify', contacting: 'contact',
    following: 'follow', researching: 'research', solving: 'solve', building: 'build',
    designing: 'design', drafting: 'draft', editing: 'edit', sharing: 'share',
    returning: 'return', reporting: 'report', joining: 'join', packing: 'pack',
    charging: 'charge', backing: 'back', saving: 'save', archiving: 'archive',
    exporting: 'export',
  };

  const firstWordMatch = t.match(/^([a-zA-Z]+)(.*)$/s);
  if (firstWordMatch) {
    const fw = firstWordMatch[1].toLowerCase();
    if (GERUNDS[fw]) {
      t = `${GERUNDS[fw]}${firstWordMatch[2]}`;
    }
  }

  t = t.replace(/^(?:to|for|about|of|regarding|that|a|an|the)\s+/i, '').trim();

  // 4. Hinglish & Inverted action normalization
  const hinglishVerbReversal = t.match(/^(.+?)\s+(submit|complete|finish|pay|clean|check|update|fix|verify|revise|study|read|write|deploy|book|buy|order)\s+(?:karna|krna|karni|krni|kar\s+dena|kar\s+do|karo)(?:\s+(?:hai|h))?$/i);
  if (hinglishVerbReversal) {
    t = `${hinglishVerbReversal[2]} ${hinglishVerbReversal[1]}`.trim();
  }

  // English Inverted SOV-to-SVO normalization
  const sovPatterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^(.+?)\s+study$/i, m => m[1].toLowerCase() !== 'case' ? `study ${m[1]}` : m[0]],
    [/^(.+?)\s+practice$/i, m => `practice ${m[1]}`],
    [/^(.+?)\s+(?:revision|revise)$/i, m => `revise ${m[1]}`],
    [/^(.+?)\s+(?:prep|preparation)$/i, m => `prep for ${m[1]}`],
    [/^(.+?)\s+(?:submission|submit)$/i, m => `submit ${m[1]}`],
    [/^(.+?)\s+(?:payment|pay)$/i, m => `pay ${m[1]}`],
    [/^(.+?)\s+(?:booking|book)$/i, m => `book ${m[1]}`],
    [/^(.+?)\s+(?:cleaning|clean)$/i, m => `clean ${m[1]}`],
    [/^(.+?)\s+(?:washing|wash)$/i, m => `wash ${m[1]}`],
    [/^(.+?)\s+(?:buying|buy)$/i, m => `buy ${m[1]}`],
    [/^(.+?)\s+(?:calling|call)$/i, m => `call ${m[1]}`],
    [/^(.+?)\s+(?:reviewing|review)$/i, m => `review ${m[1]}`],
    [/^(.+?)\s+(?:scheduling|schedule)$/i, m => `schedule ${m[1]}`],
    [/^(.+?)\s+(?:sending|send)$/i, m => `send ${m[1]}`],
    [/^(.+?)\s+(?:ordering|order)$/i, m => `order ${m[1]}`],
    [/^(.+?)\s+(?:deploying|deploy)$/i, m => `deploy ${m[1]}`],
  ];

  for (const [pat, replacer] of sovPatterns) {
    const sm = t.match(pat);
    if (sm) {
      t = replacer(sm);
      break;
    }
  }

  // 5. Deduplicate repeated speech phrases, stuttered utterances & trailing duplicate metadata
  const phraseDedupe = (str: string): string => {
    let s = str.trim();
    s = s.replace(/\b(?:high|medium|low)\s+priority\b/gi, '');
    s = s.replace(/\bpriority\s+(?:high|medium|low|urgent|p[123])\b/gi, '');
    s = s.replace(/\b(?:today|tomorrow|tommorow|tomorow|tommorrow|tmrw|tmr|tonight|yesterday)\b/gi, '');
    s = s.replace(/\b\d{1,2}(?::\d{2})?\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '');
    s = s.replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '');

    for (let len = 6; len >= 2; len--) {
      const pattern = new RegExp(`\\b((?:[\\w'-]+\\s+){${len - 1}}[\\w'-]+)(?:\\s+\\1\\b)+`, 'gi');
      s = s.replace(pattern, '$1');
    }
    s = s.replace(/\b([a-zA-Z]{3,})\s+\1\b/gi, '$1');
    return s.replace(/\s+/g, ' ').trim();
  };
  t = phraseDedupe(t);

  // Pronoun & Determiner Simplification
  t = t.replace(/\bcall\s+my\s+(mom|dad|mother|father|mummy|papa|parents|brother|sister|bro|sis)\b/i, 'call $1');
  t = t.replace(/\bclean\s+my\s+room\b/i, 'clean room');
  t = t.replace(/\bpick\s+up\s+my\s+/i, 'pick up ');
  t = t.replace(/\bbuy\s+some\s+/i, 'buy ');
  t = t.replace(/\bdo\s+my\s+laundry\b/i, 'wash laundry');

  // Strip conversational / voice filler clauses
  t = t.replace(/\s+(?:dena|deni|bhejna|bhejni|lena|leni|jana|aana|khatam\s+karna)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:karna|krna|karni|krni)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:kar\s+dena|kar\s+lena|de\s+dena|kar\s+do|karo)$/i, '').trim();
  t = t.replace(/\s+(?:task|todo|to-do|item|reminder)(?:\s+(?:for|to|at|on|about))?(?:\s+(?:everyday|daily|each\s+day|today|tomorrow|tmrw|tmr))?$/i, '').trim();
  t = t.replace(/\s+(?:for\s+everyday|for\s+daily|everyday|daily)$/i, '').trim();
  t = t.replace(/\s+(?:shaam\s+ko|sham\s+ko|shaam|sham|subah\s+ko|subah|dopahar\s+ko|dopahar|raat\s+ko|raat)$/i, '').trim();
  t = t.replace(/\s+with\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|buzz|ping|bell|chime|sound|vibration|notify|toast|pop.?up|snooze|push\s+notification)s?$/i, '').trim();
  t = t.replace(/\s+(?:with\s+)?(?:set(?:\s+an?)?\s+)?(?:alarm|reminder|alert|notification)\s+(?:for|at|on|to)\s*$/i, '').trim();
  t = t.replace(/\s+and\s+(?:remind\s+(?:me\s+)?(?:to\s+|about\s+)?|set\s+(?:a[n]?\s+)?(?:alarm|reminder)|notify\s+(?:me\s+)?)$/i, '').trim();
  t = t.replace(/\s+at\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)+$/i, '').trim();
  t = t.replace(/\s+(?:today|tomorrow|tonight|aaj|kal|parso|tmrw|tmr)$/i, '').trim();
  t = t.replace(/\s+(?:by|around|sharp|at|on|for|due)\s*$/i, '').trim();
  t = t.replace(/\s+(?:right\s+now|at\s+the\s+earliest|on\s+urgent\s+basis|urgent\s+basis)$/i, '').trim();

  // Multi-pass trailing connector, preposition & punctuation scrubber
  let trailChanged = true;
  let trailPasses = 0;
  while (trailChanged && trailPasses < 6) {
    trailChanged = false;
    trailPasses++;
    const prev = t;
    t = t.replace(/^[\s,.:;—\-_/\\|~`!@#$%^&*()+=<>?]+|[\s,.:;—\-_/\\|~`!@#$%^&*()+=<>?]+$/g, '').trim();
    t = t.replace(/\s+(?:at|from|to|by|on|in|for|with|until|till|and|or|during|of|about|then|also)$/i, '').trim();
    t = t.replace(/\s+(?:please|pls|as\s+well|too|for\s+me|bhai|yaar|bro|dude|na|karo|do|h|hai)$/i, '').trim();
    t = t.replace(/\s+(?:if\s+possible|as\s+soon\s+as\s+possible|right\s+now|or\s+something|you\s+know|at\s+the\s+earliest)$/i, '').trim();
    t = t.replace(/\s+(?:[ap]\.?m\.?|am|pm|o'?clock)$/i, '').trim();
    t = t.replace(/\s+(?:in\s+the\s+)?(?:early\s+morning|morning|afternoon|evening|night|tonight|today|tomorrow|yesterday)$/i, '').trim();
    t = t.replace(/\s+(?:hi|high|medium|mid|low)\s+(?:priority|prio|importance)$/i, '').trim();
    t = t.replace(/\s+priority\s*(?:is\s+|:\s*|\s+)?(?:hi|high|medium|mid|low|1|2|3|one|two|three)$/i, '').trim();
    t = t.replace(/\s+(?:p:hi|p:high|p:med|p:low|!1|!2|!3|p1|p2|p3|hi)$/i, '').trim();
    t = t.replace(/\s+(?:urgent|asap|important|critical|fire|blocker)$/i, '').trim();
    t = t.replace(/^[\s,.:;—\-_/\\|~`!@#$%^&*()+=<>?]+|[\s,.:;—\-_/\\|~`!@#$%^&*()+=<>?]+$/g, '').trim();
    if (t !== prev) trailChanged = true;
  }

  t = t.replace(/\s*,\s*,+/g, ', ');
  t = t.replace(/\s{2,}/g, ' ').trim();

  // Acronym & Brand dictionary
  const ACRONYMS: Record<string, string> = {
    dsa: 'DSA', dbms: 'DBMS', os: 'OS', ai: 'AI', ml: 'ML', dl: 'DL',
    nlp: 'NLP', cn: 'CN', oop: 'OOP', oops: 'OOPs', sql: 'SQL', nosql: 'NoSQL',
    api: 'API', apis: 'APIs', html: 'HTML', css: 'CSS', js: 'JS', ts: 'TS',
    pr: 'PR', prs: 'PRs', sde: 'SDE', hr: 'HR', ui: 'UI', ux: 'UX',
    pdf: 'PDF', llm: 'LLM', llms: 'LLMs', cgpa: 'CGPA', sgpa: 'SGPA',
    aws: 'AWS', gcp: 'GCP', toc: 'TOC', ppl: 'PPL', hiit: 'HIIT',
    '1rm': '1RM', bmi: 'BMI', vad: 'VAD', rest: 'REST', crud: 'CRUD',
    sdk: 'SDK', sdks: 'SDKs', cli: 'CLI', ci: 'CI', cd: 'CD', cicd: 'CI/CD',
    iot: 'IoT', ip: 'IP', vpn: 'VPN', url: 'URL', urls: 'URLs',
    bldc: 'BLDC', tv: 'TV', ev: 'EV', dc: 'DC', ac: 'AC',
    json: 'JSON', jwt: 'JWT', ssh: 'SSH', ssl: 'SSL', tls: 'TLS',
    dns: 'DNS', http: 'HTTP', https: 'HTTPS', ftp: 'FTP', ide: 'IDE',
    gui: 'GUI', seo: 'SEO', mvp: 'MVP', kpi: 'KPI', okr: 'OKR', okrs: 'OKRs',
    leetcode: 'LeetCode', gfg: 'GFG', codeforces: 'Codeforces', codechef: 'CodeChef',
    nptel: 'NPTEL', neet: 'NEET', gate: 'GATE', cat: 'CAT', upsc: 'UPSC',
    iit: 'IIT', nit: 'NIT', bits: 'BITS', gre: 'GRE', toefl: 'TOEFL',
    whatsapp: 'WhatsApp', youtube: 'YouTube', instagram: 'Instagram',
    linkedin: 'LinkedIn', github: 'GitHub', gitlab: 'GitLab', figma: 'Figma',
    vscode: 'VS Code', nextjs: 'Next.js', react: 'React', nodejs: 'Node.js',
    mongodb: 'MongoDB', docker: 'Docker', postman: 'Postman', slack: 'Slack',
    notion: 'Notion', spotify: 'Spotify', gmail: 'Gmail', zoom: 'Zoom',
  };

  const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with']);
  const words = t.split(/\s+/);
  const formattedWords = words.map((w, idx) => {
    const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ACRONYMS[cleanWord]) {
      return w.replace(new RegExp(cleanWord, 'i'), ACRONYMS[cleanWord]);
    }
    if (/^\d/.test(w)) return w;
    if (w.length > 0 && (idx === 0 || !MINOR_WORDS.has(w.toLowerCase()))) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }
    return w.toLowerCase();
  });

  t = formattedWords.join(' ').trim();
  return t || rawTitle.trim();
}

/**
 * Normalizes common voice transcription homophones and speech-to-text artifacts
 */
export function normalizeVoiceTranscript(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  text = text.replace(/\b(?:with\s+)?hi\s+(?:priority|prio|importance)\b/gi, 'high priority');
  text = text.replace(/\bpriority\s+(?:is\s+|:\s*)?hi\b/gi, 'priority high');
  text = text.replace(/\bp:\s*hi\b/gi, 'p:high');
  text = text.replace(/\bmark\s+(?:as\s+)?hi\b/gi, 'mark as high');
  text = text.replace(/\bmake\s+(?:it\s+)?hi\b/gi, 'make it high');
  text = text.replace(/\bset\s+(?:to\s+)?hi\b/gi, 'set to high');
  text = text.replace(/\bhi\s+prio\b/gi, 'high priority');
  text = text.replace(/\bhigh\s+prio\b/gi, 'high priority');
  text = text.replace(/\bmed\s+prio\b/gi, 'medium priority');
  text = text.replace(/\blow\s+prio\b/gi, 'low priority');

  text = text.replace(/\bpriority\s+one\b/gi, 'priority 1');
  text = text.replace(/\bpriority\s+two\b/gi, 'priority 2');
  text = text.replace(/\bpriority\s+three\b/gi, 'priority 3');

  text = text.replace(/(\b(?:at\s+\d{1,2}(?::\d{2})?(?:am|pm)?|\d{1,2}(?::\d{2})?(?:am|pm)|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+hi\b/gi, '$1 high');
  text = text.replace(/\s+hi$/i, ' high');

  return text;
}

/**
 * Formats a RecurrenceRule into a concise, human-friendly label.
 */
export function formatRecurrenceLabel(rule?: { type?: string; interval?: number; daysOfWeek?: number[] } | null): string {
  if (!rule) return 'Does not repeat';
  if (rule.type === 'daily') return 'Daily';
  if (rule.type === 'weekly') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const sorted = [...rule.daysOfWeek].sort((a, b) => a - b);
      if (sorted.length === 6 && sorted.every((d, i) => d === i + 1)) {
        return 'Mon – Sat';
      }
      if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
        return 'Weekdays (Mon – Fri)';
      }
      if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) {
        return 'Weekends';
      }
      if (sorted.length <= 3) {
        return sorted.map(d => dayNames[d]).join(', ');
      }
      return `${sorted.length} days/wk`;
    }
    return 'Weekly';
  }
  if (rule.type === 'monthly') return 'Monthly';
  if (rule.type === 'custom') return `Every ${rule.interval || 1}d`;
  return rule.type ? rule.type.charAt(0).toUpperCase() + rule.type.slice(1) : 'Does not repeat';
}

/**
 * Master Natural Language Task Parser
 */
export function parseNLTask(rawInput: string): ParsedTask {
  const now = new Date();

  const raw = (rawInput || '')
    // Normalise a.m./p.m. dot forms → am/pm
    .replace(/\b([ap])\s*\.\s*m\s*\.?(?=\s|[.,;:!?]|$)/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*\.\s*m\b/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*m\s*\./gi, (m, p1) => p1.toLowerCase() + 'm')
    // Fix spaced colon: "4: 30 am" or "4 : 30am" → "4:30am"
    .replace(/(\d{1,2})\s*:\s*(\d{2})/g, '$1:$2')
    // "9.30pm" → "9:30pm" (dot as time separator)
    .replace(/(\d{1,2})\.(\d{2})\s*(am|pm)\b/gi, '$1:$2$3')
    // Fix compact time: "1230am" / "1030 pm" → "12:30am" / "10:30pm"
    .replace(/\b(1[0-2])(\d{2})\s*(am|pm)\b/gi, '$1:$2$3')
    // 3-digit: "430am" / "900 pm" → "4:30am" / "9:00pm"
    .replace(/\b([1-9])(\d{2})\s*(am|pm)\b/gi, '$1:$2$3');

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

  function registerToken(type: NLPToken['type'], matchStr: string, display: string, knownIdx?: number) {
    const idx = knownIdx !== undefined ? knownIdx : text.toLowerCase().indexOf(matchStr.toLowerCase());
    if (idx === -1 || idx + matchStr.length > text.length) return;
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

  // Spoken Tags ("tag work", "label gym", "hashtag study")
  {
    const spokenTagRe = /\b(?:tags?|labels?|hashtag)\s*[:\-]?\s*([a-zA-Z][a-zA-Z0-9_-]*(?:\s*,\s*[a-zA-Z][a-zA-Z0-9_-]*)*)\b/gi;
    let stm: RegExpExecArray | null;
    while ((stm = spokenTagRe.exec(text)) !== null) {
      const tagList = stm[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const t of tagList) {
        if (!extractedTags.includes(t)) extractedTags.push(t);
      }
      registerToken('tag', stm[0], tagList.map(t => `#${t}`).join(' '));
    }
  }

  // Subtasks & embedded checklists
  const extractedSubtasks: string[] = [];
  {
    const subtaskRe = /\b(?:with\s+subtasks?|subtasks?\s*(?:are|include)?|sub-tasks?\s*(?:are|include)?|checklist|with\s+items?|including(?:\s+items?)?|todo\s+list|steps?(?:\s+to\s+take)?)\s*[:\-]?\s*([^.]+?)(?=\s*(?:\b(?:tomorrow|today|tonight|next|every|at\s+\d|am|pm|high|medium|low|p1|p2|p3|urgent|#|\.|$)))/i;
    let sm = text.match(subtaskRe);
    if (!sm) {
      const bracketListRe = /\[([a-zA-Z0-9\s,\-_*•]+)\]/;
      sm = text.match(bracketListRe);
    }
    if (!sm) {
      const colonListRe = /(?:(?<!\d):(?!\d)|\s+namely\s+)\s*([a-zA-Z0-9\s,\-_*•]+(?:,\s*(?:and\s+)?[a-zA-Z0-9\s\-_*•]+|\s+and\s+[a-zA-Z0-9\s\-_*•]+))(?=\s*(?:\b(?:tomorrow|today|tonight|next|every|at\s+\d|am|pm|high|medium|low|p1|p2|p3|urgent|#|\.|$)))/i;
      sm = text.match(colonListRe);
    }
    if (sm) {
      const rawSubtasks = (sm[1] || sm[0]).replace(/^[\[\]:\s]+|[\[\]:\s]+$/g, '').trim();
      const items = rawSubtasks
        .split(/(?:,\s*(?:and\s+)?|\s+and\s+|\s*;\s*|(?:^|\s+)\d+[\.\)]\s*)/i)
        .map(s => s.trim().replace(/^[\-•*]\s*/, ''))
        .filter(s => s.length > 0 && !/^(?:tomorrow|today|tonight|next|every|at|high|medium|low|urgent|priority)$/i.test(s));
      if (items.length > 1 || (items.length === 1 && items[0].length >= 2)) {
        extractedSubtasks.push(...items);
        registerToken('subtask', sm[0], `${items.length} Subtasks`);
      }
    }
  }

  // Location Trigger
  let locationReminder: any = null;
  let locationName: string | undefined = undefined;
  {
    const locRe = /\b(?:at|in|near)\s+(?:the\s+)?(gym|fitness\s+center|campus|college|university|library|hostel|lab|office|work|home|market|clinic|hospital)\b/i;
    const lm = text.match(locRe);
    if (lm) {
      const rawLoc = lm[1].trim();
      const capitalized = rawLoc.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      locationName = capitalized;
      locationReminder = { placeName: capitalized, triggerType: 'arrive', radius: 150 };
      registerToken('location', lm[0], `📍 ${capitalized}`);
    }
  }

  // Reminder intent
  let isReminder = false;
  const reminderPatterns = [
    /\bwith\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|buzz|ping|bell|chime|sound|vibration|push\s+notification)s?\b/i,
    /\bset\s+(?:a(?:n)?\s+)?(?:alarm|reminder)(?:\s+(?:for|at|to))?\b/i,
    /\band\s+(?:set\s+(?:a[n]?\s+)?(?:alarm|reminder)|remind\s+(?:me\s+)?(?:to\s+|about\s+)?|notify\s+(?:me\s+)?)\b/i,
    /\b(?:remind(?:\s+me)?(?:\s+(?:to|about|for|at))?|reminder(?:\s+(?:for|to|about|at))?)\b/i,
    /\balarm(?:\s+(?:for|at|on))?\b/i,
    /\b(?:mujhe\s+yaad\s+dilana|yaad\s+dilana|yaad\s+rakhna)\b/i,
  ];
  for (const pat of reminderPatterns) {
    const m = text.match(pat);
    if (m) {
      isReminder = true;
      registerToken('reminder', m[0], '⏰ Reminder');
    }
  }

  // 1. PRIORITY
  const priorityPatterns: Array<[RegExp, 'high' | 'medium' | 'low', string]> = [
    [/\bp:(?:high|hi|1|urgent|critical)\b/i,                                              'high',   'High'],
    [/\bp:(?:medium|mid|2|normal|med)\b/i,                                               'medium', 'Medium'],
    [/\bp:(?:low|3|someday|whenever)\b/i,                                                'low',    'Low'],
    [/\b!1\b/,                                                                           'high',   'High'],
    [/\b!2\b/,                                                                           'medium', 'Medium'],
    [/\b!3\b/,                                                                           'low',    'Low'],
    [/🔴|❗|🚨/,                                                                            'high',   'High'],
    [/🟡|⚠️|⏰/,                                                                            'medium', 'Medium'],
    [/🟢|✅|💤/,                                                                            'low',    'Low'],
    [/\b(?:priority\s*(?:is\s+|:\s*|\s+)?(?:high|hi|1|one|highest|top))\b/i,            'high',   'High'],
    [/\b(?:priority\s*(?:is\s+|:\s*|\s+)?(?:medium|mid|med|2|two|normal))\b/i,          'medium', 'Medium'],
    [/\b(?:priority\s*(?:is\s+|:\s*|\s+)?(?:low|3|three|minimum|lowest))\b/i,           'low',    'Low'],
    [/\b(?:(?:mark\s+as\s+|set\s+(?:to\s+)?)?(?:high|hi)\s+(?:priority|prio|importance))\b/i, 'high',   'High'],
    [/\b(?:(?:mark\s+as\s+|set\s+(?:to\s+)?)?(?:medium|mid|med)\s+(?:priority|prio|importance))\b/i, 'medium', 'Medium'],
    [/\b(?:(?:mark\s+as\s+|set\s+(?:to\s+)?)?(?:low)\s+(?:priority|prio|importance))\b/i, 'low',    'Low'],
    [/\b(urgent|critical|asap|p1|fire|blocker|top\s+priority|highest\s+priority|max\s+priority|super\s+important|crucial|vital|must\s+do)\b/i, 'high', 'High'],
    [/\b(important|p2|kinda\s+important|semi.?urgent|normal\s+priority)\b/i,             'medium', 'Medium'],
    [/\b(p3|someday|whenever|not\s+urgent|low\s+key|no\s+rush|chill|when\s+free)\b/i,     'low',    'Low'],
  ];
  for (const [pat, pri, label] of priorityPatterns) {
    const m = text.match(pat);
    if (m) { priority = pri; registerToken('priority', m[0], label); break; }
  }

  // 2. DURATION
  const durationPatterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\bhalf\s+an?\s+hour\b/i,                                             _ => 30],
    [/\ban?\s+hour\s+and\s+a\s+half\b/i,                                  _ => 90],
    [/\b(\d+)\s+and\s+a\s+half\s+hours?\b/i,                             m => parseInt(m[1], 10) * 60 + 30],
    [/\ba\s+couple\s+(?:of\s+)?hours?\b/i,                                _ => 120],
    [/\bcouple\s+(?:of\s+)?hours?\b/i,                                    _ => 120],
    [/\ba\s+few\s+hours?\b/i,                                              _ => 180],
    [/\ban?\s+hour\s*(?:block|session)?\b/i,                              _ => 60],
    [/\ba\s+few\s+minutes?\b/i,                                           _ => 10],
    [/\b(\d+(?:\.\d+)?)\s*h(?:(?:ou)?rs?)?\s*(?:block|time\s*block|time|session)?\b/i, m => Math.round(parseFloat(m[1]) * 60)],
    [/\b(\d+)\s*(?:hours?|hrs?|hr)\s*(?:block|time\s*block|time|session)?\b/i,          m => parseInt(m[1], 10) * 60],
    [/\bblock\s*(?:of\s*|time\s*(?:of\s*)?)?(\d+)\s*(?:hours?|hrs?|h)\b/i,               m => parseInt(m[1], 10) * 60],
    [/\bfor\s+(\d+)\s*h(?:(?:ou)?rs?)?\s+(\d+)\s*m(?:in(?:utes?)?)?\b/i, m => parseInt(m[1], 10) * 60 + parseInt(m[2], 10)],
    [/\bfor\s+(\d+)\s*h(\d{2})\b/i,                                        m => parseInt(m[1], 10) * 60 + parseInt(m[2], 10)],
    [/\bfor\s+(\d+)\s*h(?:(?:ou)?rs?)?\b/i,                               m => parseInt(m[1], 10) * 60],
    [/\bfor\s+(\d+)\s*m(?:in(?:utes?)?)?\b/i,                             m => parseInt(m[1], 10)],
    [/\bfor\s+(\d+)\s+hours?\b/i,                                          m => parseInt(m[1], 10) * 60],
    [/\bfor\s+(\d+)\s+minutes?\b/i,                                        m => parseInt(m[1], 10)],
    [/\b(\d+)\s*(?:minutes?|mins?|min)\s*(?:block|time\s*block|session)?\b/i,            m => parseInt(m[1], 10)],
    [/\b(\d+)h(\d+)m\b/i,                                                  m => parseInt(m[1], 10) * 60 + parseInt(m[2], 10)],
    [/\b(\d+)h\b(?!\d)/i,                                                  m => parseInt(m[1], 10) * 60],
    [/\b(\d+)min\b/i,                                                       m => parseInt(m[1], 10)],
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

  // 3. RECURRENCE & MULTI-DAY
  const getDayIdx = (s: string) => {
    s = s.toLowerCase();
    let idx = DAY_NAMES.findIndex(d => s.startsWith(d));
    if (idx !== -1) return idx;
    return DAY_SHORT.findIndex(d => s.startsWith(d));
  };
  const dayRegexStr = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)s?';
  const dayToken = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)s?';

  const multiDayListPat = new RegExp(`(${dayToken}(?:\\s*(?:,|and|&)\\s*${dayToken})+)`, 'i');

  const everyMultiMatch = text.match(
    new RegExp(`\\bevery\\s+(${dayToken}(?:\\s*(?:,|and|&)\\s*${dayToken}){2,})\\b`, 'i')
  );

  const thisMultiMatch = !everyMultiMatch
    ? text.match(new RegExp(`\\b(?:only\\s+)?this\\s+(${dayToken}(?:\\s*(?:,|and|&)\\s*${dayToken})+)\\b`, 'i'))
    : null;

  const bareMultiMatch = !everyMultiMatch && !thisMultiMatch
    ? (() => {
        const m = text.match(multiDayListPat);
        if (!m) return null;
        const matchStart = text.indexOf(m[0]);
        const before = text.slice(0, matchStart).trimEnd().toLowerCase();
        if (before.endsWith('every') || before.endsWith('daily') || before.endsWith('from')) return null;
        const days = extractDayListFromText(m[0]);
        return days.length >= 3 ? m : null;
      })()
    : null;

  let oneTimeDates: string[] | undefined;

  if (everyMultiMatch) {
    const dayList = extractDayListFromText(everyMultiMatch[1]);
    if (dayList.length >= 2) {
      isRecurring = true;
      recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [...dayList].sort((a, b) => a - b) };
      dateResult = nextWeekday(dayList[0]);
      const labels = dayList
        .sort((a, b) => a - b)
        .map(di => DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1, 3));
      const fullSpan = text.slice(
        text.toLowerCase().indexOf('every'),
        text.toLowerCase().indexOf('every') + 'every'.length + 1 + everyMultiMatch[1].length
      ).trim() || `every ${everyMultiMatch[1]}`;
      registerToken('recurrence', fullSpan, `${labels.join(', ')} (Weekly)`);
    }
  } else if (thisMultiMatch) {
    const dayList = extractDayListFromText(thisMultiMatch[1]);
    if (dayList.length >= 2) {
      const sortedDays = [...dayList].sort((a, b) => a - b);
      const dates = sortedDays.map(di => toYMD(thisWeekDate(di)));
      oneTimeDates = dates;
      dateResult = thisWeekDate(sortedDays[0]);
      isRecurring = false;
      const labels = sortedDays.map(di => {
        const d = thisWeekDate(di);
        const dayName = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1, 3);
        return `${dayName} ${d.getDate()}`;
      });
      registerToken('date', thisMultiMatch[0], `${labels.join(', ')} (This Week)`);
    }
  } else if (bareMultiMatch) {
    const dayList = extractDayListFromText(bareMultiMatch[0]);
    if (dayList.length >= 3) {
      const sortedDays = [...dayList].sort((a, b) => a - b);
      const dates = sortedDays.map(di => toYMD(thisWeekDate(di)));
      oneTimeDates = dates;
      dateResult = thisWeekDate(sortedDays[0]);
      isRecurring = false;
      const labels = sortedDays.map(di => {
        const d = thisWeekDate(di);
        return `${DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1, 3)} ${d.getDate()}`;
      });
      registerToken('date', bareMultiMatch[0], `${labels.join(', ')} (This Week)`);
    }
  }

  // Range patterns
  const rangePat = new RegExp(`\\b(?:(?:daily|everyday|every)\\s+)?(?:from\\s+)?${dayRegexStr}\\s+(?:to|-|through|till|until)\\s+${dayRegexStr}\\b`, 'i');
  const andPat   = new RegExp(`\\b(?:(?:daily|everyday|every)\\s+)?(?:from\\s+)?${dayRegexStr}\\s+(?:and|&)\\s+${dayRegexStr}\\b`, 'i');
  const rm = !isRecurring && !oneTimeDates ? text.match(rangePat) : null;
  const am = !isRecurring && !oneTimeDates ? text.match(andPat) : null;

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
      isRecurring = true;
      recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days.sort((a, b) => a - b) };
      dateResult = nextWeekday(start);
      const sLbl = DAY_NAMES[start]?.charAt(0).toUpperCase() + DAY_NAMES[start]?.slice(1, 3);
      const eLbl = DAY_NAMES[end]?.charAt(0).toUpperCase() + DAY_NAMES[end]?.slice(1, 3);
      registerToken('recurrence', rm[0], `${sLbl} – ${eLbl} (Weekly)`);
    }
  } else if (am) {
    const d1 = getDayIdx(am[1]);
    const d2 = getDayIdx(am[2]);
    if (d1 !== -1 && d2 !== -1) {
      const days = [d1, d2].sort((a, b) => a - b);
      isRecurring = true;
      recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: days };
      dateResult = nextWeekday(days[0]);
      const l1 = DAY_NAMES[d1]?.charAt(0).toUpperCase() + DAY_NAMES[d1]?.slice(1, 3);
      const l2 = DAY_NAMES[d2]?.charAt(0).toUpperCase() + DAY_NAMES[d2]?.slice(1, 3);
      registerToken('recurrence', am[0], `${l1} & ${l2}`);
    }
  } else if (/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] };
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], 'Weekdays');
  } else if (/\b(every\s*day|daily|each\s+day)\b/i.test(text)) {
    const m = text.match(/\b(every\s*day|daily|each\s+day)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'daily', interval: 1 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Daily');
  } else if (/\b(every\s+weekend|weekends)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekend|weekends)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [0, 6] };
    dateResult = nextWeekday(6);
    registerToken('recurrence', m[0], 'Weekends');
  } else if (/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week|every\s+alternate\s+week|alternate\s+weeks?)\b/i.test(text)) {
    const m = text.match(/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week|every\s+alternate\s+week|alternate\s+weeks?)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 2 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Fortnightly');
  } else if (/\b(quarterly|every\s+quarter|every\s+3\s+months)\b/i.test(text)) {
    const m = text.match(/\b(quarterly|every\s+quarter|every\s+3\s+months)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'monthly', interval: 3 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Quarterly');
  } else if (/\b(annually|yearly|every\s+year)\b/i.test(text)) {
    const m = text.match(/\b(annually|yearly|every\s+year)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'monthly', interval: 12 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Yearly');
  } else if (/\btwice\s+a\s+week\b/i.test(text)) {
    const m = text.match(/\btwice\s+a\s+week\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1, 4] };
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], 'Twice a Week');
  } else if (/\bthree\s+times\s+a\s+week\b/i.test(text)) {
    const m = text.match(/\bthree\s+times\s+a\s+week\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] };
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], '3x a Week');
  } else if (/\b(every\s+morning|every\s+day\s+morning|morning\s+routine)\b/i.test(text)) {
    const m = text.match(/\b(every\s+morning|every\s+day\s+morning|morning\s+routine)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'daily', interval: 1 };
    dateResult = new Date(now);
    if (!timeSlot) timeSlot = '09:00';
    registerToken('recurrence', m[0], 'Every Morning');
  } else if (/\b(every\s+evening|every\s+night|nightly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+evening|every\s+night|nightly)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'daily', interval: 1 };
    dateResult = new Date(now);
    if (!timeSlot) timeSlot = '21:00';
    registerToken('recurrence', m[0], 'Every Evening');
  } else if (/\b(every\s+week|weekly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+week|weekly)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: 1 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Weekly');
  } else if (/\b(every\s+month|monthly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+month|monthly)\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'monthly', interval: 1 };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Monthly');
  } else if (/\bevery\s+(\d+)\s+days?\b/i.test(text)) {
    const m = text.match(/\bevery\s+(\d+)\s+days?\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'daily', interval: parseInt(m[1], 10) };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], `Every ${m[1]} Days`);
  } else if (/\bevery\s+(\d+)\s+weeks?\b/i.test(text)) {
    const m = text.match(/\bevery\s+(\d+)\s+weeks?\b/i)!;
    isRecurring = true;
    recurrenceRule = { type: 'weekly', interval: parseInt(m[1], 10) };
    dateResult = new Date(now);
    registerToken('recurrence', m[0], `Every ${m[1]} Weeks`);
  } else if (!isRecurring) {
    const everyOtherPat = new RegExp(`\\bevery\\s+other\\s+${dayRegexStr}\\b`, 'i');
    const eom = text.match(everyOtherPat);
    if (eom) {
      const di = getDayIdx(eom[1]);
      if (di !== -1) {
        isRecurring = true;
        recurrenceRule = { type: 'weekly', interval: 2, daysOfWeek: [di] };
        dateResult = nextWeekday(di);
        const lbl = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
        registerToken('recurrence', eom[0], `Every Other ${lbl}`);
      }
    }

    if (!isRecurring) {
      for (let di = 0; di < DAY_NAMES.length; di++) {
        const dn = DAY_NAMES[di], ds = DAY_SHORT[di];
        const pat = new RegExp(`\\bevery\\s+(${dn}s?|${ds}s?)\\b`, 'i');
        const m = text.match(pat);
        if (m) {
          isRecurring = true;
          recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [di] };
          dateResult = nextWeekday(di);
          const label = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
          registerToken('recurrence', m[0], `Every ${label}`);
          break;
        }
      }
    }
  }

  // 4. TIME (RANGES + SINGLE + HINGLISH BAJE + NAMED)
  if (!timeSlot) {
    const rangePattern = /\b(?:at\s+|from\s+|between\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\s*(?:to|-|until|till|through)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/i;
    const rangeMatch = text.match(rangePattern);

    if (rangeMatch) {
      const h1Num = parseInt(rangeMatch[1], 10);
      const h2Num = parseInt(rangeMatch[4], 10);
      const isValidHour = (n: number) => n >= 0 && n <= 23;
      const hasAmPm = rangeMatch[3] || rangeMatch[6];
      const hasColon = rangeMatch[2] || rangeMatch[5];
      const hasKeyword = /^(?:at|from|between)\s/i.test(rangeMatch[0]);
      const isUnambiguousHourRange = h1Num >= 1 && h1Num <= 12 && h2Num >= 1 && h2Num <= 12;
      const _matchIdx = text.indexOf(rangeMatch[0]);
      const _precedingText = _matchIdx > 0 ? text.slice(0, _matchIdx).trimEnd().toLowerCase() : '';
      const isCountContext = /\b(?:pages?|chapters?|problems?|questions?|exercises?|slides?|sections?|items?|no\.?|q\.?|ex\.?|\d+)\s*$/.test(_precedingText);
      if (!isCountContext && (hasAmPm || hasColon || hasKeyword || (isValidHour(h1Num) && isValidHour(h2Num) && isUnambiguousHourRange))) {
        const rawP2 = (rangeMatch[6] || '').toLowerCase().replace(/[^a-z]/g, '');
        const rawP1 = (rangeMatch[3] || '').toLowerCase().replace(/[^a-z]/g, '');
        let p2 = rawP2 || rawP1 || '';
        let p1 = rawP1 || (p2 && h1Num < 12 ? p2 : '');

        if (!p1 && !p2) {
          const hasEve = /\b(?:evening|shaam|sham|night|raat|afternoon|dopahar)\b/i.test(text);
          const hasMorn = /\b(?:morning|subah)\b/i.test(text);
          if (hasEve) { p1 = 'pm'; p2 = 'pm'; }
          else if (hasMorn) { p1 = 'am'; p2 = 'am'; }
          else if (h1Num >= 1 && h1Num <= 7) { p1 = 'pm'; p2 = 'pm'; }
          else if (h1Num >= 8 && h1Num <= 11) { p1 = 'am'; p2 = h2Num < h1Num || h2Num === 12 ? 'pm' : 'am'; }
        }

        const t1 = parseSingleTime(rangeMatch[1], rangeMatch[2], p1);
        let t2 = parseSingleTime(rangeMatch[4], rangeMatch[5], p2);

        if ((t1.hh === '23' || parseInt(t1.hh, 10) >= 18) && h2Num === 12 && (!rawP2 || rawP2 === 'pm')) {
          t2 = { hh: '00', mm: t2.mm, display: `12:${t2.mm}am` };
        }

        timeSlot = `${t1.hh}:${t1.mm} - ${t2.hh}:${t2.mm}`;
        endTimeSlot = `${t2.hh}:${t2.mm}`;
        registerToken('time', rangeMatch[0], `${t1.display} – ${t2.display}`);

        const startTotalMin = parseInt(t1.hh, 10) * 60 + parseInt(t1.mm, 10);
        let endTotalMin = parseInt(t2.hh, 10) * 60 + parseInt(t2.mm, 10);
        let rangeDiff = endTotalMin - startTotalMin;
        if (rangeDiff <= 0) rangeDiff += 24 * 60;
        if (rangeDiff > 0 && rangeDiff <= 24 * 60 && (!durationMinutes || durationMinutes === 25)) {
          durationMinutes = rangeDiff;
          const hh = Math.floor(rangeDiff / 60);
          const mm = rangeDiff % 60;
          const disp = hh > 0 ? (mm > 0 ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
          registerToken('duration', rangeMatch[0], disp);
        }
      }
    }
  }

  if (!timeSlot) {
    const hasEveningHint = /\b(?:evening|shaam|sham|night|raat|afternoon|dopahar)\b/i.test(text);
    const hasMorningHint = /\b(?:morning|subah)\b/i.test(text);

    const bajeMatch = text.match(/\b(?:(?:shaam|sham|dopahar|raat|subah)\s+(?:ko\s+)?)?(\d{1,2})(?:[:\s](\d{2}))?\s*baje\b/i);
    if (bajeMatch) {
      let h = parseInt(bajeMatch[1], 10);
      const mins = bajeMatch[2] ? parseInt(bajeMatch[2], 10) : 0;
      const isPm = hasEveningHint || (h >= 1 && h <= 7 && !hasMorningHint);
      if (isPm && h < 12) h += 12;
      if (hasMorningHint && h === 12) h = 0;
      const hh = h.toString().padStart(2, '0');
      const mm = mins.toString().padStart(2, '0');
      timeSlot = `${hh}:${mm}`;
      const hr12 = h % 12 || 12;
      const ampm = h >= 12 ? 'pm' : 'am';
      registerToken('time', bajeMatch[0], `${hr12}:${mm}${ampm}`);
    }

    if (!timeSlot) {
      const timePatterns: RegExp[] = [
        /\b(?:at\s+)?(\d{1,2})[:\s](\d{2})\s*(a\.?m\.?|p\.?m\.?|am|pm)\b/i,
        /\bat\s+(\d{1,2})[:\s](\d{2})\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/i,
        /\bat\s?(\d{1,2}):(\d{2})\s?(a\.?m\.?|p\.?m\.?|am|pm)?\b/i,
        /\bat\s?(\d{1,2})\s?(a\.?m\.?|p\.?m\.?|am|pm)\b/i,
        /\b(\d{1,2}):(\d{2})\s?(a\.?m\.?|p\.?m\.?|am|pm)\b/i,
        /\b(\d{1,2})\s?(a\.?m\.?|p\.?m\.?|am|pm)\b/i,
      ];
      for (const pat of timePatterns) {
        const m = text.match(pat);
        if (!m) continue;
        let h = parseInt(m[1], 10);
        const secondGroup = m[2] ?? '';
        const thirdGroup  = m[3] ?? '';
        const mins   = /^\d+$/.test(secondGroup) ? parseInt(secondGroup, 10) : 0;
        const rawPeriod = /^\d+$/.test(secondGroup) ? thirdGroup : secondGroup;
        let period = (rawPeriod || '').toLowerCase().replace(/[^a-z]/g, '');
        if (!period) {
          if (hasEveningHint && h < 12) period = 'pm';
          else if (hasMorningHint) period = 'am';
        }
        if (period === 'pm' && h < 12) h += 12;
        if (period === 'am' && h === 12) h = 0;
        const hh = h.toString().padStart(2, '0');
        const mm = mins.toString().padStart(2, '00');
        timeSlot = `${hh}:${mm}`;
        const hr12 = h % 12 || 12;
        const ampm = h >= 12 ? 'pm' : 'am';
        registerToken('time', m[0], `${hr12}:${mm}${ampm}`);
        break;
      }
    }

    if (!timeSlot) {
      const halfPastM = text.match(/\bhalf\s+past\s+(\d{1,2})\b/i);
      if (halfPastM) {
        let h = parseInt(halfPastM[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        timeSlot = `${h.toString().padStart(2, '0')}:30`;
        const hr12 = h % 12 || 12;
        registerToken('time', halfPastM[0], `${hr12}:30${h >= 12 ? 'pm' : 'am'}`);
      }
    }

    if (!timeSlot) {
      const aQuarterTo = text.match(/\ba\s+quarter\s+to\s+(\d{1,2})\b/i);
      if (aQuarterTo) {
        let h = parseInt(aQuarterTo[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        const baseH = h - 1;
        timeSlot = `${baseH.toString().padStart(2, '0')}:45`;
        const hr12 = baseH % 12 || 12;
        registerToken('time', aQuarterTo[0], `${hr12}:45${baseH >= 12 ? 'pm' : 'am'}`);
      }
    }
    if (!timeSlot) {
      const aQuarterPast = text.match(/\ba\s+quarter\s+past\s+(\d{1,2})\b/i);
      if (aQuarterPast) {
        let h = parseInt(aQuarterPast[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        timeSlot = `${h.toString().padStart(2, '0')}:15`;
        const hr12 = h % 12 || 12;
        registerToken('time', aQuarterPast[0], `${hr12}:15${h >= 12 ? 'pm' : 'am'}`);
      }
    }

    if (!timeSlot) {
      const quarterToM = text.match(/\bquarter\s+to\s+(\d{1,2})\b/i);
      if (quarterToM) {
        let h = parseInt(quarterToM[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        const baseH = h - 1;
        timeSlot = `${baseH.toString().padStart(2, '00')}:45`;
        const hr12 = baseH % 12 || 12;
        registerToken('time', quarterToM[0], `${hr12}:45${baseH >= 12 ? 'pm' : 'am'}`);
      }
    }

    if (!timeSlot) {
      const quarterPastM = text.match(/\bquarter\s+past\s+(\d{1,2})\b/i);
      if (quarterPastM) {
        let h = parseInt(quarterPastM[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        timeSlot = `${h.toString().padStart(2, '0')}:15`;
        const hr12 = h % 12 || 12;
        registerToken('time', quarterPastM[0], `${hr12}:15${h >= 12 ? 'pm' : 'am'}`);
      }
    }

    if (!timeSlot) {
      const oclockM = text.match(/(\d{1,2})\s+o'?clock\b/i);
      if (oclockM) {
        let h = parseInt(oclockM[1], 10);
        if (h < 8 && !hasMorningHint) h += 12;
        timeSlot = `${h.toString().padStart(2, '0')}:00`;
        const hr12 = h % 12 || 12;
        registerToken('time', oclockM[0], `${hr12}:00${h >= 12 ? 'pm' : 'am'}`);
      }
    }

    if (!timeSlot) {
      const bareAtM = text.match(/\bat\s+(\d{1,2})\b(?!\s*(?:am|pm|:\d|\s+\d{2}))/i);
      if (bareAtM) {
        let h = parseInt(bareAtM[1], 10);
        if (h >= 1 && h <= 11 && !hasMorningHint) h += 12;
        timeSlot = `${h.toString().padStart(2, '0')}:00`;
        const hr12 = h % 12 || 12;
        registerToken('time', bareAtM[0], `${hr12}:00pm`);
      }
    }

    if (!timeSlot) {
      const spaceSepM = text.match(/\b([1-9]|1[0-2])\s+(\d{2})\s+(am|pm)\b/i);
      if (spaceSepM) {
        const s = parseSingleTime(spaceSepM[1], spaceSepM[2], spaceSepM[3]);
        timeSlot = `${s.hh}:${s.mm}`;
        registerToken('time', spaceSepM[0], s.display);
      }
    }

    if (!timeSlot) {
      if (/\bbefore\s+lunch\b/i.test(text)) {
        const m = text.match(/\bbefore\s+lunch\b/i)!;
        timeSlot = '11:30';
        registerToken('time', m[0], 'Before Lunch');
      } else if (/\bafter\s+lunch\b/i.test(text)) {
        const m = text.match(/\bafter\s+lunch\b/i)!;
        timeSlot = '13:00';
        registerToken('time', m[0], 'After Lunch');
      }
    }

    if (!timeSlot) {
      const namedTimes: Array<[RegExp, string, string]> = [
        [/\bnoon\b/i,                        '12:00', 'Noon'],
        [/\bmidnight\b/i,                    '00:00', 'Midnight'],
        [/\b(EOD|end\s+of\s+day|close\s+of\s+business|COB)\b/i, '17:00', 'EOD 5pm'],
        [/\bearly\s+morning\b/i,             '07:00', 'Early Morning (7am)'],
        [/\bmorning\b(?!\s+routine)/i,       '09:00', 'Morning (9am)'],
        [/\b(midday|mid-?day)\b/i,           '12:00', 'Midday'],
        [/\bafternoon\b/i,                   '14:00', 'Afternoon (2pm)'],
        [/\b(evening|sundown)\b/i,           '18:00', 'Evening (6pm)'],
        [/\blate\s+night\b/i,                '23:00', 'Late Night (11pm)'],
        [/\b(night|tonight)\b/i,             '21:00', 'Night (9pm)'],
        [/\bdawn\b/i,                         '05:00', 'Dawn (5am)'],
        [/\bdusk\b/i,                         '18:30', 'Dusk (6:30pm)'],
        [/\blunch\s+time\b/i,                '13:00', 'Lunch Time (1pm)'],
        [/\bdinnertime\b/i,                   '20:00', 'Dinner Time (8pm)'],
        [/\bbreakfast\s*time\b/i,            '08:00', 'Breakfast Time (8am)'],
      ];
      for (const [pat, slot, label] of namedTimes) {
        const m = text.match(pat);
        if (m) { timeSlot = slot; registerToken('time', m[0], label); break; }
      }
    }
  }

  if (timeSlot) {
    const periodQualifiers = [
      /\b(?:in\s+the\s+)?(?:early\s+morning|morning|afternoon|evening|night)\b/i,
      /\b(?:shaam\s+ko|sham\s+ko|shaam|sham|subah\s+ko|subah|dopahar\s+ko|dopahar|raat\s+ko|raat)\b/i,
    ];
    for (const pat of periodQualifiers) {
      const m = text.match(pat);
      if (m) {
        registerToken('time', m[0], m[0].trim());
      }
    }
  }

  // 5. DATE
  const mPat = `(${ALL_MONTH_FORMS.join('|')})`;

  if (!dateResult) {
    const form1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}(?:\\s+(\\d{4}))?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}(?:\\s+(\\d{4}))?\\b`, 'i');
    const form2 = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\s+(?:to|-)\\s+${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, 'i');
    const form3 = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
    const form4 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\b`, 'i');

    const rm1 = text.match(form1);
    const rm2 = text.match(form2);
    const rm3 = text.match(form3);
    const rm4 = text.match(form4);

    if (rm1) {
      const startD = resolveMonthDay(rm1[2], parseInt(rm1[1], 10));
      const endD   = resolveMonthDay(rm1[5], parseInt(rm1[4], 10));
      if (startD && endD) {
        if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
        const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
        dateResult = startD; multiDays = span;
        const sM = rm1[2].slice(0, 1).toUpperCase() + rm1[2].slice(1, 3).toLowerCase();
        const eM = rm1[5].slice(0, 1).toUpperCase() + rm1[5].slice(1, 3).toLowerCase();
        registerToken('date', rm1[0], `${rm1[1]} ${sM} – ${rm1[4]} ${eM}`);
      }
    } else if (rm2) {
      const startD = resolveMonthDay(rm2[1], parseInt(rm2[2], 10));
      const endD   = resolveMonthDay(rm2[4], parseInt(rm2[5], 10));
      if (startD && endD) {
        if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
        const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
        dateResult = startD; multiDays = span;
        const sM = rm2[1].slice(0, 1).toUpperCase() + rm2[1].slice(1, 3).toLowerCase();
        const eM = rm2[4].slice(0, 1).toUpperCase() + rm2[4].slice(1, 3).toLowerCase();
        registerToken('date', rm2[0], `${sM} ${rm2[2]} – ${eM} ${rm2[5]}`);
      }
    } else if (rm3) {
      const startD = resolveMonthDay(rm3[1], parseInt(rm3[2], 10));
      const endD   = resolveMonthDay(rm3[1], parseInt(rm3[3], 10));
      if (startD && endD) {
        if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
        const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
        dateResult = startD; multiDays = span;
        const mL = rm3[1].slice(0, 1).toUpperCase() + rm3[1].slice(1, 3).toLowerCase();
        registerToken('date', rm3[0], `${mL} ${rm3[2]} – ${rm3[3]}`);
      }
    } else if (rm4) {
      const startD = resolveMonthDay(rm4[3], parseInt(rm4[1], 10));
      const endD   = resolveMonthDay(rm4[3], parseInt(rm4[2], 10));
      if (startD && endD) {
        if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
        const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
        dateResult = startD; multiDays = span;
        const mL = rm4[3].slice(0, 1).toUpperCase() + rm4[3].slice(1, 3).toLowerCase();
        registerToken('date', rm4[0], `${rm4[1]} – ${rm4[2]} ${mL}`);
      }
    }

    if (!dateResult && /\bin\s+(\d+)\s*(?:mins?|minutes?)\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s*(?:mins?|minutes?)\b/i)!;
      const n = parseInt(m[1], 10);
      const then = new Date(now.getTime() + n * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2, '0')}:${then.getMinutes().toString().padStart(2, '0')}`;
      registerToken('date', m[0], `In ${n}m`);
    } else if (!dateResult && /\bin\s+an?\s+hour\b/i.test(text)) {
      const m = text.match(/\bin\s+an?\s+hour\b/i)!;
      const then = new Date(now.getTime() + 60 * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2, '0')}:${then.getMinutes().toString().padStart(2, '0')}`;
      registerToken('date', m[0], 'In 1h');
    } else if (!dateResult && /\bin\s+(\d+)\s*(?:hours?|hrs?)\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s*(?:hours?|hrs?)\b/i)!;
      const n = parseInt(m[1], 10);
      const then = new Date(now.getTime() + n * 60 * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2, '0')}:${then.getMinutes().toString().padStart(2, '0')}`;
      registerToken('date', m[0], `In ${n}h`);
    }

    // Hinglish relative dates
    if (!dateResult && /\b(aaj|aaj\s+hi)\b/i.test(text)) {
      const m = text.match(/\b(aaj|aaj\s+hi)\b/i)!;
      dateResult = new Date(now);
      registerToken('date', m[0], 'Aaj (Today)');
    } else if (!dateResult && /\b(parso|parson)\b/i.test(text)) {
      const m = text.match(/\b(parso|parson)\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 2);
      registerToken('date', m[0], 'Parso (Day After)');
    } else if (!dateResult && /\bkal\b/i.test(text)) {
      const m = text.match(/\bkal\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      registerToken('date', m[0], 'Kal (Tomorrow)');
    }

    // Business shortcuts
    if (!dateResult && /\bEOW\b/.test(text)) {
      const m = text.match(/\bEOW\b/)!;
      dateResult = nextWeekday(5); registerToken('date', m[0], 'EOW (Fri)');
    } else if (!dateResult && /\bSOW\b/.test(text)) {
      const m = text.match(/\bSOW\b/)!;
      dateResult = nextWeekday(1, true); registerToken('date', m[0], 'SOW (Next Mon)');
    } else if (!dateResult && /\bEOM\b/.test(text)) {
      const m = text.match(/\bEOM\b/)!;
      dateResult = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      registerToken('date', m[0], 'EOM (Month End)');
    } else if (!dateResult && /\bEOQ\b/.test(text)) {
      const m = text.match(/\bEOQ\b/)!;
      const qEnd = [2, 5, 8, 11][Math.floor(now.getMonth() / 3)];
      dateResult = new Date(now.getFullYear(), qEnd + 1, 0);
      registerToken('date', m[0], 'EOQ (Quarter End)');
    }

    // Contextual time-of-day dates
    if (!dateResult && /\btonight\b/i.test(text)) {
      const m = text.match(/\btonight\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '21:00';
      registerToken('date', m[0], 'Tonight');
    } else if (!dateResult && /\bthis\s+morning\b/i.test(text)) {
      const m = text.match(/\bthis\s+morning\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '09:00';
      registerToken('date', m[0], 'This Morning');
    } else if (!dateResult && /\bthis\s+(?:evening|tonight)\b/i.test(text)) {
      const m = text.match(/\bthis\s+(?:evening|tonight)\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '18:00';
      registerToken('date', m[0], 'This Evening');
    } else if (!dateResult && /\bthis\s+afternoon\b/i.test(text)) {
      const m = text.match(/\bthis\s+afternoon\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '14:00';
      registerToken('date', m[0], 'This Afternoon');
    } else if (!dateResult && /\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+evening\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+evening\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '18:00';
      registerToken('date', m[0], 'Tomorrow Evening');
    } else if (!dateResult && /\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+morning\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+morning\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '09:00';
      registerToken('date', m[0], 'Tomorrow Morning');
    } else if (!dateResult && /\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+afternoon\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+afternoon\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '14:00';
      registerToken('date', m[0], 'Tomorrow Afternoon');
    } else if (!dateResult && /\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+night\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tommorow|tomorow|tommorrow|tmr|tmrw|tomo|2moro|2morrow)\s+night\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '21:00';
      registerToken('date', m[0], 'Tomorrow Night');
    } else if (!dateResult && /\bkal\s+(?:shaam|sham)\b/i.test(text)) {
      const m = text.match(/\bkal\s+(?:shaam|sham)\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '18:00';
      registerToken('date', m[0], 'Kal Shaam');
    } else if (!dateResult && /\bkal\s+subah\b/i.test(text)) {
      const m = text.match(/\bkal\s+subah\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '09:00';
      registerToken('date', m[0], 'Kal Subah');
    } else if (!dateResult && /\bkal\s+dopahar\b/i.test(text)) {
      const m = text.match(/\bkal\s+dopahar\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '14:00';
      registerToken('date', m[0], 'Kal Dopahar');
    } else if (!dateResult && /\bkal\s+raat\b/i.test(text)) {
      const m = text.match(/\bkal\s+raat\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '21:00';
      registerToken('date', m[0], 'Kal Raat');
    } else if (!dateResult && /\baaj\s+(?:shaam|sham)\b/i.test(text)) {
      const m = text.match(/\baaj\s+(?:shaam|sham)\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '18:00';
      registerToken('date', m[0], 'Aaj Shaam');
    } else if (!dateResult && /\baaj\s+raat\b/i.test(text)) {
      const m = text.match(/\baaj\s+raat\b/i)!;
      dateResult = new Date(now);
      if (!timeSlot) timeSlot = '21:00';
      registerToken('date', m[0], 'Aaj Raat');
    }

    // Extended relative date keywords
    if (!dateResult && /\bend\s+of\s+(?:the\s+)?week\b/i.test(text)) {
      const m = text.match(/\bend\s+of\s+(?:the\s+)?week\b/i)!;
      dateResult = nextWeekday(5);
      registerToken('date', m[0], 'End of Week (Fri)');
    }
    if (!dateResult && /\bend\s+of\s+(?:the\s+)?month\b/i.test(text)) {
      const m = text.match(/\bend\s+of\s+(?:the\s+)?month\b/i)!;
      dateResult = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      registerToken('date', m[0], 'End of Month');
    }
    if (!dateResult && /\bstart\s+of\s+(?:the\s+)?week\b/i.test(text)) {
      const m = text.match(/\bstart\s+of\s+(?:the\s+)?week\b/i)!;
      dateResult = nextWeekday(1, true);
      registerToken('date', m[0], 'Start of Week (Mon)');
    }
    if (!dateResult && /\bnext\s+week\b/i.test(text) && !isRecurring) {
      const m = text.match(/\bnext\s+week\b/i)!;
      dateResult = nextWeekday(1, true);
      registerToken('date', m[0], 'Next Week (Mon)');
    }
    if (!dateResult && /\bthis\s+week\b/i.test(text) && !isRecurring) {
      const m = text.match(/\bthis\s+week\b/i)!;
      dateResult = nextWeekday(1, false);
      registerToken('date', m[0], 'This Week (Mon)');
    }

    // "1st of March" / "3rd of june"
    if (!dateResult) {
      const ordinalOfMonthRe = new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+${mPat}\\b`, 'i'
      );
      const ordinalOfMonth = text.match(ordinalOfMonthRe);
      if (ordinalOfMonth) {
        const d = resolveMonthDay(ordinalOfMonth[2], parseInt(ordinalOfMonth[1], 10));
        if (d) {
          dateResult = d;
          const mL = ordinalOfMonth[2].charAt(0).toUpperCase() + ordinalOfMonth[2].slice(1).toLowerCase();
          registerToken('date', ordinalOfMonth[0], `${ordinalOfMonth[1]} ${mL}`);
        }
      }
    }

    // "on the 5th" / "by the 12th" — ordinal-only (current or next month)
    if (!dateResult) {
      const ordinalOnly = text.match(/\b(?:on\s+|by\s+)?(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b(?!\s+of)/i);
      if (ordinalOnly) {
        const dayNum = parseInt(ordinalOnly[1], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          const todayDate2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let candidate = new Date(now.getFullYear(), now.getMonth(), dayNum);
          if (candidate < todayDate2) candidate = new Date(now.getFullYear(), now.getMonth() + 1, dayNum);
          dateResult = candidate;
          registerToken('date', ordinalOnly[0], `${ordinalOnly[1]}${ordinalOnly[2]}`);
        }
      }
    }

    // First/last weekday of month: "first monday of september", "last friday of this month", "last day of august"
    if (!dateResult) {
      const ordinalPat = new RegExp(
        `\\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+(${DAY_NAMES.join('|')}|${DAY_SHORT.join('|')}|day)\\s+of\\s+(?:(this|next)\\s+month|${mPat})\\b`,
        'i'
      );
      const ordM = text.match(ordinalPat);
      if (ordM) {
        const ordStr = ordM[1].toLowerCase();
        const dayStr = ordM[2].toLowerCase();
        const monthRef = ordM[3] ? ordM[3].toLowerCase() : null;
        const monthName = ordM[4] ?? null;

        let targetMonth = now.getMonth();
        let targetYear = now.getFullYear();
        if (monthRef === 'next') {
          targetMonth += 1;
          if (targetMonth > 11) { targetMonth = 0; targetYear++; }
        } else if (monthName) {
          const mn = MONTH_ALIASES[monthName.toLowerCase()] ?? MONTH_ALIASES[monthName.toLowerCase().slice(0, 3)];
          if (mn) {
            targetMonth = mn - 1;
            if (targetMonth < now.getMonth()) targetYear++;
          }
        }

        if (dayStr === 'day' && (ordStr === 'last' || ordStr === '4th')) {
          dateResult = new Date(targetYear, targetMonth + 1, 0);
          registerToken('date', ordM[0], `Last Day of Month`);
        } else {
          const di = DAY_NAMES.findIndex(d => dayStr.startsWith(d)) !== -1
            ? DAY_NAMES.findIndex(d => dayStr.startsWith(d))
            : DAY_SHORT.findIndex(d => dayStr.startsWith(d));
          if (di !== -1) {
            const ordinal = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: -1 }[ordStr] || 1;
            const firstOfMonth = new Date(targetYear, targetMonth, 1);
            const firstDow = firstOfMonth.getDay();
            const offset = (di - firstDow + 7) % 7;
            if (ordinal === -1) {
              const lastOfMonth = new Date(targetYear, targetMonth + 1, 0);
              const lastDow = lastOfMonth.getDay();
              const endOffset = (di - lastDow + 7) % 7;
              dateResult = new Date(targetYear, targetMonth + 1, -endOffset);
            } else {
              dateResult = new Date(targetYear, targetMonth, 1 + offset + (ordinal - 1) * 7);
            }
            const ordLabel = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'Last' }[ordinal] || ordStr;
            const dayLabel = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
            registerToken('date', ordM[0], `${ordLabel} ${dayLabel}`);
          }
        }
      }
    }

    // Standard relative date keywords
    if (!dateResult) {
      if (/\btoday\b/i.test(text)) {
        const m = text.match(/\btoday\b/i)!; dateResult = new Date(now);
        registerToken('date', m[0], 'Today');
      } else if (/\b(tomorrow|tmr|tmrw|tomo|2moro|2morrow)\b/i.test(text)) {
        const m = text.match(/\b(tomorrow|tmr|tmrw|tomo|2moro|2morrow)\b/i)!;
        dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
        registerToken('date', m[0], 'Tomorrow');
      } else if (/\bday after tomorrow\b/i.test(text)) {
        const m = text.match(/\bday after tomorrow\b/i)!;
        dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 2);
        registerToken('date', m[0], 'Day After Tomorrow');
      } else if (/\b(next\s+weekend|this\s+weekend)\b/i.test(text)) {
        const m = text.match(/\b(next\s+weekend|this\s+weekend)\b/i)!;
        dateResult = nextWeekday(6); registerToken('date', m[0], 'This Weekend');
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
        // Specific Month/Day with optional Year
        const mdYPat = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(20\\d{2})\\b`, 'i');
        const dmYPat = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\s+(20\\d{2})\\b`, 'i');
        const mdYM = text.match(mdYPat);
        const dmYM = text.match(dmYPat);

        if (mdYM) {
          const monthNum = MONTH_ALIASES[mdYM[1].toLowerCase().trim()] ?? MONTH_ALIASES[mdYM[1].toLowerCase().trim().slice(0, 3)];
          if (monthNum) {
            const d = new Date(parseInt(mdYM[3], 10), monthNum - 1, parseInt(mdYM[2], 10));
            dateResult = d;
            const mLabel = mdYM[1].charAt(0).toUpperCase() + mdYM[1].slice(1, 3).toLowerCase();
            registerToken('date', mdYM[0], `${mLabel} ${mdYM[2]}, ${mdYM[3]}`);
          }
        } else if (dmYM) {
          const monthNum = MONTH_ALIASES[dmYM[2].toLowerCase().trim()] ?? MONTH_ALIASES[dmYM[2].toLowerCase().trim().slice(0, 3)];
          if (monthNum) {
            const d = new Date(parseInt(dmYM[3], 10), monthNum - 1, parseInt(dmYM[1], 10));
            dateResult = d;
            const mLabel = dmYM[2].charAt(0).toUpperCase() + dmYM[2].slice(1, 3).toLowerCase();
            registerToken('date', dmYM[0], `${dmYM[1]} ${mLabel}, ${dmYM[3]}`);
          }
        }

        if (!dateResult) {
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

        // Numeric date formats
        if (!dateResult) {
          const numericLong = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
          const numericShort = text.match(/\b(\d{1,2})[\/.](\d{1,2})\b/);

          if (numericLong) {
            const day = parseInt(numericLong[1], 10);
            const month = parseInt(numericLong[2], 10);
            const year = parseInt(numericLong[3], 10);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              dateResult = new Date(year, month - 1, day);
              registerToken('date', numericLong[0], `${day}/${month}/${year}`);
            }
          } else if (numericShort) {
            const day = parseInt(numericShort[1], 10);
            const month = parseInt(numericShort[2], 10);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              let candidate = new Date(now.getFullYear(), month - 1, day);
              if (candidate < todayDate) candidate = new Date(now.getFullYear() + 1, month - 1, day);
              dateResult = candidate;
              registerToken('date', numericShort[0], `${day}/${month}`);
            }
          }
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
          registerToken('date', m[0], `${forceNext ? 'Next ' : ''}${label}`);
          break;
        }
      }
    }
  }

  // 6. BUILD CLEAN TITLE (Space-preserving token subtraction)
  let title = raw;
  const sortedTokens = [...tokens].sort((a, b) => b.start - a.start);
  for (const tok of sortedTokens) {
    if (tok.start < 0 || tok.end > title.length || tok.start >= tok.end) continue;
    title = title.slice(0, tok.start) + ' ' + title.slice(tok.end);
  }
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = cleanTaskTitle(title);
  if (!title) title = cleanTaskTitle(raw) || raw.trim();

  // 7. SMART SEMANTIC DOMAIN TAG INFERENCE
  if (extractedTags.length === 0) {
    const combinedContext = `${title} ${raw}`.toLowerCase();
    if (/\b(lab|report|assignment|exam|exams|lecture|lectures|professor|prof|quiz|viva|midsem|endsem|semester|syllabus|attendance|bunk|hod|faculty|coursework|homework|thesis|dissertation|classes|class|college|university|campus|operating\s+systems?|os|dbms|computer\s+networks?|cn|theory\s+of\s+computation|toc|physics|chemistry|math|mathematics|calculus|biology|notes|revision|revise|chapter|chapters|pages?|practicals?|internals?|backlogs?|arrears?|tutorial|project\s+report|minor\s+project|major\s+project|practical\s+file)\b/i.test(combinedContext)) {
      extractedTags.push('college');
    } else if (/\b(workout|gym|chest|back|legs|biceps|triceps|shoulders|push\s+day|pull\s+day|leg\s+day|squat|squats|bench\s+press|bench|deadlift|deadlifts|cardio|treadmill|hiit|protein|creatine|sets|reps|abs|fitness)\b/i.test(combinedContext)) {
      extractedTags.push('gym');
    } else if (/\b(leetcode|dsa|interview|interviews|resume|cv|system\s+design|sql|dbms|coding|mock\s+interview|oops|algorithm|algorithms|codeforces|hackerrank|aptitude|offer\s+letter|hr\s+round|campus\s+placement|github|pr|bug\s+fix)\b/i.test(combinedContext)) {
      extractedTags.push('placement');
    } else if (/\b(bill|bills|electricity\s+bill|rent|recharge|fee|fees|emi|credit\s+card|salary|tax|taxes|investment|sip|bank\s+transfer|transfer\s+money|pay\s+tuition)\b/i.test(combinedContext)) {
      extractedTags.push('finance');
    } else if (/\b(doctor|dentist|medicine|medicines|pills|vitamins|appointment|checkup|hospital|clinic|blood\s+test|prescription|physio)\b/i.test(combinedContext)) {
      extractedTags.push('health');
    } else if (/\b(groceries|grocery|haircut|laundry|clean\s+room|call\s+(?:mom|dad|mummy|papa|mother|father|parents|bro|brother|sister)|birthday|anniversary|shopping|family|friends|outing|trip|travel|vacation|picnic|dinner|lunch|breakfast|party|celebration|gift|present)\b/i.test(combinedContext)) {
      extractedTags.push('personal');
    }
  }

  // 8. SMART PRIORITY INFERENCE
  const hasExplicitPriority = tokens.some(t => t.type === 'priority');
  if (!hasExplicitPriority) {
    const urgencyContext = `${title} ${raw}`.toLowerCase();
    if (/\b(urgent|critical|emergency|asap|deadline|blocker|fire|exam|midsem|endsem|interview|doctor|hospital|immediately|submission|due\s+today|due\s+tomorrow|overdue|last\s+date|final\s+submission|presentation|viva|placement)\b/i.test(urgencyContext)) {
      priority = 'high';
    }
  }

  // 9. CONTEXTUAL DURATION DEFAULTS
  if (durationMinutes == null) {
    const durationContext = `${title} ${raw}`.toLowerCase();
    if (/\b(gym|workout|chest|back|legs|biceps|triceps|push\s+day|pull\s+day|leg\s+day|fitness)\b/i.test(durationContext) || extractedTags.includes('gym')) {
      durationMinutes = 60;
    } else if (/\b(exam|exams|midsem|endsem|lab\s+exam|practical|viva)\b/i.test(durationContext)) {
      durationMinutes = 90;
    } else if (/\b(meeting|sync|standup|interview|call\s+with|discussion|1:1|one\s+on\s+one|review\s+meeting|catch\s+up)\b/i.test(durationContext)) {
      durationMinutes = 30;
    } else if (/\b(study|revision|revise|notes|assignment|homework|reading|chapter|lecture)\b/i.test(durationContext)) {
      durationMinutes = 60;
    } else if (/\b(bill|recharge|pay|call\s+(?:mom|dad|mummy|papa)|haircut|quick|medicine|pills)\b/i.test(durationContext) || extractedTags.includes('finance')) {
      durationMinutes = 15;
    }
  }

  return {
    title,
    date: dateResult ? toYMD(dateResult) : null,
    timeSlot,
    endTimeSlot,
    priority,
    isRecurring,
    recurrenceRule,
    multiDays,
    oneTimeDates: oneTimeDates && oneTimeDates.length > 1 ? oneTimeDates : undefined,
    tags: extractedTags,
    durationMinutes,
    isReminder,
    subtasks: extractedSubtasks.length > 0 ? extractedSubtasks : undefined,
    locationReminder: locationReminder || undefined,
    locationName,
    tokens,
  };
}

/**
 * Splits complex or multi-task input (e.g. from speech dictation) into individual tasks,
 * parsing each with full NLP capabilities.
 */
export function parseNLTasks(raw: string): ParsedTask[] {
  if (!raw || !raw.trim()) return [];
  const text = raw.trim();

  const sanitizeAndParse = (segment: string): ParsedTask => {
    const cleanSegment = segment
      .trim()
      .replace(/^(?:and\s+also|and\s+then|and|then|also|plus|next|after\s+that|followed\s+by|aur\s+phir|aur|phir|uske\s+baad)\s+/i, '')
      .trim();
    return parseNLTask(cleanSegment);
  };

  // 1. Numbered lists: "1. ... 2. ..."
  if (/(?:^|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/.test(text)) {
    const parts = text.split(/(?:^|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(sanitizeAndParse).filter(t => t.title.length > 0);
    }
  }

  // 2. Newlines or bullet points
  if (/[\n•*]\s*/.test(text)) {
    const parts = text.split(/[\n•*]\s*/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(sanitizeAndParse).filter(t => t.title.length > 0);
    }
  }

  // 3. Semicolons
  if (/;\s*/.test(text)) {
    const parts = text.split(/;\s*/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(sanitizeAndParse).filter(t => t.title.length > 0);
    }
  }

  // 4. Compound transitional connectors
  const transitionRegex = /\b(?:and\s+also|and\s+then|after\s+that|followed\s+by|additionally|plus\s+also|and\s+next|aur\s+phir|uske\s+baad)\b/i;
  if (transitionRegex.test(text)) {
    const parts = text.split(transitionRegex).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(sanitizeAndParse).filter(t => t.title.length > 0);
    }
  }

  // 5. Actionable "and" / "then" splits
  const taskVerbPattern = /\b(?:create|add|make|remind|buy|call|meet|submit|finish|complete|do|start|go|workout|study|prepare|clean|read|write|email|send|schedule|review|pay|attend|check|update|fix|code|order|take|cook|wash|learn|practice|visit|revise|pack)\b/i;
  const tokenHintPattern = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|every|at\s+\d|am|pm|p1|p2|p3|urgent|high\s+priority|reminder|alarm|#)\b/i;

  const compoundSplitRegex = /,\s*(?:and|then)\s+|\s+(?:and\s+then|then)\s+|\s+and\s+/i;
  const compoundParts = text.split(compoundSplitRegex);
  if (compoundParts.length > 1) {
    const allLookLikeTasks = compoundParts.every(part => {
      const p = part.trim();
      return p.length >= 3 && (taskVerbPattern.test(p) || tokenHintPattern.test(p));
    });

    if (allLookLikeTasks) {
      return compoundParts.map(sanitizeAndParse).filter(t => t.title.length > 0);
    }
  }

  return [parseNLTask(text)];
}

// Legacy compat for quick capture sheets
export function parseNLDate(text: string): { date: string | null; timeSlot: string | null; cleanTitle: string; multiDays?: number } {
  const r = parseNLTask(text);
  return { date: r.date, timeSlot: r.timeSlot, cleanTitle: r.title, multiDays: r.multiDays };
}

/**
 * Parses smart natural language event description
 */
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
  if (startTime && /[-–—]/.test(startTime)) {
    const parts = startTime.split(/[-–—]/).map((s: string) => s.trim()).filter(Boolean);
    startTime = parts[0] || null;
    if (!endTime && parts.length > 1 && parts[parts.length - 1] !== parts[0]) {
      endTime = parts[parts.length - 1];
    }
  }
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

// ─── Centralised Date Display Helpers ────────────────────────────────────────

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const monthName = MONTHS_LONG_CAP[parseInt(m, 10) - 1];
    return `${d} ${monthName} ${y}`;
  }
  return dateStr;
}

export function formatDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG_CAP[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT_CAP[d.getMonth()]}`;
}

export function formatDateWithDay(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${DAYS_SHORT_CAP[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT_CAP[d.getMonth()]}`;
}

export function formatDateFull(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${DAYS_LONG_CAP[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${MONTHS_LONG_CAP[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateNumeric(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
}

export function formatDateObjShort(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')} ${MONTHS_SHORT_CAP[date.getMonth()]}`;
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
    'silence', '[silence]', '(silence)', 'blank audio', '[blank_audio]',
    'background noise', '[background noise]', 'thank you', 'thanks',
    'am', 'task', 'task.', 'add task', 'listening', 'you', 'the'
  ];
  return silenceTokens.includes(clean);
}

export function formatTimeRangeDisplay(timeStr?: string | null): string {
  if (!timeStr) return '';
  const clean = timeStr.trim();
  if (!clean) return '';

  const parts = clean.split(/[-–—]|(?:\s+to\s+)/i).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return clean;

  const formatSingle = (str: string) => {
    const lower = str.toLowerCase().trim();
    if (lower.includes('am') || lower.includes('pm')) {
      return str.replace(/\s+/g, ' ').toUpperCase();
    }
    const timeParts = lower.split(':');
    let h = parseInt(timeParts[0], 10);
    const m = timeParts.length > 1 ? parseInt(timeParts[1], 10) : 0;
    if (isNaN(h)) return str;
    const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    if (m === 0) {
      return `${hour12} ${ampm}`;
    }
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  if (parts.length === 1) {
    return formatSingle(parts[0]);
  }
  return `${formatSingle(parts[0])} – ${formatSingle(parts[1])}`;
}

export function extractTaskDurationMinutes(
  explicitMinutes?: number | null,
  timeSlot?: string | null,
  text?: string | null
): number {
  if (typeof explicitMinutes === 'number' && explicitMinutes > 0) {
    return Math.round(explicitMinutes);
  }

  const parseTimeToMinutes = (t: string): number | null => {
    const raw = t.trim().toLowerCase();
    const ampmMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const mins = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const isPm = ampmMatch[3] === 'pm';
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return hours * 60 + mins;
    }

    const colonMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      const hours = parseInt(colonMatch[1], 10);
      const mins = parseInt(colonMatch[2], 10);
      return hours * 60 + mins;
    }

    const numMatch = raw.match(/^(\d{1,2})$/);
    if (numMatch) {
      const hours = parseInt(numMatch[1], 10);
      return hours * 60;
    }

    return null;
  };

  if (timeSlot && typeof timeSlot === 'string') {
    const cleanSlot = timeSlot.trim();
    const parts = cleanSlot.split(/[-–—]|(?:\s+to\s+)/i).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const start = parseTimeToMinutes(parts[0]);
      let end = parseTimeToMinutes(parts[1]);
      if (start !== null && end !== null) {
        if (start >= 18 * 60 && end === 12 * 60) {
          end = 24 * 60;
        }
        let diff = end - start;
        if (diff < 0) diff += 24 * 60;
        if (diff > 0 && diff <= 24 * 60) {
          return diff;
        }
      }
    }
  }

  if (text && typeof text === 'string') {
    const raw = text.trim();
    const textRangeMatch = raw.match(/\b(?:at\s+|from\s+|between\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
    if (textRangeMatch) {
      const s = parseTimeToMinutes(textRangeMatch[1]);
      let e = parseTimeToMinutes(textRangeMatch[2]);
      if (s !== null && e !== null) {
        if (s >= 18 * 60 && e === 12 * 60) {
          e = 24 * 60;
        }
        let diff = e - s;
        if (diff < 0) diff += 24 * 60;
        if (diff > 0 && diff <= 24 * 60) {
          return diff;
        }
      }
    }
  }

  return 25;
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
