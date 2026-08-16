/**
 * ZenTrack Mobile — XP & Rewards System
 *
 * Psychology: Operant conditioning with VARIABLE reward schedules.
 * Variable rewards are 3× more habit-forming than fixed rewards because
 * the unpredictability creates anticipation (Skinner's slot machine effect).
 *
 * Reward sources:
 *  - Task complete:    10–50 XP (variable)
 *  - Habit logged:     15 XP flat + streak bonus
 *  - Goal milestone:   200 XP
 *  - Perfect day:      500 XP
 *  - Surprise bonus:   10% random trigger (50–200 XP extra)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const XP_KEY     = 'zentrack_xp_v1';
const STREAK_KEY = 'zentrack_xp_streak';

export const LEVEL_THRESHOLDS = [
  0, 500, 1200, 2500, 4200, 6500, 9500, 13500, 
  18000, 23000, 29000, 36000, 44000, 53000, 
  63500, 75500, 89000, 104000, 121000, 140000
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
  GOAL_MILESTONE:   { base: 1000, range: 0 },   // Goal marked complete
  PERFECT_DAY:      { base: 1000, range: 0 },   // All tasks + habits done
  GYM_SESSION:      { base: 100, range: 50  },  // 100–150 XP
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

// ── In-Memory & Debounced Remote Sync ────────────────────────────────────────
let _inMemoryXP: number | null = null;
let _pendingFirestoreXP: number | null = null;
let _xpSyncTimer: ReturnType<typeof setTimeout> | null = null;

export async function flushXPSync(): Promise<void> {
  if (_xpSyncTimer) {
    clearTimeout(_xpSyncTimer);
    _xpSyncTimer = null;
  }
  const xpToWrite = _pendingFirestoreXP;
  _pendingFirestoreXP = null;
  const uid = auth.currentUser?.uid;
  if (uid && xpToWrite !== null) {
    try {
      await setDoc(doc(db, 'user_profiles', uid), { xp: xpToWrite }, { merge: true });
    } catch (e: any) {
      console.warn('[XP] Firestore flush failed:', e?.message);
    }
  }
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/** Get current total XP — in-memory first, local cache second, Firestore fallback */
export async function getXP(): Promise<number> {
  if (_inMemoryXP !== null) return _inMemoryXP;

  try {
    const stored = await AsyncStorage.getItem(XP_KEY);
    if (stored !== null) {
      _inMemoryXP = parseInt(stored, 10) || 0;
      return _inMemoryXP;
    }

    // FIX #12: No local cache (fresh install or reinstall) — load from Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'user_profiles', uid));
      if (snap.exists()) {
        const firestoreXP = snap.data()?.xp ?? 0;
        _inMemoryXP = firestoreXP;
        // Seed local cache so future reads are instant
        await AsyncStorage.setItem(XP_KEY, String(firestoreXP));
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
  const progress         = Math.min((xp - currentThreshold) / rangeSize, 1);

  return {
    xp,
    level,
    title:         LEVEL_TITLES[level] ?? 'Apex',
    nextThreshold,
    progress,
  };
}

/**
 * Award XP for a given source.
 * Applies variable reward logic — the amount is never exactly the same.
 * Returns full XPResult with bonus information for the reward animation.
 */
export async function awardXP(
  source: keyof typeof XP_SOURCES,
): Promise<XPResult> {
  const config = XP_SOURCES[source];

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
  AsyncStorage.setItem(XP_KEY, String(newXP)).catch(() => {});

  // 2. Debounced Firestore sync (2000ms) to coalesce rapid task/habit completions
  _pendingFirestoreXP = newXP;
  if (_xpSyncTimer) clearTimeout(_xpSyncTimer);
  _xpSyncTimer = setTimeout(() => {
    flushXPSync();
  }, 2000);

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

/** Reset XP (for testing / account linking) */
export async function resetXP(): Promise<void> {
  _inMemoryXP = 0;
  _pendingFirestoreXP = null;
  if (_xpSyncTimer) {
    clearTimeout(_xpSyncTimer);
    _xpSyncTimer = null;
  }
  await AsyncStorage.setItem(XP_KEY, '0');
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(doc(db, 'user_profiles', uid), { xp: 0 }, { merge: true })
      .catch(e => console.warn('[XP] Firestore reset failed:', e.message));
  }
}
