// ContextEngine: Aggregates real-time user data and historical patterns to pass to the Agent Fleet.
// ✅ REWRITTEN: Was 52 lines returning minimal data. Now pulls full appContext like toolExecutor does.
// ✅ GAP-1 FIX: Now also accepts pre-loaded agentMemoryContext string for cross-session memory injection.
import type { Task, CalendarEvent } from '../../types/domain';
import { getLocalDateString } from '../../utils/dateUtils';

export const buildContextMemory = (
  userTodos: Task[],
  calendarEvents: CalendarEvent[],
  appContext?: any, // Full appContext object from GlobalDataContext
  agentMemoryContext?: string // ✅ GAP-1: Pre-loaded 14-day interaction history from Firestore
): string => {

  const today = getLocalDateString(new Date());
  const now = Date.now();

  // ── Task Intelligence ───────────────────────────────────────────────────────
  const activeTasks = userTodos.filter(t => t.status !== 'completed');
  const completedTasks = userTodos.filter(t => t.status === 'completed');
  const todayTasks = activeTasks.filter(t => (t as any).date === today);
  const overdueTasks = activeTasks.filter(t => (t as any).date && (t as any).date < today);
  const highPriorityTasks = activeTasks.filter(t => (t as any).priority === 'high');

  // ── Habit Intelligence ──────────────────────────────────────────────────────
  const habits = appContext?.habits || [];
  const habitLogs = appContext?.habitLogs || [];
  const todayHabitLogSet = new Set(habitLogs.filter((l: any) => l.date === today).map((l: any) => l.habitId));
  const habitSummary = habits.map((h: any) => ({
    name: h.name,
    emoji: h.emoji,
    doneToday: todayHabitLogSet.has(h.id),
  }));
  const habitsDoneToday = habitSummary.filter((h: any) => h.doneToday).length;
  const habitsPendingToday = habitSummary.filter((h: any) => !h.doneToday).length;

  // ── Peak Productivity Derivation ────────────────────────────────────────────
  // Use completed task timestamps to find when the user is most productive
  const hourCounts: Record<number, number> = {};
  completedTasks.forEach((t: any) => {
    if (t.completedAt) {
      const hr = new Date(t.completedAt).getHours();
      hourCounts[hr] = (hourCounts[hr] || 0) + 1;
    }
  });
  const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const peakProductivityHour = peakHour
    ? `${peakHour}:00 (${parseInt(peakHour) < 12 ? 'morning' : parseInt(peakHour) < 17 ? 'afternoon' : 'evening'})`
    : (appContext?.userPreferences?.peakEnergyTime || 'unknown');

  // ── Goals Intelligence ──────────────────────────────────────────────────────
  const goals = appContext?.goals || [];
  const activeGoals = goals.filter((g: any) => g.status === 'active');
  const goalsSummary = activeGoals.slice(0, 3).map((g: any) => ({
    title: g.title,
    progress: g.keyResults
      ? Math.round(g.keyResults.reduce((s: number, kr: any) => s + ((kr.currentValue / (kr.targetValue || 1)) * 100), 0) / Math.max(1, g.keyResults.length))
      : 0,
  }));

  // ── Academic Intelligence ───────────────────────────────────────────────────
  const attendanceSubjects = appContext?.attendanceSubjects || [];
  const atRiskSubjects = attendanceSubjects.filter((s: any) => {
    const pct = s.classesTotal > 0 ? (s.classesAttended / s.classesTotal) * 100 : 100;
    return pct < (s.targetPercentage || 75);
  }).map((s: any) => s.name);

  // ── Gym Intelligence ────────────────────────────────────────────────────────
  const gymSchedule = appContext?.gymSchedule;
  const gymLogged = appContext?.userPreferences?.gymLogged || false;

  // ── Calendar Intelligence ───────────────────────────────────────────────────
  const todayEvents = calendarEvents.filter((e: any) => {
    const start = e.start?.dateTime || e.start?.date || '';
    return start.startsWith(today);
  });
  const upcomingEvents = todayEvents.slice(0, 5);

  // ── Pomodoro Intelligence ───────────────────────────────────────────────────
  const pomodoroSessions = appContext?.pomodoroSessions || [];
  const todayPomodoros = pomodoroSessions.filter((s: any) => s.date === today);
  const pomodoroMinutesToday = todayPomodoros.reduce((sum: number, s: any) => sum + (s.duration || 25), 0);

  // ── Jobs Intelligence ───────────────────────────────────────────────────────
  const jobs = appContext?.jobs || [];
  const activeApplications = jobs.filter((j: any) => !['rejected', 'offer'].includes(j.status));
  const interviewsPending = jobs.filter((j: any) => j.status === 'interviewing').length;

  const memoryDump = {
    currentTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    date: today,

    taskLoad: {
      totalActive: activeTasks.length,
      todayCount: todayTasks.length,
      overdueCount: overdueTasks.length,
      highPriorityCount: highPriorityTasks.length,
      overdueTasks: overdueTasks.slice(0, 5).map((t: any) => ({ title: t.title || t.text, date: t.date, priority: t.priority })),
      todayTasks: todayTasks.slice(0, 5).map((t: any) => ({ title: t.title || t.text, priority: t.priority })),
    },

    calendar: {
      eventsToday: upcomingEvents.length,
      events: upcomingEvents.map((e: any) => ({ summary: e.summary, start: e.start?.dateTime || e.start?.date })),
    },

    habits: {
      doneToday: habitsDoneToday,
      pendingToday: habitsPendingToday,
      pendingNames: habitSummary.filter((h: any) => !h.doneToday).map((h: any) => `${h.emoji} ${h.name}`),
    },

    goals: {
      activeCount: activeGoals.length,
      topGoals: goalsSummary,
    },

    academic: {
      atRiskSubjects: atRiskSubjects.slice(0, 3),
    },

    gym: {
      isGymDay: gymSchedule && !gymSchedule.isRest,
      gymDayName: gymSchedule?.name || 'Rest Day',
      logged: gymLogged,
    },

    focus: {
      pomodoroMinutesToday,
      pomodoroSessionsToday: todayPomodoros.length,
    },

    jobs: {
      activeApplications: activeApplications.length,
      interviewsPending,
    },

    derivedPatterns: {
      peakProductivityHour,
      tasksCompletedAllTime: completedTasks.length,
    },
  };

  return `
${agentMemoryContext ? agentMemoryContext + '\n' : ''}
[SYSTEM MEMORY INJECTION — PERSONALIZED USER CONTEXT]
The following is live, real-time context about the user. Use it to personalize EVERY response and action.
---
${JSON.stringify(memoryDump, null, 2)}
---
`;
};
