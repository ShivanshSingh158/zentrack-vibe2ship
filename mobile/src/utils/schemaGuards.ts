/**
 * schemaGuards.ts — ZenTrack Mobile Defensive Schema Parsing & Null Safety Engine
 *
 * WhatsApp Architecture Standard:
 * 1. Zero tolerance for corrupted documents, missing fields, or legacy schemas crashing the UI.
 * 2. Strict type-coercion and default fallback injection on every Firestore doc ingestion.
 * 3. Extreme range validation & boundary clamping (negative reps, 0/negative minutes, overflow strings).
 * 4. Unicode & Emoji surrogate pair safety to prevent layout rendering exceptions.
 */

import {
  Task, Habit, HabitLog, StorageNode, Note, Goal, CustomEvent,
  WaterLog, SleepLog, WeightLog, GymLog, AttendanceSubject,
  AttendanceLog, Assignment, Semester, SemesterSubject,
  LearningTopic, LearningSubTask, JobApplication, WeeklyReview, ContentLog
} from '../contexts/MobileDataContext';

// ─── Helper Primitives ────────────────────────────────────────────────────────

/**
 * Truncates and sanitizes strings to prevent memory or layout crashes from giant strings.
 * Preserves unicode code points and handles emoji surrogate pairs safely.
 */
export function sanitizeString(val: any, fallback: string = '', maxLen: number = 500): string {
  if (typeof val !== 'string') {
    if (val === null || val === undefined) return fallback;
    return String(val).slice(0, maxLen);
  }
  const trimmed = val.trim();
  if (trimmed.length === 0) return fallback;
  // Array.from splits correctly across multi-byte UTF-16 surrogate pairs (emojis)
  const chars = Array.from(trimmed);
  if (chars.length > maxLen) {
    return chars.slice(0, maxLen).join('');
  }
  return trimmed;
}

/**
 * Validates and clamps a number between min and max.
 * Converts NaN, Infinity, or non-numeric types to fallback.
 */
export function sanitizeNumber(val: any, fallback: number = 0, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
    const parsed = parseFloat(val);
    if (isNaN(parsed) || !isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }
  return Math.max(min, Math.min(max, val));
}

/**
 * Validates string against an allowed set of enum values, returning fallback if invalid.
 */
export function sanitizeEnum<T extends string>(val: any, allowed: T[], fallback: T): T {
  if (typeof val === 'string' && (allowed as string[]).includes(val)) {
    return val as T;
  }
  return fallback;
}

// ─── Domain Document Parsers ──────────────────────────────────────────────────

export function parseTask(docData: any, docId: string): Task {
  const d = docData && typeof docData === 'object' ? docData : {};
  const id = sanitizeString(docId || d.id, 'task_' + Date.now());
  const title = sanitizeString(d.title, 'Untitled Task', 300);
  const status = sanitizeEnum<'pending' | 'completed'>(d.status, ['pending', 'completed'], 'pending');
  const priority = sanitizeEnum<'P1' | 'P2' | 'P3' | 'high' | 'medium' | 'low'>(
    d.priority,
    ['P1', 'P2', 'P3', 'high', 'medium', 'low'],
    'P2'
  );

  const subtasks = Array.isArray(d.subtasks)
    ? d.subtasks.map((st: any, idx: number) => ({
        id: sanitizeString(st?.id, `st_${idx}`),
        title: sanitizeString(st?.title, 'Subtask', 200),
        completed: Boolean(st?.completed),
      }))
    : [];

  const tags = Array.isArray(d.tags)
    ? d.tags.map((t: any) => sanitizeString(t, '', 50)).filter(Boolean)
    : [];

  return {
    id,
    userId: sanitizeString(d.userId, ''),
    title,
    status,
    priority,
    date: sanitizeString(d.date, new Date().toISOString().split('T')[0], 10),
    tags,
    isRecurring: Boolean(d.isRecurring),
    recurrenceRule: d.recurrenceRule && typeof d.recurrenceRule === 'object' ? d.recurrenceRule : undefined,
    recurringSourceId: d.recurringSourceId ? String(d.recurringSourceId) : undefined,
    timeSlot: d.timeSlot ? sanitizeString(d.timeSlot, undefined as any, 50) : undefined,
    estimatedMinutes: sanitizeNumber(d.estimatedMinutes, 0, 0, 1440),
    actualMinutes: sanitizeNumber(d.actualMinutes, 0, 0, 1440),
    actualStartTime: d.actualStartTime ? sanitizeString(d.actualStartTime, undefined as any, 30) : undefined,
    subject: d.subject ? sanitizeString(d.subject, undefined as any, 100) : undefined,
    commitmentTo: d.commitmentTo ? sanitizeString(d.commitmentTo, undefined as any, 100) : undefined,
    energyRequirement: sanitizeEnum<'low' | 'medium' | 'high'>(d.energyRequirement, ['low', 'medium', 'high'], 'medium'),
    order: sanitizeNumber(d.order, 0, 0, 10000),
    subtasks,
    completedAt: d.completedAt ? sanitizeString(d.completedAt, null as any, 50) : null,
  };
}

export function parseHabit(docData: any, docId: string): Habit {
  const d = docData && typeof docData === 'object' ? docData : {};
  const id = sanitizeString(docId || d.id, 'habit_' + Date.now());
  const name = sanitizeString(d.name, 'Untitled Habit', 200);
  const emoji = sanitizeString(d.emoji, '⚡', 8);
  const frequency = sanitizeString(d.frequency, 'daily', 30);
  const streak = sanitizeNumber(d.streak, 0, 0, 10000);
  const longestStreak = sanitizeNumber(d.longestStreak, streak, 0, 10000);

  return {
    id,
    userId: sanitizeString(d.userId, ''),
    name,
    emoji,
    frequency,
    streak,
    longestStreak,
    color: d.color ? sanitizeString(d.color, undefined as any, 30) : undefined,
    archived: Boolean(d.archived),
    type: sanitizeEnum<'positive' | 'negative'>(d.type, ['positive', 'negative'], 'positive'),
    startDate: d.startDate ? sanitizeString(d.startDate, undefined as any, 10) : undefined,
    costPerDay: d.costPerDay !== undefined ? sanitizeNumber(d.costPerDay, 0, 0, 100000) : undefined,
    targetCount: d.targetCount !== undefined ? sanitizeNumber(d.targetCount, 1, 1, 10000) : undefined,
  };
}

export function parseHabitLog(docData: any, docId: string): HabitLog {
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    id: sanitizeString(docId || d.id, 'hlog_' + Date.now()),
    habitId: sanitizeString(d.habitId, ''),
    userId: sanitizeString(d.userId, ''),
    date: sanitizeString(d.date, new Date().toISOString().split('T')[0], 10),
    count: sanitizeNumber(d.count, 1, 0, 10000),
    isFreeze: Boolean(d.isFreeze),
  };
}

export function parseGymLog(docData: any, docId: string): GymLog {
  const d = docData && typeof docData === 'object' ? docData : {};
  const id = sanitizeString(docId || d.id, 'gym_' + Date.now());

  const exercises = Array.isArray(d.exercises)
    ? d.exercises.map((ex: any, idx: number) => ({
        _idx: ex?._idx !== undefined ? sanitizeNumber(ex._idx, idx, 0) : idx,
        id: sanitizeString(ex?.id || ex?.exerciseId, ''),
        exerciseId: sanitizeString(ex?.exerciseId || ex?.id, ''),
        name: sanitizeString(ex?.name, 'Exercise', 150),
        targetSets: sanitizeNumber(ex?.targetSets, 3, 1, 20),
        targetReps: sanitizeString(ex?.targetReps, '10-12', 30),
        muscle: sanitizeString(ex?.muscle, 'general', 50),
        notes: ex?.notes ? sanitizeString(ex.notes, '', 300) : undefined,
        videoId: ex?.videoId ? sanitizeString(ex.videoId, '', 100) : undefined,
        supersetGroup: ex?.supersetGroup ? sanitizeString(ex.supersetGroup, undefined as any, 20) : undefined,
        restTimeSecs: ex?.restTimeSecs !== undefined ? sanitizeNumber(ex.restTimeSecs, 90, 0, 600) : undefined,
        skipped: Boolean(ex?.skipped),
        lastSessionSets: Array.isArray(ex?.lastSessionSets) ? ex.lastSessionSets : undefined,
        setsLog: Array.isArray(ex?.setsLog)
          ? ex.setsLog.map((s: any, sIdx: number) => {
              const rawWeight = s?.weight !== undefined ? s.weight : s?.weightKg;
              const weight = rawWeight !== null && rawWeight !== undefined && rawWeight !== '' && !isNaN(Number(rawWeight))
                ? Number(rawWeight)
                : null;
              const rawReps = s?.reps;
              const reps = rawReps !== null && rawReps !== undefined && rawReps !== '' && !isNaN(Number(rawReps))
                ? Number(rawReps)
                : null;
              return {
                setNumber: sanitizeNumber(s?.setNumber, sIdx + 1, 1, 99),
                reps,
                weight,
                weightKg: weight ?? 0,
                completed: Boolean(s?.completed),
              };
            })
          : [],
      }))
    : [];

  const cardio = Array.isArray(d.cardio)
    ? d.cardio.map((c: any) => ({
        id: sanitizeString(c?.id, 'cardio_' + Date.now()),
        type: sanitizeString(c?.type, 'Cardio', 50),
        durationMinutes: c?.durationMinutes != null ? sanitizeNumber(c.durationMinutes, 0, 0, 600) : null,
        calories: c?.calories != null ? sanitizeNumber(c.calories, 0, 0, 10000) : null,
        distanceKm: c?.distanceKm != null ? sanitizeNumber(c.distanceKm, 0, 0, 200) : null,
        speedKmh: c?.speedKmh != null ? sanitizeNumber(c.speedKmh, 0, 0, 100) : null,
        incline: c?.incline != null ? sanitizeNumber(c.incline, 0, 0, 50) : null,
        completed: Boolean(c?.completed),
      }))
    : [];

  return {
    id,
    userId: sanitizeString(d.userId, ''),
    date: sanitizeString(d.date, new Date().toISOString().split('T')[0], 10),
    exercises,
    cardio,
    workoutStartTime: d.workoutStartTime != null ? sanitizeNumber(d.workoutStartTime, 0, 0) : undefined,
    workoutDurationMinutes: d.workoutDurationMinutes != null ? sanitizeNumber(d.workoutDurationMinutes, 0, 0, 600) : undefined,
    completed: Boolean(d.completed),
    dayPlanIndex: d.dayPlanIndex != null ? sanitizeNumber(d.dayPlanIndex, 1, 1, 7) : undefined,
    startTime: d.startTime ? sanitizeString(d.startTime, undefined as any, 20) : undefined,
    endTime: d.endTime ? sanitizeString(d.endTime, undefined as any, 20) : undefined,
    updatedAt: sanitizeNumber(d.updatedAt, Date.now(), 0),
    notes: d.notes ? sanitizeString(d.notes, '', 500) : undefined,
    restTimerStartTime: d.restTimerStartTime !== undefined ? d.restTimerStartTime : null,
    restTimerDurationSecs: d.restTimerDurationSecs !== undefined ? d.restTimerDurationSecs : null,
    restTimerExerciseName: d.restTimerExerciseName !== undefined ? d.restTimerExerciseName : null,
  };
}

export function parseAttendanceSubject(docData: any, docId: string): AttendanceSubject {
  const d = docData && typeof docData === 'object' ? docData : {};
  const id = sanitizeString(docId || d.id, 'att_' + Date.now());

  return {
    id,
    userId: sanitizeString(d.userId, ''),
    name: sanitizeString(d.name, 'Untitled Subject', 200),
    classesAttended: sanitizeNumber(d.classesAttended, 0, 0, 1000),
    classesTotal: sanitizeNumber(d.classesTotal, 0, 0, 1000),
    labsAttended: sanitizeNumber(d.labsAttended, 0, 0, 1000),
    labsTotal: sanitizeNumber(d.labsTotal, 0, 0, 1000),
    targetPercentage: sanitizeNumber(d.targetPercentage, 75, 1, 100),
    schedule: d.schedule && typeof d.schedule === 'object' ? d.schedule : {},
    schemaVersion: sanitizeNumber(d.schemaVersion, 1, 1, 10),
    lastUpdated: sanitizeNumber(d.lastUpdated, Date.now(), 0),
    color: d.color ? sanitizeString(d.color, undefined as any, 30) : undefined,
    order: sanitizeNumber(d.order, 0, 0, 1000),
  };
}

export function parseAttendanceLog(docData: any, docId: string): AttendanceLog {
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    id: sanitizeString(docId || d.id, 'alog_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    subjectId: sanitizeString(d.subjectId || d.subject_id || d.subId || '', ''),
    subjectName: sanitizeString(d.subjectName || d.name || 'Subject', 'Subject', 200),
    type: sanitizeEnum<'class' | 'lab'>(d.type, ['class', 'lab'], 'class'),
    action: sanitizeEnum<'attended' | 'missed' | 'cancelled'>(d.action, ['attended', 'missed', 'cancelled'], 'attended'),
    date: sanitizeString(String(d.date || '').slice(0, 10), new Date().toISOString().split('T')[0], 10),
    isExtra: Boolean(d.isExtra),
    timestamp: sanitizeNumber(d.timestamp || d.createdAt, Date.now(), 0),
    idx: typeof d.idx === 'number' ? d.idx : undefined,
  };
}

export function parseAssignment(docData: any, docId: string): Assignment {
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    id: sanitizeString(docId || d.id, 'asg_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    title: sanitizeString(d.title, 'Untitled Assignment', 200),
    subjectName: sanitizeString(d.subjectName, 'General', 150),
    description: d.description ? sanitizeString(d.description, '', 1000) : undefined,
    dueDate: sanitizeString(d.dueDate, new Date().toISOString().split('T')[0], 10),
    weightage: sanitizeNumber(d.weightage, 0, 0, 100),
    status: sanitizeEnum<'not_started' | 'in_progress' | 'submitted' | 'graded'>(
      d.status,
      ['not_started', 'in_progress', 'submitted', 'graded'],
      'not_started'
    ),
    grade: d.grade ? sanitizeString(d.grade, undefined as any, 10) : undefined,
    maxMarks: sanitizeNumber(d.maxMarks, 100, 0, 1000),
    obtainedMarks: sanitizeNumber(d.obtainedMarks, 0, 0, 1000),
    notes: d.notes ? sanitizeString(d.notes, '', 1000) : undefined,
    createdAt: sanitizeNumber(d.createdAt, Date.now(), 0),
    updatedAt: sanitizeNumber(d.updatedAt, Date.now(), 0),
  };
}

export function parseCustomEvent(docData: any, docId: string): CustomEvent {
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    id: sanitizeString(docId || d.id, 'evt_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    title: sanitizeString(d.title, 'Untitled Event', 300),
    date: sanitizeString(d.date, new Date().toISOString().split('T')[0], 10),
    type: sanitizeEnum<any>(
      d.type,
      ['todo', 'job', 'goal', 'exam', 'assignment_due', 'holiday', 'viva', 'submission', 'gcal', 'gym'],
      'todo'
    ),
    startTime: sanitizeString(d.startTime, '09:00', 10),
    endTime: sanitizeString(d.endTime, '10:00', 10),
    location: d.location ? sanitizeString(d.location, '', 200) : undefined,
    description: d.description ? sanitizeString(d.description, '', 1000) : undefined,
  };
}

export function parseGoal(docData: any, docId: string): Goal {
  const d = docData && typeof docData === 'object' ? docData : {};
  const keyResults = Array.isArray(d.keyResults)
    ? d.keyResults.map((kr: any, idx: number) => ({
        id: sanitizeString(kr?.id, `kr_${idx}`),
        title: sanitizeString(kr?.title, 'Key Result', 200),
        completed: Boolean(kr?.completed),
      }))
    : [];

  return {
    id: sanitizeString(docId || d.id, 'goal_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    title: sanitizeString(d.title, 'Untitled Goal', 300),
    status: sanitizeString(d.status, 'in_progress', 30),
    progress: sanitizeNumber(d.progress, 0, 0, 100),
    description: d.description ? sanitizeString(d.description, '', 1000) : undefined,
    deadline: d.deadline ? sanitizeString(d.deadline, '', 20) : undefined,
    firstStep: d.firstStep ? sanitizeString(d.firstStep, '', 300) : undefined,
    successMetric: d.successMetric ? sanitizeString(d.successMetric, '', 300) : undefined,
    keyResults,
    updatedAt: sanitizeNumber(d.updatedAt, Date.now(), 0),
  };
}

export function parseStorageNode(docData: any, docId: string): StorageNode {
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    id: sanitizeString(docId || d.id, 'node_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    type: sanitizeEnum<'folder' | 'file' | 'note'>(d.type, ['folder', 'file', 'note'], 'note'),
    name: sanitizeString(d.name, 'Untitled', 250),
    parentId: d.parentId ? sanitizeString(d.parentId, null as any, 100) : null,
    fileType: d.fileType ? sanitizeEnum<'pdf' | 'docx' | 'image' | 'other'>(d.fileType, ['pdf', 'docx', 'image', 'other'], 'other') : undefined,
    size: sanitizeNumber(d.size, 0, 0),
    url: d.url ? sanitizeString(d.url, '', 2000) : undefined,
    content: typeof d.content === 'string' ? d.content : '',
    createdAt: d.createdAt || Date.now(),
    updatedAt: d.updatedAt || Date.now(),
    pinned: Boolean(d.pinned),
    tags: Array.isArray(d.tags) ? d.tags.map((t: any) => sanitizeString(t, '', 50)).filter(Boolean) : [],
  };
}

export function parseLearningTopic(docData: any, docId: string): LearningTopic {
  const d = docData && typeof docData === 'object' ? docData : {};
  const subTasks: LearningSubTask[] = Array.isArray(d.subTasks)
    ? d.subTasks.map((st: any, idx: number) => ({
        id: sanitizeString(st?.id, `lst_${idx}`),
        title: sanitizeString(st?.title, 'Lecture', 200),
        category: st?.category ? sanitizeString(st.category, '', 100) : undefined,
        url: st?.url ? sanitizeString(st.url, '', 2000) : undefined,
        notes: st?.notes ? String(st.notes) : undefined,
        isCompleted: Boolean(st?.isCompleted),
        timeSpentMinutes: sanitizeNumber(st?.timeSpentMinutes, 0, 0, 10000),
        timeSpentMs: sanitizeNumber(st?.timeSpentMs, 0, 0),
        resources: Array.isArray(st?.resources) ? st.resources : [],
        masteryLevel: sanitizeEnum<'not_started' | 'learning' | 'revising' | 'mastered'>(
          st?.masteryLevel,
          ['not_started', 'learning', 'revising', 'mastered'],
          'not_started'
        ),
        estimatedHours: sanitizeNumber(st?.estimatedHours, 1, 0, 1000),
        revisionCount: sanitizeNumber(st?.revisionCount, 0, 0, 1000),
        lastRevisedAt: sanitizeNumber(st?.lastRevisedAt, 0, 0),
        pinned: Boolean(st?.pinned),
        pinnedAt: sanitizeNumber(st?.pinnedAt, 0, 0),
        completedDate: st?.completedDate ? sanitizeString(st.completedDate, '', 20) : undefined,
      }))
    : [];

  return {
    id: sanitizeString(docId || d.id, 'lt_' + Date.now()),
    userId: sanitizeString(d.userId, ''),
    title: sanitizeString(d.title, 'Untitled Roadmap', 200),
    description: d.description ? sanitizeString(d.description, '', 1000) : undefined,
    notes: d.notes ? String(d.notes) : undefined,
    lastStudiedAt: sanitizeNumber(d.lastStudiedAt, 0, 0),
    subTasks,
    createdAt: sanitizeNumber(d.createdAt, Date.now(), 0),
    order: sanitizeNumber(d.order, 0, 0, 10000),
    timeSpentMinutes: sanitizeNumber(d.timeSpentMinutes, 0, 0, 10000),
    timeSpentMs: sanitizeNumber(d.timeSpentMs, 0, 0),
  };
}

/**
 * Fast equality check between previous state array and incoming snapshot array.
 * If every item is identical (same IDs and properties), returns true so React
 * can reuse the existing array reference and bail out of re-rendering.
 */
export function areItemsEqual<T>(prev: T[] | null | undefined, next: T[] | null | undefined): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0 && next.length === 0) return true;
  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
}

