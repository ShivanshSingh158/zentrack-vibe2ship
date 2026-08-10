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
import { InteractionManager } from 'react-native';
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
  updateFullMasterPlan: (newCustomDays: Record<number, GymPlanDay>) => Promise<void>;
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
  // ── Offline-first boot: seed from MMKV SYNCHRONOUSLY ──
  // Reads happen in < 5ms before the first render!
  const cached = useRef(readWellnessCache());
  
  const [gymLogs, setGymLogs]         = useState<GymLog[]>(cached.current.gymLogs || []);
  const [userGymPlan, setUserGymPlan] = useState<UserGymPlanDoc | null>(cached.current.userGymPlan || null);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>(cached.current.waterLogs || []);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>(cached.current.sleepLogs || []);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>(cached.current.weightLogs || []);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return; // idempotent
    subscribedRef.current = true;

    InteractionManager.runAfterInteractions(() => {
      // Small stagger to prevent burst if multiple contexts subscribe at exactly the same time
      setTimeout(() => {
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.GYM_LOGS), where("userId", "==", uid)),
          snap => {
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog));
            setGymLogs(fresh);
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
      }, 300);
    });
  };

  // Reset on logout
  useEffect(() => {
    if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      setGymLogs([]);
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

  const updateFullMasterPlan = async (newCustomDays: Record<number, GymPlanDay>) => {
    if (!user) return;
    const docRef = doc(db, "user_gym_plans", user.uid);
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
      const exists = prev.some(l => l.id === log.id || l.date === log.date);
      const next = exists ? prev.map(l => (l.id === log.id || l.date === log.date) ? log : l) : [log, ...prev];
      writeWellnessCache({ gymLogs: next });
      return next;
    });
  };

  const optimisticUpdateGymLog = (logId: string, partial: Partial<GymLog>) => {
    setGymLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial } : l);
      writeWellnessCache({ gymLogs: next });
      return next;
    });
  };

  // gymLogsReady: true if we have any gym logs (from cache OR Firestore).
  // Gym screens use this to decide whether to show a skeleton vs real content.
  const gymLogsReady = gymLogs.length > 0;

  return (
    <WellnessContext.Provider value={{ gymLogs, gymLogsReady, userGymPlan, updateMasterPlan, updateFullMasterPlan, applyMasterTemplate, waterLogs, sleepLogs, weightLogs, ensureSubscribed, optimisticAddGymLog, optimisticUpdateGymLog }}>
      {children}
    </WellnessContext.Provider>
  );
}
