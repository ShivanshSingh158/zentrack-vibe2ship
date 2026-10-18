/**
 * useTasksFirestore.ts — ZenTrack Tasks Module
 *
 * All Firestore write operations extracted from TasksScreen.tsx.
 * No UI state here — pure async data operations only.
 *
 * OFFLINE-FIRST: All single-document writes use safeWrite/safeUpdate/safeDelete.
 * These route through AsyncStorage queueWrite() when offline so writes survive
 * force-kills and are visible in the OfflineIndicator amber banner.
 * Bulk batch operations (bulkComplete/bulkDelete/bulkReschedule) still use
 * writeBatch directly — they have their own online-only guard.
 */
import { useCallback, useRef, useMemo } from 'react';
import {
  collection, doc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, writeBatch, setDoc,
} from 'firebase/firestore';
import NetInfo from '@react-native-community/netinfo';
import { Alert, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { Task } from '../../contexts/MobileDataContext';
import { awardXP } from '../../services/xpSystem';
import { handleSyncError } from '../../utils/errorUtils';
import { safeUpdate, safeWrite, safeDelete } from '../../utils/safeWrite';
import { formatLocalDateStr } from '../../utils/dateUtils';

interface UseTasksFirestoreProps {
  optimisticUpdateTask: (id: string, updates: Partial<Task>) => void;
  optimisticDeleteTask: (id: string) => void;
  optimisticAddTask?: (task: Task) => void;
  setTimeLogTask: (task: Task | null) => void;
  setIsBulkEdit: (v: boolean) => void;
  setSelectedTaskIds: (v: Set<string>) => void;
  setBulkRescheduleModal: (v: boolean) => void;
  // PERFECT_DAY detection — pass live data from the screen
  todayTasks: Task[];
  habits: Array<{ id: string; type?: string; archived?: boolean; targetCount?: number | null }>;
  habitLogs: Array<{ habitId: string; date: string; count?: number }>;
  todayDateStr: string;
}

export function useTasksFirestore({
  optimisticUpdateTask,
  optimisticDeleteTask,
  optimisticAddTask,
  setTimeLogTask,
  setIsBulkEdit,
  setSelectedTaskIds,
  setBulkRescheduleModal,
  todayTasks,
  habits,
  habitLogs,
  todayDateStr,
}: UseTasksFirestoreProps) {
  // Live props synchronized via refs to prevent callback re-creation on data mutations
  const todayTasksRef = useRef(todayTasks);
  const habitsRef = useRef(habits);
  const habitLogsRef = useRef(habitLogs);
  const todayDateStrRef = useRef(todayDateStr);
  const optimisticUpdateTaskRef = useRef(optimisticUpdateTask);
  const optimisticDeleteTaskRef = useRef(optimisticDeleteTask);
  const optimisticAddTaskRef = useRef(optimisticAddTask);

  todayTasksRef.current = todayTasks;
  habitsRef.current = habits;
  habitLogsRef.current = habitLogs;
  todayDateStrRef.current = todayDateStr;
  optimisticUpdateTaskRef.current = optimisticUpdateTask;
  optimisticDeleteTaskRef.current = optimisticDeleteTask;
  optimisticAddTaskRef.current = optimisticAddTask;

  // Helper: award PERFECT_DAY if all today's tasks done AND all positive habits logged
  const checkAndAwardPerfectDay = useCallback(async (justCompletedTaskId: string) => {
    try {
      const todayDate = todayDateStrRef.current;
      const perfectDayKey = `zentrack_perfect_day_${todayDate}`;
      const alreadyClaimed = await AsyncStorage.getItem(perfectDayKey);
      if (alreadyClaimed) return;

      const currentTodayTasks = todayTasksRef.current;
      // All today's tasks must be completed (include the one just completed optimistically)
      const allTasksDone = currentTodayTasks.every(
        t => t.status === 'completed' || t.id === justCompletedTaskId
      );
      if (!allTasksDone || currentTodayTasks.length === 0) return;

      // All positive non-archived habits must have a log today
      const positiveHabits = habitsRef.current.filter(h => h.type !== 'negative' && !h.archived);
      if (positiveHabits.length === 0) return;
      const todayHabitLogs = habitLogsRef.current.filter(l => l.date === todayDate);
      const allHabitsDone = positiveHabits.every(h => {
        const log = todayHabitLogs.find(l => l.habitId === h.id);
        if (!log) return false;
        if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
        return true;
      });
      if (!allHabitsDone) return;

      await AsyncStorage.setItem(perfectDayKey, '1');
      await awardXP('PERFECT_DAY');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      DeviceEventEmitter.emit('zentrack_perfect_day', { date: todayDate });
    } catch (e) { /* non-critical — never block task completion */ }
  }, []);

  // IDEMPOTENCY GUARD: Per-task action timestamp lock prevents double-tap race conditions
  const inFlightTaskLocks = useRef<Map<string, number>>(new Map());

  const completeTask = useCallback((task: Task) => {
    if (!task.id) return;
    const now = Date.now();
    const lastTap = inFlightTaskLocks.current.get(task.id) || 0;
    if (now - lastTap < 280) {
      return; // Suppress rapid accidental double-tap
    }
    inFlightTaskLocks.current.set(task.id, now);
    setTimeout(() => {
      inFlightTaskLocks.current.delete(task.id!);
    }, 300);
    if (inFlightTaskLocks.current.size > 200) {
      inFlightTaskLocks.current.clear();
    }

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
    // Optimistic update first — UI is instant regardless of connectivity
    optimisticUpdateTaskRef.current(task.id, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Notifications.cancelScheduledNotificationAsync(`task_${task.id}`).catch(() => {});
    }
    (async () => {
      try {
        if (newStatus === 'completed') {
          await awardXP('TASK_COMPLETE');
          await checkAndAwardPerfectDay(task.id!);
        }
        // safeUpdate: online → direct Firestore; offline → AsyncStorage queue (survives kill)
        await safeUpdate(
          task.id,
          COLLECTION.TASKS,
          { status: newStatus, completedAt },
          () => updateDoc(doc(db, COLLECTION.TASKS, task.id!), { status: newStatus, completedAt }),
        );

        // Cross-sync: If this task is an assignment task, update assignment in Firestore
        if (task.id?.startsWith('task_asg_')) {
          const asgId = task.id.replace('task_', '');
          const asgStatus = newStatus === 'completed' ? 'submitted' : 'not_started';
          await safeUpdate(
            asgId,
            COLLECTION.ASSIGNMENTS,
            { status: asgStatus, updatedAt: Date.now() },
            () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, asgId), { status: asgStatus, updatedAt: Date.now() }),
          ).catch(() => {});
        }
      } catch (error) { console.error('[useTasksFirestore] completeTask error', error); }
    })();
  }, [checkAndAwardPerfectDay]);

  // SUBTASK DEBOUNCE: Debounce network safeUpdate for subtasks by 400ms per taskId (Issue 78)
  const subtaskDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearCompletedTasks = useCallback(async (tasks: Task[]) => {
    try {
      const completedTasks = tasks.filter(t => t.status === 'completed');
      if (completedTasks.length === 0) return;

      const batch = writeBatch(db);
      completedTasks.forEach(t => {
        if (!t.id) return;
        Notifications.cancelScheduledNotificationAsync(`task_${t.id}`).catch(() => {});
        optimisticDeleteTaskRef.current(t.id);
        batch.delete(doc(db, COLLECTION.TASKS, t.id));
      });
      await batch.commit().catch(() => {
        // Fallback to safeDelete if offline
        completedTasks.forEach(t => {
          if (t.id) safeDelete(t.id, COLLECTION.TASKS, () => deleteDoc(doc(db, COLLECTION.TASKS, t.id!))).catch(handleSyncError);
        });
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) { console.error('[useTasksFirestore] clearCompleted error', error); }
  }, []);

  const bulkComplete = useCallback(async (selectedTaskIds: Set<string>) => {
    if (selectedTaskIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const completedAt = new Date().toISOString();

    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      Notifications.cancelScheduledNotificationAsync(`task_${id}`).catch(() => {});
      optimisticUpdateTaskRef.current(id, { status: 'completed', completedAt });
      batch.update(doc(db, COLLECTION.TASKS, id), { status: 'completed', completedAt });
    });

    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());

    batch.commit().catch(() => {
      // Fallback offline queue
      selectedTaskIds.forEach(id => {
        safeUpdate(
          id,
          COLLECTION.TASKS,
          { status: 'completed', completedAt },
          () => updateDoc(doc(db, COLLECTION.TASKS, id), { status: 'completed', completedAt })
        ).catch(handleSyncError);
      });
    });
  }, [setIsBulkEdit, setSelectedTaskIds]);

  const bulkDelete = useCallback(async (selectedTaskIds: Set<string>) => {
    if (selectedTaskIds.size === 0) return;

    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      Notifications.cancelScheduledNotificationAsync(`task_${id}`).catch(() => {});
      optimisticDeleteTaskRef.current(id);
      batch.delete(doc(db, COLLECTION.TASKS, id));
    });

    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());

    batch.commit().catch(() => {
      selectedTaskIds.forEach(id => {
        safeDelete(
          id,
          COLLECTION.TASKS,
          () => deleteDoc(doc(db, COLLECTION.TASKS, id))
        ).catch(handleSyncError);
      });
    });
  }, [setIsBulkEdit, setSelectedTaskIds]);

  const handleBulkReschedule = useCallback(async (selectedTaskIds: Set<string>, newDate: string, newTimeSlot?: string) => {
    if (selectedTaskIds.size === 0) return;
    const updates: any = { date: newDate };
    if (newTimeSlot) updates.timeSlot = newTimeSlot;

    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      optimisticUpdateTaskRef.current(id, updates);
      batch.update(doc(db, COLLECTION.TASKS, id), updates);
    });

    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());
    setBulkRescheduleModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    batch.commit().catch(() => {
      selectedTaskIds.forEach(id => {
        safeUpdate(
          id,
          COLLECTION.TASKS,
          updates,
          () => updateDoc(doc(db, COLLECTION.TASKS, id), updates)
        ).catch(handleSyncError);
      });
    });
  }, [setIsBulkEdit, setSelectedTaskIds, setBulkRescheduleModal]);

  const updateTask = useCallback((
    id: string,
    updates: Partial<Task>,
    optimistic = true,
  ) => {
    if (optimistic) optimisticUpdateTaskRef.current(id, updates);

    // If updating subtasks, debounce network write by 400ms to prevent snapshot race conditions (Issue 78)
    if (updates.subtasks !== undefined) {
      const existingTimer = subtaskDebounceTimers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        subtaskDebounceTimers.current.delete(id);
        safeUpdate(id, COLLECTION.TASKS, updates as Record<string, any>,
          () => updateDoc(doc(db, COLLECTION.TASKS, id), updates)
        ).catch(handleSyncError);
      }, 400);

      subtaskDebounceTimers.current.set(id, timer);
      return;
    }

    // safeUpdate: online → Firestore; offline → queue
    safeUpdate(id, COLLECTION.TASKS, updates as Record<string, any>,
      () => updateDoc(doc(db, COLLECTION.TASKS, id), updates)
    ).catch(handleSyncError);
  }, []);

  const addTaskFromTemplate = useCallback(async (
    userId: string,
    template: any,
    selectedDate: string,
    tasksCount: number,
  ) => {
    const docRef = doc(collection(db, COLLECTION.TASKS));
    const taskId = docRef.id;
    const taskObj: Task = {
      id: taskId,
      userId,
      title: template.title,
      status: 'pending',
      priority: template.priority || 'medium',
      date: selectedDate,
      timeSlot: template.timeSlot || undefined,
      estimatedMinutes: template.estimatedMinutes || undefined,
      isRecurring: template.isRecurring || false,
      recurrenceRule: template.recurringDays ? { type: 'weekly', interval: 1, daysOfWeek: template.recurringDays } : undefined,
      order: tasksCount,
      subtasks: template.subtasks || [],
    };
    if (optimisticAddTaskRef.current) {
      optimisticAddTaskRef.current(taskObj);
    }
    const firestorePayload = {
      userId, title: template.title, text: template.title, status: 'pending',
      priority: template.priority || 'medium', date: selectedDate,
      timeSlot: template.timeSlot || null, estimatedMinutes: template.estimatedMinutes || null,
      isRecurring: template.isRecurring || false, recurringDays: template.recurringDays || null,
      subject: null, createdAt: serverTimestamp(), order: tasksCount,
      subtasks: template.subtasks || [],
    };
    await safeWrite(
      () => setDoc(docRef, firestorePayload),
      COLLECTION.TASKS,
      'set',
      firestorePayload,
      taskId,
    );
  }, []);

  const saveTimeLog = useCallback((
    taskId: string,
    actualMinutes: number,
    actualStartTime: string,
    optimisticUpdateTask: (id: string, updates: Partial<Task>) => void,
  ) => {
    const completedAt = new Date().toISOString();
    const updates = { status: 'completed', completedAt, actualMinutes, actualStartTime };
    setTimeLogTask(null); // Instantly close the modal
    optimisticUpdateTask(taskId, updates as any);
    (async () => {
      try {
        await awardXP('TASK_COMPLETE');
        await checkAndAwardPerfectDay(taskId);
        await safeUpdate(
          taskId, COLLECTION.TASKS, updates,
          () => updateDoc(doc(db, COLLECTION.TASKS, taskId), updates),
        );
      } catch (e) { console.error('[useTasksFirestore] saveTimeLog error', e); }
    })();
  }, [setTimeLogTask, checkAndAwardPerfectDay]);

  const skipTimeLog = useCallback((
    taskId: string,
    optimisticUpdateTask: (id: string, updates: Partial<Task>) => void,
  ) => {
    const completedAt = new Date().toISOString();
    const updates = { status: 'completed', completedAt };
    setTimeLogTask(null); // Instantly close the modal
    optimisticUpdateTask(taskId, updates as any);
    (async () => {
      try {
        await awardXP('TASK_COMPLETE');
        await checkAndAwardPerfectDay(taskId);
        await safeUpdate(
          taskId, COLLECTION.TASKS, updates,
          () => updateDoc(doc(db, COLLECTION.TASKS, taskId), updates),
        );
      } catch (e) { console.error('[useTasksFirestore] skipTimeLog error', e); }
    })();
  }, [setTimeLogTask, checkAndAwardPerfectDay]);

  const deleteTask = useCallback((taskId: string) => {
    if (!taskId) return;
    Notifications.cancelScheduledNotificationAsync(`task_${taskId}`).catch(() => {});
    optimisticDeleteTaskRef.current(taskId);
    (async () => {
      try {
        await safeDelete(
          taskId,
          COLLECTION.TASKS,
          () => deleteDoc(doc(db, COLLECTION.TASKS, taskId))
        );
      } catch (e) {
        console.error('[useTasksFirestore] deleteTask error', e);
      }
    })();
  }, []);

  return useMemo(() => ({
    completeTask,
    deleteTask,
    clearCompletedTasks,
    bulkComplete,
    bulkDelete,
    handleBulkReschedule,
    updateTask,
    addTaskFromTemplate,
    saveTimeLog,
    skipTimeLog,
  }), [
    completeTask,
    deleteTask,
    clearCompletedTasks,
    bulkComplete,
    bulkDelete,
    handleBulkReschedule,
    updateTask,
    addTaskFromTemplate,
    saveTimeLog,
    skipTimeLog,
  ]);
}
