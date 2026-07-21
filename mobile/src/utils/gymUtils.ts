export const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#FF6B6B', 'Back': '#4DABF7', 'Shoulders': '#9775FA',
  'Side Delts': '#B197FC', 'Rear Delts': '#845EF7', 'Triceps': '#38D9A9',
  'Biceps': '#3BC9DB', 'Brachialis': '#22B8CF', 'Forearms': '#15AABF',
  'Quads': '#FF922B', 'Hamstrings': '#FF7849', 'Glutes/Hams': '#FF8787',
  'Quads/Glutes': '#FFA94D', 'Calves': '#A9E34B', 'Soleus': '#8CE99A',
  'Abs': '#FF8787', 'Core': '#FA5252', 'Obliques': '#E64980',
  'Upper Back / Rear Delts': '#AE3EC9', 'Serratus / Pec Minor': '#F08C00',
};

export const resolveMuscleColor = (m: string | undefined | null) => {
  if (!m) return '#a855f7';
  const found = Object.keys(MUSCLE_COLORS).find(k => k.toLowerCase() === m.toLowerCase());
  return found ? MUSCLE_COLORS[found] : '#a855f7';
};

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
