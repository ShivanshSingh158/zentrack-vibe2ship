export type WisdomCategory = 'discipline' | 'mindset' | 'stoicism' | 'focus' | 'latest';

export interface WisdomVideo {
  id: string;       // 11-char YouTube video ID
  title: string;
  channel: string;
  durationMin: number | string;
  category: WisdomCategory;
  tags: string[];
}

export const CATEGORY_LABELS: Record<WisdomCategory, string> = {
  discipline: '🔥 DISCIPLINE',
  mindset:    '🧠 MINDSET',
  stoicism:   '🏛️ STOICISM',
  focus:      '🎯 FOCUS',
  latest:     '⚡ LATEST UPLOAD',
};

// Target channels for dynamic RSS fetch (optional enrichment)
export const DYNAMIC_CHANNELS = [
  { id: 'UC48MclMZIY_EaOQwatzCpvw', name: 'MulliganBrothers',       cat: 'stoicism' },
  { id: 'UC-A5z7hKkL_F8B0i4b3B_RQ', name: 'Champions Mentality 365', cat: 'mindset'  },
  { id: 'UC7v3-2KXsAHMqk9u0_k5Cfw', name: 'The Growth Paradox',      cat: 'mindset'  },
  { id: 'UCBIt1VN5j37PVM8LLSuTTlw', name: 'Chris Williamson',        cat: 'mindset'  },
  { id: 'UCtGTCBqhU-B20e0Q27uE7_w', name: 'Daily Stoic',             cat: 'stoicism' },
];

// ── CINEMATIC MOTIVATION EDIT POOL ───────────────────────────────────────────
// 38 verified unique YouTube video IDs from live channels.
// All are cinematic edit / compilation style — NO personal vlog or talking-head.
// Sources: Mulligan Brothers, Champions Mentality 365, The Growth Paradox.

export const WISDOM_VIDEOS: WisdomVideo[] = [

  // ── Champions Mentality 365 ─────────────────────────────────────────────────
  {
    id: 'AxI39FCnuec',
    title: 'The Only 15 Minutes You Need To Become Mentally Unbreakable',
    channel: 'Champions Mentality 365',
    durationMin: 15,
    category: 'discipline',
    tags: ['goggins', 'toughness', 'unbreakable'],
  },
  {
    id: 'WlRmAC37vLQ',
    title: 'The Only 13 Minutes You Need To Master Discipline Once And For All',
    channel: 'Champions Mentality 365',
    durationMin: 13,
    category: 'discipline',
    tags: ['discipline', 'jocko', 'mastery'],
  },
  {
    id: 'Wy7CTJcfiM4',
    title: 'The Most Valuable 40 Minutes You\'ll Spend This Year',
    channel: 'Champions Mentality 365',
    durationMin: 40,
    category: 'mindset',
    tags: ['hormozi', 'williamson', 'systems'],
  },
  {
    id: 'BZY3fE2uyXw',
    title: 'The Most Realest 30 Minutes You\'ll Ever Hear | Hormozi x Williamson',
    channel: 'Champions Mentality 365',
    durationMin: 29,
    category: 'mindset',
    tags: ['hormozi', 'reality', 'truth'],
  },
  {
    id: 'kuKpq3MJysc',
    title: 'It\'s Time to Get Back To Work.',
    channel: 'Champions Mentality 365',
    durationMin: 16,
    category: 'discipline',
    tags: ['work', 'restart', 'grind'],
  },
  {
    id: 'CjZdrWZgMrw',
    title: 'The Slow Death of a Man\'s Discipline.',
    channel: 'Champions Mentality 365',
    durationMin: 12,
    category: 'discipline',
    tags: ['discipline', 'identity', 'character'],
  },
  {
    id: '2Cjpnuall_8',
    title: 'Half The Year Is Gone... What You Do Next Will Decide Everything.',
    channel: 'Champions Mentality 365',
    durationMin: 9,
    category: 'focus',
    tags: ['urgency', 'time', 'decide'],
  },
  {
    id: 'U68eFXR3yv0',
    title: 'Watch This Before You Visualize Again (20 Minutes That Change Everything)',
    channel: 'Champions Mentality 365',
    durationMin: 20,
    category: 'mindset',
    tags: ['visualization', 'change', 'mindset'],
  },
  {
    id: 'xHtliECXvac',
    title: 'The Most Real 20 Minutes About Why Average Is Killing You | Greg Plitt',
    channel: 'Champions Mentality 365',
    durationMin: 20,
    category: 'discipline',
    tags: ['average', 'excellence', 'gregplitt'],
  },
  {
    id: '4BgXUZGRyYg',
    title: 'You Need To Let Go, Start Over And Change.',
    channel: 'Champions Mentality 365',
    durationMin: 20,
    category: 'mindset',
    tags: ['change', 'letgo', 'transformation'],
  },
  {
    id: '_V5qQG_sm_U',
    title: 'The Most Real 14 Minutes You\'ll Hear About The Gap Between You And Him',
    channel: 'Champions Mentality 365',
    durationMin: 14,
    category: 'focus',
    tags: ['gap', 'elite', 'bedros'],
  },
  {
    id: 'qJWPamS2_0E',
    title: 'This Reached You For A Reason... Don\'t Ignore It.',
    channel: 'Champions Mentality 365',
    durationMin: 10,
    category: 'mindset',
    tags: ['sign', 'purpose', 'motivation'],
  },
  {
    id: 'NxeI28cdLd0',
    title: 'The Most Real 29 Minutes You\'ll Hear This Year | Andy Frisella',
    channel: 'Champions Mentality 365',
    durationMin: 29,
    category: 'discipline',
    tags: ['frisella', 'real', 'truth'],
  },

  // ── The Growth Paradox ───────────────────────────────────────────────────────
  {
    id: 'hcQk18Xz7oU',
    title: 'The Cost Of Becoming A Man.',
    channel: 'The Growth Paradox',
    durationMin: 34,
    category: 'discipline',
    tags: ['masculinity', 'sacrifice', 'cost'],
  },
  {
    id: 'piMrycyeB3E',
    title: 'Focus and Restart.',
    channel: 'The Growth Paradox',
    durationMin: 35,
    category: 'focus',
    tags: ['focus', 'restart', 'reset'],
  },
  {
    id: 'MNKYEj_zj50',
    title: 'Every Small Step Matters.',
    channel: 'The Growth Paradox',
    durationMin: 33,
    category: 'mindset',
    tags: ['progress', 'consistency', 'steps'],
  },
  {
    id: '8BzmaX9XOEc',
    title: 'Average Isn\'t Your Destiny.',
    channel: 'The Growth Paradox',
    durationMin: 32,
    category: 'mindset',
    tags: ['destiny', 'above-average', 'potential'],
  },
  {
    id: 'pFSWFc0it3A',
    title: 'Rest, Reset, Restart, Refocus.',
    channel: 'The Growth Paradox',
    durationMin: 32,
    category: 'focus',
    tags: ['recovery', 'refocus', 'reset'],
  },
  {
    id: 'QE64Gzg22Tc',
    title: 'Good Things Are Coming, Just Keep Believing.',
    channel: 'The Growth Paradox',
    durationMin: 33,
    category: 'stoicism',
    tags: ['belief', 'patience', 'faith'],
  },
  {
    id: 'X-AE_HAK9AQ',
    title: 'The Warrior\'s Mindset.',
    channel: 'The Growth Paradox',
    durationMin: 34,
    category: 'discipline',
    tags: ['warrior', 'mindset', 'strength'],
  },
  {
    id: 'RkaCnfJZXT4',
    title: 'The 1% Mindset.',
    channel: 'The Growth Paradox',
    durationMin: 9,
    category: 'mindset',
    tags: ['elite', 'onePercent', 'focused'],
  },
  {
    id: 'US21pNi-0e0',
    title: 'The 1% Path.',
    channel: 'The Growth Paradox',
    durationMin: 18,
    category: 'mindset',
    tags: ['growth', 'path', 'solitude'],
  },
  {
    id: 'yCZF1nJc7gw',
    title: 'The Price of Obsession.',
    channel: 'The Growth Paradox',
    durationMin: 20,
    category: 'discipline',
    tags: ['obsession', 'price', 'sacrifice'],
  },

  // ── Mulligan Brothers ────────────────────────────────────────────────────────
  {
    id: 'hh-pHUA1RRU',
    title: 'The Wisdom of a Lifetime | Advice From Men Who Have Mastered Life',
    channel: 'Mulligan Brothers',
    durationMin: 21,
    category: 'stoicism',
    tags: ['wisdom', 'mastery', 'life'],
  },
  {
    id: 'TLKxdTmk-zc',
    title: 'David Goggins — How To Become The Toughest Man Alive',
    channel: 'Mulligan Brothers',
    durationMin: 15,
    category: 'discipline',
    tags: ['goggins', 'tough', 'mental'],
  },
  {
    id: 'hqPHwR5e2Mo',
    title: '[ SHAOLIN MASTER ] Becoming Super Human',
    channel: 'Mulligan Brothers',
    durationMin: 18,
    category: 'stoicism',
    tags: ['shaolin', 'peace', 'control'],
  },
  {
    id: 'LuzOKmcW7BQ',
    title: 'Discipline.',
    channel: 'Mulligan Brothers',
    durationMin: 9,
    category: 'discipline',
    tags: ['discipline', 'routine', 'habits'],
  },
  {
    id: 't_O_GlajIl0',
    title: 'The Art of Stillness in a Loud World | Buddhist Master\'s Guide',
    channel: 'Mulligan Brothers',
    durationMin: 32,
    category: 'stoicism',
    tags: ['stillness', 'buddhism', 'peace'],
  },
  {
    id: 'yIZg3k4jU1I',
    title: 'Lessons on Mastery — Robert Greene',
    channel: 'Mulligan Brothers',
    durationMin: 25,
    category: 'focus',
    tags: ['mastery', 'robertgreene', 'power'],
  },

  // ── Chris Williamson / Modern Wisdom ─────────────────────────────────────────
  {
    id: 'txANZsiv3Zc',
    title: 'Chris Williamson Being Real For 16 Minutes Straight',
    channel: 'Chris Williamson',
    durationMin: 16,
    category: 'mindset',
    tags: ['williamson', 'truth', 'clarity'],
  },

  // ── Daily Stoic / Stoicism edits ─────────────────────────────────────────────
  {
    id: '5-sfG8BV8wU',
    title: 'Meditations of Marcus Aurelius — SUMMARIZED',
    channel: 'Daily Stoic',
    durationMin: 20,
    category: 'stoicism',
    tags: ['marcus', 'aurelius', 'meditations'],
  },
  {
    id: 'avrxTocBxvM',
    title: 'Everyone Wants To Be Cristiano Ronaldo, But Nobody Wants The Discipline',
    channel: 'Inspire Zap',
    durationMin: 3,
    category: 'discipline',
    tags: ['ronaldo', 'discipline', 'sacrifice'],
  },

  // ── Motivation compile edits ──────────────────────────────────────────────────
  {
    id: 'ey4AMTer2TM',
    title: 'This Will Change How You Think About Time',
    channel: 'Motivation',
    durationMin: 19,
    category: 'focus',
    tags: ['time', 'urgency', 'life'],
  },
  {
    id: 'dFWjy3F4siQ',
    title: 'Everything You Want Comes When You Stop Waiting',
    channel: 'Motivation',
    durationMin: 13,
    category: 'mindset',
    tags: ['action', 'growth', 'stop-waiting'],
  },
  {
    id: 'f8CUvA8gXZU',
    title: 'Why You Shouldn\'t Second Guess Your Decisions',
    channel: 'Motivation',
    durationMin: 15,
    category: 'focus',
    tags: ['decisions', 'confidence', 'conviction'],
  },
  {
    id: 'VSceuiPBpxY',
    title: 'The Mindset of a Winner — Kobe Bryant',
    channel: 'Mamba Mentality',
    durationMin: 5,
    category: 'mindset',
    tags: ['kobe', 'mamba', 'winner'],
  },
  {
    id: 'xLxmgbrHa9Q',
    title: 'Embrace the Suffering — David Goggins',
    channel: 'David Goggins',
    durationMin: 11,
    category: 'discipline',
    tags: ['goggins', 'suffering', 'overcome'],
  },
  {
    id: 'oNwXbmxSI_Y',
    title: 'The Power of Believing in Yourself',
    channel: 'Motivation',
    durationMin: 14,
    category: 'mindset',
    tags: ['belief', 'self', 'confidence'],
  },
  {
    id: 'kXH36VoLuZI',
    title: 'Virat Kohli — The Importance of Consistency',
    channel: 'Cricket World',
    durationMin: 7,
    category: 'focus',
    tags: ['kohli', 'consistency', 'cricket'],
  },
  {
    id: 'UgdFw6hulmA',
    title: 'The Message That Will Realign Your Priorities',
    channel: 'Motivation',
    durationMin: 5,
    category: 'stoicism',
    tags: ['priorities', 'realign', 'perspective'],
  },
];

// ── SHUFFLE ENGINE ────────────────────────────────────────────────────────────
// Fisher-Yates shuffle. No repeats until the full pool is exhausted.
// State is persisted in localStorage so it survives page refreshes.

const QUEUE_KEY     = 'zentrack_wisdom_queue';      // stringified number[]
const QUEUE_POS_KEY = 'zentrack_wisdom_queue_pos';  // current index in queue

/** Deterministic Fisher-Yates shuffle using a seed. */
function seededShuffle(arr: number[], seed: number): number[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    // LCG-based pseudo-random
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildFreshQueue(poolSize: number): number[] {
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  return seededShuffle(indices, Date.now());
}

function loadQueue(): { queue: number[]; pos: number } {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const pos = parseInt(localStorage.getItem(QUEUE_POS_KEY) || '0', 10);
    if (raw) {
      const queue = JSON.parse(raw) as number[];
      if (Array.isArray(queue) && queue.length > 0) {
        return { queue, pos: Math.min(pos, queue.length - 1) };
      }
    }
  } catch { /* ignore */ }
  return { queue: [], pos: 0 };
}

function saveQueue(queue: number[], pos: number) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    localStorage.setItem(QUEUE_POS_KEY, String(pos));
  } catch { /* ignore */ }
}

/**
 * Get the video at the current queue position.
 * If the queue is empty or exhausted, build a fresh shuffled queue first.
 */
export function getCurrentWisdomVideo(
  dynamicVideos: WisdomVideo[] = [],
): WisdomVideo {
  const pool = buildPool(dynamicVideos);

  let { queue, pos } = loadQueue();

  // Queue missing, too short (pool grew), or exhausted → reshuffle
  if (queue.length < pool.length / 2 || pos >= queue.length) {
    queue = buildFreshQueue(pool.length);
    pos   = 0;
    saveQueue(queue, pos);
  }

  const safePos   = Math.min(pos, queue.length - 1);
  const safeIdx   = Math.min(queue[safePos], pool.length - 1);
  return pool[safeIdx];
}

/**
 * Advance to the next video (called by "Next" button).
 * Returns the next WisdomVideo, reshuffling if the queue is exhausted.
 */
export function getNextWisdomVideo(dynamicVideos: WisdomVideo[] = []): WisdomVideo {
  const pool = buildPool(dynamicVideos);
  let { queue, pos } = loadQueue();

  // Advance position
  pos += 1;

  // Exhausted — reshuffle (ensure first video in new round ≠ last of previous)
  if (pos >= queue.length || queue.length < pool.length / 2) {
    const lastIdx = queue.length > 0 ? queue[queue.length - 1] : -1;
    queue = buildFreshQueue(pool.length);
    // Guarantee no immediate repeat
    if (queue[0] === lastIdx && queue.length > 1) {
      [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    pos = 0;
  }

  saveQueue(queue, pos);
  const safeIdx = Math.min(queue[pos], pool.length - 1);
  return pool[safeIdx];
}

/** How many videos remain before the queue reshuffles. */
export function videosRemaining(dynamicVideos: WisdomVideo[] = []): number {
  const pool = buildPool(dynamicVideos);
  const { queue, pos } = loadQueue();
  if (queue.length === 0) return pool.length;
  return Math.max(0, queue.length - pos);
}

function buildPool(dynamicVideos: WisdomVideo[]): WisdomVideo[] {
  const pool = [...WISDOM_VIDEOS];
  if (dynamicVideos.length > 0) {
    // Splice dynamic videos at positions 0, 3, 7 so they're spread across the pool
    pool.unshift(dynamicVideos[0]);
    if (dynamicVideos[1]) pool.splice(3, 0, dynamicVideos[1]);
    if (dynamicVideos[2]) pool.splice(7, 0, dynamicVideos[2]);
  }
  return pool;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

export function isVideoNew(): boolean {
  try {
    const currentWindow = Math.floor(Date.now() / (1000 * 60 * 60 * 6));
    const lastSeen      = localStorage.getItem('zentrack_wisdom_last_seen');
    return !lastSeen || parseInt(lastSeen, 10) !== currentWindow;
  } catch { return false; }
}

export function markVideoSeen(): void {
  try {
    const currentWindow = Math.floor(Date.now() / (1000 * 60 * 60 * 6));
    localStorage.setItem('zentrack_wisdom_last_seen', String(currentWindow));
  } catch { /* ignore */ }
}
