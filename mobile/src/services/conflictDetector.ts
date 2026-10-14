/**
 * conflictDetector.ts — ZenTrack Mobile
 *
 * Detects REAL scheduling conflicts — not vague "overload" warnings.
 *
 * Detects:
 *  1. Task vs Task time-slot overlap (two tasks at the same time)
 *  2. Task vs class time overlap on today's schedule (including 2h lab blocks)
 *  3. Gym session + assignment due on same day (double cognitive load)
 *  4. Attendance risk per subject (<72% critical, <78% warning)
 *  5. Assignment overload (3+ due within 7 days)
 *  6. P1 task with no time slot blocked today
 *  7. Exam/viva today + heavy task list
 */

import { formatLocalDateStr } from '../utils/dateUtils';
import { isValidWorkoutSession } from '../utils/gymUtils';

export type ConflictSeverity = 'warning' | 'critical' | 'info';

export interface DetectedConflict {
  id: string;
  type:
    | 'task_task_overlap'
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

function parseMatchedTime(m: RegExpMatchArray, defaultAmPm?: string): number | null {
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  let ampm = (m[3] || defaultAmPm || '')?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/** Parses "HH:MM", "9am", or "10:30 AM" style strings into minutes since midnight. */
export function parseTimeToMinutes(timeStr?: string, defaultAmPm?: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  const m = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
  if (m) {
    return parseMatchedTime(m, defaultAmPm);
  }
  const fallbackMatch = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/i);
  if (fallbackMatch) {
    return parseMatchedTime(fallbackMatch, defaultAmPm);
  }
  return null;
}

/**
 * Parses a timeSlot string like "2:00 PM–3:00 PM", "1:00 - 3:00 PM", or "14:00-15:00"
 * and returns { startMin, endMin }.
 */
export function parseTimeSlotToRange(timeSlot: string): { startMin: number; endMin: number } | null {
  if (!timeSlot) return null;
  const parts = timeSlot.split(/[-–—]|to/i);
  const endPart = parts[1]?.trim();
  const endAmPmMatch = endPart ? endPart.match(/(AM|PM|am|pm)/i) : null;
  const inferredAmPm = endAmPmMatch ? endAmPmMatch[1].toUpperCase() : undefined;

  const startPart = parts[0]?.trim();
  const startAmPmMatch = startPart ? startPart.match(/(AM|PM|am|pm)/i) : null;

  let defaultStartAmPm: string | undefined = undefined;
  if (!startAmPmMatch && inferredAmPm) {
    const rawStartH = parseInt(startPart?.match(/\d{1,2}/)?.[0] || '0', 10);
    const rawEndH = parseInt(endPart?.match(/\d{1,2}/)?.[0] || '0', 10);
    if (inferredAmPm === 'PM') {
      if (rawStartH < rawEndH || rawStartH === 12) {
        defaultStartAmPm = 'PM';
      } else {
        defaultStartAmPm = 'AM';
      }
    } else {
      defaultStartAmPm = inferredAmPm;
    }
  }

  const startMin = parseTimeToMinutes(startPart, defaultStartAmPm);
  let endMin = endPart ? parseTimeToMinutes(endPart) : null;
  if (startMin === null) return null;
  // Default duration: 30 min if no end time parsed
  if (endMin === null || endMin <= startMin) endMin = startMin + 30;
  return { startMin, endMin };
}

/** Returns true if two events overlap given their starts (minutes) and durations (minutes). */
function timesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startA + durationA > startB;
}

/** Returns true if two {startMin, endMin} ranges overlap. */
function rangesOverlap(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export const detectConflicts = (appContext: any): DetectedConflict[] => {
  const conflicts: DetectedConflict[] = [];
  const { tasks = [], gymLogs = [], attendance = [], assignments = [], customEvents = [] } = appContext || {};

  const now            = new Date();
  const today          = formatLocalDateStr(now);
  const todayDayOfWeek = now.getDay().toString(); // "0"–"6"

  const todayTasks = tasks.filter((t: any) => t.date === today && t.status !== 'completed');

  // ── 1. Task vs Task time-slot overlap ──────────────────────────────────────
  // Checks all overlapping intervals on the timeline.
  const timedTasks = todayTasks
    .filter((t: any) => t.timeSlot)
    .map((t: any) => ({ task: t, range: parseTimeSlotToRange(t.timeSlot) }))
    .filter((x: any) => x.range !== null) as { task: any; range: { startMin: number; endMin: number } }[];

  timedTasks.sort((a, b) => a.range.startMin - b.range.startMin);

  for (let i = 0; i < timedTasks.length; i++) {
    const a = timedTasks[i];
    for (let j = i + 1; j < timedTasks.length; j++) {
      const b = timedTasks[j];
      if (b.range.startMin >= a.range.endMin) {
        break; // Subsequent tasks start after 'a' ends
      }
      if (rangesOverlap(a.range, b.range)) {
        conflicts.push({
          id: `task_task_overlap_${a.task.id}_${b.task.id}`,
          type: 'task_task_overlap',
          severity: 'critical',
          message: `"${a.task.title}" and "${b.task.title}" overlap on the timeline.`,
          suggestion: `Drag one task to a free time slot to resolve the conflict.`,
          modules: ['tasks'],
        });
      }
    }
  }

  // ── 2. Task vs class time overlap ──────────────────────────────────────────
  const todayTasksWithTime = todayTasks.filter((t: any) => t.timeSlot);
  const todayClasses: { name: string; startMin: number; duration: number }[] = [];
  attendance.forEach((subj: any) => {
    const sch = subj.schedule?.[todayDayOfWeek];
    if (!sch) return;
    (sch.classes || []).forEach((cls: any) => {
      const startMin = parseTimeToMinutes(cls.time);
      if (startMin !== null) todayClasses.push({ name: subj.name, startMin, duration: 60 });
    });
    (sch.labs || []).forEach((lab: any) => {
      const startMin = parseTimeToMinutes(lab.time);
      if (startMin !== null) todayClasses.push({ name: `${subj.name} Lab`, startMin, duration: 120 });
    });
  });

  todayTasksWithTime.forEach((task: any) => {
    const range = parseTimeSlotToRange(task.timeSlot);
    if (!range) return;
    const taskStart = range.startMin;
    const taskDuration = task.estimatedMinutes || (range.endMin - range.startMin) || 30;
    todayClasses.forEach((cls) => {
      if (timesOverlap(taskStart, taskDuration, cls.startMin, cls.duration)) {
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
  const gymToday = gymLogs.some((g: any) => g.date === today && isValidWorkoutSession(g));
  const dueTodayAssignments = assignments.filter((a: any) => a.dueDate === today && a.status !== 'submitted' && a.status !== 'graded');
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
    // Require at least 10 classes logged before flagging attendance risk
    if (!subj.classesTotal || subj.classesTotal < 10) return;
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
  const sevenDaysLater    = formatLocalDateStr(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const urgentAssignments = assignments.filter(
    (a: any) => a.dueDate >= today && a.dueDate <= sevenDaysLater && a.status !== 'submitted' && a.status !== 'graded'
  );
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
