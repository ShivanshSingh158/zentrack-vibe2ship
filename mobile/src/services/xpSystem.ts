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
import { DeviceEventEmitter } from 'react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { updateL1Cache } from '../utils/bootManifest';
import { safeWrite } from '../utils/safeWrite';
import { COLLECTION } from '../config/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const XP_KEY     = 'zentrack_xp_v1';
const STREAK_KEY = 'zentrack_xp_streak';

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
  STEP_GOAL_HIT:    { base: 100, range: 50 },   // +100-150 XP for reaching daily step goal
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

/**
 * Reconciles incoming Firestore XP with local in-memory/AsyncStorage cache.
 * Always takes the highest cumulative XP to ensure zero progress loss across devices.
 */
export function syncXPWithFirestore(firestoreXP: number) {
  if (typeof firestoreXP !== 'number' || isNaN(firestoreXP)) return;
  const currentLocal = _inMemoryXP ?? 0;
  
  if (firestoreXP >= currentLocal) {
    _inMemoryXP = firestoreXP;
    updateL1Cache('xp', firestoreXP);
    AsyncStorage.setItem(XP_KEY, String(firestoreXP)).catch(() => {});
    try {
      DeviceEventEmitter.emit('zentrack_xp_updated', {
        xp: firestoreXP,
        added: 0,
        source: 'firestore_sync',
      });
    } catch {}
  } else if (currentLocal > firestoreXP && auth.currentUser?.uid) {
    // Local offline progress was ahead of Firestore — push local value to Firestore!
    const uid = auth.currentUser.uid;
    safeWrite(
      () => setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { xp: currentLocal }, { merge: true }),
      COLLECTION.USER_PROFILES,
      'set',
      { xp: currentLocal },
      uid
    ).catch(() => {});
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
      updateL1Cache('xp', _inMemoryXP);
      
      // Proactively fetch Firestore in background to ensure sync if local was stale
      const uid = auth.currentUser?.uid;
      if (uid) {
        getDoc(doc(db, COLLECTION.USER_PROFILES, uid)).then(snap => {
          if (snap.exists()) {
            const fsXP = snap.data()?.xp;
            if (typeof fsXP === 'number') syncXPWithFirestore(fsXP);
          }
        }).catch(() => {});
      }
      return _inMemoryXP;
    }

    // No local cache (fresh install or reinstall) — load from Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, COLLECTION.USER_PROFILES, uid));
      if (snap.exists()) {
        const firestoreXP = snap.data()?.xp ?? 0;
        _inMemoryXP = firestoreXP;
        updateL1Cache('xp', firestoreXP);
        // Seed local cache so future reads are instant
        await AsyncStorage.setItem(XP_KEY, String(firestoreXP));
        return firestoreXP;
      }
    }
    _inMemoryXP = 0;
    updateL1Cache('xp', 0);
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
 * 1. Updates in-memory and local cache for 0ms UI reactivity.
 * 2. Emits live device event for instant visual feedback.
 * 3. Persists directly to Firestore via safeWrite (with AsyncStorage offline queue fallback).
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
  updateL1Cache('xp', newXP);

  // 1. Instant local write (0ms UI latency)
  AsyncStorage.setItem(XP_KEY, String(newXP)).catch(() => {});

  // 2. Broadcast reactive event to all mounted screens
  try {
    DeviceEventEmitter.emit('zentrack_xp_updated', {
      xp: newXP,
      added: totalAdded,
      source,
      surprise: surpriseTriggered,
      bonusXP,
    });
  } catch {}

  // 3. Reliable Firestore Database write via safeWrite (online + offline queue fallback)
  const uid = auth.currentUser?.uid;
  if (uid) {
    safeWrite(
      () => setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { xp: newXP, lastXpAwardedAt: Date.now() }, { merge: true }),
      COLLECTION.USER_PROFILES,
      'set',
      { xp: newXP, lastXpAwardedAt: Date.now() },
      uid
    ).catch(e => console.warn('[XP] Firestore safeWrite failed:', e));
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
  const sub = DeviceEventEmitter.addListener('zentrack_xp_updated', callback);
  return () => sub.remove();
}

/** Reset XP (for testing / account linking) */
export async function resetXP(): Promise<void> {
  _inMemoryXP = 0;
  updateL1Cache('xp', 0);
  await AsyncStorage.setItem(XP_KEY, '0');
  try {
    DeviceEventEmitter.emit('zentrack_xp_updated', {
      xp: 0,
      added: 0,
      source: 'reset',
    });
  } catch {}
  const uid = auth.currentUser?.uid;
  if (uid) {
    safeWrite(
      () => setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { xp: 0 }, { merge: true }),
      COLLECTION.USER_PROFILES,
      'set',
      { xp: 0 },
      uid
    ).catch(e => console.warn('[XP] Firestore reset failed:', e?.message));
  }
}
