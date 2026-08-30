import { EXERCISE_DATABASE } from '../data/exerciseDatabase';
import { GymExerciseLog, GymDayLog } from '../types/gym.types';

export const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#FF6B6B', 'Back': '#4DABF7', 'Shoulders': '#9775FA',
  'Side Delts': '#B197FC', 'Rear Delts': '#845EF7', 'Triceps': '#38D9A9',
  'Biceps': '#3BC9DB', 'Brachialis': '#22B8CF', 'Forearms': '#15AABF',
  'Quads': '#FF922B', 'Hamstrings': '#FF7849', 'Glutes/Hams': '#FF8787',
  'Quads/Glutes': '#FFA94D', 'Calves': '#A9E34B', 'Soleus': '#8CE99A',
  'Abs': '#FF8787', 'Core': '#FA5252', 'Obliques': '#E64980',
  'Upper Back / Rear Delts': '#AE3EC9', 'Serratus / Pec Minor': '#F08C00',
  'Upper Chest': '#FF6B6B', 'Mid Chest': '#FF6B6B', 'Lower Chest': '#FF6B6B',
  'Lat Width': '#4DABF7', 'Mid-Back': '#4DABF7',
  'Front Delts': '#9775FA', 'Upper Traps': '#AE3EC9',
  'Long Tricep': '#38D9A9', 'Lat/Med Tricep': '#38D9A9',
  'Short Bicep': '#3BC9DB', 'Long Bicep': '#3BC9DB',
  'Quad Teardrop': '#FF922B', 'Glutes/Abductors': '#FF8787',
  'Gastrocnemius': '#A9E34B',
  'Upper Abs': '#FF8787', 'Lower Abs': '#FF8787', 'Transverse Abs': '#FF8787',
  'Forearm Flexors': '#15AABF', 'Forearm Extensors': '#15AABF', 'Brachioradialis': '#15AABF'
};

export const MUSCLE_CANONICAL: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  'side delts': 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  brachialis: 'Biceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  abs: 'Abs',
  forearms: 'Forearms',
  glutes: 'Glutes',
  'glutes/abductors': 'Glutes/Abductors',
  'glutes/abductors (outer glutes)': 'Glutes/Abductors',
  'gluteus medius': 'Glutes/Abductors',
  abductor: 'Glutes/Abductors',
  'gluteus maximus': 'Glutes',
  'glutes/hams': 'Glutes',
  traps: 'Traps',
  mixed: 'Mixed',
  // Micro-targets
  'upper chest': 'Chest',
  'mid chest': 'Chest',
  'lower chest': 'Chest',
  'lat width': 'Back',
  'mid-back': 'Back',
  'lower back': 'Back',
  'front delts': 'Shoulders',
  'rear delts': 'Shoulders',
  'upper traps': 'Traps',
  'long tricep': 'Triceps',
  'lat/med tricep': 'Triceps',
  'short bicep': 'Biceps',
  'long bicep': 'Biceps',
  'quad teardrop': 'Quads',
  'glutes/quads': 'Quads',
  'gastrocnemius': 'Calves',
  'soleus': 'Calves',
  'upper abs': 'Abs',
  'lower abs': 'Abs',
  'transverse abs': 'Abs',
  'obliques': 'Abs',
  'forearm flexors': 'Forearms',
  'forearm extensors': 'Forearms',
  'forearm extensors (outside)': 'Forearms',
  'forearm flexors (inside)': 'Forearms',
  'brachioradialis': 'Forearms',
  'grip': 'Forearms',
  'wrist': 'Forearms',
};

export function canonicalizeMuscle(muscle?: string): string {
  if (!muscle) return 'Mixed';
  const clean = muscle.trim().toLowerCase();
  
  // 1. Direct dictionary match
  if (MUSCLE_CANONICAL[clean]) {
    return MUSCLE_CANONICAL[clean];
  }

  // 2. Pattern-based grouping
  if (clean.includes('forearm') || clean.includes('wrist') || clean.includes('brachio') || clean.includes('grip')) {
    return 'Forearms';
  }
  if (clean.includes('glute') || clean.includes('hamstring') || clean.includes('hams') || clean.includes('abductor')) {
    return 'Hamstrings';
  }
  if (clean.includes('chest') || clean.includes('pec')) {
    return 'Chest';
  }
  if (clean.includes('lat') || clean.includes('back') || clean.includes('erector')) {
    return 'Back';
  }
  if (clean.includes('delt') || clean.includes('shoulder')) {
    return 'Shoulders';
  }
  if (clean.includes('tricep')) {
    return 'Triceps';
  }
  if (clean.includes('bicep')) {
    return 'Biceps';
  }
  if (clean.includes('quad')) {
    return 'Quads';
  }
  if (clean.includes('calv') || clean.includes('soleus') || clean.includes('gastro')) {
    return 'Calves';
  }
  if (clean.includes('ab') || clean.includes('core') || clean.includes('oblique')) {
    return 'Abs';
  }
  if (clean.includes('trap')) {
    return 'Traps';
  }

  // Capitalize first letter as fallback
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export const resolveMuscleColor = (m: string | undefined | null) => {
  if (!m) return '#a855f7';
  const found = Object.keys(MUSCLE_COLORS).find(k => k.toLowerCase() === m.toLowerCase());
  return found ? MUSCLE_COLORS[found] : '#a855f7';
};

/**
 * Formats date into Indian Standard Date format: 'DD/MM/YYYY'
 * Example: '2026-07-22' -> '22/07/2026'
 */
export function formatIndianDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  const dateObj = new Date(dateInput);
  if (isNaN(dateObj.getTime())) return String(dateInput);
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Formats date into Pretty Indian Date format: '22 Jul 2026'
 */
export function formatIndianDatePretty(dateInput?: string | number | Date | null, fullMonth: boolean = false): string {
  if (!dateInput) return '';
  let y: number, m: number, d: number;
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
    const parts = dateInput.split('-').map(Number);
    if (parts.length === 3 && parts[0] > 1000) {
      [y, m, d] = parts;
    } else {
      const dateObj = new Date(dateInput);
      if (isNaN(dateObj.getTime())) return String(dateInput);
      y = dateObj.getFullYear(); m = dateObj.getMonth() + 1; d = dateObj.getDate();
    }
  } else {
    const dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) return String(dateInput);
    y = dateObj.getFullYear(); m = dateObj.getMonth() + 1; d = dateObj.getDate();
  }

  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = fullMonth ? monthsFull[m - 1] : monthsShort[m - 1];
  return `${d} ${monthName} ${y}`;
}

export const hexToRgba = (hex: string, alpha: number = 1): string => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex[1] + hex[2], 16);
    g = parseInt(hex[3] + hex[4], 16);
    b = parseInt(hex[5] + hex[6], 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Qualifies a gym log as a legitimate workout session:
 * Requires logging at least 3 completed exercises from the routine (or a completed cardio session >= 15m),
 * preventing accidental timer openings or single-exercise touches from falsely incrementing sessions.
 */
export function isValidWorkoutSession(log: any): boolean {
  if (!log) return false;
  const completedExercises = (log.exercises ?? []).filter(
    (e: any) => !e.skipped && (e.setsLog ?? []).some((s: any) => s.completed),
  ).length;

  const hasCompletedCardio = (log.cardio ?? []).some(
    (c: any) => c.completed && (Number(c.durationMinutes) || 0) >= 15,
  );

  return completedExercises >= 3 || hasCompletedCardio;
}

import { WEEKDAY_TO_PLAN, GYM_PLAN, EXERCISE_ALTERNATIVES } from '../data/gymPlan';

export const calculateGymStreak = (logs: any[] | null | undefined, userGymPlan?: any | null): number => {
  if (!logs || logs.length === 0) return 0;
  
  const loggedDates = new Set(
    logs.filter(isValidWorkoutSession).map(l => l.date)
  );

  let streak = 0;
  let d = new Date();
  
  const toDateStr = (date: Date) => {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  };

  const isRestDayForDate = (date: Date): boolean => {
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
    const planIdx = WEEKDAY_TO_PLAN[dayOfWeek] ?? 7;
    const plan = userGymPlan?.customDays?.[planIdx] || GYM_PLAN.find(p => p.dayIndex === planIdx);
    return plan?.isRest === true;
  };

  const todayStr = toDateStr(d);
  if (loggedDates.has(todayStr)) {
    streak++;
  }

  d.setDate(d.getDate() - 1);
  while (true) {
    const dStr = toDateStr(d);
    if (loggedDates.has(dStr)) {
      streak++;
    } else if (!isRestDayForDate(d)) { // If it's a workout day and not logged, streak breaks
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  
  return streak;
};

export const calculateExerciseMaxWeight = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const validSets = exercise.setsLog.filter(s => {
    const w = s?.weight !== undefined && s?.weight !== null ? s.weight : (s as any)?.weightKg;
    return (s.completed || (w && s.reps)) && w && Number(w) > 0;
  });
  if (validSets.length === 0) return 0;
  return Math.max(...validSets.map(s => {
    const w = s?.weight !== undefined && s?.weight !== null ? s.weight : (s as any)?.weightKg;
    return Number(w);
  }));
};

export const calculateEstimated1RM = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const validSets = exercise.setsLog.filter(s => {
    const w = s?.weight !== undefined && s?.weight !== null ? s.weight : (s as any)?.weightKg;
    return (s.completed || (w && s.reps)) && w && Number(w) > 0 && s.reps && Number(s.reps) > 0;
  });
  if (validSets.length === 0) return 0;
  
  // Epley Formula: 1RM = Weight * (1 + (Reps / 30))
  const oneRepMaxes = validSets.map(s => {
    const w = Number(s?.weight !== undefined && s?.weight !== null ? s.weight : (s as any)?.weightKg);
    const r = Number(s.reps);
    return w * (1 + (r / 30));
  });
  
  return Math.round(Math.max(...oneRepMaxes));
};

export const calculateHistorical1RM = (gymLogs: any[], exerciseIdOrName: string): number => {
  if (!gymLogs || gymLogs.length === 0 || !exerciseIdOrName) return 0;
  const targetKey = normalizeExerciseKey(exerciseIdOrName);
  let max1RM = 0;
  
  gymLogs.forEach(log => {
    const ex = log.exercises?.find((e: any) => e?.name && normalizeExerciseKey(e.name) === targetKey);
    if (ex) {
      const ex1RM = calculateEstimated1RM(ex);
      if (ex1RM > max1RM) max1RM = ex1RM;
    }
  });
  
  return max1RM;
};

export const calculateExerciseAvgReps = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const validSets = exercise.setsLog.filter(s => (s.completed || (s.weight && s.reps)) && s.reps && Number(s.reps) > 0);
  if (validSets.length === 0) return 0;
  const totalReps = validSets.reduce((sum, s) => sum + Number(s.reps), 0);
  return Math.round(totalReps / validSets.length);
};

export const calculateWorkoutMaxWeight = (log: GymDayLog | undefined | null): number => {
  if (!log || !log.exercises || log.exercises.length === 0) return 0;
  let maxW = 0;
  for (const ex of log.exercises) {
    if (ex.skipped) continue;
    const exMax = calculateExerciseMaxWeight(ex);
    if (exMax > maxW) maxW = exMax;
  }
  return maxW;
};

export interface PreviousExerciseSession {
  sets: { setNumber: number; weight: number | null; reps: number | null; completed: boolean }[];
  lastWeight: number | null;
  avgReps: number | null;
  maxWeight: number | null;
  sessionDate: string;
}

/**
 * Normalizes an exercise name for strict identity matching (e.g. "Incline Dumbbell Press" -> "inclinedumbbellpress").
 * Preserves distinct exercise identities while ignoring casing, spaces, hyphens, and punctuation.
 */
export function normalizeExerciseKey(name?: string | null): string {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Builds an ultra-fast O(1) in-memory history index from past gym logs.
 * Performs a single O(N) pass over chronologically sorted logs (newest first).
 * Ensures that each exercise key maps strictly to its TRUE most recent completed session.
 */
export function buildExerciseHistoryIndex(
  gymLogs: any[] | null | undefined,
  beforeDate?: string
): Map<string, PreviousExerciseSession> {
  const index = new Map<string, PreviousExerciseSession>();
  if (!gymLogs || gymLogs.length === 0) return index;

  const sorted = gymLogs
    .filter(l => (!beforeDate || l.date < beforeDate) && Array.isArray(l.exercises) && l.exercises.length > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const log of sorted) {
    for (const ex of log.exercises) {
      if (!ex || !ex.name) continue;
      const key = normalizeExerciseKey(ex.name);
      if (!key || index.has(key)) continue; // Already mapped the latest session for this exercise

      if (Array.isArray(ex.setsLog) && ex.setsLog.length > 0) {
        const completedSets = ex.setsLog.filter((s: any) => {
          const w = s?.weight !== undefined && s?.weight !== null ? Number(s.weight) : (s?.weightKg !== undefined ? Number(s.weightKg) : null);
          const r = s?.reps !== undefined && s?.reps !== null ? Number(s.reps) : null;
          const hasValidNum = (w !== null && !isNaN(w) && w > 0) || (r !== null && !isNaN(r) && r > 0);
          return s.completed === true && hasValidNum;
        });

        if (completedSets.length > 0) {
          const mappedSets = completedSets.map((s: any, idx: number) => {
            const w = s?.weight !== undefined && s?.weight !== null ? Number(s.weight) : (s?.weightKg !== undefined ? Number(s.weightKg) : null);
            const r = s?.reps !== undefined && s?.reps !== null ? Number(s.reps) : null;
            return {
              setNumber: idx + 1,
              weight: w !== null && !isNaN(w) && w > 0 ? w : null,
              reps: r !== null && !isNaN(r) && r > 0 ? r : null,
              completed: true,
            };
          });

          const weights = mappedSets.map((s: { weight: number | null }) => s.weight).filter((w: number | null): w is number => w !== null && w > 0);
          const reps = mappedSets.map((s: { reps: number | null }) => s.reps).filter((r: number | null): r is number => r !== null && r > 0);

          const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;
          const maxWeight = weights.length > 0 ? Math.max(...weights) : null;
          const avgReps = reps.length > 0 ? Math.round(reps.reduce((a: number, b: number) => a + b, 0) / reps.length) : null;

          index.set(key, {
            sets: mappedSets,
            lastWeight,
            avgReps,
            maxWeight,
            sessionDate: log.date,
          });
        }
      }
    }
  }

  return index;
}

/**
 * Finds the most recent legitimately completed workout session for a given exercise.
 * Guarantees:
 * 1. STRICT name-only matching: an exercise will NEVER load data from a different exercise.
 * 2. Only considers sets that were ACTUALLY completed (s.completed === true).
 * 3. Returns null (blank) if the user has never done this specific exercise before.
 */
export function getPreviousExerciseSession(
  exerciseName: string,
  gymLogs: any[] | null | undefined,
  beforeDate?: string
): PreviousExerciseSession | null {
  if (!exerciseName || !gymLogs || gymLogs.length === 0) return null;
  const key = normalizeExerciseKey(exerciseName);
  if (!key) return null;

  const sorted = gymLogs
    .filter(l => (!beforeDate || l.date < beforeDate) && Array.isArray(l.exercises) && l.exercises.length > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const log of sorted) {
    const match = log.exercises.find((e: any) => e?.name && normalizeExerciseKey(e.name) === key);

    if (match && Array.isArray(match.setsLog) && match.setsLog.length > 0) {
      const completedSets = match.setsLog.filter((s: any) => {
        const w = s?.weight !== undefined && s?.weight !== null ? Number(s.weight) : (s?.weightKg !== undefined ? Number(s.weightKg) : null);
        const r = s?.reps !== undefined && s?.reps !== null ? Number(s.reps) : null;
        const hasValidNum = (w !== null && !isNaN(w) && w > 0) || (r !== null && !isNaN(r) && r > 0);
        return s.completed === true && hasValidNum;
      });

      if (completedSets.length > 0) {
        const mappedSets = completedSets.map((s: any, idx: number) => {
          const w = s?.weight !== undefined && s?.weight !== null ? Number(s.weight) : (s?.weightKg !== undefined ? Number(s.weightKg) : null);
          const r = s?.reps !== undefined && s?.reps !== null ? Number(s.reps) : null;
          return {
            setNumber: idx + 1,
            weight: w !== null && !isNaN(w) && w > 0 ? w : null,
            reps: r !== null && !isNaN(r) && r > 0 ? r : null,
            completed: true,
          };
        });

        const weights = mappedSets.map((s: { weight: number | null }) => s.weight).filter((w: number | null): w is number => w !== null && w > 0);
        const reps = mappedSets.map((s: { reps: number | null }) => s.reps).filter((r: number | null): r is number => r !== null && r > 0);

        const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        const maxWeight = weights.length > 0 ? Math.max(...weights) : null;
        const avgReps = reps.length > 0 ? Math.round(reps.reduce((a: number, b: number) => a + b, 0) / reps.length) : null;

        return {
          sets: mappedSets,
          lastWeight,
          avgReps,
          maxWeight,
          sessionDate: log.date,
        };
      }
    }
  }

  return null;
}

export interface MuscleTargetResolution {
  targetMuscle: string;      // e.g. "Upper Chest", "Long Head Triceps", "Lats", "Side Delts", "Quads"
  canonicalGroup: string;    // e.g. "Chest", "Triceps", "Back", "Shoulders", "Quads"
}

/**
 * Accurately determines the true biomechanical target muscle and parent group for any exercise.
 * 1. Checks EXERCISE_DATABASE for exact metadata.
 * 2. Uses explicitMuscle if provided.
 * 3. Falls back to precise biomechanical keyword analysis (never blind 'Chest' fallbacks).
 */
export function resolveExerciseTargetMuscle(
  exerciseName: string,
  explicitMuscle?: string | null
): MuscleTargetResolution {
  // 1. Try to find the exercise in EXERCISE_DATABASE
  if (exerciseName) {
    const key = normalizeExerciseKey(exerciseName);
    const dbMatch = EXERCISE_DATABASE.find(e => normalizeExerciseKey(e.name) === key);
    if (dbMatch && dbMatch.muscle && dbMatch.muscle !== 'None') {
      return {
        targetMuscle: dbMatch.muscle,
        canonicalGroup: canonicalizeMuscle(dbMatch.muscle),
      };
    }
  }

  // 2. Try explicitMuscle if valid and not generic
  if (explicitMuscle && explicitMuscle !== 'None' && explicitMuscle.trim().length > 0) {
    return {
      targetMuscle: explicitMuscle.trim(),
      canonicalGroup: canonicalizeMuscle(explicitMuscle),
    };
  }

  // 3. Keyword Biomechanical Classifier
  const lower = (exerciseName || '').toLowerCase();

  // Upper Chest
  if (
    lower.includes('incline') ||
    lower.includes('low-to-high') ||
    lower.includes('low to high') ||
    lower.includes('clavicular') ||
    lower.includes('reverse grip bench')
  ) {
    return { targetMuscle: 'Upper Chest', canonicalGroup: 'Chest' };
  }

  // Lower / Mid Chest
  if (
    lower.includes('high-to-low') ||
    lower.includes('high to low') ||
    lower.includes('decline') ||
    lower.includes('pec deck') ||
    lower.includes('chest fly') ||
    lower.includes('bench press') ||
    lower.includes('chest press') ||
    lower.includes('cable crossover') ||
    lower.includes('dips') ||
    lower.includes('pushup') ||
    lower.includes('push-up')
  ) {
    return { targetMuscle: 'Chest', canonicalGroup: 'Chest' };
  }

  // Biceps
  if (
    lower.includes('bicep') ||
    lower.includes('curl') ||
    lower.includes('preacher') ||
    lower.includes('hammer') ||
    lower.includes('spider') ||
    lower.includes('chin-up') ||
    lower.includes('chin up')
  ) {
    return { targetMuscle: 'Biceps', canonicalGroup: 'Biceps' };
  }

  // Triceps
  if (
    lower.includes('tricep') ||
    lower.includes('pushdown') ||
    lower.includes('skull crusher') ||
    lower.includes('skullcrusher') ||
    lower.includes('overhead extension') ||
    lower.includes('french press') ||
    lower.includes('kickback') ||
    lower.includes('close-grip bench') ||
    lower.includes('close grip bench') ||
    lower.includes('jm press')
  ) {
    return { targetMuscle: 'Triceps', canonicalGroup: 'Triceps' };
  }

  // Side Delts
  if (
    lower.includes('lateral raise') ||
    lower.includes('side raise') ||
    lower.includes('side delt') ||
    lower.includes('upright row') ||
    lower.includes('egyptian')
  ) {
    return { targetMuscle: 'Side Delts', canonicalGroup: 'Shoulders' };
  }

  // Rear Delts
  if (
    lower.includes('rear delt') ||
    lower.includes('reverse fly') ||
    lower.includes('reverse pec') ||
    lower.includes('face pull')
  ) {
    return { targetMuscle: 'Rear Delts', canonicalGroup: 'Shoulders' };
  }

  // Front Delts / Shoulders
  if (
    lower.includes('shoulder') ||
    lower.includes('military') ||
    lower.includes('overhead press') ||
    lower.includes('front raise') ||
    lower.includes('arnold press') ||
    lower.includes('delt')
  ) {
    return { targetMuscle: 'Shoulders', canonicalGroup: 'Shoulders' };
  }

  // Lats / Back
  if (
    lower.includes('lat pulldown') ||
    lower.includes('pull down') ||
    lower.includes('pulldown') ||
    lower.includes('pullup') ||
    lower.includes('pull up') ||
    lower.includes('straight arm')
  ) {
    return { targetMuscle: 'Lats', canonicalGroup: 'Back' };
  }

  // Mid-Back / Rows
  if (
    lower.includes('row') ||
    lower.includes('t-bar') ||
    lower.includes('shrug') ||
    lower.includes('trap') ||
    lower.includes('deadlift') ||
    lower.includes('back')
  ) {
    return { targetMuscle: 'Back', canonicalGroup: 'Back' };
  }

  // Quads
  if (
    lower.includes('squat') ||
    lower.includes('leg press') ||
    lower.includes('leg extension') ||
    lower.includes('hack') ||
    lower.includes('lunge') ||
    lower.includes('split squat') ||
    lower.includes('sissy') ||
    lower.includes('quad')
  ) {
    return { targetMuscle: 'Quads', canonicalGroup: 'Quads' };
  }

  // Hamstrings
  if (
    lower.includes('leg curl') ||
    lower.includes('hamstring') ||
    lower.includes('romanian') ||
    lower.includes('rdl') ||
    lower.includes('stiff leg') ||
    lower.includes('good morning')
  ) {
    return { targetMuscle: 'Hamstrings', canonicalGroup: 'Hamstrings' };
  }

  // Calves
  if (lower.includes('calf') || lower.includes('calves') || lower.includes('soleus') || lower.includes('tibialis')) {
    return { targetMuscle: 'Calves', canonicalGroup: 'Calves' };
  }

  // Abs
  if (
    lower.includes('ab') ||
    lower.includes('crunch') ||
    lower.includes('plank') ||
    lower.includes('leg raise') ||
    lower.includes('knee raise') ||
    lower.includes('rollout') ||
    lower.includes('woodchopper')
  ) {
    return { targetMuscle: 'Abs', canonicalGroup: 'Abs' };
  }

  // Glute Abductors (Outer glutes / Hip Abduction)
  if (
    lower.includes('abduct') ||
    lower.includes('outer glute') ||
    lower.includes('clamshell') ||
    lower.includes('fire hydrant') ||
    lower.includes('curtsy') ||
    lower.includes('lateral band walk')
  ) {
    return { targetMuscle: 'Glutes/Abductors', canonicalGroup: 'Glutes/Abductors' };
  }

  // Glutes (Maximus / Hip Extension)
  if (
    lower.includes('hip thrust') ||
    lower.includes('glute bridge') ||
    lower.includes('kas bridge') ||
    lower.includes('glute kickback') ||
    (lower.includes('glute') && !lower.includes('ham') && !lower.includes('ghr'))
  ) {
    return { targetMuscle: 'Glutes', canonicalGroup: 'Glutes' };
  }

  // Hamstrings (Knee Flexion & Hip Hinges)
  if (
    lower.includes('leg curl') ||
    lower.includes('rdl') ||
    lower.includes('romanian') ||
    lower.includes('good morning') ||
    lower.includes('stiff leg') ||
    lower.includes('stiff-leg') ||
    lower.includes('hamstring') ||
    lower.includes('glute ham') ||
    lower.includes('ghr')
  ) {
    return { targetMuscle: 'Hamstrings', canonicalGroup: 'Hamstrings' };
  }

  // Forearms
  if (lower.includes('wrist') || lower.includes('forearm') || lower.includes('farmers')) {
    return { targetMuscle: 'Forearms', canonicalGroup: 'Forearms' };
  }

  return { targetMuscle: explicitMuscle || 'Full Body', canonicalGroup: explicitMuscle ? canonicalizeMuscle(explicitMuscle) : 'Mixed' };
}

/**
 * Intelligent Biomechanical Prescription Generator.
 * Calibrates sets, rep targets, and rest periods according to movement pattern,
 * CNS/axial demands, and muscle fiber recruitment characteristics.
 */
export function getBiomechanicalPrescription(
  exerciseName: string,
  muscle?: string
): { targetSets: number; targetReps: string; restTimeSecs: number } {
  const n = (exerciseName || '').toLowerCase().trim();

  // 1. Calves, Abs, Forearms & High-Rep Burnout (12–15 / 15–20 reps, 45–60s rest)
  if (
    n.includes('calf') ||
    n.includes('soleus') ||
    n.includes('wrist curl') ||
    n.includes('ab crunch') ||
    n.includes('cable crunch') ||
    n.includes('knee raise') ||
    n.includes('leg raise') ||
    n.includes('woodchopper') ||
    n.includes('pallof') ||
    n.includes('clamshell') ||
    n.includes('band walk') ||
    n.includes('fire hydrant')
  ) {
    if (n.includes('clamshell') || n.includes('band walk') || n.includes('fire hydrant')) {
      return { targetSets: 3, targetReps: '15–20', restTimeSecs: 45 };
    }
    return { targetSets: 3, targetReps: '12–15', restTimeSecs: 60 };
  }

  // 2. Heavy Primary Free-Weight Compounds (4 sets, 6–8 reps, 150–180s rest)
  if (
    n === 'barbell back squat' ||
    n === 'barbell squat' ||
    n === 'barbell back squats' ||
    n === 'barbell bench press' ||
    n === 'flat barbell bench press' ||
    n.includes('barbell deadlift') ||
    n === 'deadlift' ||
    n.includes('barbell bent-over row') ||
    n.includes('standing barbell military') ||
    n.includes('barbell military press') ||
    n.includes('romanian deadlifts (rdl - barbell)') ||
    n.includes('romanian deadlift (rdl')
  ) {
    return { targetSets: 4, targetReps: '6–8', restTimeSecs: 150 };
  }

  // 3. Heavy Machine Compounds & Dumbbell Power Presses (8–10 reps, 120s rest)
  if (
    n.includes('hack squat') ||
    n.includes('leg press') ||
    n.includes('incline dumbbell press') ||
    n.includes('converging incline') ||
    n.includes('hammer strength incline') ||
    n.includes('incline barbell') ||
    n.includes('chest-supported t-bar') ||
    n.includes('weighted pull') ||
    n.includes('weighted chin') ||
    n.includes('weighted dip') ||
    n.includes('barbell hip thrust') ||
    n.includes('seated dumbbell shoulder press') ||
    n.includes('machine overhead press') ||
    n.includes('close-grip barbell bench')
  ) {
    return { targetSets: 3, targetReps: '8–10', restTimeSecs: 120 };
  }

  // 4. Pure Isolations, Stretch Loading & Arm Work (10–12 reps, 75s rest)
  if (
    n.includes('lateral raise') ||
    n.includes('reverse pec deck') ||
    n.includes('face pull') ||
    n.includes('pec deck') ||
    n.includes('cable crossover') ||
    n.includes('cable fly') ||
    n.includes('dumbbell fly') ||
    n.includes('skullcrusher') ||
    n.includes('skull crusher') ||
    n.includes('katana') ||
    n.includes('overhead cable tricep') ||
    n.includes('tricep pushdown') ||
    n.includes('curl') ||
    n.includes('seated leg curl') ||
    n.includes('lying leg curl') ||
    n.includes('leg extension') ||
    n.includes('hip abduction') ||
    n.includes('glute kickback') ||
    n.includes('shrug')
  ) {
    return { targetSets: 3, targetReps: '10–12', restTimeSecs: 75 };
  }

  // 5. Default Secondary Compound (8–12 reps, 90s rest)
  return { targetSets: 3, targetReps: '8–12', restTimeSecs: 90 };
}

export interface ExerciseSwapOption {
  id: string;
  name: string;
  muscle: string;
  canonicalGroup: string;
  targetSets: number;
  targetReps: string;
  restTimeSecs: number;
  videoId?: string;
  reason?: string;
  tier?: 'S Tier' | 'A+ Tier' | 'A Tier' | 'B Tier';
  isFromTemplate?: boolean;
  dayName?: string;
}

/**
 * Returns clean, strictly relevant swap alternatives for the exercise's target muscle.
 * Prioritizes top-8 high-yield biomechanical movements ranked S Tier -> A+ Tier -> A Tier -> B Tier.
 * Strictly excludes the current exercise being swapped.
 */
export function getExerciseSwapAlternatives(
  currentExerciseName: string,
  explicitMuscle?: string | null,
  activePlanDays?: any[] | null
): ExerciseSwapOption[] {
  const { targetMuscle, canonicalGroup } = resolveExerciseTargetMuscle(currentExerciseName, explicitMuscle);
  const currentKey = normalizeExerciseKey(currentExerciseName);
  const seenKeys = new Set<string>();
  seenKeys.add(currentKey);

  const results: ExerciseSwapOption[] = [];

  // 1. Primary Source: High-Yield Biomechanical Curated Alternatives (S Tier -> A+ Tier -> A Tier -> B Tier)
  const curatedList = EXERCISE_ALTERNATIVES[targetMuscle] || EXERCISE_ALTERNATIVES[canonicalGroup] || [];
  for (const alt of curatedList) {
    if (!alt?.name) continue;
    const key = normalizeExerciseKey(alt.name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const rx = getBiomechanicalPrescription(alt.name, targetMuscle);

    results.push({
      id: `curated_swap_${results.length}`,
      name: alt.name,
      muscle: targetMuscle,
      canonicalGroup,
      targetSets: alt.targetSets || rx.targetSets,
      targetReps: alt.targetReps || rx.targetReps,
      restTimeSecs: alt.restTimeSecs || rx.restTimeSecs,
      videoId: alt.videoId,
      tier: alt.tier,
      reason: alt.reason || `Direct alternative for ${targetMuscle}`,
      isFromTemplate: false,
    });
    if (results.length >= 8) break;
  }

  // 2. Secondary: If user has other workout days in active plan, surface relevant exercises from their routine
  if (Array.isArray(activePlanDays) && activePlanDays.length > 0 && results.length < 8) {
    for (const day of activePlanDays) {
      if (!Array.isArray(day?.exercises)) continue;
      for (const ex of day.exercises) {
        if (!ex?.name) continue;
        const key = normalizeExerciseKey(ex.name);
        if (seenKeys.has(key)) continue;

        const exTarget = resolveExerciseTargetMuscle(ex.name, ex.muscle);
        if (exTarget.targetMuscle === targetMuscle || exTarget.canonicalGroup === canonicalGroup) {
          seenKeys.add(key);
          results.push({
            id: ex.id || `template_swap_${results.length}`,
            name: ex.name,
            muscle: ex.muscle || targetMuscle,
            canonicalGroup,
            targetSets: Number(ex.targetSets) || 3,
            targetReps: ex.targetReps || '8–12',
            restTimeSecs: Number(ex.restTimeSecs) || 90,
            videoId: ex.videoId,
            reason: `From your ${day.name || 'Routine'}`,
            isFromTemplate: true,
            dayName: day.name,
          });
          if (results.length >= 8) break;
        }
      }
    }
  }

  // 3. Fallback: Broad database only if still fewer than 6
  if (results.length < 6) {
    const dbMatches = EXERCISE_DATABASE.filter(db => {
      if (!db.name || seenKeys.has(normalizeExerciseKey(db.name))) return false;
      const dbMuscleLower = (db.muscle || '').toLowerCase();
      const targetLower = targetMuscle.toLowerCase();
      return dbMuscleLower === targetLower || dbMuscleLower.includes(targetLower) || targetLower.includes(dbMuscleLower);
    });

    for (const db of dbMatches) {
      if (results.length >= 8) break;
      const key = normalizeExerciseKey(db.name);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const rx = getBiomechanicalPrescription(db.name, targetMuscle);

      results.push({
        id: db.id || `swap_db_${results.length}`,
        name: db.name,
        muscle: db.muscle || targetMuscle,
        canonicalGroup,
        targetSets: rx.targetSets,
        targetReps: rx.targetReps,
        restTimeSecs: rx.restTimeSecs,
        isFromTemplate: false,
        reason: `Alternative for ${targetMuscle}`,
      });
    }
  }

  return results;
}

