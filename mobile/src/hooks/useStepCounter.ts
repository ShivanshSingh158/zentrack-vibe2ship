/**
 * useStepCounter.ts — ZenTrack Mobile
 *
 * Provides live step count data.
 * - Foreground: live updates via Pedometer.watchStepCount()
 * - Background: syncs to Firestore every 15 min via registerStepSyncTask()
 * - On mount: reads cached Firestore value instantly, then overlays live sensor
 */

import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import {
  syncStepsNow,
  getTodayStepsFromFirestore,
  registerStepSyncTask,
  STEP_DAILY_GOAL,
  getTodayDateKey,
} from '../services/stepCounterService';

export interface StepCounterState {
  steps: number;
  goal: number;
  percent: number;            // 0–100
  goalHit: boolean;
  isAvailable: boolean;       // hardware sensor available on this device
  permissionGranted: boolean;
  lastSynced: number | null;  // Date.now() of last Firestore write
  isLoading: boolean;
}

const DEFAULT_STATE: StepCounterState = {
  steps: 0,
  goal: STEP_DAILY_GOAL,
  percent: 0,
  goalHit: false,
  isAvailable: false,
  permissionGranted: false,
  lastSynced: null,
  isLoading: true,
};

export function useStepCounter(): StepCounterState {
  const { user } = useCoreData();
  const [state, setState] = useState<StepCounterState>(DEFAULT_STATE);
  const liveSubRef = useRef<{ remove(): void } | null>(null);
  const todayKey = getTodayDateKey();

  // Helper to update steps while keeping other state intact
  const setSteps = (steps: number, source: 'live' | 'firestore', updatedAt?: number) => {
    setState(prev => ({
      ...prev,
      steps,
      percent: Math.min(100, Math.round((steps / STEP_DAILY_GOAL) * 100)),
      goalHit: steps >= STEP_DAILY_GOAL,
      lastSynced: source === 'firestore' ? (updatedAt ?? prev.lastSynced) : prev.lastSynced,
      isLoading: false,
    }));
  };

  useEffect(() => {
    if (!user) {
      setState({ ...DEFAULT_STATE, isLoading: false });
      return;
    }

    // Android-only: iOS uses HealthKit which requires special entitlements
    if (Platform.OS !== 'android') {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    let isMounted = true;

    async function init() {
      // 1. Immediately show Firestore cached value (feels instant)
      const cached = await getTodayStepsFromFirestore(user!.uid);
      if (isMounted && cached) {
        setSteps(cached.steps, 'firestore', cached.updatedAt);
      }

      // 2. Check + request sensor permission
      const { granted } = await Pedometer.getPermissionsAsync();
      let permissionGranted = granted;
      if (!granted) {
        const req = await Pedometer.requestPermissionsAsync();
        permissionGranted = req.granted;
      }

      // 3. Check hardware availability
      const available = await Pedometer.isAvailableAsync();

      if (isMounted) {
        setState(prev => ({ ...prev, isAvailable: available, permissionGranted }));
      }

      if (!available || !permissionGranted) {
        if (isMounted) setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // 4. Foreground live watcher — updates every step in real time
      liveSubRef.current = Pedometer.watchStepCount(result => {
        if (isMounted) setSteps(result.steps, 'live');
      });

      // 5. Do a fresh Firestore sync now (foreground)
      await syncStepsNow(user!.uid);
      const fresh = await getTodayStepsFromFirestore(user!.uid);
      if (isMounted && fresh) {
        setSteps(fresh.steps, 'firestore', fresh.updatedAt);
      }

      // 6. Register background task (no-op if already registered)
      await registerStepSyncTask();
    }

    init().catch(e => console.warn('[useStepCounter] init error:', e));

    return () => {
      isMounted = false;
      liveSubRef.current?.remove();
    };
  }, [user?.uid, todayKey]); // re-init on new day

  return state;
}
