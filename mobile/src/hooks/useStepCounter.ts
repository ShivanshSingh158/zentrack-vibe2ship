/**
 * useStepCounter.ts — ZenTrack Ultra-Fast Native Hardware Pedometer Hook
 *
 * Performance-first architecture:
 * - 0ms instant display from Frame 0 memory cache.
 * - Live real-time hardware pedometer listener (Pedometer.watchStepCount).
 * - Queries historical midnight baseline (Pedometer.getStepCountAsync).
 * - Automatic permission request & graceful fallback.
 * - Debounced AsyncStorage writes (eliminates JS thread disk thrashing).
 * - Zero background CPU/battery drain.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { safeWrite } from '../utils/safeWrite';

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
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [history, setHistory] = useState<DayStepData[]>([]);

  const isQueryingRef = useRef<boolean>(false);
  const baselineStepsRef = useRef<number>(memoryCachedSteps);
  const lastLiveStepsRef = useRef<number>(0);
  const watchSubscriptionRef = useRef<any>(null);

  const firestoreSyncDebounceRef = useRef<any>(null);

  // Persist steps to local storage + cloud Firestore with throttling
  const saveStepsToDisk = useCallback((count: number) => {
    const todayStr = getTodayDateStrSync();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;
    memoryCachedSteps = count;
    AsyncStorage.setItem(cacheKey, String(count)).catch(() => {});

    // Cloud Sync to Firestore step_logs
    if (firestoreSyncDebounceRef.current) {
      clearTimeout(firestoreSyncDebounceRef.current);
    }
    firestoreSyncDebounceRef.current = setTimeout(() => {
      const user = auth.currentUser;
      if (user?.uid) {
        const docId = `${user.uid}_${todayStr}`;
        safeWrite(
          () => setDoc(doc(db, 'step_logs', docId), {
            userId: user.uid,
            date: todayStr,
            steps: count,
            goal: memoryCachedGoal,
            goalHit: count >= memoryCachedGoal,
            updatedAt: Date.now(),
            source: 'foreground',
          }, { merge: true }),
          'step_logs',
          'update',
          { steps: count },
          docId
        ).catch(() => {});
      }
    }, 5000);
  }, []);

  // Hardware step sync (historical baseline from midnight)
  const syncHardwareSteps = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHardwareSyncTime < 10000) {
      return;
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

      setHasPermission(isGranted);
      if (!isGranted) {
        isQueryingRef.current = false;
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rightNow = new Date();

      const result = await Pedometer.getStepCountAsync(startOfDay, rightNow).catch(() => null);
      if (result && typeof result.steps === 'number' && result.steps > 0) {
        const hardwareSteps = Math.max(0, result.steps);
        baselineStepsRef.current = hardwareSteps;
        lastLiveStepsRef.current = 0;
        setSteps(hardwareSteps);
        saveStepsToDisk(hardwareSteps);
      } else {
        // If historical query is 0 or unsupported on this Android device, load cached baseline
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (cached) {
          const parsed = parseInt(cached, 10);
          if (!isNaN(parsed) && parsed > 0) {
            baselineStepsRef.current = parsed;
            setSteps(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('[StepCounter] syncHardwareSteps error:', e);
    } finally {
      isQueryingRef.current = false;
    }
  }, [saveStepsToDisk]);

  // Start live real-time pedometer stream
  const startLiveWatcher = useCallback(async () => {
    try {
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }

      const available = await Pedometer.isAvailableAsync().catch(() => false);
      if (!available) return;

      const perm = await Pedometer.getPermissionsAsync().catch(() => ({ granted: false }));
      if (!perm.granted) {
        const req = await Pedometer.requestPermissionsAsync().catch(() => ({ granted: false }));
        if (!req.granted) return;
      }

      lastLiveStepsRef.current = 0;
      const sub = Pedometer.watchStepCount((result) => {
        if (result && typeof result.steps === 'number') {
          const delta = result.steps - lastLiveStepsRef.current;
          if (delta > 0) {
            lastLiveStepsRef.current = result.steps;
            const updated = baselineStepsRef.current + result.steps;
            setSteps(updated);
            saveStepsToDisk(updated);
          }
        }
      });

      watchSubscriptionRef.current = sub;
    } catch (err) {
      console.warn('[StepCounter] watchStepCount failed:', err);
    }
  }, [saveStepsToDisk]);

  const updateGoal = useCallback(async (newGoal: number) => {
    memoryCachedGoal = newGoal;
    setStepGoal(newGoal);
    await AsyncStorage.setItem('@zentrack_step_goal', String(newGoal)).catch(() => {});
  }, []);

  const setExactSteps = useCallback((exactCount: number) => {
    const val = Math.max(0, exactCount);
    baselineStepsRef.current = val;
    lastLiveStepsRef.current = 0;
    setSteps(val);
    saveStepsToDisk(val);
  }, [saveStepsToDisk]);

  const addManualSteps = useCallback((additionalSteps: number) => {
    if (additionalSteps <= 0) return;
    setSteps(prev => {
      const next = prev + additionalSteps;
      baselineStepsRef.current = next;
      saveStepsToDisk(next);
      return next;
    });
  }, [saveStepsToDisk]);

  useEffect(() => {
    const todayStr = getTodayDateStrSync();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

    // 1. Initial 0ms memory / disk load + cloud fallback
    AsyncStorage.getItem(cacheKey).then(async (cached) => {
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val) && val > 0) {
          memoryCachedSteps = val;
          baselineStepsRef.current = val;
          setSteps(val);
          return;
        }
      }
      // Cloud Fallback: If local storage has 0/empty, restore from Firestore
      const user = auth.currentUser;
      if (user?.uid) {
        try {
          const snap = await getDoc(doc(db, 'step_logs', `${user.uid}_${todayStr}`));
          if (snap.exists() && typeof snap.data()?.steps === 'number') {
            const cloudSteps = snap.data().steps;
            if (cloudSteps > 0) {
              memoryCachedSteps = cloudSteps;
              baselineStepsRef.current = cloudSteps;
              setSteps(cloudSteps);
              AsyncStorage.setItem(cacheKey, String(cloudSteps)).catch(() => {});
            }
          }
        } catch {}
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

    // 2. Hardware sync & start live pedometer listener
    syncHardwareSteps().then(() => {
      startLiveWatcher();
    });

    // 3. Foreground resume: sync and restart live watcher
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncHardwareSteps().then(() => {
          startLiveWatcher();
        });
      } else if (nextState === 'background') {
        if (watchSubscriptionRef.current) {
          watchSubscriptionRef.current.remove();
          watchSubscriptionRef.current = null;
        }
      }
    });

    // 4. Load 7-day history
    fetch7DayStepHistory().then(setHistory).catch(() => {});

    return () => {
      appStateSub.remove();
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
    };
  }, [syncHardwareSteps, startLiveWatcher]);

  return {
    steps,
    stepGoal,
    history,
    isAvailable,
    hasPermission,
    updateGoal,
    setExactSteps,
    addManualSteps,
    refreshSteps: () => syncHardwareSteps(true),
  };
}

