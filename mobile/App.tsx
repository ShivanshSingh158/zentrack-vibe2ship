import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, LogBox, AppState, AppStateStatus, InteractionManager, Platform, DeviceEventEmitter } from 'react-native';
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

// Enable React Freeze to suspend inactive tab rendering and eliminate background CPU waste.
// Combined with freezeOnBlur: true and detachInactiveScreens={false} in AppNavigator,
// this freezes background tabs without Android grey-screen detach bugs.
enableFreeze(true);

import { setupNetworkListener } from './src/services/offlineSync';
import { setupLifecycleHygiene } from './src/services/lifecycleHygiene';
import { registerDeferredOtaSync } from './src/services/otaUpdateService';
import { loadBootManifest, getBootManifestSync } from './src/utils/bootManifest';
import { PortalProvider } from './src/contexts/PortalContext';
import { unregisterBackgroundProactiveAgent } from './src/services/backgroundProactiveAgent';
import { registerWeeklyReviewTask } from './src/services/backgroundTasks';
import { registerStepSyncTask } from './src/services/stepCounterService';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { MobileDataProvider } from './src/contexts/MobileDataContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { navigationRef } from './src/navigation/navigationRef';
import { db, auth } from './src/services/firebase';
import { doc, updateDoc, increment, addDoc, setDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { formatLocalDateStr } from './src/utils/dateUtils';
import { COLLECTION } from './src/config/constants';
import { awardXP } from './src/services/xpSystem';
import { repairDuplicateAttendanceLogs } from './src/utils/attendanceRepair';
import { safeWrite } from './src/utils/safeWrite';



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

// Intercept console in development only to completely silence Metro terminal spam for known safe warnings/errors
if (__DEV__) {
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
}



import { StatusBar } from 'expo-status-bar';


import { PomodoroProvider } from './src/contexts/PomodoroContext';
import { ShareIntentProvider } from 'expo-share-intent';
import { ShareToVaultModal } from './src/components/Vault/ShareToVaultModal';

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
              <ShareIntentProvider>
                <ErrorBoundary screenName="RootApp">
                  <AppNavigator />
                </ErrorBoundary>
                <OfflineIndicator />
                <ShareToVaultModal />
              </ShareIntentProvider>
            </PomodoroProvider>
          </MobileDataProvider>
        </PortalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        // PERF FIX (1.1): Move notification permission & channel checks here so Frame 0 has 0 native bridge traffic
        requestNotificationPermissions().catch(console.warn);
        registerBackgroundNotificationFetch();
        unregisterBackgroundProactiveAgent().catch(() => {});
        registerWeeklyReviewTask();
        registerStepSyncTask().catch(() => {});
        // Run attendance duplicate-log repair once per install session.
        // Uses its own AsyncStorage flag — no-op if already done.
        const uid = auth.currentUser?.uid;
        if (uid) {
          repairDuplicateAttendanceLogs(uid).catch(() => {});
        }
      }, 3000);
    });
    return () => {
      handle.cancel();
      if (timer) clearTimeout(timer);
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

  // Record delivery timestamp of water reminders to prevent back-to-back re-scheduling
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const id = notification.request.identifier || '';
      const data = notification.request.content.data as any;
      if (id.startsWith('water_') || data?.type === 'water_reminder') {
        AsyncStorage.setItem('@zentrack_last_water_notif_ts', String(Date.now())).catch(() => {});
      }
    });
    return () => receivedSub.remove();
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

      // Safely extract IDs even when taskId / habitId / subjectId contains underscores
      // Formats created by notifications.ts:
      //   task_${taskId}_${unixSec}  OR  task_${taskId}_snooze  OR  task_${taskId}
      //   habit_${habitId}_${unixSec}
      //   class_${subjectId}_${sessionIdx}_${unixSec}
      const parseEntityIdFromIdentifier = (idStr: string, prefix: string, trailingSegments = 1): string | undefined => {
        if (!idStr.startsWith(prefix)) return undefined;
        const rest = idStr.slice(prefix.length);
        const parts = rest.split('_');
        if (parts.length <= trailingSegments) return rest || undefined;
        const lastPart = parts[parts.length - 1];
        const isTimestampOrSnooze = /^\d{9,}$/.test(lastPart) || lastPart === 'snooze';
        if (!isTimestampOrSnooze) return rest;
        return parts.slice(0, parts.length - trailingSegments).join('_') || undefined;
      };

      const parsedTaskId = (data?.taskId as string | undefined) ||
        parseEntityIdFromIdentifier(identifier, 'task_', 1);
      const parsedHabitId = (data?.habitId as string | undefined) ||
        parseEntityIdFromIdentifier(identifier, 'habit_', 1);
      const parsedSubjectId = (data?.subjectId as string | undefined) ||
        parseEntityIdFromIdentifier(identifier, 'class_', 2) ||
        parseEntityIdFromIdentifier(identifier, 'lab_', 2);

      const notifType = (data?.type as string | undefined) ||
        (identifier.startsWith('water_') ? 'water_reminder' :
         identifier.startsWith('brief_') ? 'morning_brief' :
         identifier.startsWith('task_') ? 'task_alarm' :
         identifier.startsWith('habit_') ? 'habit_reminder' :
         identifier.startsWith('class_') ? 'class_reminder' :
         categoryId);

      const resolveNotificationUid = async (): Promise<string | undefined> => {
        if (auth.currentUser?.uid) return auth.currentUser.uid;
        try {
          const raw = await AsyncStorage.getItem('@zentrack_optimistic_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.uid) return parsed.uid;
          }
        } catch {}
        return auth.currentUser?.uid;
      };

      // Helper: navigate imperatively, safe before and after React tree mounts
      const nav = (screen: string, params?: object) => {
        const executeNav = () => {
          if (!navigationRef.isReady()) return;
          const tabScreens = [
            'Home', 'Tasks', 'Calendar', 'Habits', 'Attendance',
            'Analytics', 'Notes', 'Sara', 'Social', 'Assignments',
            'Grades', 'Learning', 'WeeklyReview', 'StudyRoom',
          ];
          if (tabScreens.includes(screen)) {
            navigationRef.navigate('MainTabs', { screen } as any);
          } else {
            navigationRef.navigate('MoreStack', { screen, params } as any);
          }
        };

        if (navigationRef.isReady()) {
          executeNav();
        } else {
          InteractionManager.runAfterInteractions(() => {
            if (navigationRef.isReady()) {
              executeNav();
            } else {
              setTimeout(executeNav, 300);
            }
          });
        }
      };



      
      // ── ACTION: "Mark Done" button on task_reminder & location_task_reminder ─────────────────
      if (actionIdentifier === 'mark_task_done' || actionIdentifier === 'MARK_DONE') {
        const taskId    = parsedTaskId;
        const taskTitle = (data?.taskTitle as string | undefined) || (notification.request.content.title as string | undefined);
        let success = false;
        if (taskId) {
          try {
            const manifest = getBootManifestSync();
            const cachedTask = manifest?.tasks?.find(t => t.id === taskId);
            if (cachedTask && cachedTask.status === 'completed') {
              // Already done in local memory — silent no-op
              return;
            }
            const todayLocal = formatLocalDateStr();
            const taskRef = doc(db, COLLECTION.TASKS, taskId);
            await safeWrite(
              (payload) => updateDoc(taskRef, payload),
              COLLECTION.TASKS,
              'update',
              { status: 'completed', completedAt: todayLocal },
              taskId,
            );
            // Sync React CoreDataContext in-memory state immediately (0ms)
            DeviceEventEmitter.emit('task_updated_from_notification', {
              taskId,
              partial: { status: 'completed', completedAt: todayLocal },
            });
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
            const manifest = getBootManifestSync();
            const alreadyLogged = manifest?.habitLogs?.some(l => l.habitId === habitId && l.date === todayDate);

            if (alreadyLogged) {
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

            const uid = await resolveNotificationUid();
            const deterministicLogId = `${uid ?? 'anon'}_${habitId}_${todayDate}`;
            const habitLogRef = doc(db, COLLECTION.HABIT_LOGS, deterministicLogId);

            const logPayload = {
              habitId,
              userId: uid ?? null,
              date: todayDate,
              count: 1,
              completedAt: new Date().toISOString(),
              timestamp: Date.now(),
            };
            await safeWrite(
              (payload) => setDoc(habitLogRef, payload, { merge: true }),
              COLLECTION.HABIT_LOGS,
              'set',
              logPayload,
              deterministicLogId,
            );
            await awardXP('HABIT_LOG').catch(() => {});

            const habitRef = doc(db, COLLECTION.HABITS, habitId);
            const cachedHabit = manifest?.habits?.find(h => h.id === habitId);
            const habitName     = (cachedHabit?.name ?? 'Habit') as string;
            const currentStreak = (cachedHabit?.streak ?? 0) as number;
            const longestStreak = (cachedHabit?.longestStreak ?? 0) as number;
            const newStreak     = currentStreak + 1;
            const updatedLongest = Math.max(newStreak, longestStreak);

            await safeWrite(
              () => updateDoc(habitRef, {
                streak: increment(1),
                longestStreak: updatedLongest,
              }),
              COLLECTION.HABITS,
              'update',
              { streak: newStreak, longestStreak: updatedLongest },
              habitId,
            );

            // Sync in-memory React state in 0ms!
            DeviceEventEmitter.emit('habit_logged_from_notification', {
              habitId,
              log: logPayload,
              habitUpdates: { streak: newStreak, longestStreak: updatedLongest },
            });

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
        const idParts     = identifier.split('_');
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (idParts.length >= 4 ? parseInt(idParts[idParts.length - 2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = await resolveNotificationUid();
        let success = false;
        if (subjectId && uid) {
          try {
            const logType     = (isLab ? 'lab' : 'class') as 'class' | 'lab';
            const attendedKey = isLab ? 'labsAttended' : 'classesAttended';
            const totalKey    = isLab ? 'labsTotal'    : 'classesTotal';
            const logDocId    = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef      = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);
            const subjRef     = doc(db, COLLECTION.ATTENDANCE, subjectId);

            const manifest = getBootManifestSync();
            const cachedLog = manifest?.attendanceLogs?.find(l => l.id === logDocId);

            if (cachedLog && cachedLog.action === 'attended') {
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

            const oldAction = cachedLog?.action;
            const logPayload = {
              userId: uid, subjectId, subjectName,
              type: logType, action: 'attended' as const,
              date: logDate.slice(0, 10),
              isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
              id: logDocId,
            };

            if (oldAction) {
              const totDelta = oldAction === 'cancelled' ? 1 : 0;
              const updates: Record<string, any> = {
                [attendedKey]: increment(1),
                lastUpdated: Date.now(),
              };
              const offlineUpdates: Record<string, any> = {
                [attendedKey]: { __zentrackIncrement: 1 },
                lastUpdated: Date.now(),
              };
              if (totDelta !== 0) {
                updates[totalKey] = increment(totDelta);
                offlineUpdates[totalKey] = { __zentrackIncrement: totDelta };
              }
              await Promise.all([
                safeWrite(() => updateDoc(subjRef, updates), COLLECTION.ATTENDANCE, 'update', offlineUpdates, subjectId),
                safeWrite((p) => setDoc(logRef, p, { merge: true }), COLLECTION.ATTENDANCE_LOGS, 'set', { action: 'attended', timestamp: Date.now() }, logDocId),
              ]);
              DeviceEventEmitter.emit('attendance_logged_from_widget', { log: logPayload, subjectId, subjectUpdates: offlineUpdates });
            } else {
              const updates = { [attendedKey]: increment(1), [totalKey]: increment(1), lastUpdated: Date.now() };
              const offlineUpdates = { [attendedKey]: { __zentrackIncrement: 1 }, [totalKey]: { __zentrackIncrement: 1 }, lastUpdated: Date.now() };
              await Promise.all([
                safeWrite(
                  () => updateDoc(subjRef, { [attendedKey]: increment(1), [totalKey]: increment(1), lastUpdated: Date.now() }),
                  COLLECTION.ATTENDANCE,
                  'update',
                  offlineUpdates,
                  subjectId,
                ),
                safeWrite((p) => setDoc(logRef, p), COLLECTION.ATTENDANCE_LOGS, 'set', logPayload, logDocId),
              ]);
              await awardXP('ATTENDANCE_LOG').catch(() => {});
              DeviceEventEmitter.emit('attendance_logged_from_widget', { log: logPayload, subjectId, subjectUpdates: offlineUpdates });
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

      if (actionIdentifier === 'mark_absent' || actionIdentifier === 'mark_bunking') {
        const subjectId   = parsedSubjectId;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const idParts     = identifier.split('_');
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (idParts.length >= 4 ? parseInt(idParts[idParts.length - 2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = await resolveNotificationUid();
        let success = false;
        if (subjectId && uid) {
          try {
            const logType     = (isLab ? 'lab' : 'class') as 'class' | 'lab';
            const attendedKey = isLab ? 'labsAttended' : 'classesAttended';
            const totalKey    = isLab ? 'labsTotal'    : 'classesTotal';
            const logDocId    = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef      = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);
            const subjRef     = doc(db, COLLECTION.ATTENDANCE, subjectId);

            const manifest = getBootManifestSync();
            const cachedLog = manifest?.attendanceLogs?.find(l => l.id === logDocId);

            if (cachedLog && cachedLog.action === 'missed') {
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

            const oldAction = cachedLog?.action;
            const logPayload = {
              userId: uid, subjectId, subjectName,
              type: logType, action: 'missed' as const,
              date: logDate.slice(0, 10),
              isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
              id: logDocId,
            };

            if (oldAction) {
              const attDelta = oldAction === 'attended' ? -1 : 0;
              const totDelta = oldAction === 'cancelled' ? 1 : 0;
              const updates: Record<string, any> = { lastUpdated: Date.now() };
              const offlineUpdates: Record<string, any> = { lastUpdated: Date.now() };
              if (attDelta !== 0) {
                updates[attendedKey] = increment(attDelta);
                offlineUpdates[attendedKey] = { __zentrackIncrement: attDelta };
              }
              if (totDelta !== 0) {
                updates[totalKey]    = increment(totDelta);
                offlineUpdates[totalKey] = { __zentrackIncrement: totDelta };
              }
              await Promise.all([
                safeWrite(() => updateDoc(subjRef, updates), COLLECTION.ATTENDANCE, 'update', offlineUpdates, subjectId),
                safeWrite((p) => setDoc(logRef, p, { merge: true }), COLLECTION.ATTENDANCE_LOGS, 'set', { action: 'missed', timestamp: Date.now() }, logDocId),
              ]);
              DeviceEventEmitter.emit('attendance_logged_from_widget', { log: logPayload, subjectId, subjectUpdates: offlineUpdates });
            } else {
              const updates = { [totalKey]: increment(1), lastUpdated: Date.now() };
              const offlineUpdates = { [totalKey]: { __zentrackIncrement: 1 }, lastUpdated: Date.now() };
              await Promise.all([
                safeWrite(
                  () => updateDoc(subjRef, updates),
                  COLLECTION.ATTENDANCE,
                  'update',
                  offlineUpdates,
                  subjectId,
                ),
                safeWrite((p) => setDoc(logRef, p), COLLECTION.ATTENDANCE_LOGS, 'set', logPayload, logDocId),
              ]);
              await awardXP('ATTENDANCE_LOG').catch(() => {});
              DeviceEventEmitter.emit('attendance_logged_from_widget', { log: logPayload, subjectId, subjectUpdates: offlineUpdates });
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

      // ── ACTION: "Cancelled" button on class_reminder (With Counter Rollback) ─
      if (actionIdentifier === 'mark_cancelled') {
        const subjectId   = parsedSubjectId;
        const subjectName = (data?.subject || 'Class') as string;
        const isLab       = !!data?.isLab;
        const logDate     = (data?.date || formatLocalDateStr()) as string;
        const idParts     = identifier.split('_');
        const rawIdx      = typeof data?.sessionIdx === 'number'
          ? data.sessionIdx
          : (idParts.length >= 4 ? parseInt(idParts[idParts.length - 2], 10) : 0);
        const safeSessionIdx = isNaN(rawIdx) ? 0 : rawIdx;
        const uid         = await resolveNotificationUid();
        let success = false;
        if (subjectId && uid) {
          try {
            const logType     = (isLab ? 'lab' : 'class') as 'class' | 'lab';
            const attendedKey = isLab ? 'labsAttended' : 'classesAttended';
            const totalKey    = isLab ? 'labsTotal'    : 'classesTotal';
            const logDocId    = buildAttLogId(uid, subjectId, logDate, logType, safeSessionIdx);
            const logRef      = doc(db, COLLECTION.ATTENDANCE_LOGS, logDocId);
            const subjRef     = doc(db, COLLECTION.ATTENDANCE, subjectId);

            const existing = await getDoc(logRef).catch(() => null);
            if (existing && existing.exists()) {
              const oldAction = existing.data().action as string;
              if (oldAction === 'cancelled') {
                cancelClassNotificationsImmediately(subjectId, subjectName, logDate, safeSessionIdx).catch(() => {});
                clearScheduleCache();
                return;
              }
              const attDelta = oldAction === 'attended' ? -1 : 0;
              const totDelta = (oldAction === 'attended' || oldAction === 'missed') ? -1 : 0;
              const updates: Record<string, any> = { lastUpdated: Date.now() };
              const offlineUpdates: Record<string, any> = { lastUpdated: Date.now() };
              if (attDelta !== 0) {
                updates[attendedKey] = increment(attDelta);
                offlineUpdates[attendedKey] = { __zentrackIncrement: attDelta };
              }
              if (totDelta !== 0) {
                updates[totalKey]    = increment(totDelta);
                offlineUpdates[totalKey] = { __zentrackIncrement: totDelta };
              }
              await Promise.all([
                safeWrite(() => updateDoc(subjRef, updates), COLLECTION.ATTENDANCE, 'update', offlineUpdates, subjectId),
                safeWrite((p) => setDoc(logRef, p, { merge: true }), COLLECTION.ATTENDANCE_LOGS, 'set', { action: 'cancelled', timestamp: Date.now() }, logDocId),
              ]);
            } else {
              const logPayload = {
                userId: uid, subjectId, subjectName,
                type: logType, action: 'cancelled',
                date: logDate.slice(0, 10),
                isExtra: false, timestamp: Date.now(), idx: safeSessionIdx,
              };
              await safeWrite((p) => setDoc(logRef, p, { merge: true }), COLLECTION.ATTENDANCE_LOGS, 'set', logPayload, logDocId);
            }
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
              body: `${subjectName} — recorded as cancelled. Totals adjusted.`,
              data: { subjectId }, channelId: 'default',
            } as any, trigger: null,
          }).catch(() => {});
        } else {
          nav('Attendance');
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
