/**
 * geofenceService.ts — ZenTrack Mobile
 *
 * Autonomous background geofencing engine for ZenTrack.
 *
 * Responsibilities:
 * 1. Defines headless background task `ZENTRACK_GEOFENCE_TASK` via expo-task-manager.
 * 2. On Gym Arrival (Enter): Automatically initiates workout timer, pre-warms day log,
 *    awards attendance XP, and fires actionable notification.
 * 3. On Gym Departure (Exit): Automatically finalizes workout duration, computes start/end times,
 *    marks session completed in Firestore & offline cache, awards completion XP, and notifies user.
 * 4. Monitors Task location reminders (Enter/Exit triggers).
 * 5. Syncs active geofences with native OS Geofencing hardware.
 */

import { Platform, DeviceEventEmitter } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db, auth } from './firebase';
import { COLLECTION } from '../config/constants';
import { safeWrite } from '../utils/safeWrite';
import { awardXP } from './xpSystem';
import { getGymGeofenceConfig } from './savedPlacesService';

export const GEOFENCE_TASK_NAME = 'ZENTRACK_GEOFENCE_TASK';
export const TASK_REMINDERS_STORAGE_KEY = '@zentrack_task_location_reminders';

function getTodayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── 1. Background Task Definition (Registered at JS Boot) ────────────────────
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.warn('[Geofence] Background task error:', error.message);
    return;
  }

  if (!data) return;
  const { eventType, region } = data;
  const identifier: string = region?.identifier || '';

  const isEnter = eventType === Location.GeofencingEventType.Enter;
  const isExit = eventType === Location.GeofencingEventType.Exit;

  // ── CASE A: GYM GEOFENCE TRIGGER (AUTO-START / AUTO-FINISH WORKOUT) ────────
  if (identifier.startsWith('gym_')) {
    try {
      const gymConfig = await getGymGeofenceConfig();
      if (!gymConfig || !gymConfig.enabled) return;

      const placeName = gymConfig.placeName || 'the Gym';
      const today = getTodayLocalDateStr();
      const nowMs = Date.now();

      // ── SUB-CASE A1: ARRIVAL (AUTO-START WORKOUT) ──────────────────────────
      if (isEnter && gymConfig.promptOnEnter) {
        const sessionKey = `@zentrack_active_workout_${today}`;
        const existingRaw = await AsyncStorage.getItem(sessionKey);
        let startTime = nowMs;

        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            if (existing?.startTime && !existing?.completed) {
              startTime = existing.startTime;
            }
          } catch {}
        }

        const sessionState = {
          date: today,
          startTime,
          autoStartedByGeofence: true,
          completed: false,
          updatedAt: nowMs,
        };

        await AsyncStorage.setItem(sessionKey, JSON.stringify(sessionState));
        await AsyncStorage.setItem('@zentrack_active_workout_state', JSON.stringify(sessionState));

        // Sync to Firestore if authenticated
        try {
          const user = auth.currentUser;
          if (user) {
            const docId = `${user.uid}_${today}`;
            const docRef = doc(db, COLLECTION.GYM_LOGS, docId);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
              const existingData = snap.data();
              if (!existingData.completed && !existingData.workoutStartTime) {
                await safeWrite(
                  () => setDoc(docRef, { workoutStartTime: startTime, completed: false, updatedAt: serverTimestamp() }, { merge: true }),
                  COLLECTION.GYM_LOGS,
                  'set',
                  { workoutStartTime: startTime, completed: false },
                  docId
                );
              }
            } else {
              const initialLog = {
                id: docId,
                userId: user.uid,
                date: today,
                workoutStartTime: startTime,
                completed: false,
                exercises: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              await safeWrite(
                () => setDoc(docRef, initialLog, { merge: true }),
                COLLECTION.GYM_LOGS,
                'set',
                initialLog,
                docId
              );
            }
          }
        } catch (e) {
          console.warn('[Geofence] Firestore gym arrival sync error:', e);
        }

        // Award attendance XP & notify UI listeners
        awardXP('GYM_SET').catch(() => {});
        DeviceEventEmitter.emit('gym_workout_auto_started', { date: today, startTime });

        // Schedule High-Priority Arrival Notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🏋️ Arrived at ${placeName} — Workout Started!`,
            body: `Workout timer is running. Tap to log your sets & exercises.`,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 200, 500, 200, 500],
            color: '#a599ff',
            data: { type: 'GYM_ARRIVAL', screen: 'ActiveLogging', date: today },
            categoryIdentifier: 'location_gym_arrival',
            ...(Platform.OS === 'android' ? { channelId: 'location_reminders' } : {}),
          },
          trigger: null,
        });
      }

      // ── SUB-CASE A2: DEPARTURE (AUTO-FINISH WORKOUT) ────────────────────────
      else if (isExit && gymConfig.promptOnExit) {
        const sessionKey = `@zentrack_active_workout_${today}`;
        const sessionRaw = await AsyncStorage.getItem(sessionKey);
        let startTime = nowMs - (45 * 60 * 1000); // 45m fallback if no start registered

        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            if (session?.startTime) startTime = session.startTime;
          } catch {}
        }

        const elapsedMins = Math.max(1, Math.round((nowMs - startTime) / 60000));
        const startD = new Date(startTime);
        const endD = new Date(nowMs);
        const startTimeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
        const endTimeStr = `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;

        const finalizedState = {
          date: today,
          startTime: startTimeStr,
          endTime: endTimeStr,
          workoutDurationMinutes: elapsedMins,
          completed: true,
          autoFinishedByGeofence: true,
          updatedAt: nowMs,
        };

        await AsyncStorage.setItem(sessionKey, JSON.stringify(finalizedState));
        await AsyncStorage.removeItem('@zentrack_active_workout_state');

        // Finalize Firestore log
        try {
          const user = auth.currentUser;
          if (user) {
            const docId = `${user.uid}_${today}`;
            const docRef = doc(db, COLLECTION.GYM_LOGS, docId);
            const payload: any = {
              completed: true,
              workoutStartTime: deleteField(),
              workoutDurationMinutes: elapsedMins,
              startTime: startTimeStr,
              endTime: endTimeStr,
              updatedAt: serverTimestamp(),
            };
            await safeWrite(
              () => setDoc(docRef, payload, { merge: true }),
              COLLECTION.GYM_LOGS,
              'set',
              payload,
              docId
            );
          }
        } catch (e) {
          console.warn('[Geofence] Firestore gym departure sync error:', e);
        }

        // Award session XP & notify UI listeners
        awardXP('GYM_SESSION').catch(() => {});
        DeviceEventEmitter.emit('gym_workout_auto_finished', { date: today, duration: elapsedMins });

        // Schedule High-Priority Departure Notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🏁 Left ${placeName} — Workout Saved! (${elapsedMins}m)`,
            body: `Great session! Workout auto-finished. Tap to view your summary.`,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 200, 500, 200, 500],
            color: '#a599ff',
            data: { type: 'GYM_DEPARTURE', screen: 'WorkoutSummary', date: today, duration: elapsedMins },
            categoryIdentifier: 'location_gym_departure',
            ...(Platform.OS === 'android' ? { channelId: 'location_reminders' } : {}),
          },
          trigger: null,
        });
      }
    } catch (err) {
      console.warn('[Geofence] Gym handler error:', err);
    }
    return;
  }

  // ── CASE B: TASK LOCATION REMINDER TRIGGER ────────────────────────────────
  if (identifier.startsWith('task_')) {
    try {
      const raw = await AsyncStorage.getItem(TASK_REMINDERS_STORAGE_KEY);
      if (!raw) return;
      const reminders: any[] = JSON.parse(raw);

      const target = reminders.find(r => r.id === identifier || `task_${r.taskId}` === identifier);
      if (!target) return;

      const shouldTrigger =
        (isEnter && target.triggerType === 'enter') ||
        (isExit && target.triggerType === 'exit');

      if (shouldTrigger) {
        const actionVerb = isEnter ? 'Arrived at' : 'Left';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `📍 ${actionVerb} ${target.placeName || 'Location'}`,
            body: target.taskTitle,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 200, 500, 200, 500],
            color: '#a599ff',
            data: { type: 'TASK_LOCATION_REMINDER', taskId: target.taskId, screen: 'Tasks' },
            categoryIdentifier: 'location_task_reminder',
            ...(Platform.OS === 'android' ? { channelId: 'location_reminders' } : {}),
          },
          trigger: null,
        });
      }
    } catch (err) {
      console.warn('[Geofence] Task reminder error:', err);
    }
  }
});

// ─── 2. Permissions Helper ───────────────────────────────────────────────────
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    return bg === 'granted';
  } catch (err) {
    console.warn('[Geofence] Permission request failed:', err);
    return false;
  }
}

// ─── 3. Task Reminders Cache Operations ──────────────────────────────────────
export async function getActiveTaskLocationReminders(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(TASK_REMINDERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveTaskLocationReminder(reminder: {
  taskId: string;
  taskTitle: string;
  placeName: string;
  latitude: number;
  longitude: number;
  radius: number;
  triggerType: 'enter' | 'exit';
}): Promise<void> {
  const current = await getActiveTaskLocationReminders();
  const id = `task_${reminder.taskId}`;
  const updated = current.filter(r => r.id !== id && r.taskId !== reminder.taskId);
  updated.push({ ...reminder, id });

  await AsyncStorage.setItem(TASK_REMINDERS_STORAGE_KEY, JSON.stringify(updated));
  await syncAllActiveGeofences();
}

export async function removeTaskLocationReminder(taskId: string): Promise<void> {
  const current = await getActiveTaskLocationReminders();
  const id = `task_${taskId}`;
  const updated = current.filter(r => r.id !== id && r.taskId !== taskId);

  await AsyncStorage.setItem(TASK_REMINDERS_STORAGE_KEY, JSON.stringify(updated));
  await syncAllActiveGeofences();
}

// ─── 4. Master Geofence Sync with OS Hardware ────────────────────────────────
export async function syncAllActiveGeofences(): Promise<void> {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      console.log('[Geofence] Background location permission not granted, skipping geofence sync');
      return;
    }

    const regions: Location.LocationRegion[] = [];

    // 1. Add Gym Geofence
    const gymConfig = await getGymGeofenceConfig();
    if (gymConfig && gymConfig.enabled && gymConfig.latitude && gymConfig.longitude) {
      regions.push({
        identifier: 'gym_main',
        latitude: gymConfig.latitude,
        longitude: gymConfig.longitude,
        radius: gymConfig.radius || 150,
        notifyOnEnter: gymConfig.promptOnEnter ?? true,
        notifyOnExit: gymConfig.promptOnExit ?? true,
      });
    }

    // 2. Add Task Location Reminders
    const taskReminders = await getActiveTaskLocationReminders();
    taskReminders.forEach(r => {
      if (r.latitude && r.longitude) {
        regions.push({
          identifier: r.id || `task_${r.taskId}`,
          latitude: r.latitude,
          longitude: r.longitude,
          radius: r.radius || 150,
          notifyOnEnter: r.triggerType === 'enter',
          notifyOnExit: r.triggerType === 'exit',
        });
      }
    });

    if (regions.length > 0) {
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
      console.log(`[Geofence] Successfully registered ${regions.length} active geofence(s) with OS`);
    } else {
      const isRegistered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
        console.log('[Geofence] Stopped geofencing (no active regions)');
      }
    }
  } catch (err: any) {
    console.warn('[Geofence] syncAllActiveGeofences failed:', err?.message);
  }
}
