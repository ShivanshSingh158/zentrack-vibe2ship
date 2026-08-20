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
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { CustomEvent, Goal, WeeklyReview } from "../MobileDataContext";
import { readPlannerCache, writePlannerCache } from "../../utils/domainCache";
import { parseCustomEvent, parseGoal } from "../../utils/schemaGuards";

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

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[Planner] ${context} listener error — restarting in 5s`, err.message);
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
  // AppNavigator emits 'firestore_force_reconnect' on every AppState: active.
  // Resets subscribedRef and bumps subscriptionVersion to force a clean
  // listener teardown and reopen after the app returns from 6+ hours background.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[Planner] foreground reconnect — restarting Firestore listeners');
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user]);

  // ── Offline-first boot: seed from AsyncStorage when user uid is available ──
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (!userUid) return;
    let cancelled = false;
    readPlannerCache().then(cached => {
      if (cancelled) return;
      if (Array.isArray(cached.customEvents))  setCustomEvents(cached.customEvents);
      if (Array.isArray(cached.goals))         setGoals(cached.goals);
      if (Array.isArray(cached.weeklyReviews)) setWeeklyReviews(cached.weeklyReviews);
    });
    return () => { cancelled = true; };
  }, [userUid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CALENDAR_EVENTS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseCustomEvent(d.data(), d.id)); setCustomEvents(fresh); writePlannerCache({ customEvents: fresh }); },
      scheduleListenerRestart("customEvents")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GOALS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseGoal(d.data(), d.id)); setGoals(fresh); writePlannerCache({ goals: fresh }); },
      scheduleListenerRestart("goals")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WEEKLY_REVIEWS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReview)); setWeeklyReviews(fresh); writePlannerCache({ weeklyReviews: fresh }); },
      scheduleListenerRestart("weeklyReviews")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
  }, [user, subscriptionVersion, openSubscriptions]);

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user, openSubscriptions]);

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
