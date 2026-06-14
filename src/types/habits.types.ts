export interface Habit {
  id?: string;
  userId: string;
  name: string;
  emoji: string;
  color: string;
  activeDays: number[];
  createdAt: number;
  isArchived?: boolean;
}

export interface HabitLog {
  id?: string;
  userId: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
}
