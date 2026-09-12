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
//             "monday to saturday"  "daily from monday to friday"  "mon and wed"

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LONG = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Alternate / common typo spellings → canonical 3-letter index
 */
const MONTH_ALIASES: Record<string, number> = {
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

const ALL_MONTH_FORMS = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length);

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

/**
 * Parse a YYYY-MM-DD string safely as a LOCAL date (avoids UTC midnight shift).
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  const today = d.getDay();
  const diff = dayIndex - today;
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

/**
 * Strips conversational command prefixes, carrier words, filler phrases,
 * trailing prepositions, normalizes inverted voice grammar,
 * capitalizes sentences, and preserves standard tech/academic acronyms.
 */
export function cleanTaskTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let t = rawTitle.trim();

  t = t.replace(/^(?:hey\s+)?sara[,:\s]+/i, '');
  t = t.replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, '');
  t = t.replace(/^please\s+(?:kindly\s+)?/i, '');
  t = t.replace(/^kindly\s+/i, '');

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

  const hinglishVerbReversal = t.match(/^(.+?)\s+(submit|complete|finish|pay|clean|check|update|fix|verify|revise|study|read|write|deploy|book|buy|order)\s+(?:karna|krna|karni|krni|kar\s+dena|kar\s+do|karo)(?:\s+(?:hai|h))?$/i);
  if (hinglishVerbReversal) {
    t = `${hinglishVerbReversal[2]} ${hinglishVerbReversal[1]}`.trim();
  }

  t = t.replace(/\s+(?:dena|deni|bhejna|bhejni|lena|leni|jana|aana|khatam\s+karna)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:karna|krna|karni|krni)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:kar\s+dena|kar\s+lena|de\s+dena|kar\s+do|karo)$/i, '').trim();
  t = t.replace(/\s+(?:task|todo|to-do|item|reminder)(?:\s+(?:for|to|at|on|about))?(?:\s+(?:everyday|daily|each\s+day|today|tomorrow))?$/i, '').trim();
  t = t.replace(/\s+(?:for\s+everyday|for\s+daily|everyday|daily)$/i, '').trim();
  t = t.replace(/\s+(?:shaam\s+ko|sham\s+ko|shaam|sham|subah\s+ko|subah|dopahar\s+ko|dopahar|raat\s+ko|raat)$/i, '').trim();
  t = t.replace(/\s+with\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|buzz|ping|bell|chime|sound|vibration|notify|toast|pop.?up|snooze|push\s+notification)s?$/i, '').trim();
  t = t.replace(/\s+(?:with\s+)?(?:set(?:\s+an?)?\s+)?(?:alarm|reminder|alert|notification)\s+(?:for|at|on|to)\s*$/i, '').trim();
  t = t.replace(/\s+and\s+(?:remind\s+(?:me\s+)?(?:to\s+|about\s+)?|set\s+(?:a[n]?\s+)?(?:alarm|reminder)|notify\s+(?:me\s+)?)$/i, '').trim();
  t = t.replace(/\s+at\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?$/i, '').trim();
  t = t.replace(/\s+(?:today|tomorrow|tonight|aaj|kal|parso)$/i, '').trim();
  t = t.replace(/\s+(?:by|around|sharp|at|on|for|due)\s*$/i, '').trim();
  t = t.replace(/\s+(?:right\s+now|at\s+the\s+earliest|on\s+urgent\s+basis|urgent\s+basis)$/i, '').trim();

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

  // Acronyms
  const ACRONYMS: Record<string, string> = {
    dsa: 'DSA', dbms: 'DBMS', os: 'OS', ai: 'AI', ml: 'ML', dl: 'DL',
    nlp: 'NLP', cn: 'CN', oop: 'OOP', oops: 'OOPs', sql: 'SQL', nosql: 'NoSQL',
    api: 'API', apis: 'APIs', html: 'HTML', css: 'CSS', js: 'JS', ts: 'TS',
    pr: 'PR', prs: 'PRs', sde: 'SDE', hr: 'HR', ui: 'UI', ux: 'UX',
    pdf: 'PDF', llm: 'LLM', llms: 'LLMs', cgpa: 'CGPA', sgpa: 'SGPA',
    leetcode: 'LeetCode', gfg: 'GFG', codeforces: 'Codeforces', codechef: 'CodeChef',
    nptel: 'NPTEL', neet: 'NEET', gate: 'GATE', cat: 'CAT', upsc: 'UPSC',
  };

  const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with']);
  const words = t.split(/\s+/);
  const formattedWords = words.map((w, idx) => {
    const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ACRONYMS[cleanWord]) {
      return w.replace(new RegExp(cleanWord, 'i'), ACRONYMS[cleanWord]);
    }
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

export function parseNLTask(rawInput: string): ParsedTask {
  const now = new Date();

  const raw = (rawInput || '')
    .replace(/\b([ap])\s*\.\s*m\s*\.?(?=\s|[.,;:!?]|$)/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*\.\s*m\b/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*m\s*\./gi, (m, p1) => p1.toLowerCase() + 'm');

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

  // Spoken Tags ("tag work", "label gym")
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
      const colonListRe = /(?::|\s+namely\s+)\s*([a-zA-Z0-9\s,\-_*•]+(?:,\s*(?:and\s+)?[a-zA-Z0-9\s\-_*•]+|\s+and\s+[a-zA-Z0-9\s\-_*•]+))(?=\s*(?:\b(?:tomorrow|today|tonight|next|every|at\s+\d|am|pm|high|medium|low|p1|p2|p3|urgent|#|\.|$)))/i;
      sm = text.match(colonListRe);
    }
    if (sm) {
      const rawSubtasks = sm[1].trim();
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
    /\bwith\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|sound|push\s+notification)s?\b/i,
    /\bset\s+(?:a(?:n)?\s+)?(?:alarm|reminder)(?:\s+(?:for|at|to))?\b/i,
    /\band\s+(?:set\s+(?:a[n]?\s+)?(?:alarm|reminder)|remind\s+(?:me\s+)?(?:to\s+|about\s+)?|notify\s+(?:me\s+)?)\b/i,
    /\b(?:remind(?:\s+me)?(?:\s+(?:to|about|for|at))?|reminder(?:\s+(?:for|to|about|at))?)\b/i,
    /\balarm(?:\s+(?:for|at|on))?\b/i,
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
    [/\bhigh\b/i,                                                                        'high',   'High'],
    [/\bmedium\b/i,                                                                      'medium', 'Medium'],
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

  // Range patterns (e.g. "Monday to Saturday", "daily from mon to sat", "monday through friday")
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
  } else if (/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week)\b/i.test(text)) {
    const m = text.match(/\b(fortnightly|bi-?weekly|every\s+two\s+weeks|every\s+other\s+week)\b/i)!;
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
    const rangePattern = /\b(?:at\s+|from\s+|between\s+)?(\d{1,2})(?:[:\s](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\s*(?:to|-|until|till|and|through)\s*(\d{1,2})(?:[:\s](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/i;
    const rangeMatch = text.match(rangePattern);

    if (rangeMatch) {
      const hasAmPm = rangeMatch[3] || rangeMatch[6];
      const hasColon = rangeMatch[2] || rangeMatch[5];
      const hasKeyword = /\b(?:at|from|between)\b/i.test(rangeMatch[0]);
      if (hasAmPm || hasColon || hasKeyword) {
        const rawP2 = (rangeMatch[6] || '').toLowerCase().replace(/[^a-z]/g, '');
        const rawP1 = (rangeMatch[3] || '').toLowerCase().replace(/[^a-z]/g, '');
        const p2 = rawP2 || rawP1 || '';
        const p1 = rawP1 || (p2 && parseInt(rangeMatch[1], 10) < 12 ? p2 : '');
        const t1 = parseSingleTime(rangeMatch[1], rangeMatch[2], p1);
        const t2 = parseSingleTime(rangeMatch[4], rangeMatch[5], p2);
        timeSlot = `${t1.hh}:${t1.mm}`;
        endTimeSlot = `${t2.hh}:${t2.mm}`;
        registerToken('time', rangeMatch[0], `${t1.display} - ${t2.display}`);
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
    // Range formats
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
    }

    // Standard relative date keywords
    if (!dateResult) {
      if (/\btoday\b/i.test(text)) {
        const m = text.match(/\btoday\b/i)!; dateResult = new Date(now);
        registerToken('date', m[0], 'Today');
      } else if (/\b(tomorrow|tmr|tmrw|tomo)\b/i.test(text)) {
        const m = text.match(/\b(tomorrow|tmr|tmrw|tomo)\b/i)!;
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
        // Specific Month/Day formats
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
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              let candidate = new Date(now.getFullYear(), month - 1, day);
              if (candidate < today) candidate = new Date(now.getFullYear() + 1, month - 1, day);
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

  // 6. BUILD CLEAN TITLE
  let title = raw;
  const sortedTokens = [...tokens].sort((a, b) => b.start - a.start);
  for (const tok of sortedTokens) {
    title = title.slice(0, tok.start) + title.slice(tok.end);
  }
  title = cleanTaskTitle(title);
  if (!title) title = cleanTaskTitle(raw) || raw.trim();

  // 7. SMART SEMANTIC DOMAIN TAG INFERENCE
  if (extractedTags.length === 0) {
    const combinedContext = `${title} ${raw}`.toLowerCase();
    if (/\b(lab|report|assignment|exam|exams|lecture|lectures|professor|prof|quiz|viva|midsem|endsem|semester|syllabus|attendance|bunk|hod|faculty|coursework|homework|thesis|dissertation|classes|class|college|university|campus|operating\s+systems?|os|dbms|computer\s+networks?|cn|theory\s+of\s+computation|toc|physics|chemistry|math|mathematics|calculus|biology)\b/i.test(combinedContext)) {
      extractedTags.push('college');
    } else if (/\b(workout|gym|chest|back|legs|biceps|triceps|shoulders|push\s+day|pull\s+day|leg\s+day|squat|squats|bench\s+press|bench|deadlift|deadlifts|cardio|treadmill|hiit|protein|creatine|sets|reps|abs|fitness)\b/i.test(combinedContext)) {
      extractedTags.push('gym');
    } else if (/\b(leetcode|dsa|interview|interviews|resume|cv|system\s+design|sql|dbms|coding|mock\s+interview|oops|algorithm|algorithms|codeforces|hackerrank|aptitude|offer\s+letter|hr\s+round|campus\s+placement|github|pr|bug\s+fix)\b/i.test(combinedContext)) {
      extractedTags.push('placement');
    } else if (/\b(bill|bills|electricity\s+bill|rent|recharge|fee|fees|emi|credit\s+card|salary|tax|taxes|investment|sip|bank\s+transfer|transfer\s+money|pay\s+tuition)\b/i.test(combinedContext)) {
      extractedTags.push('finance');
    } else if (/\b(doctor|dentist|medicine|medicines|pills|vitamins|appointment|checkup|hospital|clinic|blood\s+test|prescription|physio)\b/i.test(combinedContext)) {
      extractedTags.push('health');
    } else if (/\b(groceries|grocery|haircut|laundry|clean\s+room|call\s+(?:mom|dad|mummy|papa|mother|father|parents|bro|brother|sister)|birthday|anniversary|shopping)\b/i.test(combinedContext)) {
      extractedTags.push('personal');
    }
  }

  // 8. SMART PRIORITY INFERENCE
  const hasExplicitPriority = tokens.some(t => t.type === 'priority');
  if (!hasExplicitPriority) {
    const urgencyContext = `${title} ${raw}`.toLowerCase();
    if (/\b(urgent|critical|emergency|asap|deadline|blocker|fire|exam|midsem|endsem|interview|doctor|hospital|immediately)\b/i.test(urgencyContext)) {
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
    } else if (/\b(meeting|sync|standup|interview|call\s+with|discussion|1:1|one\s+on\s+one)\b/i.test(durationContext)) {
      durationMinutes = 30;
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

export function formatDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate().toString().padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
    const h = parseInt(timeParts[0], 10);
    const m = timeParts.length > 1 ? parseInt(timeParts[1], 10) : 0;
    if (isNaN(h)) return str;
    const ampm = h >= 12 ? 'PM' : 'AM';
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

  if (timeSlot && typeof timeSlot === 'string') {
    const cleanSlot = timeSlot.trim();
    const parts = cleanSlot.split(/[-–—]|(?:\s+to\s+)/i).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
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

      const start = parseTimeToMinutes(parts[0]);
      const end = parseTimeToMinutes(parts[1]);
      if (start !== null && end !== null) {
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
    const combinedMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b/i);
    if (combinedMatch) {
      const hrs = parseFloat(combinedMatch[1]);
      const mins = parseInt(combinedMatch[2], 10);
      return Math.round(hrs * 60 + mins);
    }

    const hoursMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    if (hoursMatch) {
      const hrs = parseFloat(hoursMatch[1]);
      if (hrs > 0 && hrs <= 24) {
        return Math.round(hrs * 60);
      }
    }

    const minsMatch = raw.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
    if (minsMatch) {
      const mins = parseInt(minsMatch[1], 10);
      if (mins > 0 && mins <= 720) {
        return mins;
      }
    }
  }

  return 25;
}
