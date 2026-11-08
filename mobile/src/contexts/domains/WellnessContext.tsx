/**
 * WellnessContext — ZenTrack Mobile
 *
 * Owns: waterLogs, sleepLogs, weightLogs.
 * Cleaned: Gym module completely removed.
 */
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, auth } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { WaterLog, SleepLog, WeightLog } from "../MobileDataContext";
import { writeWellnessCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { areItemsEqual } from "../../utils/schemaGuards";
import { formatLocalDateStr, offsetDateStr } from "../../utils/dateUtils";
import { checkAndTriggerWaterMilestones, clearScheduleCache } from "../../services/notifications";
import { applyPendingQueueOverlay } from "../../services/offlineSync";
import { safeWrite } from "../../utils/safeWrite";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface WellnessContextType {
  waterLogs: WaterLog[];
  sleepLogs: SleepLog[];
  weightLogs: WeightLog[];
  /** Call this from any Wellness consumer to ensure the subscription is open. */
  ensureSubscribed: () => void;
  optimisticAddWaterLog: (log: WaterLog) => void;
  optimisticDeleteWaterLog: (logId: string) => void;
  /** Consolidated water logging: optimistically updates local cache + safely writes to Firestore offline queue */
  logWater: (amountMl: number, explicitUserId?: string) => Promise<void>;
}

const DEFAULT_WELLNESS_DATA: WellnessContextType = {
  waterLogs: [],
  sleepLogs: [],
  weightLogs: [],
  ensureSubscribed: () => {},
  optimisticAddWaterLog: () => {},
  optimisticDeleteWaterLog: () => {},
  logWater: async () => {},
};

const WellnessContext = createContext<WellnessContextType | null>(null);

export function useWellnessData(): WellnessContextType {
  const ctx = useContext(WellnessContext);
  if (!ctx) {
    return DEFAULT_WELLNESS_DATA;
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function WellnessProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { uid: string } | null;
}) {
  const initialManifest = getBootManifestSync();
  const [waterLogs, setWaterLogs]   = useState<WaterLog[]>(initialManifest?.waterLogs ?? []);
  const [sleepLogs, setSleepLogs]   = useState<SleepLog[]>(initialManifest?.sleepLogs ?? []);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>(initialManifest?.weightLogs ?? []);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  const hasCachedDataRef = useRef((initialManifest?.waterLogs?.length ?? 0) > 0);

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[Wellness] ${context} listener error — restarting in 5s`, err.message);
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

  // ── Foreground reconnect: restart listeners after long background ─────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user?.uid]);

  // ── Offline-first boot: seed from boot manifest L1 cache in parallel ───────
  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if ((manifest.waterLogs?.length ?? 0) > 0) {
          setWaterLogs(prev => prev.length === 0 ? manifest.waterLogs : prev);
          seeded = true;
        }
        if ((manifest.sleepLogs?.length ?? 0) > 0) {
          setSleepLogs(prev => prev.length === 0 ? manifest.sleepLogs : prev);
          seeded = true;
        }
        if ((manifest.weightLogs?.length ?? 0) > 0) {
          setWeightLogs(prev => prev.length === 0 ? manifest.weightLogs : prev);
          seeded = true;
        }
        if (seeded) hasCachedDataRef.current = true;
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, [user?.uid]);

  const deferredInteractionRef = useRef<{ cancel: () => void } | null>(null);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const wellnessCutoffDateStr = offsetDateStr(formatLocalDateStr(new Date()), -90);

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WATER_LOGS), where("userId", "==", uid), where("date", ">=", wellnessCutoffDateStr)),
      snap => {
        if (snap.metadata.hasPendingWrites) return;
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.WATER_LOGS, snap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog)));
          setWaterLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeWellnessCache({ waterLogs: fresh }));
        });
      },
      scheduleListenerRestart("waterLogs")
    ));

    deferredInteractionRef.current?.cancel();
    deferredInteractionRef.current = InteractionManager.runAfterInteractions(() => {
      if (!subscribedRef.current) return;
      unsubsRef.current.push(onSnapshot(
        query(collection(db, COLLECTION.SLEEP_LOGS), where("userId", "==", uid), where("date", ">=", wellnessCutoffDateStr)),
        snap => {
          if (snap.metadata.hasPendingWrites) return;
          if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = applyPendingQueueOverlay(COLLECTION.SLEEP_LOGS, snap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog)));
            setSleepLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
            InteractionManager.runAfterInteractions(() => writeWellnessCache({ sleepLogs: fresh }));
          });
        },
        scheduleListenerRestart("sleepLogs")
      ));

      unsubsRef.current.push(onSnapshot(
        query(collection(db, COLLECTION.WEIGHT_LOGS), where("userId", "==", uid)),
        snap => {
          if (snap.metadata.hasPendingWrites) return;
          if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = applyPendingQueueOverlay(COLLECTION.WEIGHT_LOGS, snap.docs.map(d => ({ id: d.id, ...d.data() } as WeightLog)));
            setWeightLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
            InteractionManager.runAfterInteractions(() => writeWellnessCache({ weightLogs: fresh }));
          });
        },
        scheduleListenerRestart("weightLogs")
      ));
    });
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (!user?.uid) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      return;
    }
    openSubscriptions(user.uid);
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user?.uid, subscriptionVersion, openSubscriptions]);

  const ensureSubscribed = useCallback(() => {
    if (user?.uid && !subscribedRef.current) {
      openSubscriptions(user.uid);
    }
  }, [user?.uid, openSubscriptions]);

  const waterLogsRef = useRef<WaterLog[]>(waterLogs);
  useEffect(() => {
    waterLogsRef.current = waterLogs;
  }, [waterLogs]);

  const optimisticAddWaterLog = useCallback((log: WaterLog) => {
    const todayStr = formatLocalDateStr(new Date());
    const prev = waterLogsRef.current || [];
    const previousToday = prev
      .filter(w => (w.date || '').slice(0, 10) === todayStr)
      .reduce((sum, w) => sum + (w.amountMl || 0), 0);
    const newToday = previousToday + (log.amountMl || 0);

    const next = [log, ...prev.filter(w => w.id !== log.id)];
    waterLogsRef.current = next;
    setWaterLogs(next);
    writeWellnessCache({ waterLogs: next }, true);
    clearScheduleCache();

    AsyncStorage.getItem('zentrack_water_goal_ml')
      .then(savedGoal => {
        const goal = savedGoal ? parseInt(savedGoal, 10) : 3800;
        return checkAndTriggerWaterMilestones(previousToday, newToday, goal);
      })
      .catch(() => {});
  }, []);

  const optimisticDeleteWaterLog = useCallback((logId: string) => {
    const prev = waterLogsRef.current || [];
    const next = prev.filter(l => l.id !== logId);
    waterLogsRef.current = next;
    setWaterLogs(next);
    writeWellnessCache({ waterLogs: next }, true);
    clearScheduleCache();
  }, []);

  const logWater = useCallback(async (amountMl: number, explicitUserId?: string) => {
    if (amountMl <= 0) return;
    const todayStr = formatLocalDateStr(new Date());
    const now = Date.now();
    const uid = explicitUserId || auth.currentUser?.uid || '';
    const waterRef = doc(collection(db, COLLECTION.WATER_LOGS));
    const logId = waterRef.id;

    const payload: WaterLog = {
      id: logId,
      userId: uid,
      date: todayStr,
      amountMl,
      timestamp: now,
      createdAt: now,
    };

    optimisticAddWaterLog(payload);

    try {
      await safeWrite(
        () => setDoc(waterRef, payload),
        COLLECTION.WATER_LOGS,
        'set',
        payload,
        logId
      );
    } catch (e) {
      console.warn('[WellnessContext] Error persisting water log:', e);
    }
  }, [optimisticAddWaterLog]);

  const value = useMemo(() => ({
    waterLogs, sleepLogs, weightLogs, ensureSubscribed,
    optimisticAddWaterLog, optimisticDeleteWaterLog, logWater
  }), [
    waterLogs, sleepLogs, weightLogs, ensureSubscribed,
    optimisticAddWaterLog, optimisticDeleteWaterLog, logWater
  ]);

  return (
    <WellnessContext.Provider value={value}>
      {children}
    </WellnessContext.Provider>
  );
}
