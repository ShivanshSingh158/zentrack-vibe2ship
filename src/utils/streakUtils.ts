import { getLocalDateString } from './dateUtils';

export function calculateAppStreak(
  tasks?: any[],
  gymLogs?: any[],
  habitLogs?: any[],
  learningTopics?: any[],
  attendanceLogs?: any[],
  pomodoroSessions?: any[],
  assignments?: any[],
  habits?: any[]
): number {
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = getLocalDateString(d);
    const dayOfWeek = d.getDay();
    const isSunday = dayOfWeek === 0;

    const dayTasks = tasks?.filter((t) => t.date === dStr) || [];
    const completedTasks = dayTasks.filter((t) => t.status === 'completed');
    const dayGym = gymLogs?.find((g) => g.date === dStr);
    const dayHabits = habitLogs?.filter((l) => l.date === dStr) || [];

    // Check if any learning topic has completed subtasks on this day
    const hasLearningActivity = (learningTopics || []).some(t =>
      (t.subTasks || []).some((s: any) => s.isCompleted && s.completedDate === dStr)
    );

    // Check attendance (attended classes)
    const hasAttendance = (attendanceLogs || []).some(l => 
      l.date === dStr && (l.action === 'attended' || l.action === 'present')
    );

    // Check pomodoro focus sessions
    const hasPomodoro = (pomodoroSessions || []).some(p => 
      p.date === dStr || (p.timestamp && getLocalDateString(new Date(p.timestamp)) === dStr)
    );

    // Check assignments
    const hasAssignment = (assignments || []).some(a => 
      (a.status === 'submitted' || a.status === 'graded') && a.dueDate === dStr
    );

    const hadAnyActivity = completedTasks.length > 0 || !!dayGym || dayHabits.length > 0 || hasLearningActivity || hasAttendance || hasPomodoro || hasAssignment;

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

  // Also check if any habit has a tracked streak (e.g. 32-day streak)
  const maxHabitStreak = (habits || []).reduce((acc: number, h: any) => 
    Math.max(acc, h.streak || 0, h.currentStreak || 0, h.longestStreak || 0), 0
  );

  return Math.max(current, maxHabitStreak);
}

export function calculateLongestAppStreak(
  tasks?: any[],
  gymLogs?: any[],
  habitLogs?: any[],
  learningTopics?: any[],
  attendanceLogs?: any[],
  pomodoroSessions?: any[],
  assignments?: any[],
  habits?: any[]
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
    t.subTasks?.forEach((s: any) => {
      if (s.isCompleted && s.completedDate) activeDatesSet.add(s.completedDate);
    });
  });
  attendanceLogs?.forEach(l => {
    if ((l.action === 'attended' || l.action === 'present') && l.date) activeDatesSet.add(l.date);
  });
  pomodoroSessions?.forEach(p => {
    if (p.date) activeDatesSet.add(p.date);
    else if (p.timestamp) activeDatesSet.add(getLocalDateString(new Date(p.timestamp)));
  });
  assignments?.forEach(a => {
    if ((a.status === 'submitted' || a.status === 'graded') && a.dueDate) activeDatesSet.add(a.dueDate);
  });

  const sortedDates = Array.from(activeDatesSet).sort();
  let maxStreak = sortedDates.length > 0 ? 1 : 0;
  let currentRun = sortedDates.length > 0 ? 1 : 0;

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

  const maxHabitStreak = (habits || []).reduce((acc: number, h: any) => 
    Math.max(acc, h.streak || 0, h.currentStreak || 0, h.longestStreak || 0), 0
  );

  return Math.max(maxStreak, maxHabitStreak);
}

