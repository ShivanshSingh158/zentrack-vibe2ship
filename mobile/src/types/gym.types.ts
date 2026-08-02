export interface GymSet {
  setNumber: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

export interface GymExerciseLog {
  id?: string;
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string;   // e.g. "6–10"
  muscle?: string;
  videoId?: string;
  setsLog: GymSet[];
  isCustom?: boolean;
  skipped?: boolean;
  supersetGroup?: string; // e.g. 'A', 'B' — exercises with same letter are supersets
  restTimeSecs?: number;
  isCompound?: boolean;
  lastSessionSets?: any[];
  _idx?: number;
}

export interface GymCardioLog {
  id: string;
  type: string;             // e.g. Treadmill, Stairmaster, Cycling
  durationMinutes: number | null;
  distanceKm: number | null;
  speedKmh: number | null;
  incline: number | null;   // Treadmill incline %
  calories: number | null;
  completed: boolean;
  isPermanent?: boolean;
  // ── Type-specific metrics ────────────────
  floors?: number | null;    // Stairmaster — floors climbed
  level?: number | null;     // Stairmaster / Elliptical — machine resistance level
  laps?: number | null;      // Swimming — pool laps
  rounds?: number | null;    // Jump Rope — rounds / sets
  spm?: number | null;       // Rowing — strokes per minute
  pace?: number | null;      // Outdoor Run — pace in min/km
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
  startTime?: string;
  endTime?: string;
  restTimerStartTime?: number;
  restTimerDurationSecs?: number;
  restTimerExerciseName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GymPlanExercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: string;
  muscle?: string;
  videoId?: string;
  restTimeSecs?: number;
  isCompound?: boolean;
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

export interface UserGymPlanDoc {
  userId: string;
  customDays: Record<number, GymPlanDay>;
  updatedAt: number;
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
  targetBodyweightKg?: number | null;
  targetTimelineWeeks?: number | null;
  currentMesocycleWeek?: number | null;
  totalMesocycleWeeks?: number | null;
  bodyType?: string | null;
  dietaryPreference?: string | null;
  foodAllergies?: string | null;
  activityLevel?: string | null;
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

/** One entry for bodyweight tracking */
export interface BodyweightLog {
  userId: string;
  date: string;       // YYYY-MM-DD
  weightKg: number;
  loggedAt: number;   // timestamp
}

export type GymNavigationParamList = {
  GymHome: undefined;
  ActiveLogging: { date: string; initialIndex?: number };
  WorkoutSummary: { date?: string; readOnly?: boolean } | undefined;
  GymProgress: { date?: string } | undefined;
  ExerciseDetail: { exerciseId: string; date?: string };
  ExerciseSwap: { exerciseIndex: number; date: string; currentName: string; originalExerciseId?: string };
  GymHistory: undefined;
  CardioLog: { date: string; cardioId?: string };
};
