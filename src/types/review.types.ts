export interface WeeklyReview {
  id?: string;
  userId: string;
  weekStart: string;
  weekEnd: string;
  wentWell: string;
  toImprove: string;
  nextWeekPriorities: string;
  gratitude: string;
  aiChatHistory?: any[];
  stats?: {
    todosCompleted: number;
    todosTotal: number;
    productiveHours: number;
    learningSubtasksDone: number;
    learningSubtasksTotal: number;
    habitsDone: number;
    habitsAssigned: number;
    waterIntakeTotal: number;
    goalsActive: number;
    workoutsCompleted?: number;
    cardioKmTotal?: number;
  };
  createdAt: number;
  updatedAt: number;
}
