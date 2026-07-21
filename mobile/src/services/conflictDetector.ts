/**
 * conflictDetector.ts — ZenTrack Mobile
 *
 * BUG-C5 FIX: Replaces the stub that only checked 8h task overload.
 *
 * Detects:
 *  1. Task overload (>8h estimated today)
 *  2. Task vs class time overlap on today's schedule
 *  3. Gym session + assignment due on same day (double cognitive load)
 *  4. Attendance risk per subject (<72% critical, <78% warning)
 *  5. Assignment overload (3+ due within 7 days)
 *  6. P1 task with no time slot blocked today
 *  7. Exam/viva today + heavy task list
 */

export type ConflictSeverity = 'warning' | 'critical' | 'info';

export interface DetectedConflict {
  id: string;
  type:
    | 'task_overload'
    | 'physical_double_load'
    | 'gym_timing'
    | 'assignment_overload'
    | 'no_time_for_high_priority'
    | 'attendance_risk'
    | 'exam_conflict'
    | 'task_class_overlap';
  severity: ConflictSeverity;
  message: string;
  suggestion: string;
  modules: ('tasks' | 'gym' | 'academic' | 'habits')[];
}

// ── Time Helpers ──────────────────────────────────────────────────────────────

/** Parses "HH:MM" or "10:30 AM" style strings into minutes since midnight. */
function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/** Returns true if two events overlap given their starts (minutes) and durations (minutes). */
function timesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startA + durationA > startB;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export const detectConflicts = (appContext: any): DetectedConflict[] => {
  const conflicts: DetectedConflict[] = [];
  const { tasks = [], gymLogs = [], attendance = [], assignments = [], customEvents = [] } = appContext;

  const now            = new Date();
  const today          = now.toISOString().split('T')[0];
  const todayDayOfWeek = now.getDay().toString(); // "0"–"6"

  // ── 1. Task overload ────────────────────────────────────────────────────────
  const todayTasks    = tasks.filter((t: any) => t.date === today && t.status !== 'completed');
  const estimatedMins = todayTasks.reduce((acc: number, t: any) => acc + (t.estimatedMinutes || 30), 0);
  if (estimatedMins > 480) {
    conflicts.push({
      id: 'task_overload_today',
      type: 'task_overload',
      severity: 'warning',
      message: `You have ~${Math.round(estimatedMins / 60)}h of tasks scheduled today.`,
      suggestion: 'Move P2/P3 tasks to tomorrow to protect focus time.',
      modules: ['tasks'],
    });
  }

  // ── 2. Task vs class time overlap ──────────────────────────────────────────
  const todayTasksWithTime = todayTasks.filter((t: any) => t.timeSlot);
  const todayClasses: { name: string; startMin: number }[] = [];
  attendance.forEach((subj: any) => {
    const sch = subj.schedule?.[todayDayOfWeek];
    if (!sch) return;
    (sch.classes || []).forEach((cls: any) => {
      const startMin = parseTimeToMinutes(cls.time);
      if (startMin !== null) todayClasses.push({ name: subj.name, startMin });
    });
    (sch.labs || []).forEach((lab: any) => {
      const startMin = parseTimeToMinutes(lab.time);
      if (startMin !== null) todayClasses.push({ name: `${subj.name} Lab`, startMin });
    });
  });

  todayTasksWithTime.forEach((task: any) => {
    const taskStart = parseTimeToMinutes(task.timeSlot);
    if (taskStart === null) return;
    const taskDuration = task.estimatedMinutes || 30;
    todayClasses.forEach((cls) => {
      if (timesOverlap(taskStart, taskDuration, cls.startMin, 60)) {
        conflicts.push({
          id: `task_class_overlap_${task.id}_${cls.name}`,
          type: 'task_class_overlap',
          severity: 'critical',
          message: `"${task.title}" overlaps with your ${cls.name} class.`,
          suggestion: `Reschedule "${task.title}" to after your ${cls.name} session ends.`,
          modules: ['tasks', 'academic'],
        });
      }
    });
  });

  // ── 3. Gym + assignment due same day (double cognitive load) ───────────────
  const gymToday             = gymLogs.some((g: any) => g.date === today);
  const dueTodayAssignments  = assignments.filter((a: any) => a.dueDate === today && a.status !== 'submitted' && a.status !== 'graded');
  if (gymToday && dueTodayAssignments.length > 0) {
    conflicts.push({
      id: 'physical_double_load_today',
      type: 'physical_double_load',
      severity: 'warning',
      message: `Gym session AND ${dueTodayAssignments.length} assignment${dueTodayAssignments.length > 1 ? 's' : ''} due today.`,
      suggestion: 'Submit your assignment first, then hit the gym. Keep mental work before physical.',
      modules: ['gym', 'academic'],
    });
  }

  // ── 4. Attendance risk ─────────────────────────────────────────────────────
  attendance.forEach((subj: any) => {
    if (!subj.classesTotal || subj.classesTotal === 0) return;
    const pct = (subj.classesAttended / subj.classesTotal) * 100;
    if (pct < 72) {
      conflicts.push({
        id: `attendance_critical_${subj.id}`,
        type: 'attendance_risk',
        severity: 'critical',
        message: `${subj.name} attendance: ${pct.toFixed(0)}% — critically below safe threshold.`,
        suggestion: 'Do NOT miss another class. One more absence risks exam ineligibility.',
        modules: ['academic'],
      });
    } else if (pct < 78) {
      conflicts.push({
        id: `attendance_warning_${subj.id}`,
        type: 'attendance_risk',
        severity: 'warning',
        message: `${subj.name} attendance: ${pct.toFixed(0)}% — approaching 75% minimum.`,
        suggestion: 'Attend the next 2–3 classes to build a safety buffer.',
        modules: ['academic'],
      });
    }
  });

  // ── 5. Assignment overload (3+ due in 7 days) ──────────────────────────────
  const sevenDaysLater      = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const urgentAssignments   = assignments.filter((a: any) => a.dueDate >= today && a.dueDate <= sevenDaysLater && a.status !== 'submitted' && a.status !== 'graded');
  if (urgentAssignments.length >= 3) {
    conflicts.push({
      id: 'assignment_overload_week',
      type: 'assignment_overload',
      severity: 'warning',
      message: `${urgentAssignments.length} assignments due in the next 7 days.`,
      suggestion: 'Start with highest-weightage first. Block 2h daily for submissions.',
      modules: ['academic', 'tasks'],
    });
  }

  // ── 6. P1 task with no time slot ───────────────────────────────────────────
  const p1WithNoTime = todayTasks.filter((t: any) => (t.priority === 'P1' || t.priority === 'high') && !t.timeSlot);
  if (p1WithNoTime.length > 0) {
    conflicts.push({
      id: 'no_time_for_p1',
      type: 'no_time_for_high_priority',
      severity: 'info',
      message: `${p1WithNoTime.length} high-priority task${p1WithNoTime.length > 1 ? 's have' : ' has'} no time blocked today.`,
      suggestion: `Assign a time slot to "${p1WithNoTime[0].title}" so it doesn't get pushed to tomorrow.`,
      modules: ['tasks'],
    });
  }

  // ── 7. Exam/viva today + many pending tasks ────────────────────────────────
  const todayExams = customEvents.filter((e: any) => e.date === today && (e.type === 'exam' || e.type === 'viva'));
  if (todayExams.length > 0 && todayTasks.length > 3) {
    conflicts.push({
      id: 'exam_task_overload',
      type: 'exam_conflict',
      severity: 'critical',
      message: `Exam/viva today AND ${todayTasks.length} pending tasks.`,
      suggestion: 'Reschedule non-critical tasks. Focus 100% on the exam — tasks can wait 24 hours.',
      modules: ['academic', 'tasks'],
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
};

