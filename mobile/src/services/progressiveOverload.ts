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

  // Find sessions with this exercise (sorted newest-first)
  const relevantSessions = gymLogs
    .filter(log => Array.isArray(log.exercises) && log.exercises.some((e: any) => e.name?.toLowerCase().trim() === exercise.name.toLowerCase().trim()))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

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
