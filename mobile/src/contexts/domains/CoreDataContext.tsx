/**
 * CoreDataContext — ZenTrack Mobile
 *
 * Owns: auth state, tasks, habits, habitLogs, pinned modules, Google token,
 *       notification action listener.
 *
 * Subscription strategy: ALWAYS OPEN immediately on login.
 * These are critical-path: Dashboard, Tasks, Habits all need them before first paint.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import * as Notifications from "expo-notifications";
import { collection, query, where, onSnapshot, doc, setDoc, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { InteractionManager } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { readCoreCacheMulti, writeCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { registerForPushNotificationsAsync } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';


// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface CoreDataContextType {
  user: User | null;
  tasks: Task[];
  habits: Habit[];          // active only
  allHabits: Habit[];
  habitLogs: HabitLog[];
  loading: boolean;
  pendingTaskCount: number;
  todayHabits: Habit[];
  pinnedModules: string[];
  setPinnedModules: (modules: string[]) => void;
  googleAccessToken: string | null;
  // Optimistic write helpers — update local state immediately, Firestore syncs in background.
  // This is the WhatsApp pattern: show the result instantly, sync later.
  optimisticAddTask: (task: Task) => void;
  optimisticUpdateTask: (taskId: string, partial: Partial<Task>) => void;
  optimisticDeleteTask: (taskId: string) => void;
  optimisticUpdateHabit: (habitId: string, partial: Partial<Habit>) => void;
  optimisticAddHabitLog: (log: HabitLog) => void;
  optimisticUpdateHabitLog: (logId: string, partial: Partial<HabitLog>) => void;
  optimisticRemoveHabitLog: (habitId: string, date: string) => void;
}

const DEFAULT_CORE_DATA: CoreDataContextType = {
  user: null,
  tasks: [],
  habits: [],
  allHabits: [],
  habitLogs: [],
  loading: false,
  pendingTaskCount: 0,
  todayHabits: [],
  pinnedModules: ["Tasks", "Gym", "Calendar", "Attendance"],
  setPinnedModules: () => {},
  googleAccessToken: null,
  optimisticAddTask: () => {},
  optimisticUpdateTask: () => {},
  optimisticDeleteTask: () => {},
  optimisticUpdateHabit: () => {},
  optimisticAddHabitLog: () => {},
  optimisticUpdateHabitLog: () => {},
  optimisticRemoveHabitLog: () => {},
};

const CoreDataContext = createContext<CoreDataContextType | null>(null);

export function useCoreData(): CoreDataContextType {
  const ctx = useContext(CoreDataContext);
  if (!ctx) {
    return DEFAULT_CORE_DATA;
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function CoreDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [habits, setHabits]       = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  // WHATSAPP PATTERN: loading is derived — never a boolean flag that starts true.
  // If cache has seeded tasks/habits, loading is false from the very first render.
  // Screens with cached data never show a spinner on app resume.
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Write-lock: after an optimistic habit update, ignore Firestore snapshots for
  // 2 seconds to prevent the flicker cycle (optimistic → snapshot rollback → final snapshot).
  const habitWriteLockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const habitLogWriteLockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHabitLocked = useRef(false);
  const isHabitLogLocked = useRef(false);

  const lockHabits = () => {
    isHabitLocked.current = true;
    if (habitWriteLockRef.current) clearTimeout(habitWriteLockRef.current);
    habitWriteLockRef.current = setTimeout(() => { isHabitLocked.current = false; }, 2000);
  };
  const lockHabitLogs = () => {
    isHabitLogLocked.current = true;
    if (habitLogWriteLockRef.current) clearTimeout(habitLogWriteLockRef.current);
    habitLogWriteLockRef.current = setTimeout(() => { isHabitLogLocked.current = false; }, 2000);
  };
  const DEFAULT_PINNED_MODULES = ["Tasks", "Gym", "Calendar", "Attendance"];
  const [pinnedModules, setPinnedModulesState]    = useState<string[]>(DEFAULT_PINNED_MODULES);

  // Pinned modules (AsyncStorage)
  useEffect(() => {
    AsyncStorage.getItem("@zentrack_pinned_modules")
      .then(val => { 
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPinnedModulesState(parsed.slice(0, 4));
            } else {
              setPinnedModulesState(DEFAULT_PINNED_MODULES);
            }
          } catch {
            setPinnedModulesState(DEFAULT_PINNED_MODULES);
          }
        }
      })
      .catch(handleSyncError);
  }, []);

  const setPinnedModules = (mods: string[]) => {
    const clamped = mods.length > 0 ? mods.slice(0, 4) : DEFAULT_PINNED_MODULES;
    setPinnedModulesState(clamped);
    AsyncStorage.setItem("@zentrack_pinned_modules", JSON.stringify(clamped)).catch(console.warn);
  };

  // Google Workspace token
  useEffect(() => {
    AsyncStorage.getItem("google_workspace_token")
      .then(token => { if (token) setGoogleAccessToken(token); });
  }, []);

  // ── Cache-first boot ─────────────────────────────────────────────────
  // Load tasks/habits/habitLogs from AsyncStorage SYNCHRONOUSLY on mount (~5ms).
  // Dashboard is fully usable before Firestore has responded.
  // Firestore snapshots will arrive later and silently update the UI.
  useEffect(() => {
    let cancelled = false;
    readCoreCacheMulti().then(cached => {
      if (cancelled) return;
      if (cached.tasks     && cached.tasks.length > 0)     setTasks(prev     => prev.length === 0 ? cached.tasks!     : prev);
      if (cached.habits    && cached.habits.length > 0)    setHabits(prev    => prev.length === 0 ? cached.habits!    : prev);
      if (cached.habitLogs && cached.habitLogs.length > 0) setHabitLogs(prev => prev.length === 0 ? cached.habitLogs! : prev);
    });
    return () => { cancelled = true; };
  }, []);

  // Auth state — clears all data on logout
  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (!u) {
        setTasks([]); setHabits([]); setHabitLogs([]); setFirestoreReady(false);
        clearCoreCache();        // Clear core cache on logout
        clearAllDomainCaches(); // Clear ALL domain caches — Wellness, Academic, Planner, Creative
      }
    });
  }, []);


  // Register push notifications on login
  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync().then((token) => {
        if (token) {
          setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { pushToken: token }, { merge: true }).catch(handleSyncError);
        }
      });
    }
  }, [user]);

  // Critical-path Firestore subscriptions — open immediately on login.
  // Each snapshot WRITE-THROUGHS to AsyncStorage so the next cold-boot is instant.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        setTasks(fresh);
        setFirestoreReady(true);
        writeCoreCacheMulti({ tasks: fresh });
      },
      err => { console.error("[CoreData] tasks", err); setFirestoreReady(true); }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
        if (!isHabitLocked.current) setHabits(fresh);
        writeCoreCacheMulti({ habits: fresh });
      },
      err => console.error("[CoreData] habits", err)
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog));
        if (!isHabitLogLocked.current) setHabitLogs(fresh);
        writeCoreCacheMulti({ habitLogs: fresh });
      },
      err => console.error("[CoreData] habitLogs", err)
    ));

    return () => {
      unsubs.forEach(u => u());
    };
  }, [user]);

  // loading is TRUE only when: user is authenticated, Firestore hasn't responded yet,
  // AND we have no cached data to show. Never true when cache is populated.
  const loading = !!user && !firestoreReady && tasks.length === 0;

  const activeHabits     = useMemo(() => habits.filter(h => !h.archived), [habits]);
  const todayHabits      = useMemo(() => activeHabits.slice(0, 5), [activeHabits]);
  const pendingTaskCount = useMemo(() => tasks.filter(t => t.status === "pending").length, [tasks]);

  const optimisticAddTask = (task: Task) => {
    setTasks(prev => {
      const next = [task, ...prev];
      writeCoreCacheMulti({ tasks: next });
      return next;
    });
  };
  const optimisticUpdateTask = (taskId: string, partial: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === taskId ? { ...t, ...partial } : t);
      // Write-through to AsyncStorage: survives offline app kill+restart
      writeCoreCacheMulti({ tasks: next });
      return next;
    });
  };
  const optimisticDeleteTask = (taskId: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== taskId);
      writeCoreCacheMulti({ tasks: next });
      return next;
    });
  };
  const optimisticUpdateHabit = (habitId: string, partial: Partial<Habit>) => {
    lockHabits();
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, ...partial } : h));
  };
  const optimisticAddHabitLog = (log: HabitLog) => {
    lockHabitLogs();
    setHabitLogs(prev => [...prev, log]);
  };
  const optimisticUpdateHabitLog = (logId: string, partial: Partial<HabitLog>) => {
    lockHabitLogs();
    setHabitLogs(prev => prev.map(l => l.id === logId ? { ...l, ...partial } : l));
  };
  const optimisticRemoveHabitLog = (habitId: string, date: string) => {
    lockHabitLogs();
    setHabitLogs(prev => prev.filter(l => !(l.habitId === habitId && l.date === date)));
  };

  const value = useMemo(() => ({
    user, tasks, habits: activeHabits, allHabits: habits, habitLogs,
    loading, pendingTaskCount, todayHabits,
    pinnedModules, setPinnedModules, googleAccessToken,
    optimisticAddTask, optimisticUpdateTask, optimisticDeleteTask,
    optimisticUpdateHabit, optimisticAddHabitLog, optimisticUpdateHabitLog, optimisticRemoveHabitLog
  }), [
    user, tasks, activeHabits, habits, habitLogs,
    loading, pendingTaskCount, todayHabits,
    pinnedModules, googleAccessToken
  ]);

  return (
    <CoreDataContext.Provider value={value}>
      {children}
    </CoreDataContext.Provider>
  );
}

