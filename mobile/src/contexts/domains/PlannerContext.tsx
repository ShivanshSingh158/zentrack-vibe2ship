import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { CustomEvent, Goal, WeeklyReview } from "../MobileDataContext";
import { writePlannerCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync } from "../../utils/bootManifest";
import { parseCustomEvent, parseGoal, areItemsEqual } from "../../utils/schemaGuards";
import { applyPendingQueueOverlay } from "../../services/offlineSync";

export interface PlannerContextType {
  customEvents: CustomEvent[];
  goals: Goal[];
  weeklyReviews: WeeklyReview[];
  ensureSubscribed: () => void;
  optimisticAddEvent: (event: CustomEvent) => void;
  optimisticUpdateEvent: (eventId: string, partial: Partial<CustomEvent>) => void;
  optimisticDeleteEvent: (eventId: string) => void;
  optimisticAddGoal: (goal: Goal) => void;
  optimisticUpdateGoal: (goalId: string, partial: Partial<Goal>) => void;
  optimisticDeleteGoal: (goalId: string) => void;
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
  optimisticDeleteGoal: () => {},
};

const PlannerContext = createContext<PlannerContextType | null>(null);

export function usePlannerData(): PlannerContextType {
  const ctx = useContext(PlannerContext);
  if (!ctx) return DEFAULT_PLANNER_DATA;
  return ctx;
}

export function PlannerProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { uid: string } | null;
}) {
  const initialManifest = getBootManifestSync();
  const [customEvents, setCustomEvents]   = useState<CustomEvent[]>(initialManifest?.customEvents ?? []);
  const [goals, setGoals]                 = useState<Goal[]>(initialManifest?.goals ?? []);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>(initialManifest?.weeklyReviews ?? []);

  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  const hasCachedDataRef = useRef(
    (initialManifest?.customEvents?.length ?? 0) > 0 ||
    (initialManifest?.goals?.length ?? 0) > 0 ||
    (initialManifest?.weeklyReviews?.length ?? 0) > 0
  );

  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        setCustomEvents(prev => prev.length === 0 && (manifest.customEvents?.length ?? 0) > 0 ? manifest.customEvents : prev);
        setGoals(prev => prev.length === 0 && (manifest.goals?.length ?? 0) > 0 ? manifest.goals : prev);
        setWeeklyReviews(prev => prev.length === 0 && (manifest.weeklyReviews?.length ?? 0) > 0 ? manifest.weeklyReviews : prev);
        if (
          (manifest.customEvents?.length ?? 0) > 0 ||
          (manifest.goals?.length ?? 0) > 0 ||
          (manifest.weeklyReviews?.length ?? 0) > 0
        ) {
          hasCachedDataRef.current = true;
        }
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, [user?.uid]);

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

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CALENDAR_EVENTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.CALENDAR_EVENTS, snap.docs.map(d => parseCustomEvent(d.data(), d.id)));
          setCustomEvents(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ customEvents: fresh }));
        });
      },
      scheduleListenerRestart("customEvents")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.GOALS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.GOALS, snap.docs.map(d => parseGoal(d.data(), d.id)));
          setGoals(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ goals: fresh }));
        });
      },
      scheduleListenerRestart("goals")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.WEEKLY_REVIEWS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.WEEKLY_REVIEWS, snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyReview)));
          setWeeklyReviews(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writePlannerCache({ weeklyReviews: fresh }));
        });
      },
      scheduleListenerRestart("weeklyReviews")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user) {
      subscribedRef.current = false;
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      hasCachedDataRef.current = false;
      unstable_batchedUpdates(() => {
        setCustomEvents([]);
        setGoals([]);
        setWeeklyReviews([]);
      });
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
    if (user && !subscribedRef.current) {
      openSubscriptions(user.uid);
    }
  }, [user?.uid, openSubscriptions]);

  const optimisticAddEvent = useCallback((event: CustomEvent) => {
    setCustomEvents(prev => {
      const next = [event, ...prev];
      writePlannerCache({ customEvents: next }, true);
      return next;
    });
  }, []);

  const optimisticUpdateEvent = useCallback((eventId: string, partial: Partial<CustomEvent>) => {
    setCustomEvents(prev => {
      const next = prev.map(e => e.id === eventId ? { ...e, ...partial } : e);
      writePlannerCache({ customEvents: next }, true);
      return next;
    });
  }, []);

  const optimisticDeleteEvent = useCallback((eventId: string) => {
    setCustomEvents(prev => {
      const next = prev.filter(e => e.id !== eventId);
      writePlannerCache({ customEvents: next }, true);
      return next;
    });
  }, []);

  const optimisticAddGoal = useCallback((goal: Goal) => {
    setGoals(prev => {
      const next = [goal, ...prev];
      writePlannerCache({ goals: next }, true);
      return next;
    });
  }, []);

  const optimisticUpdateGoal = useCallback((goalId: string, partial: Partial<Goal>) => {
    setGoals(prev => {
      const next = prev.map(g => g.id === goalId ? { ...g, ...partial } : g);
      writePlannerCache({ goals: next }, true);
      return next;
    });
  }, []);

  const optimisticDeleteGoal = useCallback((goalId: string) => {
    setGoals(prev => {
      const next = prev.filter(g => g.id !== goalId);
      writePlannerCache({ goals: next }, true);
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    customEvents, goals, weeklyReviews, ensureSubscribed,
    optimisticAddEvent, optimisticUpdateEvent, optimisticDeleteEvent,
    optimisticAddGoal, optimisticUpdateGoal, optimisticDeleteGoal,
  }), [
    customEvents, goals, weeklyReviews, ensureSubscribed,
    optimisticAddEvent, optimisticUpdateEvent, optimisticDeleteEvent,
    optimisticAddGoal, optimisticUpdateGoal, optimisticDeleteGoal,
  ]);

  return (
    <PlannerContext.Provider value={value}>
      {children}
    </PlannerContext.Provider>
  );
}
