import { Task, LearningTopic } from '../contexts/MobileDataContext';
import { formatLocalDateStr } from './dateUtils';

export function calculateAppStreak(
  tasks?: Task[],
  gymLogs?: any[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
  // Pre-index all active dates in O(N) single pass for O(1) day-by-day evaluation
  const activeDates = new Set<string>();
  tasks?.forEach(t => {
    if (t.status === 'completed' && t.date) activeDates.add(t.date);
  });
  gymLogs?.forEach(g => {
    if (g.date) activeDates.add(g.date);
  });
  habitLogs?.forEach(h => {
    if (h.date) activeDates.add(h.date);
  });
  learningTopics?.forEach(t => {
    t.subTasks?.forEach(s => {
      if (s.isCompleted && s.completedDate) activeDates.add(s.completedDate);
    });
  });

  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = formatLocalDateStr(d);
    const dayOfWeek = d.getDay();
    const isSunday = dayOfWeek === 0;

    const hadAnyActivity = activeDates.has(dStr);

    if (hadAnyActivity) {
      current++;
    } else if (isSunday) {
      // 🏖️ SUNDAY RELAXATION / REST DAY IMMUNITY:
      // Sunday is an authorized recovery day. Inactivity on Sunday does NOT reset the streak.
      // Streak passes seamlessly from Saturday through to Monday.
      continue;
    } else if (i > 0) {
      // If today (i === 0) has no activity yet, don't break immediately; but break on past inactive weekdays
      break;
    }
  }
  return current;
}

export function calculateLongestAppStreak(
  tasks?: Task[],
  gymLogs?: any[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
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
  learningTopics?.forEach(t => {
    t.subTasks?.forEach(s => {
      if (s.isCompleted && s.completedDate) activeDatesSet.add(s.completedDate);
    });
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
    } else if (diffDays === 2 && prev.getDay() === 6 && curr.getDay() === 1) {
      // 🏖️ SUNDAY REST DAY BRIDGE: Saturday to Monday gap is a valid preserved streak!
      currentRun++;
      if (currentRun > maxStreak) maxStreak = currentRun;
    } else if (diffDays > 1) {
      currentRun = 1;
    }
  }

  return maxStreak;
}

export function calculateTotalActiveDays(
  tasks?: Task[],
  gymLogs?: any[],
  habitLogs?: any[],
  learningTopics?: LearningTopic[]
): number {
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
  learningTopics?.forEach(t => {
    t.subTasks?.forEach(s => {
      if (s.isCompleted && s.completedDate) activeDatesSet.add(s.completedDate);
    });
  });
  return activeDatesSet.size;
}

export function calculateConsistencyRate(
  tasks?: Task[],
  gymLogs?: any[],
  habitLogs?: any[],
  windowDays = 30,
  learningTopics?: LearningTopic[]
): number {
  const activeDates = new Set<string>();
  tasks?.forEach(t => {
    if (t.status === 'completed' && t.date) activeDates.add(t.date);
  });
  gymLogs?.forEach(g => {
    if (g.date) activeDates.add(g.date);
  });
  habitLogs?.forEach(h => {
    if (h.date) activeDates.add(h.date);
  });
  learningTopics?.forEach(t => {
    t.subTasks?.forEach(s => {
      if (s.isCompleted && s.completedDate) activeDates.add(s.completedDate);
    });
  });

  let activeDays = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = formatLocalDateStr(d);

    if (activeDates.has(dStr)) {
      activeDays++;
    }
  }
  return Math.round((activeDays / windowDays) * 100);
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
