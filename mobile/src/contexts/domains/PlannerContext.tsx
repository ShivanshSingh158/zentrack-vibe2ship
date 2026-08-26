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
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { CustomEvent, Goal, WeeklyReview } from "../MobileDataContext";
import { readPlannerCache, writePlannerCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync } from "../../utils/bootManifest";
import { parseCustomEvent, parseGoal, areItemsEqual } from "../../utils/schemaGuards";

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
  const initialManifest = getBootManifestSync();
  const [customEvents, setCustomEvents]       = useState<CustomEvent[]>(initialManifest?.customEvents ?? []);
  const [goals, setGoals]                     = useState<Goal[]>(initialManifest?.goals ?? []);
  const [weeklyReviews, setWeeklyReviews]     = useState<WeeklyReview[]>(initialManifest?.weeklyReviews ?? []);

  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  // OFFLINE-FIRST GUARD: ignore empty memoryLocalCache snapshots when cache is seeded.
  const hasCachedDataRef = useRef(
    (initialManifest?.customEvents?.length ?? 0) > 0 ||
    (initialManifest?.goals?.length ?? 0) > 0 ||
    (initialManifest?.weeklyReviews?.length ?? 0) > 0
  );

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
  }, [user?.uid]);

  // ── Offline-first boot: seed ALL planner collections from boot manifest ──
  // If getBootManifestSync() already populated state on Frame 0, this does 0 re-renders.
  useEffect(() => {
    let cancelled = false;
    loadBootManifest().then(manifest => {
      if (cancelled) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if (customEvents.length === 0 && Array.isArray(manifest.customEvents) && manifest.customEvents.length > 0)   { setCustomEvents(manifest.customEvents); seeded = true; }
        if (goals.length === 0 && Array.isArray(manifest.goals) && manifest.goals.length > 0)                 { setGoals(manifest.goals); seeded = true; }
        if (weeklyReviews.length === 0 && Array.isArray(manifest.weeklyReviews) && manifest.weeklyReviews.length > 0) { setWeeklyReviews(manifest.weeklyReviews); seeded = true; }
        if (seeded) hasCachedDataRef.current = true;
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [user?.uid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CALENDAR_EVENTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseCustomEvent(d.data(), d.id));
          setCustomEvents(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ customEvents: fresh }));
        });
      },
      scheduleListenerRestart("customEvents")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GOALS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseGoal(d.data(), d.id));
          setGoals(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ goals: fresh }));
        });
      },
      scheduleListenerRestart("goals")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WEEKLY_REVIEWS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReview));
          setWeeklyReviews(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ weeklyReviews: fresh }));
        });
      },
      scheduleListenerRestart("weeklyReviews")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user && subscribedRef.current) {
      openSubscriptions(user.uid);
    } else if (!user) {
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

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user?.uid, openSubscriptions]);

  // Optimistic write helpers
  const optimisticAddEvent = (event: CustomEvent) => {
    setCustomEvents(prev => {
      const next = [event, ...prev];
      writePlannerCache({ customEvents: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticUpdateEvent = (eventId: string, partial: Partial<CustomEvent>) => {
    setCustomEvents(prev => {
      const next = prev.map(e => e.id === eventId ? { ...e, ...partial } : e);
      writePlannerCache({ customEvents: next }, true); // immediate: optimistic update
      return next;
    });
  };

  const optimisticDeleteEvent = (eventId: string) => {
    setCustomEvents(prev => {
      const next = prev.filter(e => e.id !== eventId);
      writePlannerCache({ customEvents: next }, true); // immediate: optimistic delete
      return next;
    });
  };

  const optimisticAddGoal = (goal: Goal) => {
    setGoals(prev => {
      const next = [goal, ...prev];
      writePlannerCache({ goals: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticUpdateGoal = (goalId: string, partial: Partial<Goal>) => {
    setGoals(prev => {
      const next = prev.map(g => g.id === goalId ? { ...g, ...partial } : g);
      writePlannerCache({ goals: next }, true); // immediate: optimistic update
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
