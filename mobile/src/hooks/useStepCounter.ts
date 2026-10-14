import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { safeWrite } from '../utils/safeWrite';

export const STEP_GOAL_DEFAULT = 8000;
export const STEP_CACHE_KEY_PREFIX = '@zentrack_steps_';

export interface DayStepData {
  dateStr: string;
  dayLabel: string;
  steps: number;
}

export function formatStepsDistance(steps: number): string {
  const km = steps * 0.00076;
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

export function getTodayDateStrSync(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

let memoryCachedDate = getTodayDateStrSync();
let memoryCachedSteps = 0;
let memoryCachedGoal = STEP_GOAL_DEFAULT;
let lastHardwareSyncTime = 0;

function getValidMemorySteps(todayStr: string): number {
  if (memoryCachedDate !== todayStr) {
    memoryCachedDate = todayStr;
    memoryCachedSteps = 0;
  }
  return memoryCachedSteps;
}

export async function fetch7DayStepHistory(): Promise<DayStepData[]> {
  const result: DayStepData[] = [];
  const now = new Date();
  const todayStr = getTodayDateStrSync();
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
      const memToday = getValidMemorySteps(todayStr);
      if (i === 0 && memToday > 0) {
        stepCount = memToday;
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
  const initialToday = getTodayDateStrSync();
  const [steps, setSteps] = useState<number>(() => getValidMemorySteps(initialToday));
  const [stepGoal, setStepGoal] = useState<number>(memoryCachedGoal);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [history, setHistory] = useState<DayStepData[]>([]);

  const isMountedRef = useRef<boolean>(true);
  const isQueryingRef = useRef<boolean>(false);
  const baselineStepsRef = useRef<number>(getValidMemorySteps(initialToday));
  const lastLiveStepsRef = useRef<number>(0);
  const watchSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const firestoreSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveStepsToDisk = useCallback((count: number) => {
    const todayStr = getTodayDateStrSync();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;
    memoryCachedDate = todayStr;
    memoryCachedSteps = count;
    AsyncStorage.setItem(cacheKey, String(count)).catch(() => {});

    if (firestoreSyncDebounceRef.current) {
      clearTimeout(firestoreSyncDebounceRef.current);
    }
    firestoreSyncDebounceRef.current = setTimeout(() => {
      firestoreSyncDebounceRef.current = null;
      const user = auth.currentUser;
      if (user?.uid) {
        const docId = `${user.uid}_${todayStr}`;
        const payload = {
          userId: user.uid,
          date: todayStr,
          steps: count,
          goal: memoryCachedGoal,
          goalHit: count >= memoryCachedGoal,
          updatedAt: Date.now(),
          source: 'foreground',
        };
        safeWrite(
          () => setDoc(doc(db, 'step_logs', docId), payload, { merge: true }),
          'step_logs',
          'set',
          payload,
          docId
        ).catch(() => {});
      }
    }, 5000);
  }, []);

  const syncHardwareSteps = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHardwareSyncTime < 10000) return;
    if (isQueryingRef.current) return;
    isQueryingRef.current = true;
    lastHardwareSyncTime = now;

    try {
      const todayStr = getTodayDateStrSync();
      const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

      const available = await Pedometer.isAvailableAsync().catch(() => false);
      if (isMountedRef.current) setIsAvailable(available);
      if (!available) return;

      const perm = await Pedometer.getPermissionsAsync().catch(() => ({ granted: false }));
      let isGranted = perm.granted;
      if (!isGranted) {
        const req = await Pedometer.requestPermissionsAsync().catch(() => ({ granted: false }));
        isGranted = req.granted;
      }
      if (isMountedRef.current) setHasPermission(isGranted);
      if (!isGranted) return;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rightNow = new Date();

      const result = await Pedometer.getStepCountAsync(startOfDay, rightNow).catch(() => null);
      if (result && typeof result.steps === 'number' && result.steps > 0) {
        const hardwareSteps = Math.max(0, result.steps);
        baselineStepsRef.current = hardwareSteps;
        lastLiveStepsRef.current = 0;
        if (isMountedRef.current) setSteps(hardwareSteps);
        saveStepsToDisk(hardwareSteps);
      } else {
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (cached) {
          const parsed = parseInt(cached, 10);
          if (!isNaN(parsed) && parsed > 0) {
            baselineStepsRef.current = parsed;
            lastLiveStepsRef.current = 0;
            if (isMountedRef.current) setSteps(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('[StepCounter] syncHardwareSteps error:', e);
    } finally {
      isQueryingRef.current = false;
    }
  }, [saveStepsToDisk]);

  const startLiveWatcher = useCallback(async () => {
    try {
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }

      const available = await Pedometer.isAvailableAsync().catch(() => false);
      if (!available || !isMountedRef.current) return;

      const perm = await Pedometer.getPermissionsAsync().catch(() => ({ granted: false }));
      if (!perm.granted) return;

      lastLiveStepsRef.current = 0;
      const sub = Pedometer.watchStepCount((result) => {
        if (!isMountedRef.current) return;
        if (result && typeof result.steps === 'number') {
          const delta = result.steps - lastLiveStepsRef.current;
          if (delta > 0) {
            lastLiveStepsRef.current = result.steps;
            baselineStepsRef.current += delta;
            const updated = baselineStepsRef.current;
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
    const next = baselineStepsRef.current + additionalSteps;
    baselineStepsRef.current = next;
    setSteps(next);
    saveStepsToDisk(next);
  }, [saveStepsToDisk]);

  useEffect(() => {
    isMountedRef.current = true;
    const todayStr = getTodayDateStrSync();
    const cacheKey = `${STEP_CACHE_KEY_PREFIX}${todayStr}`;

    AsyncStorage.getItem(cacheKey).then(async (cached) => {
      if (!isMountedRef.current) return;
      if (cached) {
        const val = parseInt(cached, 10);
        if (!isNaN(val) && val > 0) {
          memoryCachedDate = todayStr;
          memoryCachedSteps = val;
          baselineStepsRef.current = val;
          setSteps(val);
          return;
        }
      }
      const user = auth.currentUser;
      if (user?.uid) {
        try {
          const snap = await getDoc(doc(db, 'step_logs', `${user.uid}_${todayStr}`));
          if (isMountedRef.current && snap.exists() && typeof snap.data()?.steps === 'number') {
            const cloudSteps = snap.data().steps;
            if (cloudSteps > 0) {
              memoryCachedDate = todayStr;
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
      if (!isMountedRef.current || !goal) return;
      const g = parseInt(goal, 10);
      if (!isNaN(g) && g > 0) {
        memoryCachedGoal = g;
        setStepGoal(g);
      }
    }).catch(() => {});

    syncHardwareSteps().then(() => {
      if (isMountedRef.current) startLiveWatcher();
    });

    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncHardwareSteps().then(() => {
          if (isMountedRef.current) startLiveWatcher();
        });
      } else if (nextState === 'background') {
        if (watchSubscriptionRef.current) {
          watchSubscriptionRef.current.remove();
          watchSubscriptionRef.current = null;
        }
      }
    });

    fetch7DayStepHistory().then(h => {
      if (isMountedRef.current) setHistory(h);
    }).catch(() => {});

    return () => {
      isMountedRef.current = false;
      appStateSub.remove();
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
      if (firestoreSyncDebounceRef.current) {
        clearTimeout(firestoreSyncDebounceRef.current);
        firestoreSyncDebounceRef.current = null;
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
