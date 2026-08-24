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
import { InteractionManager, DeviceEventEmitter } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { readCoreCacheMulti, writeCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { registerForPushNotificationsAsync } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';
import { parseTask, parseHabit, parseHabitLog } from "../../utils/schemaGuards";
import { syncXPWithFirestore } from "../../services/xpSystem";


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
  const initialManifest = getBootManifestSync();
  const [user, setUser]           = useState<User | null>(initialManifest?.optimisticUser ?? auth.currentUser ?? null);
  const [tasks, setTasks]         = useState<Task[]>(initialManifest?.tasks ?? []);
  const [habits, setHabits]       = useState<Habit[]>(initialManifest?.habits ?? []);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>(initialManifest?.habitLogs ?? []);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(initialManifest?.googleAccessToken ?? null);

  // Tracks when we first resolved a valid authenticated user.
  // Used to guard against Firebase's routine 60-min token refresh firing
  // onAuthStateChanged(null) and erroneously clearing the user state.
  const firstAuthAtRef = useRef<number>(0);

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
  const [pinnedModules, setPinnedModulesState]    = useState<string[]>(initialManifest?.pinnedModules ?? DEFAULT_PINNED_MODULES);

  // Consolidated Manifest Boot: seeds optimistic user, pinned modules, token, and core cache in 1 single bridge load
  useEffect(() => {
    let cancelled = false;
    loadBootManifest().then(manifest => {
      if (cancelled) return;
      if (manifest.optimisticUser) {
        setUser(manifest.optimisticUser);
        firstAuthAtRef.current = Date.now();
      }
      if (manifest.pinnedModules && manifest.pinnedModules.length > 0) {
        setPinnedModulesState(manifest.pinnedModules);
      }
      if (manifest.googleAccessToken) {
        setGoogleAccessToken(manifest.googleAccessToken);
      }
      if (Array.isArray(manifest.tasks) && manifest.tasks.length > 0) {
        setTasks(manifest.tasks);
      }
      if (Array.isArray(manifest.habits) && manifest.habits.length > 0) {
        setHabits(manifest.habits);
      }
      if (Array.isArray(manifest.habitLogs) && manifest.habitLogs.length > 0) {
        setHabitLogs(manifest.habitLogs);
      }
    }).catch(handleSyncError);
    return () => { cancelled = true; };
  }, []);

  const setPinnedModules = (mods: string[]) => {
    const clamped = mods.length > 0 ? mods.slice(0, 4) : DEFAULT_PINNED_MODULES;
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem("@zentrack_pinned_modules", JSON.stringify(clamped)).catch(console.warn);
  };

  // ── Cache-first boot for user changes ────────────────────────────────
  // Re-seed cache when user changes (login / restore / logout)
  useEffect(() => {
    let cancelled = false;
    readCoreCacheMulti().then(cached => {
      if (cancelled) return;
      if (Array.isArray(cached.tasks) && cached.tasks.length > 0)     setTasks(cached.tasks);
      if (Array.isArray(cached.habits) && cached.habits.length > 0)    setHabits(cached.habits);
      if (Array.isArray(cached.habitLogs) && cached.habitLogs.length > 0) setHabitLogs(cached.habitLogs);
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Auth state — updates user reference.
  // OFFLINE-FIRST GUARD: Firebase fires onAuthStateChanged(null) during routine
  // 60-min token refreshes. We suppress null-user clears for 5 seconds after
  // first auth, and only clear when there is ALSO no optimistic user in storage.
  // This matches the WhatsApp / Instagram pattern: offline = stay logged in.
  useEffect(() => {
    let cancelled = false;

    // Check synchronous auth or cached optimistic user on mount (~0ms)
    if (auth.currentUser) {
      setUser(auth.currentUser);
      firstAuthAtRef.current = Date.now();
    } else {
      AsyncStorage.getItem('@zentrack_optimistic_user').then(raw => {
        if (!cancelled && raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.uid) {
              setUser(parsed as User);
              firstAuthAtRef.current = Date.now();
            }
          } catch {}
        }
      }).catch(() => {});
    }

    auth.authStateReady().then(() => {
      if (!cancelled && auth.currentUser) {
        setUser(auth.currentUser);
        firstAuthAtRef.current = Date.now();
      }
    }).catch(() => {});

    const unsub = onAuthStateChanged(auth, u => {
      if (!cancelled) {
        if (u) {
          setUser(u);
          firstAuthAtRef.current = Date.now();
        } else {
          // GUARD: only clear user state when all 3 conditions are true:
          // 1. No optimistic user in AsyncStorage (explicit logout, not a blip)
          // 2. Enough time has passed since first auth (>5s) — avoids a cold-boot
          //    race where Firebase fires null before the optimistic user is written
          // 3. Not cancelled
          const msSinceFirstAuth = firstAuthAtRef.current
            ? Date.now() - firstAuthAtRef.current
            : 0;
          AsyncStorage.getItem('@zentrack_optimistic_user').then(raw => {
            if (!cancelled && !raw && msSinceFirstAuth > 5000) {
              setUser(null);
              setFirestoreReady(false);
            }
          }).catch(() => {});
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
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

  // ── Listener auto-restart on error ───────────────────────────────────────
  // Firebase ID tokens expire every 60 min. If a network blip coincides with
  // token expiry, onSnapshot fires its error callback and the listener dies
  // permanently. This counter, when incremented, causes the effect below to
  // re-run (after cleanup), reopening all three listeners fresh.
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = (context: string) => (err: Error) => {
    console.warn(`[CoreData] ${context} listener error — restarting in 5s`, err.message);
    // Only schedule one retry at a time
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  };

  // ── Foreground reconnect: restart listeners after long background ─────────
  // AppNavigator emits 'firestore_force_reconnect' on every AppState: active
  // event (after refreshing the ID token). This bumps subscriptionVersion,
  // which tears down any silently-dead listeners and reopens them fresh.
  // Silent listener death (no onError callback) is the root cause of the
  // "data not showing after 6+ hours" bug.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[CoreData] foreground reconnect — restarting Firestore listeners');
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user]);

  // Critical-path Firestore subscriptions — open immediately on login.
  // Each snapshot WRITE-THROUGHS to AsyncStorage so the next cold-boot is instant.
  // Depends on `subscriptionVersion` so any listener error auto-restarts all three.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => parseTask(d.data(), d.id));
        setTasks(fresh);
        setFirestoreReady(true);
        writeCoreCacheMulti({ tasks: fresh });
      },
      scheduleListenerRestart("tasks")
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => parseHabit(d.data(), d.id));
        if (!isHabitLocked.current) {
          setHabits(fresh);
          writeCoreCacheMulti({ habits: fresh });
        }
      },
      scheduleListenerRestart("habits")
    ));

    unsubs.push(onSnapshot(
      query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => parseHabitLog(d.data(), d.id));
        if (!isHabitLogLocked.current) {
          setHabitLogs(fresh);
          writeCoreCacheMulti({ habitLogs: fresh });
        }
      },
      scheduleListenerRestart("habitLogs")
    ));

    // Cloud Database XP Sync: always loads user's permanent XP progress on login/reconnect
    unsubs.push(onSnapshot(
      doc(db, COLLECTION.USER_PROFILES, uid),
      snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data?.xp === 'number') {
            syncXPWithFirestore(data.xp);
          }
        }
      },
      scheduleListenerRestart("user_profiles")
    ));

    return () => {
      unsubs.forEach(u => u());
    };
  }, [user, subscriptionVersion]); // subscriptionVersion triggers clean restart on listener error

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
    setHabits(prev => {
      const next = prev.map(h => h.id === habitId ? { ...h, ...partial } : h);
      writeCoreCacheMulti({ habits: next });
      return next;
    });
  };
  const optimisticAddHabitLog = (log: HabitLog) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = [...prev, log];
      writeCoreCacheMulti({ habitLogs: next });
      return next;
    });
  };
  const optimisticUpdateHabitLog = (logId: string, partial: Partial<HabitLog>) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial } : l);
      writeCoreCacheMulti({ habitLogs: next });
      return next;
    });
  };
  const optimisticRemoveHabitLog = (habitId: string, date: string) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = prev.filter(l => !(l.habitId === habitId && l.date === date));
      writeCoreCacheMulti({ habitLogs: next });
      return next;
    });
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

/**
 * Explicit user sign-out handler: signs out of Firebase and clears ALL local
 * disk state so no data bleeds to the next user on this device.
 *
 * Cleared:
 *  - @zentrack_optimistic_user   (WhatsApp-style boot token)
 *  - @zentrack_offline_write_queue  (pending writes — CRITICAL: prevents cross-user data bleed)
 *  - Core + domain caches (tasks, habits, attendance, gym, etc.)
 *  - XP local state
 */
export async function performSignOut() {
  try {
    await AsyncStorage.multiRemove([
      '@zentrack_optimistic_user',
      '@zentrack_offline_write_queue', // Prevents offline writes from one user syncing under another
      'zentrack_xp_v1',               // XP state — prevents showing previous user's level
      'zentrack_xp_streak',           // XP streak
    ]);
    await auth.signOut();
    await clearCoreCache();
    await clearAllDomainCaches();
  } catch (err) {
    console.warn('[Auth] Sign out error:', err);
  }
}


