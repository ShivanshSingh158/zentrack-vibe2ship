import { Task } from '../contexts/MobileDataContext';

export function calculateAppStreak(tasks?: Task[], gymLogs?: any[], habitLogs?: any[]): number {
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const dayTasks = tasks?.filter((t) => t.date === dStr) || [];
    const completedTasks = dayTasks.filter((t) => t.status === 'completed');
    const dayGym = gymLogs?.find((g) => g.date === dStr);
    const dayHabits = habitLogs?.filter((l) => l.date === dStr) || [];

    const hadAnyActivity = completedTasks.length > 0 || !!dayGym || dayHabits.length > 0;
    const hadUnfinishedWeekday =
      !isWeekend && dayTasks.length > 0 && completedTasks.length === 0 && !dayGym && dayHabits.length === 0;

    if (hadAnyActivity) {
      current++;
    } else if (hadUnfinishedWeekday && i > 0) {
      break;
    }
  }
  return current;
}
