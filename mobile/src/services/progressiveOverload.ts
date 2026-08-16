/**
 * progressiveOverload.ts - ZenTrack Mobile
 *
 * Auto-calculates progressive overload recommendations for each exercise.
 * Algorithm:
 *   1. Look at last 3 logged sessions for this exercise
 *   2. If completed all target sets at current weight in 2+ sessions: recommend +2.5kg (compound) / +1.25kg (isolation)
 *   3. If reps are consistently below target: recommend -2.5kg (deload)
 */

const COMPOUND_EXERCISES = [
  "squat", "deadlift", "bench", "press", "row", "pull-up", "pullup",
  "barbell", "romanian", "rdl", "hip thrust", "military", "overhead",
  "incline", "decline", "landmine", "hack squat",
];
const SECONDARY_COMPOUND = ["dip", "chin-up", "chinup", "weighted pull", "cable row"];

function isLegacyCompound(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_EXERCISES.some(k => lower.includes(k));
}
function isLegacySecondaryCompound(name: string): boolean {
  const lower = name.toLowerCase();
  return SECONDARY_COMPOUND.some(k => lower.includes(k));
}

import { calculateExerciseMaxWeight, calculateExerciseAvgReps } from '../utils/gymUtils';

/** REST time in seconds based on exercise type */
export function getRestDuration(exercise: { name: string, isCompound?: boolean }): number {
  if (exercise.isCompound === true) return 180;
  if (exercise.isCompound === false) return 90;
  
  // Fallback for older data
  if (isLegacyCompound(exercise.name)) return 180;       // 3 min
  if (isLegacySecondaryCompound(exercise.name)) return 120; // 2 min
  return 90;                                       // 90s isolation
}

export interface OverloadSuggestion {
  type: "increase" | "decrease" | "maintain";
  weightDelta: number;   // kg to add/remove (0 for maintain)
  reason: string;
  recommended: number;   // suggested absolute weight in kg
}

/**
 * Compute overload suggestion for a specific exercise.
 * @param exercise - full exercise object
 * @param currentWeight - current planned weight in kg
 * @param targetSets - how many sets planned
 * @param targetReps - target reps (e.g. 8 for "8-12" → use lower bound)
 * @param gymLogs - all gym logs from context
 */
export function getOverloadSuggestion(
  exercise: { name: string, isCompound?: boolean },
  currentWeight: number,
  targetSets: number,
  targetRepsStr: string,
  gymLogs: any[]
): OverloadSuggestion | null {
  if (!exercise || !exercise.name || currentWeight <= 0) return null;

  // Parse target reps (handle "8-12" → 8)
  const targetReps = parseInt(String(targetRepsStr).split("-")[0], 10) || 8;

  // Find sessions with this exercise (sorted newest-first, early-exit at 3)
  const cleanTargetName = exercise.name.toLowerCase().trim();
  const sortedLogs = (gymLogs || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const relevantSessions: any[] = [];
  for (const log of sortedLogs) {
    if (Array.isArray(log.exercises)) {
      const hasEx = log.exercises.some((e: any) => e.name?.toLowerCase().trim() === cleanTargetName);
      if (hasEx) {
        relevantSessions.push(log);
        if (relevantSessions.length === 3) break;
      }
    }
  }

  if (relevantSessions.length < 2) return null; // Need at least 2 sessions

  // Extract set data for this exercise from each session
  const sessionData = relevantSessions.map(log => {
    const ex = log.exercises.find((e: any) => e.name?.toLowerCase().trim() === exercise.name.toLowerCase().trim());
    const avgReps = calculateExerciseAvgReps(ex as any);
    const maxWeight = calculateExerciseMaxWeight(ex as any);
    const completedSetsCount = ex ? (ex.setsLog || []).filter((s: any) => s.completed).length : 0;
    return { sets: completedSetsCount, avgReps, maxWeight };
  });

  const isCompoundEx = exercise.isCompound ?? isLegacyCompound(exercise.name);
  const step = isCompoundEx ? 2.5 : 1.25;

  // Check if user consistently hit their targets
  const hitTargetBothSessions = sessionData.slice(0, 2).every(d =>
    d.sets >= targetSets && d.avgReps >= targetReps
  );

  if (hitTargetBothSessions) {
    const newWeight = currentWeight + step;
    return {
      type: "increase",
      weightDelta: step,
      reason: `Hit ${targetSets}x${targetReps} for 2+ sessions`,
      recommended: newWeight,
    };
  }

  // Check deload — consistently missing reps
  const failedBoth = sessionData.slice(0, 2).every(d => d.avgReps < targetReps - 2 && d.sets > 0);
  if (failedBoth) {
    const newWeight = Math.max(0, currentWeight - step * 2);
    return {
      type: "decrease",
      weightDelta: -step * 2,
      reason: "Reps consistently below target",
      recommended: newWeight,
    };
  }

  return { type: "maintain", weightDelta: 0, reason: "Keep current weight", recommended: currentWeight };
}

// ─── 1RM Calculator ──────────────────────────────────────────────────────────
// Epley formula: 1RM = weight × (1 + reps/30)
// Most accurate for reps 1–10. Clamp reps to max 30 to avoid absurd estimates.

export function calculate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const clampedReps = Math.min(reps, 30);
  return Math.round(weight * (1 + clampedReps / 30));
}

// ─── PR Storage ──────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const PR_STORAGE_KEY = 'zentrack_exercise_prs_v1';

export interface ExercisePR {
  best1RM: number;        // estimated 1RM kg
  heaviestWeight: number; // actual heaviest set weight logged
  bestReps: number;       // reps at heaviest weight
  achievedAt: string;     // ISO date string
}

export type PRRecord = Record<string, ExercisePR>; // keyed by lowercase exercise name

async function readPRs(): Promise<PRRecord> {
  try {
    const raw = await AsyncStorage.getItem(PR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writePRs(record: PRRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(PR_STORAGE_KEY, JSON.stringify(record));
  } catch { /* ignore */ }
}

/** 
 * Check if a completed set is a new Personal Record for this exercise.
 * Returns the previous and new 1RM so the UI can show the celebration.
 */
export async function detectPR(
  exerciseName: string,
  weight: number,
  reps: number,
): Promise<{ isNewPR: boolean; previous1RM: number; new1RM: number }> {
  if (weight <= 0 || reps <= 0) return { isNewPR: false, previous1RM: 0, new1RM: 0 };

  const key = exerciseName.toLowerCase().trim();
  const new1RM = calculate1RM(weight, reps);
  const prs = await readPRs();
  const existing = prs[key];

  const previous1RM = existing?.best1RM ?? 0;

  if (!existing || new1RM > existing.best1RM) {
    prs[key] = {
      best1RM: new1RM,
      heaviestWeight: weight,
      bestReps: reps,
      achievedAt: new Date().toISOString().slice(0, 10),
    };
    await writePRs(prs);
    return { isNewPR: true, previous1RM, new1RM };
  }

  return { isNewPR: false, previous1RM, new1RM };
}

/** Get all stored PRs — used by PR Hall of Fame sheet */
export async function getAllPRs(): Promise<PRRecord> {
  return readPRs();
}

/** Clear all PRs (for testing / account reset) */
export async function clearAllPRs(): Promise<void> {
  await AsyncStorage.removeItem(PR_STORAGE_KEY);
}

