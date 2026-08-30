/**
 * effortEngine.ts — ZenTrack Mobile
 *
 * RIR (Reps in Reserve) & RPE (Rating of Perceived Exertion) Dual-Scale Engine:
 * - High-precision Automatic RIR Inference based on relative load, rep decay, and set sequencing
 * - Real-time bidirectional conversion: RPE = 10 - RIR, RIR = 10 - RPE
 * - Hard Set classification (RIR <= 3 / RPE >= 7)
 * - Effort distribution and hypertrophy stimulus tracking
 */

export const HARD_RIR_THRESHOLD = 3; // RIR <= 3 (RPE >= 7) drives muscle hypertrophy
export const MIN_RATED_SETS_FOR_AVG = 4;

export type EffortScale = 'rir' | 'rpe';

export interface SetLike {
  weight?: number | string | null;
  reps?: number | string | null;
  rir?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  completed?: boolean;
  [key: string]: any;
}

/**
 * Normalizes effort input to RIR value (0 to 10)
 */
export function toRIR(value: number | null | undefined, scale: EffortScale = 'rir'): number | null {
  if (value === null || value === undefined) return null;
  if (scale === 'rpe') {
    return Math.max(0, Math.min(10, Math.round((10 - value) * 10) / 10));
  }
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

/**
 * Converts internal RIR to display scale value
 */
export function fromRIR(rir: number | null | undefined, scale: EffortScale = 'rir'): number | null {
  if (rir === null || rir === undefined) return null;
  if (scale === 'rpe') {
    return Math.max(6, Math.min(10, Math.round((10 - rir) * 10) / 10));
  }
  return Math.max(0, Math.min(10, Math.round(rir * 10) / 10));
}

/**
 * High-Precision Automatic RIR Inference Engine:
 * Infers true Reps in Reserve (0 to 5) when user did not manually enter RIR.
 *
 * Evaluates:
 * 1. Relative Load (% of Top Set Weight in the current exercise session)
 * 2. Intra-Session Rep Drop-Off & Fatigue Dynamics across consecutive sets
 * 3. Final Working Set Exertion Rule
 * 4. Bodyweight & High Rep Exertion Heuristics
 */
export function inferAutomaticRIR(
  currentSet: SetLike,
  exerciseSets?: SetLike[],
  historicalMax1RM?: number | null
): number {
  // 1. Manual user entry takes highest priority if present
  if (currentSet.rir !== undefined && currentSet.rir !== null) {
    return Math.max(0, Math.min(10, Math.round(Number(currentSet.rir) * 10) / 10));
  }
  if (currentSet.rpe !== undefined && currentSet.rpe !== null) {
    return Math.max(0, Math.min(10, Math.round((10 - Number(currentSet.rpe)) * 10) / 10));
  }
  if (currentSet.isWarmup) {
    return 5;
  }

  const weight = Number(currentSet.weight) || 0;
  const reps = Number(currentSet.reps) || 0;

  if (reps <= 0) return 4;

  const validSets = (exerciseSets || []).filter(s => s.completed !== false && !s.isWarmup);
  const weights = validSets.map(s => Number(s.weight) || 0);
  const maxSessionWeight = Math.max(weight, ...weights);

  // Bodyweight-only exercise heuristic (e.g. pullups, pushups, dips with 0kg logged)
  if (maxSessionWeight <= 0) {
    if (reps >= 15) return 1;
    if (reps >= 10) return 2;
    if (reps >= 6) return 3;
    return 4;
  }

  const loadRatio = weight / maxSessionWeight;

  // Step 1: Base RIR from load ratio relative to session peak
  let rir = 2;
  if (loadRatio < 0.65) {
    rir = 5; // Warmup / Ramp-up feeder set
  } else if (loadRatio < 0.75) {
    rir = 4; // Light / sub-maximal preparation set
  } else if (loadRatio < 0.85) {
    rir = 3; // Moderate working volume
  } else if (loadRatio < 0.95) {
    rir = 2; // Heavy working set
  } else {
    rir = 1; // Top / Peak working set
  }

  // Step 2: Check intra-session set sequence and rep drop-off
  const currentIdx = validSets.findIndex(s => s === currentSet);
  if (currentIdx > 0) {
    const prevSet = validSets[currentIdx - 1];
    const prevWeight = Number(prevSet.weight) || 0;
    const prevReps = Number(prevSet.reps) || 0;

    // If same or higher weight but reps dropped significantly (fatigue accumulation)
    if (weight >= prevWeight * 0.95 && prevReps > reps) {
      const repDrop = prevReps - reps;
      if (repDrop >= 3) {
        rir = Math.max(0, rir - 2); // Heavy rep drop -> failure / RIR 0
      } else if (repDrop >= 1) {
        rir = Math.max(0, rir - 1);
      }
    }
  }

  // Step 3: Final set rule (if last set of the exercise at working weight)
  const isLastSet = currentIdx === validSets.length - 1 && validSets.length >= 2;
  if (isLastSet && loadRatio >= 0.80) {
    rir = Math.min(rir, 1);
  }

  // Step 4: High-rep burnout (>= 15 reps at >= 70% load)
  if (reps >= 15 && loadRatio >= 0.70) {
    rir = Math.min(rir, 1);
  }

  // Step 5: Heavy grinder (<= 4 reps at >= 98% top weight)
  if (reps <= 4 && loadRatio >= 0.98 && reps >= 1) {
    rir = Math.min(rir, 1);
  }

  return Math.max(0, Math.min(10, rir));
}

/**
 * Checks if a set is a true Hard Working Set
 */
export function isHardSet(
  setOrRir: SetLike | number | null | undefined,
  exerciseSets?: SetLike[],
  scale: EffortScale = 'rir'
): boolean {
  if (typeof setOrRir === 'number') {
    const rir = toRIR(setOrRir, scale);
    return rir !== null && rir <= HARD_RIR_THRESHOLD;
  }
  if (setOrRir && typeof setOrRir === 'object') {
    const rir = inferAutomaticRIR(setOrRir, exerciseSets);
    return rir <= HARD_RIR_THRESHOLD;
  }
  return true;
}

export interface EffortSummary {
  totalSets: number;
  ratedSets: number;
  hardSets: number;
  averageRIR: number | null;
  averageRPE: number | null;
  hardSetPercentage: number;
}

/**
 * Computes effort summary statistics for a collection of sets with automatic RIR inference
 */
export function calculateEffortSummary(
  sets: (SetLike & { exerciseSets?: SetLike[] })[]
): EffortSummary {
  const completed = (sets || []).filter(s => s.completed !== false && !s.isWarmup);
  let ratedCount = 0;
  let rirSum = 0;
  let hardCount = 0;

  for (const s of completed) {
    const isManuallyRated = (s.rir !== undefined && s.rir !== null) || (s.rpe !== undefined && s.rpe !== null);
    if (isManuallyRated) {
      ratedCount++;
    }

    const rir = inferAutomaticRIR(s, s.exerciseSets || completed);
    rirSum += rir;
    if (rir <= HARD_RIR_THRESHOLD) {
      hardCount++;
    }
  }

  const effectiveCount = completed.length;
  const avgRIR = effectiveCount > 0 ? Math.round((rirSum / effectiveCount) * 10) / 10 : 2;
  const avgRPE = Math.round((10 - avgRIR) * 10) / 10;
  const hardPct = effectiveCount > 0 ? Math.round((hardCount / effectiveCount) * 100) : 100;

  return {
    totalSets: completed.length,
    ratedSets: ratedCount,
    hardSets: hardCount,
    averageRIR: avgRIR,
    averageRPE: avgRPE,
    hardSetPercentage: hardPct,
  };
}

