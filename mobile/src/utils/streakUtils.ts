import { Task, LearningTopic } from '../contexts/MobileDataContext';
import { formatLocalDateStr } from './dateFormatters';

function normalizeDateStr(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const datePart = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  return null;
}

export function collectActiveDates(
  tasks?: Task[],
    habitLogs?: any[],
  learningTopics?: LearningTopic[]
): Set<string> {
  const activeDates = new Set<string>();

  tasks?.forEach(t => {
    if (t.status === 'completed') {
      const d = normalizeDateStr(t.completedAt) || normalizeDateStr(t.date);
      if (d) activeDates.add(d);
    }
  });

  
  habitLogs?.forEach(h => {
    if (h && h.date) {
      const d = normalizeDateStr(h.date);
      if (d) activeDates.add(d);
    }
  });

  learningTopics?.forEach(t => {
    t.subTasks?.forEach(s => {
      if (s.isCompleted && s.completedDate) {
        const d = normalizeDateStr(s.completedDate);
        if (d) activeDates.add(d);
      }
    });
  });

  return activeDates;
}

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  consistencyRate: number;
}

function parseYMDToEpochDay(str: string): number {
  const y = parseInt(str.slice(0, 4), 10);
  const m = parseInt(str.slice(5, 7), 10);
  const d = parseInt(str.slice(8, 10), 10);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function getDayOfWeekFromEpochDay(epochDay: number): number {
  // 1970-01-01 was Thursday (day 4). (epochDay + 4) % 7: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const dow = (epochDay + 4) % 7;
  return dow < 0 ? dow + 7 : dow;
}

/**
 * Computes all 4 streak and consistency metrics in a single pass over active dates,
 * avoiding separate iterations and duplicate Date object allocations.
 */
export function calculateAllStreakMetrics(
  tasks?: Task[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[],
  windowDays = 30
): StreakMetrics {
  const activeDates = collectActiveDates(tasks, habitLogs, learningTopics);
  const now = new Date();

  // 1. Current streak with Sunday recovery immunity (single mutating Date cursor)
  let currentStreak = 0;
  const cursor = new Date(now);
  for (let i = 0; i < 365; i++) {
    if (i > 0) {
      cursor.setDate(cursor.getDate() - 1);
    }
    const dStr = formatLocalDateStr(cursor);
    const isSunday = cursor.getDay() === 0;

    if (activeDates.has(dStr)) {
      currentStreak++;
    } else if (isSunday) {
      continue;
    } else if (i > 0) {
      break;
    }
  }

  // 2. Longest streak via integer epoch days (zero Date allocations)
  const sortedDates = Array.from(activeDates).sort();
  let longestStreak = sortedDates.length > 0 ? 1 : 0;
  let currentRun = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prevEpoch = parseYMDToEpochDay(sortedDates[i - 1]);
    const currEpoch = parseYMDToEpochDay(sortedDates[i]);
    const diffDays = currEpoch - prevEpoch;

    if (diffDays === 1 || (diffDays === 2 && getDayOfWeekFromEpochDay(prevEpoch) === 6 && getDayOfWeekFromEpochDay(currEpoch) === 1)) {
      currentRun++;
      if (currentRun > longestStreak) longestStreak = currentRun;
    } else if (diffDays > 1) {
      currentRun = 1;
    }
  }

  // 3. Total active days
  const totalActiveDays = activeDates.size;

  // 4. Consistency rate over requested rolling window (single mutating Date cursor)
  let activeWindowDays = 0;
  const windowCursor = new Date(now);
  for (let i = 0; i < windowDays; i++) {
    if (i > 0) {
      windowCursor.setDate(windowCursor.getDate() - 1);
    }
    if (activeDates.has(formatLocalDateStr(windowCursor))) {
      activeWindowDays++;
    }
  }
  const consistencyRate = Math.round((activeWindowDays / windowDays) * 100);

  return {
    currentStreak,
    longestStreak,
    totalActiveDays,
    consistencyRate,
  };
}

export function calculateAppStreak(
  tasks?: Task[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
  return calculateAllStreakMetrics(tasks, habitLogs, learningTopics).currentStreak;
}

export function calculateLongestAppStreak(
  tasks?: Task[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
  return calculateAllStreakMetrics(tasks, habitLogs, learningTopics).longestStreak;
}

export function calculateTotalActiveDays(
  tasks?: Task[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
  return calculateAllStreakMetrics(tasks, habitLogs, learningTopics).totalActiveDays;
}

export function calculateConsistencyRate(
  tasks?: Task[],
  habitLogs?: any[],
  windowDays = 30,
  learningTopics?: LearningTopic[]
): number {
  return calculateAllStreakMetrics(tasks, habitLogs, learningTopics, windowDays).consistencyRate;
}


export interface StreakMilestone {
  days: number;
  label: string;
  badge: string;
  badgeIcon?: string;
  badgeIconSet?: 'ionicons' | 'mci';
  color: string;
  gradient?: [string, string];
  desc?: string;
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3,   label: 'Spark',              badge: '⚡', badgeIcon: 'flash',             color: '#F59E0B', gradient: ['#F59E0B', '#F97316'], desc: '3-day spark ignited' },
  { days: 7,   label: 'Week Warrior',       badge: '🔥', badgeIcon: 'flame',             color: '#FF6B00', gradient: ['#FF8A00', '#FF3B30'], desc: '1 solid week of consistency' },
  { days: 14,  label: 'Fortnight Blaze',    badge: '🛡️', badgeIcon: 'shield-checkmark', color: '#8B5CF6', gradient: ['#A78BFA', '#7C3AED'], desc: '14-day unbroken momentum' },
  { days: 30,  label: 'Monthly Inferno',    badge: '👑', badgeIcon: 'crown', badgeIconSet: 'mci', color: '#EC4899', gradient: ['#F472B6', '#DB2777'], desc: '30-day elite focus' },
  { days: 60,  label: 'Titan Force',        badge: '🏆', badgeIcon: 'trophy',            color: '#06B6D4', gradient: ['#22D3EE', '#0284C7'], desc: '60-day unstoppable titan' },
  { days: 90,  label: 'Quarter Centurion',  badge: '🎖️', badgeIcon: 'ribbon',            color: '#10B981', gradient: ['#34D399', '#059669'], desc: '90-day quarter master' },
  { days: 120, label: 'Diamond Will',       badge: '💎', badgeIcon: 'diamond',           color: '#38BDF8', gradient: ['#38BDF8', '#6366F1'], desc: '120-day unbreakable habit' },
  { days: 150, label: 'Cosmic Grandmaster', badge: '🪐', badgeIcon: 'planet',            color: '#A855F7', gradient: ['#C084FC', '#9333EA'], desc: '150-day legendary cosmos' },
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
