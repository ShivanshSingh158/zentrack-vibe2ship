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
import { collection, query, where, doc, setDoc, onSnapshot } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION, STORAGE_KEYS } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { writeCoreCacheMulti, readCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { registerForPushNotificationsAsync, clearScheduleCache } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';
import { parseTask, parseHabit, parseHabitLog, areItemsEqual } from "../../utils/schemaGuards";
import { syncXPWithFirestore } from "../../services/xpSystem";
import { clearOrchestratorCache } from "../../agent/orchestrator";
import { usePinnedModules } from "../PinnedModulesContext";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface CoreDataContextType {
  user: User | null;
  tasks: Task[];
  habits: Habit[];          // active only
  allHabits: Habit[];
  habitLogs: HabitLog[];
  loading: boolean;
  tasksReady: boolean;   // true once Firestore has confirmed tasks (or confirmed empty)
  pendingTaskCount: number;
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
  tasksReady: false,
  pendingTaskCount: 0,
  todayHabits: [],
  pinnedModules: ["Tasks", "Gym", "Calendar", "Attendance"],
  setPinnedModules: () => {},
  googleAccessToken: null,
  refreshCoreData: async () => {},
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
  const { pinnedModules, setPinnedModules } = usePinnedModules();

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[CoreData] ${context} listener error — restarting in 5s`, err.message);
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

  // ── Parallel Startup Hydration & Auth Resolution (Promise.all) ───────────
  useEffect(() => {
    let cancelled = false;

    // Check synchronous auth on Frame 0
    if (auth.currentUser) {
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
      AsyncStorage.getItem('@zentrack_optimistic_user').catch(() => null),
      readCoreCacheMulti().catch(() => null),
      AsyncStorage.getItem('@zentrack_pinned_modules').catch(() => null),
    ]).then(([manifest, _, rawUser, coreCache, rawPinned]) => {
      if (cancelled) return;

      unstable_batchedUpdates(() => {
        // 1. Hydrate manifest / core cache data if needed
        const cachedTasks = (manifest?.tasks && manifest.tasks.length > 0) ? manifest.tasks : (coreCache?.tasks || []);
        const cachedHabits = (manifest?.habits && manifest.habits.length > 0) ? manifest.habits : (coreCache?.habits || []);
        const cachedLogs = (manifest?.habitLogs && manifest.habitLogs.length > 0) ? manifest.habitLogs : (coreCache?.habitLogs || []);

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

        // 2. Hydrate pinned modules (ensures custom pins survive app close/kill)
        let userPinned: string[] | null = null;
        if (manifest?.pinnedModules && Array.isArray(manifest.pinnedModules) && manifest.pinnedModules.length > 0) {
          userPinned = manifest.pinnedModules;
        } else if (rawPinned) {
          try {
            const parsed = JSON.parse(rawPinned);
            if (Array.isArray(parsed) && parsed.length > 0) {
              userPinned = parsed.slice(0, 4);
            }
          } catch {}
        }
        if (userPinned && userPinned.length > 0) {
          setPinnedModules(userPinned);
        }

        // 3. Resolve user from auth state or optimistic storage
        if (auth.currentUser) {
          setUser(prev => {
            if (auth.currentUser && prev?.uid === auth.currentUser.uid) return prev;
            return auth.currentUser;
          });
          firstAuthAtRef.current = Date.now();
        } else if (rawUser) {
          try {
            const parsed = JSON.parse(rawUser);
            if (parsed?.uid) {
              setUser(prev => {
                if (prev?.uid === parsed.uid) return prev;
                firstAuthAtRef.current = Date.now();
                return parsed as User;
              });
              if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
            }
          } catch {}
        }
      });
    }).catch((err) => {
      console.warn('[CoreData] Parallel startup hydration error (non-critical):', err);
    });

    const unsub = onAuthStateChanged(auth, u => {
      if (!cancelled) {
        if (u) {
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

    // 1. Tasks Listener
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
      snap => {
        // OFFLINE GUARD: If Firestore memory-cache returns empty snapshot while we have cached data, DO NOT wipe!
        // Only guard when the empty snapshot is from local cache; server-confirmed empty updates must clear state.
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) {
          setFirestoreReady(true);
          return;
        }
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseTask(d.data(), d.id));
          setTasks(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          setFirestoreReady(true);
          hasCachedDataRef.current = true;
          updateL1Cache('tasks', fresh);
          InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ tasks: fresh }, false));
        });
      },
      scheduleListenerRestart("tasks")
    ));

    // 2. Habits Listener
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) {
          setFirestoreReady(true);
          return;
        }
        if (isHabitLocked.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseHabit(d.data(), d.id));
          setHabits(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          setFirestoreReady(true);
          hasCachedDataRef.current = true;
          updateL1Cache('habits', fresh);
          InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ habits: fresh }, false));
        });
      },
      scheduleListenerRestart("habits")
    ));

    // 3. Habit Logs Listener
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) {
          setFirestoreReady(true);
          return;
        }
        if (isHabitLogLocked.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseHabitLog(d.data(), d.id));
          setHabitLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          setFirestoreReady(true);
          hasCachedDataRef.current = true;
          updateL1Cache('habitLogs', fresh);
          InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ habitLogs: fresh }, false));
        });
      },
      scheduleListenerRestart("habitLogs")
    ));

    // 4. User Profile (XP, Saved Places, Gym Geofence & Pinned Modules Sync) Listener
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
            setPinnedModules(remotePinned);
          }
          if (Array.isArray(data?.savedPlaces)) {
            AsyncStorage.setItem(STORAGE_KEYS.SAVED_PLACES || '@zentrack_saved_places', JSON.stringify(data.savedPlaces)).catch(() => {});
          }
          if (data?.gymGeofenceConfig !== undefined) {
            if (data.gymGeofenceConfig) {
              AsyncStorage.setItem(STORAGE_KEYS.GYM_GEOFENCE || '@zentrack_gym_geofence_config', JSON.stringify(data.gymGeofenceConfig)).catch(() => {});
            } else {
              AsyncStorage.removeItem(STORAGE_KEYS.GYM_GEOFENCE || '@zentrack_gym_geofence_config').catch(() => {});
            }
          }
        }
      },
      scheduleListenerRestart("userProfiles")
    ));
  }, [scheduleListenerRestart]);

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

  const optimisticAddTask = (task: Task) => {
    setTasks(prev => {
      const next = [task, ...prev];
      writeCoreCacheMulti({ tasks: next }, true);
      updateL1Cache('tasks', next);
      return next;
    });
  };
  const optimisticUpdateTask = (taskId: string, partial: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === taskId ? { ...t, ...partial } : t);
      // Write-through to AsyncStorage: survives offline app kill+restart
      writeCoreCacheMulti({ tasks: next }, true);
      updateL1Cache('tasks', next);
      return next;
    });
  };
  const optimisticDeleteTask = (taskId: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== taskId);
      writeCoreCacheMulti({ tasks: next }, true);
      updateL1Cache('tasks', next);
      return next;
    });
  };
  const optimisticUpdateHabit = (habitId: string, partial: Partial<Habit>) => {
    lockHabits();
    setHabits(prev => {
      const next = prev.map(h => h.id === habitId ? { ...h, ...partial } : h);
      writeCoreCacheMulti({ habits: next }, true);
      updateL1Cache('habits', next);
      return next;
    });
  };
  const optimisticAddHabitLog = (log: HabitLog) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = [...prev, log];
      writeCoreCacheMulti({ habitLogs: next }, true);
      updateL1Cache('habitLogs', next);
      return next;
    });
  };
  const optimisticUpdateHabitLog = (logId: string, partial: Partial<HabitLog>) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial } : l);
      writeCoreCacheMulti({ habitLogs: next }, true);
      updateL1Cache('habitLogs', next);
      return next;
    });
  };
  const optimisticRemoveHabitLog = (habitId: string, date: string) => {
    lockHabitLogs();
    setHabitLogs(prev => {
      const next = prev.filter(l => !(l.habitId === habitId && l.date === date));
      writeCoreCacheMulti({ habitLogs: next }, true);
      updateL1Cache('habitLogs', next);
      return next;
    });
  };

  const value = useMemo(() => ({
    user, tasks, habits: activeHabits, allHabits: habits, habitLogs,
    loading, tasksReady: firestoreReady, pendingTaskCount, todayHabits,
    pinnedModules, setPinnedModules, googleAccessToken,
    refreshCoreData,
    optimisticAddTask, optimisticUpdateTask, optimisticDeleteTask,
    optimisticUpdateHabit, optimisticAddHabitLog, optimisticUpdateHabitLog, optimisticRemoveHabitLog
  }), [
    user?.uid, tasks, activeHabits, habits, habitLogs,
    loading, firestoreReady, pendingTaskCount, todayHabits,
    pinnedModules, googleAccessToken, refreshCoreData
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
    clearOrchestratorCache();

    await AsyncStorage.multiRemove([
      '@zentrack_optimistic_user',
      '@zentrack_offline_write_queue',
      'zentrack_xp_v1',
      'zentrack_xp_streak',
    ]);
    await auth.signOut();
    await clearCoreCache();
    await clearAllDomainCaches();
    clearScheduleCache();
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  } catch (err) {
    console.warn('[Auth] Sign out error:', err);
  }
}



