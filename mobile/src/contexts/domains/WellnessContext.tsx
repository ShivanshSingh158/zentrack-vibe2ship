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
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import { UserGymPlanDoc, GymPlanDay } from "../../types/gym.types";
import type { GymLog, WaterLog, SleepLog, WeightLog } from "../MobileDataContext";
import { GYM_PLAN_ARNOLD, GYM_PLAN_PPL } from "../../data/gymPlan";
import { readWellnessCache, writeWellnessCache } from "../../utils/domainCache";

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
  applyMasterTemplate: (templateId: 'arnold' | 'ppl') => Promise<void>;
  /** Call this from any Gym screen to ensure the subscription is open. */
  ensureSubscribed: () => void;
  // Optimistic write helpers — WhatsApp pattern: show instantly, Firestore syncs in background.
  optimisticAddGymLog: (log: GymLog) => void;
  optimisticUpdateGymLog: (logId: string, partial: Partial<GymLog>) => void;
}

const WellnessContext = createContext<WellnessContextType | null>(null);

export function useWellnessData(): WellnessContextType {
  const ctx = useContext(WellnessContext);
  if (!ctx) throw new Error("useWellnessData must be inside WellnessProvider");
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
  const [gymLogs, setGymLogs]         = useState<GymLog[]>([]);
  const [gymLogsReady, setGymLogsReady] = useState(false);
  const [userGymPlan, setUserGymPlan] = useState<UserGymPlanDoc | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  // ── Offline-first boot: seed from AsyncStorage before Firestore responds ──
  useEffect(() => {
    let cancelled = false;
    readWellnessCache().then(cached => {
      if (cancelled) return;
      if (cached.gymLogs     && cached.gymLogs.length > 0)     { setGymLogs(prev     => prev.length === 0 ? cached.gymLogs!     : prev); setGymLogsReady(true); }
      if (cached.userGymPlan)                                  setUserGymPlan(prev   => prev === null    ? cached.userGymPlan! : prev);
      if (cached.waterLogs   && cached.waterLogs.length > 0)   setWaterLogs(prev   => prev.length === 0 ? cached.waterLogs!   : prev);
      if (cached.sleepLogs   && cached.sleepLogs.length > 0)   setSleepLogs(prev   => prev.length === 0 ? cached.sleepLogs!   : prev);
      if (cached.weightLogs  && cached.weightLogs.length > 0)  setWeightLogs(prev  => prev.length === 0 ? cached.weightLogs!  : prev);
    });
    return () => { cancelled = true; };
  }, []);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return; // idempotent
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GYM_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog));
        setGymLogs(fresh);
        setGymLogsReady(true);
        writeWellnessCache({ gymLogs: fresh });
      },
      err => console.error("[Wellness] gymLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      doc(db, COLLECTION.USER_GYM_PLANS, uid),
      docSnap => {
        const plan = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as unknown as UserGymPlanDoc : null;
        setUserGymPlan(plan);
        writeWellnessCache({ userGymPlan: plan });
      },
      err => console.error("[Wellness] userGymPlan", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WATER_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog));
        setWaterLogs(fresh);
        writeWellnessCache({ waterLogs: fresh });
      },
      err => console.error("[Wellness] waterLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SLEEP_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog));
        setSleepLogs(fresh);
        writeWellnessCache({ sleepLogs: fresh });
      },
      err => console.error("[Wellness] sleepLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, 'weight_logs'), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeightLog));
        setWeightLogs(fresh);
        writeWellnessCache({ weightLogs: fresh });
      },
      err => console.error("[Wellness] weightLogs", err)
    ));
  };

  // Reset on logout
  useEffect(() => {
    if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      setGymLogs([]);
      setGymLogsReady(false);
      setUserGymPlan(null);
      setWaterLogs([]);
      setSleepLogs([]);
      setWeightLogs([]);
    }
  }, [user]);

  // Cleanup on unmount
  useEffect(() => () => { unsubsRef.current.forEach(u => u()); }, []);

  const ensureSubscribed = () => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  };

  const updateMasterPlan = async (dayIndex: number, planDay: GymPlanDay) => {
    if (!user) return;
    const docRef = doc(db, "user_gym_plans", user.uid);
    const newCustomDays = { ...(userGymPlan?.customDays || {}), [dayIndex]: planDay };
    await setDoc(docRef, { userId: user.uid, customDays: newCustomDays, updatedAt: Date.now() }, { merge: true });
  };

  const applyMasterTemplate = async (templateId: 'arnold' | 'ppl') => {
    if (!user) return;
    const docRef = doc(db, "user_gym_plans", user.uid);
    const selectedPlan = templateId === 'ppl' ? GYM_PLAN_PPL : GYM_PLAN_ARNOLD;
    
    const newCustomDays: Record<number, GymPlanDay> = {};
    selectedPlan.forEach(d => {
      newCustomDays[d.dayIndex] = d;
    });
    
    await setDoc(docRef, { userId: user.uid, customDays: newCustomDays, updatedAt: Date.now() }, { merge: true });
  };

  const optimisticAddGymLog = (log: GymLog) => {
    setGymLogs(prev => {
      // Replace existing log for same date or prepend new
      const exists = prev.some(l => l.id === log.id || l.date === log.date);
      const next = exists ? prev.map(l => (l.id === log.id || l.date === log.date) ? log : l) : [log, ...prev];
      writeWellnessCache({ gymLogs: next });
      return next;
    });
    setGymLogsReady(true);
  };

  const optimisticUpdateGymLog = (logId: string, partial: Partial<GymLog>) => {
    setGymLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial } : l);
      writeWellnessCache({ gymLogs: next });
      return next;
    });
  };

  return (
    <WellnessContext.Provider value={{ gymLogs, gymLogsReady, userGymPlan, updateMasterPlan, applyMasterTemplate, waterLogs, sleepLogs, weightLogs, ensureSubscribed, optimisticAddGymLog, optimisticUpdateGymLog }}>
      {children}
    </WellnessContext.Provider>
  );
}
