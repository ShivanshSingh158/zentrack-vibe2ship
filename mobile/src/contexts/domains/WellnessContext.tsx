/**
 * WellnessContext — ZenTrack Mobile
 *
 * Owns: gymLogs, userGymPlan, updateMasterPlan.
 *
 * Subscription strategy: DEMAND-BASED + OFFLINE-FIRST.
 * On mount: reads gymLogs/waterLogs/sleepLogs/weightLogs/userGymPlan from
 * AsyncStorage instantly (~5ms). Gym screens show real data immediately,
 * even when offline. Firestore snapshots silently update the cache when online.
 */
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import { UserGymPlanDoc, GymPlanDay } from "../../types/gym.types";
import type { GymLog, WaterLog, SleepLog, WeightLog } from "../MobileDataContext";
import { GYM_PLAN_ARNOLD, GYM_PLAN_PPL } from "../../data/gymPlan";
import { writeWellnessCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync } from "../../utils/bootManifest";
import { parseGymLog, areItemsEqual } from "../../utils/schemaGuards";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface WellnessContextType {
  gymLogs: GymLog[];
  /** true once the FIRST Firestore gymLogs snapshot has fired — safe to initialise from */
  gymLogsReady: boolean;
  waterLogs: WaterLog[];
  sleepLogs: SleepLog[];
  weightLogs: WeightLog[];
  userGymPlan: UserGymPlanDoc | null;
  updateMasterPlan: (dayIndex: number, planDay: GymPlanDay) => Promise<void>;
  updateFullMasterPlan: (newCustomDays: Record<number, GymPlanDay>) => Promise<void>;
  applyMasterTemplate: (templateId: 'arnold' | 'ppl', schedulePattern?: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => Promise<Record<number, GymPlanDay> | undefined>;
  /** Call this from any Gym screen to ensure the subscription is open. */
  ensureSubscribed: () => void;
  // Optimistic write helpers — WhatsApp pattern: show instantly, Firestore syncs in background.
  optimisticAddGymLog: (log: GymLog) => void;
  optimisticUpdateGymLog: (logId: string, partial: Partial<GymLog>) => void;
}

const DEFAULT_WELLNESS_DATA: WellnessContextType = {
  gymLogs: [],
  gymLogsReady: false,
  waterLogs: [],
  sleepLogs: [],
  weightLogs: [],
  userGymPlan: null,
  updateMasterPlan: async () => {},
  updateFullMasterPlan: async () => {},
  applyMasterTemplate: async () => undefined,
  ensureSubscribed: () => {},
  optimisticAddGymLog: () => {},
  optimisticUpdateGymLog: () => {},
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
  const [gymLogs, setGymLogs]           = useState<GymLog[]>(initialManifest?.gymLogs ?? []);
  // gymLogsSnapshotFired: true once the FIRST Firestore gymLogs snapshot fires (even if empty).
  // This is the correct "ready" signal — not `gymLogs.length > 0` which is always false
  // for new users and breaks the loading skeleton logic.
  const [gymLogsSnapshotFired, setGymLogsSnapshotFired] = useState(false);
  const [userGymPlan, setUserGymPlan]   = useState<UserGymPlanDoc | null>(initialManifest?.userGymPlan ?? null);
  const [waterLogs, setWaterLogs]       = useState<WaterLog[]>(initialManifest?.waterLogs ?? []);
  const [sleepLogs, setSleepLogs]       = useState<SleepLog[]>(initialManifest?.sleepLogs ?? []);
  const [weightLogs, setWeightLogs]     = useState<WeightLog[]>(initialManifest?.weightLogs ?? []);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  // OFFLINE-FIRST GUARD: tracks whether any cached data has been seeded.
  const hasCachedDataRef = useRef(
    (initialManifest?.gymLogs?.length ?? 0) > 0 ||
    !!initialManifest?.userGymPlan ||
    (initialManifest?.waterLogs?.length ?? 0) > 0
  );

  // Fallback hydration: handles cold-start race conditions seamlessly
  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        setGymLogs(prev => prev.length === 0 && (manifest.gymLogs?.length ?? 0) > 0 ? manifest.gymLogs : prev);
        setUserGymPlan(prev => !prev && manifest.userGymPlan ? manifest.userGymPlan : prev);
        setWaterLogs(prev => prev.length === 0 && (manifest.waterLogs?.length ?? 0) > 0 ? manifest.waterLogs : prev);
        setSleepLogs(prev => prev.length === 0 && (manifest.sleepLogs?.length ?? 0) > 0 ? manifest.sleepLogs : prev);
        setWeightLogs(prev => prev.length === 0 && (manifest.weightLogs?.length ?? 0) > 0 ? manifest.weightLogs : prev);
        if ((manifest.gymLogs?.length ?? 0) > 0 || !!manifest.userGymPlan || (manifest.waterLogs?.length ?? 0) > 0) {
          hasCachedDataRef.current = true;
        }
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, []);

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[Wellness] ${context} listener error — restarting in 5s`, err.message);
    if (retryTimerRef.current) return; // already scheduled
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;  // allow openSubscriptions to re-enter
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

  // ── Foreground reconnect: restart listeners after long background ─────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[Wellness] foreground reconnect — restarting Firestore listeners');
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user?.uid]);

  // ── Offline-first boot: seed from boot manifest L1 cache immediately ───────
  // If getBootManifestSync() already populated state on Frame 0, this does 0 re-renders.
  useEffect(() => {
    let cancelled = false;
    loadBootManifest().then(manifest => {
      if (cancelled) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if (gymLogs.length === 0 && Array.isArray(manifest.gymLogs) && manifest.gymLogs.length > 0)       { setGymLogs(manifest.gymLogs); seeded = true; }
        if (!userGymPlan && manifest.userGymPlan)                                                         { setUserGymPlan(manifest.userGymPlan); seeded = true; }
        if (waterLogs.length === 0 && Array.isArray(manifest.waterLogs) && manifest.waterLogs.length > 0)    { setWaterLogs(manifest.waterLogs); seeded = true; }
        if (sleepLogs.length === 0 && Array.isArray(manifest.sleepLogs) && manifest.sleepLogs.length > 0)    { setSleepLogs(manifest.sleepLogs); seeded = true; }
        if (weightLogs.length === 0 && Array.isArray(manifest.weightLogs) && manifest.weightLogs.length > 0)  { setWeightLogs(manifest.weightLogs); seeded = true; }
        if (seeded) hasCachedDataRef.current = true;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.uid]);


  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return; // idempotent
    subscribedRef.current = true;

    // ── Critical-path subscriptions: open IMMEDIATELY ────────────────────────
    // gymLogs and userGymPlan are shown on Dashboard via WellnessContext.
    // These MUST open immediately so the Gym screen shows real data on first paint.
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GYM_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseGymLog(d.data(), d.id));
          setGymLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          setGymLogsSnapshotFired(true);
          InteractionManager.runAfterInteractions(() => writeWellnessCache({ gymLogs: fresh }));
        });
      },
      scheduleListenerRestart("gymLogs")
    ));

    unsubsRef.current.push(onSnapshot(
      doc(db, COLLECTION.USER_GYM_PLANS, uid),
      docSnap => {
        unstable_batchedUpdates(() => {
          const plan = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as unknown as UserGymPlanDoc : null;
          if (!plan && hasCachedDataRef.current) return;
          setUserGymPlan(prev => JSON.stringify(prev) === JSON.stringify(plan) ? prev : plan);
          InteractionManager.runAfterInteractions(() => writeWellnessCache({ userGymPlan: plan }));
        });
      },
      scheduleListenerRestart("userGymPlan")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WATER_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog));
          setWaterLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeWellnessCache({ waterLogs: fresh }));
        });
      },
      scheduleListenerRestart("waterLogs")
    ));

    InteractionManager.runAfterInteractions(() => {
      if (!subscribedRef.current) return;

      unsubsRef.current.push(onSnapshot(
        query(collection(db, COLLECTION.SLEEP_LOGS), where("userId", "==", uid)),
        snap => {
          if (snap.docs.length === 0 && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog));
            setSleepLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
            InteractionManager.runAfterInteractions(() => writeWellnessCache({ sleepLogs: fresh }));
          });
        },
        scheduleListenerRestart("sleepLogs")
      ));

      unsubsRef.current.push(onSnapshot(
        query(collection(db, 'weight_logs'), where("userId", "==", uid)),
        snap => {
          if (snap.docs.length === 0 && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeightLog));
            setWeightLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
            InteractionManager.runAfterInteractions(() => writeWellnessCache({ weightLogs: fresh }));
          });
        },
        scheduleListenerRestart("weightLogs")
      ));
    });
  }, [scheduleListenerRestart]);


  // Reset or open on user change.
  // subscriptionVersion is included so a listener error retry (scheduleListenerRestart)
  // cleanly re-runs this effect and re-opens all subscriptions.
  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user?.uid, subscriptionVersion, openSubscriptions]);

  // Cleanup on unmount
  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user, openSubscriptions]);

  const updateMasterPlan = async (dayIndex: number, planDay: GymPlanDay) => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.USER_GYM_PLANS, user.uid);
    const newCustomDays = { ...(userGymPlan?.customDays || {}), [dayIndex]: planDay };
    const now = Date.now();
    const updatedPlan: UserGymPlanDoc = {
      id: user.uid,
      userId: user.uid,
      templateId: userGymPlan?.templateId,
      schedulePattern: userGymPlan?.schedulePattern,
      customDays: newCustomDays,
      updatedAt: now,
    };
    setUserGymPlan(updatedPlan);
    writeWellnessCache({ userGymPlan: updatedPlan }, true); // immediate: user save action
    await setDoc(docRef, { userId: user.uid, customDays: newCustomDays, updatedAt: now }, { merge: true });
  };

  const updateFullMasterPlan = async (newCustomDays: Record<number, GymPlanDay>) => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.USER_GYM_PLANS, user.uid);
    const now = Date.now();
    const updatedPlan: UserGymPlanDoc = {
      id: user.uid,
      userId: user.uid,
      templateId: userGymPlan?.templateId,
      schedulePattern: userGymPlan?.schedulePattern,
      customDays: newCustomDays,
      updatedAt: now,
    };
    setUserGymPlan(updatedPlan);
    writeWellnessCache({ userGymPlan: updatedPlan }, true); // immediate: user save action
    await setDoc(docRef, { userId: user.uid, customDays: newCustomDays, updatedAt: now }, { merge: true });
  };

  const applyMasterTemplate = async (
    templateId: 'arnold' | 'ppl', 
    schedulePattern: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri' = 'mon_sun'
  ) => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.USER_GYM_PLANS, user.uid);
    const selectedPlan = templateId === 'ppl' ? GYM_PLAN_PPL : GYM_PLAN_ARNOLD;
    
    // Base workout days (dayIndex 1 to 6)
    const workoutDays = selectedPlan.filter(d => !d.isRest);
    const restDayTemplate: GymPlanDay = { 
      dayIndex: 7, 
      name: 'Rest & Recovery', 
      subtitle: 'Active recovery, hydration & sleep',
      focus: 'Active recovery, hydration & sleep', 
      isRest: true, 
      exercises: [] 
    };

    const newCustomDays: Record<number, GymPlanDay> = {};

    if (schedulePattern === 'mon_sun') {
      // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7(Rest)
      workoutDays.forEach((d, idx) => {
        newCustomDays[idx + 1] = { ...d, dayIndex: idx + 1, isRest: false };
      });
      newCustomDays[7] = { ...restDayTemplate, dayIndex: 7, isRest: true, exercises: [] };
    } else if (schedulePattern === 'tue_mon') {
      // Mon=1(Rest), Tue=2(Day1), Wed=3(Day2), Thu=4(Day3), Fri=5(Day4), Sat=6(Day5), Sun=7(Day6)
      newCustomDays[1] = { ...restDayTemplate, dayIndex: 1, isRest: true, exercises: [] };
      workoutDays.forEach((d, idx) => {
        newCustomDays[idx + 2] = { ...d, dayIndex: idx + 2, isRest: false };
      });
    } else if (schedulePattern === 'wed_sun') {
      // Mon=Day1, Tue=Day2, Wed=Rest, Thu=Day3, Fri=Day4, Sat=Day5, Sun=Rest
      newCustomDays[1] = { ...workoutDays[0], dayIndex: 1, isRest: false };
      newCustomDays[2] = { ...workoutDays[1], dayIndex: 2, isRest: false };
      newCustomDays[3] = { ...restDayTemplate, dayIndex: 3, isRest: true, exercises: [] };
      newCustomDays[4] = { ...workoutDays[2], dayIndex: 4, isRest: false };
      newCustomDays[5] = { ...workoutDays[3], dayIndex: 5, isRest: false };
      newCustomDays[6] = { ...workoutDays[4], dayIndex: 6, isRest: false };
      newCustomDays[7] = { ...restDayTemplate, dayIndex: 7, isRest: true, exercises: [] };
    } else if (schedulePattern === 'mon_fri') {
      // Mon=Day1, Tue=Day2, Wed=Day3, Thu=Day4, Fri=Day5, Sat=Rest, Sun=Rest
      workoutDays.slice(0, 5).forEach((d, idx) => {
        newCustomDays[idx + 1] = { ...d, dayIndex: idx + 1, isRest: false };
      });
      newCustomDays[6] = { ...restDayTemplate, dayIndex: 6, isRest: true, exercises: [] };
      newCustomDays[7] = { ...restDayTemplate, dayIndex: 7, isRest: true, exercises: [] };
    }

    const now = Date.now();
    const updatedPlan: UserGymPlanDoc = {
      id: user.uid,
      userId: user.uid,
      templateId,
      schedulePattern,
      customDays: newCustomDays,
      updatedAt: now,
    };

    setUserGymPlan(updatedPlan);
    writeWellnessCache({ userGymPlan: updatedPlan }, true); // immediate: user save action

    await setDoc(docRef, { userId: user.uid, templateId, schedulePattern, customDays: newCustomDays, updatedAt: now }, { merge: true });

    // Clean up unstarted gym logs for the current week so they immediately adopt the new template
    try {
      const todayObj = new Date();
      const currentDayOfWeek = todayObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
      const monday = new Date(todayObj);
      monday.setDate(todayObj.getDate() + mondayOffset);

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        weekDates.push(`${y}-${m}-${day}`);
      }

      // Purge local cache for unworked days of this week
      for (const dStr of weekDates) {
        AsyncStorage.removeItem(`@gym_log_${dStr}`).catch(() => {});
      }

      // Filter in-memory logs to strip unstarted logs and trigger fresh instantiation
      setGymLogs(prev => {
        const next = prev.filter(l => {
          if (!weekDates.includes(l.date)) return true;
          const hasLoggedSets = (l.exercises || []).some((ex: any) =>
            (ex.setsLog || []).some((s: any) => s.completed || (s.weight != null && Number(s.weight) > 0) || (s.reps != null && Number(s.reps) > 0))
          );
          // Keep completed or active workouts
          return l.completed || l.workoutStartTime || hasLoggedSets;
        });
        writeWellnessCache({ gymLogs: next }, true); // immediate: template apply
        return next;
      });
    } catch (e) {
      console.warn('[Wellness] Error clearing unstarted week logs on template apply:', e);
    }

    return newCustomDays;
  };

  const optimisticAddGymLog = (log: GymLog) => {
    setGymLogs(prev => {
      const exists = prev.some(l => l.id === log.id || l.date === log.date);
      const next = exists ? prev.map(l => (l.id === log.id || l.date === log.date) ? log : l) : [log, ...prev];
      writeWellnessCache({ gymLogs: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticUpdateGymLog = (logId: string, partial: Partial<GymLog>) => {
    setGymLogs(prev => {
      const next = prev.map(l => {
        if (l.id === logId || (partial.date && l.date === partial.date)) {
          const merged: GymLog = { ...l, ...partial };
          if (partial.workoutStartTime === undefined || partial.completed) {
            delete (merged as any).workoutStartTime;
          }
          return merged;
        }
        return l;
      });
      writeWellnessCache({ gymLogs: next }, true); // immediate: optimistic update
      return next;
    });
  };

  // gymLogsReady: true once the first Firestore snapshot has fired (even if user has no logs).
  // Previously derived as `gymLogs.length > 0` which was always false for new users,
  // causing an infinite loading skeleton. Now a proper boolean sentinel.
  const gymLogsReady = gymLogsSnapshotFired;

  const value = useMemo(() => ({
    gymLogs, gymLogsReady, userGymPlan, updateMasterPlan, updateFullMasterPlan, applyMasterTemplate,
    waterLogs, sleepLogs, weightLogs, ensureSubscribed, optimisticAddGymLog, optimisticUpdateGymLog
  }), [
    gymLogs, gymLogsReady, userGymPlan, updateMasterPlan, updateFullMasterPlan, applyMasterTemplate,
    waterLogs, sleepLogs, weightLogs, ensureSubscribed
  ]);

  return (
    <WellnessContext.Provider value={value}>
      {children}
    </WellnessContext.Provider>
  );
}
