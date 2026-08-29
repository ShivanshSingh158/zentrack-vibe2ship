import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const PRIORITY = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 } as const;
export const ALARM_CAP = Platform.OS === 'ios' ? 64 : 450;

// ── Notification handler ──────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Permission setup ──────────────────────────────────────────────────────────

export async function requestNotificationPermissions() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ZenTrack',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#cba6f7',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Task Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#a599ff',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('habits', {
        name: 'Habit Streak',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#ff9f4d',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('sara_critical', {
        name: 'Sara Critical Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 600, 200, 600, 200, 600],
        lightColor: '#ff3b30',
        sound: 'default',
      });
    }

    await Notifications.setNotificationCategoryAsync('class_reminder', [
      { identifier: 'mark_present', buttonTitle: '✅ Present', options: { opensAppToForeground: false } },
      { identifier: 'mark_absent', buttonTitle: '❌ Absent', options: { opensAppToForeground: false, isDestructive: true } },
      { identifier: 'mark_cancelled', buttonTitle: '🚫 Cancelled', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync('gym_reminder', [
      { identifier: 'start_workout', buttonTitle: '🏋️ Start Workout', options: { opensAppToForeground: true } },
      { identifier: 'snooze_15m', buttonTitle: '⏰ Snooze 15m', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync('task_reminder', [
      { identifier: 'mark_task_done', buttonTitle: '✅ Mark Done', options: { opensAppToForeground: false } },
      { identifier: 'open_tasks', buttonTitle: '📋 Open Tasks', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('habit_reminder', [
      { identifier: 'log_habit', buttonTitle: '🔥 Log It', options: { opensAppToForeground: false } },
      { identifier: 'open_habits', buttonTitle: '📊 View Habits', options: { opensAppToForeground: true } },
    ]);

    return true;
  } catch (err: any) {
    console.warn('[Notifications] Setup warning:', err?.message);
    return false;
  }
}
