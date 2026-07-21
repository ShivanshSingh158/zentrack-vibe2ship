/**
 * WellnessContext — ZenTrack Mobile
 *
 * Owns: gymLogs, userGymPlan, updateMasterPlan.
 *
 * Subscription strategy: DEMAND-BASED.
 * Opens subscriptions the first time a consumer calls useWellnessData()
 * AND the user is authenticated. Stays open until logout.
 * Gym screens that open this cause the subscriptions to open once; after that
 * every subsequent visit is free (already cached in state).
 */
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import { UserGymPlanDoc, GymPlanDay } from "../../types/gym.types";
import type { GymLog, WaterLog, SleepLog, WeightLog } from "../MobileDataContext";

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
  /** Call this from any Gym screen to ensure the subscription is open. */
  ensureSubscribed: () => void;
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
  // gymLogsReady: false until the FIRST onSnapshot fires (even if result is empty array).
  // This prevents useGymLog from treating [] as "no history" before Firestore has responded.
  const [gymLogsReady, setGymLogsReady] = useState(false);
  const [userGymPlan, setUserGymPlan] = useState<UserGymPlanDoc | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return; // idempotent
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GYM_LOGS), where("userId", "==", uid)),
      snap => {
        setGymLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog)));
        setGymLogsReady(true); // ← mark ready after first snapshot, even if empty
      },
      err => console.error("[Wellness] gymLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      doc(db, COLLECTION.USER_GYM_PLANS, uid),
      docSnap => setUserGymPlan(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as unknown as UserGymPlanDoc : null),
      err => console.error("[Wellness] userGymPlan", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WATER_LOGS), where("userId", "==", uid)),
      snap => setWaterLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog))),
      err => console.error("[Wellness] waterLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SLEEP_LOGS), where("userId", "==", uid)),
      snap => setSleepLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog))),
      err => console.error("[Wellness] sleepLogs", err)
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, 'weight_logs'), where("userId", "==", uid)),
      snap => setWeightLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WeightLog))),
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

  return (
    <WellnessContext.Provider value={{ gymLogs, gymLogsReady, userGymPlan, updateMasterPlan, waterLogs, sleepLogs, weightLogs, ensureSubscribed }}>
      {children}
    </WellnessContext.Provider>
  );
}
