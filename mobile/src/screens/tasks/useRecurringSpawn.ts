/**
 * useRecurringSpawn.ts — ZenTrack Tasks Module
 *
 * Auto-spawns recurring tasks for today. Runs deferred via
 * InteractionManager so it never blocks the first render frame.
 * Extracted from TasksScreen.tsx (was inline useEffect, ~25 lines).
 */
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { Task } from '../../contexts/MobileDataContext';
import { handleSyncError } from '../../utils/errorUtils';
import { today } from './taskConstants';

export function useRecurringSpawn(tasks: Task[], userId: string | undefined) {
  useEffect(() => {
    if (!userId || tasks.length === 0) return;

    const handle = InteractionManager.runAfterInteractions(async () => {
      // Only look at daily-type recurring tasks that haven't ended
      const recurringTasks = tasks.filter(t =>
        t.isRecurring &&
        t.status !== 'completed' &&
        (!t.recurrenceRule || t.recurrenceRule.type === 'daily') &&
        (!t.recurrenceRule?.endDate || t.recurrenceRule.endDate >= today)
      );

      const batch = writeBatch(db);
      let spawns = 0;

      // Pre-index today's existing task source IDs into a Set for O(1) lookups
      const todayTaskSourceIds = new Set<string>();
      for (const t of tasks) {
        if (t.date === today) {
          if (t.recurringSourceId) todayTaskSourceIds.add(t.recurringSourceId);
          if (t.id) todayTaskSourceIds.add(t.id);
        }
      }

      for (const src of recurringTasks) {
        const sourceId = src.recurringSourceId || src.id!;
        const existsForToday = todayTaskSourceIds.has(sourceId);
        if (!existsForToday && src.date !== today) {
          const newRef = doc(collection(db, COLLECTION.TASKS));
          batch.set(newRef, {
            ...src,
            id: undefined,
            date: today,
            recurringSourceId: sourceId,
            status: 'pending',
            completedAt: null,
            createdAt: serverTimestamp(),
          });
          spawns++;
        }
      }

      if (spawns > 0) await batch.commit().catch(handleSyncError);
    });

    return () => handle.cancel();
  }, [userId, tasks.length]); // tasks.length is sufficient — avoids deep comparison
}
