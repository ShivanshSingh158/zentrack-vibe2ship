export interface TodoSubtask {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface TodoItem {
  id?: string;
  userId: string;
  text: string;
  date: string; // YYYY-MM-DD
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  isRecurring?: boolean;
  estimatedMinutes?: number;
  subtasks?: TodoSubtask[];
  createdAt: number;
  order?: number;
  goalId?: string;
  /** Subject/course this task belongs to */
  subject?: string;
  /** Recurring pattern */
  recurringPattern?: 'daily' | 'weekly' | 'monthly';
  recurringEndDate?: string;
  completedAt?: number;
}
