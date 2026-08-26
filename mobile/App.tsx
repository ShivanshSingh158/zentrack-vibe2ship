import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator, LogBox, AppState, AppStateStatus, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { OfflineIndicator } from './src/components/OfflineIndicator';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions, registerBackgroundNotificationFetch } from './src/services/notifications';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens, enableFreeze } from 'react-native-screens';

// Fix for React Native New Architecture (Fabric) grey screen bug.
// A system notification/overlay triggers an onPause, and React Freeze catastrophically fails
// to render the frame during this state transition, causing the grey screen. 
// We MUST keep this false permanently and accept the CPU tradeoff.
enableFreeze(false);

import { setupNetworkListener } from './src/services/offlineSync';
import { PortalProvider } from './src/contexts/PortalContext';
import { registerBackgroundProactiveAgent } from './src/services/backgroundProactiveAgent';
import { registerWeeklyReviewTask } from './src/services/backgroundTasks';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { MobileDataProvider } from './src/contexts/MobileDataContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { navigationRef } from './src/navigation/AppNavigator';
import { db, auth } from './src/services/firebase';
import { doc, updateDoc, increment, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { todayStr } from './src/hooks/useGymLog';
import { COLLECTION } from './src/config/constants';
import { awardXP } from './src/services/xpSystem';

// Keep the native splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

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

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG BOOT TIMING — REMOVE AFTER DIAGNOSIS
// ═══════════════════════════════════════════════════════════════════════════════
const _BOOT_T0 = (global as any).__BOOT_T0 || Date.now();
console.log(`[BOOT-DIAG] App.tsx module evaluated at dt=${Date.now() - _BOOT_T0}ms`);
// ═══════════════════════════════════════════════════════════════════════════════

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
            <ErrorBoundary screenName="RootApp">
              <AppNavigator />
            </ErrorBoundary>
            <OfflineIndicator />
          </MobileDataProvider>
        </PortalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  // DEBUG — REMOVE AFTER DIAGNOSIS
  console.log(`[BOOT-DIAG] App() render at dt=${Date.now() - _BOOT_T0}ms`);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
  });

  // DEBUG — REMOVE AFTER DIAGNOSIS
  if (fontsLoaded) console.log(`[BOOT-DIAG] Fonts loaded at dt=${Date.now() - _BOOT_T0}ms`);

  // PERF: All 4 service registrations deferred behind InteractionManager + 3.5s timeout.
  // These have zero effect on Frame 0/1 — they only set up background OS tasks.
  // Deferring frees ~150–250ms of native bridge blocking right when the app opens.
  React.useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(() => {
        requestNotificationPermissions();
        registerBackgroundNotificationFetch();
        registerBackgroundProactiveAgent();
        registerWeeklyReviewTask();
      }, 3500);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, []);


  // Drain ALL queued offline writes (tasks, habits, notes, goals, gym logs)
  // as soon as connectivity is restored, and also on boot if already online.
  React.useEffect(() => {
    const unsubscribe = setupNetworkListener();
    return () => unsubscribe();
  }, []);

  // ─── Notification Response Handler ─────────────────────────────────────────
  // Central listener for ALL actionable notification taps.
  // Handles all 13 notification types → correct module navigation + Firestore writes.
  // Uses navigationRef for imperative navigation that works even on cold-start.
  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { notification, actionIdentifier } = response;
      const data = notification.request.content.data as any;
      const notifType = data?.type as string | undefined;

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
        const snoozeTime = new Date(Date.now() + 15 * 60 * 1000);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Gym day ≡ƒÅï∩╕Å',
            body: 'Snoozed 15 min. Time to go now!',
            data: { type: 'gym' },
            categoryIdentifier: 'gym_reminder',
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: snoozeTime.getTime(),
            channelId: 'default',
          } as any,
        });
        return;
      }

      // ── ACTION: "Mark Done" button on task_reminder ────────────────────────
      // FIX: Removed nav('Tasks') so the app stays in the background.
      // A silent confirmation banner fires 1s later as feedback.
      if (actionIdentifier === 'mark_task_done') {
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
              title: '✓ Task done!',
              body: taskTitle ? `"${taskTitle}" marked complete.` : 'Task marked as complete.',
              data: {},
              sound: undefined,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
          }).catch(() => {});
        } else {
          // Write failed — open the app so user can act manually
          nav('Tasks');
        }
        return;
      }

      // ── ACTION: "Open Tasks" button on task_reminder ───────────────────────
      // This is an intentional "open app" secondary button — nav() stays.
      if (actionIdentifier === 'open_tasks') {
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
        let confirmTitle = '≡ƒöÑ Habit logged!';
        let confirmBody  = 'Keep the momentum going.';
        if (habitId) {
          try {
            const todayDate = todayStr();

            // ── DUPLICATE GUARD ────────────────────────────────────────────────
            // Prevent writing two logs if the user taps "Log It" twice or if
            // they already logged via the app earlier today.
            // Uses statically-imported getDocs/query/where (dynamic imports crash Metro).
            const existingSnap = await getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('habitId', '==', habitId), where('date', '==', todayDate)));
            if (!existingSnap.empty) {
              // Already logged today — show friendly info instead of duplicate write
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '✓ Already logged!',
                  body: 'You already completed this habit today. Great work!',
                  data: {},
                  sound: undefined,
                },
                trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
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
              const habitEmoji   = (habitData?.emoji   ?? '🔥')      as string;
              const currentStreak = (habitData?.streak ?? 0)         as number;
              const newStreak     = currentStreak + 1;
              const longestStreak = (habitData?.longestStreak ?? 0)  as number;
              await updateDoc(doc(db, COLLECTION.HABITS, habitId), {
                streak: newStreak,
                longestStreak: Math.max(newStreak, longestStreak),
              });
              confirmTitle = `${habitEmoji} ${habitName} — logged!`;
              confirmBody  = newStreak >= 2
                ? `≡ƒöÑ ${newStreak}-day streak! Keep it up.`
                : 'Day 1 — the streak begins. See you tomorrow.';
            }
            success = true;
          } catch (e) {
            console.warn('[Notification] log_habit write failed:', e);
          }
        }
        if (success) {
          // Silent confirmation — app stays closed
          await Notifications.scheduleNotificationAsync({
            content: { title: confirmTitle, body: confirmBody, data: {}, sound: undefined },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
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
        const logDate     = (data?.date || todayStr()) as string;
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
              title: '✓ Present — logged!',
              body: `${subjectName} marked as present.`,
              data: {},
              sound: undefined,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
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
        const logDate     = (data?.date || todayStr()) as string;
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
              title: '❌ Absent — logged',
              body: `${subjectName} marked as missed.`,
              data: {},
              sound: undefined,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
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
        const logDate     = (data?.date || todayStr()) as string;
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
              title: '🚫 Class Cancelled — recorded',
              body: `${subjectName} recorded as cancelled today.`,
              data: {},
              sound: undefined,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 1000 } as any,
          }).catch(() => {});
        } else {
          nav('Attendance');
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
              navigationRef.navigate('ActiveLogging', { date: todayStr() } as any);
            }
          }, 400);
        }
        return;
      }

      // ── BODY TAP: Task reminder ("taskId" in data, or type = overdue_nudge) ─
      if (data?.taskId || notifType === 'overdue_nudge') {
        nav('Tasks');
        return;
      }

      // ── BODY TAP: Habit streak at risk OR per-habit daily reminder ─────────
      if (notifType === 'habit_streak' || notifType === 'habit_reminder') {
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
        notifType === 'attendance_warning'
      ) {
        nav('Attendance');
        return;
      }

      // ── BODY TAP: Gym reminder (workout day) ───────────────────────────────
      if (notifType === 'gym') {
        nav('Gym');
        return;
      }

      // ── BODY TAP: Gym rest day ─────────────────────────────────────────────
      if (notifType === 'gym_rest') {
        nav('Gym');
        return;
      }

      // ── BODY TAP: Calendar event reminder ──────────────────────────────────
      if (data?.eventId) {
        nav('Calendar');
        return;
      }

      // ── BODY TAP: Morning briefing → Dashboard ─────────────────────────────
      if (notifType === 'morning_brief') {
        nav('Home');
        return;
      }

      // ── BODY TAP: Weekly review → WeeklyReview screen ─────────────────────
      if (notifType === 'weekly_review') {
        nav('WeeklyReview');
        return;
      }

      // ── BODY TAP: Inactivity nudge → Dashboard ─────────────────────────────
      if (notifType === 'inactivity') {
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
