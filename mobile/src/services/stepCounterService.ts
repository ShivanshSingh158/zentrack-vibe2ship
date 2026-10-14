/**
 * stepCounterService.ts — ZenTrack Mobile
 *
 * Android background step counter with Firestore sync.
 * - Hardware step chip counts 24/7 regardless of app state
 * - Background task syncs count to Firestore every ~15 min (OS minimum)
 * - Foreground: live updates via Pedometer.watchStepCount()
 * - XP reward fires once per day when daily goal is hit
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Pedometer } from 'expo-sensors';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { awardXP } from './xpSystem';
import { formatLocalDateStr } from '../utils/dateUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STEP_SYNC_TASK = 'ZENTRACK_STEP_SYNC';
export const STEP_DAILY_GOAL = 8000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" in local timezone */
export function getTodayDateKey(): string {
  return formatLocalDateStr(new Date());
}

/** Midnight of today in local time */
function getMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Core Step Read + Firestore Write ─────────────────────────────────────────

/**
 * Reads today's step count from the hardware sensor (steps since midnight)
 * and writes it to Firestore. Safe to call from both foreground and background.
 */
export async function syncStepsNow(userId: string, isBackground = false): Promise<number> {
  try {
    const { granted } = await Pedometer.getPermissionsAsync();
    if (!granted) {
      if (isBackground) {
        // Headless background tasks cannot show UI permission dialogs
        return 0;
      }
      const result = await Pedometer.requestPermissionsAsync();
      if (!result.granted) return 0;
    }

    const midnight = getMidnight();
    const now = new Date();
    const result = await Pedometer.getStepCountAsync(midnight, now);
    const steps = result.steps ?? 0;

    const dateKey = getTodayDateKey();
    const docId = `${userId}_${dateKey}`;
    const ref = doc(db, 'step_logs', docId);

    const existing = await getDoc(ref);
    const xpAlreadyAwarded = existing.exists() ? (existing.data()?.xpAwarded ?? false) : false;
    const goalHit = steps >= STEP_DAILY_GOAL;

    await setDoc(ref, {
      userId,
      date: dateKey,
      steps,
      goal: STEP_DAILY_GOAL,
      goalHit,
      xpAwarded: xpAlreadyAwarded || (goalHit && !xpAlreadyAwarded),
      updatedAt: Date.now(),
      source: isBackground ? 'background' : 'foreground',
    }, { merge: true });

    if (goalHit && !xpAlreadyAwarded) {
      await awardXP('STEP_GOAL_HIT').catch(() => {});
    }

    return steps;
  } catch (e) {
    console.warn('[StepCounter] syncStepsNow failed:', e);
    return 0;
  }
}

/**
 * Reads today's step count from Firestore (no sensor read).
 * Used by UI to get the last synced value when opening the app.
 */
export async function getTodayStepsFromFirestore(userId: string): Promise<{ steps: number; goalHit: boolean; updatedAt: number } | null> {
  try {
    const dateKey = getTodayDateKey();
    const ref = doc(db, 'step_logs', `${userId}_${dateKey}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      steps: data.steps ?? 0,
      goalHit: data.goalHit ?? false,
      updatedAt: data.updatedAt ?? 0,
    };
  } catch (e) {
    return null;
  }
}

// ── Background Task Definition ────────────────────────────────────────────────

TaskManager.defineTask(STEP_SYNC_TASK, async () => {
  try {
    let userId = auth.currentUser?.uid;
    if (!userId) {
      try {
        const rawUser = await AsyncStorage.getItem('@zentrack_optimistic_user');
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          userId = parsed.uid || parsed.id;
        }
      } catch {}
    }
    if (!userId) {
      userId = (await AsyncStorage.getItem('@zentrack_uid')) || (await AsyncStorage.getItem('user_id')) || undefined;
    }
    if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;

    await syncStepsNow(userId, true);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.warn('[StepCounter] Background task failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers the background fetch task. Call once from App.tsx after auth resolves.
 * Safe to call multiple times (no-ops if already registered).
 */
export async function registerStepSyncTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(STEP_SYNC_TASK);
    if (isRegistered) return;
    await BackgroundFetch.registerTaskAsync(STEP_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[StepCounter] Background sync task registered');
  } catch (e) {
    console.warn('[StepCounter] Failed to register background task:', e);
  }
}
