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
import { requestNotificationPermissions, registerBackgroundNotificationFetch } from './src/services/notifications';
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
import { doc, updateDoc, increment, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { formatLocalDateStr } from './src/utils/dateUtils';
import { COLLECTION } from './src/config/constants';
import { awardXP } from './src/services/xpSystem';


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

import { initGeofencingOnBoot, checkImmediateGymProximity } from './src/services/geofenceService';

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
      }, 3000);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, []);

  // Proactive Instant Geofence Check on Foreground Resume:
  // When the user toggles Location (GPS) in Quick Settings and re-opens ZenTrack
  // while already standing inside the gym, evaluate proximity immediately!
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkImmediateGymProximity().catch(() => {});
      }
    });
    return () => sub.remove();
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
      const notifType = (data?.type as string | undefined) || categoryId;

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
        const triggerConfig: any = Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval',
              seconds: snoozeSeconds,
              repeats: false,
              channelId: 'default',
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: new Date(Date.now() + snoozeSeconds * 1000),
            };

        await Notifications.scheduleNotificationAsync({
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

      // ── ACTION: "Mark Done" button on task_reminder ────────────────────────
      // ── ACTION: "✓ Mark Done" button on task_reminder & location_task_reminder ─
      if (actionIdentifier === 'mark_task_done' || actionIdentifier === 'MARK_DONE') {
        const taskId   = data?.taskId    as string | undefined;
        const taskTitle = data?.taskTitle as string | undefined;
        let success = false;
        if (taskId) {
          try {
            await updateDoc(doc(db, COLLECTION.TASKS, taskId), {
              status: 'completed',
              completedAt: new Date().toISOString().slice(0, 10),
            });
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_task_done write failed:', e);
          }
        }
        if (success) {
          // Silent confirmation — app stays closed
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Task Completed',
              body: taskTitle ? `"${taskTitle}" marked as complete.` : 'Task marked as complete.',
              data: Platform.OS === 'ios' ? { taskId } : undefined,
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

      // ── ACTION: "Open Tasks" button on task_reminder & location_task_reminder ─
      if (actionIdentifier === 'open_tasks' || actionIdentifier === 'OPEN_TASK') {
        nav('Tasks');
        return;
      }

      // ── ACTION: "≡ƒöÑ Log It" button on habit_reminder ──────────────────────
      // FIX: Removed nav('Habits') so the app stays in the background.
      // Added duplicate-log guard so double-tapping won't write two entries.
      // A confirmation banner fires 1s later with streak info.
      if (actionIdentifier === 'log_habit') {
        const habitId = data?.habitId as string | undefined;
        let success = false;
        let confirmTitle = 'Habit Logged';
        let confirmBody  = 'Keep the momentum going.';
        if (habitId) {
          try {
            const todayDate = formatLocalDateStr();

            // ── DUPLICATE GUARD ────────────────────────────────────────────────
            // Prevent writing two logs if the user taps "Log It" twice or if
            // they already logged via the app earlier today.
            // Uses statically-imported getDocs/query/where (dynamic imports crash Metro).
            const existingSnap = await getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('habitId', '==', habitId), where('date', '==', todayDate)));
            if (!existingSnap.empty) {
              // Already logged today — show friendly info instead of duplicate write
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Already Recorded',
                  body: 'You already completed this habit today.',
                  data: Platform.OS === 'ios' ? { habitId } : undefined,
                  channelId: 'default',
                } as any,
                trigger: null,
              }).catch(() => {});
              return;
            }

            // 1. Write habit log entry
            await addDoc(collection(db, COLLECTION.HABIT_LOGS), {
              habitId,
              date: todayDate,
              completedAt: new Date().toISOString(),
              timestamp: serverTimestamp(),
            });
            // 2. Award XP
            await awardXP('HABIT_LOG').catch(() => {});
            // 3. Update streak on the habit document + build confirmation message
            const habitSnap = await getDoc(doc(db, COLLECTION.HABITS, habitId));
            if (habitSnap.exists()) {
              const habitData    = habitSnap.data();
              const habitName    = (habitData?.name    ?? 'Habit')   as string;
              const currentStreak = (habitData?.streak ?? 0)         as number;
              const newStreak     = currentStreak + 1;
              const longestStreak = (habitData?.longestStreak ?? 0)  as number;
              await updateDoc(doc(db, COLLECTION.HABITS, habitId), {
                streak: newStreak,
                longestStreak: Math.max(newStreak, longestStreak),
              });
              confirmTitle = `${habitName} Logged`;
              confirmBody  = newStreak >= 2
                ? `${newStreak}-day streak. Keep it up.`
                : 'Day 1 recorded. Consistency builds momentum.';
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] log_habit write failed:', e);
          }
        }
        if (success) {
          // Silent confirmation — app stays closed
          await Notifications.scheduleNotificationAsync({
            content: {
              title: confirmTitle,
              body: confirmBody,
              data: Platform.OS === 'ios' ? { habitId } : undefined,
              channelId: 'default',
            } as any,
            trigger: null,
          }).catch(() => {});
        } else {
          // Write failed — open app as fallback
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

      // ── ACTION: "Present" button on class_reminder ─────────────────────────
      // App stays in background (opensAppToForeground: false).
      // Writes both attendance_subjects and attendance_logs with lab/class distinction.
      if (actionIdentifier === 'mark_present') {
        const subjectId   = data?.subjectId  as string | undefined;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId) {
          try {
            const attendedField = isLab ? 'labsAttended' : 'classesAttended';
            const totalField    = isLab ? 'labsTotal'    : 'classesTotal';
            await updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
              [attendedField]: increment(1),
              [totalField]: increment(1),
            });
            if (uid) {
              await addDoc(collection(db, COLLECTION.ATTENDANCE_LOGS), {
                userId: uid,
                subjectId,
                subjectName,
                type: isLab ? 'lab' : 'class',
                action: 'attended',
                date: logDate,
                isExtra: false,
                timestamp: Date.now(),
              });
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_present write failed:', e);
          }
        }
        if (success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Present Recorded',
              body: `${subjectName} marked as attended.`,
              data: Platform.OS === 'ios' ? { subjectId } : undefined,
              channelId: 'default',
            } as any,
            trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
        }
        return;
      }

      // ── ACTION: "Absent" / "Bunking" button on class_reminder ──────────────
      // App stays in background (opensAppToForeground: false).
      // Writes both attendance_subjects and attendance_logs with missed status.
      if (actionIdentifier === 'mark_absent' || actionIdentifier === 'mark_bunking') {
        const subjectId   = data?.subjectId  as string | undefined;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId) {
          try {
            const totalField = isLab ? 'labsTotal' : 'classesTotal';
            await updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
              [totalField]: increment(1),
            });
            if (uid) {
              await addDoc(collection(db, COLLECTION.ATTENDANCE_LOGS), {
                userId: uid,
                subjectId,
                subjectName,
                type: isLab ? 'lab' : 'class',
                action: 'missed',
                date: logDate,
                isExtra: false,
                timestamp: Date.now(),
              });
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_absent write failed:', e);
          }
        }
        if (success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Absence Recorded',
              body: `${subjectName} marked as missed.`,
              data: Platform.OS === 'ios' ? { subjectId } : undefined,
              channelId: 'default',
            } as any,
            trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
        }
        return;
      }

      // ── ACTION: "Cancelled" button on class_reminder ───────────────────────
      // App stays in background (opensAppToForeground: false).
      // Writes attendance_logs with cancelled status (totals remain unchanged).
      if (actionIdentifier === 'mark_cancelled') {
        const subjectId   = data?.subjectId  as string | undefined;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const uid         = auth.currentUser?.uid;
        let success = false;
        if (subjectId) {
          try {
            if (uid) {
              await addDoc(collection(db, COLLECTION.ATTENDANCE_LOGS), {
                userId: uid,
                subjectId,
                subjectName,
                type: isLab ? 'lab' : 'class',
                action: 'cancelled',
                date: logDate,
                isExtra: false,
                timestamp: Date.now(),
              });
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] mark_cancelled write failed:', e);
          }
        }
        if (success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Class Cancelled',
              body: `${subjectName} recorded as cancelled today.`,
              data: Platform.OS === 'ios' ? { subjectId } : undefined,
              channelId: 'default',
            } as any,
            trigger: null,
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
