/**
 * useRecurringSpawn.ts — ZenTrack Tasks Module (Web)
 *
 * Automatically spawns recurring tasks for today if not already created.
 * Matches mobile app's useRecurringSpawn engine for seamless cross-platform synchronization.
 */
import { useEffect, useRef } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { TodoItem } from '../../types';
import { getLocalDateString } from '../../utils/dateUtils';

// Module-level dedup set: tracks userId+date combinations that have already been spawned in this browser session.
const _spawnedThisSession = new Set<string>();

export function useRecurringSpawn(
  tasks: TodoItem[],
  userId: string | undefined
) {
  const isSpawningRef = useRef(false);

  useEffect(() => {
    if (!userId || tasks.length === 0 || isSpawningRef.current) return;

    const today = getLocalDateString(new Date());
    const sessionKey = `${userId}|${today}`;

    // If already spawned today in this session, skip immediately
    if (_spawnedThisSession.has(sessionKey)) return;

    // Filter active daily/custom recurring tasks
    const recurringTasks = tasks.filter(t =>
      t.isRecurring &&
      t.status !== 'completed' &&
      (!t.recurrenceRule || t.recurrenceRule.type === 'daily' || t.recurrenceRule.type === 'custom') &&
      (!t.recurrenceRule?.endDate || t.recurrenceRule.endDate >= today)
    );

    if (recurringTasks.length === 0) {
      _spawnedThisSession.add(sessionKey);
      return;
    }

    // Pre-index existing tasks for today
    const todayTaskKeys = new Set<string>();
    for (const t of tasks) {
      if (t.date === today) {
        if (t.recurringSourceId) todayTaskKeys.add(t.recurringSourceId);
        if (t.id) todayTaskKeys.add(t.id);
        if (t.title && t.isRecurring) {
          todayTaskKeys.add(`title_${t.title.toLowerCase().trim()}`);
        }
      }
    }

    const tasksToSpawn: TodoItem[] = [];
    for (const src of recurringTasks) {
      const sourceId = src.recurringSourceId || src.id;
      const titleKey = `title_${(src.title || src.text || '').toLowerCase().trim()}`;
      const existsForToday = (sourceId && todayTaskKeys.has(sourceId)) || todayTaskKeys.has(titleKey);

      if (!existsForToday && src.date !== today) {
        tasksToSpawn.push(src);
      }
    }

    if (tasksToSpawn.length === 0) {
      _spawnedThisSession.add(sessionKey);
      return;
    }

    isSpawningRef.current = true;
    const batch = writeBatch(db);

    for (const src of tasksToSpawn) {
      const sourceId = src.recurringSourceId || src.id || `rec_${Date.now()}`;
      const newRef = doc(collection(db, 'todos'));
      batch.set(newRef, {
        userId,
        title: src.title || src.text || 'Recurring Task',
        text: src.title || src.text || 'Recurring Task',
        date: today,
        status: 'pending',
        priority: src.priority || 'medium',
        timeSlot: src.timeSlot || null,
        estimatedMinutes: src.estimatedMinutes || null,
        subtasks: (src.subtasks || []).map(st => ({
          id: st.id || String(Date.now()),
          title: st.title,
          completed: false,
          status: 'pending',
        })),
        tags: src.tags || [],
        isRecurring: true,
        recurrenceRule: src.recurrenceRule || null,
        recurringSourceId: sourceId,
        createdAt: Date.now(),
        order: Date.now(),
      });
    }

    batch
      .commit()
      .then(() => {
        _spawnedThisSession.add(sessionKey);
      })
      .catch(err => {
        console.warn('[useRecurringSpawn] Failed to commit recurring spawns:', err);
      })
      .finally(() => {
        isSpawningRef.current = false;
      });
  }, [userId, tasks.length]);
}
