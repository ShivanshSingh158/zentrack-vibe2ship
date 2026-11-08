/**
 * CoreDataContext — ZenTrack Mobile
 *
 * Owns: auth state, tasks, habits, habitLogs, pinned modules, Google token,
 *       notification action listener.
 *
 * Subscription strategy: ALWAYS OPEN immediately on login with OFFLINE-FIRST GUARDS.
 * These are critical-path: Dashboard, Tasks, Habits all need them before first paint.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import { collection, query, where, doc, setDoc, onSnapshot, limit } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION, STORAGE_KEYS } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { writeCoreCacheMulti, readCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { clearSyncMeta } from "../../utils/syncMeta";
import { registerForPushNotificationsAsync, clearScheduleCache } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';
import { parseTask, parseHabit, parseHabitLog, areItemsEqual } from "../../utils/schemaGuards";
import { formatLocalDateStr, offsetDateStr } from "../../utils/dateUtils";
import { syncXPWithFirestore, clearXPMemory } from "../../services/xpSystem";
import { applyPendingQueueOverlay } from "../../services/offlineSync";
import { usePinnedModules } from "../PinnedModulesContext";
import { cacheUserAvatar, initAvatarCacheOnBoot, clearAvatarCache } from "../../services/userAvatarService";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export const CoreUserContext = createContext<User | null>(null);
export function useCoreUser(): User | null {
  return useContext(CoreUserContext);
}

export interface CoreDataContextType {
  user: User | null;
  tasks: Task[];
  habits: Habit[];          // active only
  allHabits: Habit[];
  habitLogs: HabitLog[];
  loading: boolean;
  tasksReady: boolean;   // true once Firestore has confirmed tasks (or confirmed empty)
  pendingTaskCount: number;
  todayPendingTaskCount: number;
  todayHabits: Habit[];
  pinnedModules: string[];
  setPinnedModules: (modules: string[]) => void;
  googleAccessToken: string | null;
  refreshCoreData: () => Promise<void>;
  // Optimistic write helpers — update local state immediately, Firestore syncs in background.
  // This is the WhatsApp pattern: show the result instantly, sync later.
  optimisticAddTask: (task: Task) => void;
  optimisticUpdateTask: (taskId: string, partial: Partial<Task>) => void;
  optimisticDeleteTask: (taskId: string) => void;
  optimisticAddHabit: (habit: Habit) => void;
  optimisticUpdateHabit: (habitId: string, partial: Partial<Habit>) => void;
  optimisticDeleteHabit: (habitId: string) => void;
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
  tasksReady: false,
  pendingTaskCount: 0,
  todayPendingTaskCount: 0,
  todayHabits: [],
  pinnedModules: ["Tasks", "Calendar", "Attendance", "Notes"],
  setPinnedModules: () => {},
  googleAccessToken: null,
  refreshCoreData: async () => {},
  optimisticAddTask: () => {},
  optimisticUpdateTask: () => {},
  optimisticDeleteTask: () => {},
  optimisticAddHabit: () => {},
  optimisticUpdateHabit: () => {},
  optimisticDeleteHabit: () => {},
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
  const hasCachedData = (initialManifest?.tasks?.length ?? 0) > 0 ||
    (initialManifest?.habits?.length ?? 0) > 0 ||
    (initialManifest?.habitLogs?.length ?? 0) > 0;
  const [firestoreReady, setFirestoreReady] = useState(hasCachedData);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(initialManifest?.googleAccessToken ?? null);

  // Tracks when we first resolved a valid authenticated user.
  // Used to guard against Firebase's routine 60-min token refresh firing
  // onAuthStateChanged(null) and erroneously clearing the user state.
  const firstAuthAtRef = useRef<number>(0);

  // OFFLINE-FIRST GUARD: CoreData is always seeded from getBootManifestSync() above.
  // If cached data exists, we must not let the empty memoryLocalCache onSnapshot
  // (which fires immediately on cold boot with no internet) overwrite it.
  const hasCachedDataRef = useRef(hasCachedData);

  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const { pinnedModules, setPinnedModules, hydratePinnedModulesFromRemote } = usePinnedModules();
  const pinnedModulesRef = useRef(pinnedModules);
  pinnedModulesRef.current = pinnedModules;

  const pendingCoreWriteRef = useRef<{ cancel: () => void } | null>(null);
  const scheduleCoreCacheWrite = useCallback((data: Parameters<typeof writeCoreCacheMulti>[0]) => {
    pendingCoreWriteRef.current?.cancel();
    pendingCoreWriteRef.current = InteractionManager.runAfterInteractions(() => {
      writeCoreCacheMulti(data, false);
    });
  }, []);

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    const isBuilding = err.message.includes('currently building');
    if (isBuilding) {
      console.info(`[CoreData] ${context} index is currently building in Cloud Firestore. Auto-retrying in 15s...`);
    } else {
      console.warn(`[CoreData] ${context} listener error — restarting in 5s`, err.message);
    }
    if (retryTimerRef.current) return;
    const delay = isBuilding ? 15000 : 5000;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, delay);
  }, []);

  // ── Parallel Startup Hydration & Auth Resolution (Promise.all) ───────────
  useEffect(() => {
    let cancelled = false;

    // Check synchronous auth on Frame 0
    if (auth.currentUser) {
      if (auth.currentUser.photoURL) {
        cacheUserAvatar(auth.currentUser.uid, auth.currentUser.photoURL).catch(() => {});
      }
      initAvatarCacheOnBoot(auth.currentUser.uid).catch(() => {});
      setUser(prev => {
        if (prev?.uid === auth.currentUser?.uid) return prev;
        firstAuthAtRef.current = Date.now();
        return auth.currentUser;
      });
      if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
    }

    // Run boot manifest hydration and authStateReady in parallel across native bridge
    Promise.all([
      loadBootManifest().catch(() => null),
      auth.authStateReady().catch(() => null),
    ]).then(([manifest]) => {
      if (cancelled) return;

      unstable_batchedUpdates(() => {
        const cachedTasks = manifest?.tasks || [];
        const cachedHabits = manifest?.habits || [];
        const cachedLogs = manifest?.habitLogs || [];

        if (cachedTasks.length > 0) {
          setTasks(prev => prev.length === 0 ? cachedTasks : prev);
        }
        if (cachedHabits.length > 0) {
          setHabits(prev => prev.length === 0 ? cachedHabits : prev);
        }
        if (cachedLogs.length > 0) {
          setHabitLogs(prev => prev.length === 0 ? cachedLogs : prev);
        }
        if (cachedTasks.length > 0 || cachedHabits.length > 0 || cachedLogs.length > 0) {
          hasCachedDataRef.current = true;
          setFirestoreReady(true);
        }

        if (manifest?.pinnedModules && Array.isArray(manifest.pinnedModules) && manifest.pinnedModules.length > 0) {
          setPinnedModules(manifest.pinnedModules.slice(0, 4));
        }

        if (auth.currentUser) {
          setUser(prev => {
            if (auth.currentUser && prev?.uid === auth.currentUser.uid) return prev;
            return auth.currentUser;
          });
          firstAuthAtRef.current = Date.now();
        } else if (manifest?.optimisticUser?.uid) {
          setUser(prev => {
            if (prev?.uid === manifest.optimisticUser!.uid) return prev;
            firstAuthAtRef.current = Date.now();
            return manifest.optimisticUser;
          });
          if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
        }
      });
    }).catch((err) => {
      console.warn('[CoreData] Parallel startup hydration error (non-critical):', err);
    });

    const unsub = onAuthStateChanged(auth, u => {
      if (!cancelled) {
        if (u) {
          if (u.photoURL) {
            cacheUserAvatar(u.uid, u.photoURL).catch(() => {});
          }
          initAvatarCacheOnBoot(u.uid).catch(() => {});
          setUser(prev => {
            if (prev?.uid === u.uid) return prev;
            firstAuthAtRef.current = Date.now();
            return u;
          });
          if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
        } else {
          const msSinceFirstAuth = firstAuthAtRef.current
            ? Date.now() - firstAuthAtRef.current
            : 0;
          AsyncStorage.getItem('@zentrack_optimistic_user').then(raw => {
            if (!cancelled && !raw && msSinceFirstAuth > 5000) {
              hasCachedDataRef.current = false;
              unstable_batchedUpdates(() => {
                setUser(null);
                setTasks([]);
                setHabits([]);
                setHabitLogs([]);
                setFirestoreReady(false);
              });
            }
          }).catch(() => {});
        }
      }
    });

    const guestSub = DeviceEventEmitter.addListener('guest_sign_in', (guestUsr: any) => {
      setUser(guestUsr);
      setFirestoreReady(true);
    });

    return () => {
      cancelled = true;
      unsub();
      guestSub.remove();
    };
  }, []);

  // Register push notifications on login — guarded by AsyncStorage cache.
  const PUSH_TOKEN_CACHE_KEY = '@zentrack_push_token_cached';
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
        if (cached) {
          setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { pushToken: cached }, { merge: true }).catch(handleSyncError);
          return;
        }
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, token);
          setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { pushToken: token }, { merge: true }).catch(handleSyncError);
        }
      } catch { /* ignore — non-critical */ }
    })();
  }, [user?.uid]);

  // ── Real-Time Firestore Subscriptions with OFFLINE-FIRST GUARDS ───────────
  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    // 1. Tasks Listener (Bounded: active tasks + completed within last 30 days)
    const thirtyDaysAgoStr = offsetDateStr(formatLocalDateStr(), -30);
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
      snap => {
        // OFFLINE GUARD: If Firestore memory-cache returns empty snapshot while we have cached data, DO NOT wipe!
        // Only guard when the empty snapshot is from local cache; server-confirmed empty updates must clear state.
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) {
          setFirestoreReady(true);
          return;
        }
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) {
          setFirestoreReady(true);
          return;
        }
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(
            COLLECTION.TASKS,
            snap.docs
              .map(d => parseTask(d.data(), d.id))
              .filter(t => t.status !== 'completed' || !t.completedAt || t.completedAt >= thirtyDaysAgoStr)
          );
          setTasks(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          setFirestoreReady(true);
          hasCachedDataRef.current = true;
          updateL1Cache('tasks', fresh);
          scheduleCoreCacheWrite({ tasks: fresh });
        });
      },
      scheduleListenerRestart("tasks")
    ));

    // 2. Habits Listener
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.HABITS, snap.docs.map(d => parseHabit(d.data(), d.id)));
          setHabits(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          updateL1Cache('habits', fresh);
          scheduleCoreCacheWrite({ habits: fresh });
        });
      },
      scheduleListenerRestart("habits")
    ));

    // 3. Habit Logs Listener (Rolling 60-day window)
    const sixtyDaysAgoStr = offsetDateStr(formatLocalDateStr(), -60);
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(
            COLLECTION.HABIT_LOGS,
            snap.docs
              .map(d => parseHabitLog(d.data(), d.id))
              .filter(l => !l.date || l.date >= sixtyDaysAgoStr)
          );
          setHabitLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          updateL1Cache('habitLogs', fresh);
          scheduleCoreCacheWrite({ habitLogs: fresh });
        });
      },
      scheduleListenerRestart("habitLogs")
    ));

    // 4. User Profile (XP, Saved Places & Pinned Modules Sync) Listener
    unsubsRef.current.push(onSnapshot(
      doc(db, COLLECTION.USER_PROFILES, uid),
      snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data?.xp === 'number') {
            syncXPWithFirestore(data.xp);
          }
          if (Array.isArray(data?.pinnedModules) && data.pinnedModules.length > 0) {
            const remotePinned = data.pinnedModules.slice(0, 4);
            const currentStr = (pinnedModulesRef.current || []).join(',');
            const remoteStr = remotePinned.join(',');
            if (currentStr !== remoteStr) {
              hydratePinnedModulesFromRemote(remotePinned);
            }
          }
          if (Array.isArray(data?.savedPlaces)) {
            AsyncStorage.setItem(STORAGE_KEYS.SAVED_PLACES || '@zentrack_saved_places', JSON.stringify(data.savedPlaces)).catch(() => {});
          }
        }
      },
      scheduleListenerRestart("userProfiles")
    ));
  }, [scheduleListenerRestart, scheduleCoreCacheWrite, hydratePinnedModulesFromRemote]);

  // ── Foreground reconnect: restart listeners on app resume ────────────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[CoreData] foreground reconnect — restarting Firestore listeners');
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user?.uid]);

  // ── App Launch / Mount Subscriptions ───────────────────────────────────────
  // Runs strictly off-interaction to ensure Frame 0 instant paint from L1 cache.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let isCancelled = false;

    const handle = InteractionManager.runAfterInteractions(() => {
      if (isCancelled) return;
      openSubscriptions(uid);
    });

    return () => {
      isCancelled = true;
      handle.cancel();
    };
  }, [user?.uid, subscriptionVersion, openSubscriptions]);

  // Cleanup on unmount or user change
  useEffect(() => {
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [user?.uid]);

  // Manual pull-to-refresh helper
  const refreshCoreData = useCallback(async () => {
    if (!user) return;
    unsubsRef.current.forEach(u => u());
    unsubsRef.current = [];
    subscribedRef.current = false;
    setSubscriptionVersion(v => v + 1);
  }, [user?.uid]);

  // loading is TRUE only when: user is authenticated, Firestore hasn't responded yet,
  // AND we have no cached data to show. Never true when cache is populated.
  const loading = !!user && !firestoreReady && tasks.length === 0;

  const activeHabits     = useMemo(() => habits.filter(h => !h.archived), [habits]);
  const todayHabits      = useMemo(() => activeHabits.slice(0, 5), [activeHabits]);
  const pendingTaskCount = useMemo(() => tasks.filter(t => t.status === "pending").length, [tasks]);
  const todayPendingTaskCount = useMemo(() => {
    const today = formatLocalDateStr(new Date());
    let count = 0;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.status === 'pending' && t.date === today) count++;
    }
    return count;
  }, [tasks]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const habitLogsRef = useRef(habitLogs);
  habitLogsRef.current = habitLogs;

  const optimisticAddTask = useCallback((task: Task) => {
    const next = [task, ...tasksRef.current.filter(t => t.id !== task.id)];
    updateL1Cache('tasks', next);
    setTasks(next);
    scheduleCoreCacheWrite({ tasks: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticUpdateTask = useCallback((taskId: string, partial: Partial<Task>) => {
    const next = tasksRef.current.map(t => t.id === taskId ? { ...t, ...partial } : t);
    updateL1Cache('tasks', next);
    setTasks(next);
    scheduleCoreCacheWrite({ tasks: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticDeleteTask = useCallback((taskId: string) => {
    const next = tasksRef.current.filter(t => t.id !== taskId);
    updateL1Cache('tasks', next);
    setTasks(next);
    scheduleCoreCacheWrite({ tasks: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticAddHabit = useCallback((habit: Habit) => {
    const next = [habit, ...habitsRef.current.filter(h => h.id !== habit.id)];
    updateL1Cache('habits', next);
    setHabits(next);
    scheduleCoreCacheWrite({ habits: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticUpdateHabit = useCallback((habitId: string, partial: Partial<Habit>) => {
    const next = habitsRef.current.map(h => h.id === habitId ? { ...h, ...partial } : h);
    updateL1Cache('habits', next);
    setHabits(next);
    scheduleCoreCacheWrite({ habits: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticDeleteHabit = useCallback((habitId: string) => {
    const next = habitsRef.current.filter(h => h.id !== habitId);
    updateL1Cache('habits', next);
    setHabits(next);
    scheduleCoreCacheWrite({ habits: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticAddHabitLog = useCallback((log: HabitLog) => {
    const next = [...habitLogsRef.current.filter(l => !(l.id === log.id || (l.habitId === log.habitId && l.date === log.date))), log];
    updateL1Cache('habitLogs', next);
    setHabitLogs(next);
    scheduleCoreCacheWrite({ habitLogs: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticUpdateHabitLog = useCallback((logId: string, partial: Partial<HabitLog>) => {
    const next = habitLogsRef.current.map(l => l.id === logId ? { ...l, ...partial } : l);
    updateL1Cache('habitLogs', next);
    setHabitLogs(next);
    scheduleCoreCacheWrite({ habitLogs: next });
  }, [scheduleCoreCacheWrite]);

  const optimisticRemoveHabitLog = useCallback((habitId: string, date: string) => {
    const next = habitLogsRef.current.filter(l => !(l.habitId === habitId && l.date === date));
    updateL1Cache('habitLogs', next);
    setHabitLogs(next);
    scheduleCoreCacheWrite({ habitLogs: next });
  }, [scheduleCoreCacheWrite]);

  // Sync notification action events to React context in-memory immediately (0ms)
  useEffect(() => {
    const subTask = DeviceEventEmitter.addListener('task_updated_from_notification', (event: any) => {
      if (event?.taskId && event?.partial) {
        optimisticUpdateTask(event.taskId, event.partial);
      }
    });
    const subHabit = DeviceEventEmitter.addListener('habit_logged_from_notification', (event: any) => {
      if (event?.log) {
        optimisticAddHabitLog(event.log);
      }
      if (event?.habitId && event?.habitUpdates) {
        optimisticUpdateHabit(event.habitId, event.habitUpdates);
      }
    });
    return () => {
      subTask.remove();
      subHabit.remove();
    };
  }, [optimisticUpdateTask, optimisticAddHabitLog, optimisticUpdateHabit]);

  const value = useMemo(() => ({
    user, tasks, habits: activeHabits, allHabits: habits, habitLogs,
    loading, tasksReady: firestoreReady, pendingTaskCount, todayPendingTaskCount, todayHabits,
    pinnedModules, setPinnedModules, googleAccessToken,
    refreshCoreData,
    optimisticAddTask, optimisticUpdateTask, optimisticDeleteTask,
    optimisticAddHabit, optimisticUpdateHabit, optimisticDeleteHabit,
    optimisticAddHabitLog, optimisticUpdateHabitLog, optimisticRemoveHabitLog
  }), [
    user?.uid, tasks, activeHabits, habits, habitLogs,
    loading, firestoreReady, pendingTaskCount, todayPendingTaskCount, todayHabits,
    pinnedModules, googleAccessToken, refreshCoreData,
    optimisticAddTask, optimisticUpdateTask, optimisticDeleteTask,
    optimisticAddHabit, optimisticUpdateHabit, optimisticDeleteHabit,
    optimisticAddHabitLog, optimisticUpdateHabitLog, optimisticRemoveHabitLog
  ]);

  return (
    <CoreUserContext.Provider value={user}>
      <CoreDataContext.Provider value={value}>
        {children}
      </CoreDataContext.Provider>
    </CoreUserContext.Provider>
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
    const currentUid = auth.currentUser?.uid;

    await AsyncStorage.multiRemove([
      '@zentrack_optimistic_user',
      '@zentrack_offline_write_queue',
      'zentrack_xp_v1',
      'zentrack_xp_streak',
      '@zentrack_onboarding_completed',
      'zentrack_onboarded_v2',
    ]);
    await auth.signOut();
    clearXPMemory();
    await clearCoreCache();
    await clearAllDomainCaches();
    clearSyncMeta(currentUid);
    clearScheduleCache();
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    if (currentUid) {
      await clearAvatarCache(currentUid).catch(() => {});
    }
  } catch (err) {
    console.warn('[Auth] Sign out error:', err);
  }
}



