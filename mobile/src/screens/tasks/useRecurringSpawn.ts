/**
 * useRecurringSpawn.ts — ZenTrack Tasks Module
 *
 * Auto-spawns recurring tasks for today. Runs deferred via
 * InteractionManager so it never blocks the first render frame.
 *
 * Deterministic document IDs (task_${sourceId}_${dateStr}) and safeWrite
 * ensure complete idempotence both online and offline.
 */
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { Task } from '../../contexts/MobileDataContext';
import { handleSyncError } from '../../utils/errorUtils';
import { safeWrite } from '../../utils/safeWrite';
import { formatLocalDateStr } from '../../utils/dateUtils';

// Module-level dedup set: tracks userId+date combinations that have already been
// spawned in this app session. Prevents duplicate task creation when Firestore is
// slow to confirm newly-written tasks back via onSnapshot.
const _spawnedThisSession = new Set<string>();

export function useRecurringSpawn(
  tasks: Task[],
  userId: string | undefined,
  optimisticAddTask?: (task: Task) => void,
  tasksReady: boolean = true
) {
  useEffect(() => {
    if (!userId || !tasksReady || tasks.length === 0) return;

    const now = new Date();
    const today = formatLocalDateStr(now);
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();
    const sessionKey = `${userId}|${today}`;

    // Synchronous dedup guard: if we've already spawned for this user+date in this session,
    // exit immediately in 0ms without queuing an InteractionManager callback on every task mutation.
    if (_spawnedThisSession.has(sessionKey)) return;

    const handle = InteractionManager.runAfterInteractions(async () => {
      // Re-verify guard inside callback in case of concurrent execution
      if (_spawnedThisSession.has(sessionKey)) return;
      _spawnedThisSession.add(sessionKey);

      // Evaluate recurring tasks supporting daily, weekly, monthly, and custom rules
      const recurringTasks = tasks.filter(t => {
        if (!t.isRecurring || t.status === 'completed') return false;
        if (t.recurrenceRule?.endDate && t.recurrenceRule.endDate < today) return false;

        const rule = t.recurrenceRule;
        if (!rule || rule.type === 'daily') {
          return true;
        }
        if (rule.type === 'weekly') {
          return rule.daysOfWeek ? rule.daysOfWeek.includes(dayOfWeek) : true;
        }
        if (rule.type === 'monthly') {
          const srcD = t.date ? new Date(t.date).getDate() : dayOfMonth;
          return srcD === dayOfMonth;
        }
        if (rule.type === 'custom') {
          const interval = rule.interval || 1;
          const unit = (rule as any).unit;
          if (unit === 'days' || !unit) {
            if (!t.date) return true;
            const diffDays = Math.round((now.getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24));
            return diffDays % interval === 0;
          }
        }
        return false;
      });

      // Pre-index today's existing task source IDs and deterministic IDs into a Set for O(1) lookups
      const todayTaskSourceIds = new Set<string>();
      for (const t of tasks) {
        if (t.date === today) {
          if (t.recurringSourceId) todayTaskSourceIds.add(t.recurringSourceId);
          if (t.id) todayTaskSourceIds.add(t.id);
        }
      }

      const tasksToSpawn: Array<{ payload: Task; deterministicId: string; src: Task }> = [];

      for (const src of recurringTasks) {
        const sourceId = src.recurringSourceId || src.id!;
        const deterministicId = `task_${sourceId}_${today}`;
        const existsForToday = todayTaskSourceIds.has(sourceId) || todayTaskSourceIds.has(deterministicId);

        if (!existsForToday && src.date !== today) {
          todayTaskSourceIds.add(sourceId);
          todayTaskSourceIds.add(deterministicId);

          const taskPayload: Task = {
            ...src,
            id: deterministicId,
            date: today,
            recurringSourceId: sourceId,
            status: 'pending',
            completedAt: null,
          };
          tasksToSpawn.push({ payload: taskPayload, deterministicId, src });
        }
      }

      // Batch apply to optimistic state and persist via safeWrite
      for (const { payload, deterministicId, src } of tasksToSpawn) {
        if (optimisticAddTask) {
          optimisticAddTask(payload);
        }

        safeWrite(
          () => setDoc(doc(db, COLLECTION.TASKS, deterministicId), {
            ...src,
            id: deterministicId,
            date: today,
            recurringSourceId: payload.recurringSourceId,
            status: 'pending',
            completedAt: null,
            createdAt: serverTimestamp(),
          }, { merge: true }),
          COLLECTION.TASKS,
          'set',
          payload,
          deterministicId
        ).catch(handleSyncError);
      }
    });

    return () => handle.cancel();
  }, [userId, tasks.length, tasksReady, optimisticAddTask]);
}
