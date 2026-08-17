 /**
 * PlannerContext — ZenTrack Mobile
 *
 * Owns: customEvents (calendar), goals, weeklyReviews.
 *
 * Subscription strategy: DEMAND-BASED + OFFLINE-FIRST.
 * On mount: reads all planner data from AsyncStorage instantly (~5ms).
 * Calendar and Goals screens show real data immediately, even when offline.
 * Firestore snapshots silently update the cache when online.
 */
import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { CustomEvent, Goal, WeeklyReview } from "../MobileDataContext";
import { readPlannerCache, writePlannerCache } from "../../utils/domainCache";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface PlannerContextType {
  customEvents: CustomEvent[];
  goals: Goal[];
  weeklyReviews: WeeklyReview[];
  ensureSubscribed: () => void;
  // Optimistic write helpers — WhatsApp pattern: show instantly, Firestore syncs in background.
  optimisticAddEvent: (event: CustomEvent) => void;
  optimisticUpdateEvent: (eventId: string, partial: Partial<CustomEvent>) => void;
  optimisticDeleteEvent: (eventId: string) => void;
  optimisticAddGoal: (goal: Goal) => void;
  optimisticUpdateGoal: (goalId: string, partial: Partial<Goal>) => void;
}

const DEFAULT_PLANNER_DATA: PlannerContextType = {
  customEvents: [],
  goals: [],
  weeklyReviews: [],
  ensureSubscribed: () => {},
  optimisticAddEvent: () => {},
  optimisticUpdateEvent: () => {},
  optimisticDeleteEvent: () => {},
  optimisticAddGoal: () => {},
  optimisticUpdateGoal: () => {},
};

const PlannerContext = createContext<PlannerContextType | null>(null);

export function usePlannerData(): PlannerContextType {
  const ctx = useContext(PlannerContext);
  if (!ctx) {
    return DEFAULT_PLANNER_DATA;
  }
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

  // ── Offline-first boot: seed from AsyncStorage before Firestore responds ──
  useEffect(() => {
    let cancelled = false;
    readPlannerCache().then(cached => {
      if (cancelled) return;
      if (Array.isArray(cached.customEvents))  setCustomEvents(cached.customEvents);
      if (Array.isArray(cached.goals))         setGoals(cached.goals);
      if (Array.isArray(cached.weeklyReviews)) setWeeklyReviews(cached.weeklyReviews);
    });
    return () => { cancelled = true; };
  }, []);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CALENDAR_EVENTS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent)); setCustomEvents(fresh); writePlannerCache({ customEvents: fresh }); },
      err => console.error("[Planner] customEvents", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GOALS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Goal)); setGoals(fresh); writePlannerCache({ goals: fresh }); },
      err => console.error("[Planner] goals", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WEEKLY_REVIEWS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReview)); setWeeklyReviews(fresh); writePlannerCache({ weeklyReviews: fresh }); },
      err => console.error("[Planner] weeklyReviews", err)
    ));
  };

  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    }
  }, [user]);

  useEffect(() => () => { unsubsRef.current.forEach(u => u()); }, []);

  const ensureSubscribed = () => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  };

  // Optimistic write helpers
  const optimisticAddEvent = (event: CustomEvent) => {
    setCustomEvents(prev => {
      const next = [event, ...prev];
      writePlannerCache({ customEvents: next });
      return next;
    });
  };

  const optimisticUpdateEvent = (eventId: string, partial: Partial<CustomEvent>) => {
    setCustomEvents(prev => {
      const next = prev.map(e => e.id === eventId ? { ...e, ...partial } : e);
      writePlannerCache({ customEvents: next });
      return next;
    });
  };

  const optimisticDeleteEvent = (eventId: string) => {
    setCustomEvents(prev => {
      const next = prev.filter(e => e.id !== eventId);
      writePlannerCache({ customEvents: next });
      return next;
    });
  };

  const optimisticAddGoal = (goal: Goal) => {
    setGoals(prev => {
      const next = [goal, ...prev];
      writePlannerCache({ goals: next });
      return next;
    });
  };

  const optimisticUpdateGoal = (goalId: string, partial: Partial<Goal>) => {
    setGoals(prev => {
      const next = prev.map(g => g.id === goalId ? { ...g, ...partial } : g);
      writePlannerCache({ goals: next });
      return next;
    });
  };

  const value = useMemo(() => ({
    customEvents, goals, weeklyReviews, ensureSubscribed,
    optimisticAddEvent, optimisticUpdateEvent, optimisticDeleteEvent, optimisticAddGoal, optimisticUpdateGoal
  }), [
    customEvents, goals, weeklyReviews, ensureSubscribed
  ]);

  return (
    <PlannerContext.Provider value={value}>
      {children}
    </PlannerContext.Provider>
  );
}
