/**
 * useStepCounter.ts — ZenTrack Ultra-Fast Native Hardware Pedometer Hook
 *
 * Performance-first architecture:
 * - 0ms instant display from Frame 0 memory cache.
 * - Throttled hardware sync (max once every 30s on foreground).
 * - Debounced AsyncStorage writes (eliminates JS thread disk thrashing).
 * - Zero background CPU/battery drain.
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

// Memory cache for Frame 0 instant renders
let memoryCachedSteps = 0;
let memoryCachedGoal = STEP_GOAL_DEFAULT;
let lastHardwareSyncTime = 0;

export function getTodayDateStrSync(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

    if (isNaN(stepCount) || (stepCount === 0 && i === 0)) {
      if (i === 0 && memoryCachedSteps > 0) {
        stepCount = memoryCachedSteps;
      }
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
  const [steps, setSteps] = useState<number>(memoryCachedSteps);
  const [stepGoal, setStepGoal] = useState<number>(memoryCachedGoal);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [history, setHistory] = useState<DayStepData[]>([]);

  const isQueryingRef = useRef<boolean>(false);
  const lastSavedStepsRef = useRef<number>(memoryCachedSteps);
  const saveTimeoutRef = useRef<any>(null);

  // Throttled hardware step sync
  const syncHardwareSteps = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHardwareSyncTime < 30000) {
      return; // Max once per 30 seconds to prevent lag
    }
    if (isQueryingRef.current) return;
    isQueryingRef.current = true;
    lastHardwareSyncTime = now;

    try {
      const todayStr = getTodayDateStrSync();
      const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

      const available = await Pedometer.isAvailableAsync().catch(() => false);
      setIsAvailable(available);
      if (!available) {
        isQueryingRef.current = false;
        return;
      }

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

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rightNow = new Date();

      const result = await Pedometer.getStepCountAsync(startOfDay, rightNow).catch(() => null);
      if (result && typeof result.steps === 'number') {
        const hardwareSteps = Math.max(0, result.steps);
        memoryCachedSteps = hardwareSteps;
        setSteps(prev => (prev === hardwareSteps ? prev : hardwareSteps));

        if (Math.abs(hardwareSteps - lastSavedStepsRef.current) >= 20) {
          lastSavedStepsRef.current = hardwareSteps;
          AsyncStorage.setItem(cacheKey, String(hardwareSteps)).catch(() => {});
        }
      }
    } catch (e) {
    } finally {
      isQueryingRef.current = false;
    }
  }, []);

  const updateGoal = useCallback(async (newGoal: number) => {
    memoryCachedGoal = newGoal;
    setStepGoal(newGoal);
    await AsyncStorage.setItem('@zentrack_step_goal', String(newGoal)).catch(() => {});
  }, []);

  useEffect(() => {
    const todayStr = getTodayDateStrSync();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

    // 1. Initial 0ms memory / disk load
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val) && val > 0) {
          memoryCachedSteps = val;
          setSteps(val);
        }
      }
    }).catch(() => {});

    AsyncStorage.getItem('@zentrack_step_goal').then((goal) => {
      if (goal) {
        const g = parseInt(goal, 10);
        if (!isNaN(g) && g > 0) {
          memoryCachedGoal = g;
          setStepGoal(g);
        }
      }
    }).catch(() => {});

    // 2. Hardware sync on mount
    syncHardwareSteps();

    // 3. Sync on app foreground resume
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncHardwareSteps();
      }
    });

    return () => {
      appStateSub.remove();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [syncHardwareSteps]);

  return {
    steps,
    stepGoal,
    history,
    isAvailable,
    updateGoal,
    refreshSteps: () => syncHardwareSteps(true),
  };
}
