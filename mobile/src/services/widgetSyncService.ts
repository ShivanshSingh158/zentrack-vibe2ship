/**
 * widgetSyncService.ts — ZenTrack Android Home Screen Widget Synchronization Engine
 * Handles data aggregation, caching, background widget re-rendering, and interactive actions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import React from 'react';
import { TodayAgendaWidget } from '../widgets/TodayAgendaWidget';
import { LiveWorkoutWidget } from '../widgets/LiveWorkoutWidget';
import { 
  TodayAgendaWidgetData, 
  WidgetAgendaClass, 
  WidgetAgendaTask, 
  WidgetClickActionPayload,
  LiveWorkoutWidgetData,
} from '../types/widget.types';
import type { Task, AttendanceSubject, AttendanceLog } from '../contexts/MobileDataContext';
import { safeUpdate, safeAdd, safeWrite } from '../utils/safeWrite';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { doc, updateDoc, collection, addDoc, writeBatch, setDoc } from 'firebase/firestore';
import { getScheduledAttendanceLogDocId } from '../screens/attendance/attendanceConstants';
import { readAcademicCache, writeAcademicCache, readWellnessCache, writeWellnessCache } from '../utils/domainCache';
import { formatLocalDateStr } from '../utils/dateUtils';
import { readCoreCacheMulti, writeCoreCacheMulti } from '../utils/coreCache';
import { awardXP } from './xpSystem';
import { planDayIndexForDate, resolvePlanDay } from '../hooks/useGymLog';
import { dismissActiveWorkoutNotification } from './activeWorkoutNotificationService';

const WIDGET_STORAGE_KEY = '@zentrack_widget_agenda_data';
const LIVE_WORKOUT_STORAGE_KEY = '@zentrack_widget_live_workout_data';

function parseTimeToMins(tStr?: string): number {
  if (!tStr) return 9999;
  const startStr = tStr.split('-')[0].trim().toLowerCase();
  let h = 0;
  let m = 0;
  const isPM = startStr.includes('pm');
  const isAM = startStr.includes('am');
  const cleanStr = startStr.replace(/[a-z\s]/g, '');
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
  } else {
    h = parseInt(parts[0], 10) || 0;
  }
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Converts any time string into a clean "9:00 AM" / "2:30 PM" display format.
 *
 * Handles:
 *   "10:00"     → "10:00 AM"   (bare 24h — the bug case)
 *   "14:30"     → "2:30 PM"    (bare 24h, afternoon)
 *   "9:00 AM"   → "9:00 AM"    (already correct — pass through)
 *   "11:00 PM"  → "11:00 PM"   (pass through)
 *   "15:00"     → "3:00 PM"
 *   "0:00"      → "12:00 AM"
 *   "12:00"     → "12:00 PM"
 *   ""          → ""           (empty — pass through for "Today", "Overdue" labels)
 */
function formatWidgetTime(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // If already has AM/PM (case-insensitive), clean up spacing and return
  const alreadyAmPm = /\b(am|pm)\b/i.test(trimmed);
  if (alreadyAmPm) {
    return trimmed.replace(/\s*(am|pm)/i, (_, s) => ' ' + s.toUpperCase());
  }
  // Parse bare time: "10:00", "14:30", "9", etc.
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return trimmed; // "Overdue", "Tomorrow", free-text — pass through
  const h24 = parseInt(match[1], 10);
  const min = match[2] ? parseInt(match[2], 10) : 0;
  if (isNaN(h24) || h24 < 0 || h24 > 23) return trimmed;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(min).padStart(2, '0');
  return `${h12}:${mm} ${suffix}`;
}

/**
 * Builds TodayAgendaWidgetData from live application state
 */
export function buildTodayAgendaData({
  tasks = [],
  subjects = [],
  attendanceLogs = [],
  holidays = [],
  zenScore = 85,
  streak = 0,
}: {
  tasks?: Task[];
  subjects?: AttendanceSubject[];
  attendanceLogs?: AttendanceLog[];
  holidays?: string[];
  zenScore?: number;
  streak?: number;
}): TodayAgendaWidgetData {
  const now = new Date();
  const dateStr = formatLocalDateStr(now);
  const isHoliday = (holidays || []).some((h) => {
    if (!h) return false;
    const s = typeof h === 'string' ? h : (h as any).date;
    return typeof s === 'string' && s.trim().slice(0, 10) === dateStr;
  });

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = formatLocalDateStr(tomorrow);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIdx = now.getDay();
  const dayOfWeek = dayNames[dayIdx];
  const dayOfWeekNum = dayIdx.toString();

  const displayDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // 1. Build today's classes (supports both { classes: [], labs: [] } object schema and flat array schema)
  // If today is marked as a holiday, omit all classes from widget
  const classes: WidgetAgendaClass[] = [];
  const items: any[] = [];
  const todayLogs = attendanceLogs.filter((l) => (l.date || '').slice(0, 10) === dateStr);

  if (!isHoliday) {
    subjects.forEach((subj) => {
      const sch =
        (subj as any).schedule?.[dayOfWeek] ||
        (subj as any).schedule?.[dayOfWeekNum] ||
        (subj as any).schedule?.[Number(dayOfWeekNum)] ||
        (subj as any).schedule?.[dayOfWeek.toLowerCase()] ||
        (subj as any).timetable?.[dayOfWeek] ||
        (subj as any).timetable?.[dayOfWeekNum];

      // Mirror the exact condition from useAttendanceData.ts — must have at least 1 class/lab slot
      if (!sch) return;
      const hasClasses = (Array.isArray(sch.classes) && sch.classes.length > 0) || (sch.classCount > 0);
      const hasLabs    = (Array.isArray(sch.labs) && sch.labs.length > 0) || (sch.labCount > 0);
      const isFlat     = Array.isArray(sch) && sch.length > 0;
      if (!hasClasses && !hasLabs && !isFlat) return;

      const classSlots: any[] = [];
      if (isFlat) {
        classSlots.push(...(sch as any[]));
      } else {
        // ── Regular class sessions ──
        const classCount = Array.isArray(sch.classes) ? sch.classes.length : (sch.classCount || 0);
        for (let i = 0; i < classCount; i++) {
          const session = sch.classes?.[i];
          // Accept slot even with no time — mirrors how AttendanceScreen renders 'Class #N'
          classSlots.push({
            ...(session && typeof session === 'object' ? session : {}),
            type: 'class',
            idx: i,
            time: session?.time || session?.slot || '',
            room: session?.room,
          });
        }
        // ── Lab sessions ──
        const labCount = Array.isArray(sch.labs) ? sch.labs.length : (sch.labCount || 0);
        for (let i = 0; i < labCount; i++) {
          const session = sch.labs?.[i];
          classSlots.push({
            ...(session && typeof session === 'object' ? session : {}),
            type: 'lab',
            idx: classCount + i,
            time: session?.time || session?.slot || '',
            room: session?.room,
          });
        }
      }

      classSlots.forEach((slot: any, slotIdx: number) => {
        const isLab = slot.isLab || slot.type === 'lab';
        const sessionIdx = slot.idx ?? slotIdx;
        const log = todayLogs.find(
          (l) => l.subjectId === subj.id && ((l as any).sessionIdx === sessionIdx || (l as any).idx === sessionIdx)
        );

        const status: 'attended' | 'missed' | 'cancelled' | 'pending' = log
          ? (log.action === 'attended' || (log.action as any) === 'present'
              ? 'attended'
              : log.action === 'missed' || (log.action as any) === 'absent'
              ? 'missed'
              : log.action === 'cancelled'
              ? 'cancelled'
              : 'pending')
          : 'pending';

        const timeMins = parseTimeToMins(slot.time);
        // Display label: use time if available, fall back to 'Class #N' / 'Lab #N'
        const sessionLabel = slot.time
          ? formatWidgetTime(slot.time)
          : isLab ? `Lab #${sessionIdx + 1}` : `Class #${sessionIdx + 1}`;

        classes.push({
          id: `${subj.id}_${sessionIdx}`,
          subjectId: subj.id,
          subjectName: subj.name,
          time: sessionLabel,
          room: slot.room,
          type: isLab ? 'lab' : 'class',
          status,
          idx: sessionIdx,
        });

        items.push({
          id: `${subj.id}_${sessionIdx}`,
          type: isLab ? 'lab' : 'class',
          title: subj.name,
          subtitle: slot.room ? `[${slot.room}]` : isLab ? 'Lab' : 'Class',
          timeStr: sessionLabel,
          timeMins,
          status,
          subjectId: subj.id,
          subjectName: subj.name,
          sessionIdx,
        });
      });
    });
  }

  // Sort classes by time
  classes.sort((a, b) => parseTimeToMins(a.time) - parseTimeToMins(b.time));

  // 2. Build today's tasks with strict date verification
  const todayTasksList = tasks.filter((t) => {
    const d = (t.date || '').slice(0, 10);
    return d === dateStr || (!d && t.status === 'pending');
  });
  const overdueTasksList = tasks.filter((t) => {
    const d = (t.date || '').slice(0, 10);
    return d && d < dateStr && t.status === 'pending';
  });
  const tomorrowTasksList = tasks.filter((t) => {
    const d = (t.date || '').slice(0, 10);
    return d === tomorrowStr && t.status === 'pending';
  });

  // ── PRIORITY RULE: Only show overdue/tomorrow when today has NO tasks AND NO classes ──
  // If there are today's tasks or classes, show only today's tasks (no overdue/tomorrow noise).
  const todayHasContent = todayTasksList.length > 0 || classes.length > 0;
  let relevantTasks: typeof tasks;
  if (todayTasksList.length > 0) {
    // Today has tasks — show only today's tasks, no overdue/tomorrow
    relevantTasks = todayTasksList;
  } else if (!todayHasContent && overdueTasksList.length > 0) {
    // Today is completely empty → show overdue as fallback
    relevantTasks = overdueTasksList;
  } else if (!todayHasContent && tomorrowTasksList.length > 0) {
    // Today + no overdue → show tomorrow as preview
    relevantTasks = tomorrowTasksList.slice(0, 5);
  } else {
    relevantTasks = [];
  }

  const mappedTasks: WidgetAgendaTask[] = relevantTasks.slice(0, 8).map((t) => {
    const rawTime = (t as any).timeSlot || (t as any).dueTime || '';
    const formattedTime = rawTime ? formatWidgetTime(rawTime) : '';
    const isOverdue = !todayHasContent && t.date && t.date < dateStr && t.status === 'pending';
    const isTomorrow = !todayHasContent && t.date === tomorrowStr;

    let timeBadge = formattedTime || 'Today';
    if (isOverdue) timeBadge = formattedTime ? `Overdue · ${formattedTime}` : 'Overdue';
    else if (isTomorrow) timeBadge = formattedTime ? `Tomorrow · ${formattedTime}` : 'Tomorrow';

    // Pending tasks without explicit time get 540 mins (9:00 AM) so they appear during the day alongside classes
    // instead of being pushed to 8:00 PM (1200 mins). Completed tasks get 1200 mins.
    const timeMins = isOverdue ? 0 : rawTime ? parseTimeToMins(rawTime) : (t.status === 'pending' ? 540 : 1200);
    const status: 'completed' | 'pending' = t.status === 'completed' ? 'completed' : 'pending';

    items.push({
      id: t.id,
      type: 'task',
      title: t.title,
      subtitle: isOverdue ? 'Overdue' : isTomorrow ? 'Tomorrow' : 'Task',
      timeStr: timeBadge,
      timeMins,
      status,
      taskId: t.id,
    });

    return {
      id: t.id,
      title: t.title,
      timeSlot: timeBadge,
      status,
      priority: t.priority as any,
    };
  });

  // Sort unified agenda items: pending items first, then by timeMins ascending
  items.sort((a, b) => {
    const aPending = a.status === 'pending';
    const bPending = b.status === 'pending';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return a.timeMins - b.timeMins;
  });

  const attendedClasses = classes.filter((c) => c.status === 'attended').length;
  const doneTasks = todayTasksList.filter((t) => t.status === 'completed').length;

  return {
    dateStr,
    displayDate,
    zenScore: Math.round(zenScore),
    streak: Math.round(streak || 0),
    isHoliday,
    items,
    classes,
    tasks: mappedTasks,
    totalClasses: classes.filter((c) => c.status !== 'cancelled').length,
    attendedClasses,
    totalTasks: todayTasksList.length,
    doneTasks,
    lastUpdated: Date.now(),
  };
}

/**
 * Saves widget data to AsyncStorage cache
 */
export async function saveCachedWidgetData(data: TodayAgendaWidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[WidgetSync] Failed to save widget cache:', e);
  }
}

/**
 * Reads widget data from AsyncStorage cache
 */
export async function getCachedWidgetData(): Promise<TodayAgendaWidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[WidgetSync] Failed to read widget cache:', e);
    return null;
  }
}

/**
 * Re-renders the native Android home screen widget with fresh data
 */
export async function updateTodayAgendaWidget(data?: TodayAgendaWidgetData | null): Promise<void> {
  try {
    const widgetData = data || (await getCachedWidgetData());
    await requestWidgetUpdate({
      widgetName: 'TodayAgenda',
      renderWidget: (props) =>
        React.createElement(TodayAgendaWidget, {
          data: widgetData,
          width: props?.width || 330,
          height: props?.height || 280,
        }),
      widgetNotFound: () => {},
    });
  } catch (e: any) {
    // Only log if not the expected unlinked warning in pre-rebuild dev environment
    if (!e?.message?.includes('not seem to be linked')) {
      console.warn('[WidgetSync] Failed to update Android widget:', e);
    }
  }
}

/**
 * Builds LiveWorkoutWidgetData from live application state, gym logs, and master split plan
 */
export function buildLiveWorkoutWidgetData({
  todayStr: customDateStr,
  gymLogs = [],
  userGymPlan = null,
}: {
  todayStr?: string;
  gymLogs?: any[];
  userGymPlan?: any;
}): LiveWorkoutWidgetData {
  const now = new Date();
  const dateStr = customDateStr || formatLocalDateStr(now);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIdx = now.getDay();
  const dayOfWeek = dayNames[dayIdx];
  const displayDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const planIdx = planDayIndexForDate(dateStr);
  const planDay = resolvePlanDay(userGymPlan, planIdx);

  const todayGym = (gymLogs || []).find((l: any) => l.date === dateStr);

  const isCompleted = !!(
    todayGym?.completed ||
    (todayGym?.workoutDurationMinutes && todayGym.workoutDurationMinutes > 0 && !todayGym?.isRestDay)
  );

  const isRestPlan = !planDay || planDay.isRest === true || planDay.name?.toLowerCase().includes('rest') || (Array.isArray(planDay.exercises) && planDay.exercises.length === 0);
  const isRestDay = !todayGym?.workoutStartTime && isRestPlan;

  const isActive = !!(todayGym?.workoutStartTime && !isCompleted && !todayGym?.isRestDay);

  const splitTitle = isRestDay
    ? 'Rest & Recovery'
    : todayGym?.dayPlanIndex !== undefined && todayGym.name
    ? todayGym.name
    : planDay?.name || 'Workout Session';

  const splitSubtitle = isRestDay
    ? 'Muscles grow while resting'
    : planDay?.focus || planDay?.subtitle || 'Target: Progressive Overload';

  // Determine exercises from active session logs or plan day templates
  let rawExercises: any[] = [];
  if (Array.isArray(todayGym?.exercises) && todayGym.exercises.length > 0) {
    rawExercises = todayGym.exercises;
  } else if (Array.isArray(planDay?.exercises) && planDay.exercises.length > 0) {
    rawExercises = planDay.exercises;
  }

  const allExercises = rawExercises.map((ex: any, idx: number) => {
    const rawSets = ex.setsLog || ex.sets;
    const targetSetsCount = Array.isArray(rawSets) && rawSets.length > 0
      ? rawSets.length
      : Number(ex.targetSets) || 3;
    const sets = Array.isArray(rawSets) && rawSets.length > 0
      ? rawSets.map((s: any, sIdx: number) => ({
          setNumber: sIdx + 1,
          weight: Number(s.weight) || Number(ex.targetWeight) || 20,
          reps: Number(s.reps) || Number(ex.targetReps) || 10,
          completed: Boolean(s.completed),
        }))
      : Array.from({ length: targetSetsCount }, (_, sIdx) => ({
          setNumber: sIdx + 1,
          weight: Number(ex.targetWeight) || 20,
          reps: Number(ex.targetReps) || 10,
          completed: false,
        }));

    const allSetsCompleted = sets.length > 0 && sets.every((s: any) => s.completed);

    return {
      id: ex.id || `ex-${idx}`,
      name: ex.name || 'Exercise',
      targetSets: targetSetsCount,
      targetWeight: Number(ex.targetWeight) || Number(sets[0]?.weight) || 20,
      targetReps: Number(ex.targetReps) || Number(sets[0]?.reps) || 10,
      completed: allSetsCompleted,
      sets,
    };
  });

  const totalExercises = allExercises.length;

  // Find active exercise index: first exercise that has uncompleted sets
  let currentExerciseIndex = 0;
  if (isActive && totalExercises > 0) {
    const uncompletedExIdx = allExercises.findIndex(ex => !ex.completed);
    currentExerciseIndex = uncompletedExIdx >= 0 ? uncompletedExIdx : totalExercises - 1;
  }

  const curExData = allExercises[currentExerciseIndex];
  let currentExercise: any = undefined;

  if (curExData) {
    const sets = curExData.sets || [];
    const uncompletedSetIdx = sets.findIndex((s: any) => !s.completed);
    const currentSetIndex = uncompletedSetIdx >= 0 ? uncompletedSetIdx : Math.max(0, sets.length - 1);
    const activeSet = sets[currentSetIndex];

    currentExercise = {
      id: curExData.id,
      name: curExData.name,
      targetSets: curExData.targetSets,
      currentSetIndex,
      sets,
      targetWeight: activeSet?.weight ?? curExData.targetWeight ?? 20,
      targetReps: activeSet?.reps ?? curExData.targetReps ?? 10,
    };
  }

  const nextExData = allExercises[currentExerciseIndex + 1];

  let completedSetsCount = 0;
  let totalSetsCount = 0;
  allExercises.forEach(ex => {
    totalSetsCount += ex.targetSets;
    if (ex.sets) {
      completedSetsCount += ex.sets.filter((s: any) => s.completed).length;
    }
  });

  let duration: number | undefined = todayGym?.workoutDurationMinutes;
  if (isActive && todayGym?.workoutStartTime) {
    duration = Math.max(1, Math.round((Date.now() - todayGym.workoutStartTime) / 60000));
  }

  const plannedExercisesPreview = allExercises.map(e => e.name).filter(Boolean);

  return {
    dateStr,
    dayName: dayOfWeek,
    displayDate,
    isActive,
    isCompleted,
    isRestDay,
    splitTitle,
    splitSubtitle,
    workoutDurationMinutes: duration,
    currentExerciseIndex,
    totalExercises,
    currentExercise,
    nextExerciseName: nextExData?.name,
    completedSetsCount,
    totalSetsCount,
    plannedExercisesPreview,
    allExercises,
    lastUpdated: Date.now(),
  };
}

/**
 * Saves Live Workout data to AsyncStorage cache
 */
export async function saveCachedLiveWorkoutData(data: LiveWorkoutWidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVE_WORKOUT_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[WidgetSync] Failed to save live workout cache:', e);
  }
}

/**
 * Reads Live Workout data from AsyncStorage cache
 */
export async function getCachedLiveWorkoutData(): Promise<LiveWorkoutWidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(LIVE_WORKOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[WidgetSync] Failed to read live workout cache:', e);
    return null;
  }
}

/**
 * Re-renders the Live Workout HUD widget with fresh data
 */
export async function updateLiveWorkoutWidget(data?: LiveWorkoutWidgetData | null): Promise<void> {
  try {
    const widgetData = data || (await getCachedLiveWorkoutData());
    await requestWidgetUpdate({
      widgetName: 'LiveWorkout',
      renderWidget: (props) =>
        React.createElement(LiveWorkoutWidget, {
          data: widgetData,
          width: props?.width || 330,
          height: props?.height || 280,
        }),
      widgetNotFound: () => {},
    });
  } catch (e: any) {
    if (!e?.message?.includes('not seem to be linked')) {
      console.warn('[WidgetSync] Failed to update LiveWorkout widget:', e);
    }
  }
}

/**
 * Handles headless background click actions from the Android Home Screen Widget
 */
export async function handleWidgetClickAction(payload: WidgetClickActionPayload): Promise<void> {
  const currentData = await getCachedWidgetData();
  const currentWorkout = await getCachedLiveWorkoutData();
  const user = auth.currentUser;
  const dateStr = payload.dateStr || new Date().toISOString().split('T')[0];

  switch (payload.action) {
    case 'mark_task_done': {
      if (!payload.taskId) return;
      const taskId = payload.taskId;
      if (user) {
        await safeUpdate(
          taskId,
          COLLECTION.TASKS,
          { status: 'completed', completedAt: new Date().toISOString() },
          () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'completed', completedAt: new Date().toISOString() })
        ).catch(() => {});
      }
      try {
        const coreCache = await readCoreCacheMulti();
        if (coreCache.tasks) {
          const updatedTasks = coreCache.tasks.map(t => t.id === taskId ? { ...t, status: 'completed' as const } : t);
          await writeCoreCacheMulti({ tasks: updatedTasks });
        }
      } catch {}

      if (currentData) {
        currentData.tasks = currentData.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'completed' } : t
        );
        currentData.items = currentData.items.map((item) =>
          item.id === taskId || item.taskId === taskId
            ? { ...item, status: 'completed' }
            : item
        );
        currentData.doneTasks = currentData.tasks.filter((t) => t.status === 'completed').length;
        await saveCachedWidgetData(currentData);
        await updateTodayAgendaWidget(currentData);
      }
      break;
    }

    case 'mark_task_undone': {
      if (!payload.taskId) return;
      const taskId = payload.taskId;
      if (user) {
        await safeUpdate(
          taskId,
          COLLECTION.TASKS,
          { status: 'pending', completedAt: null },
          () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'pending', completedAt: null as any })
        ).catch(() => {});
      }
      try {
        const coreCache = await readCoreCacheMulti();
        if (coreCache.tasks) {
          const updatedTasks = coreCache.tasks.map(t => t.id === taskId ? { ...t, status: 'pending' as const } : t);
          await writeCoreCacheMulti({ tasks: updatedTasks });
        }
      } catch {}

      if (currentData) {
        currentData.tasks = currentData.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'pending' } : t
        );
        currentData.items = currentData.items.map((item) =>
          item.id === taskId || item.taskId === taskId
            ? { ...item, status: 'pending' }
            : item
        );
        currentData.doneTasks = currentData.tasks.filter((t) => t.status === 'completed').length;
        await saveCachedWidgetData(currentData);
        await updateTodayAgendaWidget(currentData);
      }
      break;
    }

    case 'mark_class_present':
    case 'mark_class_absent': {
      if (!payload.subjectId) return;
      const status = payload.action === 'mark_class_present' ? 'attended' : 'missed';
      const sessionIdx = payload.sessionIdx ?? 0;
      const type: 'class' | 'lab' = payload.type || 'class';

      if (user) {
        const deterministicId = getScheduledAttendanceLogDocId(user.uid, payload.subjectId, dateStr, type, sessionIdx);
        const academicCache = await readAcademicCache();
        const subject = academicCache.attendance?.find(s => s.id === payload.subjectId);

        const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
        const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';

        const existingLog = academicCache.attendanceLogs?.find(l =>
          l.id === deterministicId ||
          (
            l.subjectId === payload.subjectId &&
            (l.date || '').slice(0, 10) === dateStr &&
            (l.type === type || (!l.type && type === 'class')) &&
            (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
          )
        );

        let subjectUpdates: any = null;
        if (subject) {
          let newAttended: number;
          let newTotal: number;
          if (existingLog) {
            const oldAction = existingLog.action;
            const oldAtt = oldAction === 'attended' ? 1 : 0;
            const newAtt = status === 'attended' ? 1 : 0;
            const oldTot = oldAction === 'cancelled' ? 0 : 1;
            const newTot = 1;
            newAttended = Math.max(0, (subject[attendedKey] || 0) + (newAtt - oldAtt));
            newTotal    = Math.max(0, (subject[totalKey]    || 0) + (newTot - oldTot));
          } else {
            newAttended = (subject[attendedKey] || 0) + (status === 'attended' ? 1 : 0);
            newTotal    = (subject[totalKey]    || 0) + 1;
          }
          subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal };
        }

        const targetLog = {
          id: deterministicId,
          userId: user.uid,
          subjectId: payload.subjectId,
          subjectName: subject?.name || payload.subjectName || '',
          type,
          action: status,
          status,
          date: dateStr,
          isExtra: false,
          timestamp: Date.now(),
          idx: sessionIdx,
        };

        // WhatsApp Pattern: write both subject counter and attendance log atomically
        await safeWrite(
          async () => {
            const batch = writeBatch(db);
            if (subject && subjectUpdates) {
              batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id), subjectUpdates);
            }
            batch.set(doc(db, COLLECTION.ATTENDANCE_LOGS, deterministicId), targetLog, { merge: true });
            await batch.commit();
          },
          COLLECTION.ATTENDANCE_LOGS,
          'set',
          targetLog,
          deterministicId
        ).catch(() => {});

        // Synchronize local academic cache immediately so AttendanceScreen updates without waiting for network
        const updatedLogs = [
          targetLog,
          ...(academicCache.attendanceLogs || []).filter(l => l.id !== deterministicId && !(l.subjectId === payload.subjectId && (l.date || '').slice(0, 10) === dateStr && l.idx === sessionIdx))
        ];
        const updatedSubjects = (academicCache.attendance || []).map(s =>
          s.id === payload.subjectId && subjectUpdates ? { ...s, ...subjectUpdates } : s
        );
        await writeAcademicCache({
          attendanceLogs: updatedLogs,
          attendance: updatedSubjects,
        }, true);

        if (status === 'attended') {
          awardXP('ATTENDANCE_LOG').catch(() => {});
        }
      }

      if (currentData) {
        // 1. Update the classes array (drives the spotlight)
        currentData.classes = currentData.classes.map((c) =>
          c.subjectId === payload.subjectId && c.idx === sessionIdx
            ? { ...c, status }
            : c
        );
        currentData.attendedClasses = currentData.classes.filter((c) => c.status === 'attended').length;

        // 2. ALSO update the items array (drives the schedule row list)
        currentData.items = currentData.items.map((item) =>
          (item.type === 'class' || item.type === 'lab') &&
          item.subjectId === payload.subjectId &&
          item.sessionIdx === sessionIdx
            ? { ...item, status }
            : item
        );

        await saveCachedWidgetData(currentData);
        await updateTodayAgendaWidget(currentData);
      }
      break;
    }

    // ── Live Workout Actions ──────────────────────────────────────────────────
    case 'start_workout_session': {
      const todayDateStr = payload.dateStr || formatLocalDateStr(new Date());
      const wellnessCache = await readWellnessCache();
      const planIdx = planDayIndexForDate(todayDateStr);
      const planDay = resolvePlanDay(wellnessCache.userGymPlan, planIdx);

      const initialExercises = (planDay.exercises || []).map((ex: any, idx: number) => ({
        id: ex.id || `ex-${idx}`,
        name: ex.name,
        targetSets: Number(ex.targetSets) || 3,
        targetWeight: Number(ex.targetWeight) || 20,
        targetReps: Number(ex.targetReps) || 10,
        setsLog: Array.from({ length: Number(ex.targetSets) || 3 }, (_, sIdx) => ({
          setNumber: sIdx + 1,
          weight: Number(ex.targetWeight) || 20,
          reps: Number(ex.targetReps) || 10,
          completed: false,
        })),
      }));

      const startTime = Date.now();
      const todayLog: any = {
        date: todayDateStr,
        workoutStartTime: startTime,
        completed: false,
        dayPlanIndex: planIdx,
        name: planDay.name || 'Workout Session',
        exercises: initialExercises,
        updatedAt: startTime,
      };

      if (user) {
        const docId = `${user.uid}_${todayDateStr}`;
        await safeWrite(
          () => setDoc(doc(db, COLLECTION.GYM_LOGS, docId), todayLog, { merge: true }),
          COLLECTION.GYM_LOGS,
          'set',
          todayLog,
          docId
        ).catch(() => {});
      }

      // Update local wellness cache immediately
      const existingLogs = wellnessCache.gymLogs || [];
      const updatedLogs = [todayLog, ...existingLogs.filter((l: any) => l.date !== todayDateStr)];
      await writeWellnessCache({ gymLogs: updatedLogs }, true);

      await AsyncStorage.setItem('@zentrack_active_workout_state', JSON.stringify({
        date: todayDateStr,
        workoutStartTime: startTime,
        dayPlanIndex: planIdx,
      })).catch(() => {});

      const newWidgetData = buildLiveWorkoutWidgetData({
        todayStr: todayDateStr,
        gymLogs: updatedLogs,
        userGymPlan: wellnessCache.userGymPlan,
      });

      await saveCachedLiveWorkoutData(newWidgetData);
      await updateLiveWorkoutWidget(newWidgetData);
      break;
    }

    case 'log_workout_set': {
      if (!currentWorkout || !currentWorkout.currentExercise) return;
      const ex = currentWorkout.currentExercise;
      const setIdx = payload.setIndex ?? ex.currentSetIndex;

      if (ex.sets && ex.sets[setIdx]) {
        ex.sets[setIdx].completed = true;
        if (payload.weight) ex.sets[setIdx].weight = payload.weight;
        if (payload.reps) ex.sets[setIdx].reps = payload.reps;
      }

      currentWorkout.completedSetsCount += 1;

      // Also update in allExercises if present
      if (currentWorkout.allExercises && currentWorkout.allExercises[currentWorkout.currentExerciseIndex]) {
        const activeExEntry = currentWorkout.allExercises[currentWorkout.currentExerciseIndex];
        if (activeExEntry.sets && activeExEntry.sets[setIdx]) {
          activeExEntry.sets[setIdx].completed = true;
          if (payload.weight) activeExEntry.sets[setIdx].weight = payload.weight;
          if (payload.reps) activeExEntry.sets[setIdx].reps = payload.reps;
        }
      }

      const loggedWeight = payload.weight ?? ex.sets?.[setIdx]?.weight ?? 20;
      const loggedReps = payload.reps ?? ex.sets?.[setIdx]?.reps ?? 10;

      const isCurrentExDone = setIdx + 1 >= ex.targetSets;
      const isLastExercise = currentWorkout.currentExerciseIndex + 1 >= currentWorkout.totalExercises;

      if (!isCurrentExDone) {
        // Advance to next set of current exercise and carry forward the logged weight
        ex.currentSetIndex = setIdx + 1;
        if (ex.sets && ex.sets[setIdx + 1] && !ex.sets[setIdx + 1].completed) {
          ex.sets[setIdx + 1].weight = loggedWeight;
        }
        ex.targetWeight = loggedWeight;
      } else if (!isLastExercise) {
        // Current exercise done, advance to next exercise
        currentWorkout.currentExerciseIndex += 1;
        const nextExEntry = currentWorkout.allExercises?.[currentWorkout.currentExerciseIndex];
        if (nextExEntry) {
          ex.id = nextExEntry.id;
          ex.name = nextExEntry.name;
          ex.targetSets = nextExEntry.targetSets;
          ex.currentSetIndex = 0;
          ex.sets = nextExEntry.sets || Array.from({ length: nextExEntry.targetSets }, (_, i) => ({
            setNumber: i + 1,
            weight: nextExEntry.targetWeight || 20,
            reps: nextExEntry.targetReps || 10,
            completed: false,
          }));
          ex.targetWeight = nextExEntry.targetWeight || 20;
          ex.targetReps = nextExEntry.targetReps || 10;
        }
        const afterNext = currentWorkout.allExercises?.[currentWorkout.currentExerciseIndex + 1];
        currentWorkout.nextExerciseName = afterNext?.name;
      } else {
        // Last set of last exercise finished -> WORKOUT COMPLETED!
        currentWorkout.isActive = false;
        currentWorkout.isCompleted = true;
        const startMs = (currentWorkout as any).workoutStartTime || (Date.now() - 40 * 60000);
        const durationMins = Math.max(1, Math.round((Date.now() - startMs) / 60000));
        currentWorkout.workoutDurationMinutes = durationMins;

        awardXP('GYM_SESSION').catch(() => {});
        dismissActiveWorkoutNotification().catch(() => {});

        if (user) {
          const docId = `${user.uid}_${dateStr}`;
          await safeWrite(
            () => updateDoc(doc(db, COLLECTION.GYM_LOGS, docId), {
              completed: true,
              workoutDurationMinutes: durationMins,
              updatedAt: Date.now(),
            }),
            COLLECTION.GYM_LOGS,
            'update',
            { completed: true, workoutDurationMinutes: durationMins, updatedAt: Date.now() },
            docId
          ).catch(() => {});
        }

        await AsyncStorage.setItem(`@gym_active_session_${dateStr}`, JSON.stringify({
          date: dateStr,
          completed: true,
          updatedAt: Date.now(),
        })).catch(() => {});
        await AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
      }

      // Persist workout set to Firestore and local wellnessCache immediately
      try {
        const wellnessCache = await readWellnessCache();
        const existingLogs = wellnessCache.gymLogs || [];
        let todayLog = existingLogs.find((l: any) => l.date === dateStr);

        if (!todayLog) {
          const planIdx = planDayIndexForDate(dateStr);
          const planDay = resolvePlanDay(wellnessCache.userGymPlan, planIdx);
          todayLog = {
            date: dateStr,
            workoutStartTime: (currentWorkout as any).workoutStartTime || Date.now(),
            completed: false,
            dayPlanIndex: planIdx,
            name: planDay?.name || 'Workout Session',
            exercises: [],
            updatedAt: Date.now(),
          };
        }

        const curExName = ex.name;
        let targetExLog = (todayLog.exercises || []).find((e: any) => e.name === curExName || e.id === ex.id);
        if (!targetExLog) {
          targetExLog = {
            id: ex.id,
            name: curExName,
            targetSets: ex.targetSets,
            targetReps: String(ex.targetReps || 10),
            setsLog: [],
          };
          todayLog.exercises = [...(todayLog.exercises || []), targetExLog];
        }

        if (!Array.isArray(targetExLog.setsLog)) targetExLog.setsLog = [];
        targetExLog.setsLog[setIdx] = {
          setNumber: setIdx + 1,
          weight: loggedWeight,
          reps: loggedReps,
          completed: true,
        };

        // Carry forward logged weight to any uncompleted subsequent sets in this exercise
        for (let nextIdx = setIdx + 1; nextIdx < targetExLog.targetSets; nextIdx++) {
          if (targetExLog.setsLog[nextIdx]) {
            if (!targetExLog.setsLog[nextIdx].completed) {
              targetExLog.setsLog[nextIdx].weight = loggedWeight;
            }
          } else {
            targetExLog.setsLog[nextIdx] = {
              setNumber: nextIdx + 1,
              weight: loggedWeight,
              reps: loggedReps,
              completed: false,
            };
          }
        }

        if (isCurrentExDone && isLastExercise) {
          todayLog.completed = true;
          todayLog.workoutDurationMinutes = currentWorkout.workoutDurationMinutes || 45;
        }

        todayLog.updatedAt = Date.now();
        const updatedLogs = [todayLog, ...existingLogs.filter((l: any) => l.date !== dateStr)];
        await writeWellnessCache({ gymLogs: updatedLogs }, true);

        if (user) {
          const docId = `${user.uid}_${dateStr}`;
          await safeWrite(
            () => setDoc(doc(db, COLLECTION.GYM_LOGS, docId), todayLog, { merge: true }),
            COLLECTION.GYM_LOGS,
            'set',
            todayLog,
            docId
          ).catch(() => {});
        }
      } catch (err) {
        console.warn('[WidgetSync] Failed to persist workout set to gymLogs:', err);
      }

      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    case 'adjust_workout_weight': {
      if (!currentWorkout || !currentWorkout.currentExercise) return;
      const ex = currentWorkout.currentExercise;
      const setIdx = payload.setIndex ?? ex.currentSetIndex;
      const delta = payload.weightDelta || 0;

      if (ex.sets && ex.sets[setIdx]) {
        ex.sets[setIdx].weight = Math.max(0, Math.round(((ex.sets[setIdx].weight || 20) + delta) * 10) / 10);
      }
      if (ex.targetWeight !== undefined) {
        ex.targetWeight = Math.max(0, Math.round((ex.targetWeight + delta) * 10) / 10);
      }

      // Persist adjusted weight to local wellness cache and Firestore
      try {
        const wellnessCache = await readWellnessCache();
        const existingLogs = wellnessCache.gymLogs || [];
        const todayLog = existingLogs.find((l: any) => l.date === dateStr);
        if (todayLog && todayLog.exercises) {
          const targetExLog = todayLog.exercises.find((e: any) => e.name === ex.name || e.id === ex.id);
          if (targetExLog && targetExLog.setsLog && targetExLog.setsLog[setIdx]) {
            targetExLog.setsLog[setIdx].weight = ex.sets[setIdx].weight;
            todayLog.updatedAt = Date.now();
            await writeWellnessCache({ gymLogs: existingLogs }, true);
            if (user) {
              const docId = `${user.uid}_${dateStr}`;
              safeWrite(
                () => updateDoc(doc(db, COLLECTION.GYM_LOGS, docId), { exercises: todayLog.exercises, updatedAt: Date.now() }),
                COLLECTION.GYM_LOGS,
                'update',
                { exercises: todayLog.exercises, updatedAt: Date.now() },
                docId
              ).catch(() => {});
            }
          }
        }
      } catch {}

      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    case 'next_workout_exercise': {
      if (!currentWorkout) return;
      const isLastExercise = currentWorkout.currentExerciseIndex + 1 >= currentWorkout.totalExercises;

      if (!isLastExercise) {
        currentWorkout.currentExerciseIndex += 1;
        const nextExEntry = currentWorkout.allExercises?.[currentWorkout.currentExerciseIndex];
        if (nextExEntry && currentWorkout.currentExercise) {
          currentWorkout.currentExercise.id = nextExEntry.id;
          currentWorkout.currentExercise.name = nextExEntry.name;
          currentWorkout.currentExercise.targetSets = nextExEntry.targetSets;
          currentWorkout.currentExercise.currentSetIndex = 0;
          currentWorkout.currentExercise.sets = nextExEntry.sets || Array.from({ length: nextExEntry.targetSets }, (_, i) => ({
            setNumber: i + 1,
            weight: nextExEntry.targetWeight || 20,
            reps: nextExEntry.targetReps || 10,
            completed: false,
          }));
          currentWorkout.currentExercise.targetWeight = nextExEntry.targetWeight || 20;
          currentWorkout.currentExercise.targetReps = nextExEntry.targetReps || 10;
        }
        const afterNext = currentWorkout.allExercises?.[currentWorkout.currentExerciseIndex + 1];
        currentWorkout.nextExerciseName = afterNext?.name;
      } else {
        // Last exercise skipped -> complete session
        currentWorkout.isActive = false;
        currentWorkout.isCompleted = true;
        const durationMins = Math.max(1, Math.round((Date.now() - ((currentWorkout as any).workoutStartTime || Date.now())) / 60000));
        currentWorkout.workoutDurationMinutes = durationMins;
        awardXP('GYM_SESSION').catch(() => {});
        dismissActiveWorkoutNotification().catch(() => {});
      }

      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    case 'finish_workout_session': {
      if (!currentWorkout) return;
      currentWorkout.isActive = false;
      currentWorkout.isCompleted = true;
      const startMs = (currentWorkout as any).workoutStartTime || (Date.now() - 35 * 60000);
      const durationMins = Math.max(1, Math.round((Date.now() - startMs) / 60000));
      currentWorkout.workoutDurationMinutes = durationMins;

      awardXP('GYM_SESSION').catch(() => {});
      dismissActiveWorkoutNotification().catch(() => {});

      if (user) {
        const docId = `${user.uid}_${dateStr}`;
        await safeWrite(
          () => updateDoc(doc(db, COLLECTION.GYM_LOGS, docId), {
            completed: true,
            workoutDurationMinutes: durationMins,
            updatedAt: Date.now(),
          }),
          COLLECTION.GYM_LOGS,
          'update',
          { completed: true, workoutDurationMinutes: durationMins, updatedAt: Date.now() },
          docId
        ).catch(() => {});
      }

      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    default:
      break;
  }
}
