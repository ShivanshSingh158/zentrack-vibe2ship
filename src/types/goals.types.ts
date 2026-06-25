export interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  history?: { timestamp: number; value: number }[];
  syncType?: 'none' | 'job_applications' | 'interviews' | 'todos_completed' | 'learning_subtasks' | 'gym_days' | 'productive_hours';
  syncQuery?: string;
}

export interface Goal {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  deadline: string; // YYYY-MM-DD
  status: 'active' | 'completed' | 'abandoned';
  keyResults: KeyResult[];
  createdAt: number;
  updatedAt: number;
  /** Link goal to a subject/course */
  subject?: string;
  /** Link to attendance subject for auto-sync */
  linkedAttendanceId?: string;
}
