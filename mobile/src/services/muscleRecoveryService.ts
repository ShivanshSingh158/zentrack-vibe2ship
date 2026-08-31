/**
 * muscleRecoveryService.ts — ZenTrack Mobile
 *
 * Anatomical Muscle Load & Fatigue Recovery Calculation Engine:
 * - Maps exercises to primary (1.0x) and secondary (0.4x) anatomical muscles.
 * - Computes training load distribution across 18 drawable muscle groups.
 * - Exponential Fatigue & Muscle Recovery modeling (Fatigued / Recovering / Ready).
 * - Strength retention & 1RM capacity decay tracking over time.
 */

import { GymDayLog } from '../types/gym.types';
import { inferAutomaticRIR } from './effortEngine';
import { computeOrGetHotCache, generateDatasetFingerprint } from '../utils/hotCacheStore';

export const MUSCLES = [
  'trapezius',
  'deltoids',
  'chest',
  'upper-back',
  'serratus',
  'biceps',
  'triceps',
  'forearm',
  'abs',
  'obliques',
  'lower-back',
  'gluteal',
  'quadriceps',
  'hamstring',
  'adductors',
  'hip-flexors',
  'calves',
  'tibialis',
] as const;

export type MuscleSlug = typeof MUSCLES[number];

export const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'] as const;

export const MUSCLE_NAME: Record<string, string> = {
  trapezius: 'Traps',
  deltoids: 'Shoulders',
  chest: 'Chest',
  'upper-back': 'Upper Back & Lats',
  serratus: 'Serratus',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearm: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  'lower-back': 'Lower Back',
  gluteal: 'Glutes',
  quadriceps: 'Quads',
  hamstring: 'Hamstrings',
  adductors: 'Adductors',
  'hip-flexors': 'Hip Flexors',
  calves: 'Calves',
  tibialis: 'Shins / Tibialis',
};

const ALIAS: Record<string, MuscleSlug | null> = {
  // Primaries
  abs: 'abs',
  abdominals: 'abs',
  core: 'abs',
  'lower abs': 'abs',
  'upper abs': 'abs',
  pectorals: 'chest',
  chest: 'chest',
  'mid chest': 'chest',
  'upper chest': 'chest',
  'lower chest': 'chest',
  biceps: 'biceps',
  'short bicep': 'biceps',
  'long bicep': 'biceps',
  brachialis: 'biceps',
  glutes: 'gluteal',
  gluteal: 'gluteal',
  delts: 'deltoids',
  deltoids: 'deltoids',
  shoulders: 'deltoids',
  'front delts': 'deltoids',
  'side delts': 'deltoids',
  'rear delts': 'deltoids',
  triceps: 'triceps',
  'long tricep': 'triceps',
  'lat/med tricep': 'triceps',
  'upper back': 'upper-back',
  'upper-back': 'upper-back',
  'mid-back': 'upper-back',
  'mid back': 'upper-back',
  'lat width': 'upper-back',
  lats: 'upper-back',
  'latissimus dorsi': 'upper-back',
  rhomboids: 'upper-back',
  calves: 'calves',
  gastrocnemius: 'calves',
  soleus: 'calves',
  quads: 'quadriceps',
  quadriceps: 'quadriceps',
  'quad teardrop': 'quadriceps',
  forearms: 'forearm',
  forearm: 'forearm',
  'forearm flexors': 'forearm',
  'forearm extensors': 'forearm',
  hamstrings: 'hamstring',
  hamstring: 'hamstring',
  spine: 'lower-back',
  'lower back': 'lower-back',
  'lower-back': 'lower-back',
  traps: 'trapezius',
  trapezius: 'trapezius',
  'upper traps': 'trapezius',
  adductors: 'adductors',
  'hip flexors': 'hip-flexors',
  'hip-flexors': 'hip-flexors',
  obliques: 'obliques',
  'serratus anterior': 'serratus',
  serratus: 'serratus',
  shins: 'tibialis',
  tibialis: 'tibialis',
};

const BY_BODYPART: Record<string, Partial<Record<MuscleSlug, number>>> = {
  chest: { chest: 1 },
  back: { 'upper-back': 0.75, 'lower-back': 0.25 },
  shoulders: { deltoids: 1 },
  arms: { biceps: 0.5, triceps: 0.5 },
  'upper arms': { biceps: 0.5, triceps: 0.5 },
  'lower arms': { forearm: 1 },
  forearms: { forearm: 1 },
  waist: { abs: 0.7, obliques: 0.3 },
  core: { abs: 0.7, obliques: 0.3 },
  legs: { quadriceps: 0.45, hamstring: 0.35, gluteal: 0.2 },
  'upper legs': { quadriceps: 0.45, hamstring: 0.35, gluteal: 0.2 },
  'lower legs': { calves: 0.8, tibialis: 0.2 },
  calves: { calves: 1 },
  traps: { trapezius: 1 },
  neck: { trapezius: 1 },
};

export function canonicalizeMuscleSlug(name?: string): MuscleSlug | null {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  if ((MUSCLES as readonly string[]).includes(clean)) return clean as MuscleSlug;
  return ALIAS[clean] || null;
}

/**
 * Returns muscle weight distribution (primary = 1.0, secondary = 0.4) for any exercise
 */
export function getExerciseMuscleWeights(exercise: { name?: string; muscle?: string; target?: string }): Partial<Record<MuscleSlug, number>> {
  const out: Partial<Record<MuscleSlug, number>> = {};
  const name = (exercise.name || '').toLowerCase();
  const muscle = (exercise.muscle || '').toLowerCase();
  const target = (exercise.target || '').toLowerCase();

  const add = (slugStr: string | null | undefined, weight: number) => {
    const slug = canonicalizeMuscleSlug(slugStr || '');
    if (slug) {
      out[slug] = Math.max(out[slug] || 0, weight);
    }
  };

  // Direct muscle field match
  add(muscle, 1.0);
  add(target, 1.0);

  // Common exercise patterns & secondary muscles
  if (name.includes('press') && (name.includes('bench') || name.includes('chest') || name.includes('incline') || name.includes('decline') || name.includes('push-up') || name.includes('pushup') || name.includes('dip'))) {
    add('chest', 1.0);
    add('triceps', 0.4);
    add('deltoids', 0.4);
  } else if (name.includes('overhead press') || name.includes('shoulder press') || name.includes('military press') || name.includes('arnold press')) {
    add('deltoids', 1.0);
    add('triceps', 0.4);
    add('trapezius', 0.3);
  } else if (name.includes('lateral raise') || name.includes('front raise')) {
    add('deltoids', 1.0);
    add('trapezius', 0.3);
  } else if (name.includes('pulldown') || name.includes('pull-up') || name.includes('pullup') || name.includes('chin-up')) {
    add('upper-back', 1.0);
    add('biceps', 0.4);
    add('forearm', 0.3);
  } else if (name.includes('row')) {
    add('upper-back', 1.0);
    add('biceps', 0.4);
    add('lower-back', 0.3);
    add('trapezius', 0.3);
  } else if (name.includes('deadlift') || name.includes('rdl')) {
    add('hamstring', 1.0);
    add('gluteal', 0.8);
    add('lower-back', 0.8);
    add('trapezius', 0.4);
    add('forearm', 0.4);
  } else if (name.includes('squat') || name.includes('leg press') || name.includes('hack squat') || name.includes('lunge')) {
    add('quadriceps', 1.0);
    add('gluteal', 0.7);
    add('adductors', 0.4);
    add('calves', 0.3);
  } else if (name.includes('curl') && !name.includes('leg curl')) {
    add('biceps', 1.0);
    add('forearm', 0.4);
  } else if (name.includes('tricep') || name.includes('skullcrusher') || name.includes('pushdown') || name.includes('extension') && !name.includes('leg extension')) {
    add('triceps', 1.0);
  } else if (name.includes('leg extension')) {
    add('quadriceps', 1.0);
  } else if (name.includes('leg curl')) {
    add('hamstring', 1.0);
    add('calves', 0.3);
  } else if (name.includes('calf') || name.includes('calves')) {
    add('calves', 1.0);
    add('tibialis', 0.3);
  } else if (name.includes('crunch') || name.includes('sit-up') || name.includes('leg raise') || name.includes('plank')) {
    add('abs', 1.0);
    add('obliques', 0.4);
  } else if (name.includes('shrug')) {
    add('trapezius', 1.0);
    add('forearm', 0.4);
  }

  // Fallback if empty
  if (Object.keys(out).length === 0 && muscle) {
    const fb = BY_BODYPART[muscle];
    if (fb) Object.assign(out, fb);
  }

  return out;
}

/**
 * Calculates effective volume load per muscle from an array of workout logs
 */
export function calculateMuscleLoad(
  logs: GymDayLog[],
  windowDays: number = 7,
  anchorDateStr?: string,
  onlyHardSets: boolean = false
): Record<MuscleSlug, number> {
  const cacheKey = `muscle_load_${generateDatasetFingerprint(logs, `${windowDays}_${anchorDateStr || ''}_${onlyHardSets}`)}`;
  return computeOrGetHotCache(cacheKey, () => {
    const load: Record<MuscleSlug, number> = {} as any;
    MUSCLES.forEach(m => (load[m] = 0));

    const now = anchorDateStr ? new Date(anchorDateStr).getTime() : Date.now();
    const windowMs = windowDays === 0 ? Infinity : windowDays * 86400000;

    for (const log of logs || []) {
      if (!log.date) continue;
      const logTime = new Date(log.date).getTime();
      if (windowMs !== Infinity && (now - logTime > windowMs || logTime > now + 86400000)) {
        continue;
      }

      for (const ex of log.exercises || []) {
        if (ex.skipped) continue;
        const completedSets = (ex.setsLog || []).filter((s: any) => {
          if (!s.completed || s.isWarmup) return false;
          if (!onlyHardSets) return true;
          const rir = inferAutomaticRIR(s, ex.setsLog);
          return rir <= 3;
        }).length;
        if (!completedSets) continue;

        const weights = getExerciseMuscleWeights(ex);
        for (const [slug, w] of Object.entries(weights)) {
          if (slug in load) {
            load[slug as MuscleSlug] += (w || 0) * completedSets;
          }
        }
      }
    }

    return load;
  });
}

/**
 * Normalizes muscle load into 0–4 discrete shading tiers
 */
export function calculateMuscleLevels(load: Record<MuscleSlug, number>): Record<MuscleSlug, number> {
  const values = Object.values(load);
  const max = Math.max(0, ...values);
  const levels: Record<MuscleSlug, number> = {} as any;

  MUSCLES.forEach(m => {
    const val = load[m] || 0;
    if (!val || max <= 0) {
      levels[m] = 0;
    } else {
      levels[m] = Math.max(1, Math.min(4, Math.ceil((val / max) * 4)));
    }
  });

  return levels;
}

export type FatigueState = 'ready' | 'recovering' | 'fatigued';

export interface MuscleRecoveryData {
  fatigueScore: number; // 0.0 (fresh) to 1.0+ (heavily fatigued)
  fatigueLevel: number; // 0 (ready) to 4 (peak fatigue)
  state: FatigueState;
  strengthScore: number; // 0.60 to 1.0 (retained capacity)
  lastTrainedDaysAgo: number | null;
  totalSets: number;
}

/**
 * Calculates exponential Fatigue & Recovery state for each muscle based on training recency & volume
 */
export function calculateMuscleFatigue(
  logs: GymDayLog[],
  anchorDateStr?: string
): Record<MuscleSlug, MuscleRecoveryData> {
  const cacheKey = `muscle_fatigue_${generateDatasetFingerprint(logs, anchorDateStr || '')}`;
  return computeOrGetHotCache(cacheKey, () => {
    const out: Record<MuscleSlug, MuscleRecoveryData> = {} as any;
    const now = anchorDateStr ? new Date(anchorDateStr).getTime() : Date.now();

    const muscleHistory: Record<MuscleSlug, { sets: number; time: number }[]> = {} as any;
    MUSCLES.forEach(m => (muscleHistory[m] = []));

    // Collect all set timestamps per muscle
    for (const log of logs || []) {
      if (!log.date) continue;
      const logTime = new Date(log.date).getTime();
      if (logTime > now + 86400000) continue;

      for (const ex of log.exercises || []) {
        if (ex.skipped) continue;
        const completedSets = (ex.setsLog || []).filter((s: any) => s.completed).length;
        if (!completedSets) continue;

        const weights = getExerciseMuscleWeights(ex);
        for (const [slug, w] of Object.entries(weights)) {
          if (slug in muscleHistory) {
            muscleHistory[slug as MuscleSlug].push({
              sets: completedSets * (w || 1),
              time: logTime,
            });
          }
        }
      }
    }

    // Calculate fatigue decay
    MUSCLES.forEach(m => {
      const hits = muscleHistory[m];
      let totalFatigue = 0;
      let mostRecentTime: number | null = null;
      let totalSetsInWindow = 0;

      for (const hit of hits) {
        if (!mostRecentTime || hit.time > mostRecentTime) {
          mostRecentTime = hit.time;
        }
        const daysAgo = Math.max(0, (now - hit.time) / 86400000);
        if (daysAgo <= 7) {
          totalSetsInWindow += hit.sets;
        }
        // Half-life recovery decay (~36 hours / 1.5 days)
        const decay = Math.exp(-daysAgo / 1.5);
        const intensityWeight = Math.min(1.5, 0.25 + hit.sets * 0.08);
        totalFatigue += intensityWeight * decay;
      }

      const daysAgo = mostRecentTime ? Math.max(0, Math.floor((now - mostRecentTime) / 86400000)) : null;
      const fLevel = Math.min(4, Math.max(0, Math.ceil(totalFatigue * 3.5)));
      const state: FatigueState = fLevel >= 3 ? 'fatigued' : fLevel >= 1 ? 'recovering' : 'ready';

      // Exponential strength recovery curve
      const hoursSince = mostRecentTime ? (now - mostRecentTime) / 3600000 : 999;
      const strengthScore = Math.min(1.0, 0.65 + 0.35 * (1 - Math.exp(-hoursSince / 36)));

      out[m] = {
        fatigueScore: Math.round(totalFatigue * 100) / 100,
        fatigueLevel: fLevel,
        state,
        strengthScore: Math.round(strengthScore * 100) / 100,
        lastTrainedDaysAgo: daysAgo,
        totalSets: Math.round(totalSetsInWindow),
      };
    });

    return out;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── 3 MACRO LONG-TERM ANALYTICS ENGINES (Volume, Growth, Balance) ────────────
// ═════════════════════════════════════════════════════════════════════════════

export interface MacroMuscleVolume {
  sets: number;
  volumeKg: number;
  level: number; // 0–4
  percentage: number;
}

export interface MacroMuscleGrowth {
  gainPct: number; // e.g. +12.5%
  status: 'high_gain' | 'steady_gain' | 'maintained' | 'untrained';
  color: string;
  bestExercise: string | null;
  loadDeltaKg: number;
}

export interface MacroMuscleBalance {
  status: 'optimal' | 'dominant' | 'lagging' | 'untrained';
  ratio: number;
  color: string;
  recommendation: string;
}

/**
 * 1. Macro Volume Load Engine (Cumulative sets & tonnage)
 */
export function calculateMacroVolumeLoad(
  logs: GymDayLog[],
  windowDays: number = 30,
  anchorDateStr?: string
): Record<MuscleSlug, MacroMuscleVolume> {
  const cacheKey = `macro_vol_${generateDatasetFingerprint(logs, `${windowDays}_${anchorDateStr || ''}`)}`;
  return computeOrGetHotCache(cacheKey, () => {
    const out: Record<MuscleSlug, MacroMuscleVolume> = {} as any;
    MUSCLES.forEach(m => (out[m] = { sets: 0, volumeKg: 0, level: 0, percentage: 0 }));

    const now = anchorDateStr ? new Date(anchorDateStr).getTime() : Date.now();
    const windowMs = windowDays === 0 ? Infinity : windowDays * 86400000;

    let totalKgAll = 0;

    for (const log of logs || []) {
      if (!log.date) continue;
      const logTime = new Date(log.date).getTime();
      if (windowMs !== Infinity && (now - logTime > windowMs || logTime > now + 86400000)) {
        continue;
      }

      for (const ex of log.exercises || []) {
        if (ex.skipped) continue;
        const weights = getExerciseMuscleWeights(ex);

        for (const s of ex.setsLog || []) {
          if (!s.completed) continue;
          const w = Number(s.weight) || 0;
          const r = Number(s.reps) || 0;
          const setVol = w * r;

          for (const [slug, mWeight] of Object.entries(weights)) {
            if (slug in out) {
              const muscleKey = slug as MuscleSlug;
              out[muscleKey].sets += mWeight || 1;
              out[muscleKey].volumeKg += setVol * (mWeight || 1);
              totalKgAll += setVol * (mWeight || 1);
            }
          }
        }
      }
    }

    const maxVol = Math.max(0, ...Object.values(out).map(v => v.volumeKg));

    MUSCLES.forEach(m => {
      const item = out[m];
      item.sets = Math.round(item.sets * 10) / 10;
      item.volumeKg = Math.round(item.volumeKg);
      item.percentage = totalKgAll > 0 ? Math.round((item.volumeKg / totalKgAll) * 100) : 0;
      item.level = maxVol > 0 && item.volumeKg > 0 ? Math.max(1, Math.min(4, Math.ceil((item.volumeKg / maxVol) * 4))) : 0;
    });

    return out;
  });
}

/**
 * 2. Macro Growth & Overload Engine (Progressive strength % gains)
 */
export function calculateMuscleGrowthProgression(
  logs: GymDayLog[],
  windowDays: number = 30,
  anchorDateStr?: string
): Record<MuscleSlug, MacroMuscleGrowth> {
  const cacheKey = `macro_growth_${generateDatasetFingerprint(logs, `${windowDays}_${anchorDateStr || ''}`)}`;
  return computeOrGetHotCache(cacheKey, () => {
    const out: Record<MuscleSlug, MacroMuscleGrowth> = {} as any;
    MUSCLES.forEach(m => (out[m] = {
      gainPct: 0,
      status: 'untrained',
      color: '#232128',
      bestExercise: null,
      loadDeltaKg: 0,
    }));

    const now = anchorDateStr ? new Date(anchorDateStr).getTime() : Date.now();
    const windowMs = windowDays === 0 ? Infinity : windowDays * 86400000;

    // Filter logs in window & sort chronologically
    const filtered = (logs || [])
      .filter(l => {
        if (!l.date) return false;
        const t = new Date(l.date).getTime();
        return windowMs === Infinity || (now - t <= windowMs && t <= now + 86400000);
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (filtered.length === 0) return out;

    // Group exercise top loads by muscle over time
    const muscleExerciseLoads: Record<MuscleSlug, Record<string, { baseline1RM: number; latest1RM: number }>> = {} as any;
    MUSCLES.forEach(m => (muscleExerciseLoads[m] = {}));

    for (const log of filtered) {
      for (const ex of log.exercises || []) {
        if (ex.skipped || !ex.name) continue;
        const completed = (ex.setsLog || []).filter((s: any) => s.completed);
        if (!completed.length) continue;

        const topW = Math.max(0, ...completed.map((s: any) => Number(s.weight) || 0));
        const topR = completed.find((s: any) => Number(s.weight) === topW)?.reps || 1;
        const rm = topW * (1 + topR / 30); // Epley 1RM

        const weights = getExerciseMuscleWeights(ex);
        for (const slug of Object.keys(weights)) {
          if (slug in muscleExerciseLoads) {
            const mKey = slug as MuscleSlug;
            if (!muscleExerciseLoads[mKey][ex.name]) {
              muscleExerciseLoads[mKey][ex.name] = { baseline1RM: rm, latest1RM: rm };
            } else {
              muscleExerciseLoads[mKey][ex.name].latest1RM = rm;
            }
          }
        }
      }
    }

    // Calculate percentage delta
    MUSCLES.forEach(m => {
      const exercises = Object.entries(muscleExerciseLoads[m]);
      if (exercises.length === 0) return;

      let totalBase = 0;
      let totalLatest = 0;
      let bestEx = '';
      let maxExGain = -Infinity;

      for (const [exName, loads] of exercises) {
        totalBase += loads.baseline1RM;
        totalLatest += loads.latest1RM;
        const gain = loads.latest1RM - loads.baseline1RM;
        if (gain > maxExGain) {
          maxExGain = gain;
          bestEx = exName;
        }
      }

      if (totalBase > 0) {
        const delta = totalLatest - totalBase;
        const pct = Math.round((delta / totalBase) * 1000) / 10;
        let status: MacroMuscleGrowth['status'] = 'maintained';
        let color = '#89dceb'; // Ice blue maintained

        if (pct >= 8) {
          status = 'high_gain';
          color = '#ffd32a'; // 🔥 Gold
        } else if (pct >= 2.5) {
          status = 'steady_gain';
          color = '#5eda9e'; // 🟢 Green
        } else if (pct < 0) {
          status = 'maintained';
          color = '#8e8e93';
        }

        out[m] = {
          gainPct: pct,
          status,
          color,
          bestExercise: bestEx || null,
          loadDeltaKg: Math.round(delta * 10) / 10,
        };
      }
    });

    return out;
  });
}

/**
 * 3. Macro Symmetry & Balance Engine (Biomechanical push/pull & anterior/posterior ratios)
 */
export function calculateSymmetryAndBalance(
  logs: GymDayLog[],
  windowDays: number = 30,
  anchorDateStr?: string
): Record<MuscleSlug, MacroMuscleBalance> {
  const cacheKey = `macro_symmetry_${generateDatasetFingerprint(logs, `${windowDays}_${anchorDateStr || ''}`)}`;
  return computeOrGetHotCache(cacheKey, () => {
    const volumeMap = calculateMacroVolumeLoad(logs, windowDays, anchorDateStr);
    const out: Record<MuscleSlug, MacroMuscleBalance> = {} as any;

    // Key Pair Ratios
    const quadsVol = volumeMap.quadriceps.volumeKg || 1;
    const hamsVol = volumeMap.hamstring.volumeKg || 0;
    const glutesVol = volumeMap.gluteal.volumeKg || 0;
    const chestVol = volumeMap.chest.volumeKg || 1;
    const backVol = volumeMap['upper-back'].volumeKg || 0;
    const biVol = volumeMap.biceps.volumeKg || 1;
    const triVol = volumeMap.triceps.volumeKg || 0;

    // Leg Posterior / Anterior Ratio
    const legRatio = (hamsVol + glutesVol) / quadsVol;
    // Push / Pull Ratio
    const backChestRatio = backVol / chestVol;
    // Arm Ratio
    const armRatio = triVol / biVol;

    MUSCLES.forEach(m => {
      const vol = volumeMap[m].volumeKg;
      if (vol <= 0) {
        out[m] = { status: 'untrained', ratio: 0, color: '#232128', recommendation: 'No sets logged in this timeframe.' };
        return;
      }

      if (m === 'hamstring' || m === 'gluteal') {
        if (legRatio < 0.7) {
          out[m] = { status: 'lagging', ratio: Math.round(legRatio * 100) / 100, color: '#ff6961', recommendation: 'Posterior chain lagging behind Quads. Add RDLs or Hip Thrusts.' };
        } else {
          out[m] = { status: 'optimal', ratio: Math.round(legRatio * 100) / 100, color: '#5eda9e', recommendation: 'Excellent quad/hamstring structural balance.' };
        }
      } else if (m === 'quadriceps') {
        if (legRatio < 0.7) {
          out[m] = { status: 'dominant', ratio: Math.round(1 / legRatio * 100) / 100, color: '#ff9f4d', recommendation: 'Quad dominant. Balance with more hamstring volume.' };
        } else {
          out[m] = { status: 'optimal', ratio: 1.0, color: '#5eda9e', recommendation: 'Balanced leg hypertrophy stimulus.' };
        }
      } else if (m === 'chest') {
        if (backChestRatio < 0.8) {
          out[m] = { status: 'dominant', ratio: Math.round(1 / (backChestRatio || 0.1) * 100) / 100, color: '#ff9f4d', recommendation: 'Push volume exceeding pull volume. Add more rowing.' };
        } else {
          out[m] = { status: 'optimal', ratio: 1.0, color: '#5eda9e', recommendation: 'Symmetrical push / pull development.' };
        }
      } else if (m === 'upper-back' || m === 'trapezius') {
        if (backChestRatio < 0.8) {
          out[m] = { status: 'lagging', ratio: Math.round(backChestRatio * 100) / 100, color: '#ff6961', recommendation: 'Pull volume lagging behind pressing. Add 4 sets of lat work.' };
        } else {
          out[m] = { status: 'optimal', ratio: Math.round(backChestRatio * 100) / 100, color: '#5eda9e', recommendation: 'Strong back-to-chest volume posture support.' };
        }
      } else if (m === 'triceps' || m === 'biceps') {
        if (armRatio < 0.75 || armRatio > 1.4) {
          out[m] = { status: 'dominant', ratio: Math.round(armRatio * 100) / 100, color: '#ff9f4d', recommendation: 'Arm agonist/antagonist ratio slightly skewed.' };
        } else {
          out[m] = { status: 'optimal', ratio: Math.round(armRatio * 100) / 100, color: '#5eda9e', recommendation: 'Harmonious bicep/tricep volume balance.' };
        }
      } else {
        out[m] = { status: 'optimal', ratio: 1.0, color: '#5eda9e', recommendation: 'Consistent stimulus applied.' };
      }
    });

    return out;
  });
}
