/**
 * coreCache.ts — AsyncStorage helpers for core ZenTrack data
 *
 * Implements the stale-while-revalidate pattern:
 * 1. On boot: read cached tasks/habits/habitLogs instantly (~5ms, no network)
 * 2. Show cached data immediately — app is usable before Firestore responds
 * 3. After each Firestore snapshot: write fresh data back to cache
 *
 * This is the same pattern Instagram uses for its feed:
 * show yesterday's content instantly, silently update in the background.
 */

import { storage } from '../lib/cache/mmkvStorage';
import type { Task, Habit, HabitLog } from '../contexts/MobileDataContext';

// ── Cache Keys ────────────────────────────────────────────────────────────────
const KEYS = {
  TASKS:      '@zentrack_cache_tasks',
  HABITS:     '@zentrack_cache_habits',
  HABIT_LOGS: '@zentrack_cache_habitlogs',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CoreCache {
  tasks:     Task[];
  habits:    Habit[];
  habitLogs: HabitLog[];
}

// ── Read — synchronous (~0ms, no network) ────────────────────────────
export function readCoreCacheMulti(): Partial<CoreCache> {
  try {
    const result: Partial<CoreCache> = {};
    const rawTasks = storage.getString(KEYS.TASKS);
    if (rawTasks) { try { result.tasks = JSON.parse(rawTasks) as Task[]; } catch {} }

    const rawHabits = storage.getString(KEYS.HABITS);
    if (rawHabits) { try { result.habits = JSON.parse(rawHabits) as Habit[]; } catch {} }

    const rawHabitLogs = storage.getString(KEYS.HABIT_LOGS);
    if (rawHabitLogs) { try { result.habitLogs = JSON.parse(rawHabitLogs) as HabitLog[]; } catch {} }

    return result;
  } catch {
    return {}; // Cache miss is always safe — Firestore will populate
  }
}

// ── Write — synchronous after Firestore snapshot ─────────────────────
// Only writes the keys that are provided (partial updates supported)
export function writeCoreCacheMulti(data: Partial<CoreCache>): void {
  try {
    if (data.tasks     !== undefined) storage.set(KEYS.TASKS,      JSON.stringify(data.tasks));
    if (data.habits    !== undefined) storage.set(KEYS.HABITS,     JSON.stringify(data.habits));
    if (data.habitLogs !== undefined) storage.set(KEYS.HABIT_LOGS, JSON.stringify(data.habitLogs));
  } catch { /* silent — cache write failure never affects the user */ }
}

// ── Invalidate — call on logout to clear stale data ──────────────────────────
export function clearCoreCache(): void {
  try {
    storage.delete(KEYS.TASKS);
    storage.delete(KEYS.HABITS);
    storage.delete(KEYS.HABIT_LOGS);
  } catch { /* silent */ }
}
