/**
 * CoreDataContext — ZenTrack Mobile
 *
 * Owns: auth state, tasks, habits, habitLogs, pinned modules, Google token,
 *       notification action listener.
 *
 * Subscription strategy: ALWAYS OPEN immediately on login.
 * These are critical-path: Dashboard, Tasks, Habits all need them before first paint.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import { collection, query, where, doc, setDoc, getDoc, getDocs } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { writeCoreCacheMulti, readCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { registerForPushNotificationsAsync } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';
import { parseTask, parseHabit, parseHabitLog, areItemsEqual } from "../../utils/schemaGuards";
import { syncXPWithFirestore } from "../../services/xpSystem";
import { fetchServerSyncMeta, getLocalSyncTimestamp, setLocalSyncTimestamp } from "../../utils/syncMeta";
import { clearOrchestratorCache } from "../../agent/orchestrator";


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

  const setPinnedModules = (mods: string[]) => {
    const clamped = mods.length > 0 ? mods.slice(0, 4) : DEFAULT_PINNED_MODULES;
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem("@zentrack_pinned_modules", JSON.stringify(clamped)).catch(console.warn);
  };

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
    ]).then(([manifest, _, rawUser, coreCache]) => {
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

        // 2. Resolve user from auth state or optimistic storage
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
      // FIX (Bug #1): Outer catch guards against runtime throws inside .then()
      // (e.g. JSON.parse on corrupted AsyncStorage, unexpected manifest shape).
      // App already has Frame 0 data from getBootManifestSync() — no user-visible impact.
      console.warn('[CoreData] Parallel startup hydration error (non-critical):', err);
    });

    const unsub = onAuthStateChanged(auth, u => {
      if (!cancelled) {
        if (u) {
          // KEY FIX: Only update user state if UID actually changed.
          // Firebase fires onAuthStateChanged with a NEW User object every time it
          // refreshes the ID token (~every 60min). Same UID = same session = no re-render.
          setUser(prev => {
            if (prev?.uid === u.uid) return prev; // Same user, keep stable reference
            firstAuthAtRef.current = Date.now();
            return u;
          });
          if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
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


  // Register push notifications on login — guarded by AsyncStorage cache.
  // registerForPushNotificationsAsync() calls the Expo native push API which can
  // take 50–200ms on Android. The token NEVER changes unless the app is reinstalled,
  // so we cache it and skip the native call on every uid change / token refresh.
  const PUSH_TOKEN_CACHE_KEY = '@zentrack_push_token_cached';
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    (async () => {
      try {
        // Check if we already have a cached token — skip native API if so
        const cached = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
        if (cached) {
          // Token already registered — just ensure Firestore has it (idempotent merge)
          setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { pushToken: cached }, { merge: true }).catch(handleSyncError);
          return;
        }
        // No cached token — call native API (first install or after reinstall)
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, token);
          setDoc(doc(db, COLLECTION.USER_PROFILES, uid), { pushToken: token }, { merge: true }).catch(handleSyncError);
        }
      } catch { /* ignore — non-critical */ }
    })();
  }, [user?.uid]);

  // ── 1-Read Delta Synchronization Engine ─────────────────────────────────
  // Reads only user_sync_meta/{uid} on app launch (1 read total).
  // If server lastModifiedAt <= localSyncTimestamp: 0 collection queries executed.
  // If server lastModifiedAt > localSyncTimestamp (or cache empty): fetches deltas & updates cache.
  const performDeltaSync = useCallback(async (uid: string, forceFetchAll = false) => {
    try {
      const [localTs, serverMeta] = await Promise.all([
        getLocalSyncTimestamp(),
        fetchServerSyncMeta(uid),
      ]);

      const hasLocalData = (tasks.length > 0 || habits.length > 0 || habitLogs.length > 0) || hasCachedDataRef.current;
      const isUpToDate = !forceFetchAll &&
        hasLocalData &&
        serverMeta !== null &&
        typeof serverMeta.lastModifiedAt === 'number' &&
        serverMeta.lastModifiedAt <= localTs;

      if (isUpToDate) {
        console.log(`[CoreData] 1-Read Delta Sync: Local cache is up-to-date (Server: ${serverMeta.lastModifiedAt} <= Local: ${localTs}). 0 collection reads executed. ⚡`);
        setFirestoreReady(true);
        return;
      }

      // Delta detected, initial boot, or forced pull-to-refresh: fetch fresh data
      console.log(`[CoreData] 1-Read Delta Sync: Delta detected or cache refresh needed (Server: ${serverMeta?.lastModifiedAt ?? 'new'} > Local: ${localTs}). Fetching collections... 📡`);

      const [tasksSnap, habitsSnap, logsSnap, profileSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTION.TASKS), where("userId", "==", uid))),
        getDocs(query(collection(db, COLLECTION.HABITS), where("userId", "==", uid))),
        getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid))),
        getDoc(doc(db, COLLECTION.USER_PROFILES, uid)).catch(() => null),
      ]);

      const freshTasks = tasksSnap.docs.map(d => parseTask(d.data(), d.id));
      const freshHabits = habitsSnap.docs.map(d => parseHabit(d.data(), d.id));
      const freshLogs = logsSnap.docs.map(d => parseHabitLog(d.data(), d.id));

      if (profileSnap && profileSnap.exists()) {
        const data = profileSnap.data();
        if (typeof data?.xp === 'number') {
          syncXPWithFirestore(data.xp);
        }
      }

      unstable_batchedUpdates(() => {
        setTasks(prev => areItemsEqual(prev, freshTasks) ? prev : freshTasks);
        if (!isHabitLocked.current) {
          setHabits(prev => areItemsEqual(prev, freshHabits) ? prev : freshHabits);
        }
        if (!isHabitLogLocked.current) {
          setHabitLogs(prev => areItemsEqual(prev, freshLogs) ? prev : freshLogs);
        }
        setFirestoreReady(true);
        hasCachedDataRef.current = true;
        writeCoreCacheMulti({ tasks: freshTasks, habits: freshHabits, habitLogs: freshLogs }, true);
      });

      const newTs = serverMeta?.lastModifiedAt || Date.now();
      await setLocalSyncTimestamp(newTs);
    } catch (err) {
      console.warn('[CoreData] performDeltaSync error:', err);
      // Fallback: mark ready if we already have cached data populated
      setFirestoreReady(true);
    }
    // FIX (Bug #3): Do NOT include tasks.length/habits.length/habitLogs.length in deps.
    // Those values changing on every optimisticAddTask/optimisticUpdateHabit call would
    // recreate performDeltaSync and re-trigger the useEffect below, queuing a fresh
    // user_sync_meta Firestore read on every rapid write. The function only needs to
    // know whether ANY local data exists — captured by hasCachedDataRef.current instead.
  }, []);

  // ── Foreground reconnect: check 1-read sync metadata on app resume ─────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[CoreData] foreground reconnect — checking 1-read sync meta');
        performDeltaSync(user.uid);
      }
    });
    return () => sub.remove();
  }, [user?.uid, performDeltaSync]);

  // ── App Launch / Mount Sync ───────────────────────────────────────────────
  // Runs strictly off-interaction to ensure Frame 0 instant paint from L1 cache.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let isCancelled = false;

    const handle = InteractionManager.runAfterInteractions(() => {
      if (isCancelled) return;
      performDeltaSync(uid);
    });

    return () => {
      isCancelled = true;
      handle.cancel();
    };
  }, [user?.uid, performDeltaSync]);

  // Manual pull-to-refresh helper: forces a live sync and updates sync metadata
  const refreshCoreData = useCallback(async () => {
    if (!user) return;
    await performDeltaSync(user.uid, true);
  }, [user?.uid, performDeltaSync]);

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
    // FIX (Risk 3): Clear SARA's in-memory prompt cache before sign-out.
    // The prompt cache is a module-level variable that persists across sessions.
    // If not cleared, User B on the same device gets User A's task/habit summaries
    // injected into their first SARA query until the 30-second TTL expires.
    clearOrchestratorCache();

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


