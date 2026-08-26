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
import { collection, query, where, onSnapshot, doc, setDoc, getDoc, getDocs, QuerySnapshot, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { auth, db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { Task, Habit, HabitLog } from "../MobileDataContext";
import { writeCoreCacheMulti, clearCoreCache } from "../../utils/coreCache";
import { getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { clearAllDomainCaches } from "../../utils/domainCache";
import { registerForPushNotificationsAsync } from "../../services/notifications";
import { handleSyncError } from '../../utils/errorUtils';
import { parseTask, parseHabit, parseHabitLog, areItemsEqual } from "../../utils/schemaGuards";
import { syncXPWithFirestore } from "../../services/xpSystem";
import { fetchServerSyncMeta, getLocalSyncTimestamp, setLocalSyncTimestamp } from "../../utils/syncMeta";


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
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(initialManifest?.googleAccessToken ?? null);

  // Tracks when we first resolved a valid authenticated user.
  // Used to guard against Firebase's routine 60-min token refresh firing
  // onAuthStateChanged(null) and erroneously clearing the user state.
  const firstAuthAtRef = useRef<number>(0);

  // OFFLINE-FIRST GUARD: CoreData is always seeded from getBootManifestSync() above.
  // If cached data exists, we must not let the empty memoryLocalCache onSnapshot
  // (which fires immediately on cold boot with no internet) overwrite it.
  const hasCachedDataRef = useRef(
    (initialManifest?.tasks?.length ?? 0) > 0 ||
    (initialManifest?.habits?.length ?? 0) > 0 ||
    (initialManifest?.habitLogs?.length ?? 0) > 0
  );

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

  // NOTE: All boot state (user, tasks, habits, habitLogs, pinnedModules, googleAccessToken)
  // is already seeded synchronously from getBootManifestSync() in the useState() initializers
  // above (lines 85–116). AppNavigator.tsx pre-warms the L1 cache via a module-level
  // loadBootManifest() call before React renders anything, so getBootManifestSync() is
  // guaranteed to return populated data on Frame 0.
  // The async loadBootManifest() useEffect previously here was REDUNDANT — it would call
  // setTasks/setHabits/etc. with identical values, causing a no-op reconciliation cycle
  // that wasted ~15ms of JS thread time during the critical cold-boot window.
  // auth.firstAuthAt is set by the onAuthStateChanged listener below.

  const setPinnedModules = (mods: string[]) => {
    const clamped = mods.length > 0 ? mods.slice(0, 4) : DEFAULT_PINNED_MODULES;
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem("@zentrack_pinned_modules", JSON.stringify(clamped)).catch(console.warn);
  };

  // NOTE: readCoreCacheMulti() was previously called here to reseed tasks/habits/habitLogs.
  // That was a REDUNDANT double-read. The data is already seeded from getBootManifestSync()
  // in the useState() initializers above (lines 87-89). bootManifest.ts reads the same
  // AsyncStorage keys (@zentrack_cache_tasks, @zentrack_cache_habits, @zentrack_cache_habitlogs)
  // in its multiGet call. Calling readCoreCacheMulti() again caused:
  //   1. A 2nd AsyncStorage.multiGet (5-15ms blocked async) on every uid change
  //   2. 3 setState calls with IDENTICAL values → 3 spurious re-renders of Dashboard
  //   3. This fired on EVERY Firebase auth confirmation (every ~60min)
  // Removed. Firestore snapshots below write fresh data to both state and AsyncStorage
  // so subsequent boots are always fast.

  // Auth state — updates user reference.
  // OFFLINE-FIRST GUARD: Firebase fires onAuthStateChanged(null) during routine
  // 60-min token refreshes. We suppress null-user clears for 5 seconds after
  // first auth, and only clear when there is ALSO no optimistic user in storage.
  // This matches the WhatsApp / Instagram pattern: offline = stay logged in.
  useEffect(() => {
    let cancelled = false;

    // Check synchronous auth or cached optimistic user on mount (~0ms).
    // GUARD: Skip setUser if the UID is already correct (seeded by getBootManifestSync
    // in useState). Prevents a spurious re-render cascade on Frame 0.
    if (auth.currentUser) {
      setUser(prev => {
        if (prev?.uid === auth.currentUser?.uid) return prev; // Already correct — no re-render
        firstAuthAtRef.current = Date.now();
        return auth.currentUser;
      });
      if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
    } else {
      AsyncStorage.getItem('@zentrack_optimistic_user').then(raw => {
        if (!cancelled && raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.uid) {
              setUser(prev => {
                if (prev?.uid === parsed.uid) return prev; // Already correct — no re-render
                firstAuthAtRef.current = Date.now();
                return parsed as User;
              });
              if (!firstAuthAtRef.current) firstAuthAtRef.current = Date.now();
            }
          } catch {}
        }
      }).catch(() => {});
    }

    auth.authStateReady().then(() => {
      if (!cancelled && auth.currentUser) {
        // Only update if UID is different — avoids re-render cascade when Firebase
        // re-confirms the same session with a new object reference after token refresh.
        setUser(prev => {
          if (auth.currentUser && prev?.uid === auth.currentUser.uid) return prev;
          return auth.currentUser;
        });
        firstAuthAtRef.current = Date.now();
      }
    }).catch(() => {});

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

  // ── Listener auto-restart on error ───────────────────────────────────────
  // Firebase ID tokens expire every 60 min. If a network blip coincides with
  // token expiry, onSnapshot fires its error callback and the listener dies
  // permanently. This counter, when incremented, causes the effect below to
  // re-run (after cleanup), reopening all three listeners fresh.
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useCallback: stable function reference across renders.
  // Previously a plain arrow function — recreated on every render causing
  // stale closures in Firestore subscription effects.
  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[CoreData] ${context} listener error — restarting in 5s`, err.message);
    // Only schedule one retry at a time
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

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
  }, [user?.uid]);

  // 1-Read Delta Sync & Critical-path Firestore subscriptions
  // On boot: Reads single user_sync_meta/{uid} doc (1 read).
  // If lastModifiedAt <= localSyncTimestamp: skips full collection queries (0 extra reads).
  // If lastModifiedAt > localSyncTimestamp or first run: opens live listeners and syncs.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let isCancelled = false;
    const unsubs: (() => void)[] = [];

    const openListeners = () => {
      if (unsubs.length > 0) return;

      unsubs.push(onSnapshot(
        query(collection(db, COLLECTION.TASKS), where("userId", "==", uid)),
        (snap: QuerySnapshot<DocumentData>) => {
          if (snap.docs.length === 0 && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => parseTask(d.data(), d.id));
            setTasks(prev => areItemsEqual(prev, fresh) ? prev : fresh);
            setFirestoreReady(true);
            hasCachedDataRef.current = false;
            InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ tasks: fresh }, false));
          });
        },
        scheduleListenerRestart("tasks")
      ));

      unsubs.push(onSnapshot(
        query(collection(db, COLLECTION.HABITS), where("userId", "==", uid)),
        (snap: QuerySnapshot<DocumentData>) => {
          if (snap.docs.length === 0 && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => parseHabit(d.data(), d.id));
            if (!isHabitLocked.current) {
              setHabits(prev => areItemsEqual(prev, fresh) ? prev : fresh);
              InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ habits: fresh }, false));
            }
          });
        },
        scheduleListenerRestart("habits")
      ));

      unsubs.push(onSnapshot(
        query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid)),
        (snap: QuerySnapshot<DocumentData>) => {
          if (snap.docs.length === 0 && hasCachedDataRef.current) return;
          unstable_batchedUpdates(() => {
            const fresh = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => parseHabitLog(d.data(), d.id));
            if (!isHabitLogLocked.current) {
              setHabitLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
              InteractionManager.runAfterInteractions(() => writeCoreCacheMulti({ habitLogs: fresh }, false));
            }
          });
        },
        scheduleListenerRestart("habitLogs")
      ));
    };

    // XP Sync
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

    // 1-READ DELTA CHECK:
    (async () => {
      try {
        const [serverMeta, localTs] = await Promise.all([
          fetchServerSyncMeta(uid),
          getLocalSyncTimestamp(),
        ]);
        if (isCancelled) return;

        const hasLocalCache = tasks.length > 0 || habits.length > 0;
        if (serverMeta && serverMeta.lastModifiedAt <= localTs && hasLocalCache) {
          // Cache is 100% up to date! 0 extra collection reads spent.
          setFirestoreReady(true);
        } else {
          // Data changed on server or first boot — sync fresh data
          openListeners();
          if (serverMeta?.lastModifiedAt) {
            await setLocalSyncTimestamp(serverMeta.lastModifiedAt);
          }
        }
      } catch (err) {
        if (!isCancelled) openListeners();
      }
    })();

    return () => {
      isCancelled = true;
      unsubs.forEach(u => u());
    };
  }, [user?.uid, subscriptionVersion]);

  // Manual pull-to-refresh helper: forces a live sync and updates sync metadata
  const refreshCoreData = useCallback(async () => {
    if (!user) return;
    const uid = user.uid;
    try {
      const [tasksSnap, habitsSnap, logsSnap, metaSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTION.TASKS), where("userId", "==", uid))),
        getDocs(query(collection(db, COLLECTION.HABITS), where("userId", "==", uid))),
        getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where("userId", "==", uid))),
        fetchServerSyncMeta(uid),
      ]);

      const freshTasks = tasksSnap.docs.map(d => parseTask(d.data(), d.id));
      const freshHabits = habitsSnap.docs.map(d => parseHabit(d.data(), d.id));
      const freshLogs = logsSnap.docs.map(d => parseHabitLog(d.data(), d.id));

      unstable_batchedUpdates(() => {
        setTasks(prev => areItemsEqual(prev, freshTasks) ? prev : freshTasks);
        setHabits(prev => areItemsEqual(prev, freshHabits) ? prev : freshHabits);
        setHabitLogs(prev => areItemsEqual(prev, freshLogs) ? prev : freshLogs);
        setFirestoreReady(true);
        writeCoreCacheMulti({ tasks: freshTasks, habits: freshHabits, habitLogs: freshLogs }, true);
      });

      const now = metaSnap?.lastModifiedAt || Date.now();
      await setLocalSyncTimestamp(now);
    } catch (err) {
      console.warn('[CoreData] refreshCoreData error:', err);
    }
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
    refreshCoreData,
    optimisticAddTask, optimisticUpdateTask, optimisticDeleteTask,
    optimisticUpdateHabit, optimisticAddHabitLog, optimisticUpdateHabitLog, optimisticRemoveHabitLog
  }), [
    user?.uid, tasks, activeHabits, habits, habitLogs,
    loading, pendingTaskCount, todayHabits,
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


