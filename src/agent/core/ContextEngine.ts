// ContextEngine: Aggregates real-time user data and historical patterns to pass to the Agent Fleet.
// Derives peak-hour productivity patterns from completion timestamps.
import type { Task, CalendarEvent } from '../../types/domain';

interface GlobalData {
  completedHistory?: Array<{ completedAt?: string | number }>;
  gymSchedule?: { name?: string; isRest?: boolean; exercises?: Array<{ name: string; sets: number; reps: number }> };
  habits?: Array<{ id: string; name: string; completedToday?: boolean }>;
  habitLogs?: Array<{ habitId: string; date: string }>;
  learningTopics?: Array<{ id: string; title: string; subTasks?: any[] }>;
  assignments?: Array<{ id: string; title: string; dueDate?: string; status?: string; subject?: string }>;
  goals?: Array<{ id: string; title: string; status?: string }>;
}

/**
 * Builds a JSON context memory block injected into every agent system prompt.
 * Includes task load summary, upcoming calendar events, gym schedule, habits, and learning.
 */
export const buildContextMemory = (
  userTodos: Task[],
  calendarEvents: CalendarEvent[],
  globalData?: GlobalData
): string => {
  const activeTasks   = userTodos.filter(t => t.status !== 'completed');
  const criticalTasks = activeTasks.filter(
    t => (t as Task & { deadlineDNA?: number }).deadlineDNA != null &&
         (t as Task & { deadlineDNA?: number }).deadlineDNA! >= 80
  );

  // Derive peak productivity hour from real task completion timestamps
  const completedHistory = globalData?.completedHistory || [];
  const hourCounts: Record<number, number> = {};
  completedHistory.forEach(t => {
    if (t.completedAt) {
      const hr = new Date(t.completedAt).getHours();
      hourCounts[hr] = (hourCounts[hr] || 0) + 1;
    }
  });
  const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown';

  // Today's gym context
  const gymSchedule = globalData?.gymSchedule;
  const gymContext = gymSchedule
    ? gymSchedule.isRest
      ? { isRest: true, message: 'Today is a rest day — no workout scheduled.' }
      : {
          isRest: false,
          workoutName: gymSchedule.name,
          exercises: (gymSchedule.exercises || []).map(e => `${e.name} (${e.sets}x${e.reps})`),
          message: `Today's workout: ${gymSchedule.name} — ${(gymSchedule.exercises || []).length} exercises`
        }
    : null;

  // Today's habit summary
  const today = new Date().toISOString().split('T')[0];
  const habits = globalData?.habits || [];
  const habitLogs = globalData?.habitLogs || [];
  const todayLogs = habitLogs.filter(l => l.date === today);
  const habitSummary = habits.length > 0
    ? {
        total: habits.length,
        completedToday: todayLogs.length,
        pendingToday: habits.length - todayLogs.length,
        habits: habits.slice(0, 5).map(h => ({
          name: h.name,
          done: todayLogs.some(l => l.habitId === h.id),
        }))
      }
    : null;

  // Active learning topics (titles only — save tokens)
  const learningTopics = globalData?.learningTopics || [];
  const learningContext = learningTopics.length > 0
    ? {
        topicCount: learningTopics.length,
        topics: learningTopics.slice(0, 5).map(t => ({
          title: t.title,
          lectureCount: t.subTasks?.length || 0,
        }))
      }
    : null;

  // Urgent assignments
  const assignments = globalData?.assignments || [];
  const urgentAssignments = assignments
    .filter(a => a.status !== 'completed' && a.dueDate)
    .sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1))
    .slice(0, 3);

  const memoryDump = {
    currentTime: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    taskLoad: {
      totalActive: activeTasks.length,
      criticalLoad: criticalTasks.length,
      highUrgencyTasks: criticalTasks.map(t => ({
        id: t.id,
        title: t.title,
        date: t.date,
      })),
    },
    calendarContext: {
      upcomingEvents: calendarEvents.slice(0, 5),
    },
    derivedPatterns: {
      peakProductivityHour: peakHour,
    },
    gymToday: gymContext,
    habitsToday: habitSummary,
    learning: learningContext,
    urgentAssignments: urgentAssignments.length > 0 ? urgentAssignments : null,
  };

  return `
[SYSTEM MEMORY INJECTION]
The following is the live context memory for the user. Use this to personalize your actions.
This tells you WHAT THE USER HAS in each module — use it before calling tools.
---
${JSON.stringify(memoryDump, null, 2)}
---
`;
};

