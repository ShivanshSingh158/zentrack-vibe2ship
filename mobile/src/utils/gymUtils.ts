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
  traps: 'Traps',
  mixed: 'Mixed',
  // Micro-targets
  'upper chest': 'Chest',
  'mid chest': 'Chest',
  'lower chest': 'Chest',
  'lat width': 'Back',
  'mid-back': 'Back',
  'front delts': 'Shoulders',
  'rear delts': 'Shoulders',
  'upper traps': 'Traps',
  'long tricep': 'Triceps',
  'lat/med tricep': 'Triceps',
  'short bicep': 'Biceps',
  'long bicep': 'Biceps',
  'quad teardrop': 'Quads',
  'glutes/quads': 'Quads',
  'glutes/abductors': 'Glutes',
  'gastrocnemius': 'Calves',
  'soleus': 'Calves',
  'upper abs': 'Abs',
  'lower abs': 'Abs',
  'transverse abs': 'Abs',
  'obliques': 'Abs',
  'forearm flexors': 'Forearms',
  'forearm extensors': 'Forearms',
  'brachioradialis': 'Forearms'
};

export function canonicalizeMuscle(muscle?: string): string {
  if (!muscle) return 'Mixed';
  return MUSCLE_CANONICAL[muscle.toLowerCase()] ?? muscle;
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

export const calculateGymStreak = (logs: any[] | null | undefined): number => {
  if (!logs || logs.length === 0) return 0;
  
  const loggedDates = new Set(
    logs.filter(l => (l.exercises && l.exercises.length > 0) || (l.cardio && l.cardio.length > 0) || l.workoutDurationMinutes > 0)
        .map(l => l.date)
  );

  let streak = 0;
  let d = new Date();
  
  const toDateStr = (date: Date) => {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
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
    } else if (d.getDay() !== 0) { // If it's not Sunday and not logged, streak breaks
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  
  return streak;
};

import { GymExerciseLog, GymDayLog } from '../types/gym.types';

export const calculateExerciseMaxWeight = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const completedSets = exercise.setsLog.filter(s => s.completed && s.weight && s.weight > 0);
  if (completedSets.length === 0) return 0;
  return Math.max(...completedSets.map(s => s.weight as number));
};

export const calculateEstimated1RM = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const completedSets = exercise.setsLog.filter(s => s.completed && s.weight && s.weight > 0 && s.reps && s.reps > 0);
  if (completedSets.length === 0) return 0;
  
  // Epley Formula: 1RM = Weight * (1 + (Reps / 30))
  const oneRepMaxes = completedSets.map(s => {
    const w = s.weight as number;
    const r = s.reps as number;
    return w * (1 + (r / 30));
  });
  
  return Math.round(Math.max(...oneRepMaxes));
};

export const calculateHistorical1RM = (gymLogs: any[], exerciseId: string): number => {
  if (!gymLogs || gymLogs.length === 0) return 0;
  let max1RM = 0;
  
  gymLogs.forEach(log => {
    const ex = log.exercises?.find((e: any) => e.exerciseId === exerciseId);
    if (ex) {
      const ex1RM = calculateEstimated1RM(ex);
      if (ex1RM > max1RM) max1RM = ex1RM;
    }
  });
  
  return max1RM;
};

export const calculateExerciseAvgReps = (exercise: GymExerciseLog | undefined | null): number => {
  if (!exercise || !exercise.setsLog || exercise.setsLog.length === 0) return 0;
  const completedSets = exercise.setsLog.filter(s => s.completed && s.reps && s.reps > 0);
  if (completedSets.length === 0) return 0;
  const totalReps = completedSets.reduce((sum, s) => sum + (s.reps as number), 0);
  return Math.round(totalReps / completedSets.length);
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
