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
import { queueWrite } from '../../services/offlineSync';
import { getToday } from './taskConstants'; // use getToday() — never the stale `today` constant

// Module-level dedup set: tracks userId+date combinations that have already been
// spawned in this app session. Prevents duplicate task creation when Firestore is
// slow to confirm newly-written tasks back via onSnapshot (Bug 4 fix).
const _spawnedThisSession = new Set<string>();

export function useRecurringSpawn(
  tasks: Task[],
  userId: string | undefined,
  optimisticAddTask?: (task: Task) => void
) {
  useEffect(() => {
    if (!userId || tasks.length === 0) return;

    const today = getToday(); // fresh call — correct date even after midnight
    const sessionKey = `${userId}|${today}`;

    // Synchronous dedup guard: if we've already spawned for this user+date in this session,
    // exit immediately in 0ms without queuing an InteractionManager callback on every task mutation.
    if (_spawnedThisSession.has(sessionKey)) return;

    const handle = InteractionManager.runAfterInteractions(async () => {
      // Re-verify guard inside callback in case of concurrent execution
      if (_spawnedThisSession.has(sessionKey)) return;

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
          const newTask: Task = {
            ...src,
            id: newRef.id,
            date: today,
            recurringSourceId: sourceId,
            status: 'pending',
            completedAt: null,
          };

          // Optimistic local add — instant visibility offline
          if (optimisticAddTask) {
            optimisticAddTask(newTask);
          }

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

      if (spawns > 0) {
        try {
          await batch.commit();
          // Only mark session-spawned AFTER successful commit
          _spawnedThisSession.add(sessionKey);
        } catch (e) {
          // If offline/network failed, queue each new task to offline queue
          for (const src of recurringTasks) {
            const sourceId = src.recurringSourceId || src.id!;
            if (!todayTaskSourceIds.has(sourceId) && src.date !== today) {
              const fallbackId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const payload = {
                ...src,
                date: today,
                recurringSourceId: sourceId,
                status: 'pending',
                completedAt: null,
                createdAt: Date.now(),
              };
              queueWrite(COLLECTION.TASKS, 'add', payload).catch(() => {});
            }
          }
          _spawnedThisSession.add(sessionKey);
          handleSyncError(e);
        }
      } else {
        // Nothing to spawn — mark as done so we don't re-check on every tasks.length change
        _spawnedThisSession.add(sessionKey);
      }
    });

    return () => handle.cancel();
  }, [userId, tasks.length, optimisticAddTask]);
}
