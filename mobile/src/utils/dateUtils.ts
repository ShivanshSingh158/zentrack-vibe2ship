// ─── NL Task Parser — Best-in-Class NLP ────────────────────────────────────────
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
// Returns:    parsed fields + token spans for live inline text highlighting

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_SHORT  = ['sun','mon','tue','wed','thu','fri','sat'];
const MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LONG  = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/**
 * Alternate / common typo spellings → canonical 3-letter index
 * Lets users write "sept", "octo", "dece", "janu" etc. and still get a match.
 */
const MONTH_ALIASES: Record<string, number> = {
  // Jan
  jan:1,january:1,janu:1,
  // Feb
  feb:2,february:2,febr:2,
  // Mar
  mar:3,march:3,
  // Apr
  apr:4,april:4,
  // May
  may:5,
  // Jun
  jun:6,june:6,
  // Jul
  jul:7,july:7,
  // Aug
  aug:8,august:8,
  // Sep  — most common alternate is "sept"
  sep:9,sept:9,september:9,
  // Oct
  oct:10,octo:10,october:10,octu:10,
  // Nov
  nov:11,november:11,
  // Dec
  dec:12,dece:12,december:12,
};

/** All spellings the regex pattern will accept (for use inside RegExp alternation) */
const ALL_MONTH_FORMS = Object.keys(MONTH_ALIASES).sort((a,b) => b.length - a.length);

/** A single detected token in the raw text (for inline highlighting) */
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
  recurrenceRule: { type: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[] } | null;
  multiDays?: number;
  /** Auto-extracted #hashtag values, lowercased, without the # */
  tags?: string[];
  /** Parsed duration in minutes (e.g. "for 45m" → 45, "1h30m" → 90) */
  durationMinutes?: number | null;
  /** Flag indicating high-priority scheduled reminder */
  isReminder?: boolean;
  /** Auto-extracted subtasks list */
  subtasks?: string[];
  /** Auto-detected location reminder configuration */
  locationReminder?: any;
  /** Auto-detected location name */
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
  const mLow = monthStr.toLowerCase().trim();
  // Try alias map first (handles 'sept', 'august', 'octu', etc.)
  const monthNum = MONTH_ALIASES[mLow] ?? MONTH_ALIASES[mLow.slice(0, 3)];
  if (!monthNum || dayNum < 1 || dayNum > 31) return null;
  const monthIdx = monthNum - 1; // 0-indexed for Date constructor
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = new Date(now.getFullYear(), monthIdx, dayNum);
  if (candidate < today) candidate = new Date(now.getFullYear() + 1, monthIdx, dayNum);
  return candidate;
}

/**
 * Strips conversational command prefixes, carrier words, filler phrases,
 * trailing prepositions, normalizes inverted voice grammar (e.g. "DSA study" -> "Study DSA"),
 * capitalizes sentences, and preserves standard tech/academic acronyms.
 */
export function cleanTaskTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let t = rawTitle.trim();

  // 1. Strip assistant / conversational wrappers
  t = t.replace(/^(?:hey\s+)?sara[,:\s]+/i, '');
  t = t.replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, '');
  t = t.replace(/^please\s+(?:kindly\s+)?/i, '');
  t = t.replace(/^kindly\s+/i, '');

  // 2. Strip task creation command prefixes & conversational preambles
  const commandPrefixes = [
    // Create variations
    /^create\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^create\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^create\s+(?:a\s+|an\s+)?/i,
    // Add variations
    /^add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^add\s+(?:a\s+|an\s+)?/i,
    // Make variations
    /^make\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^make\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^make\s+(?:a\s+|an\s+)?/i,
    // Schedule variations
    /^schedule\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s+(?:to|for|of|about|regarding)\s+/i,
    /^schedule\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|event|item|reminder|entry|todo|to-do)\s*[:\-]?\s+/i,
    /^schedule\s+(?:a\s+|an\s+)?/i,
    // Set / Set up variations
    /^set\s+(?:up\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:reminder|alarm|task|event)\s+(?:to|for|at|about)\s+/i,
    /^set\s+(?:up\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:reminder|alarm|task|event)\s*[:\-]?\s+/i,
    /^set\s+alarm\s+(?:for|at|to)\s+/i,
    // Remind variations (with conversational clauses like "remind me that I have to")
    /^remind\s+me\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|that|to|for|about)?\s*/i,
    /^remind\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|that|to|for|about)?\s*/i,
    /^reminder\s*[:\-]\s*/i,
    /^reminder\s+(?:to|for|about)\s+/i,
    // Remember / Don't forget / Ensure
    /^(?:don'?t\s+forget|dont\s+forget)\s+(?:that\s+(?:i|we)\s+(?:have|need|got|gotta)\s+to|to\s+)?/i,
    /^remember\s+(?:to\s+)?/i,
    /^(?:make|be)\s+sure\s+to\s+/i,
    // Conversational preambles & intentions
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:was\s+thinking\s+(?:of|about)|was\s+planning\s+(?:to|on)|am\s+planning\s+(?:to|on)|plan\s+to|planning\s+(?:to|on))\s+/i,
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:am\s+supposed\s+to|are\s+supposed\s+to|supposed\s+to)\s+/i,
    /^(?:that\s+)?(?:(?:i|we)\s+)?(?:have\s+got\s+to|'ve\s+gotta|have\s+to|need\s+to|want\s+to|wanna|wish\s+to|just\s+need\s+to|got\s+to|gotta)\s+/i,
    /^(?:that\s+)?(?:i|we)\s+(?:should|must)\s+/i,
    /^(?:gotta|wanna|need\s+to)\s+/i,
    /^(?:hit|do)\s+(?:the\s+)?(?=(?:chest|back|legs|biceps|triceps|shoulders|push|pull|gym|workout)\b)/i,
    /^(?:bhai|yaar|bro|dude)[,\s]+/i,
    // Logging / writing
    /^(?:put|write|note|take)\s+down\s+(?:a\s+|the\s+)?(?:task\s+)?(?:to|for)?\s*/i,
    /^(?:log|record|enter|track)\s+(?:a\s+|the\s+)?(?:task\s+)?(?:to|for)?\s*/i,
    // Prefixes like "todo:", "task:", "new task:"
    /^(?:to-?do|task|action\s+item|new\s+task|note)\s*[:\-]\s*/i,
    // Hinglish command prefixes
    /^(?:mujhe\s+)?(?:ek\s+)?task\s+(?:bana\s+(?:do|o)|add\s+(?:karo|kar\s+do)|create\s+(?:karo|kar\s+do))\s*/i,
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

  // 2b. Gerund-to-imperative action verb normalization
  // Spoken dictation frequently starts with "-ing" verbs (e.g. "submitting lab report", "studying operating systems", "calling mom")
  const GERUNDS: Record<string, string> = {
    submitting: 'submit',
    studying: 'study',
    calling: 'call',
    buying: 'buy',
    paying: 'pay',
    sending: 'send',
    scheduling: 'schedule',
    revising: 'revise',
    writing: 'write',
    reading: 'read',
    booking: 'book',
    cleaning: 'clean',
    practicing: 'practice',
    checking: 'check',
    meeting: 'meet',
    fixing: 'fix',
    working: 'work',
    cooking: 'cook',
    attending: 'attend',
    completing: 'complete',
    finishing: 'finish',
    preparing: 'prepare',
    ordering: 'order',
    learning: 'learn',
    visiting: 'visit',
    taking: 'take',
    doing: 'do',
    going: 'go',
    watching: 'watch',
    deploying: 'deploy',
    reviewing: 'review',
    organizing: 'organize',
    printing: 'print',
    updating: 'update',
    renewing: 'renew',
    canceling: 'cancel',
    cancelling: 'cancel',
    exercising: 'exercise',
    washing: 'wash',
    ironing: 'iron',
    emailing: 'email',
    messaging: 'message',
    texting: 'text',
    dropping: 'drop',
    picking: 'pick',
    collecting: 'collect',
    downloading: 'download',
    uploading: 'upload',
    installing: 'install',
    uninstalling: 'uninstall',
    testing: 'test',
    debugging: 'debug',
    discussing: 'discuss',
    presenting: 'present',
    tracking: 'track',
    logging: 'log',
    registering: 'register',
    applying: 'apply',
    filing: 'file',
    signing: 'sign',
    verifying: 'verify',
    confirming: 'confirm',
    informing: 'inform',
    notifying: 'notify',
    contacting: 'contact',
    following: 'follow',
    researching: 'research',
    solving: 'solve',
    building: 'build',
    designing: 'design',
    drafting: 'draft',
    editing: 'edit',
    sharing: 'share',
    returning: 'return',
    reporting: 'report',
    joining: 'join',
    packing: 'pack',
    charging: 'charge',
    backing: 'back',
    saving: 'save',
    archiving: 'archive',
    exporting: 'export',
  };

  const firstWordMatch = t.match(/^([a-zA-Z]+)(.*)$/s);
  if (firstWordMatch) {
    const fw = firstWordMatch[1].toLowerCase();
    if (GERUNDS[fw]) {
      t = `${GERUNDS[fw]}${firstWordMatch[2]}`;
    }
  }

  // 3. Strip leading connector prepositions and articles left over
  t = t.replace(/^(?:to|for|about|of|regarding|that|a|an|the)\s+/i, '').trim();

  // 4. Strip trailing conversational / filler suffixes & Hinglish
  t = t.replace(/\s+(?:please|as\s+well|also|too|for\s+me|bhai|yaar|bro)$/i, '').trim();
  t = t.replace(/\s+(?:dena|deni|bhejna|bhejni|lena|leni|jana|aana|khatam\s+karna)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:karna|krna|karni|krni)\s+(?:hai|h)$/i, '').trim();
  t = t.replace(/\s+(?:kar\s+dena|kar\s+lena|de\s+dena|kar\s+do|karo)$/i, '').trim();

  // 4b. Strip trailing am/pm, p.m., a.m., time indicators left over from speech
  t = t.replace(/\s+(?:[ap]\.?m\.?|am|pm|o'?clock)$/i, '').trim();

  // 4c. Strip trailing "task for everyday", "task to ...", "task" (e.g. "chest workout task for everyday" -> "chest workout")
  t = t.replace(/\s+(?:task|todo|to-do|item|reminder)(?:\s+(?:for|to|at|on|about))?(?:\s+(?:everyday|daily|each\s+day|today|tomorrow))?$/i, '').trim();
  t = t.replace(/\s+(?:for\s+everyday|for\s+daily|everyday|daily)$/i, '').trim();

  // 4d. Strip trailing orphaned period-of-day words left over
  t = t.replace(/\s+(?:in\s+the\s+)?(?:early\s+morning|morning|afternoon|evening|night|tonight|today|tomorrow|yesterday)$/i, '').trim();
  t = t.replace(/\s+(?:shaam\s+ko|sham\s+ko|shaam|sham|subah\s+ko|subah|dopahar\s+ko|dopahar|raat\s+ko|raat)$/i, '').trim();

  // 4e. Strip "with alarm", "with a reminder", "with notification", "with an alert" etc.
  // These are the most common voice speech modifiers that bleed into titles
  t = t.replace(/\s+with\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|buzz|ping|bell|chime|sound|vibration|notify|toast|pop.?up|snooze|push\s+notification)s?$/i, '').trim();
  t = t.replace(/\s+(?:with\s+)?(?:set(?:\s+an?)?\s+)?(?:alarm|reminder|alert|notification)\s+(?:for|at|on|to)\s*$/i, '').trim();
  // Strip "and remind me", "and set alarm", "and notify me" trailing clauses
  t = t.replace(/\s+and\s+(?:remind\s+(?:me\s+)?(?:to\s+|about\s+)?|set\s+(?:a[n]?\s+)?(?:alarm|reminder)|notify\s+(?:me\s+)?)$/i, '').trim();
  // Strip trailing "at 4:30", "at 4pm" (bare time specifiers left after token strip)
  t = t.replace(/\s+at\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?$/i, '').trim();
  // Strip trailing "today", "tomorrow", "tonight" when lonely at end
  t = t.replace(/\s+(?:today|tomorrow|tonight|aaj|kal|parso)$/i, '').trim();
  // Strip trailing "high priority", "medium priority" alone at end
  t = t.replace(/\s+(?:high|medium|low)\s+priority$/i, '').trim();
  // Strip trailing "urgent", "asap"
  t = t.replace(/\s+(?:urgent|asap|important)$/i, '').trim();

  // 5. Strip trailing dangling prepositions and connectors
  t = t.replace(/\s+(?:at|from|to|by|on|in|for|with|until|till|and|or|during|of|about)$/i, '').trim();
  t = t.replace(/^[\s,.:;\-]+|[\s,.:;\-]+$/g, '').trim();

  // 6. Inverted action normalization (SOV -> SVO for task intents)
  // e.g. "dsa study" -> "study dsa", "physics study" -> "study physics"
  const studyMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+study$/i);
  if (studyMatch && studyMatch[1].toLowerCase() !== 'case') {
    t = `study ${studyMatch[1]}`;
  }

  const practiceMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+practice$/i);
  if (practiceMatch) {
    t = `practice ${practiceMatch[1]}`;
  }

  const revisionMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+revision$/i);
  if (revisionMatch) {
    t = `revise ${revisionMatch[1]}`;
  }

  const prepMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+(?:prep|preparation)$/i);
  if (prepMatch) {
    t = `prep for ${prepMatch[1]}`;
  }

  const subMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+(?:submission|submit)$/i);
  if (subMatch) {
    t = `submit ${subMatch[1]}`;
  }

  const payMatch = t.match(/^([a-zA-Z0-9+#]+(?:\s+[a-zA-Z0-9+#]+)?)\s+(?:payment|pay)$/i);
  if (payMatch) {
    t = `pay ${payMatch[1]}`;
  }

  // 7. Acronym normalization & smart title capitalization
  const ACRONYMS: Record<string, string> = {
    'dsa': 'DSA',
    'dbms': 'DBMS',
    'os': 'OS',
    'ai': 'AI',
    'ml': 'ML',
    'dl': 'DL',
    'nlp': 'NLP',
    'cn': 'CN',
    'oop': 'OOP',
    'oops': 'OOPs',
    'sql': 'SQL',
    'api': 'API',
    'apis': 'APIs',
    'html': 'HTML',
    'css': 'CSS',
    'js': 'JS',
    'ts': 'TS',
    'pr': 'PR',
    'sde': 'SDE',
    'hr': 'HR',
    'ui': 'UI',
    'ux': 'UX',
    'pdf': 'PDF',
    'llm': 'LLM',
    'cgpa': 'CGPA',
    'sgpa': 'SGPA',
    'aws': 'AWS',
    'gcp': 'GCP',
    'toc': 'TOC',
    'ppl': 'PPL',
    'hiit': 'HIIT',
    '1rm': '1RM',
    'bmi': 'BMI',
    'vad': 'VAD',
    'rest': 'REST',
    'crud': 'CRUD',
    'leetcode': 'LeetCode',
    'gfg': 'GFG',
    'codeforces': 'Codeforces',
    'codechef': 'CodeChef',
    'nptel': 'NPTEL',
    'neet': 'NEET',
    'gate': 'GATE',
    'cat': 'CAT',
    'upsc': 'UPSC',
    'iit': 'IIT',
    'nit': 'NIT',
    'bits': 'BITS',
    'gre': 'GRE',
    'toefl': 'TOEFL',
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

export function parseNLTask(rawInput: string): ParsedTask {
  const now = new Date();

  // Normalize spoken speech artifacts across the entire parser (e.g. "p.m.", "a.m.", "p. m.", "a. m.", "pm.", "am.")
  // so that raw and text character indices align 1:1 without leaving trailing letters in the title
  const raw = (rawInput || '')
    .replace(/\b([ap])\s*\.\s*m\s*\.?(?=\s|[.,;:!?]|$)/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*\.\s*m\b/gi, (m, p1) => p1.toLowerCase() + 'm')
    .replace(/\b([ap])\s*m\s*\./gi, (m, p1) => p1.toLowerCase() + 'm');

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

  // ── 0a. SPOKEN TAGS / LABELS ("tag work", "label gym", "hashtag study") ────
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

  // ── 0b. SUBTASKS ("with subtasks A, B, C", "subtasks: 1, 2, 3", "checklist: ...") ───
  const extractedSubtasks: string[] = [];
  {
    const subtaskRe = /\b(?:with\s+subtasks?|subtasks?\s*(?:are|include)?|sub-tasks?\s*(?:are|include)?|checklist|with\s+items?)\s*[:\-]?\s*([^.]+?)(?=\s*(?:\b(?:tomorrow|today|tonight|next|every|at\s+\d|am|pm|high|medium|low|p1|p2|p3|urgent|#|\.|$)))/i;
    const sm = text.match(subtaskRe);
    if (sm) {
      const rawSubtasks = sm[1].trim();
      // Split on comma, "and", semicolon, or numbered bullets "1. ", "2) "
      const items = rawSubtasks
        .split(/(?:,\s*(?:and\s+)?|\s+and\s+|\s*;\s*|(?:^|\s+)\d+[\.\)]\s*)/i)
        .map(s => s.trim().replace(/^[\-•*]\s*/, ''))
        .filter(s => s.length > 0);
      if (items.length > 0) {
        extractedSubtasks.push(...items);
        registerToken('subtask', sm[0], `${items.length} Subtask${items.length > 1 ? 's' : ''}`);
      }
    }
  }

  // ── 0c. LOCATION TRIGGER ("at gym", "in college", "at library", "at home", etc.) ───
  let locationReminder: any = null;
  let locationName: string | undefined = undefined;
  {
    const locRe = /\b(?:at|in|near)\s+(?:the\s+)?(gym|fitness\s+center|sports\s+complex|campus|college|university|school|classroom|lecture\s+hall|library|hostel|lab|laboratory|office|work|workplace|home|house|canteen|cafeteria|market|supermarket|grocery\s+store|mall|store|pharmacy|medical\s+store|clinic|hospital|bank|post\s+office|airport|station)\b/i;
    const lm = text.match(locRe);
    if (lm) {
      const rawLoc = lm[1].trim();
      const capitalized = rawLoc.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      locationName = capitalized;
      locationReminder = {
        placeName: capitalized,
        triggerType: 'arrive',
        radius: 150,
      };
      registerToken('location', lm[0], `📍 ${capitalized}`);
    }
  }

  // ── 0d. REMINDER INTENT ("remind", "remind me to", "with alarm", "with reminder", etc.) ───
  let isReminder = false;
  // Order matters: greedier / longer patterns first so "with alarm" is consumed
  // before the shorter bare "alarm" pattern fires, preventing it from leaking into the title.
  const reminderPatterns = [
    // "with alarm", "with an alarm", "with a reminder", "with notification"
    /\bwith\s+(?:a(?:n)?\s+)?(?:alarm|reminder|alert|notification|buzz|ping|bell|chime|sound|vibration|push\s+notification)s?\b/i,
    // "set alarm", "set a reminder"
    /\bset\s+(?:a(?:n)?\s+)?(?:alarm|reminder)(?:\s+(?:for|at|to))?\b/i,
    // "and set alarm", "and remind me", "and notify me"
    /\band\s+(?:set\s+(?:a[n]?\s+)?(?:alarm|reminder)|remind\s+(?:me\s+)?(?:to\s+|about\s+)?|notify\s+(?:me\s+)?)\b/i,
    // Core remind patterns
    /\b(?:remind(?:\s+me)?(?:\s+(?:to|about|for|at))?|reminder(?:\s+(?:for|to|about|at))?)\b/i,
    // Bare alarm (shortest match — must be last to avoid stripping "alarm" in task names)
    /\balarm(?:\s+(?:for|at|on))?\b/i,
    // Hinglish
    /\b(?:mujhe\s+yaad\s+dilana|yaad\s+dilana|yaad\s+rakhna)\b/i,
  ];
  for (const pat of reminderPatterns) {
    const m = text.match(pat);
    if (m) {
      isReminder = true;
      registerToken('reminder', m[0], '⏰ Reminder');
      // Don't break — consume ALL reminder phrases so none leak into title
      // Re-search on updated `text` (registerToken already blanked the match)
    }
  }

  // ── 1. PRIORITY ────────────────────────────────────────────
  // Supports: p:high !1 urgent 🔴🟡🟢 emoji flags  "low key"  "not urgent"  etc.
  const priorityPatterns: Array<[RegExp, 'high' | 'medium' | 'low', string]> = [
    // Explicit p: prefix
    [/\bp:(?:high|1|urgent|critical)\b/i,               'high',   'High'],
    [/\bp:(?:medium|2|mid|normal|med)\b/i,              'medium', 'Medium'],
    [/\bp:(?:low|3|someday|whenever)\b/i,               'low',    'Low'],
    // Bang shortcuts
    [/\b!1\b/,                                          'high',   'High'],
    [/\b!2\b/,                                          'medium', 'Medium'],
    [/\b!3\b/,                                          'low',    'Low'],
    // Emoji priority flags (must come before word patterns to take precedence)
    [/🔴|❗|🚨/,                                           'high',   'High'],   // red circle / exclamation / siren
    [/🟡|⚠️|⏰/,                                           'medium', 'Medium'], // yellow / warning / alarm
    [/🟢|✅|💤/,                                           'low',    'Low'],    // green / check / zzz
    // Keyword phrases (order matters: more specific first)
    [/\b(urgent|critical|asap|p1|fire|blocker|high\s+priority|highest\s+priority|super\s+important)\b/i, 'high',   'High'],
    [/\b(important|p2|medium\s+priority|mid\s+priority|kinda\s+important|semi.?urgent)\b/i,              'medium', 'Medium'],
    [/\b(low\s+priority|p3|someday|whenever|not\s+urgent|low\s+key|no\s+rush|chill|whenever\s+you\s+can|when\s+free)\b/i, 'low', 'Low'],
    // Single-word fallbacks (must be last to avoid false positives)
    [/\bhigh\b/i,                                       'high',   'High'],
    [/\bmedium\b/i,                                     'medium', 'Medium'],
  ];
  for (const [pat, pri, label] of priorityPatterns) {
    const m = text.match(pat);
    if (m) { priority = pri; registerToken('priority', m[0], label); break; }
  }

  // ── 2. DURATION ────────────────────────────────────────────
  // Supports: "for 45m"  "1h30m"  "half an hour"  "an hour"  "a couple hours"  "2.5h"
  const durationPatterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    // Natural English — must be before numeric patterns
    [/\bhalf\s+an?\s+hour\b/i,                                             _ => 30],
    [/\ban?\s+hour\s+and\s+a\s+half\b/i,                                  _ => 90],
    [/\ba\s+couple\s+(?:of\s+)?hours?\b/i,                                _ => 120],
    [/\ban?\s+hour\b/i,                                                    _ => 60],
    [/\ba\s+few\s+minutes?\b/i,                                           _ => 10],
    // Decimal hours: "2.5h" "1.5 hours"
    [/\b(\d+\.\d+)\s*h(?:(?:ou)?rs?)?\b/i,                              m => Math.round(parseFloat(m[1])*60)],
    // Compound: "for 1h30m"  "for 1h 30m"
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

  // Check Day Range patterns FIRST so specific day spans take precedence over generic daily/everyday
  // e.g. "daily from monday to friday", "monday to friday", "mon - fri", "monday through friday", "monday till friday"
  const rangePat = new RegExp(`\\b(?:(?:daily|everyday|every)\\s+)?(?:from\\s+)?${dayRegexStr}\\s+(?:to|-|through|till|until)\\s+${dayRegexStr}\\b`, 'i');
  const andPat   = new RegExp(`\\b(?:(?:daily|everyday|every)\\s+)?(?:from\\s+)?${dayRegexStr}\\s+(?:and|&)\\s+${dayRegexStr}\\b`, 'i');
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
  } else if (/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i.test(text)) {
    const m = text.match(/\b(every\s+weekday|every\s+workday|weekdays|workdays)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1,2,3,4,5] };
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], 'Weekdays');
  } else if (/\b(every\s*day|daily|each\s+day)\b/i.test(text)) {
    const m = text.match(/\b(every\s*day|daily|each\s+day)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: 1 }; dateResult = new Date(now);
    registerToken('recurrence', m[0], 'Daily');
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
  } else if (/\btwice\s+a\s+week\b/i.test(text)) {
    const m = text.match(/\btwice\s+a\s+week\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1, 4] }; // Mon + Thu
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], 'Twice a Week');
  } else if (/\bthree\s+times\s+a\s+week\b/i.test(text)) {
    const m = text.match(/\bthree\s+times\s+a\s+week\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] }; // Mon + Wed + Fri
    dateResult = nextWeekday(1);
    registerToken('recurrence', m[0], '3x a Week');
  } else if (/\b(every\s+morning|every\s+day\s+morning|morning\s+routine)\b/i.test(text)) {
    const m = text.match(/\b(every\s+morning|every\s+day\s+morning|morning\s+routine)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: 1 }; dateResult = new Date(now);
    if (!timeSlot) timeSlot = '09:00'; // default morning time
    registerToken('recurrence', m[0], 'Every Morning');
  } else if (/\b(every\s+evening|every\s+night|nightly)\b/i.test(text)) {
    const m = text.match(/\b(every\s+evening|every\s+night|nightly)\b/i)!;
    isRecurring = true; recurrenceRule = { type: 'daily', interval: 1 }; dateResult = new Date(now);
    if (!timeSlot) timeSlot = '21:00'; // default night time
    registerToken('recurrence', m[0], 'Every Evening');
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


  // ── 3. TIME (NUMERIC RANGES + SINGLE NUMERIC + HINGLISH BAJE + NAMED ALIASES) ──

  // 3a. Numeric time ranges: "at 6:30 am to 8:30 am", "from 10 am to 12 30 am", "between 2pm and 4pm", "from 10:00 to 12:30"
  if (!timeSlot) {
    const rangePattern = /\b(?:at\s+|from\s+|between\s+)?(\d{1,2})(?:[:\s](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\s*(?:to|-|until|till|and|through)\s*(\d{1,2})(?:[:\s](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/i;
    const rangeMatch = text.match(rangePattern);

    if (rangeMatch) {
      const hasAmPm = rangeMatch[3] || rangeMatch[6];
      const hasColon = rangeMatch[2] || rangeMatch[5];
      const hasKeyword = /\b(?:at|from|between)\b/i.test(rangeMatch[0]);
      // Guard against false positives like "chapter 1 to 2" unless time keywords, colons, or am/pm exist
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

  // 3b. Specific single numeric times: "at 5 p.m.", "5:00pm", "at 5:30", "at 5am"
  if (!timeSlot) {
    // Detect context period hint across whole text to disambiguate bare hours
    const hasEveningHint = /\b(?:evening|shaam|sham|night|raat|afternoon|dopahar)\b/i.test(text);
    const hasMorningHint = /\b(?:morning|subah)\b/i.test(text);

    // Check Hinglish "N baje" or "shaam N baje" first
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

    // 3c. Compound named times: "half past 3", "quarter to 4", "quarter past 6", "3 o'clock", "before lunch", "after lunch"
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

    // 3d. Smart AM/PM: bare "at 3" or "@ 3"
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

    // 3e. Standalone named time aliases (Fallback ONLY when no numeric time exists)
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
  } // end !timeSlot block

  // 3f. Period-of-Day Qualifier Absorption
  // If a specific timeSlot is already set, absorb redundant period-of-day phrases
  // so words like "evening", "morning", "in the evening" don't linger in the task title!
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

  // 4. DATE
  //
  // MONTH PATTERN — accepts ALL short, long, and alternate spellings:
  // jan/january/janu, feb/february, mar/march, apr/april, may, jun/june,
  // jul/july, aug/august, sep/sept/september, oct/octo/october, nov/november,
  // dec/dece/december
  const mPat = `(${ALL_MONTH_FORMS.join('|')})`;

  if (!dateResult) {
    // ── 4a. DATE RANGE — "16 aug to 19 aug", "aug 16 to sep 3", etc. ──────────
    // Must be detected BEFORE single-date patterns so the range token takes
    // priority and the title is cleaned correctly.
    //
    // Supported formats (any mix of short/long month names):
    //   DD Month to DD Month       → "16 aug to 19 aug"
    //   DD Month to DD Month YYYY  → "16 september to 25 october 2027"
    //   Month DD to Month DD       → "aug 16 to aug 19"
    //   Month DD to DD             → "aug 16 to 19"  (same month implied)
    //   DD to DD Month             → "16 to 19 aug"  (same month implied)
    {
      // Form 1: DD Month [YYYY] to DD Month [YYYY]
      const form1 = new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}(?:\\s+(\\d{4}))?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}(?:\\s+(\\d{4}))?\\b`,
        'i'
      );
      // Form 2: Month DD [YYYY] to Month DD [YYYY]
      const form2 = new RegExp(
        `\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\s+(?:to|-)\\s+${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`,
        'i'
      );
      // Form 3: Month DD to DD (same month, implicit)
      const form3 = new RegExp(
        `\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
        'i'
      );
      // Form 4: DD to DD Month (same month, implicit)
      const form4 = new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|-)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\b`,
        'i'
      );

      const rm1 = text.match(form1);
      const rm2 = text.match(form2);
      const rm3 = text.match(form3);
      const rm4 = text.match(form4);

      if (rm1) {
        // rm1[1]=startDay rm1[2]=startMonth rm1[3]=startYear? rm1[4]=endDay rm1[5]=endMonth rm1[6]=endYear?
        const startD = resolveMonthDay(rm1[2], parseInt(rm1[1], 10));
        const endD   = resolveMonthDay(rm1[5], parseInt(rm1[4], 10));
        if (startD && endD) {
          if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
          const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
          dateResult = startD; multiDays = span;
          const sM = rm1[2].slice(0,1).toUpperCase() + rm1[2].slice(1,3).toLowerCase();
          const eM = rm1[5].slice(0,1).toUpperCase() + rm1[5].slice(1,3).toLowerCase();
          registerToken('date', rm1[0], `${rm1[1]} ${sM} – ${rm1[4]} ${eM}`);
        }
      } else if (rm2) {
        // rm2[1]=startMonth rm2[2]=startDay rm2[3]=startYear? rm2[4]=endMonth rm2[5]=endDay rm2[6]=endYear?
        const startD = resolveMonthDay(rm2[1], parseInt(rm2[2], 10));
        const endD   = resolveMonthDay(rm2[4], parseInt(rm2[5], 10));
        if (startD && endD) {
          if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
          const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
          dateResult = startD; multiDays = span;
          const sM = rm2[1].slice(0,1).toUpperCase() + rm2[1].slice(1,3).toLowerCase();
          const eM = rm2[4].slice(0,1).toUpperCase() + rm2[4].slice(1,3).toLowerCase();
          registerToken('date', rm2[0], `${sM} ${rm2[2]} – ${eM} ${rm2[5]}`);
        }
      } else if (rm3) {
        // rm3[1]=month rm3[2]=startDay rm3[3]=endDay (same month)
        const startD = resolveMonthDay(rm3[1], parseInt(rm3[2], 10));
        const endD   = resolveMonthDay(rm3[1], parseInt(rm3[3], 10));
        if (startD && endD) {
          if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
          const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
          dateResult = startD; multiDays = span;
          const mL = rm3[1].slice(0,1).toUpperCase() + rm3[1].slice(1,3).toLowerCase();
          registerToken('date', rm3[0], `${mL} ${rm3[2]} – ${rm3[3]}`);
        }
      } else if (rm4) {
        // rm4[1]=startDay rm4[2]=endDay rm4[3]=month (same month)
        const startD = resolveMonthDay(rm4[3], parseInt(rm4[1], 10));
        const endD   = resolveMonthDay(rm4[3], parseInt(rm4[2], 10));
        if (startD && endD) {
          if (endD < startD) endD.setFullYear(endD.getFullYear() + 1);
          const span = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
          dateResult = startD; multiDays = span;
          const mL = rm4[3].slice(0,1).toUpperCase() + rm4[3].slice(1,3).toLowerCase();
          registerToken('date', rm4[0], `${rm4[1]} – ${rm4[2]} ${mL}`);
        }
      }
    }

    // ── 4b. Relative / named / shorthand date expressions ───────────────────
    if (!dateResult) {

    // ── Sub-day relative: "in 30 minutes", "in 2 hours", "in an hour" ─────────
    // Sets date=today + calculates absolute time from now
    if (!dateResult && /\bin\s+(\d+)\s*(?:mins?|minutes?)\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s*(?:mins?|minutes?)\b/i)!;
      const n = parseInt(m[1], 10);
      const then = new Date(now.getTime() + n * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2,'0')}:${then.getMinutes().toString().padStart(2,'0')}`;
      registerToken('date', m[0], `In ${n}m`);
    } else if (!dateResult && /\bin\s+an?\s+hour\b/i.test(text)) {
      const m = text.match(/\bin\s+an?\s+hour\b/i)!;
      const then = new Date(now.getTime() + 60 * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2,'0')}:${then.getMinutes().toString().padStart(2,'0')}`;
      registerToken('date', m[0], 'In 1h');
    } else if (!dateResult && /\bin\s+(\d+)\s*(?:hours?|hrs?)\b/i.test(text)) {
      const m = text.match(/\bin\s+(\d+)\s*(?:hours?|hrs?)\b/i)!;
      const n = parseInt(m[1], 10);
      const then = new Date(now.getTime() + n * 60 * 60 * 1000);
      dateResult = then;
      isReminder = true;
      if (!timeSlot) timeSlot = `${then.getHours().toString().padStart(2,'0')}:${then.getMinutes().toString().padStart(2,'0')}`;
      registerToken('date', m[0], `In ${n}h`);
    }

    // ── Hinglish date words ─────────────────────────────────────────────
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

    // ── Business / shorthand shortcuts ──────────────────────────────────
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

    // ── Context time-of-day date words ───────────────────────────────
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
    } else if (!dateResult && /\b(tomorrow|tmr|tmrw|tomo)\s+evening\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tmr|tmrw|tomo)\s+evening\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '18:00';
      registerToken('date', m[0], 'Tomorrow Evening');
    } else if (!dateResult && /\b(tomorrow|tmr|tmrw|tomo)\s+morning\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tmr|tmrw|tomo)\s+morning\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '09:00';
      registerToken('date', m[0], 'Tomorrow Morning');
    } else if (!dateResult && /\b(tomorrow|tmr|tmrw|tomo)\s+afternoon\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tmr|tmrw|tomo)\s+afternoon\b/i)!;
      dateResult = new Date(now); dateResult.setDate(dateResult.getDate() + 1);
      if (!timeSlot) timeSlot = '14:00';
      registerToken('date', m[0], 'Tomorrow Afternoon');
    } else if (!dateResult && /\b(tomorrow|tmr|tmrw|tomo)\s+night\b/i.test(text)) {
      const m = text.match(/\b(tomorrow|tmr|tmrw|tomo)\s+night\b/i)!;
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

    // ── Standard relative date keywords ────────────────────────────────
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
    } else if (/\b(EOW|end\s+of\s+(?:the\s+)?week)\b/i.test(text)) {
      const m = text.match(/\b(EOW|end\s+of\s+(?:the\s+)?week)\b/i)!;
      dateResult = nextWeekday(5); registerToken('date', m[0], 'End of Week');
    } else if (/\b(EOM|end\s+of\s+(?:the\s+)?month)\b/i.test(text)) {
      const m = text.match(/\b(EOM|end\s+of\s+(?:the\s+)?month)\b/i)!;
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
      // ── 4c. Specific single dates — with optional year + all month forms ────

      // With year: "Aug 15 2026", "15 Aug 2026", "15th August 2026"
      const mdYPat = new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(20\\d{2})\\b`, 'i');
      const dmYPat = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\s+(20\\d{2})\\b`, 'i');
      const mdYM = text.match(mdYPat);
      const dmYM = text.match(dmYPat);

      if (mdYM) {
        const monthNum = MONTH_ALIASES[mdYM[1].toLowerCase().trim()] ?? MONTH_ALIASES[mdYM[1].toLowerCase().trim().slice(0,3)];
        if (monthNum) {
          const d = new Date(parseInt(mdYM[3], 10), monthNum - 1, parseInt(mdYM[2], 10));
          dateResult = d;
          const mLabel = mdYM[1].charAt(0).toUpperCase() + mdYM[1].slice(1, 3).toLowerCase();
          registerToken('date', mdYM[0], `${mLabel} ${mdYM[2]}, ${mdYM[3]}`);
        }
      } else if (dmYM) {
        const monthNum = MONTH_ALIASES[dmYM[2].toLowerCase().trim()] ?? MONTH_ALIASES[dmYM[2].toLowerCase().trim().slice(0,3)];
        if (monthNum) {
          const d = new Date(parseInt(dmYM[3], 10), monthNum - 1, parseInt(dmYM[1], 10));
          dateResult = d;
          const mLabel = dmYM[2].charAt(0).toUpperCase() + dmYM[2].slice(1, 3).toLowerCase();
          registerToken('date', dmYM[0], `${dmYM[1]} ${mLabel}, ${dmYM[3]}`);
        }
      }

      // Without year: "Aug 15", "15 Aug", "sept 3", "3 octo"
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

      // ── Numeric date formats: DD/MM, DD/MM/YYYY, DD-MM-YYYY, DD.MM ─────────
      if (!dateResult) {
        // "16/8/2026" or "16-08-2026"
        const numericLong = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
        // "16/8" or "16.08"
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
    } // end standard relative block

    // ── First/last weekday of a specific month ────────────────────────────
    // "first monday of september", "last friday of this month", "last day of august"
    if (!dateResult) {
      const ordinalPat = new RegExp(
        `\\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+(${DAY_NAMES.join('|')}|${DAY_SHORT.join('|')}|day)\\s+of\\s+(?:(this|next)\\s+month|${mPat})\\b`,
        'i'
      );
      const ordM = text.match(ordinalPat);
      if (ordM) {
        const ordStr = ordM[1].toLowerCase();
        const dayStr = ordM[2].toLowerCase();
        const monthRef = ordM[3] ? ordM[3].toLowerCase() : null; // "this" or "next"
        const monthName = ordM[4] ?? null; // e.g. "september"

        // Resolve the month
        let targetMonth = now.getMonth();
        let targetYear = now.getFullYear();
        if (monthRef === 'next') { targetMonth += 1; if (targetMonth > 11) { targetMonth = 0; targetYear++; } }
        else if (monthName) {
          const mn = MONTH_ALIASES[monthName.toLowerCase()] ?? MONTH_ALIASES[monthName.toLowerCase().slice(0,3)];
          if (mn) { targetMonth = mn - 1; if (targetMonth < now.getMonth()) targetYear++; }
        }

        // "last day of" = end of month
        if (dayStr === 'day' && (ordStr === 'last' || ordStr === '4th')) {
          dateResult = new Date(targetYear, targetMonth + 1, 0);
          registerToken('date', ordM[0], `Last Day of Month`);
        } else {
          // Resolve target weekday
          const di = DAY_NAMES.findIndex(d => dayStr.startsWith(d)) !== -1
            ? DAY_NAMES.findIndex(d => dayStr.startsWith(d))
            : DAY_SHORT.findIndex(d => dayStr.startsWith(d));
          if (di !== -1) {
            const ordinal = { first:1,'1st':1, second:2,'2nd':2, third:3,'3rd':3, fourth:4,'4th':4, last:-1 }[ordStr] || 1;
            const firstOfMonth = new Date(targetYear, targetMonth, 1);
            const firstDow = firstOfMonth.getDay();
            let offset = (di - firstDow + 7) % 7;
            if (ordinal === -1) {
              // last weekday: start from end of month
              const lastOfMonth = new Date(targetYear, targetMonth + 1, 0);
              const lastDow = lastOfMonth.getDay();
              offset = (di - lastDow + 7) % 7;
              dateResult = new Date(targetYear, targetMonth + 1, -offset);
            } else {
              dateResult = new Date(targetYear, targetMonth, 1 + offset + (ordinal - 1) * 7);
            }
            const ordLabel = { 1:'1st',2:'2nd',3:'3rd',4:'4th','-1':'Last' }[ordinal] || ordStr;
            const dayLabel = DAY_NAMES[di].charAt(0).toUpperCase() + DAY_NAMES[di].slice(1);
            registerToken('date', ordM[0], `${ordLabel} ${dayLabel}`);
          }
        }
      }
    }
    } // end if (!dateResult) for relative block

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
  title = cleanTaskTitle(title);
  if (!title) title = cleanTaskTitle(raw) || raw.trim();

  // 6. SMART SEMANTIC DOMAIN TAG INFERENCE
  // If the user didn't explicitly type or say a tag (#tag or tag: ...),
  // automatically categorize the task using high-precision domain vocabulary.
  if (extractedTags.length === 0) {
    const combinedContext = `${title} ${raw}`.toLowerCase();

    // Academic / College
    if (/\b(lab|report|assignment|exam|exams|lecture|lectures|professor|prof|quiz|viva|midsem|endsem|semester|syllabus|attendance|bunk|hod|faculty|coursework|homework|thesis|dissertation|classes|class|college|university|campus|operating\s+systems?|os|dbms|computer\s+networks?|cn|theory\s+of\s+computation|toc|physics|chemistry|math|mathematics|calculus|biology)\b/i.test(combinedContext)) {
      extractedTags.push('college');
    }
    // Fitness / Gym
    else if (/\b(workout|gym|chest|back|legs|biceps|triceps|shoulders|push\s+day|pull\s+day|leg\s+day|squat|squats|bench\s+press|bench|deadlift|deadlifts|cardio|treadmill|hiit|protein|creatine|sets|reps|abs|fitness)\b/i.test(combinedContext)) {
      extractedTags.push('gym');
    }
    // Career / Placement / Code
    else if (/\b(leetcode|dsa|interview|interviews|resume|cv|system\s+design|sql|dbms|coding|mock\s+interview|oops|algorithm|algorithms|codeforces|hackerrank|aptitude|offer\s+letter|hr\s+round|campus\s+placement|github|pr|bug\s+fix)\b/i.test(combinedContext)) {
      extractedTags.push('placement');
    }
    // Finance / Bills
    else if (/\b(bill|bills|electricity\s+bill|rent|recharge|fee|fees|emi|credit\s+card|salary|tax|taxes|investment|sip|bank\s+transfer|transfer\s+money|pay\s+tuition)\b/i.test(combinedContext)) {
      extractedTags.push('finance');
    }
    // Health / Medical
    else if (/\b(doctor|dentist|medicine|medicines|pills|vitamins|appointment|checkup|hospital|clinic|blood\s+test|prescription|physio)\b/i.test(combinedContext)) {
      extractedTags.push('health');
    }
    // Personal / Errands / Family
    else if (/\b(groceries|grocery|haircut|laundry|clean\s+room|call\s+(?:mom|dad|mummy|papa|mother|father|parents|bro|brother|sister)|birthday|anniversary|shopping)\b/i.test(combinedContext)) {
      extractedTags.push('personal');
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
 *
 * Handles:
 * - Numbered lists: "1. Task one 2. Task two" or "(1) Task one (2) Task two"
 * - Bullet points / newlines: "Task one\nTask two" or "• Task one • Task two"
 * - Conjunction transitions: "and also", "also", "and then", "then", "followed by"
 * - Compound "and" where both clauses contain actionable task verbs or time/date tokens
 * - Semicolon separated lists: "Task one; Task two"
 */
export function parseNLTasks(raw: string): ParsedTask[] {
  if (!raw || !raw.trim()) return [];
  const text = raw.trim();

  // 1. Check for numbered lists: "1. ... 2. ..." or "1) ... 2) ..."
  if (/(?:^|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/.test(text)) {
    const parts = text.split(/(?:^|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(p => parseNLTask(p.trim())).filter(t => t.title.length > 0);
    }
  }

  // 2. Check for newlines or bullet points
  if (/[\n•*]\s*/.test(text)) {
    const parts = text.split(/[\n•*]\s*/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(p => parseNLTask(p.trim())).filter(t => t.title.length > 0);
    }
  }

  // 3. Check for semicolons
  if (/;\s*/.test(text)) {
    const parts = text.split(/;\s*/).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(p => parseNLTask(p.trim())).filter(t => t.title.length > 0);
    }
  }

  // 4. Check for compound transitional connectors: "and also", "and then", "additionally", "followed by"
  const transitionRegex = /\b(?:and\s+also|and\s+then|additionally|followed\s+by)\b/i;
  if (transitionRegex.test(text)) {
    const parts = text.split(transitionRegex).filter(p => p.trim().length > 1);
    if (parts.length > 1) {
      return parts.map(p => parseNLTask(p.trim())).filter(t => t.title.length > 0);
    }
  }

  // 5. Check for "and" / ", and " when both left and right contain task action verbs or time/date tokens
  // E.g.: "Gym workout at 6am and study physics tomorrow 10am"
  const taskVerbPattern = /\b(?:create|add|make|remind|buy|call|meet|submit|finish|complete|do|start|go|workout|study|prepare|clean|read|write|email|send|schedule|review|pay|attend|check|update|fix|code|order|take|cook|wash|learn|practice|visit|revise)\b/i;
  const tokenHintPattern = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|every|at\s+\d|am|pm|p1|p2|p3|urgent|high\s+priority|reminder|alarm|#)\b/i;

  const andSplitParts = text.split(/,\s*and\s+|\s+and\s+/i);
  if (andSplitParts.length > 1) {
    // Verify that every segment looks like a distinct task (has a verb OR a token hint)
    const allLookLikeTasks = andSplitParts.every(part => {
      const p = part.trim();
      return p.length >= 3 && (taskVerbPattern.test(p) || tokenHintPattern.test(p));
    });

    if (allLookLikeTasks) {
      return andSplitParts.map(p => parseNLTask(p.trim())).filter(t => t.title.length > 0);
    }
  }

  // Default: single task parse
  return [parseNLTask(text)];
}

/**
 * Formats a RecurrenceRule into a concise, human-friendly label.
 * E.g.: "Mon – Fri", "Every Day", "Weekends", "Mon, Wed, Fri", "Weekly", "Monthly", "Every 3d".
 */
export function formatRecurrenceLabel(rule?: { type?: string; interval?: number; daysOfWeek?: number[] } | null): string {
  if (!rule) return 'Repeat';
  if (rule.type === 'daily') return 'Every Day';
  if (rule.type === 'weekly') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const sorted = [...rule.daysOfWeek].sort((a, b) => a - b);
      if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
        return 'Mon – Fri';
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
  return rule.type ? rule.type.charAt(0).toUpperCase() + rule.type.slice(1) : 'Repeat';
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

/**
 * Format any JS Date object to local "YYYY-MM-DD" string.
 * CRITICAL: Never use date.toISOString().slice(0, 10) because toISOString() shifts to UTC,
 * which shows the previous day before 5:30 AM in IST or other positive timezones!
 */
export function formatLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayLocalDateStr(): string {
  return formatLocalDateStr(new Date());
}
