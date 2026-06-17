export interface GymSet {
  setNumber: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

export interface GymExerciseLog {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string;   // e.g. "6–10"
  muscle?: string;
  setsLog: GymSet[];
  isCustom?: boolean;
  skipped?: boolean;
  supersetGroup?: string; // e.g. 'A', 'B' — exercises with same letter are supersets
}

export interface GymCardioLog {
  id: string;
  type: string;         // e.g. Treadmill, Stairmaster, Cycling
  durationMinutes: number | null;
  distanceKm: number | null;
  speedKmh: number | null;
  calories: number | null;
  completed: boolean;
  isPermanent?: boolean; // true for the always-present treadmill entry
}

export interface GymDayLog {
  id?: string;
  userId: string;
  date: string;           // YYYY-MM-DD
  dayPlanIndex: number;   // 1–7
  exercises: GymExerciseLog[];
  cardio?: GymCardioLog[];
  notes?: string;
  workoutStartTime?: number;
  workoutDurationMinutes?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GymPlanExercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: string;
  muscle?: string;
}

export interface GymPlanDay {
  dayIndex: number;   // 1–7
  name: string;
  subtitle: string;
  focus: string;
  exercises: GymPlanExercise[];
  isRest?: boolean;
}

export interface GymCustomPlanDay {
  dayIndex: number;   // 1–7
  customExercises: GymPlanExercise[];
}

// ── New Types ────────────────────────────────────────────────────────────────

export type GymGoal = 'strength' | 'hypertrophy' | 'weightLoss' | 'recomp' | 'maintenance';

export interface GymProfile {
  userId: string;
  bodyweightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  trainingExperienceMonths: number | null;  // e.g. 6, 12, 24
  primaryGoal: GymGoal;
  updatedAt: number;
}

/** One entry per exercise in the gymPRs/{userId} document */
export interface GymPersonalRecord {
  exerciseName: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  date: string;           // YYYY-MM-DD
  achievedAt: number;     // timestamp
}

/** Map returned by usePreviousSession — keyed by exerciseId */
export interface PreviousSessionExercise {
  date: string;
  sets: GymSet[];
  maxWeight: number;          // highest weight in completed sets
  allRepsCompleted: boolean;  // all target sets fully completed
  totalReps: number;
}

export type PreviousSessionData = Record<string, PreviousSessionExercise>;

/** One row in the ExerciseHistoryDrawer timeline */
export interface ExerciseHistoryEntry {
  date: string;
  maxWeightKg: number;
  totalReps: number;
  completedSets: number;
  totalSets: number;
  setsLog: GymSet[];
}

/** Per-exercise predictive recommendation */
export interface WeightTarget {
  exerciseName: string;
  exerciseId: string;
  muscle?: string;
  lastDate: string | null;
  lastMaxWeight: number | null;
  lastReps: number | null;
  recommendedWeight: number | null;
  trend: 'up' | 'maintain' | 'down' | 'new'; // ↑ → ↓ ?
  confidence: 'high' | 'medium' | 'low';
}
