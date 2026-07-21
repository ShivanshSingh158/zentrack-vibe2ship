 /**
 * PlannerContext — ZenTrack Mobile
 *
 * Owns: customEvents (calendar), goals, weeklyReviews.
 *
 * Subscription strategy: DEMAND-BASED.
 * Opens when user first visits Calendar, Goals, or Analytics screen.
 */
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { CustomEvent, Goal, WeeklyReview } from "../MobileDataContext";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface PlannerContextType {
  customEvents: CustomEvent[];
  goals: Goal[];
  weeklyReviews: WeeklyReview[];

  ensureSubscribed: () => void;
}

const PlannerContext = createContext<PlannerContextType | null>(null);

export function usePlannerData(): PlannerContextType {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlannerData must be inside PlannerProvider");
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function PlannerProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { uid: string } | null;
}) {
  const [customEvents, setCustomEvents]       = useState<CustomEvent[]>([]);
  const [goals, setGoals]                     = useState<Goal[]>([]);
  const [weeklyReviews, setWeeklyReviews]     = useState<WeeklyReview[]>([]);

  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CALENDAR_EVENTS), where("userId", "==", uid)),
      snap => setCustomEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent))),
      err => console.error("[Planner] customEvents", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GOALS), where("userId", "==", uid)),
      snap => setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Goal))),
      err => console.error("[Planner] goals", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WEEKLY_REVIEWS), where("userId", "==", uid)),
      snap => setWeeklyReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReview))),
      err => console.error("[Planner] weeklyReviews", err)
    ));

  };

  useEffect(() => {
    if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      setCustomEvents([]); setGoals([]); setWeeklyReviews([]);
    }
  }, [user]);

  useEffect(() => () => { unsubsRef.current.forEach(u => u()); }, []);

  const ensureSubscribed = () => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  };

  return (
    <PlannerContext.Provider value={{ customEvents, goals, weeklyReviews, ensureSubscribed }}>
      {children}
    </PlannerContext.Provider>
  );
}
