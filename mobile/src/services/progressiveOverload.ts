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

import { calculateExerciseMaxWeight, calculateExerciseAvgReps, normalizeExerciseKey } from '../utils/gymUtils';

/** REST time in seconds based on exercise type */
export function getRestDuration(exercise: { name: string, isCompound?: boolean }): number {
  if (exercise.isCompound === true) return 180;
  if (exercise.isCompound === false) return 90;
  
  // Fallback for older data
  if (isLegacyCompound(exercise.name)) return 180;       // 3 min
  if (isLegacySecondaryCompound(exercise.name)) return 120; // 2 min
  return 90;                                       // 90s isolation
}

import { evaluateProgression, ProgressionResult, ProgressionPolicy } from './progressionEngine';
import { estimate1RM, OneRMFormula, calculateRepMaxTable } from './oneRepMaxEngine';

export { evaluateProgression, ProgressionResult, ProgressionPolicy, estimate1RM, OneRMFormula, calculateRepMaxTable };

export interface OverloadSuggestion {
  type: "increase" | "decrease" | "maintain";
  weightDelta: number;   // kg to add/remove (0 for maintain)
  reason: string;
  recommended: number;   // suggested absolute weight in kg
  isDeload?: boolean;
  policy?: ProgressionPolicy;
}

/**
 * Compute overload suggestion for a specific exercise using scientific progression policies.
 */
export function getOverloadSuggestion(
  exercise: { name: string; isCompound?: boolean; muscle?: string; targetSets?: number; targetReps?: string; progressionPolicy?: ProgressionPolicy },
  currentWeight: number,
  targetSets: number,
  targetRepsStr: string,
  gymLogs: any[]
): OverloadSuggestion | null {
  if (!exercise || !exercise.name || currentWeight <= 0) return null;

  const result = evaluateProgression(
    {
      name: exercise.name,
      targetSets: exercise.targetSets || targetSets,
      targetReps: exercise.targetReps || targetRepsStr,
      isCompound: exercise.isCompound,
      muscle: exercise.muscle,
      progressionPolicy: exercise.progressionPolicy,
    },
    currentWeight,
    gymLogs || []
  );

  let type: "increase" | "decrease" | "maintain" = "maintain";
  if (result.weightDelta > 0) {
    type = "increase";
  } else if (result.weightDelta < 0 || result.isDeload) {
    type = "decrease";
  }

  return {
    type,
    weightDelta: result.weightDelta,
    reason: result.reason,
    recommended: result.recommendedWeight,
    isDeload: result.isDeload,
    policy: result.policy,
  };
}

// ─── 1RM Calculator (Multi-Formula Enabled) ──────────────────────────────────
export function calculate1RM(weight: number, reps: number, formula: OneRMFormula = 'epley'): number {
  return Math.round(estimate1RM(weight, reps, formula));
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

