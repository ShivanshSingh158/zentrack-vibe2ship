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
import { useCallback, useRef } from 'react';
import {
  collection, doc, updateDoc, addDoc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { Task } from '../../contexts/MobileDataContext';
import { awardXP } from '../../services/xpSystem';
import { handleSyncError } from '../../utils/errorUtils';
import { safeUpdate, safeAdd } from '../../utils/safeWrite';

interface UseTasksFirestoreProps {
  optimisticUpdateTask: (id: string, updates: Partial<Task>) => void;
  optimisticDeleteTask: (id: string) => void;
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
  setTimeLogTask,
  setIsBulkEdit,
  setSelectedTaskIds,
  setBulkRescheduleModal,
  todayTasks,
  habits,
  habitLogs,
  todayDateStr,
}: UseTasksFirestoreProps) {

  // Helper: award PERFECT_DAY if all today's tasks done AND all positive habits logged
  const checkAndAwardPerfectDay = useCallback(async (justCompletedTaskId: string) => {
    try {
      const perfectDayKey = `zentrack_perfect_day_${todayDateStr}`;
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const alreadyClaimed = await AsyncStorage.getItem(perfectDayKey);
      if (alreadyClaimed) return;

      // All today's tasks must be completed (include the one just completed optimistically)
      const allTasksDone = todayTasks.every(
        t => t.status === 'completed' || t.id === justCompletedTaskId
      );
      if (!allTasksDone || todayTasks.length === 0) return;

      // All positive non-archived habits must have a log today
      const positiveHabits = habits.filter(h => h.type !== 'negative' && !h.archived);
      if (positiveHabits.length === 0) return;
      const todayHabitLogs = habitLogs.filter(l => l.date === todayDateStr);
      const allHabitsDone = positiveHabits.every(h => {
        const log = todayHabitLogs.find(l => l.habitId === h.id);
        if (!log) return false;
        if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
        return true;
      });
      if (!allHabitsDone) return;

      await AsyncStorage.setItem(perfectDayKey, '1');
      await awardXP('PERFECT_DAY');
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
      const { DeviceEventEmitter } = await import('react-native');
      DeviceEventEmitter.emit('zentrack_perfect_day', { date: todayDateStr });
    } catch (e) { /* non-critical — never block task completion */ }
  }, [todayTasks, habits, habitLogs, todayDateStr]);

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

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
    // Optimistic update first — UI is instant regardless of connectivity
    optimisticUpdateTask(task.id, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
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
      } catch (error) { console.error('[useTasksFirestore] completeTask error', error); }
    })();
  }, [optimisticUpdateTask, checkAndAwardPerfectDay]);

  const clearCompletedTasks = useCallback(async (tasks: Task[]) => {
    try {
      const completedTasks = tasks.filter(t => t.status === 'completed');
      if (completedTasks.length === 0) return;

      // Bug 3 + 5 fix: check online first, then apply optimistic removes before the async batch
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        Alert.alert('You\'re Offline', 'Please reconnect to clear completed tasks.');
        return;
      }

      // Optimistic: remove from UI instantly — no waiting for Firestore round-trip (Bug 5 fix)
      completedTasks.forEach(t => optimisticDeleteTask(t.id!));

      const batch = writeBatch(db);
      completedTasks.forEach(t => batch.delete(doc(db, COLLECTION.TASKS, t.id!)));
      await batch.commit();
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
    } catch (error) { console.error('[useTasksFirestore] clearCompleted error', error); }
  }, [optimisticDeleteTask]);

  const bulkComplete = useCallback(async (selectedTaskIds: Set<string>) => {
    if (selectedTaskIds.size === 0) return;
    // Bug 3 fix: guard against offline — batch commits are not offline-queueable
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert('You\'re Offline', 'Bulk complete is not available offline. Complete tasks individually.');
      return;
    }
    import('expo-haptics').then(H => H.impactAsync(H.ImpactFeedbackStyle.Heavy));
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => batch.update(doc(db, COLLECTION.TASKS, id), { status: 'completed', completedAt: serverTimestamp() }));
    try {
      await batch.commit();
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
    } catch (e) { console.error('[useTasksFirestore] bulkComplete error', e); }
  }, [setIsBulkEdit, setSelectedTaskIds]);

  const bulkDelete = useCallback(async (selectedTaskIds: Set<string>) => {
    if (selectedTaskIds.size === 0) return;
    // Bug 3 fix: guard against offline — batch commits are not offline-queueable
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert('You\'re Offline', 'Bulk delete is not available offline. Delete tasks individually.');
      return;
    }
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => batch.delete(doc(db, COLLECTION.TASKS, id)));
    await batch.commit();
    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());
  }, [setIsBulkEdit, setSelectedTaskIds]);

  const handleBulkReschedule = useCallback(async (selectedTaskIds: Set<string>, newDate: string, newTimeSlot?: string) => {
    if (selectedTaskIds.size === 0) return;
    const updates: any = { date: newDate };
    if (newTimeSlot) updates.timeSlot = newTimeSlot;

    // Optimistic update first — UI shifts tasks to new date instantly offline
    selectedTaskIds.forEach(id => {
      optimisticUpdateTask(id, updates);
    });

    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());
    setBulkRescheduleModal(false);
    import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));

    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        batch.update(doc(db, COLLECTION.TASKS, id), updates);
      });
      await batch.commit();
    } catch (e) {
      console.error('[useTasksFirestore] bulkReschedule error', e);
      handleSyncError(e);
    }
  }, [optimisticUpdateTask, setIsBulkEdit, setSelectedTaskIds, setBulkRescheduleModal]);

  const updateTask = useCallback((
    id: string,
    updates: Partial<Task>,
    optimistic = true,
  ) => {
    if (optimistic) optimisticUpdateTask(id, updates);
    // safeUpdate: online → Firestore; offline → queue
    safeUpdate(id, COLLECTION.TASKS, updates as Record<string, any>,
      () => updateDoc(doc(db, COLLECTION.TASKS, id), updates)
    ).catch(handleSyncError);
  }, [optimisticUpdateTask]);

  const addTaskFromTemplate = useCallback(async (
    userId: string,
    template: any,
    selectedDate: string,
    tasksCount: number,
  ) => {
    await addDoc(collection(db, COLLECTION.TASKS), {
      userId, title: template.title, text: template.title, status: 'pending',
      priority: template.priority || 'medium', date: selectedDate,
      timeSlot: template.timeSlot || null, estimatedMinutes: template.estimatedMinutes || null,
      isRecurring: template.isRecurring || false, recurringDays: template.recurringDays || null,
      subject: null, createdAt: serverTimestamp(), order: tasksCount,
      subtasks: template.subtasks || [],
    });
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

  return {
    completeTask,
    clearCompletedTasks,
    bulkComplete,
    bulkDelete,
    handleBulkReschedule,
    updateTask,
    addTaskFromTemplate,
    saveTimeLog,
    skipTimeLog,
  };
}
