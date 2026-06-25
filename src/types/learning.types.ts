export interface LearningSubTask {
  id: string;
  title: string;
  category?: string;
  url?: string;
  notes?: string;
  isCompleted: boolean;
  timeSpentMinutes?: number;
  timeSpentMs?: number;
  resources?: any[];
  /** Mastery level for revision tracking */
  masteryLevel?: 'not_started' | 'learning' | 'revising' | 'mastered';
  estimatedHours?: number;
  revisionCount?: number;
  lastRevisedAt?: number;
  /** Pin this video for quick re-access */
  pinned?: boolean;
  pinnedAt?: number;
}

export interface LearningTopic {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  notes?: string;
  lastStudiedAt?: number;
  subTasks: LearningSubTask[];
  createdAt: number;
  order?: number;
  timeSpentMinutes?: number;
  timeSpentMs?: number;
}
