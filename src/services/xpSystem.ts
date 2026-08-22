/**
 * ZenTrack Web — XP & Rewards System
 * 100% Parity with Mobile XP Architecture (Operant conditioning with variable reward schedules)
 *
 * Persisted in Firestore: user_profiles/{uid}
 * Local cache: localStorage.getItem('zentrack_xp_v1')
 * Real-time event: 'zentrack_xp_updated'
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const XP_KEY = 'zentrack_xp_v1';

export const LEVEL_THRESHOLDS = [
  0,        //  0 — Seeker
  1000,     //  1 — Warden
  3000,     //  2 — Sentinel
  7000,     //  3 — Guardian
  14000,    //  4 — Vanguard
  27000,    //  5 — Luminary
  59500,    //  6 — Legend         ← user anchor point
  110000,   //  7 — Mythic
  180000,   //  8 — Paragon
  270000,   //  9 — Titan
  390000,   // 10 — Ascendant
  550000,   // 11 — Exalted
  760000,   // 12 — Sovereign
  1030000,  // 13 — Archon
  1380000,  // 14 — Celestial
  1820000,  // 15 — Ethereal
  2380000,  // 16 — Empyrean
  3080000,  // 17 — Astral
  3950000,  // 18 — Zenith
  5000000,  // 19 — Apex
];

export const LEVEL_TITLES = [
  'Seeker',       // 0
  'Warden',       // 500
  'Sentinel',     // 1200
  'Guardian',     // 2500
  'Vanguard',     // 4200
  'Luminary',     // 6500
  'Legend',       // 9500
  'Mythic',       // 13500
  'Paragon',      // 18000
  'Titan',        // 23000
  'Ascendant',    // 29000
  'Exalted',      // 36000
  'Sovereign',    // 44000
  'Archon',       // 53000
  'Celestial',    // 63500
  'Ethereal',     // 75500
  'Empyrean',     // 89000
  'Astral',       // 104000
  'Zenith',       // 121000
  'Apex',         // 140000
];

// ─── XP Sources — Base amounts before variable modifier ──────────────────────

export const XP_SOURCES = {
  TASK_COMPLETE:    { base: 50, range: 50 },    // 50–100 XP (variable)
  HABIT_LOG:        { base: 50, range: 0  },    // 50 flat
  HABIT_STREAK_7:   { base: 300, range: 0  },   // 7-day streak bonus
  HABIT_STREAK_30:  { base: 1500, range: 0 },   // 30-day streak bonus
  ATTENDANCE_LOG:   { base: 35, range: 15 },    // 35–50 XP per class/lab attended
  GOAL_MILESTONE:   { base: 1000, range: 0 },   // Goal marked complete
  PERFECT_DAY:      { base: 1000, range: 0 },   // All tasks + habits done
  GYM_SET:          { base: 10, range: 5  },    // 10–15 XP per logged set
  GYM_SESSION:      { base: 150, range: 50 },   // 150–200 XP for workout completion
  GYM_PR:           { base: 300, range: 200 },  // 300–500 XP for a new PR 🏆
  ONBOARDING:       { base: 500, range: 0 },    // First-run bonus
  LECTURE_COMPLETE: { base: 25, range: 0 },     // +25 XP per completed lecture chapter
  QUIZ_PERFECT:     { base: 50, range: 0 },     // +50 XP for scoring 3/3 on lecture quiz
  FLASHCARD_REVIEW: { base: 10, range: 0 },     // +10 XP for daily flashcard review session
};

// Surprise bonus: 10% chance, adds 150–400 XP on top of base reward
const SURPRISE_CHANCE   = 0.10;
const SURPRISE_MIN      = 150;
const SURPRISE_MAX      = 400;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XPResult {
  totalXP:    number;   // New cumulative XP
  added:      number;   // XP added this action
  bonus:      boolean;  // Was a surprise bonus triggered?
  bonusXP:    number;   // How much the bonus added (0 if no bonus)
  leveledUp:  boolean;  // Did the user level up?
  newLevel:   number;   // Current level after this action
  newTitle:   string;   // Level title
}

export interface XPState {
  xp:    number;
  level: number;
  title: string;
  nextThreshold: number;
  progress: number;  // 0.0 → 1.0 progress to next level
}

// ── In-Memory & Resilient Remote Sync ────────────────────────────────────────
let _inMemoryXP: number | null = null;

function emitXPEvent(detail: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zentrack_xp_updated', { detail }));
  }
}

/**
 * Reconciles incoming Firestore XP with local in-memory/localStorage cache.
 * Always takes the highest cumulative XP to ensure zero progress loss across devices.
 */
export function syncXPWithFirestore(firestoreXP: number) {
  if (typeof firestoreXP !== 'number' || isNaN(firestoreXP)) return;
  const currentLocal = _inMemoryXP ?? 0;
  
  if (firestoreXP >= currentLocal) {
    _inMemoryXP = firestoreXP;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(XP_KEY, String(firestoreXP));
    }
    emitXPEvent({
      xp: firestoreXP,
      added: 0,
      source: 'firestore_sync',
    });
  } else if (currentLocal > firestoreXP && auth.currentUser?.uid) {
    // Local progress was ahead of Firestore — push local value to Firestore!
    const uid = auth.currentUser.uid;
    setDoc(doc(db, 'user_profiles', uid), { xp: currentLocal }, { merge: true }).catch(() => {});
  }
}

/** Calculate level and title from raw XP number */
export function getLevel(xp: number): XPState {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i;
      break;
    }
  }

  const currentThreshold = LEVEL_THRESHOLDS[level];
  const nextThreshold    = LEVEL_THRESHOLDS[level + 1] ?? LEVEL_THRESHOLDS[level] * 2;
  const rangeSize        = nextThreshold - currentThreshold;
  const progress         = Math.min(Math.max((xp - currentThreshold) / rangeSize, 0), 1);

  return {
    xp,
    level,
    title:         LEVEL_TITLES[level] ?? 'Apex',
    nextThreshold,
    progress,
  };
}

/** Get current total XP — in-memory first, local cache second, Firestore fallback */
export async function getXP(): Promise<number> {
  if (_inMemoryXP !== null) return _inMemoryXP;

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(XP_KEY);
      if (stored !== null) {
        _inMemoryXP = parseInt(stored, 10) || 0;
        
        // Proactively fetch Firestore in background to ensure sync if local was stale
        const uid = auth.currentUser?.uid;
        if (uid) {
          getDoc(doc(db, 'user_profiles', uid)).then(snap => {
            if (snap.exists()) {
              const fsXP = snap.data()?.xp;
              if (typeof fsXP === 'number') syncXPWithFirestore(fsXP);
            }
          }).catch(() => {});
        }
        return _inMemoryXP;
      }
    }

    // No local cache — load from Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'user_profiles', uid));
      if (snap.exists()) {
        const firestoreXP = snap.data()?.xp ?? 0;
        _inMemoryXP = firestoreXP;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(XP_KEY, String(firestoreXP));
        }
        return firestoreXP;
      }
    }
    _inMemoryXP = 0;
    return 0;
  } catch {
    _inMemoryXP = 0;
    return 0;
  }
}

/**
 * Award XP for a given source.
 * 1. Updates in-memory and local cache for 0ms UI reactivity.
 * 2. Emits live window event for instant visual feedback.
 * 3. Persists directly to Firestore (user_profiles/{uid}).
 */
export async function awardXP(
  source: keyof typeof XP_SOURCES,
): Promise<XPResult> {
  const config = XP_SOURCES[source] || { base: 30, range: 10 };

  // Variable reward: base + random range
  const baseAwarded = config.base + Math.floor(Math.random() * (config.range + 1));

  // Surprise bonus (10% chance)
  const surpriseTriggered = Math.random() < SURPRISE_CHANCE;
  const bonusXP = surpriseTriggered
    ? SURPRISE_MIN + Math.floor(Math.random() * (SURPRISE_MAX - SURPRISE_MIN))
    : 0;

  const totalAdded = baseAwarded + bonusXP;

  const currentXP = await getXP();
  const previousLevel = getLevel(currentXP).level;

  const newXP = currentXP + totalAdded;
  _inMemoryXP = newXP;

  // 1. Instant local write (0ms UI latency)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(XP_KEY, String(newXP));
  }

  // 2. Broadcast reactive event across all mounted web components
  emitXPEvent({
    xp: newXP,
    added: totalAdded,
    source,
    surprise: surpriseTriggered,
    bonusXP,
  });

  // 3. Reliable Firestore Database write (real-time sync to mobile)
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(
      doc(db, 'user_profiles', uid),
      { xp: newXP, lastXpAwardedAt: Date.now() },
      { merge: true }
    ).catch(e => console.warn('[XP] Firestore setDoc failed:', e));
  }

  const newState = getLevel(newXP);

  return {
    totalXP:   newXP,
    added:     totalAdded,
    bonus:     surpriseTriggered,
    bonusXP,
    leveledUp: newState.level > previousLevel,
    newLevel:  newState.level,
    newTitle:  newState.title,
  };
}

/** Directly read the full XP state (for display) */
export async function getXPState(): Promise<XPState> {
  const xp = await getXP();
  return getLevel(xp);
}

/** Subscribe to live XP updates across the app */
export function subscribeXPChanges(callback: (data: { xp: number; added: number; source?: string }) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    callback(customEvent.detail);
  };
  window.addEventListener('zentrack_xp_updated', handler);
  return () => window.removeEventListener('zentrack_xp_updated', handler);
}

/** Reset XP (for testing / account linking) */
export async function resetXP(): Promise<void> {
  _inMemoryXP = 0;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(XP_KEY, '0');
  }
  emitXPEvent({
    xp: 0,
    added: 0,
    source: 'reset',
  });
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(doc(db, 'user_profiles', uid), { xp: 0 }, { merge: true }).catch(() => {});
  }
}
