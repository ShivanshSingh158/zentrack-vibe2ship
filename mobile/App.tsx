import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, LogBox, AppState, AppStateStatus, InteractionManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { OfflineIndicator } from './src/components/OfflineIndicator';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions, registerBackgroundNotificationFetch, cancelClassNotificationsImmediately, clearScheduleCache } from './src/services/notifications';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens, enableFreeze } from 'react-native-screens';

// CRITICAL: Must be called at module level (global scope) BEFORE any React renders.
// Without this, Android auto-hides the native splash screen before JS finishes loading,
// causing the black screen freeze. AppNavigator's NavigationContainer.onReady() calls
// hideAsync() as the single source of truth for when to reveal the app.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Fix for React Native New Architecture (Fabric) grey screen bug.
// A system notification/overlay triggers an onPause, and React Freeze catastrophically fails
// to render the frame during this state transition, causing the grey screen.
// We MUST keep this false permanently and accept the CPU tradeoff.
enableFreeze(false);

import { setupNetworkListener } from './src/services/offlineSync';
import { setupLifecycleHygiene } from './src/services/lifecycleHygiene';
import { registerDeferredOtaSync } from './src/services/otaUpdateService';
import { loadBootManifest } from './src/utils/bootManifest';
import { PortalProvider } from './src/contexts/PortalContext';
import { unregisterBackgroundProactiveAgent } from './src/services/backgroundProactiveAgent';
import { registerWeeklyReviewTask } from './src/services/backgroundTasks';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { MobileDataProvider } from './src/contexts/MobileDataContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { navigationRef } from './src/navigation/AppNavigator';
import { db, auth } from './src/services/firebase';
import { doc, updateDoc, increment, addDoc, setDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { formatLocalDateStr } from './src/utils/dateUtils';
import { COLLECTION } from './src/config/constants';
import { awardXP } from './src/services/xpSystem';
import { repairDuplicateAttendanceLogs } from './src/utils/attendanceRepair';

/** Builds the same deterministic log ID as useAttendanceFirestore / attendanceConstants. */
const buildAttLogId = (uid: string, subjectId: string, date: string, type: 'class' | 'lab', idx = 0) =>
  `${uid}_${subjectId}_${date.slice(0, 10)}_${type}_${idx}`;

// Expo SDK 53+ removed remote push from Expo Go, but local notifications still work.
// expo-av is deprecated in SDK 54 but still functional until SDK 55.
// These suppress the popup overlays — the Metro terminal still shows them (unavoidable).
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '[expo-av]: Expo AV has been deprecated',
  'expo-notifications` functionality is not fully supported',
  'setLayoutAnimationEnabledExperimental',
  'Could not reach Cloud Firestore backend', // Safe to ignore — Firebase falls back to offline cache automatically
  '[OfflineSync]',
  'Missing or insufficient permissions',
  '[Reanimated] Property "opacity"',
  'Tried to register two views with the same name',
]);

// Intercept console to completely silence Metro terminal spam for known safe warnings/errors
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && (
    args[0].includes('setLayoutAnimationEnabledExperimental') ||
    args[0].includes('[Reanimated] Property "opacity"')
  )) return;
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Could not reach Cloud Firestore backend')) return;
  originalError(...args);
};



import { StatusBar } from 'expo-status-bar';


import { PomodoroProvider } from './src/contexts/PomodoroContext';

function ThemedAppContainer() {
  const { colors, isDark } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar 
          style={isDark ? 'light' : 'dark'} 
          backgroundColor={colors.background} 
        />
        <PortalProvider>
          <MobileDataProvider>
            <PomodoroProvider>
              <ErrorBoundary screenName="RootApp">
                <AppNavigator />
              </ErrorBoundary>
              <OfflineIndicator />
            </PomodoroProvider>
          </MobileDataProvider>
        </PortalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import {
  initGeofencingOnBoot,
  checkImmediateGymProximity,
  rearmGeofencesIfNeeded,
  startForegroundGymProximityPolling,
} from './src/services/geofenceService';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Pre-warm the boot manifest as early as possible so AppNavigator
  // has cached data by the time it mounts. Fire-and-forget — we don't
  // block rendering on it. AppNavigator has its own 8s auth timeout.
  useEffect(() => {
    loadBootManifest().catch(() => {});
  }, []);

  useEffect(() => {
    // Initialize notification channels & check permissions immediately on boot
    requestNotificationPermissions().catch(console.warn);

    const handle = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(() => {
        registerBackgroundNotificationFetch();
        unregisterBackgroundProactiveAgent().catch(() => {});
        registerWeeklyReviewTask();
        initGeofencingOnBoot().catch((e: any) => {
          console.warn('[Boot] Geofence boot init skipped:', e?.message);
        });
        // Run attendance duplicate-log repair once per install session.
        // Uses its own AsyncStorage flag — no-op if already done.
        const uid = auth.currentUser?.uid;
        if (uid) {
          repairDuplicateAttendanceLogs(uid).catch(() => {});
        }
      }, 3000);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, []);

  // Proactive Instant Geofence Check on Foreground Resume:
  // When the user toggles Location (GPS) in Quick Settings and re-opens ZenTrack
  // while already standing inside the gym, evaluate proximity immediately!
  // Also re-arm geofences in case the OS silently de-registered them (reboot, low memory).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // 1. Check proximity immediately (user may already be inside gym)
        checkImmediateGymProximity().catch(() => {});
        // 2. Re-arm OS geofences if they were silently dropped
        rearmGeofencesIfNeeded().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Foreground Proximity Polling:
  // Polls every 30 seconds while the app is running to detect gym arrival/departure
  // without relying solely on OS geofencing (which can be delayed by DOZE mode).
  useEffect(() => {
    // Delay start by 5s to not interfere with app boot sequence
    let stopPolling: (() => void) | null = null;
    const bootDelay = setTimeout(() => {
      stopPolling = startForegroundGymProximityPolling(30000);
    }, 5000);
    return () => {
      clearTimeout(bootDelay);
      if (stopPolling) stopPolling();
    };
  }, []);



  // Drain ALL queued offline writes & register deferred background OTA updates
  useEffect(() => {
    const unsubscribeNet = setupNetworkListener();
    const unsubscribeLifecycle = setupLifecycleHygiene();
    const unsubscribeOta = registerDeferredOtaSync();
    return () => {
      unsubscribeNet();
      unsubscribeLifecycle();
      unsubscribeOta();
    };
  }, []);

  // ─── Notification Response Handler ─────────────────────────────────────────
  // Central listener for ALL actionable notification taps.
  // Handles all 13 notification types → correct module navigation + Firestore writes.
  // Uses navigationRef for imperative navigation that works even on cold-start.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { notification, actionIdentifier } = response;
      const data = notification.request.content.data as any;
      const categoryId = notification.request.content.categoryIdentifier;
      const identifier = notification.request.identifier || '';

      const parsedTaskId = (data?.taskId as string | undefined) ||
        (identifier.startsWith('task_') ? identifier.split('_')[1] : undefined);
      const parsedHabitId = (data?.habitId as string | undefined) ||
        (identifier.startsWith('habit_') ? identifier.split('_')[1] : undefined);
      const parsedSubjectId = (data?.subjectId as string | undefined) ||
        (identifier.startsWith('class_') ? identifier.split('_')[1] : identifier.startsWith('lab_') ? identifier.split('_')[1] : undefined);

      const notifType = (data?.type as string | undefined) ||
        (identifier.startsWith('water_') ? 'water_reminder' :
         identifier.startsWith('brief_') ? 'morning_brief' :
         identifier.startsWith('gym_') ? 'gym' :
         identifier.startsWith('task_') ? 'task_alarm' :
         identifier.startsWith('habit_') ? 'habit_reminder' :
         identifier.startsWith('class_') ? 'class_reminder' :
         categoryId);

      // Helper: navigate imperatively, works before React tree mounts
      const nav = (screen: string, params?: object) => {
        if (!navigationRef.isReady()) return;
        // All screens registered in MainTabNavigator (both pinned + hidden ones).
        // React Navigation can navigate to any Tab.Screen even if display:none in the bar.
        const tabScreens = [
          'Home', 'Tasks', 'Calendar', 'Habits', 'Gym', 'Attendance',
          'Analytics', 'Notes', 'Sara', 'Social', 'Assignments',
          'Grades', 'Learning', 'WeeklyReview', 'StudyRoom',
        ];
        if (tabScreens.includes(screen)) {
          navigationRef.navigate('MainTabs', { screen } as any);
        } else {
          // Screens inside MoreStack (Settings, NotificationsSettings, Sara, etc.)
          navigationRef.navigate('MoreStack', { screen, params } as any);
        }
      };


      // ── ACTION: "Start Workout" button on gym_reminder ─────────────────────
      if (actionIdentifier === 'start_workout') {
        nav('Gym');
        return;
      }

      // ── ACTION: "Snooze 15m" button on gym_reminder ────────────────────────
      if (actionIdentifier === 'snooze_15m') {
        const snoozeSeconds = 15 * 60;
        const snoozeDate = new Date(Date.now() + snoozeSeconds * 1000);
        const triggerConfig: any = Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: snoozeDate,
              channelId: 'default',
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: snoozeDate,
            };

        await Notifications.scheduleNotificationAsync({
          identifier: `gym_snooze_${Date.now()}`,
          content: {
            title: 'Workout Reminder: Gym Day',
            body: 'Snoozed 15 min. Ready to begin your workout?',
            data: Platform.OS === 'ios' ? { type: 'gym' } : undefined,
            categoryIdentifier: 'gym_reminder',
            channelId: 'default',
            ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
            priority: Notifications.AndroidNotificationPriority?.HIGH ?? ('high' as any),
          } as any,
          trigger: triggerConfig,
        });
        return;
      }

      // ── ACTION: "Mark Done" button on task_reminder & location_task_reminder ─────────────────
      if (actionIdentifier === 'mark_task_done' || actionIdentifier === 'MARK_DONE') {
        const taskId    = parsedTaskId;
        const taskTitle = (data?.taskTitle as string | undefined) || (notification.request.content.title as string | undefined);
        let success = false;
        if (taskId) {
          try {
            // BUG-06 FIX: Guard against re-completing an already-completed task
            // (preserves original completedAt timestamp and prevents stale notification double-fire)
            const taskSnap = await getDoc(doc(db, COLLECTION.TASKS, taskId));
            if (taskSnap.exists() && taskSnap.data()?.status === 'completed') {
              // Already done — silent no-op, don't re-fire confirmation
              return;
            }
            await updateDoc(doc(db, COLLECTION.TASKS, taskId), {
              status: 'completed',
              completedAt: new Date().toISOString().slice(0, 10),
            });
            // BUG-04 FIX: Award XP same as in-app task completion
            await awardXP('TASK_COMPLETE').catch(() => {});
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_task_done write failed:', e);
          }
        }
        if (success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Task Done',
              body: taskTitle ? `"${taskTitle}" closed.` : 'Task marked as complete.',
              data: { taskId },
              channelId: 'default',
            } as any,
            trigger: null,
          }).catch(() => {});
        } else {
          nav('Tasks');
        }
        return;
      }

      // ── ACTION: "Start Workout" button on gym_reminder & location_gym_arrival ─
      if (actionIdentifier === 'start_workout' || actionIdentifier === 'START_WORKOUT') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('MainTabs', { screen: 'Gym' } as any);
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('ActiveLogging', { date: formatLocalDateStr(), initialIndex: 0 } as any);
            }
          }, 300);
        }
        return;
      }

      if (actionIdentifier === 'SAVE_SUMMARY') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('MainTabs', { screen: 'Gym' } as any);
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('WorkoutSummary', { date: formatLocalDateStr() } as any);
            }
          }, 300);
        }
        return;
      }

      // ── ACTION: "Open Task" button on task_reminder & location_task_reminder ─────
      if (actionIdentifier === 'open_tasks' || actionIdentifier === 'OPEN_TASK') {
        nav('Tasks');
        return;
      }

      // ── ACTION: "Snooze 10m" button on task_reminder ─────────────────────────────
      // Reschedules the same task reminder 10 minutes from now without opening the app.
      if (actionIdentifier === 'snooze_10m') {
        const taskId    = parsedTaskId;
        const taskTitle = (data?.taskTitle ?? (notification.request.content.title as string) ?? 'Task') as string;
        const snoozeSeconds = 10 * 60;
        const snoozeDate = new Date(Date.now() + snoozeSeconds * 1000);
        const triggerConfig: any = Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: snoozeDate,
              channelId: 'task_alarm',
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: snoozeDate,
            };
        await Notifications.scheduleNotificationAsync({
          identifier: taskId ? `task_${taskId}_snooze` : undefined,
          content: {
            title: taskTitle,
            body: 'Snoozed 10 minutes. Time to start.',
            data: Platform.OS === 'ios' ? { taskId, taskTitle } : undefined,
            channelId: 'task_alarm',
            ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
            priority: Notifications.AndroidNotificationPriority?.MAX ?? ('max' as any),
            categoryIdentifier: 'task_reminder',
          } as any,
          trigger: triggerConfig,
        }).catch(() => {});
        return;
      }

      // ── ACTION: "≡ƒöÑ Log It" button on habit_reminder ──────────────────────
      // FIX: Removed nav('Habits') so the app stays in the background.
      // Added duplicate-log guard so double-tapping won't write two entries.
      // A confirmation banner fires 1s later with streak info.
      if (actionIdentifier === 'log_habit') {
        const habitId = parsedHabitId;
        let success = false;
        let confirmTitle = 'Habit Logged';
        let confirmBody  = 'Keep the momentum going.';
        if (habitId) {
          try {
            const todayDate = formatLocalDateStr();

            // Duplicate guard: prevent writing two logs if tapped twice or already logged in-app
            const existingSnap = await getDocs(query(
              collection(db, COLLECTION.HABIT_LOGS),
              where('habitId', '==', habitId),
              where('date', '==', todayDate)
            ));
            if (!existingSnap.empty) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Already Logged',
                  body: 'This habit was already recorded today.',
                  data: { habitId },
                  channelId: 'default',
                } as any,
                trigger: null,
              }).catch(() => {});
              return;
            }

            const uid = auth.currentUser?.uid;
            // BUG-01 FIX: Must include userId so CoreDataContext listener (which filters
            // by userId) picks up this document — without it the app still shows unlogged
            await addDoc(collection(db, COLLECTION.HABIT_LOGS), {
              habitId,
              userId: uid ?? null,
              date: todayDate,
              completedAt: new Date().toISOString(),
              timestamp: serverTimestamp(),
            });
            // Award base XP
            await awardXP('HABIT_LOG').catch(() => {});
            // Update streak + build confirmation message
            const habitSnap = await getDoc(doc(db, COLLECTION.HABITS, habitId));
            if (habitSnap.exists()) {
              const habitData     = habitSnap.data();
              const habitName     = (habitData?.name    ?? 'Habit')  as string;
              const currentStreak = (habitData?.streak  ?? 0)        as number;
              const longestStreak = (habitData?.longestStreak ?? 0)  as number;
              const newStreak     = currentStreak + 1;
              // BUG-05/14 FIX: Use atomic increment(1) instead of read-modify-write
              // to prevent race condition when in-app and notification both write simultaneously
              await updateDoc(doc(db, COLLECTION.HABITS, habitId), {
                streak: increment(1),
                longestStreak: Math.max(newStreak, longestStreak),
              });
              // BUG-08 FIX: Award streak milestone XP same as HabitsScreen in-app path
              if (newStreak === 7 || newStreak % 7 === 0) {
                await awardXP('HABIT_STREAK_7').catch(() => {});
              }
              if (newStreak === 30 || newStreak % 30 === 0) {
                await awardXP('HABIT_STREAK_30').catch(() => {});
              }
              confirmTitle = `${habitName} Logged`;
              confirmBody  = newStreak >= 30
                ? `${newStreak}-day streak. Exceptional consistency.`
                : newStreak >= 7
                ? `${newStreak}-day streak. Keep the chain going.`
                : newStreak >= 2
                ? `${newStreak}-day streak. Keep it up.`
                : 'Day 1 recorded. Consistency builds momentum.';
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] log_habit write failed:', e);
          }
        }
        if (success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: confirmTitle,
              body: confirmBody,
              data: { habitId },
              channelId: 'default',
            } as any,
            trigger: null,
          }).catch(() => {});
        } else {
          nav('Habits');
        }
        return;
      }

      // ── ACTION: "View Habits" button on habit_reminder ─────────────────────
      // Intentional "open app" secondary button — nav() stays.
      if (actionIdentifier === 'open_habits') {
        nav('Habits');
        return;
      }

      // ── ACTION: "Present" button on class_reminder ──────────────────────────
      // IDEMPOTENCY: Uses the same deterministic doc ID as useAttendanceFirestore.
      // getDoc first → if already logged as 'attended': no-op.
      //             → if logged as different action: delta-swap counters.
      //             → if not logged: increment counters and create doc.
      // setDoc with merge:true makes this safe to call multiple times.
      if (actionIdentifier === 'mark_present') {
        const subjectId   = parsedSubjectId;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (identifier.startsWith('class_') && identifier.split('_')[2] ? parseInt(identifier.split('_')[2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId && uid) {
          try {
            const logType     = isLab ? 'lab' : 'class' as 'class' | 'lab';
            const attendedKey = isLab ? 'labsAttended' : 'classesAttended';
            const totalKey    = isLab ? 'labsTotal'    : 'classesTotal';
            const logDocId    = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef      = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);

            const existing = await getDoc(logRef);

            if (existing.exists()) {
              const oldAction = existing.data().action as string;
              if (oldAction === 'attended') {
                // Already logged as present — fire soft confirmation and bail
                cancelClassNotificationsImmediately(subjectId, subjectName, logDate, safeSessionIdx).catch(() => {});
                clearScheduleCache();
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Already Recorded',
                    body: `${subjectName} was already marked present.`,
                    data: { subjectId }, channelId: 'default',
                  } as any, trigger: null,
                }).catch(() => {});
                return;
              }
              // Was logged as something else (missed/cancelled) → swap action + fix counters
              const attDelta = 1 - (oldAction === 'attended' ? 1 : 0); // always +1 here
              const totDelta = 0 - (oldAction === 'cancelled' ? 0 : 1) + 1; // net tot delta
              const updates: Record<string, any> = { lastUpdated: Date.now() };
              if (attDelta !== 0) updates[attendedKey] = increment(attDelta);
              if (totDelta !== 0) updates[totalKey]    = increment(totDelta);
              await Promise.all([
                updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), updates),
                setDoc(logRef, { action: 'attended', timestamp: Date.now() }, { merge: true }),
              ]);
            } else {
              // New log → create + increment counters
              const logPayload = {
                userId: uid, subjectId, subjectName,
                type: logType, action: 'attended',
                date: logDate.slice(0, 10),
                isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
              };
              await Promise.all([
                updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
                  [attendedKey]: increment(1),
                  [totalKey]:    increment(1),
                  lastUpdated:   Date.now(),
                }),
                setDoc(logRef, logPayload),
              ]);
              await awardXP('ATTENDANCE_LOG').catch(() => {});
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_present write failed:', e);
          }
        }
        if (success) {
          cancelClassNotificationsImmediately(subjectId!, subjectName, logDate, safeSessionIdx).catch(() => {});
          clearScheduleCache();
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Attendance Logged',
              body: `${subjectName} — marked as present.`,
              data: { subjectId }, channelId: 'default',
            } as any, trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
        }
        return;
      }

      // ── ACTION: "Absent" button on class_reminder ───────────────────────────
      // IDEMPOTENCY: Same deterministic-ID + getDoc + delta pattern as mark_present.
      if (actionIdentifier === 'mark_absent' || actionIdentifier === 'mark_bunking') {
        const subjectId   = parsedSubjectId;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (identifier.startsWith('class_') && identifier.split('_')[2] ? parseInt(identifier.split('_')[2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId && uid) {
          try {
            const logType     = isLab ? 'lab' : 'class' as 'class' | 'lab';
            const attendedKey = isLab ? 'labsAttended' : 'classesAttended';
            const totalKey    = isLab ? 'labsTotal'    : 'classesTotal';
            const logDocId    = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef      = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);

            const existing = await getDoc(logRef);

            if (existing.exists()) {
              const oldAction = existing.data().action as string;
              if (oldAction === 'missed') {
                // Already logged as absent — soft confirmation and bail
                cancelClassNotificationsImmediately(subjectId, subjectName, logDate, safeSessionIdx).catch(() => {});
                clearScheduleCache();
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Already Recorded',
                    body: `${subjectName} was already marked absent.`,
                    data: { subjectId }, channelId: 'default',
                  } as any, trigger: null,
                }).catch(() => {});
                return;
              }
              // Was logged as something else (attended/cancelled) → swap
              const attDelta = (oldAction === 'attended' ? -1 : 0); // removing attended contrib
              const totDelta = (oldAction === 'cancelled' ? 1 : 0); // cancelled had tot=0, missed has tot=1
              const updates: Record<string, any> = { lastUpdated: Date.now() };
              if (attDelta !== 0) updates[attendedKey] = increment(attDelta);
              if (totDelta !== 0) updates[totalKey]    = increment(totDelta);
              await Promise.all([
                updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), updates),
                setDoc(logRef, { action: 'missed', timestamp: Date.now() }, { merge: true }),
              ]);
            } else {
              // New log → create + increment total only (missed = not attended)
              const logPayload = {
                userId: uid, subjectId, subjectName,
                type: logType, action: 'missed',
                date: logDate.slice(0, 10),
                isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
              };
              await Promise.all([
                updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
                  [totalKey]:  increment(1),
                  lastUpdated: Date.now(),
                }),
                setDoc(logRef, logPayload),
              ]);
              await awardXP('ATTENDANCE_LOG').catch(() => {});
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_absent write failed:', e);
          }
        }
        if (success) {
          cancelClassNotificationsImmediately(subjectId!, subjectName, logDate, safeSessionIdx).catch(() => {});
          clearScheduleCache();
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Absence Logged',
              body: `${subjectName} — marked as missed. Attendance updated.`,
              data: { subjectId }, channelId: 'default',
            } as any, trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
        }
        return;
      }

      // ── ACTION: "Cancelled" button on class_reminder ───────────────────────
      // IDEMPOTENCY: Deterministic ID + setDoc (cancelled logs don't affect counters).
      if (actionIdentifier === 'mark_cancelled') {
        const subjectId   = parsedSubjectId;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (identifier.startsWith('class_') && identifier.split('_')[2] ? parseInt(identifier.split('_')[2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId && uid) {
          try {
            const logType  = isLab ? 'lab' : 'class' as 'class' | 'lab';
            const logDocId = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef   = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);
            // setDoc with merge means: if doc already exists, only update action field.
            // If it existed as 'attended', counters don't change here (user should undo first).
            // For a truly new cancel, no counters change — class was cancelled.
            await setDoc(logRef, {
              userId: uid, subjectId, subjectName,
              type: logType, action: 'cancelled',
              date: logDate.slice(0, 10),
              isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
            }, { merge: true });
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_cancelled write failed:', e);
          }
        }
        if (success) {
          cancelClassNotificationsImmediately(subjectId!, subjectName, logDate, safeSessionIdx).catch(() => {});
          clearScheduleCache();
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Class Cancelled',
              body: `${subjectName} — recorded as cancelled. Totals unchanged.`,
              data: { subjectId }, channelId: 'default',
            } as any, trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
        }
        return;
      }

      // ── BODY TAP: Gym Arrival / Departure Geofence ─────────────────────────
      if (
        notifType === 'GYM_ARRIVAL' ||
        notifType === 'location_gym_arrival' ||
        notification.request.content.title?.includes('Arrived at')
      ) {
        if (navigationRef.isReady()) {
          navigationRef.navigate('MainTabs', { screen: 'Gym' } as any);
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('ActiveLogging', { date: formatLocalDateStr(), initialIndex: 0 } as any);
            }
          }, 400);
        }
        return;
      }

      if (
        notifType === 'GYM_DEPARTURE' ||
        notifType === 'location_gym_departure' ||
        notification.request.content.title?.includes('Finished at') ||
        notification.request.content.title?.includes('Workout Saved')
      ) {
        if (navigationRef.isReady()) {
          navigationRef.navigate('MainTabs', { screen: 'Gym' } as any);
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('WorkoutSummary', { date: formatLocalDateStr() } as any);
            }
          }, 400);
        }
        return;
      }

      // ── BODY TAP: "Rest is over" notification ──────────────────────────────
      // Navigates into the GymStack's ActiveLogging screen for today's workout.
      if (
        notifType === 'rest_over' ||
        notification.request.content.title?.includes('Rest is over') ||
        notification.request.content.title?.includes('⏱️')
      ) {
        if (navigationRef.isReady()) {
          // Step 1: focus the Gym tab (mounts GymStack)
          navigationRef.navigate('MainTabs', { screen: 'Gym' } as any);
          // Step 2: navigate inside GymStack after it mounts
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('ActiveLogging', { date: formatLocalDateStr() } as any);
            }
          }, 400);
        }
        return;
      }

      // ── BODY TAP: Task reminder ("taskId" in data, or type = overdue_nudge) ─
      if (data?.taskId || notifType === 'overdue_nudge' || notifType === 'task_reminder' || categoryId === 'task_reminder') {
        nav('Tasks');
        return;
      }

      // ── BODY TAP: Habit streak at risk OR per-habit daily reminder ─────────
      if (notifType === 'habit_streak' || notifType === 'habit_reminder' || categoryId === 'habit_reminder') {
        nav('Habits');
        return;
      }

      // ── BODY TAP: Assignment deadline (48h or 24h) ─────────────────────────
      if (notifType === 'assignment_48h' || notifType === 'assignment_24h') {
        nav('Assignments');
        return;
      }

      // ── BODY TAP: Class / Attendance notification → Attendance screen ──────
      if (
        notifType === 'class' ||
        notifType === 'class_pre' ||
        notifType === 'class_log' ||
        notifType === 'lab_mid' ||
        notifType === 'lab_log' ||
        notifType === 'attendance_warning' ||
        categoryId === 'class_reminder'
      ) {
        nav('Attendance');
        return;
      }

      // ── BODY TAP: Gym reminder (workout day) ───────────────────────────────
      if (notifType === 'gym' || notifType === 'gym_reminder' || categoryId === 'gym_reminder') {
        nav('Gym');
        return;
      }

      // ── BODY TAP: Gym rest day ─────────────────────────────────────────────
      if (notifType === 'gym_rest') {
        nav('Gym');
        return;
      }

      // ── BODY TAP: Hydration reminder ────────────────────────────────────────
      if (notifType === 'water_reminder' || categoryId === 'water_reminder') {
        nav('Home');
        return;
      }

      // ── BODY TAP: Calendar event reminder ──────────────────────────────────
      if (data?.eventId || categoryId === 'calendar_reminder') {
        nav('Calendar');
        return;
      }

      // ── BODY TAP: Morning briefing → Dashboard ─────────────────────────────
      if (notifType === 'morning_brief' || categoryId === 'morning_brief') {
        nav('Home');
        return;
      }

      // ── BODY TAP: Weekly review → WeeklyReview screen ─────────────────────
      if (notifType === 'weekly_review' || categoryId === 'weekly_review') {
        nav('WeeklyReview');
        return;
      }

      // ── BODY TAP: Inactivity nudge → Dashboard ─────────────────────────────
      if (notifType === 'inactivity' || categoryId === 'inactivity_nudge') {
        nav('Home');
        return;
      }
    });

    return () => sub.remove();
  }, []);


  return (
    <ThemeProvider>
      <ThemedAppContainer />
    </ThemeProvider>
  );
}
