import { TaskSchema } from './models.types';

export type Task = TaskSchema;

export interface DailyLog {
  id: string;
  userId: string;
  date: string;
  content: string;
  createdAt: number;
}
