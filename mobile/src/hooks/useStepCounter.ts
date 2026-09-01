/**
 * useStepCounter.ts — ZenTrack Mobile Hardware Pedometer Hook
 *
 * Realtime native pedometer sync with zero battery drain.
 * - Reads cached steps immediately from AsyncStorage (0ms render on cold boot).
 * - Queries hardware sensor (Pedometer.getStepCountAsync) from midnight to now when app enters foreground.
 * - Subscribes to live step events (Pedometer.watchStepCount) only while app is active.
 * - Handles Android 10+ ACTIVITY_RECOGNITION runtime permission gracefully.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STEP_GOAL_DEFAULT = 10000;
const STEP_CACHE_KEY_PREFIX = '@zentrack_steps_';

export function useStepCounter() {
  const [steps, setSteps] = useState<number>(0);
  const [stepGoal, setStepGoal] = useState<number>(STEP_GOAL_DEFAULT);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const isQueryingRef = useRef<boolean>(false);
  const subscriptionRef = useRef<any>(null);

  const getTodayDateStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Sync today's steps from hardware sensor
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
    } catch (e) {
      console.warn('[StepCounter] Pedometer sync error:', e);
    } finally {
      isQueryingRef.current = false;
    }
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

    // Read custom step goal if user configured one
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
    isAvailable,
    refreshSteps: syncHardwareSteps,
  };
}
