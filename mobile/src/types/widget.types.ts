/**
 * widget.types.ts — ZenTrack Android Home Screen Widget Types
 */

export interface WidgetAgendaClass {
  id: string;
  subjectId: string;
  subjectName: string;
  time: string;
  room?: string;
  type: 'class' | 'lab';
  status: 'attended' | 'missed' | 'cancelled' | 'pending';
  idx: number;
}

export interface WidgetAgendaTask {
  id: string;
  title: string;
  timeSlot?: string;
  status: 'pending' | 'completed';
  priority?: 'urgent' | 'high' | 'medium' | 'low';
}

export interface WidgetAgendaItem {
  id: string;
  type: 'class' | 'lab' | 'task' | 'gym';
  title: string;
  subtitle?: string;
  timeStr: string;
  timeMins: number;
  status: 'attended' | 'missed' | 'cancelled' | 'completed' | 'pending';
  subjectId?: string;
  subjectName?: string;
  sessionIdx?: number;
  taskId?: string;
}

export interface TodayAgendaWidgetData {
  dateStr: string;        // YYYY-MM-DD
  displayDate: string;    // "Wed, Sep 1"
  zenScore: number;       // 0–100
  streak?: number;        // Active consistency day streak (e.g. 7)
  isHoliday?: boolean;
  items: WidgetAgendaItem[];
  classes: WidgetAgendaClass[];
  tasks: WidgetAgendaTask[];
  totalClasses: number;
  attendedClasses: number;
  totalTasks: number;
  doneTasks: number;
  lastUpdated: number;
}

export type WidgetClickActionType =
  | 'mark_task_done'
  | 'mark_task_undone'
  | 'mark_class_present'
  | 'mark_class_absent'
  | 'open_app'
  | 'log_workout_set'
  | 'adjust_workout_weight'
  | 'next_workout_exercise'
  | 'start_workout_session'
  | 'finish_workout_session';

export interface WidgetClickActionPayload {
  action: WidgetClickActionType;
  taskId?: string;
  subjectId?: string;
  subjectName?: string;
  sessionIdx?: number;
  dateStr?: string;
  type?: 'class' | 'lab';
  target?: string;
  // Workout specific
  exerciseId?: string;
  setIndex?: number;
  weightDelta?: number;
  weight?: number;
  reps?: number;
}

// ── Live Workout Widget Types ────────────────────────────────────────────────
export interface WidgetExerciseSet {
  setNumber: number;
  weight: number;
  reps: number;
  completed: boolean;
}

export interface WidgetActiveExercise {
  id: string;
  name: string;
  targetSets: number;
  currentSetIndex: number;
  sets: WidgetExerciseSet[];
  targetReps?: number;
  targetWeight?: number;
  notes?: string;
}

export interface LiveWorkoutWidgetData {
  dateStr?: string;                     // "YYYY-MM-DD"
  dayName?: string;                    // "Monday", "Tuesday", etc.
  displayDate?: string;                // "Mon, Sep 4"
  isActive: boolean;                   // true if session in progress
  isCompleted?: boolean;               // true if workout finished today
  isRestDay?: boolean;                 // true if today is rest day
  splitTitle: string;                  // e.g. "Push Day A", "Rest & Recovery"
  splitSubtitle?: string;              // e.g. "Chest · Shoulders · Triceps"
  workoutDurationMinutes?: number;     // e.g. 45
  currentExerciseIndex: number;
  totalExercises: number;
  currentExercise?: WidgetActiveExercise;
  nextExerciseName?: string;
  restTimerSecondsRemaining?: number;
  completedSetsCount: number;
  totalSetsCount: number;
  plannedExercisesPreview?: string[];  // names of first few exercises
  allExercises?: {
    id: string;
    name: string;
    targetSets: number;
    targetWeight?: number;
    targetReps?: number;
    completed: boolean;
    sets?: WidgetExerciseSet[];
  }[];
  lastUpdated: number;
}

