/**
 * useTasksFirestore.ts — ZenTrack Tasks Module
 *
 * All Firestore write operations extracted from TasksScreen.tsx.
 * No UI state here — pure async data operations only.
 */
import { useCallback } from 'react';
import {
  collection, doc, updateDoc, addDoc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { Task } from '../../contexts/MobileDataContext';
import { awardXP } from '../../services/xpSystem';
import { handleSyncError } from '../../utils/errorUtils';

interface UseTasksFirestoreProps {
  optimisticUpdateTask: (id: string, updates: Partial<Task>) => void;
  setTimeLogTask: (task: Task | null) => void;
  setIsBulkEdit: (v: boolean) => void;
  setSelectedTaskIds: (v: Set<string>) => void;
  setBulkRescheduleModal: (v: boolean) => void;
}

export function useTasksFirestore({
  optimisticUpdateTask,
  setTimeLogTask,
  setIsBulkEdit,
  setSelectedTaskIds,
  setBulkRescheduleModal,
}: UseTasksFirestoreProps) {

  const completeTask = useCallback((task: Task, fromSwipe?: boolean) => {
    if (!task.id) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
    optimisticUpdateTask(task.id, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
    }
    if (newStatus === 'completed' && !fromSwipe) { setTimeLogTask(task); return; }
    (async () => {
      try {
        if (newStatus === 'completed') await awardXP('TASK_COMPLETE');
        await updateDoc(doc(db, COLLECTION.TASKS, task.id), { status: newStatus, completedAt });
      } catch (error) { console.error('[useTasksFirestore] completeTask error', error); }
    })();
  }, [optimisticUpdateTask, setTimeLogTask]);

  const clearCompletedTasks = useCallback(async (tasks: Task[]) => {
    try {
      const completedTasks = tasks.filter(t => t.status === 'completed');
      if (completedTasks.length === 0) return;
      const batch = writeBatch(db);
      completedTasks.forEach(t => batch.delete(doc(db, COLLECTION.TASKS, t.id!)));
      await batch.commit();
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
    } catch (error) { console.error('[useTasksFirestore] clearCompleted error', error); }
  }, []);

  const bulkComplete = useCallback(async (selectedTaskIds: Set<string>) => {
    if (selectedTaskIds.size === 0) return;
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
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => batch.delete(doc(db, COLLECTION.TASKS, id)));
    await batch.commit();
    setIsBulkEdit(false);
    setSelectedTaskIds(new Set());
  }, [setIsBulkEdit, setSelectedTaskIds]);

  const handleBulkReschedule = useCallback(async (selectedTaskIds: Set<string>, newDate: string, newTimeSlot?: string) => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        const updates: any = { date: newDate };
        if (newTimeSlot) updates.timeSlot = newTimeSlot;
        batch.update(doc(db, COLLECTION.TASKS, id), updates);
      });
      await batch.commit();
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
      setBulkRescheduleModal(false);
      import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
    } catch (e) { console.error('[useTasksFirestore] bulkReschedule error', e); }
  }, [setIsBulkEdit, setSelectedTaskIds, setBulkRescheduleModal]);

  const updateTask = useCallback((
    id: string,
    updates: Partial<Task>,
    optimistic = true,
  ) => {
    if (optimistic) optimisticUpdateTask(id, updates);
    updateDoc(doc(db, COLLECTION.TASKS, id), updates).catch(handleSyncError);
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
    optimisticUpdateTask(taskId, { status: 'completed', completedAt, actualMinutes, actualStartTime } as any);
    (async () => {
      try {
        await awardXP('TASK_COMPLETE');
        await updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'completed', completedAt, actualMinutes, actualStartTime });
      } catch (e) { console.error('[useTasksFirestore] saveTimeLog error', e); }
    })();
  }, []);

  const skipTimeLog = useCallback((taskId: string) => {
    const completedAt = new Date().toISOString();
    (async () => {
      try {
        await awardXP('TASK_COMPLETE');
        await updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: 'completed', completedAt });
      } catch (e) { console.error('[useTasksFirestore] skipTimeLog error', e); }
    })();
  }, []);

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
