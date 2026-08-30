/**
 * warmupGenerator.ts — ZenTrack Mobile
 *
 * Automated 2-Set Warm-up Ladder Generator:
 * Generates an efficient, high-performance 2-tier warm-up protocol:
 * - W1 (50% Working Load × 8-10 reps): Synovial joint lubrication, blood flow, movement groove.
 * - W2 (75% Working Load × 4-5 reps): CNS potentiation & tendon acclimation without metabolic fatigue.
 *
 * Snapped to 2.5 kg increments (or min 20 kg barbell tare for heavy lifts).
 */

import { GymSet } from '../types/gym.types';

export function generateWarmupLadder(workingWeight: number, barTare = 20): GymSet[] {
  const targetW = Math.max(10, workingWeight || 40);

  // If working weight is light (<= 25kg, e.g. lateral raises, bicep curls, light accessories)
  if (targetW <= 25) {
    const w1 = Math.max(5, Math.round((targetW * 0.5) / 2.5) * 2.5);
    const w2 = Math.min(targetW - 2.5, Math.max(w1 + 2.5, Math.round((targetW * 0.75) / 2.5) * 2.5));

    return [
      {
        setNumber: 1,
        weight: w1,
        reps: 10,
        completed: false,
        isWarmup: true,
        warmupLabel: 'W1',
      },
      {
        setNumber: 2,
        weight: w2 > w1 ? w2 : w1 + 2.5,
        reps: 6,
        completed: false,
        isWarmup: true,
        warmupLabel: 'W2',
      },
    ];
  }

  // Moderate to Heavy Compound & Machine exercises (> 25kg)
  const snap2_5 = (val: number) => Math.round(val / 2.5) * 2.5;

  // W1: 50% load (min 20kg barbell tare if >= 40kg, otherwise 50%)
  const minW1 = targetW >= 40 ? barTare : 12.5;
  const w1 = Math.max(minW1, snap2_5(targetW * 0.5));

  // W2: 75% load (guaranteed higher than W1 and below working weight)
  const rawW2 = snap2_5(targetW * 0.75);
  const w2 = Math.min(targetW - 2.5, Math.max(w1 + 2.5, rawW2));

  return [
    {
      setNumber: 1,
      weight: w1,
      reps: 8,
      completed: false,
      isWarmup: true,
      warmupLabel: 'W1',
    },
    {
      setNumber: 2,
      weight: w2,
      reps: 4,
      completed: false,
      isWarmup: true,
      warmupLabel: 'W2',
    },
  ];
}

/**
 * Inserts or replaces warmups at the top of an exercise's set list
 */
export function insertWarmupLadder(
  existingSets: GymSet[],
  workingWeight: number,
  barTare = 20
): GymSet[] {
  // Filter out any existing warmups
  const workingSetsOnly = existingSets.filter(s => !s.isWarmup);

  const warmups = generateWarmupLadder(workingWeight, barTare);

  // Renumber working sets sequentially starting from 1
  const reindexedWorkingSets = workingSetsOnly.map((s, i) => ({
    ...s,
    setNumber: i + 1,
    isWarmup: false,
    warmupLabel: undefined,
  }));

  return [...warmups, ...reindexedWorkingSets];
}

