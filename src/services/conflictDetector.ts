/**
 * conflictDetector.ts — PROACTIVE-GAP-6 FIX: Cross-Module Intelligence
 *
 * Problem: Attendance, tasks, calendar, habits, and gym all exist in separate
 * Firestore collections with zero cross-referencing. The agent operates in silos.
 *
 * Real examples that go undetected today:
 *   - 3 classes at 9am+11am+2pm AND 5 tasks due same day → only 3 free hours but 6h of work
 *   - Habit "Run 5km" daily + calendar has a 10km hike same day → double load
 *   - Gym: Chest Day + lab practicals all morning → better to gym in evening
 *   - Study session scheduled on day of another exam → conflict
 *
 * Solution: Pure data-driven conflict detection engine.
 * - Zero LLM cost
 * - Runs every 30s (debounced) on GlobalDataContext updates
 * - Dispatches window CustomEvents consumed by the dashboard conflict card
 * - Each conflict has: type, modules, severity, suggestion, autoFixable
 */

export type ConflictSeverity = 'warning' | 'critical' | 'info';

export interface DetectedConflict {
  id: string;
  type:
    | 'overload'           // Too many tasks for available hours
    | 'double_load'        // Habit + calendar event = physical overload
    | 'gym_timing'         // Gym day but class/meeting conflicts with usual gym time
    | 'exam_conflict'      // Study session scheduled same day as another exam
    | 'assignment_overload'// Multiple assignments due same day
    | 'no_free_slots'      // Calendar fully blocked but high-priority tasks due
    | 'low_attendance_risk';// Skipping class risks dropping below threshold
  modules: string[];       // e.g. ['tasks', 'calendar']
  severity: ConflictSeverity;
  title: string;
  description: string;
  suggestion: string;
  autoFixable: boolean;   // True if the agent can fix without user input
  autoFixInstruction?: string; // Agent instruction to call if autoFixable
  detectedAt: number;
}

/** Run all conflict detectors. Returns an array of detected conflicts. Zero LLM. */
export const detectConflicts = (appContext: any): DetectedConflict[] => {
  const conflicts: DetectedConflict[] = [];
  const today = new Date().toISOString().split('T')[0];
  const todayDow = new Date().getDay(); // 0=Sun

  const tasks: any[] = appContext?.tasks || [];
  const calendarEvents: any[] = appContext?.calendarEvents || [];
  const habits: any[] = appContext?.habits || [];
  const habitLogs: any[] = appContext?.habitLogs || [];
  const gymSchedule: any = appContext?.gymSchedule;
  const attendanceSubjects: any[] = appContext?.attendanceSubjects || [];
  const assignments: any[] = appContext?.assignments || [];
  const pomodoroSessions: any[] = appContext?.pomodoroSessions || [];

  // ── Conflict 1: Task Overload ──────────────────────────────────────────────
  // Count today's tasks + their estimated time vs. today's free hours
  const todayTasks = tasks.filter((t: any) =>
    t.status !== 'completed' && t.date === today
  );
  const todayEvents = calendarEvents.filter((e: any) => {
    const start = e.start?.dateTime || e.start?.date || e.startDateTime || '';
    return start.startsWith(today);
  });
  const busyHours = todayEvents.reduce((sum: number, e: any) => {
    const dur = e.durationMinutes ? e.durationMinutes / 60 : 1;
    return sum + dur;
  }, 0);
  const freeHours = Math.max(0, 10 - busyHours); // assume 10 productive hours / day
  const totalTaskMinutes = todayTasks.reduce((sum: number, t: any) =>
    sum + (t.estimatedMinutes || 45), 0
  );
  const totalTaskHours = totalTaskMinutes / 60;
  if (totalTaskHours > freeHours + 1 && todayTasks.length > 3) {
    const deficit = Math.round(totalTaskHours - freeHours);
    conflicts.push({
      id: 'overload_' + today,
      type: 'overload',
      modules: ['tasks', 'calendar'],
      severity: deficit > 3 ? 'critical' : 'warning',
      title: `⚠️ ${Math.round(totalTaskHours)}h of tasks in ${Math.round(freeHours)}h of free time`,
      description: `You have ${todayTasks.length} tasks totaling ~${Math.round(totalTaskHours)}h but only ~${Math.round(freeHours)}h free today (${todayEvents.length} meetings).`,
      suggestion: `Drop or defer ${Math.ceil(deficit)} hours of low-priority tasks. Call rebuild_day to auto-optimize.`,
      autoFixable: true,
      autoFixInstruction: 'rebuild_day',
      detectedAt: Date.now(),
    });
  }

  // ── Conflict 2: Physical Double Load ──────────────────────────────────────
  // Habit says "run 5km" AND calendar has a hiking/sports event same day
  const physicalHabits = habits.filter((h: any) =>
    /run|gym|exercise|workout|cardio|swim|cycle|walk/i.test(h.name || '')
  );
  const physicalEvents = todayEvents.filter((e: any) =>
    /hike|trek|run|gym|sport|football|cricket|swim|cycle|yoga|class/i.test(e.summary || '')
  );
  const todayHabitDone = new Set(
    habitLogs.filter((l: any) => l.date === today).map((l: any) => l.habitId)
  );
  const unfinishedPhysicalHabits = physicalHabits.filter(
    (h: any) => !todayHabitDone.has(h.id)
  );
  if (unfinishedPhysicalHabits.length > 0 && physicalEvents.length > 0) {
    conflicts.push({
      id: 'double_load_' + today,
      type: 'double_load',
      modules: ['habits', 'calendar'],
      severity: 'info',
      title: `💪 Physical double-load detected`,
      description: `Your habit "${unfinishedPhysicalHabits[0].name}" + "${physicalEvents[0].summary}" are both scheduled today — that's a high physical load.`,
      suggestion: `Consider skipping the habit or reducing intensity since you have "${physicalEvents[0].summary}" today.`,
      autoFixable: false,
      detectedAt: Date.now(),
    });
  }

  // ── Conflict 3: Gym Timing ────────────────────────────────────────────────
  // Gym day but morning classes/meetings block the usual gym window
  if (gymSchedule && !gymSchedule.isRest) {
    const morningEvents = todayEvents.filter((e: any) => {
      const start = e.start?.dateTime || e.startDateTime || '';
      if (!start) return false;
      const hour = new Date(start).getHours();
      return hour >= 6 && hour <= 11; // morning = 6am-11am
    });
    if (morningEvents.length >= 2) {
      conflicts.push({
        id: 'gym_timing_' + today,
        type: 'gym_timing',
        modules: ['gym', 'calendar'],
        severity: 'info',
        title: `🏋️ Gym day but morning is blocked`,
        description: `Today is "${gymSchedule.name}" but you have ${morningEvents.length} morning events. Consider moving gym to the evening.`,
        suggestion: `Schedule gym for 6pm-8pm instead. Use focus_lock to protect that evening slot.`,
        autoFixable: false,
        detectedAt: Date.now(),
      });
    }
  }

  // ── Conflict 4: Assignment Overload ───────────────────────────────────────
  // Multiple assignments due on the same day
  const upcomingAssignments = assignments.filter((a: any) =>
    !a.completed && a.dueDate >= today
  );
  const byDueDate: Record<string, any[]> = {};
  upcomingAssignments.forEach((a: any) => {
    if (!byDueDate[a.dueDate]) byDueDate[a.dueDate] = [];
    byDueDate[a.dueDate].push(a);
  });
  Object.entries(byDueDate).forEach(([dueDate, dueAssignments]) => {
    if (dueAssignments.length >= 3) {
      conflicts.push({
        id: 'assignment_overload_' + dueDate,
        type: 'assignment_overload',
        modules: ['assignments', 'tasks'],
        severity: dueAssignments.length >= 4 ? 'critical' : 'warning',
        title: `📚 ${dueAssignments.length} assignments due on ${dueDate}`,
        description: `"${dueAssignments.map((a: any) => a.title).slice(0, 3).join('", "')}" all due on the same day.`,
        suggestion: `Start earliest-deadline first. Call plan_study_schedule for each subject now to distribute load.`,
        autoFixable: false,
        detectedAt: Date.now(),
      });
    }
  });

  // ── Conflict 5: No Free Calendar Slots for High-Priority Tasks ────────────
  const highPriDue = tasks.filter((t: any) =>
    t.status !== 'completed' && t.priority === 'high' && t.date === today
  );
  if (highPriDue.length > 0 && busyHours >= 7) {
    conflicts.push({
      id: 'no_free_slots_' + today,
      type: 'no_free_slots',
      modules: ['tasks', 'calendar'],
      severity: 'critical',
      title: `🔴 ${highPriDue.length} high-priority tasks but calendar is full`,
      description: `You have ${Math.round(busyHours)}h of meetings today and ${highPriDue.length} high-priority tasks with no room to complete them.`,
      suggestion: `Use focus_lock to carve out 90 min, or negotiate one meeting cancellation. Consider defer_task for non-critical work.`,
      autoFixable: false,
      detectedAt: Date.now(),
    });
  }

  // ── Conflict 6: Low Attendance Risk ──────────────────────────────────────
  // Attendance approaching threshold — surface proactively before it's too late
  attendanceSubjects.forEach((s: any) => {
    const total = s.classesTotal || s.total || 0;
    const attended = s.classesAttended || s.attended || 0;
    if (total === 0) return;
    const pct = (attended / total) * 100;
    const target = s.targetPercentage || 75;
    if (pct > target && pct < target + 5) { // within 5% of threshold
      const safeToMiss = Math.floor((attended - (target / 100) * total) / (target / 100));
      if (safeToMiss <= 2) {
        conflicts.push({
          id: 'attendance_' + s.name,
          type: 'low_attendance_risk',
          modules: ['attendance'],
          severity: safeToMiss === 0 ? 'critical' : 'warning',
          title: `🎓 ${s.name}: only ${safeToMiss} more absence${safeToMiss !== 1 ? 's' : ''} allowed`,
          description: `Current attendance: ${pct.toFixed(1)}% (target: ${target}%). Missing ${safeToMiss + 1} more class${safeToMiss !== 0 ? 'es' : ''} drops you below threshold.`,
          suggestion: `Do not miss ${s.name} this week. Call calculate_bunk_capacity for the exact count.`,
          autoFixable: false,
          detectedAt: Date.now(),
        });
      }
    }
  });

  return conflicts;
};

/** Debounce helper — returns a debounced version of a function */
export const createDebouncedDetector = (
  onConflicts: (conflicts: DetectedConflict[]) => void,
  delayMs = 30_000
): ((appContext: any) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (appContext: any) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const conflicts = detectConflicts(appContext);
      if (conflicts.length > 0) {
        onConflicts(conflicts);
      }
    }, delayMs);
  };
};
