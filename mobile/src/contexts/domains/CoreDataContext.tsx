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
import { auth, db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { readCoreCacheMulti, writeCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { registerForPushNotificationsAsync } from "../../services/notifications";

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
  optimisticUpdateTask: (taskId: string, partial: Partial<Task>) => void;
  optimisticUpdateHabit: (habitId: string, partial: Partial<Habit>) => void;
  optimisticAddHabitLog: (log: HabitLog) => void;
  optimisticRemoveHabitLog: (habitId: string, date: string) => void;
}

const CoreDataContext = createContext<CoreDataContextType | null>(null);

export function useCoreData(): CoreDataContextType {
  const ctx = useContext(CoreDataContext);
  if (!ctx) throw new Error("useCoreData must be inside CoreDataProvider");
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function CoreDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [habits, setHabits]       = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading]     = useState(true);
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
  const [pinnedModules, setPinnedModulesState]    = useState<string[]>(["Tasks", "Calendar"]);

  // Pinned modules (AsyncStorage)
  useEffect(() => {
    AsyncStorage.getItem("@zentrack_pinned_modules")
      .then(val => { if (val) setPinnedModulesState(JSON.parse(val)); })
      .catch(console.error);
  }, []);

  const setPinnedModules = (mods: string[]) => {
    setPinnedModulesState(mods);
    AsyncStorage.setItem("@zentrack_pinned_modules", JSON.stringify(mods)).catch(console.error);
  };

  // Google Workspace token
  useEffect(() => {
    AsyncStorage.getItem("google_workspace_token")
      .then(token => { if (token) setGoogleAccessToken(token); });
  }, []);

  // ── Cache-first boot ─────────────────────────────────────────────────
  // Load tasks/habits/habitLogs from AsyncStorage instantly on mount (~5ms).
  // Dashboard is fully usable before Firestore has responded.
  // Firestore snapshots will arrive later and silently update the UI.
  useEffect(() => {
    let cancelled = false;
    readCoreCacheMulti().then(cached => {
      if (cancelled) return;
      if (cached.tasks     && cached.tasks.length > 0)     setTasks(prev     => prev.length === 0 ? cached.tasks!     : prev);
      if (cached.habits    && cached.habits.length > 0)    setHabits(prev    => prev.length === 0 ? cached.habits!    : prev);
      if (cached.habitLogs && cached.habitLogs.length > 0) setHabitLogs(prev => prev.length === 0 ? cached.habitLogs! : prev);
      // Mark as not loading once cache is seeded, even before Firestore fires
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Auth state — clears all data on logout
  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      if (!u) {
        setTasks([]); setHabits([]); setHabitLogs([]); setLoading(false);
        clearCoreCache(); // Clear stale cache on logout (security + correctness)
      }
    });
  }, []);

  // Register push notifications on login
  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync().then((token) => {
        if (token) {
          setDoc(doc(db, COLLECTION.USER_PROFILES, user.uid), { pushToken: token }, { merge: true }).catch(console.error);
        }
      });
    }
  }, [user]);

  // Zero-Click notification actions
  useEffect(() => {
    if (!user) return;
    const sub = Notifications.addNotificationResponseReceivedListener(async response => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data;
      try {
        if (actionId === "mark_present" && data?.subjectId) {
          const docRef = doc(db, COLLECTION.ATTENDANCE, data.subjectId as string);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            await setDoc(docRef, { classesAttended: (snap.data().classesAttended || 0) + 1 }, { merge: true });
          }
        } else if (actionId === "snooze_15m" && data?.type === "gym") {
          const trigger = new Date(Date.now() + 15 * 60 * 1000);
          await Notifications.scheduleNotificationAsync({
            content: { title: "Gym Snooze ⏳", body: "15 minutes are up. Time to workout.", data },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger, channelId: "default" } as any,
          });
        }
      } catch (err) { console.error("[CoreData] notification action", err); }
    });
    return () => sub.remove();
  }, [user]);

  // Critical-path Firestore subscriptions — open immediately on login
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const uid = user.uid;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        setTasks(fresh);
        setLoading(false);
        writeCoreCacheMulti({ tasks: fresh }); // Write back for next launch
      },
      err => { console.error("[CoreData] tasks", err); setLoading(false); }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
        // Skip snapshot if an optimistic update is in-flight — prevents flicker
        if (!isHabitLocked.current) {
          setHabits(fresh);
        }
        writeCoreCacheMulti({ habits: fresh });
      },
      err => console.error("[CoreData] habits", err)
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog));
        // Skip snapshot if an optimistic update is in-flight — prevents flicker
        if (!isHabitLogLocked.current) {
          setHabitLogs(fresh);
        }
        writeCoreCacheMulti({ habitLogs: fresh });
      },
      err => console.error("[CoreData] habitLogs", err)
    ));

    return () => unsubs.forEach(u => u());
  }, [user]);

  const activeHabits     = useMemo(() => habits.filter(h => !h.archived), [habits]);
  const todayHabits      = useMemo(() => activeHabits.slice(0, 5), [activeHabits]);
  const pendingTaskCount = useMemo(() => tasks.filter(t => t.status === "pending").length, [tasks]);

  const optimisticUpdateTask = (taskId: string, partial: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...partial } : t));
  };
  const optimisticUpdateHabit = (habitId: string, partial: Partial<Habit>) => {
    lockHabits();
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, ...partial } : h));
  };
  const optimisticAddHabitLog = (log: HabitLog) => {
    lockHabitLogs();
    setHabitLogs(prev => [...prev, log]);
  };
  const optimisticRemoveHabitLog = (habitId: string, date: string) => {
    lockHabitLogs();
    setHabitLogs(prev => prev.filter(l => !(l.habitId === habitId && l.date === date)));
  };

  return (
    <CoreDataContext.Provider value={{
      user, tasks, habits: activeHabits, allHabits: habits, habitLogs,
      loading, pendingTaskCount, todayHabits,
      pinnedModules, setPinnedModules, googleAccessToken,
      optimisticUpdateTask, optimisticUpdateHabit, optimisticAddHabitLog, optimisticRemoveHabitLog
    }}>
      {children}
    </CoreDataContext.Provider>
  );
}
