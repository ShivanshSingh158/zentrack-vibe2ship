export interface RecurrenceRule {
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  interval?: number;
  daysOfWeek?: number[];
  endDate?: string;
}

export interface TodoSubtask {
  id: string;
  title: string;
  completed?: boolean;
  status?: 'pending' | 'completed';
}

export interface TodoItem {
  id?: string;
  userId: string;
  title: string;
  text?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  status: 'pending' | 'completed' | 'in_progress' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'P1' | 'P2' | 'P3';
  timeSlot?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  actualStartTime?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: RecurrenceRule | null;
  recurringSourceId?: string | null;
  subtasks?: TodoSubtask[];
  tags?: string[];
  subject?: string | null;
  commitmentTo?: string | null;
  blockedBy?: string[];
  order?: number;
  createdAt?: any;
  completedAt?: any;
  updatedAt?: any;
}

export type Task = TodoItem;

export interface TaskTemplate {
  id?: string;
  userId: string;
  title: string;
  priority?: 'low' | 'medium' | 'high';
  timeSlot?: string;
  subtasks?: { id: string; title: string; completed: boolean }[];
  isRecurring?: boolean;
  recurringDays?: number[];
  createdAt?: any;
}

export interface DailyLog {
  id: string;
  userId: string;
  date: string;
  content: string;
  createdAt: number;
}

