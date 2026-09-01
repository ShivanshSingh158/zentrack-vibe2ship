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
import { safeUpdate, safeAdd } from '../utils/safeWrite';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

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
 * Builds TodayAgendaWidgetData from live application state
 */
export function buildTodayAgendaData({
  tasks = [],
  subjects = [],
  attendanceLogs = [],
  zenScore = 85,
}: {
  tasks?: Task[];
  subjects?: AttendanceSubject[];
  attendanceLogs?: AttendanceLog[];
  zenScore?: number;
}): TodayAgendaWidgetData {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[now.getDay()];

  const displayDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // 1. Build today's classes
  const classes: WidgetAgendaClass[] = [];
  const items: any[] = [];
  const todayLogs = attendanceLogs.filter((l) => l.date === dateStr);

  subjects.forEach((subj) => {
    const slots = (subj as any).schedule?.[dayOfWeek] || (subj as any).timetable?.[dayOfWeek] || [];
    slots.forEach((slot: any, idx: number) => {
      const isLab = slot.isLab || slot.type === 'lab';
      const log = todayLogs.find(
        (l) => l.subjectId === subj.id && (l.idx === idx || (l as any).sessionIdx === idx)
      );

      const status: 'attended' | 'missed' | 'cancelled' | 'pending' = log
        ? (log.action === 'attended' ? 'attended' : log.action === 'missed' ? 'missed' : log.action === 'cancelled' ? 'cancelled' : 'pending')
        : 'pending';

      const timeMins = parseTimeToMins(slot.time);

      classes.push({
        id: `${subj.id}_${idx}`,
        subjectId: subj.id,
        subjectName: subj.name,
        time: slot.time || 'Class',
        room: slot.room,
        type: isLab ? 'lab' : 'class',
        status: status === 'cancelled' ? 'pending' : status,
        idx,
      });

      items.push({
        id: `${subj.id}_${idx}`,
        type: isLab ? 'lab' : 'class',
        title: subj.name,
        subtitle: slot.room ? `[${slot.room}]` : isLab ? 'Lab' : 'Class',
        timeStr: slot.time || 'Class',
        timeMins,
        status,
        subjectId: subj.id,
        subjectName: subj.name,
        sessionIdx: idx,
      });
    });
  });

  // Sort classes by time
  classes.sort((a, b) => parseTimeToMins(a.time) - parseTimeToMins(b.time));

  // 2. Build today's tasks
  const todayTasks: WidgetAgendaTask[] = tasks
    .filter((t) => !t.date || t.date === dateStr || t.status === 'pending')
    .slice(0, 10)
    .map((t) => {
      const timeStr = (t as any).timeSlot || (t as any).dueTime || '';
      const timeMins = timeStr ? parseTimeToMins(timeStr) : 1439; // default end of day
      const status: 'completed' | 'pending' = t.status === 'completed' ? 'completed' : 'pending';

      items.push({
        id: t.id,
        type: 'task',
        title: t.title,
        subtitle: 'Task',
        timeStr: timeStr || 'Today',
        timeMins,
        status,
        taskId: t.id,
      });

      return {
        id: t.id,
        title: t.title,
        timeSlot: timeStr,
        status,
        priority: t.priority as any,
      };
    });

  // Sort unified agenda items chronologically by time
  items.sort((a, b) => a.timeMins - b.timeMins);

  const attendedClasses = classes.filter((c) => c.status === 'attended').length;
  const doneTasks = todayTasks.filter((t) => t.status === 'completed').length;

  return {
    dateStr,
    displayDate,
    zenScore: Math.round(zenScore),
    items,
    classes,
    tasks: todayTasks,
    totalClasses: classes.length,
    attendedClasses,
    totalTasks: todayTasks.length,
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
      renderWidget: () => React.createElement(TodayAgendaWidget, { data: widgetData }),
      widgetNotFound: () => {
        // Widget is not placed on the user's home screen yet; silently ignore
      },
    });
  } catch (e) {
    console.warn('[WidgetSync] Failed to update Android widget:', e);
  }
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
      renderWidget: () => React.createElement(LiveWorkoutWidget, { data: widgetData }),
      widgetNotFound: () => {},
    });
  } catch (e) {
    console.warn('[WidgetSync] Failed to update LiveWorkout widget:', e);
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
      if (user) {
        const taskId = payload.taskId;
        await safeUpdate(
          taskId,
          COLLECTION.TASKS,
          { status: 'completed', completedAt: new Date().toISOString() },
          () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'completed', completedAt: new Date().toISOString() })
        ).catch(() => {});
      }
      if (currentData) {
        currentData.tasks = currentData.tasks.map((t) =>
          t.id === payload.taskId ? { ...t, status: 'completed' } : t
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

      if (user) {
        const logData = {
          userId: user.uid,
          subjectId: payload.subjectId,
          subjectName: payload.subjectName || '',
          date: dateStr,
          action: status,
          status,
          sessionIdx,
          type: payload.type || 'class',
          timestamp: new Date().toISOString(),
        };
        await safeAdd(
          COLLECTION.ATTENDANCE_LOGS,
          logData,
          () => addDoc(collection(db, COLLECTION.ATTENDANCE_LOGS), logData)
        ).catch(() => {});
      }

      if (currentData) {
        currentData.classes = currentData.classes.map((c) =>
          c.subjectId === payload.subjectId && c.idx === sessionIdx
            ? { ...c, status }
            : c
        );
        currentData.attendedClasses = currentData.classes.filter((c) => c.status === 'attended').length;
        await saveCachedWidgetData(currentData);
        await updateTodayAgendaWidget(currentData);
      }
      break;
    }

    // ── Live Workout Actions ──────────────────────────────────────────────────
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

      // Advance to next set or next exercise
      if (setIdx + 1 < ex.targetSets) {
        ex.currentSetIndex = setIdx + 1;
      } else {
        // All sets for this exercise completed
        currentWorkout.currentExerciseIndex += 1;
        ex.currentSetIndex = ex.targetSets - 1;
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

      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    case 'next_workout_exercise': {
      if (!currentWorkout) return;
      currentWorkout.currentExerciseIndex += 1;
      currentWorkout.lastUpdated = Date.now();
      await saveCachedLiveWorkoutData(currentWorkout);
      await updateLiveWorkoutWidget(currentWorkout);
      break;
    }

    default:
      break;
  }
}
