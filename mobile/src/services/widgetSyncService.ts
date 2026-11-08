/**
 * widgetSyncService.ts — ZenTrack Android Home Screen Widget Synchronization Engine
 * Handles data aggregation, caching, background widget re-rendering, and interactive actions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { TodayAgendaWidget } from '../widgets/TodayAgendaWidget';
import { 
  TodayAgendaWidgetData, 
  WidgetAgendaClass, 
  WidgetAgendaTask, 
  WidgetClickActionPayload,
  } from '../types/widget.types';
import type { Task, AttendanceSubject, AttendanceLog } from '../contexts/MobileDataContext';
import { safeUpdate, safeAdd, safeWrite } from '../utils/safeWrite';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { doc, updateDoc, collection, addDoc, writeBatch, setDoc, increment } from 'firebase/firestore';
import { getScheduledAttendanceLogDocId } from '../screens/attendance/attendanceConstants';
import { readAcademicCache, writeAcademicCache, readWellnessCache, writeWellnessCache } from '../utils/domainCache';
import { formatLocalDateStr } from '../utils/dateUtils';
import { readCoreCacheMulti, writeCoreCacheMulti } from '../utils/coreCache';
import { updateL1Cache, getBootManifestSync } from '../utils/bootManifest';
import { awardXP } from './xpSystem';
import { cancelClassNotificationsImmediately, clearScheduleCache } from './notifications';

const WIDGET_STORAGE_KEY = '@zentrack_widget_agenda_data';

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
  const rangeMatch = trimmed.search(/[-–—•]| to /i);
  if (rangeMatch !== -1) {
    const rawParts = trimmed.split(/[-–—•]| to /i).map(s => s.trim()).filter(Boolean);
    const formatted = rawParts.map(p => formatSingleWidgetTime(p));
    const deduped: string[] = [];
    for (const p of formatted) {
      if (deduped.length === 0 || deduped[deduped.length - 1].toLowerCase() !== p.toLowerCase()) {
        deduped.push(p);
      }
    }
    if (deduped.length === 1) return deduped[0];
    if (deduped.length > 2) return `${deduped[0]} - ${deduped[deduped.length - 1]}`;
    return `${deduped[0]} - ${deduped[1]}`;
  }
  return formatSingleWidgetTime(trimmed);
}

function formatSingleWidgetTime(trimmed: string): string {
  if (!trimmed) return '';
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
            idx: i,
            time: session?.time || session?.slot || '',
            room: session?.room,
          });
        }
      }

      classSlots.forEach((slot: any, slotIdx: number) => {
        const isLab = slot.isLab || slot.type === 'lab';
        const sessionIdx = slot.idx ?? slotIdx;
        const log = todayLogs.find(
          (l) => (l.subjectId === subj.id || (subj.name && l.subjectName === subj.name)) &&
            (l.type === (isLab ? 'lab' : 'class') || (!l.type && !isLab)) &&
            ((l as any).sessionIdx === sessionIdx || (l as any).idx === sessionIdx)
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
          id: `${subj.id}_${isLab ? 'lab' : 'class'}_${sessionIdx}`,
          subjectId: subj.id,
          subjectName: subj.name,
          time: sessionLabel,
          room: slot.room,
          type: isLab ? 'lab' : 'class',
          status,
          idx: sessionIdx,
        });

        items.push({
          id: `${subj.id}_${isLab ? 'lab' : 'class'}_${sessionIdx}`,
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

let _memoryCachedAgendaData: TodayAgendaWidgetData | null = null;
/**
 * Saves widget data to AsyncStorage cache and fast in-memory L1
 */
export async function saveCachedWidgetData(data: TodayAgendaWidgetData): Promise<void> {
  _memoryCachedAgendaData = data;
  try {
    await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[WidgetSync] Failed to save widget cache:', e);
  }
}

/**
 * Reads widget data from fast in-memory L1 or AsyncStorage cache (0ms when cached)
 */
export async function getCachedWidgetData(): Promise<TodayAgendaWidgetData | null> {
  if (_memoryCachedAgendaData) return _memoryCachedAgendaData;
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    _memoryCachedAgendaData = parsed;
    return parsed;
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
 * Handles headless background click actions from the Android Home Screen Widget
 * Implements Instant Zero-Latency Optimistic UI Updates (<20ms) and non-blocking background cloud sync.
 */

async function resolveUser(): Promise<any> {
  let user = auth.currentUser;
  if (user) return user;

  const manifest = getBootManifestSync();
  if (manifest?.optimisticUser) {
    return manifest.optimisticUser;
  }

  try {
    const raw = await AsyncStorage.getItem('@zentrack_optimistic_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.uid) return parsed;
    }
  } catch {}

  if ((auth as any).authStateReady) {
    try {
      await Promise.race([
        (auth as any).authStateReady(),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      user = auth.currentUser;
      if (user) return user;
    } catch {}
  }

  return null;
}

export async function handleWidgetClickAction(
  payload: WidgetClickActionPayload,
  taskProps?: any
): Promise<void> {
  const currentData = await getCachedWidgetData();
  const user = await resolveUser();
  const dateStr = (payload.dateStr && payload.dateStr.trim().length >= 10)
    ? payload.dateStr.trim().slice(0, 10)
    : formatLocalDateStr(new Date());

  // Helper for immediate zero-latency RemoteViews repaint (0ms - 20ms)
  const triggerInstantAgendaUpdate = (data: TodayAgendaWidgetData) => {
    saveCachedWidgetData(data).catch(() => {});
    if (taskProps?.renderWidget && taskProps?.widgetInfo?.widgetName === 'TodayAgenda') {
      try {
        taskProps.renderWidget(
          React.createElement(TodayAgendaWidget, {
            data,
            width: taskProps.widgetInfo.width,
            height: taskProps.widgetInfo.height,
          })
        );
      } catch {}
    }
    updateTodayAgendaWidget(data).catch(() => {});
  };

  switch (payload.action) {
    case 'mark_task_done': {
      if (!payload.taskId) return;
      const taskId = payload.taskId;

      // ── STEP 1: INSTANT OPTIMISTIC RE-RENDER (0ms - 20ms) ──────────
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
        triggerInstantAgendaUpdate(currentData);
      }

      // ── STEP 2: ASYNC CLOUD & LOCAL CACHE PERSISTENCE (NON-BLOCKING) ──────
      (async () => {
        try {
          const todayLocal = formatLocalDateStr(new Date());
          const coreCache = await readCoreCacheMulti();
          if (coreCache.tasks) {
            const updatedTasks = coreCache.tasks.map(t =>
              t.id === taskId ? { ...t, status: 'completed' as const, completedAt: todayLocal } : t
            );
            await writeCoreCacheMulti({ tasks: updatedTasks }, true);
            updateL1Cache('tasks', updatedTasks);
          }
          const resolvedUsr = await resolveUser();
          if (resolvedUsr) {
            await safeUpdate(
              taskId,
              COLLECTION.TASKS,
              { status: 'completed', completedAt: todayLocal },
              () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'completed', completedAt: todayLocal })
            );
            awardXP('TASK_COMPLETE').catch(() => {});
          }
        } catch (e) {
          console.warn('[WidgetSync] Background task save failed:', e);
        }
      })();
      break;
    }

    case 'mark_task_undone': {
      if (!payload.taskId) return;
      const taskId = payload.taskId;

      // ── STEP 1: INSTANT OPTIMISTIC RE-RENDER (0ms - 20ms) ──────────
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
        triggerInstantAgendaUpdate(currentData);
      }

      // ── STEP 2: ASYNC CLOUD & LOCAL CACHE PERSISTENCE (NON-BLOCKING) ──────
      (async () => {
        try {
          const coreCache = await readCoreCacheMulti();
          if (coreCache.tasks) {
            const updatedTasks = coreCache.tasks.map(t =>
              t.id === taskId ? { ...t, status: 'pending' as const, completedAt: null } : t
            );
            await writeCoreCacheMulti({ tasks: updatedTasks }, true);
            updateL1Cache('tasks', updatedTasks);
          }
          const resolvedUsr = await resolveUser();
          if (resolvedUsr) {
            await safeUpdate(
              taskId,
              COLLECTION.TASKS,
              { status: 'pending', completedAt: null },
              () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'pending', completedAt: null as any })
            );
          }
        } catch (e) {
          console.warn('[WidgetSync] Background task undo failed:', e);
        }
      })();
      break;
    }

    case 'mark_class_present':
    case 'mark_class_absent': {
      const subjectId = payload.subjectId;
      if (!subjectId) return;
      const status = payload.action === 'mark_class_present' ? 'attended' : 'missed';
      const sessionIdx = typeof payload.sessionIdx === 'number' ? payload.sessionIdx : 0;
      const type: 'class' | 'lab' = payload.type === 'lab' ? 'lab' : 'class';

      // ── STEP 1: INSTANT OPTIMISTIC RE-RENDER (0ms - 20ms) ──────────
      if (currentData) {
        currentData.classes = currentData.classes.map((c) =>
          c.subjectId === payload.subjectId && c.type === type && c.idx === sessionIdx
            ? { ...c, status }
            : c
        );
        currentData.attendedClasses = currentData.classes.filter((c) => c.status === 'attended').length;
        currentData.items = currentData.items.map((item) =>
          item.type === type &&
          item.subjectId === payload.subjectId &&
          item.sessionIdx === sessionIdx
            ? { ...item, status }
            : item
        );
        triggerInstantAgendaUpdate(currentData);
      }

      // ── STEP 2: ASYNC CLOUD & LOCAL CACHE PERSISTENCE (NON-BLOCKING) ──────
      (async () => {
        try {
          const user = await resolveUser();
          if (!user) return;

          const deterministicId = getScheduledAttendanceLogDocId(user.uid, subjectId, dateStr, type, sessionIdx);
          const academicCache = await readAcademicCache();
          const subject = academicCache.attendance?.find(s => s.id === payload.subjectId || (payload.subjectName && s.name === payload.subjectName));

          const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
          const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';

          const existingLog = academicCache.attendanceLogs?.find(l =>
            l.id === deterministicId ||
            (
              (l.subjectId === payload.subjectId || (payload.subjectName && l.subjectName === payload.subjectName)) &&
              (l.date || '').slice(0, 10) === dateStr &&
              (l.type === type || (!l.type && type === 'class')) &&
              (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
            )
          );

          if (existingLog && (existingLog.action === status || (existingLog.action as any) === (status === 'attended' ? 'present' : 'absent'))) {
            return;
          }

          let subjectUpdates: any = null;
          let atomicSubjectUpdates: any = null;
          let offlineSubjectUpdates: any = null;
          if (subject) {
            let newAttended: number;
            let newTotal: number;
            let attDelta = 0;
            let totDelta = 0;
            if (existingLog) {
              const oldAction = existingLog.action;
              const oldAtt = oldAction === 'attended' ? 1 : 0;
              const newAtt = status === 'attended' ? 1 : 0;
              const oldTot = oldAction === 'cancelled' ? 0 : 1;
              const newTot = 1;
              attDelta = newAtt - oldAtt;
              totDelta = newTot - oldTot;
              newAttended = Math.max(0, (subject[attendedKey] || 0) + attDelta);
              newTotal    = Math.max(0, (subject[totalKey]    || 0) + totDelta);
            } else {
              attDelta = status === 'attended' ? 1 : 0;
              totDelta = 1;
              newAttended = (subject[attendedKey] || 0) + attDelta;
              newTotal    = (subject[totalKey]    || 0) + totDelta;
            }
            subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal };
            atomicSubjectUpdates = { lastUpdated: Date.now() };
            offlineSubjectUpdates = { lastUpdated: Date.now() };
            if (attDelta !== 0) {
              atomicSubjectUpdates[attendedKey] = increment(attDelta);
              offlineSubjectUpdates[attendedKey] = { __zentrackIncrement: attDelta };
            }
            if (totDelta !== 0) {
              atomicSubjectUpdates[totalKey] = increment(totDelta);
              offlineSubjectUpdates[totalKey] = { __zentrackIncrement: totDelta };
            }
          }

          const targetLog = {
            id: deterministicId,
            userId: user.uid,
            subjectId: subject?.id || payload.subjectId,
            subjectName: subject?.name || payload.subjectName || '',
            type,
            action: status,
            status,
            date: dateStr,
            isExtra: false,
            timestamp: Date.now(),
            idx: sessionIdx,
          };

          if (subject && subjectUpdates) {
            await safeUpdate(
              subject.id,
              COLLECTION.ATTENDANCE,
              offlineSubjectUpdates,
              () => updateDoc(doc(db, COLLECTION.ATTENDANCE, subject.id), atomicSubjectUpdates)
            ).catch(() => {});
          }
          await safeWrite(
            () => setDoc(doc(db, COLLECTION.ATTENDANCE_LOGS, deterministicId), targetLog, { merge: true }),
            COLLECTION.ATTENDANCE_LOGS,
            'set',
            targetLog,
            deterministicId
          ).catch(() => {});

          const updatedLogs = [
            targetLog,
            ...(academicCache.attendanceLogs || []).filter(l =>
              l.id !== deterministicId &&
              !(
                (l.subjectId === payload.subjectId || (payload.subjectName && l.subjectName === payload.subjectName)) &&
                (l.date || '').slice(0, 10) === dateStr &&
                (l.type === type || (!l.type && type === 'class')) &&
                (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
              )
            )
          ];
          const updatedSubjects = (academicCache.attendance || []).map(s =>
            s.id === payload.subjectId && subjectUpdates ? { ...s, ...subjectUpdates } : s
          );
          await writeAcademicCache({
            attendanceLogs: updatedLogs,
            attendance: updatedSubjects,
          }, true);
          updateL1Cache('attendanceLogs', updatedLogs);
          updateL1Cache('attendance', updatedSubjects);

          DeviceEventEmitter.emit('attendance_logged_from_widget', {
            log: targetLog,
            subjectUpdates,
            subjectId: payload.subjectId,
            deterministicId,
          });

          if (status === 'attended') {
            awardXP('ATTENDANCE_LOG').catch(() => {});
          }

          if (payload.subjectId || payload.subjectName) {
            cancelClassNotificationsImmediately(payload.subjectId, payload.subjectName, dateStr, sessionIdx).catch(() => {});
          }
          clearScheduleCache();
        } catch (e) {
          console.warn('[WidgetSync] Background attendance save error:', e);
        }
      })();
      break;
    }

    case 'mark_class_undo': {
      const subjectId = payload.subjectId;
      if (!subjectId) return;
      const sessionIdx = typeof payload.sessionIdx === 'number' ? payload.sessionIdx : 0;
      const type: 'class' | 'lab' = payload.type === 'lab' ? 'lab' : 'class';

      // ── STEP 1: INSTANT OPTIMISTIC RE-RENDER (0ms - 20ms) ──────────
      if (currentData) {
        currentData.classes = currentData.classes.map((c) =>
          c.subjectId === payload.subjectId && c.type === type && c.idx === sessionIdx
            ? { ...c, status: 'pending' as const }
            : c
        );
        currentData.attendedClasses = currentData.classes.filter((c) => c.status === 'attended').length;
        currentData.items = currentData.items.map((item) =>
          item.type === type &&
          item.subjectId === payload.subjectId &&
          item.sessionIdx === sessionIdx
            ? { ...item, status: 'pending' as const }
            : item
        );
        triggerInstantAgendaUpdate(currentData);
      }

      // ── STEP 2: ASYNC CLOUD & LOCAL CACHE REVERT (NON-BLOCKING) ───────────
      (async () => {
        try {
          const user = await resolveUser();
          if (!user) return;

          const deterministicId = getScheduledAttendanceLogDocId(user.uid, subjectId, dateStr, type, sessionIdx);
          const academicCache = await readAcademicCache();
          const subject = academicCache.attendance?.find(s => s.id === payload.subjectId || (payload.subjectName && s.name === payload.subjectName));

          const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
          const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';

          const existingLog = academicCache.attendanceLogs?.find(l =>
            l.id === deterministicId ||
            (
              (l.subjectId === payload.subjectId || (payload.subjectName && l.subjectName === payload.subjectName)) &&
              (l.date || '').slice(0, 10) === dateStr &&
              (l.type === type || (!l.type && type === 'class')) &&
              (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
            )
          );

          if (existingLog && subject) {
            const oldAction = existingLog.action;
            const attDelta = oldAction === 'attended' ? -1 : 0;
            const totDelta = oldAction === 'cancelled' ? 0 : -1;

            const newAttended = Math.max(0, (subject[attendedKey] || 0) + attDelta);
            const newTotal    = Math.max(0, (subject[totalKey]    || 0) + totDelta);
            const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal };

            const subjPayload = { ...subjectUpdates, lastUpdated: Date.now() };
            const targetLogId = existingLog.id || deterministicId;
            await safeUpdate(
              subject.id,
              COLLECTION.ATTENDANCE,
              subjPayload,
              () => updateDoc(doc(db, COLLECTION.ATTENDANCE, subject.id), subjPayload)
            ).catch(() => {});
            await safeWrite(
              () => {
                const batch = writeBatch(db);
                batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, targetLogId));
                return batch.commit();
              },
              COLLECTION.ATTENDANCE_LOGS,
              'delete',
              null,
              targetLogId
            ).catch(() => {});

            const updatedLogs = (academicCache.attendanceLogs || []).filter(l =>
              l.id !== existingLog.id && l.id !== deterministicId
            );
            const updatedSubjects = (academicCache.attendance || []).map(s =>
              s.id === payload.subjectId ? { ...s, ...subjectUpdates } : s
            );
            await writeAcademicCache({
              attendanceLogs: updatedLogs,
              attendance: updatedSubjects,
            }, true);
            updateL1Cache('attendanceLogs', updatedLogs);
            updateL1Cache('attendance', updatedSubjects);

            DeviceEventEmitter.emit('attendance_logged_from_widget', {
              log: null,
              subjectUpdates,
              subjectId: payload.subjectId,
              deterministicId,
            });

            clearScheduleCache();
          }
        } catch (e) {
          console.warn('[WidgetSync] Background undo attendance error:', e);
        }
      })();
      break;
    }

    // ── Live Workout Actions ──────────────────────────────────────────────────
    

    

    default:
      break;
  }
}
