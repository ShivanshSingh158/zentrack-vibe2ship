/**
 * oneRepMaxEngine.ts — ZenTrack Mobile
 *
 * Scientific 1RM (One-Rep Maximum) Suite:
 * Implements 6 gold-standard exercise physiology formulas + composite average.
 * Capped at 12–15 reps for physiological accuracy.
 */

export type OneRMFormula = 'epley' | 'brzycki' | 'lombardi' | 'oconner' | 'mayhew' | 'wathen' | 'average';

export const FORMULA_NAMES: Record<OneRMFormula, string> = {
  epley: 'Epley (Standard)',
  brzycki: 'Brzycki (High Accuracy)',
  lombardi: 'Lombardi (Power)',
  oconner: "O'Conner (Linear)",
  mayhew: 'Mayhew (Exponential)',
  wathen: 'Wathen (Strength)',
  average: 'Scientific Composite Average',
};

export const REP_CAP = 15;

/**
 * 1. Epley Formula: 1RM = W * (1 + r / 30)
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, REP_CAP);
  return weight * (1 + r / 30);
}

/**
 * 2. Brzycki Formula: 1RM = W * (36 / (37 - r))
 */
export function brzycki1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, 36);
  return weight * (36 / (37 - r));
}

/**
 * 3. Lombardi Formula: 1RM = W * (r ^ 0.10)
 */
export function lombardi1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, REP_CAP);
  return weight * Math.pow(r, 0.1);
}

/**
 * 4. O'Conner Formula: 1RM = W * (1 + r / 40)
 */
export function oconner1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, REP_CAP);
  return weight * (1 + r / 40);
}

/**
 * 5. Mayhew Formula: 1RM = (100 * W) / (52.2 + 41.9 * e^(-0.055 * r))
 */
export function mayhew1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, REP_CAP);
  return (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * r));
}

/**
 * 6. Wathen Formula: 1RM = (100 * W) / (48.8 + 53.8 * e^(-0.075 * r))
 */
export function wathen1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, REP_CAP);
  return (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * r));
}

/**
 * Estimate 1RM using specified scientific formula or composite average
 */
export function estimate1RM(weight: number, reps: number, formula: OneRMFormula = 'epley'): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;

  let val = 0;
  switch (formula) {
    case 'brzycki':
      val = brzycki1RM(weight, reps);
      break;
    case 'lombardi':
      val = lombardi1RM(weight, reps);
      break;
    case 'oconner':
      val = oconner1RM(weight, reps);
      break;
    case 'mayhew':
      val = mayhew1RM(weight, reps);
      break;
    case 'wathen':
      val = wathen1RM(weight, reps);
      break;
    case 'average': {
      const sum =
        epley1RM(weight, reps) +
        brzycki1RM(weight, reps) +
        lombardi1RM(weight, reps) +
        oconner1RM(weight, reps) +
        mayhew1RM(weight, reps) +
        wathen1RM(weight, reps);
      val = sum / 6;
      break;
    }
    case 'epley':
    default:
      val = epley1RM(weight, reps);
      break;
  }

  return Math.round(val * 10) / 10;
}

export interface RepMaxTier {
  reps: number;
  percentage: number;
  weight: number;
}

/**
 * Calculates full Rep Max Breakdown Table (100% down to 70% 12RM)
 */
export function calculateRepMaxTable(oneRM: number): RepMaxTier[] {
  if (oneRM <= 0) return [];
  const percentages = [
    { reps: 1, pct: 1.0 },
    { reps: 2, pct: 0.95 },
    { reps: 4, pct: 0.90 },
    { reps: 6, pct: 0.85 },
    { reps: 8, pct: 0.80 },
    { reps: 10, pct: 0.75 },
    { reps: 12, pct: 0.70 },
  ];

  return percentages.map(p => ({
    reps: p.reps,
    percentage: Math.round(p.pct * 100),
    weight: Math.round(oneRM * p.pct * 10) / 10,
  }));
}
