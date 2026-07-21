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

export const LEVEL_THRESHOLDS = [0, 500, 1500, 3500, 7000, 13000, 22000, 35000];
export const LEVEL_TITLES = [
  'Initiate',     // 0
  'Operator',     // 500
  'Commander',    // 1500
  'Strategist',   // 3500
  'Vanguard',     // 7000
  'Architect',    // 13000
  'Legend',       // 22000
  'Mythic',       // 35000
];

// ─── XP Sources — Base amounts before variable modifier ──────────────────────

export const XP_SOURCES = {
  TASK_COMPLETE:    { base: 25, range: 25 },  // 25–50 XP (variable)
  HABIT_LOG:        { base: 15, range: 0  },  // 15 flat
  HABIT_STREAK_7:   { base: 75, range: 0  },  // 7-day streak bonus
  HABIT_STREAK_30:  { base: 300, range: 0 },  // 30-day streak bonus
  GOAL_MILESTONE:   { base: 200, range: 0 },  // Goal marked complete
  PERFECT_DAY:      { base: 500, range: 0 },  // All tasks + habits done
  GYM_SESSION:      { base: 40, range: 20  },  // 40–60 XP
  ONBOARDING:       { base: 100, range: 0 },  // First-run bonus
};

// Surprise bonus: 10% chance, adds 50–200 XP on top of base reward
const SURPRISE_CHANCE   = 0.10;
const SURPRISE_MIN      = 50;
const SURPRISE_MAX      = 200;

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

// ─── Core Functions ───────────────────────────────────────────────────────────

/** Get current total XP — local cache first, Firestore fallback on first launch */
export async function getXP(): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(XP_KEY);
    if (stored !== null) return parseInt(stored, 10);

    // FIX #12: No local cache (fresh install or reinstall) — load from Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'user_profiles', uid));
      if (snap.exists()) {
        const firestoreXP = snap.data()?.xp ?? 0;
        // Seed local cache so future reads are instant
        await AsyncStorage.setItem(XP_KEY, String(firestoreXP));
        return firestoreXP;
      }
    }
    return 0;
  } catch {
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
    title:         LEVEL_TITLES[level] ?? 'Mythic',
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
  // FIX #12: Persist XP to BOTH AsyncStorage (fast reads) AND Firestore (survives reinstall)
  await AsyncStorage.setItem(XP_KEY, String(newXP));
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(doc(db, 'user_profiles', uid), { xp: newXP }, { merge: true })
      .catch(e => console.warn('[XP] Firestore sync failed:', e.message));
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

/** Reset XP (for testing / account linking) */
export async function resetXP(): Promise<void> {
  await AsyncStorage.setItem(XP_KEY, '0');
  // FIX #12: Also reset in Firestore
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(doc(db, 'user_profiles', uid), { xp: 0 }, { merge: true })
      .catch(e => console.warn('[XP] Firestore reset failed:', e.message));
  }
}
