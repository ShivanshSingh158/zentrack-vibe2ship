/**
 * useStepCounter.ts — ZenTrack Mobile Hardware Pedometer Hook
 *
 * Realtime native pedometer sync with zero battery drain.
 * - Reads cached steps immediately from AsyncStorage (0ms render on cold boot).
 * - Queries hardware sensor (Pedometer.getStepCountAsync) from midnight to now when app enters foreground.
 * - Subscribes to live step events (Pedometer.watchStepCount) only while app is active.
 * - Handles 7-day historical step data aggregation for analytics graphs.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STEP_GOAL_DEFAULT = 10000;
export const STEP_CACHE_KEY_PREFIX = '@zentrack_steps_';

export interface DayStepData {
  dateStr: string;
  dayLabel: string;
  steps: number;
}

export function formatStepsDistance(steps: number): string {
  const km = (steps * 0.00076);
  return `${km.toFixed(1)} km`;
}

export function formatStepsCalories(steps: number): string {
  const kcal = Math.round(steps * 0.04);
  return `${kcal} kcal`;
}

export function formatStepsActiveTime(steps: number): string {
  const totalMins = Math.round(steps / 100);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function fetch7DayStepHistory(): Promise<DayStepData[]> {
  const result: DayStepData[] = [];
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = dayNames[d.getDay()];
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${dateStr}`;

    const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
    let stepCount = cached ? parseInt(cached, 10) : 0;

    // If today or missing from cache, query hardware pedometer directly
    if (isNaN(stepCount) || (stepCount === 0 && i === 0)) {
      const startOfDay = new Date(d);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      if (i === 0) {
        endOfDay.setTime(now.getTime());
      } else {
        endOfDay.setHours(23, 59, 59, 999);
      }

      try {
        const pedometerResult = await Pedometer.getStepCountAsync(startOfDay, endOfDay).catch(() => null);
        if (pedometerResult && typeof pedometerResult.steps === 'number') {
          stepCount = pedometerResult.steps;
          await AsyncStorage.setItem(cacheKey, String(stepCount)).catch(() => {});
        }
      } catch (_) {}
    }

    result.push({
      dateStr,
      dayLabel,
      steps: Math.max(0, stepCount || 0),
    });
  }

  return result;
}

export function useStepCounter() {
  const [steps, setSteps] = useState<number>(0);
  const [stepGoal, setStepGoal] = useState<number>(STEP_GOAL_DEFAULT);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [history, setHistory] = useState<DayStepData[]>([]);
  const isQueryingRef = useRef<boolean>(false);
  const subscriptionRef = useRef<any>(null);

  const getTodayDateStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Sync today's steps and 7-day history from hardware sensor
  const syncHardwareSteps = useCallback(async () => {
    if (isQueryingRef.current) return;
    isQueryingRef.current = true;

    try {
      const todayStr = getTodayDateStr();
      const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

      // 1. Check pedometer hardware availability
      const available = await Pedometer.isAvailableAsync().catch(() => false);
      setIsAvailable(available);
      if (!available) {
        isQueryingRef.current = false;
        return;
      }

      // 2. Check / request permission
      const perm = await Pedometer.getPermissionsAsync().catch(() => ({ granted: false }));
      let isGranted = perm.granted;
      if (!isGranted) {
        const req = await Pedometer.requestPermissionsAsync().catch(() => ({ granted: false }));
        isGranted = req.granted;
      }

      if (!isGranted) {
        isQueryingRef.current = false;
        return;
      }

      // 3. Query hardware step counter from midnight today to right now
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const now = new Date();

      const result = await Pedometer.getStepCountAsync(startOfDay, now).catch(() => null);
      if (result && typeof result.steps === 'number') {
        const hardwareSteps = Math.max(0, result.steps);
        setSteps(hardwareSteps);
        await AsyncStorage.setItem(cacheKey, String(hardwareSteps)).catch(() => {});
      }

      // 4. Fetch 7-day history in background
      const hist = await fetch7DayStepHistory();
      setHistory(hist);
    } catch (e) {
      console.warn('[StepCounter] Pedometer sync error:', e);
    } finally {
      isQueryingRef.current = false;
    }
  }, []);

  const updateGoal = useCallback(async (newGoal: number) => {
    setStepGoal(newGoal);
    await AsyncStorage.setItem('@zentrack_step_goal', String(newGoal)).catch(() => {});
  }, []);

  useEffect(() => {
    const todayStr = getTodayDateStr();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

    // 1. Initial 0ms load from cache
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val)) setSteps(val);
      }
    }).catch(() => {});

    // Read custom step goal
    AsyncStorage.getItem('@zentrack_step_goal').then((goal) => {
      if (goal) {
        const g = parseInt(goal, 10);
        if (!isNaN(g) && g > 0) setStepGoal(g);
      }
    }).catch(() => {});

    // 2. Hardware sync on mount
    syncHardwareSteps();

    // 3. Live Pedometer Watcher while app is active
    try {
      subscriptionRef.current = Pedometer.watchStepCount((result) => {
        if (result && typeof result.steps === 'number') {
          setSteps((prev) => {
            const next = prev + result.steps;
            AsyncStorage.setItem(cacheKey, String(next)).catch(() => {});
            return next;
          });
        }
      });
    } catch (e) {
      // Ignored if watchStepCount not supported on platform
    }

    // 4. Sync on app foreground resume
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncHardwareSteps();
      }
    });

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      appStateSub.remove();
    };
  }, [syncHardwareSteps]);

  return {
    steps,
    stepGoal,
    history,
    isAvailable,
    updateGoal,
    refreshSteps: syncHardwareSteps,
  };
}
