// ContextEngine: Aggregates real-time user data and historical patterns to pass to the Agent Fleet.

export const buildContextMemory = (
  userTodos: any[],
  calendarEvents: any[],
  globalData?: any
): string => {
  
  // Basic metrics
  const activeTasks = userTodos.filter(t => t.status !== 'completed');
  const criticalTasks = activeTasks.filter(t => t.deadlineDNA >= 80);
  
  const memoryDump = {
    currentTime: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    taskLoad: {
      totalActive: activeTasks.length,
      criticalLoad: criticalTasks.length,
      highUrgencyTasks: criticalTasks.map(t => ({ id: t.id, title: t.text, dna: t.deadlineDNA }))
    },
    calendarContext: {
      upcomingEvents: calendarEvents.slice(0, 5)
    },
    // Derive REAL peak hour from task completion timestamps in globalData
    derivedPatterns: (() => {
      const completedTasks = (globalData?.completedHistory || []);
      const hourCounts: Record<number, number> = {};
      completedTasks.forEach((t: any) => {
        if (t.completedAt) {
          const hr = new Date(t.completedAt).getHours();
          hourCounts[hr] = (hourCounts[hr] || 0) + 1;
        }
      });
      const peakHour = Object.entries(hourCounts).sort(([,a],[,b]) => b-a)[0]?.[0] || 'unknown';
      return { peakProductivityHour: peakHour };
    })()
  };

  return `
[SYSTEM MEMORY INJECTION]
The following is the live context memory for the user. Use this to personalize your actions.
---
${JSON.stringify(memoryDump, null, 2)}
---
`;
};
