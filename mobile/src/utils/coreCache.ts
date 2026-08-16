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

import AsyncStorage from '@react-native-async-storage/async-storage';
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

// ── Read — single multiGet call (~5ms, no network) ────────────────────────────
export async function readCoreCacheMulti(): Promise<Partial<CoreCache>> {
  try {
    const pairs = await AsyncStorage.multiGet([KEYS.TASKS, KEYS.HABITS, KEYS.HABIT_LOGS]);
    const result: Partial<CoreCache> = {};
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      try {
        if (key === KEYS.TASKS)      result.tasks      = JSON.parse(raw) as Task[];
        if (key === KEYS.HABITS)     result.habits     = JSON.parse(raw) as Habit[];
        if (key === KEYS.HABIT_LOGS) result.habitLogs  = JSON.parse(raw) as HabitLog[];
      } catch { /* ignore individual parse errors */ }
    }
    return result;
  } catch {
    return {}; // Cache miss is always safe — Firestore will populate
  }
}

let _coreWriteTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingCoreData: Partial<CoreCache> = {};

export async function flushCoreCache(): Promise<void> {
  if (_coreWriteTimer) {
    clearTimeout(_coreWriteTimer);
    _coreWriteTimer = null;
  }
  const toWrite = _pendingCoreData;
  _pendingCoreData = {};

  try {
    const pairs: [string, string][] = [];
    if (toWrite.tasks     !== undefined) pairs.push([KEYS.TASKS,      JSON.stringify(toWrite.tasks)]);
    if (toWrite.habits    !== undefined) pairs.push([KEYS.HABITS,     JSON.stringify(toWrite.habits)]);
    if (toWrite.habitLogs !== undefined) pairs.push([KEYS.HABIT_LOGS, JSON.stringify(toWrite.habitLogs)]);
    if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
  } catch { /* silent */ }
}

// ── Write — writes immediately to AsyncStorage for guaranteed offline persistence ───
export async function writeCoreCacheMulti(data: Partial<CoreCache>, immediate = true): Promise<void> {
  _pendingCoreData = { ..._pendingCoreData, ...data };
  return flushCoreCache();
}

// ── Invalidate — call on logout to clear stale data ──────────────────────────
export async function clearCoreCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.TASKS, KEYS.HABITS, KEYS.HABIT_LOGS]);
  } catch { /* silent */ }
}
