export interface GymSet {
  setNumber: number;
  reps: number | null;
  weight: number | null; // kg or lbs
  completed: boolean;
}

export interface GymExerciseLog {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: string; // e.g. "6–10"
  muscle?: string;
  setsLog: GymSet[];
  isCustom?: boolean;
  skipped?: boolean;
}

export interface GymCardioLog {
  id: string;
  type: string; // e.g. Treadmill, Stairmaster, Cycling, Elliptical
  durationMinutes: number | null;
  distanceKm: number | null;
  speedKmh: number | null;  // treadmill speed in km/h
  calories: number | null;
  completed: boolean;
  isPermanent?: boolean;     // true for the always-present treadmill entry
}


export interface GymDayLog {
  id?: string;
  userId: string;
  date: string;         // YYYY-MM-DD
  dayPlanIndex: number; // 1–7
  exercises: GymExerciseLog[];
  cardio?: GymCardioLog[];
  notes?: string;
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
  dayIndex: number; // 1–7
  name: string;
  subtitle: string;
  focus: string;
  exercises: GymPlanExercise[];
  isRest?: boolean;
}

export interface GymCustomPlanDay {
  dayIndex: number; // 1-7
  customExercises: GymPlanExercise[];
}
