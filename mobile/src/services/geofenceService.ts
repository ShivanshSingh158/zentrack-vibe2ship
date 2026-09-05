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

import { Platform, DeviceEventEmitter, Linking, Alert } from 'react-native';
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
import type { GymGeofenceConfig } from '../types/locationReminder.types';
import { dismissActiveWorkoutNotification } from './activeWorkoutNotificationService';

export const GEOFENCE_TASK_NAME = 'ZENTRACK_GEOFENCE_TASK';
export const TASK_REMINDERS_STORAGE_KEY = '@zentrack_task_location_reminders';

export function getTodayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculates high-accuracy Haversine distance in meters between two GPS coordinates.
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Central Gym Arrival Pipeline:
 * Initializes the active workout session in AsyncStorage, syncs to Firestore,
 * awards XP, notifies UI listeners, and sends actionable arrival notification.
 */
export async function triggerGymArrival(
  gymConfigParam?: GymGeofenceConfig | null,
  options?: { force?: boolean }
): Promise<boolean> {
  try {
    const gymConfig = gymConfigParam || (await getGymGeofenceConfig());
    if (!gymConfig || !gymConfig.enabled) return false;

    const placeName = gymConfig.placeName || 'the Gym';
    const today = getTodayLocalDateStr();
    const nowMs = Date.now();

    // Guard: ensure gym arrival only triggers ONCE per workout session
    const arrivalHandledKey = `@zentrack_gym_arrival_handled_${today}`;
    if (!options?.force) {
      const alreadyHandled = await AsyncStorage.getItem(arrivalHandledKey);
      if (alreadyHandled === 'true') {
        return false;
      }
    }

    const sessionKey = `@zentrack_active_workout_${today}`;
    const existingRaw = await AsyncStorage.getItem(sessionKey);
    let startTime = nowMs;

    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        // If workout today is already completed, do not auto-restart unless explicitly forced
        if (existing?.completed && !options?.force) {
          return false;
        }
        // If workout today has already started or arrival was already auto-started, do NOT re-trigger
        if ((existing?.startTime || existing?.autoStartedByGeofence) && !options?.force) {
          await AsyncStorage.setItem(arrivalHandledKey, 'true');
          return false;
        }
        if (existing?.startTime) {
          startTime = existing.startTime;
        }
      } catch {}
    }

    // Check Firestore if authenticated to see if workout already started or completed
    try {
      const user = auth.currentUser;
      if (user && !options?.force) {
        const docId = `${user.uid}_${today}`;
        const docRef = doc(db, COLLECTION.GYM_LOGS, docId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const existingData = snap.data();
          if (existingData.completed || existingData.workoutStartTime) {
            // Already started or completed in cloud — do not re-trigger
            await AsyncStorage.setItem(arrivalHandledKey, 'true');
            return false;
          }
        }
      }
    } catch (e) {
      console.warn('[Geofence] Firestore gym pre-check error:', e);
    }

    // Mark arrival handled immediately to prevent any concurrent triggers
    await AsyncStorage.setItem(arrivalHandledKey, 'true');

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

    // Notification debounce guard: don't spam notifications if triggered repeatedly within 2 hours
    const notifDebounceKey = `@zentrack_last_gym_arrival_notif_${today}`;
    const lastNotifStr = await AsyncStorage.getItem(notifDebounceKey);
    const lastNotifMs = lastNotifStr ? Number(lastNotifStr) : 0;
    const isRecentlyNotified = nowMs - lastNotifMs < 2 * 60 * 60 * 1000;

    if (!isRecentlyNotified || options?.force) {
      await AsyncStorage.setItem(notifDebounceKey, String(nowMs));
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

    return true;
  } catch (err: any) {
    console.warn('[Geofence] triggerGymArrival failed:', err?.message);
    return false;
  }
}

/**
 * Central Gym Departure Pipeline:
 * Checks if a workout session is currently active for today.
 * If active and user has left the gym perimeter:
 * Finalizes workout duration, computes end time, marks session completed in
 * Firestore & AsyncStorage, awards completion XP, notifies UI listeners,
 * dismisses lock screen HUD, and sends actionable departure notification.
 */
export async function triggerGymDeparture(
  gymConfigParam?: GymGeofenceConfig | null,
  options?: { force?: boolean }
): Promise<boolean> {
  try {
    const gymConfig = gymConfigParam || (await getGymGeofenceConfig());
    if (!gymConfig || !gymConfig.enabled) return false;

    const placeName = gymConfig.placeName || 'the Gym';
    const today = getTodayLocalDateStr();
    const nowMs = Date.now();

    const sessionKey = `@zentrack_active_workout_${today}`;
    const sessionRaw = await AsyncStorage.getItem(sessionKey);
    let startTime: number | null = null;
    let isAlreadyCompleted = false;

    if (sessionRaw) {
      try {
        const session = JSON.parse(sessionRaw);
        if (session?.completed) {
          isAlreadyCompleted = true;
        }
        if (session?.startTime) {
          startTime = Number(session.startTime);
        }
      } catch {}
    }

    // Inspect Firestore for active workout or cloud start time
    const user = auth.currentUser;
    if (user) {
      try {
        const docId = `${user.uid}_${today}`;
        const docRef = doc(db, COLLECTION.GYM_LOGS, docId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.completed) {
            isAlreadyCompleted = true;
          }
          if (data.workoutStartTime && !startTime) {
            startTime = Number(data.workoutStartTime);
          }
        }
      } catch (e) {
        console.warn('[Geofence] Firestore departure check error:', e);
      }
    }

    // If workout is already completed and not explicitly forced, nothing to departure-finalize
    if (isAlreadyCompleted && !options?.force) {
      return false;
    }

    // If no active workout session exists in storage or cloud, do nothing
    if (!startTime && !options?.force) {
      const activeState = await AsyncStorage.getItem('@zentrack_active_workout_state');
      if (!activeState) {
        return false;
      }
      try {
        const parsed = JSON.parse(activeState);
        if (parsed?.startTime) startTime = Number(parsed.startTime);
      } catch {}
    }

    if (!startTime) {
      return false;
    }

    // Safety guard: workout must have been running for at least 2 minutes to prevent
    // premature auto-finish caused by temporary GPS drift immediately after arrival
    if (!options?.force && nowMs - startTime < 2 * 60 * 1000) {
      return false;
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
    if (user) {
      try {
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
      } catch (e) {
        console.warn('[Geofence] Firestore gym departure sync error:', e);
      }
    }

    // Dismiss active lock screen notification if active
    try {
      await dismissActiveWorkoutNotification();
    } catch {}

    // Award session XP & notify UI listeners
    awardXP('GYM_SESSION').catch(() => {});
    DeviceEventEmitter.emit('gym_workout_auto_finished', { date: today, duration: elapsedMins });

    // Schedule High-Priority Departure Notification
    const notifDebounceKey = `@zentrack_last_gym_departure_notif_${today}`;
    const lastNotifStr = await AsyncStorage.getItem(notifDebounceKey);
    const lastNotifMs = lastNotifStr ? Number(lastNotifStr) : 0;
    const isRecentlyNotified = nowMs - lastNotifMs < 2 * 60 * 60 * 1000;

    if (!isRecentlyNotified || options?.force) {
      await AsyncStorage.setItem(notifDebounceKey, String(nowMs));
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

    return true;
  } catch (err: any) {
    console.warn('[Geofence] triggerGymDeparture failed:', err?.message);
    return false;
  }
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

      // ── SUB-CASE A1: ARRIVAL (AUTO-START WORKOUT) ──────────────────────────
      if (isEnter && gymConfig.promptOnEnter) {
        await triggerGymArrival(gymConfig);
      }

      // ── SUB-CASE A2: DEPARTURE (AUTO-FINISH WORKOUT) ────────────────────────
      else if (isExit && gymConfig.promptOnExit) {
        await triggerGymDeparture(gymConfig);
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

// ─── 2. Permissions & Device Service Helpers ─────────────────────────────────
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

/**
 * Ensures system location provider (GPS) is turned ON.
 * On Android: prompts the native Google Play LocationServices 1-tap dialog ("To continue, turn on device location").
 * On iOS: prompts the user to open device Settings.
 */
export async function ensureLocationServicesEnabled(): Promise<boolean> {
  try {
    const isEnabled = await Location.hasServicesEnabledAsync();
    if (isEnabled) return true;

    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
        const afterCheck = await Location.hasServicesEnabledAsync();
        if (afterCheck) {
          checkImmediateGymProximity().catch(() => {});
          syncAllActiveGeofences().catch(() => {});
          return true;
        }
      } catch (providerErr: any) {
        console.log('[Geofence] enableNetworkProviderAsync cancelled or failed:', providerErr?.message);
      }
    }

    Alert.alert(
      'Location Services Disabled',
      'Please enable Device Location (GPS) in Settings so ZenTrack can detect when you arrive at your gym.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  } catch (err: any) {
    console.warn('[Geofence] ensureLocationServicesEnabled error:', err?.message);
    return false;
  }
}

/**
 * Immediate Proximity Evaluator:
 * Solves the OS "transition edge" problem! If the user turned on location while ALREADY
 * standing inside the gym, OS geofencing doesn't see a boundary crossing.
 * This directly checks GPS distance right now and triggers arrival immediately.
 */
export async function checkImmediateGymProximity(options?: {
  force?: boolean;
  currentCoords?: { latitude: number; longitude: number };
}): Promise<{
  insideGym: boolean;
  distanceMeters: number | null;
  triggered: boolean;
}> {
  try {
    const gymConfig = await getGymGeofenceConfig();
    if (!gymConfig || !gymConfig.enabled || !gymConfig.latitude || !gymConfig.longitude) {
      return { insideGym: false, distanceMeters: null, triggered: false };
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return { insideGym: false, distanceMeters: null, triggered: false };
    }

    const { status: fg } = await Location.getForegroundPermissionsAsync();
    if (fg !== 'granted') {
      return { insideGym: false, distanceMeters: null, triggered: false };
    }

    // If caller provided currentCoords (e.g. user just tapped 'Use Current Location'), use them instantly
    let currentCoords: { latitude: number; longitude: number } | null = options?.currentCoords ?? null;

    if (!currentCoords) {
      // Attempt balanced GPS position with 6-second timeout
      try {
        const positionPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
        const pos = await Promise.race([positionPromise, timeoutPromise]);
        if (pos && 'coords' in pos) {
          currentCoords = (pos as Location.LocationObject).coords;
        }
      } catch (posErr: any) {
        // Handled below
      }

      // Robust fallback: if timeout occurred or error was thrown, inspect last known GPS coordinate
      if (!currentCoords) {
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) currentCoords = last.coords;
        } catch {}
      }
    }

    if (!currentCoords) {
      return { insideGym: false, distanceMeters: null, triggered: false };
    }

    const distance = calculateDistanceMeters(
      currentCoords.latitude,
      currentCoords.longitude,
      gymConfig.latitude,
      gymConfig.longitude
    );

    const radius = gymConfig.radius || 150;
    const isInside = distance <= radius;

    if (isInside && gymConfig.promptOnEnter) {
      const triggered = await triggerGymArrival(gymConfig, options);
      return { insideGym: true, distanceMeters: distance, triggered };
    }

    if (!isInside && gymConfig.promptOnExit) {
      const triggered = await triggerGymDeparture(gymConfig, options);
      return { insideGym: false, distanceMeters: distance, triggered };
    }

    return { insideGym: isInside, distanceMeters: distance, triggered: false };
  } catch (err: any) {
    console.warn('[Geofence] checkImmediateGymProximity failed:', err?.message);
    return { insideGym: false, distanceMeters: null, triggered: false };
  }
}

/**
 * Diagnostic status for UI HUDs (e.g. GymHomeScreen pill)
 */
export interface GeofenceDiagnosticStatus {
  isConfigured: boolean;
  isEnabled: boolean;
  isLocationServicesEnabled: boolean;
  hasForegroundPermission: boolean;
  hasBackgroundPermission: boolean;
  gymName: string;
  radius: number;
}

export async function getGeofenceDiagnosticStatus(): Promise<GeofenceDiagnosticStatus> {
  try {
    const gymConfig = await getGymGeofenceConfig();
    const isConfigured = !!(gymConfig && gymConfig.latitude && gymConfig.longitude);
    const isEnabled = !!gymConfig?.enabled;
    const gymName = gymConfig?.placeName || 'My Gym';
    const radius = gymConfig?.radius || 150;

    let isLocationServicesEnabled = false;
    let hasForegroundPermission = false;
    let hasBackgroundPermission = false;

    try {
      isLocationServicesEnabled = await Location.hasServicesEnabledAsync();
    } catch {}

    try {
      const fg = await Location.getForegroundPermissionsAsync();
      hasForegroundPermission = fg.status === 'granted';
      const bg = await Location.getBackgroundPermissionsAsync();
      hasBackgroundPermission = bg.status === 'granted';
    } catch {}

    return {
      isConfigured,
      isEnabled,
      isLocationServicesEnabled,
      hasForegroundPermission,
      hasBackgroundPermission,
      gymName,
      radius,
    };
  } catch {
    return {
      isConfigured: false,
      isEnabled: false,
      isLocationServicesEnabled: false,
      hasForegroundPermission: false,
      hasBackgroundPermission: false,
      gymName: '',
      radius: 150,
    };
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

// ─── 5. Cold Boot & Lifecycle Auto-Arm ───────────────────────────────────────
export async function initGeofencingOnBoot(): Promise<void> {
  try {
    const gymConfig = await getGymGeofenceConfig();
    const taskReminders = await getActiveTaskLocationReminders();

    const hasAnyTarget = (gymConfig && gymConfig.enabled && gymConfig.latitude) || (taskReminders && taskReminders.length > 0);
    if (!hasAnyTarget) {
      return;
    }

    // Only auto-sync if permissions were already granted
    const { status: fg } = await Location.getForegroundPermissionsAsync();
    if (fg !== 'granted') return;

    const { status: bg } = await Location.getBackgroundPermissionsAsync();
    if (bg === 'granted') {
      await syncAllActiveGeofences();
    }

    // Evaluate immediate proximity if location services are on
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (servicesOn) {
      checkImmediateGymProximity().catch(() => {});
    }
  } catch (err: any) {
    console.warn('[Geofence] initGeofencingOnBoot error:', err?.message);
  }
}

