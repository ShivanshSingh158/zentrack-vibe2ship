/**
 * activeWorkoutNotificationService.ts — ZenTrack Mobile
 *
 * Persistent Lock Screen Active Workout HUD & Rest Timer Notification.
 * Provides live set tracking, rest countdown, and interactive buttons (+2.5kg, Done Set, Skip Rest)
 * directly on the lockscreen without needing to unlock the phone.
 */

import * as Notifications from 'expo-notifications';
import { Platform, DeviceEventEmitter } from 'react-native';

const WORKOUT_NOTIFICATION_ID = 'zentrack_active_workout_hud';

export interface ActiveWorkoutNotificationPayload {
  exerciseName: string;
  currentSet: number;
  totalSets: number;
  weight: number;
  reps: number;
  isResting?: boolean;
  restSecondsRemaining?: number;
  nextExerciseName?: string;
}

let lastNotificationState: ActiveWorkoutNotificationPayload | null = null;
let isNotificationActive = false;

// ── 2-second debounce for HUD updates ────────────────────────────────────────
// Every set completion fires updateActiveWorkoutNotification. Without debouncing,
// rapid taps cause the OS to continuously re-post the notification to the top of
// the shade and "bump" the lockscreen display. Coalescing to 2s gives a smooth UX.
let _hudUpdateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingHudPayload: ActiveWorkoutNotificationPayload | null = null;

function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Updates or presents the lock screen active workout / rest timer notification.
 * NOTE: OS notification shade updates for rest timer and set logging are disabled
 * per user preference to prevent notification flooding. In-app floating HUD and audio
 * timer cues remain active.
 */
export async function updateActiveWorkoutNotification(
  payload: ActiveWorkoutNotificationPayload
): Promise<void> {
  lastNotificationState = payload;
  // Always dismiss any existing active workout notification to avoid shade clutter
  if (isNotificationActive) {
    await dismissActiveWorkoutNotification();
  }
}

/**
 * Dismisses the persistent lock screen workout notification
 */
export async function dismissActiveWorkoutNotification(): Promise<void> {
  isNotificationActive = false;
  lastNotificationState = null;
  // Cancel any pending debounced update
  if (_hudUpdateDebounceTimer) {
    clearTimeout(_hudUpdateDebounceTimer);
    _hudUpdateDebounceTimer = null;
    _pendingHudPayload = null;
  }
  try {
    await Notifications.dismissNotificationAsync(WORKOUT_NOTIFICATION_ID);
  } catch (err) {
    console.warn('[ActiveWorkoutNotification] Dismiss failed:', err);
  }
}

export function isWorkoutNotificationActive(): boolean {
  return isNotificationActive;
}

// ─── Notification Action Handler Listener ────────────────────────────────────
export function registerActiveWorkoutNotificationListeners() {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    const notificationData = response.notification.request.content.data;

    if (notificationData?.type !== 'ACTIVE_WORKOUT_HUD' && !actionId.startsWith('WORKOUT_') && !actionId.startsWith('REST_')) {
      return;
    }

    switch (actionId) {
      case 'WORKOUT_DONE_SET':
        DeviceEventEmitter.emit('ACTIVE_WORKOUT_ACTION', { action: 'DONE_SET' });
        break;
      case 'WORKOUT_ADD_WEIGHT':
        DeviceEventEmitter.emit('ACTIVE_WORKOUT_ACTION', { action: 'ADD_WEIGHT', delta: 2.5 });
        break;
      case 'WORKOUT_NEXT_EXERCISE':
        DeviceEventEmitter.emit('ACTIVE_WORKOUT_ACTION', { action: 'NEXT_EXERCISE' });
        break;
      case 'REST_SKIP':
        DeviceEventEmitter.emit('ACTIVE_WORKOUT_ACTION', { action: 'SKIP_REST' });
        break;
      case 'REST_ADD_30S':
        DeviceEventEmitter.emit('ACTIVE_WORKOUT_ACTION', { action: 'ADD_REST_SECONDS', seconds: 30 });
        break;
      default:
        break;
    }
  });

  return () => subscription.remove();
}

