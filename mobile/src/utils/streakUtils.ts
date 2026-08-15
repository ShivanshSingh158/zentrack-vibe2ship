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
    } else if (!hadAnyActivity && i > 0) {
      // If today has no activity yet, don't break immediately on day 0, but break on past days with 0 activity
      break;
    }
  }
  return current;
}

export function calculateLongestAppStreak(tasks?: Task[], gymLogs?: any[], habitLogs?: any[]): number {
  const activeDatesSet = new Set<string>();

  tasks?.forEach(t => {
    if (t.status === 'completed' && t.date) activeDatesSet.add(t.date);
  });
  gymLogs?.forEach(g => {
    if (g.date) activeDatesSet.add(g.date);
  });
  habitLogs?.forEach(h => {
    if (h.date) activeDatesSet.add(h.date);
  });

  const sortedDates = Array.from(activeDatesSet).sort();
  if (sortedDates.length === 0) return 0;

  let maxStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
    const curr = new Date(sortedDates[i] + 'T00:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentRun++;
      if (currentRun > maxStreak) maxStreak = currentRun;
    } else if (diffDays > 1) {
      currentRun = 1;
    }
  }

  return maxStreak;
}

export function calculateTotalActiveDays(tasks?: Task[], gymLogs?: any[], habitLogs?: any[]): number {
  const activeDatesSet = new Set<string>();
  tasks?.forEach(t => {
    if (t.status === 'completed' && t.date) activeDatesSet.add(t.date);
  });
  gymLogs?.forEach(g => {
    if (g.date) activeDatesSet.add(g.date);
  });
  habitLogs?.forEach(h => {
    if (h.date) activeDatesSet.add(h.date);
  });
  return activeDatesSet.size;
}

export function calculateConsistencyRate(tasks?: Task[], gymLogs?: any[], habitLogs?: any[], windowDays = 30): number {
  let activeDays = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);

    const hasTask = (tasks || []).some(t => t.date === dStr && t.status === 'completed');
    const hasGym = (gymLogs || []).some(g => g.date === dStr);
    const hasHabit = (habitLogs || []).some(h => h.date === dStr);

    if (hasTask || hasGym || hasHabit) {
      activeDays++;
    }
  }
  return Math.round((activeDays / windowDays) * 100);
}

export interface StreakMilestone {
  days: number;
  label: string;
  badge: string;
  color: string;
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, label: 'Spark', badge: '⚡', color: '#f59e0b' },
  { days: 7, label: 'Week Warrior', badge: '🔥', color: '#ff9f4d' },
  { days: 14, label: 'Fortnight Blaze', badge: '🛡️', color: '#a599ff' },
  { days: 30, label: 'Monthly Inferno', badge: '👑', color: '#ec4899' },
  { days: 60, label: 'Titan Flame', badge: '🏆', color: '#38bdf8' },
  { days: 100, label: 'Legendary Cosmos', badge: '🌌', color: '#10b981' },
];

export function getNextMilestone(currentStreak: number): { current: StreakMilestone; next: StreakMilestone; progress: number; remaining: number } {
  let current = STREAK_MILESTONES[0];
  let next = STREAK_MILESTONES[1];

  for (let i = 0; i < STREAK_MILESTONES.length; i++) {
    if (currentStreak >= STREAK_MILESTONES[i].days) {
      current = STREAK_MILESTONES[i];
      next = STREAK_MILESTONES[Math.min(i + 1, STREAK_MILESTONES.length - 1)];
    } else {
      next = STREAK_MILESTONES[i];
      current = i > 0 ? STREAK_MILESTONES[i - 1] : { days: 0, label: 'Initiate', badge: '🌱', color: '#a599ff' };
      break;
    }
  }

  const span = next.days - current.days;
  const earned = Math.max(0, currentStreak - current.days);
  const progress = span > 0 ? Math.min(1, earned / span) : 1;
  const remaining = Math.max(0, next.days - currentStreak);

  return { current, next, progress, remaining };
}
