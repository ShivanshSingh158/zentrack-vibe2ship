/**
 * progressionEngine.ts — ZenTrack Mobile
 *
 * Automated Progression & Deload Engine:
 * Implements 5 formal progressive overload policies:
 * 1. Linear Progression: Hit all reps in all sets -> increment weight (+2.5kg / +5kg). 3 misses -> 10% Deload.
 * 2. Greyskull LP: 2 straight sets + 1 AMRAP set. If AMRAP reps >= 2x target -> double weight increment. 1 failure -> 10% reset.
 * 3. Double Progression: Work within rep range (e.g. 8-12). Top of range hit on all sets -> +2.5kg & reset reps to bottom.
 * 4. Time Progression: For isometric holds (planks, L-sits) -> hold full time -> +5s next session.
 * 5. Off: Targets remain manual.
 */

import { GymDayLog } from '../types/gym.types';
import { normalizeExerciseKey } from '../utils/gymUtils';

export type ProgressionPolicy = 'linear' | 'greyskull' | 'double' | 'time' | 'off';

export const PROGRESSION_POLICIES: Record<ProgressionPolicy, { name: string; desc: string }> = {
  linear: {
    name: 'Linear Progression',
    desc: 'Hit all prescribed reps across every set and weight goes up. 3 consecutive misses trigger a 10% deload.',
  },
  double: {
    name: 'Double Progression',
    desc: 'Work within a rep range (e.g. 8–12). Reach the top of the range across all sets to add weight and reset reps to the bottom.',
  },
  greyskull: {
    name: 'Greyskull LP (AMRAP)',
    desc: 'Two straight sets plus a final AMRAP set to failure. Beat the target by 2x reps to jump double weight. One failure resets 10%.',
  },
  time: {
    name: 'Time Progression',
    desc: 'Hold for the full target duration across all sets to add 5 seconds next session.',
  },
  off: {
    name: 'Manual',
    desc: 'Targets stay where you set them.',
  },
};

export const DELOAD_FACTOR = 0.90; // 10% weight backoff
export const DELOAD_MISS_THRESHOLD = 3; // 3 consecutive sessions of misses triggers deload

const HEAVY_COMPOUND_BP = ['upper legs', 'lower legs', 'back', 'legs', 'glutes', 'hips'];

export function getDefaultIncrement(exerciseName: string, muscle?: string, isCompound?: boolean): number {
  const name = exerciseName.toLowerCase();
  const m = (muscle || '').toLowerCase();
  const isHeavy =
    isCompound ||
    name.includes('squat') ||
    name.includes('deadlift') ||
    name.includes('leg press') ||
    HEAVY_COMPOUND_BP.some(k => m.includes(k));

  return isHeavy ? 5.0 : 2.5;
}

export interface ProgressionResult {
  policy: ProgressionPolicy;
  recommendedWeight: number;
  recommendedReps: string;
  weightDelta: number;
  isDeload: boolean;
  reason: string;
  consecutiveMisses: number;
}

/**
 * Evaluates progressive overload and deload prescriptions based on exercise history
 */
export function evaluateProgression(
  exercise: {
    name: string;
    targetSets: number;
    targetReps: string;
    isCompound?: boolean;
    muscle?: string;
    progressionPolicy?: ProgressionPolicy;
  },
  currentWeight: number,
  gymLogs: GymDayLog[]
): ProgressionResult {
  const policy: ProgressionPolicy = exercise.progressionPolicy || 'double';
  const targetKey = normalizeExerciseKey(exercise.name);
  const step = getDefaultIncrement(exercise.name, exercise.muscle, exercise.isCompound);

  if (policy === 'off' || currentWeight <= 0) {
    return {
      policy: 'off',
      recommendedWeight: currentWeight,
      recommendedReps: exercise.targetReps,
      weightDelta: 0,
      isDeload: false,
      reason: 'Manual target mode',
      consecutiveMisses: 0,
    };
  }

  // Parse rep range (e.g. "8-12" -> low: 8, high: 12)
  const repStr = String(exercise.targetReps || '10').trim();
  let targetLowReps = 10;
  let targetHighReps = 10;
  if (repStr.includes('-')) {
    const parts = repStr.split('-').map(p => parseInt(p.trim(), 10));
    targetLowReps = parts[0] || 8;
    targetHighReps = parts[1] || 12;
  } else {
    targetLowReps = parseInt(repStr, 10) || 10;
    targetHighReps = targetLowReps;
  }

  // Find recent sessions containing this exercise (sorted newest first)
  const sortedLogs = (gymLogs || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recentSessions: any[] = [];
  for (const log of sortedLogs) {
    if (Array.isArray(log.exercises)) {
      const match = log.exercises.find(e => e?.name && normalizeExerciseKey(e.name) === targetKey);
      if (match) {
        const completedSets = (match.setsLog || []).filter(s => s.completed && !s.isWarmup);
        if (completedSets.length > 0) {
          recentSessions.push({
            date: log.date,
            sets: completedSets,
          });
          if (recentSessions.length >= 4) break;
        }
      }
    }
  }

  if (recentSessions.length === 0) {
    return {
      policy,
      recommendedWeight: currentWeight,
      recommendedReps: exercise.targetReps,
      weightDelta: 0,
      isDeload: false,
      reason: 'First session — establish baseline',
      consecutiveMisses: 0,
    };
  }

  // Evaluate genuine failure misses for recent historical sessions
  // In Double Progression (e.g. 10-12 reps), hitting 10 or 11 reps is SUCCESS (consolidating volume), NOT a miss!
  // A miss ONLY occurs if reps drop strictly BELOW targetLowReps (e.g. got 6 reps when target is 10-12).
  let consecutiveMisses = 0;
  for (const session of recentSessions) {
    const sets = session.sets;
    const isMiss =
      sets.length < exercise.targetSets ||
      sets.some((s: any) => (Number(s.reps) || 0) < targetLowReps);

    if (isMiss) {
      consecutiveMisses++;
    } else {
      break; // Streak of misses broken by a successful session
    }
  }

  // Check today's active in-progress sets if available
  const currentSetsLog = (exercise as any)?.setsLog || [];
  const todayCompleted = currentSetsLog.filter((s: any) => s.completed && !s.isWarmup);
  const todayMaxWeight = Math.max(currentWeight, ...todayCompleted.map((s: any) => Number(s.weight) || 0));
  const isCrushingToday = todayCompleted.length > 0 && todayCompleted.every((s: any) => (Number(s.reps) || 0) >= targetLowReps);

  // Check Deload condition (3 consecutive true failure misses, or 1 for Greyskull)
  // If user is actively crushing target reps today, do NOT trigger deload
  const deloadThreshold = policy === 'greyskull' ? 1 : DELOAD_MISS_THRESHOLD;
  if (consecutiveMisses >= deloadThreshold && !isCrushingToday) {
    const deloadWeight = Math.max(step, Math.round((currentWeight * DELOAD_FACTOR) / 2.5) * 2.5);
    return {
      policy,
      recommendedWeight: deloadWeight,
      recommendedReps: exercise.targetReps,
      weightDelta: Math.round((deloadWeight - currentWeight) * 10) / 10,
      isDeload: true,
      reason: `Deload (-10%): Use ${deloadWeight}kg to break plateau & reset form`,
      consecutiveMisses,
    };
  }

  const latestSession = recentSessions[0];
  const latestSets = latestSession.sets;
  const lastSessionWeight = Math.max(0, ...latestSets.map((s: any) => Number(s.weight) || 0));

  // 1. Double Progression
  if (policy === 'double') {
    const isRange = targetLowReps !== targetHighReps;

    // Check if user has ALREADY completed all sets TODAY
    if (todayCompleted.length >= exercise.targetSets) {
      const crushedToday = todayCompleted.every((s: any) => (s.reps || 0) >= targetHighReps);
      if (crushedToday) {
        const nextW = todayMaxWeight + step;
        return {
          policy: 'double',
          recommendedWeight: nextW,
          recommendedReps: isRange ? `${targetLowReps}–${targetHighReps}` : String(targetLowReps),
          weightDelta: step,
          isDeload: false,
          reason: `🔥 Target Hit! Level up to ${nextW}kg (+${step}kg) next session`,
          consecutiveMisses: 0,
        };
      }
      return {
        policy: 'double',
        recommendedWeight: todayMaxWeight,
        recommendedReps: isRange ? `${targetLowReps}–${targetHighReps}` : String(targetLowReps),
        weightDelta: 0,
        isDeload: false,
        reason: `Solid session! Hold ${todayMaxWeight}kg until hitting ${targetHighReps} reps`,
        consecutiveMisses: 0,
      };
    }

    // If workout is actively in progress (e.g. Set 2 or 3 of 3)
    if (todayCompleted.length > 0) {
      const allDoneSoFarHit = todayCompleted.every((s: any) => (s.reps || 0) >= targetHighReps);
      if (allDoneSoFarHit) {
        return {
          policy: 'double',
          recommendedWeight: todayMaxWeight,
          recommendedReps: isRange ? `${targetLowReps}–${targetHighReps}` : String(targetLowReps),
          weightDelta: 0,
          isDeload: false,
          reason: `⚡ Set ${todayCompleted.length + 1} of ${exercise.targetSets}: Hit ${targetHighReps}+ reps to unlock +${step}kg`,
          consecutiveMisses: 0,
        };
      }
    }

    // Baseline from previous completed workout
    const hitPastTopRange =
      latestSets.length >= exercise.targetSets &&
      latestSets.every((s: any) => (s.reps || 0) >= targetHighReps);

    if (hitPastTopRange) {
      const nextWeight = (lastSessionWeight > 0 ? lastSessionWeight : currentWeight) + step;
      return {
        policy: 'double',
        recommendedWeight: nextWeight,
        recommendedReps: isRange ? `${targetLowReps}–${targetHighReps}` : String(targetLowReps),
        weightDelta: step,
        isDeload: false,
        reason: `🎯 Target: ${nextWeight}kg (+${step}kg) · Aim for ${targetHighReps} reps`,
        consecutiveMisses: 0,
      };
    }

    return {
      policy: 'double',
      recommendedWeight: currentWeight,
      recommendedReps: isRange ? `${targetLowReps}–${targetHighReps}` : String(targetLowReps),
      weightDelta: 0,
      isDeload: false,
      reason: `🎯 Target: ${currentWeight}kg · Aim for ${targetHighReps} reps across all sets`,
      consecutiveMisses,
    };
  }

  // 2. Greyskull LP
  if (policy === 'greyskull') {
    const lastSet = latestSets[latestSets.length - 1];
    const amrapReps = lastSet ? (lastSet.reps || 0) : 0;
    const straightSetsHit = latestSets.slice(0, -1).every((s: any) => (s.reps || 0) >= targetLowReps);

    if (straightSetsHit && amrapReps >= targetLowReps * 2) {
      const doubleStep = step * 2;
      return {
        policy: 'greyskull',
        recommendedWeight: currentWeight + doubleStep,
        recommendedReps: String(targetLowReps),
        weightDelta: doubleStep,
        isDeload: false,
        reason: `🚀 AMRAP Beast Mode: Double jump +${doubleStep}kg (${currentWeight + doubleStep}kg)`,
        consecutiveMisses: 0,
      };
    }

    if (straightSetsHit && amrapReps >= targetLowReps) {
      return {
        policy: 'greyskull',
        recommendedWeight: currentWeight + step,
        recommendedReps: String(targetLowReps),
        weightDelta: step,
        isDeload: false,
        reason: `💪 Target Hit: Add +${step}kg (${currentWeight + step}kg)`,
        consecutiveMisses: 0,
      };
    }
  }

  // 3. Linear Progression
  if (policy === 'linear') {
    const hitAllReps =
      latestSets.length >= exercise.targetSets &&
      latestSets.every((s: any) => (s.reps || 0) >= targetLowReps);

    if (hitAllReps) {
      return {
        policy: 'linear',
        recommendedWeight: currentWeight + step,
        recommendedReps: String(targetLowReps),
        weightDelta: step,
        isDeload: false,
        reason: `📈 Target Hit: Add +${step}kg (${currentWeight + step}kg) on all sets`,
        consecutiveMisses: 0,
      };
    }
  }

  return {
    policy,
    recommendedWeight: currentWeight,
    recommendedReps: exercise.targetReps,
    weightDelta: 0,
    isDeload: false,
    reason: `🎯 Target: ${currentWeight}kg · Consolidate ${exercise.targetSets}×${exercise.targetReps}`,
    consecutiveMisses,
  };
}
