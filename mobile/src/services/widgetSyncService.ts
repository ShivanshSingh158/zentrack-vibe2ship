/**
 * widgetSyncService.ts — ZenTrack Android Home Screen Widget Synchronization Engine
 * Handles data aggregation, caching, background widget re-rendering, and interactive actions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import React from 'react';
import { TodayAgendaWidget } from '../widgets/TodayAgendaWidget';
import { 
  TodayAgendaWidgetData, 
  WidgetAgendaClass, 
  WidgetAgendaTask, 
  WidgetClickActionPayload 
} from '../types/widget.types';
import type { Task, AttendanceSubject, AttendanceLog } from '../contexts/MobileDataContext';
import { safeUpdate, safeAdd } from '../utils/safeWrite';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

const WIDGET_STORAGE_KEY = '@zentrack_widget_agenda_data';

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
  const todayLogs = attendanceLogs.filter((l) => l.date === dateStr);

  subjects.forEach((subj) => {
    const slots = (subj as any).schedule?.[dayOfWeek] || (subj as any).timetable?.[dayOfWeek] || [];
    slots.forEach((slot: any, idx: number) => {
      const isLab = slot.isLab || slot.type === 'lab';
      const log = todayLogs.find(
        (l) => l.subjectId === subj.id && (l.idx === idx || (l as any).sessionIdx === idx)
      );

      const status: 'attended' | 'missed' | 'pending' = log
        ? (log.action === 'attended' ? 'attended' : log.action === 'missed' ? 'missed' : 'pending')
        : 'pending';

      classes.push({
        id: `${subj.id}_${idx}`,
        subjectId: subj.id,
        subjectName: subj.name,
        time: slot.time || 'Class',
        room: slot.room,
        type: isLab ? 'lab' : 'class',
        status,
        idx,
      });
    });
  });

  // Sort classes by time
  classes.sort((a, b) => a.time.localeCompare(b.time));

  // 2. Build today's tasks
  const todayTasks: WidgetAgendaTask[] = tasks
    .filter((t) => !t.date || t.date === dateStr || t.status === 'pending')
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: t.title,
      timeSlot: (t as any).timeSlot || (t as any).dueTime,
      status: t.status === 'completed' ? 'completed' : 'pending',
      priority: t.priority as any,
    }));

  const attendedClasses = classes.filter((c) => c.status === 'attended').length;
  const doneTasks = todayTasks.filter((t) => t.status === 'completed').length;

  return {
    dateStr,
    displayDate,
    zenScore: Math.round(zenScore),
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
 * Handles headless background click actions from the Android Home Screen Widget
 */
export async function handleWidgetClickAction(payload: WidgetClickActionPayload): Promise<void> {
  const currentData = await getCachedWidgetData();
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

    default:
      break;
  }
}
