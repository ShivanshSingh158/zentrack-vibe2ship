// ContextEngine: Aggregates real-time user data and historical patterns to pass to the Agent Fleet.
// Derives peak-hour productivity patterns from completion timestamps.
import type { Task, CalendarEvent } from '../../types/domain';

interface GlobalData {
  completedHistory?: Array<{ completedAt?: string | number }>;
}

/**
 * Builds a JSON context memory block injected into every agent system prompt.
 * Includes task load summary, upcoming calendar events, and derived productivity patterns.
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

  const memoryDump = {
    currentTime: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    taskLoad: {
      totalActive: activeTasks.length,
      criticalLoad: criticalTasks.length,
      highUrgencyTasks: criticalTasks.map(t => ({
        id: t.id,
        title: (t as Task & { deadlineDNA?: number }).deadlineDNA,
      })),
    },
    calendarContext: {
      upcomingEvents: calendarEvents.slice(0, 5),
    },
    derivedPatterns: {
      peakProductivityHour: peakHour,
    },
  };

  return `
[SYSTEM MEMORY INJECTION]
The following is the live context memory for the user. Use this to personalize your actions.
---
${JSON.stringify(memoryDump, null, 2)}
---
`;
};
