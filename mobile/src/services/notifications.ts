/**
 * notifications.ts â€” ZenTrack Mobile
 *
 * scheduleAllNotifications() â€” the single source of truth for all local notifications.
 * Reads all user prefs from AsyncStorage before scheduling.
 */

import * as Notifications from 'expo-notifications';
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getDocs, collection, query, where, getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

import {
  Task, CustomEvent, GymLog, AttendanceSubject,
  HabitLog, Habit, Assignment, WaterLog, AttendanceLog, SleepLog,
} from '../contexts/MobileDataContext';
import { UserGymPlanDoc } from '../types/gym.types';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { COLLECTION } from '../config/constants';
import { formatLocalDateStr } from '../utils/dateUtils';

import { auth } from './firebase';
import { calculateBunkMath } from '../utils/academicMath';
import { getBootManifestSync, updateL1Cache, loadBootManifest } from '../utils/bootManifest';

// Extracted channels, priorities & pools
import { PRIORITY, ALARM_CAP, requestNotificationPermissions, ensureNotificationChannels, getSoundChannelId } from './notificationChannels';
import {
  getRandomMessage,
  shuffleArray,
  MORNING_BRIEF_TITLES_STANDARD,
  MORNING_BRIEF_STANDARD_POOLS,
  MORNING_BRIEF_MISSED_GYM_TITLES,
  MORNING_BRIEF_MISSED_GYM_POOLS,
  OVERDUE_TASK_POOLS,
  TASK_BUFFER_POOLS,
  TASK_T15_POOLS,
  TASK_DAILY_POOLS,
  CALENDAR_EVENT_POOLS,
  HABIT_STREAK_RISK_POOLS,
  HABIT_DAILY_30_POOLS,
  HABIT_DAILY_7_POOLS,
  HABIT_DAILY_1_POOLS,
  HABIT_DAILY_0_POOLS,
  GYM_WORKOUT_POOLS,
  GYM_REST_DAY_POOLS,
  ATTENDANCE_CRITICAL_POOLS,
  CLASS_PRE_POOLS,
  POST_CLASS_LOG_POOLS,
  LAB_MID_POOLS,
  POST_LAB_LOG_POOLS,
  ASSIGNMENT_48H_POOLS,
  ASSIGNMENT_24H_POOLS,
  WATER_TITLES_POOL,
  WATER_PROGRESS_POOLS,
  WATER_EMPTY_POOLS,
  WATER_MILESTONE_50_POOLS,
  WATER_MILESTONE_75_POOLS,
  WATER_MILESTONE_100_POOLS,
  SLEEP_NIGHT_POOLS,
  SLEEP_MORNING_POOLS,
  WEEKLY_REVIEW_POOLS,
  INACTIVITY_POOLS
} from './notificationPools';

export { requestNotificationPermissions };

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', [
        { key: 'package', value: 'package:com.shiv157.zentrack' },
      ]);
    } catch {
      Linking.openSettings();
    }
  } else {
    Linking.openSettings();
  }
}

// â”€â”€ Time & Date Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseTimeString(t?: string): { hours: number; minutes: number } | null {
  if (!t || typeof t !== 'string') return null;
  const raw = t.trim().toLowerCase();

  // Split ranges like "11:00 - 12:00 pm" or "11:00 am to 1:00 pm"
  const rangeParts = raw.split(/\s*(?:[-–—]|to)\s*/);
  const startStr = rangeParts[0]?.trim() || '';
  const endStr = rangeParts[1]?.trim() || '';
  const trailingMeridiem = endStr.match(/\b(am|pm)\b/)?.[1];

  // Strictly match HH:MM (only colon ':', never decimal dot '.')
  const colonMatch = startStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const min = parseInt(colonMatch[2], 10);
    const ampm = colonMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    // Only inherit trailing PM if start has no meridiem and is 1..7 (e.g. "2:00 - 4:00 pm" -> 14:00; "11:00 - 12:00 pm" stays 11:00 AM)
    if (!ampm && trailingMeridiem === 'pm' && h >= 1 && h <= 7) {
      h += 12;
    }
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return { hours: h, minutes: min };
    }
  }

  // Match "11 am" / "11pm"
  const hourAmPmMatch = startStr.match(/^(\d{1,2})\s*(am|pm)$/);
  if (hourAmPmMatch) {
    let h = parseInt(hourAmPmMatch[1], 10);
    const ampm = hourAmPmMatch[2];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24) return { hours: h, minutes: 0 };
  }

  // Match bare 24h integer ONLY if the entire string is 1-2 digits (never "11 chapters")
  if (/^\d{1,2}$/.test(startStr)) {
    const rawH = parseInt(startStr, 10);
    if (rawH >= 0 && rawH < 24) return { hours: rawH, minutes: 0 };
  }

  return null;
}

function parseHM(s: string) {
  if (!s) return { hours: 9, minutes: 0 };
  const parsed = parseTimeString(s);
  if (parsed) return parsed;
  const [h, m] = s.split(':').map(Number);
  return { hours: isNaN(h) ? 9 : h, minutes: isNaN(m) ? 0 : m };
}

function dateAtHM(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ScheduleParams {
  tasks?: Task[];
  customEvents?: CustomEvent[];
  gymLogs?: GymLog[];
  attendance?: AttendanceSubject[];
  habitLogs?: HabitLog[];
  allHabits?: Habit[];
  assignments?: Assignment[];
  waterLogs?: WaterLog[];
  sleepLogs?: SleepLog[];
  attendanceLogs?: AttendanceLog[];
  userGymPlan?: UserGymPlanDoc | null;
  flashcards?: Array<{ nextReviewDate: string }>;
  userName?: string;
  holidays?: string[];
}

// â”€â”€ Data Fingerprint Cache (Persisted to Disk) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const NOTIF_FINGERPRINT_KEY = '@zentrack_notif_fingerprint';
let _lastScheduleFingerprint: string | null = null;
let _lastScheduleError: string | null = null;
let _lastScheduledCount: number = 0;

// Eager initialization: hydrate from in-memory L1 boot cache or AsyncStorage
try {
  const initialBootFp = getBootManifestSync()?.notifFingerprint;
  if (initialBootFp) {
    _lastScheduleFingerprint = initialBootFp;
  } else {
    AsyncStorage.getItem(NOTIF_FINGERPRINT_KEY).then(val => {
      if (val && !_lastScheduleFingerprint) {
        _lastScheduleFingerprint = val;
      }
    }).catch(() => {});
  }
} catch {}

export function clearScheduleCache() {
  _lastScheduleFingerprint = null;
  AsyncStorage.removeItem(NOTIF_FINGERPRINT_KEY).catch(() => {});
  updateL1Cache('notifFingerprint', null);
}

export function getLastScheduleStatus() {
  return {
    lastFingerprint: _lastScheduleFingerprint,
    count: _lastScheduledCount,
    lastError: _lastScheduleError,
  };
}

// ── Firestore Cross-Device Fingerprint Sync ────────────────────────────────────
// Collection: notification_schedules / {userId}
// Both devices write/read this doc. When device A reschedules and saves a new
// fingerprint to Firestore, device B will pull it on next run, see its local
// cache is stale, and reschedule at the SAME absolute timestamps — eliminating
// the 4–5 minute gap caused by each device scheduling independently.

const _NOTIF_SCHEDULE_COLLECTION = 'notification_schedules';
const _CLOUD_SYNC_TIMEOUT_MS = 3000;

async function _pullFingerprintFromFirestore(_userId: string): Promise<string | null> {
  return null; // Local device OS alarms are isolated to this hardware
}

async function _pushFingerprintToFirestore(_userId: string, _fingerprint: string): Promise<void> {
  // Local device OS alarms are isolated to this hardware; do not push to cloud
}

// Bump this string whenever the scheduling logic changes — forces a full wipe+reschedule
// on every device that has a stale fingerprint from an older JS bundle.
const NOTIF_ENGINE_VERSION = 'v7_all_deterministic_slot_ids_2026_10_17';

function _buildFingerprint(params: ScheduleParams, kv?: Record<string, string | null>): string {
  const todayDateStr = formatLocalDateStr(new Date());

  const attendanceFingerprint = (params.attendance || [])
    .map(s => `${s.id}_${s.classesTotal}_${s.classesAttended}_${s.labsTotal || 0}_${s.labsAttended || 0}_${s.lastUpdated || 0}`)
    .join(';');

  const taskFingerprint = (params.tasks || [])
    .filter(t => t.status !== 'completed')
    .map(t => `${t.id}_${t.title || ''}_${t.date}_${t.timeSlot || ''}_${t.isReminder ? '1' : '0'}`)
    .join(';');

  const eventFingerprint = (params.customEvents || [])
    .map(e => `${e.id}_${e.title || ''}_${e.date}_${e.startTime || ''}`)
    .join(';');

  const attendanceLogFingerprint = (params.attendanceLogs || [])
    .map(l => `${l.id || ''}_${l.subjectId || ''}_${l.type || ''}_${l.idx ?? ''}_${l.action}_${(l.date || '').slice(0, 10)}`)
    .join(';');

  const habitLogsTodayHash = (params.habitLogs || [])
    .filter(l => (l.date || '').slice(0, 10) === todayDateStr)
    .map(l => `${l.habitId}_${l.count ?? 1}_${l.isFreeze ? 1 : 0}`)
    .sort()
    .join(';');

  const assignmentHash = (params.assignments || [])
    .map(a => `${a.id}_${a.status || ''}_${(a as any).completed ? 1 : 0}_${a.dueDate || ''}`)
    .sort()
    .join(';');

  const flashcardDueCount = (params.flashcards || [])
    .filter(f => f.nextReviewDate && f.nextReviewDate <= todayDateStr).length;

  const gymPlanFingerprint = params.userGymPlan
    ? `${params.userGymPlan.id || ''}_${params.userGymPlan.templateId || ''}_${params.userGymPlan.updatedAt || ''}_${params.userGymPlan.schedulePattern || ''}`
    : '';

  const gymLogContentHash = (params.gymLogs || [])
    .map(g => {
      const exercises = g.exercises || [];
      const completedSets = exercises.reduce(
        (sum: number, e: any) => sum + ((e.setsLog || []).filter((s: any) => s.completed).length),
        0
      );
      return `${g.date}_${exercises.length}_${completedSets}_${g.completed ? '1' : '0'}`;
    })
    .join(';');

  const todayWaterLogs = (params.waterLogs || []).filter(
    w => (w.date || '').slice(0, 10) === todayDateStr
  );
  const waterTodayMl = todayWaterLogs.reduce((acc, w) => acc + (w.amountMl || 0), 0);
  const lastWaterTs = todayWaterLogs.reduce((max, w) => Math.max(max, w.timestamp || 0), 0);
  // Bucket to the minute so millisecond syncs never thrash the fingerprint
  const lastWaterMinuteBucket = Math.floor(lastWaterTs / 60000);

  const prefsFingerprint = kv
    ? Object.keys(kv)
        .sort()
        .map(k => `${k}=${kv[k] ?? ''}`)
        .join(',')
    : '';

  const holidayFingerprint = (params.holidays || [])
    .map((h: any) => typeof h === 'string' ? h.trim().slice(0, 10) : (h?.date ? String(h.date).trim().slice(0, 10) : ''))
    .filter(Boolean)
    .sort()
    .join(',');

  return [
    NOTIF_ENGINE_VERSION,
    taskFingerprint,
    eventFingerprint,
    gymPlanFingerprint,
    (params.habitLogs || []).length,
    habitLogsTodayHash,
    gymLogContentHash,
    assignmentHash,
    (params.waterLogs || []).length,
    waterTodayMl,
    lastWaterMinuteBucket,
    (params.sleepLogs || []).length,
    attendanceLogFingerprint,
    (params.attendance || []).length,
    attendanceFingerprint,
    holidayFingerprint,
    flashcardDueCount,
    prefsFingerprint,
    todayDateStr,
  ].join('|');
}

let _activeSchedulingPromise: Promise<void> | null = null;
let _pendingResolveList: (() => void)[] = [];
let _pendingRejectList: ((err: any) => void)[] = [];
let _latestParams: ScheduleParams | null = null;

// â”€â”€ Priority Queue Entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PendingNotif {
  title: string;
  body: string;
  trigger: Date;
  data?: any;
  channel: string;
  categoryId?: string;
  priority: number; // 1 = highest, use PRIORITY.* constants
}

// â”€â”€ scheduleAllNotifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function scheduleAllNotifications(params: ScheduleParams): Promise<void> {
  _latestParams = params;

  // If a scheduling run is already in flight, return a Promise that will resolve
  // only when the entire queue (including this latest request) has fully finished scheduling into the OS.
  if (_activeSchedulingPromise) {
    return new Promise<void>((resolve, reject) => {
      _pendingResolveList.push(resolve);
      _pendingRejectList.push(reject);
    });
  }

  _activeSchedulingPromise = (async () => {
    try {
      await ensureNotificationChannels();
      while (_latestParams) {
        const currentParams = _latestParams;
        _latestParams = null;
        await _executeScheduleLoop(currentParams);
      }
      const resolvers = [..._pendingResolveList];
      _pendingResolveList = [];
      _pendingRejectList = [];
      resolvers.forEach(r => r());
    } catch (err) {
      const rejecters = [..._pendingRejectList];
      _pendingResolveList = [];
      _pendingRejectList = [];
      rejecters.forEach(rj => rj(err));
      throw err;
    } finally {
      _activeSchedulingPromise = null;
    }
  })();

  return _activeSchedulingPromise;
}

async function _executeScheduleLoop(currentParams: ScheduleParams) {
  // â”€â”€ Active Workout Guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // If the user is actively logging a workout, bail out immediately.
  // This is a second line of defence behind BackgroundNotificationWatcher's guard.
  // The watcher guard prevents most calls; this catches any that slip through
  // (e.g. from MobileDataContext's own 3.5s scheduler or direct callers).
  try {
    const activeStateRaw = await AsyncStorage.getItem('@zentrack_active_workout_state');
    if (activeStateRaw) {
      const activeState = JSON.parse(activeStateRaw);
      const startedAt =
        activeState?.workoutStartTime ||
        activeState?.startedAt ||
        activeState?.updatedAt ||
        0;
      const isFresh = startedAt > 0 && Date.now() - startedAt < 3 * 60 * 60 * 1000;
      if (activeState && !activeState.completed && isFresh) {
        console.log('[Notifications] Active workout in progress — skipping reschedule.');
        return;
      } else if (activeState && !activeState.completed && !isFresh) {
        await AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
      }
    }
  } catch {
    // AsyncStorage error: fall through and schedule normally
  }

  const {
    tasks = [],
    customEvents = [],
    gymLogs = [],
        attendance = [],
        habitLogs = [],
        allHabits = [],
        assignments = [],
        waterLogs = [],
        sleepLogs = [],
        attendanceLogs = [],
        userGymPlan = null,
        flashcards = [],
        holidays = [],
      } = currentParams;

      const rawHolidays = (holidays && holidays.length > 0)
        ? holidays
        : (getBootManifestSync()?.holidays || []);
      const normalizedHolidays = new Set<string>(
        (rawHolidays || []).map((h: any) => {
          if (!h) return '';
          if (typeof h === 'string') return h.trim().slice(0, 10);
          if (typeof h.date === 'string') return h.date.trim().slice(0, 10);
          return String(h).slice(0, 10);
        }).filter(Boolean)
      );

      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const dStr = String(now.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${dStr}`;

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomY = tomorrow.getFullYear();
      const tomM = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const tomD = String(tomorrow.getDate()).padStart(2, '0');
      const tomorrowStr = `${tomY}-${tomM}-${tomD}`;

      const isWeekend = now.getDay() === 0 || now.getDay() === 6;

      // â”€â”€ Batched Preference Retrieval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const BOOL_KEYS = [
        'zentrack_notif_mod_tasks', 'zentrack_notif_mod_habits', 'zentrack_notif_mod_gym',
        'zentrack_notif_mod_attendance', 'zentrack_notif_mod_assignments',
        'zentrack_notif_habit_streak_risk', 'zentrack_notif_overdue_nudge',
        'zentrack_notif_assignment_48h', 'zentrack_notif_assignment_24h', 'zentrack_notif_gym_rest_day',
        'zentrack_notif_weekly_review', 'zentrack_notif_attendance_warning', 'zentrack_notif_morning_brief',
        'zentrack_notif_inactivity_nudge', 'zentrack_notif_quiet_hours', 'zentrack_notif_weekend_mode',
        'zentrack_notif_sara_escalation', 'zentrack_notif_actionable_notifs',
        'zentrack_notif_task_5min_alert',
      ];
      const STR_KEYS = [
        'zentrack_notif_morning_brief_time', 'zentrack_notif_overdue_nudge_time', 'zentrack_notif_quiet_start',
        'zentrack_notif_quiet_end', 'zentrack_notif_task_buffer', 'zentrack_notif_inactivity_days',
        'zentrack_notif_habit_streak_time', 'zentrack_default_notif_time',
        'zentrack_notif_calendar_offset', 'zentrack_notif_notifs_sound',
        '@gym_notification_time', '@gym_notification_enabled',
        '@zentrack_water_reminder_freq', '@zentrack_last_water_notif_ts', '@zentrack_sleep_reminders_enabled',
        '@zentrack_sleep_reminder_night', '@zentrack_sleep_reminder_morning',
        'zentrack_water_goal_ml', '@zentrack_user_name', 'zentrack_user_name',
        ...attendance.flatMap(s => [
          `@class_notif_enabled_${s.id}`,
          `@class_notif_offset_${s.id}`,
          `@class_notif_pre_offsets_${s.id}`,
          `@class_notif_log_delay_${s.id}`,
          `@class_notif_first_pre_${s.id}`,
          `@class_notif_lab_mid_${s.id}`,
          `@class_notif_lab_end_delay_${s.id}`,
        ]),
      ];

      const allPairs = await AsyncStorage.multiGet([...BOOL_KEYS, ...STR_KEYS]);
      const kv: Record<string, string | null> = {};
      allPairs.forEach(([k, v]) => { kv[k] = v; });

      if (!_lastScheduleFingerprint) {
        const cached = getBootManifestSync()?.notifFingerprint || (await AsyncStorage.getItem(NOTIF_FINGERPRINT_KEY).catch(() => null));
        if (cached) _lastScheduleFingerprint = cached;
      }

      const fingerprint = _buildFingerprint(currentParams, kv);

      // Verify OS actually has alarms queued; if OS queue was wiped (e.g. app reinstall/reboot)
      // force a reschedule even if the local fingerprint string matches.
      const existingOsAlarms = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
      if (fingerprint === _lastScheduleFingerprint && existingOsAlarms.length > 0) {
        console.log('[Notifications] Data & preferences unchanged — skipping reschedule.');
        return;
      }
      // NOTE: Do NOT save fingerprint yet â€” only save after successful scheduling.
      // If cancel/schedule throws, we must NOT poison the cache or future calls
      // will permanently skip rescheduling.

      // â”€â”€ Permission Guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Never attempt to cancel/schedule if permission is not granted.
      // This was a silent failure path: cancelAllScheduledNotificationsAsync() would
      // succeed (no-op), but scheduleNotificationAsync() would throw every time,
      // and the poisoned fingerprint would block all future attempts.
      const { status: permStatus } = await Notifications.getPermissionsAsync();
      if (permStatus !== 'granted') {
        console.warn('[Notifications] Permission not granted â€” skipping schedule. Status:', permStatus);
        return;
      }

      // BUG-15 FIX: Before wiping all scheduled notifications, snapshot any active
      // gym rest-timer notifications (scheduled by useGymLog with a future DATE trigger)
      // and reschedule them afterward so an in-progress workout isn't disrupted.
      // BUG-12 FIX: If all user data arrays are empty (likely offline cold-start), skip
      // the cancel+reschedule entirely â€” a wipe with no data would leave the user with
      const waterFreqSetting = parseFloat(kv['@zentrack_water_reminder_freq'] ?? '2');
      const hasActiveSystemReminders =
        waterFreqSetting > 0 ||
        kv['zentrack_notif_morning_brief'] !== 'false' ||
        kv['@zentrack_sleep_reminders_enabled'] === 'true';

      const dataIsEmpty =
        tasks.length === 0 &&
        allHabits.length === 0 &&
        attendance.length === 0 &&
        assignments.length === 0 &&
        customEvents.length === 0 &&
        waterLogs.length === 0 &&
        !hasActiveSystemReminders;

      if (dataIsEmpty) {
        console.warn('[Notifications] All data arrays and system reminders empty (likely offline) — skipping reschedule to preserve existing notifications.');
        return;
      }

      // Fix: Explicitly cancel every individual alarm ID first so Android's AlarmManager
      // flushes each PendingIntent immediately, then call the global cancelAll + settle 150ms
      // for the native NotificationsService intent queue to drain. Without the per-ID sweep,
      // orphaned PendingIntents from a previous JS bundle survive cancelAll and produce zombie alarms.
      if (existingOsAlarms.length > 0) {
        await Promise.all(
          existingOsAlarms.map(alarm =>
            Notifications.cancelScheduledNotificationAsync(alarm.identifier).catch(() => {})
          )
        );
      }
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 150));

      const boolVal = (suffix: string, def = true) => {
        const v = kv[`zentrack_notif_${suffix}`];
        return v == null ? def : v === 'true';
      };
      const strVal = (suffix: string, def: string) =>
        kv[`zentrack_notif_${suffix}`] ?? def;

      const modTasks            = boolVal('mod_tasks');
      const modHabits           = boolVal('mod_habits');
      const modGym              = boolVal('mod_gym');
      const modAttendance       = boolVal('mod_attendance');
      const modAssignments      = boolVal('mod_assignments', true);
      const habitStreakRisk     = boolVal('habit_streak_risk');
      const overdueNudge        = boolVal('overdue_nudge');
      const assignment48h       = boolVal('assignment_48h');
      const assignment24h       = boolVal('assignment_24h');
      // FIX: gym rest day now defaults to true so users see recovery reminders
      const gymRestDay          = boolVal('gym_rest_day', true);
      const weeklyReview        = boolVal('weekly_review');
      const attendanceWarning   = boolVal('attendance_warning');
      const morningBriefEnabled = boolVal('morning_brief');
      const inactivityNudge     = boolVal('inactivity_nudge');
      const quietHoursEnabled   = boolVal('quiet_hours');
      const weekendMode         = boolVal('weekend_mode', false);
      const saraEscalation      = boolVal('sara_escalation', true);
      const actionableNotifs    = boolVal('actionable_notifs', true);
      const task5MinAlert       = boolVal('task_5min_alert', true);

      const morningBriefTimeStr = strVal('morning_brief_time', '07:30');
      const overdueNudgeTimeStr = strVal('overdue_nudge_time', '08:00');
      const quietStartStr       = strVal('quiet_start', '23:00');
      const quietEndStr         = strVal('quiet_end', '07:00');
      const taskBufferMin       = parseInt(strVal('task_buffer', '60'), 10);
      const inactivityDays      = parseInt(strVal('inactivity_days', '3'), 10);
      const habitStreakTimeStr   = strVal('habit_streak_time', '20:00');
      // Calendar event offset in minutes (user-configurable, default 60 min)
      const calendarOffsetMin   = parseInt(kv['zentrack_notif_calendar_offset'] ?? '60', 10) || 60;
      const notifsSound         = kv['zentrack_notif_notifs_sound'] ?? 'default';
      const taskAlarmChannel    = getSoundChannelId('task_alarm', notifsSound);
      const remindersChannel    = getSoundChannelId('reminders', notifsSound);

      const defaultTimeStr = kv['zentrack_default_notif_time'] ?? '09:00';
      const defaultTime = parseHM(defaultTimeStr);

      const gymNotifTimeStr    = kv['@gym_notification_time'] || kv['zentrack_gym_notif_time'];
      const gymNotifEnabledStr = kv['@gym_notification_enabled'];
      const gymNotifEnabled    = gymNotifEnabledStr !== 'false' && modGym;
      let gymNotifHours = 18, gymNotifMinutes = 0;
      if (gymNotifTimeStr) {
        const [h, mm] = gymNotifTimeStr.split(':').map(Number);
        if (!isNaN(h)) { gymNotifHours = h; gymNotifMinutes = mm || 0; }
      }

      const quietStart = parseHM(quietStartStr);
      const quietEnd   = parseHM(quietEndStr);

      function isQuiet(date: Date): boolean {
        if (!quietHoursEnabled) return false;
        const val = date.getHours() * 60 + date.getMinutes();
        const qs  = quietStart.hours * 60 + quietStart.minutes;
        const qe  = quietEnd.hours   * 60 + quietEnd.minutes;
        if (qs > qe) return val >= qs || val < qe;
        return val >= qs && val < qe;
      }

      // â”€â”€ Priority Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Collect ALL candidate notifications, then sort by priority tier before
      // flushing. This guarantees critical notifications (tier 1) are always
      // within the OS alarm budget before lower-tier ones are dropped.
      const pendingQueue: PendingNotif[] = [];

      function enqueue(
        priority: number,
        title: string,
        body: string,
        trigger: Date,
        data?: any,
        channel = 'default',
        categoryId?: string
      ) {
        // CRITICAL FIX: Reject any trigger within 150 seconds of now.
        // On OxygenOS/ColorOS, Android AlarmManager delivers alarms up to ~2 min early.
        // When a 15:00 alarm fires at 14:58, the background scheduler wakes at 14:58:05,
        // sees 15:00 > 14:58 (TRUE), and re-queues the 15:00 slot as a brand-new alarm.
        // That new alarm then fires again at 15:00 — the double-fire. The 150s guard
        // makes the scheduler immune: if the slot is within 2.5 min, it's already in flight.
        // We drop past triggers entirely (no clamping to now+1s — that caused instant re-fires).
        if (trigger.getTime() <= now.getTime() + 150 * 1000) return;
        pendingQueue.push({ priority, title, body, trigger, data, channel, categoryId });
      }

      // â”€â”€ 1. Morning Briefings (Today & Tomorrow) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (morningBriefEnabled) {
        const mbTime = parseHM(morningBriefTimeStr);
        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
          const targetDay = new Date(now);
          targetDay.setDate(targetDay.getDate() + dayOffset);
          const tYear = targetDay.getFullYear();
          const tMonth = String(targetDay.getMonth() + 1).padStart(2, '0');
          const tDay = String(targetDay.getDate()).padStart(2, '0');
          const dateString = `${tYear}-${tMonth}-${tDay}`;

          const trigger = dateAtHM(targetDay, mbTime.hours, mbTime.minutes);
          if (trigger <= now) continue;

          const pendingCount = tasks.filter(t => t.date === dateString && t.status !== 'completed').length;
          const activeHabits = allHabits.filter(h => !h.archived).length;
          const isGymLogged = gymLogs.some(g => g.date === dateString);

          const parts: string[] = [];
          if (pendingCount > 0) parts.push(`${pendingCount} task${pendingCount !== 1 ? 's' : ''}`);
          if (activeHabits > 0) parts.push(`${activeHabits} habit${activeHabits !== 1 ? 's' : ''}`);
          if (!isGymLogged) parts.push('Gym workout');
          const summary = parts.length > 0 ? parts.join(' + ') : 'a fresh clean slate';

          const rawName = auth.currentUser?.displayName || kv['@zentrack_user_name'] || kv['zentrack_user_name'] || currentParams.userName || '';
          const firstName = rawName.trim() ? rawName.trim().split(' ')[0] : undefined;

          let title = getRandomMessage(MORNING_BRIEF_TITLES_STANDARD(firstName));
          let body = getRandomMessage(MORNING_BRIEF_STANDARD_POOLS(summary, firstName));

          if (dayOffset === 0 && modGym) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yyLocal = yesterday.getFullYear();
            const ymLocal = String(yesterday.getMonth() + 1).padStart(2, '0');
            const ydLocal = String(yesterday.getDate()).padStart(2, '0');
            const yesterdayStr = `${yyLocal}-${ymLocal}-${ydLocal}`;

            const yesterdayDayIndex = WEEKDAY_TO_PLAN[yesterday.getDay()];
            const effectivePlanForYesterday =
              userGymPlan?.customDays?.[yesterdayDayIndex] ||
              GYM_PLAN.find(p => p.dayIndex === yesterdayDayIndex);
            const wasScheduledGymDay = effectivePlanForYesterday && !effectivePlanForYesterday.isRest;
            const missedGym = wasScheduledGymDay && !gymLogs.some(g => g.date === yesterdayStr);

            if (missedGym) {
              title = getRandomMessage(MORNING_BRIEF_MISSED_GYM_TITLES(firstName));
              body = getRandomMessage(MORNING_BRIEF_MISSED_GYM_POOLS(summary, firstName));
            }
          }

          if (modAttendance && attendance.length > 0) {
            const THRESHOLD = 75;
            const atRisk = attendance
              .filter(s => s.classesTotal > 0 && (s.classesAttended / s.classesTotal) * 100 < THRESHOLD)
              .sort((a, b) => a.classesAttended / a.classesTotal - b.classesAttended / b.classesTotal);
            if (atRisk.length > 0) {
              const worst = atRisk[0];
              const pct = ((worst.classesAttended / worst.classesTotal) * 100).toFixed(0);
              body += ` (âš ï¸ ${worst.name}: ${pct}% attendance)`;
            }
          }

          enqueue(
            PRIORITY.MEDIUM,
            title,
            body,
            trigger,
            { type: 'morning_brief', date: dateString },
            'default'
          );
        }
      }

      // â”€â”€ 2. Overdue Task Nudge (Today Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (overdueNudge && modTasks) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        const overdueTasks = tasks.filter(t => t.date === yStr && t.status !== 'completed');

        if (overdueTasks.length > 0) {
          const count = overdueTasks.length;
          const countStr = `${count} task${count !== 1 ? 's' : ''}`;
          const on = parseHM(overdueNudgeTimeStr);
          const trigger = dateAtHM(now, on.hours, on.minutes);
          if (trigger > now) {
            enqueue(
              PRIORITY.HIGH,
              'Overdue Tasks',
              getRandomMessage(OVERDUE_TASK_POOLS(countStr)),
              trigger,
              { type: 'overdue_nudge' },
              'default',
              actionableNotifs ? 'task_reminder' : undefined
            );
          }
        }
      }

      // â”€â”€ 3. Task Reminders & Time Windows (7-Day Rolling Horizon) â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (modTasks) {
        const eligibleTasks = tasks
          .filter(t => {
            if (t.status === 'completed' || !t.date) return false;
            // Must have a scheduled timeSlot OR explicit reminder enabled
            if (!t.timeSlot && !t.isReminder) return false;
            const [y, m, d] = t.date.split('-').map(Number);
            if (!y) return false;
            const target = new Date(y, m - 1, d);
            const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const diffDays = Math.round((target.getTime() - todayMid.getTime()) / (24 * 60 * 60 * 1000));
            // 7-day rolling horizon for scheduled tasks
            return diffDays >= 0 && diffDays <= 7;
          })
          .sort((a, b) => {
            if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
            const pOrder: Record<string, number> = { P1: 1, high: 1, P2: 2, medium: 2, P3: 3, low: 3 };
            return (pOrder[a.priority] || 4) - (pOrder[b.priority] || 4);
          });

        let timedTaskCount = 0;
        for (const task of eligibleTasks) {
          const [year, month, day] = task.date!.split('-').map(Number);
          if (!year) continue;
          const base = new Date(year, month - 1, day);
          const parsedTime = parseTimeString(task.timeSlot);

          let effectiveHour: number | null = null;
          let effectiveMinute: number | null = null;

          if (parsedTime) {
            effectiveHour = parsedTime.hours;
            effectiveMinute = parsedTime.minutes;
          } else if (task.isReminder) {
            // Task has explicit reminder enabled without specific time slot
            const isToday = task.date === todayStr;
            if (isToday) {
              const defaultToday = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
              if (defaultToday.getTime() > now.getTime() + 5 * 60 * 1000) {
                effectiveHour = defaultTime.hours;
                effectiveMinute = defaultTime.minutes;
              } else {
                // Use deterministic upcoming slots so rapid reschedules do NOT push the reminder forward indefinitely
                const candidateSlots = [
                  { h: 10, m: 0 }, { h: 12, m: 0 }, { h: 14, m: 0 },
                  { h: 16, m: 0 }, { h: 18, m: 0 }, { h: 20, m: 0 }, { h: 21, m: 30 }
                ];
                const slot = candidateSlots.find(s => {
                  const d = dateAtHM(now, s.h, s.m);
                  return d.getTime() > now.getTime() + 5 * 60 * 1000;
                });
                if (slot) {
                  effectiveHour = slot.h;
                  effectiveMinute = slot.m;
                } else {
                  effectiveHour = 22;
                  effectiveMinute = 0;
                }
              }
            } else {
              effectiveHour = defaultTime.hours;
              effectiveMinute = defaultTime.minutes;
            }
          }

          if (effectiveHour !== null && effectiveMinute !== null) {
            // Generous budget: iOS caps at 64, Android supports up to 450
            if (timedTaskCount >= (Platform.OS === 'ios' ? 16 : 50)) continue;
            timedTaskCount++;

            base.setHours(effectiveHour, effectiveMinute, 0, 0);

            const tBuffer = new Date(base.getTime() - taskBufferMin * 60 * 1000);
            if (tBuffer > now && taskBufferMin >= 15) {
              enqueue(
                PRIORITY.HIGH,
                `Upcoming: ${task.title}`,
                getRandomMessage(TASK_BUFFER_POOLS(task.title, taskBufferMin)),
                tBuffer,
                { taskId: task.id, taskTitle: task.title },
                taskAlarmChannel,
                actionableNotifs ? 'task_reminder' : undefined
              );
            }

            // â”€â”€ 5 Minutes Before Alert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (task5MinAlert) {
              const t5 = new Date(base.getTime() - 5 * 60 * 1000);
              if (t5 > now) {
                enqueue(
                  PRIORITY.HIGH,
                  `5 minutes: ${task.title}`,
                  'Your task starts in 5 minutes. Finish up and get ready.',
                  t5,
                  { taskId: task.id, taskTitle: task.title },
                  taskAlarmChannel,
                  actionableNotifs ? 'task_reminder' : undefined
                );
              }
            }

            // â”€â”€ Exact Time Alert (Full Screen & Heads-Up) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (base > now) {
              const isUrgent = !!task.isReminder;
              enqueue(
                isUrgent ? PRIORITY.CRITICAL : PRIORITY.HIGH,
                isUrgent ? `⏰ REMINDER: ${task.title}` : task.title,
                isUrgent
                  ? `🚨 Urgent reminder: "${task.title}". Time to start!`
                  : `Scheduled task: ${task.timeSlot || 'Starting now'}. Tap to open or mark as done.`,
                base,
                { taskId: task.id, taskTitle: task.title, isReminder: isUrgent },
                isUrgent ? 'task_urgent_alarm_v1' : remindersChannel,
                actionableNotifs ? 'task_reminder' : undefined
              );
            }
          }
        }
      }

      // â”€â”€ 3b. Undated Tasks (Inbox â€” no due date set) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Tasks without a date are "inbox" tasks. Schedule a single nudge at the
      // next upcoming smart check-in slot so they're never silently ignored.
      if (modTasks) {
        const undatedTasks = tasks
          .filter(t => t.status !== 'completed' && !t.date)
          .slice(0, 5); // cap at 5 to avoid flooding the budget

        if (undatedTasks.length > 0) {
          const checkPoints = [
            { h: 10, m: 0 }, { h: 12, m: 0 }, { h: 14, m: 0 },
            { h: 16, m: 0 }, { h: 18, m: 0 }, { h: 20, m: 0 }, { h: 21, m: 30 },
          ];
          const upcomingSlot = checkPoints.find(s => {
            const d = dateAtHM(now, s.h, s.m);
            return d.getTime() > now.getTime() + 5 * 60 * 1000;
          });

          const nudgeTime = upcomingSlot
            ? dateAtHM(now, upcomingSlot.h, upcomingSlot.m)
            : dateAtHM(tomorrow, defaultTime.hours, defaultTime.minutes);

          const count = undatedTasks.length;
          const label = count === 1 ? `"${undatedTasks[0].title}"` : `${count} inbox tasks`;
          enqueue(
            PRIORITY.MEDIUM,
            'Task Inbox',
            `You have ${label} without a due date. Tap to schedule or complete.`,
            nudgeTime,
            { type: 'inbox_nudge' },
            'default',
            actionableNotifs ? 'task_reminder' : undefined
          );
        }
      }

      // â”€â”€ 4. Calendar Custom Events (Next 2 Days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      for (const event of customEvents.filter(e => e.date === todayStr || e.date === tomorrowStr)) {
        const [year, month, day] = event.date.split('-').map(Number);
        if (!year) continue;
        const base = new Date(year, month - 1, day);
        const t = parseTimeString(event.startTime);
        if (t) {
          base.setHours(t.hours, t.minutes, 0, 0);
          // Use user-configurable offset (default 60 min before event)
          const evTrigger = new Date(base.getTime() - calendarOffsetMin * 60 * 1000);
          if (evTrigger > now) {
            // Build human-readable offset label for the notification body
            const offsetLabel = calendarOffsetMin >= 60
              ? calendarOffsetMin === 60 ? '1 hour' : `${calendarOffsetMin / 60} hours`
              : `${calendarOffsetMin} min`;
            enqueue(
              PRIORITY.MEDIUM,
              `Upcoming Event: ${event.title}`,
              getRandomMessage(CALENDAR_EVENT_POOLS(event.title, event.startTime, offsetLabel)),
              evTrigger,
              { eventId: event.id },
              remindersChannel
            );
          }
        }
      }

      // â”€â”€ 5. Habit Streak at Risk (Midnight Protection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (habitStreakRisk && modHabits) {
        const hst = parseHM(habitStreakTimeStr);
        const trigger = dateAtHM(now, hst.hours, hst.minutes);
        if (trigger > now) {
          const unloggedHabits = allHabits.filter(h => {
            if (h.archived) return false;
            return !habitLogs.some(l => l.habitId === h.id && (l.date || '').slice(0, 10) === todayStr);
          });

          // Remind ALL unlogged habits (even streak 0 or 1) so starting habits get reinforced!
          const prioritizedHabits = unloggedHabits
            .filter(h => (h.streak || 0) >= 0)
            .sort((a, b) => (b.streak || 0) - (a.streak || 0))
            .slice(0, 5);

          for (const habit of prioritizedHabits) {
            const streakCount = habit.streak || 0;
            enqueue(
              PRIORITY.CRITICAL,
              'Habit Streak at Risk',
              getRandomMessage(HABIT_STREAK_RISK_POOLS(habit.name, streakCount)),
              trigger,
              { type: 'habit_streak', habitId: habit.id },
              saraEscalation ? 'sara_critical' : 'habits',
              actionableNotifs ? 'habit_reminder' : undefined
            );
          }
        }
      }

      // â”€â”€ 6. Per-Habit Daily Reminders (2-Day Rolling) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (modHabits && (allHabits?.length ?? 0) > 0) {
        const habitsWithReminders = allHabits.slice(0, 10);
        const notifKeys = habitsWithReminders.flatMap(h => [
          `@habit_notif_enabled_${h.id}`,
          `@habit_notif_time_${h.id}`,
        ]);
        const notifPairs = notifKeys.length > 0 ? await AsyncStorage.multiGet(notifKeys) : [];
        const notifKV: Record<string, string | null> = {};
        notifPairs.forEach(([k, v]) => { notifKV[k] = v; });

        for (const habit of habitsWithReminders) {
          const isEnabled = notifKV[`@habit_notif_enabled_${habit.id}`] === 'true';
          if (!isEnabled) continue;

          const timeStr = notifKV[`@habit_notif_time_${habit.id}`];
          let rH = 20, rM = 0;
          if (timeStr) {
            const [h, mm] = timeStr.split(':').map(Number);
            if (!isNaN(h) && !isNaN(mm)) { rH = h; rM = mm; }
          }

          for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
            const fireDate = new Date(now);
            fireDate.setDate(fireDate.getDate() + dayOffset);
            fireDate.setHours(rH, rM, 0, 0);
            if (fireDate <= now) continue;

            const fdDateStr = dayOffset === 0 ? todayStr : tomorrowStr;
            // FIX 7.5: Normalize date comparison so ISO or non-padded dates match properly
            const alreadyLogged = habitLogs.some(l => {
              if (l.habitId !== habit.id) return false;
              const lDate = (l.date || '').slice(0, 10);
              return lDate === fdDateStr;
            });
            if (alreadyLogged) continue;

            const streakVal = habit.streak ?? 0;
            let habitBody: string;
            if (streakVal >= 30) {
              habitBody = getRandomMessage(HABIT_DAILY_30_POOLS(habit.name, streakVal));
            } else if (streakVal >= 7) {
              habitBody = getRandomMessage(HABIT_DAILY_7_POOLS(habit.name, streakVal));
            } else if (streakVal >= 1) {
              habitBody = getRandomMessage(HABIT_DAILY_1_POOLS(habit.name, streakVal));
            } else {
              habitBody = getRandomMessage(HABIT_DAILY_0_POOLS(habit.name));
            }

            enqueue(
              PRIORITY.MEDIUM,
              habit.name,  // BUG-09 FIX: No emoji in title â€” emoji stays in-app only
              habitBody,
              fireDate,
              { type: 'habit_reminder', habitId: habit.id },
              'habits',
              actionableNotifs ? 'habit_reminder' : undefined
            );
          }
        }
      }

      // â”€â”€ 7. Assignment Deadlines (48h & 24h) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (modAssignments) {
        for (const asn of assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate)) {
          const [yA, mA, dA] = asn.dueDate.split('-').map(Number);
          if (!yA) continue;
          const dueDate = new Date(yA, mA - 1, dA);

          if (assignment48h) {
            const t48 = new Date(dueDate.getTime() - 48 * 60 * 60 * 1000);
            t48.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (t48 > now && (t48.getTime() - now.getTime()) <= 48 * 60 * 60 * 1000) {
              enqueue(
                PRIORITY.HIGH,
                `Deadline in 48h: ${asn.title}`,  // BUG-10 FIX: removed emoji 'â³'
                getRandomMessage(ASSIGNMENT_48H_POOLS(asn.title)),
                t48,
                { type: 'assignment_48h', asnId: asn.id }
              );
            }
          }

          if (assignment24h) {
            // FIX 7.8: Resilient 24h deadline trigger â€” if 8:00 AM has passed today, fire in 15min
            const dayBeforeDue = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
            let t24 = new Date(dayBeforeDue);
            t24.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (t24 <= now && dueDate.getTime() > now.getTime()) {
              t24 = new Date(now.getTime() + 15 * 60 * 1000);
            }
            if (t24 > now && t24 < dueDate) {
              enqueue(
                PRIORITY.CRITICAL,
                `Deadline Tomorrow: ${asn.title}`,
                getRandomMessage(ASSIGNMENT_24H_POOLS(asn.title)),
                t24,
                { type: 'assignment_24h', asnId: asn.id },
                'reminders'
              );
            }
          }
        }
      }

      // â”€â”€ 8. Attendance Low-Percentage Warnings (<75%) â€” CRITICAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (attendanceWarning && modAttendance) {
        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
          const targetDay = new Date(now);
          targetDay.setDate(targetDay.getDate() + dayOffset);

          for (const subj of attendance) {
            // Fix #9: Use per-subject target instead of hardcoded 75%.
            // Students with 80%/85% targets were never warned; students with
            // 65% targets got false alarms.
            const THRESHOLD = subj.targetPercentage || 75;
            const totalAtt = (subj.classesAttended || 0) + (subj.labsAttended || 0);
            const totalTotal = (subj.classesTotal || 0) + (subj.labsTotal || 0);
            if (!totalTotal) continue;
            const pct = (totalAtt / totalTotal) * 100;
            if (pct < THRESHOLD) {
              const trigger = dateAtHM(targetDay, defaultTime.hours, defaultTime.minutes);
              if (trigger > now) {
                const needed = Math.ceil((THRESHOLD / 100 * totalTotal - totalAtt) / (1 - THRESHOLD / 100));
                enqueue(
                  PRIORITY.CRITICAL,
                  `Attendance Warning: ${subj.name}`,
                  getRandomMessage(ATTENDANCE_CRITICAL_POOLS(subj.name, pct.toFixed(0), needed)),
                  trigger,
                  { type: 'attendance_warning', subjectId: subj.id },
                  saraEscalation ? 'sara_critical' : 'default'
                );
              }
            }
          }
        }
      }

      // â”€â”€ 9. Sunday Weekly Review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (weeklyReview) {
        const daysUntilSunday = (7 - now.getDay()) % 7;
        if (daysUntilSunday <= 1) {
          const sunDate = new Date(now);
          sunDate.setDate(sunDate.getDate() + daysUntilSunday);
          sunDate.setHours(20, 0, 0, 0);
          if (sunDate > now) {
            enqueue(
              PRIORITY.MEDIUM,
              'Weekly Review',
              getRandomMessage(WEEKLY_REVIEW_POOLS()),
              sunDate,
              { type: 'weekly_review' }
            );
          }
        }
      }

      // â”€â”€ 10. Gym & Academic Classes (2-Day Rolling) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dayOfWeek = targetDate.getDay();
        const dateStr = dayOffset === 0 ? todayStr : tomorrowStr;

        const planIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
        const plan = userGymPlan?.customDays?.[planIndex] || GYM_PLAN.find(p => p.dayIndex === planIndex);

        if (plan && !plan.isRest && gymNotifEnabled) {
          const hasLogged = gymLogs.some(g => g.date === dateStr);
          if (!hasLogged) {
            const exercises = plan.exercises || [];
            const exerciseCount = exercises.length;
            const top3Names = exercises.slice(0, 3).map(e => e.name).filter(Boolean);
            const exercisePreview = top3Names.length > 0 ? top3Names.join(', ') : undefined;
            const gymTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);
            if (gymTrigger > now) {
              enqueue(
                PRIORITY.MEDIUM,
                `Workout Reminder: ${plan.name}`,
                getRandomMessage(GYM_WORKOUT_POOLS(plan.name, exercisePreview, exerciseCount)),
                gymTrigger,
                { type: 'gym', planName: plan.name },
                'default',
                actionableNotifs ? 'gym_reminder' : undefined
              );
            }
          }
        } else if (gymRestDay && plan?.isRest && modGym) {
          // FIX: gymRestDay now defaults to true
          const restTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);
          if (restTrigger > now) {
            enqueue(
              PRIORITY.LOW,
              'Rest & Recovery Day',
              getRandomMessage(GYM_REST_DAY_POOLS()),
              restTrigger,
              { type: 'gym_rest' }
            );
          }
        }

        // Academic Classes & Labs
        // If this date is marked as a holiday, skip all class and lab scheduling for this day
        if (modAttendance && !normalizedHolidays.has(dateStr)) {
          interface DaySession {
            subject: string;
            subjectId: string;
            time: string;
            isLab: boolean;
            startMs: number;
            durationMinutes?: number;
            sessionIdx: number;
          }
          const daySessions: DaySession[] = [];

          const parseSessionTimes = (timeStr: string, isLab: boolean) => {
            const trimmed = (timeStr || '').trim();
            const parts = trimmed.split(/[-â€“â€”â€¢]| to /i).map(s => s.trim());
            const startParsed = parseTimeString(parts[0]);
            const startH = startParsed ? startParsed.hours : (isLab ? 14 : 9);
            const startM = startParsed ? startParsed.minutes : 0;
            let durationMinutes = isLab ? 120 : 60;

            if (parts.length > 1) {
              const endParsed = parseTimeString(parts[1]);
              if (endParsed) {
                let diff = (endParsed.hours * 60 + endParsed.minutes) - (startH * 60 + startM);
                if (diff < 0) diff += 24 * 60;
                if (diff >= 15 && diff <= 360) {
                  durationMinutes = diff;
                }
              }
            }
            return { startH, startM, durationMinutes };
          };

          attendance.forEach(subj => {
            const enabledRaw = kv[`@class_notif_enabled_${subj.id}`];
            if (enabledRaw === 'false') return;

            const sch =
              subj.schedule?.[dayOfWeek.toString()] ||
              subj.schedule?.[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]] ||
              subj.schedule?.[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek].toLowerCase()];
            if (!sch) return;

            const classes = (sch.classes || []) as any[];
            const labs = (sch.labs || []) as any[];
            const classCnt = (sch.classCount || 0) as number;
            const labCnt = (sch.labCount || 0) as number;

            if (classes.length > 0) {
              classes.forEach((c: any, cIdx: number) => {
                const { startH, startM, durationMinutes } = parseSessionTimes(c?.time ?? '', false);
                const startMs = dateAtHM(targetDate, startH, startM).getTime();
                daySessions.push({
                  subject: subj.name,
                  subjectId: subj.id!,
                  time: c?.time ?? '',
                  isLab: false,
                  startMs,
                  durationMinutes,
                  sessionIdx: cIdx,
                });
              });
            } else {
              for (let ci = 0; ci < classCnt; ci++) {
                daySessions.push({
                  subject: subj.name, subjectId: subj.id!, time: '', isLab: false,
                  startMs: dateAtHM(targetDate, 9, 0).getTime() + ci * 60 * 60 * 1000,
                  durationMinutes: 60,
                  sessionIdx: ci,
                });
              }
            }

            if (labs.length > 0) {
              labs.forEach((l: any, lIdx: number) => {
                const { startH, startM, durationMinutes } = parseSessionTimes(l?.time ?? '', true);
                const startMs = dateAtHM(targetDate, startH, startM).getTime();
                daySessions.push({
                  subject: `${subj.name} Lab`,
                  subjectId: subj.id!,
                  time: l?.time ?? '',
                  isLab: true,
                  startMs,
                  durationMinutes,
                  sessionIdx: lIdx,
                });
              });
            } else {
              for (let li = 0; li < labCnt; li++) {
                daySessions.push({
                  subject: `${subj.name} Lab`, subjectId: subj.id!, time: '', isLab: true,
                  startMs: dateAtHM(targetDate, 14, 0).getTime() + li * 2 * 60 * 60 * 1000,
                  durationMinutes: 120,
                  sessionIdx: li,
                });
              }
            }
          });

          daySessions.sort((a, b) => a.startMs - b.startMs);

          for (const sess of daySessions) {
            const sid = sess.subjectId;
            const subjectEnabled = kv[`@class_notif_enabled_${sid}`] !== 'false';
            if (!subjectEnabled) continue;

            const subj = attendance.find(s => s.id === sid);

            // Check if this class or lab session has ALREADY been marked (attended, missed, or cancelled)
            const sessionLog = attendanceLogs.find(l => {
              const matchSubj = l.subjectId === sid || (subj?.name && (l.subjectName === subj.name || l.subjectId === subj.name));
              if (!matchSubj) return false;

              const logDate = (l.date || '').slice(0, 10);
              if (logDate !== dateStr) return false;

              const matchType = sess.isLab ? l.type === 'lab' : (l.type === 'class' || !l.type);
              if (!matchType) return false;

              if (l.isExtra) return false;

              if (typeof l.idx === 'number') {
                return l.idx === sess.sessionIdx;
              }
              const sessionsOfSameType = daySessions.filter(s => s.subjectId === sid && s.isLab === sess.isLab);
              return sess.sessionIdx === 0 || sessionsOfSameType.length === 1;
            });

            // If this session has already been logged (cancelled, missed/absent, or attended/present),
            // completely suppress all notifications for this slot (upcoming 60m/30m, checkpoint, post-class).
            if (sessionLog) {
              continue;
            }

            // Bunk safety status calculation for subject
            let bunkStatusText = '';
            if (subj) {
              const totalAtt = (subj.classesAttended || 0) + (subj.labsAttended || 0);
              const totalCls = (subj.classesTotal || 0) + (subj.labsTotal || 0);
              const targetPct = subj.targetPercentage || 75;
              if (totalCls > 0) {
                const currentPct = Math.round((totalAtt / totalCls) * 100);
                const math = calculateBunkMath(totalAtt, totalCls, targetPct);
                if (math.status === 'safe' && math.count > 0) {
                  bunkStatusText = `Attendance: ${currentPct}% (${math.count} safe bunk${math.count !== 1 ? 's' : ''} available).`;
                } else if (math.status === 'warning') {
                  bunkStatusText = `Attendance: ${currentPct}% (on the edge, attend today).`;
                } else if (math.status === 'critical') {
                  bunkStatusText = `Attendance: ${currentPct}% (need next ${math.count} class${math.count !== 1 ? 'es' : ''} for ${targetPct}%).`;
                }
              }
            }

            const preRaw = kv[`@class_notif_pre_offsets_${sid}`];
            let preOffsets = [-30];
            if (preRaw) {
              try {
                const parsed = JSON.parse(preRaw);
                if (Array.isArray(parsed) && parsed.length > 0) preOffsets = parsed;
              } catch {}
            }

            for (const offsetMin of preOffsets) {
              const triggerMs = sess.startMs + offsetMin * 60 * 1000;
              if (triggerMs > now.getTime()) {
                const offsetLabel = `${Math.abs(offsetMin)}m`;
                enqueue(
                  PRIORITY.HIGH,
                  `Upcoming: ${sess.subject} (${offsetLabel})`,
                  getRandomMessage(CLASS_PRE_POOLS(sess.subject, sess.time, offsetLabel, bunkStatusText)),
                  new Date(triggerMs),
                  { type: 'class_pre', subject: sess.subject, subjectId: sid, isLab: sess.isLab, date: dateStr, sessionIdx: sess.sessionIdx },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            }

            const logDelay = parseInt(kv[`@class_notif_log_delay_${sid}`] || '0', 10);
            const durationMs = (sess.durationMinutes ?? (sess.isLab ? 120 : 60)) * 60 * 1000;
            const endTriggerMs = sess.startMs + durationMs + logDelay * 60 * 1000;
            const alreadyLogged = attendanceLogs.some(
              l =>
                (l.subjectId === sid || (subj?.name && (l.subjectName === subj.name || l.subjectId === subj.name))) &&
                (l.date || '').slice(0, 10) === dateStr &&
                (sess.isLab ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
                !l.isExtra &&
                (typeof l.idx === 'number' ? l.idx === sess.sessionIdx : true)
            );

            if (!sess.isLab) {
              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                enqueue(
                  PRIORITY.HIGH,
                  `Class Ended: ${sess.subject}`,
                  getRandomMessage(POST_CLASS_LOG_POOLS(sess.subject)),
                  new Date(endTriggerMs),
                  { type: 'class_log', subject: sess.subject, subjectId: sid, isLab: false, date: dateStr, sessionIdx: sess.sessionIdx },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            } else {
              const midEnabled = kv[`@class_notif_lab_mid_${sid}`] !== 'false';
              const midTriggerMs = sess.startMs + 60 * 60 * 1000;
              if (midEnabled && midTriggerMs > now.getTime()) {
                enqueue(
                  PRIORITY.HIGH,
                  `Lab Checkpoint: ${sess.subject}`,
                  getRandomMessage(LAB_MID_POOLS(sess.subject)),
                  new Date(midTriggerMs),
                  { type: 'lab_mid', subject: sess.subject, subjectId: sid, isLab: true, date: dateStr, sessionIdx: sess.sessionIdx },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }

              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                enqueue(
                  PRIORITY.HIGH,
                  `Lab Completed: ${sess.subject}`,
                  getRandomMessage(POST_LAB_LOG_POOLS(sess.subject)),
                  new Date(endTriggerMs),
                  { type: 'lab_log', subject: sess.subject, subjectId: sid, isLab: true, date: dateStr, sessionIdx: sess.sessionIdx },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            }
          }
        }
      }

      // â”€â”€ 11. Inactivity Nudge (3+ Days Inactive) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (inactivityNudge) {
        const thresholdDate = new Date(now);
        thresholdDate.setDate(thresholdDate.getDate() - inactivityDays);
        const thresholdStr = formatLocalDateStr(thresholdDate);

        const recentTask = tasks.find(t => t.completedAt && t.completedAt >= thresholdStr);
        const recentHabit = habitLogs.find(l => l.date >= thresholdStr);
        const recentGym = gymLogs.find(g => g.date >= thresholdStr);

        if (!recentTask && !recentHabit && !recentGym) {
          const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
          if (trigger > now) {
            enqueue(
              PRIORITY.LOW,
              'ZenTrack Check-in',
              getRandomMessage(INACTIVITY_POOLS(inactivityDays)),
              trigger,
              { type: 'inactivity' }
            );
          }
        }
      }

      // â”€â”€ 12. Sleep Reminders (Night Wind-Down & Morning Recovery) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const sleepRemindersEnabled = kv['@zentrack_sleep_reminders_enabled'] === 'true';
      if (sleepRemindersEnabled) {
        const nightTime = parseHM(kv['@zentrack_sleep_reminder_night'] || '22:30');
        const morningTime = parseHM(kv['@zentrack_sleep_reminder_morning'] || '07:00');

        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
          const targetDay = new Date(now);
          targetDay.setDate(targetDay.getDate() + dayOffset);
          const dtStr = dayOffset === 0 ? todayStr : tomorrowStr;

          const nightTrigger = dateAtHM(targetDay, nightTime.hours, nightTime.minutes);
          const morningTrigger = dateAtHM(targetDay, morningTime.hours, morningTime.minutes);

          const hasLoggedSleep = sleepLogs.some(s => s.date === dtStr);
          if (!hasLoggedSleep && nightTrigger > now) {
            enqueue(
              PRIORITY.LOW,
              'Time to Wind Down',
              getRandomMessage(SLEEP_NIGHT_POOLS()),
              nightTrigger,
              { type: 'sleep_night' }
            );
          }

          if (morningTrigger > now) {
            enqueue(
              PRIORITY.LOW,
              'Good Morning',
              getRandomMessage(SLEEP_MORNING_POOLS()),
              morningTrigger,
              { type: 'sleep_morning' }
            );
          }
        }
      }

      // ── 13. Hydration Checks (7-Day Rolling) ─────────────────────────
      const rawWaterFreq = kv['@zentrack_water_reminder_freq'];
      const waterReminderFreq =
        rawWaterFreq === null || rawWaterFreq === undefined
          ? 2
          : parseFloat(rawWaterFreq);

      const waterGoalMl = parseInt(kv['zentrack_water_goal_ml'] || '3800', 10) || 3800;
      const todayWaterLogs = (waterLogs || []).filter(
        w => (w.date || '').slice(0, 10) === todayStr
      );
      const todayWaterMl = todayWaterLogs.reduce((sum, w) => sum + (w.amountMl || 0), 0);
      const lastDrinkTs = todayWaterLogs.reduce((max, w) => Math.max(max, w.timestamp || 0), 0);
      const waterGoalMet = todayWaterMl >= waterGoalMl;

      if (waterReminderFreq > 0 && !isNaN(waterReminderFreq)) {
        const intervalMs = Math.round(waterReminderFreq * 60 * 60 * 1000);
        // Active hydration window: 08:00 AM (or quietEnd) to 21:30 / 9:30 PM Night Taper (or quietStart - 30m)
        const wakeMins = quietHoursEnabled ? Math.max(8 * 60, quietEnd.hours * 60 + quietEnd.minutes) : 8 * 60;
        const cutoffMins = quietHoursEnabled ? Math.min(21 * 60 + 30, quietStart.hours * 60 + quietStart.minutes - 30) : 21 * 60 + 30;

        const loggedL = (todayWaterMl / 1000).toFixed(1);
        const remainingL = (Math.max(0, waterGoalMl - todayWaterMl) / 1000).toFixed(1);
        const goalL = (waterGoalMl / 1000).toFixed(1);
        const lastWaterNotifTs = parseInt(kv['@zentrack_last_water_notif_ts'] || '0', 10);

        for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
          if (dayOffset === 0 && waterGoalMet) continue;

          const baseDay = new Date(now);
          baseDay.setDate(now.getDate() + dayOffset);
          const baseDayStr = formatLocalDateStr(baseDay);

          // Day 0 with a logged drink today: anchor directly to `lastDrinkTs` so reminders fire every N hours after drinking!
          // Day 0 with NO drink yet (or future days 1..6): anchor deterministically to 07:00 AM so opening the app never shifts the schedule!
          const dayBaselineMs = dateAtHM(baseDay, 7, 0).getTime();
          const anchorMs = dayOffset === 0 && lastDrinkTs > dayBaselineMs ? lastDrinkTs : dayBaselineMs;

          for (let nextMs = anchorMs + intervalMs; ; nextMs += intervalMs) {
            const waterTrigger = new Date(nextMs);
            if (formatLocalDateStr(waterTrigger) !== baseDayStr) break;

            const triggerMins = waterTrigger.getHours() * 60 + waterTrigger.getMinutes();
            if (triggerMins > cutoffMins) break; // Hard stop at 9:30 PM Night Taper (never fires at 11:00 PM)
            if (triggerMins < wakeMins) continue; // Skip anything before 8:00 AM / quietEnd

            // Must be at least 15 minutes in the future (prevents re-scheduling a slot that just fired or is firing now e.g. at :58 for :00)
            if (waterTrigger.getTime() <= now.getTime() + 15 * 60 * 1000) continue;

            // If a water reminder was already delivered recently (within 45 minutes), skip any reminder in this slot
            if (dayOffset === 0 && lastWaterNotifTs > 0 && Math.abs(waterTrigger.getTime() - lastWaterNotifTs) < 45 * 60 * 1000) {
              continue;
            }

            const title = getRandomMessage(WATER_TITLES_POOL);
            const body =
              dayOffset === 0 && todayWaterMl > 0
                ? getRandomMessage(WATER_PROGRESS_POOLS(loggedL, remainingL, goalL))
                : getRandomMessage(WATER_EMPTY_POOLS());

            // slotKey encodes day offset + trigger hour:minute so the notifId is deterministic
            // across rescheduling runs. This prevents Android AlarmManager from treating a
            // rescheduled 15:00 slot and a zombie 14:58 slot as two separate PendingIntents.
            const slotKey = `d${dayOffset}_h${waterTrigger.getHours()}_m${waterTrigger.getMinutes()}`;
            enqueue(
              dayOffset === 0 ? PRIORITY.MEDIUM : PRIORITY.LOW,
              title,
              body,
              waterTrigger,
              { type: 'water_reminder', screen: 'WellbeingDashboard', slotKey },
              'wellness'
            );
          }
        }
      }


      // â”€â”€ 14. Flashcard Spaced Repetition Due Review Nudge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const dueCards = (flashcards || []).filter(f => f.nextReviewDate && f.nextReviewDate <= todayStr);
      if (dueCards.length > 0) {
        const reviewTrigger = dateAtHM(now, 19, 0); // 7:00 PM
        if (reviewTrigger.getTime() > now.getTime() + 15 * 60 * 1000) {
          enqueue(
            PRIORITY.LOW,
            'Flashcards Due for Review',
            `You have ${dueCards.length} cards scheduled for active recall today. Strengthen your retention.`,
            reviewTrigger,
            { type: 'flashcard_review' }
          );
        }
      }

      // â”€â”€ Flush Priority Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Sort: ascending priority (1=Critical first), then ascending trigger time.
      // Critical notifications always win the budget race.
      // On iOS (cap=64): low-priority items are dropped before any high-priority one is.
      // On Android (cap=450): virtually all notifications fit; sorted order still applies.
      // â”€â”€ Flush Priority Queue in Concurrent Chunks of 6 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Sort: ascending priority (1=Critical first), then ascending trigger time.
      pendingQueue.sort((a, b) => a.priority - b.priority || a.trigger.getTime() - b.trigger.getTime());

      // Summarize what's in the queue for diagnostics
      const queueSummary: Record<string, number> = {};
      pendingQueue.forEach(n => {
        const t = n.data?.type || n.channel || 'other';
        queueSummary[t] = (queueSummary[t] || 0) + 1;
      });
      console.log(`[Notifications] pendingQueue: ${pendingQueue.length} items â†’`, JSON.stringify(queueSummary));
      // Save queue summary to AsyncStorage so diagnostics can read it
      AsyncStorage.setItem('@zentrack_last_notif_queue_summary', JSON.stringify({
        ts: Date.now(),
        total: pendingQueue.length,
        byType: queueSummary,
        taskCount: tasks.length,
        habitCount: allHabits.length,
        attendanceCount: attendance.length,
        morningBriefEnabled: boolVal('morning_brief'),
        modTasks: boolVal('mod_tasks'),
        modHabits: boolVal('mod_habits'),
        modGym: boolVal('mod_gym'),
        modAttendance: boolVal('mod_attendance'),
      })).catch(() => {});

      interface ScheduledItem {
        keyId: string;
        triggerMs: number;
      }
      const scheduledItems: ScheduledItem[] = [];
      let scheduledCount = 0;
      let droppedCount = 0;

      interface PreparedNotif {
        identifier?: string;
        title: string;
        body: string;
        data?: any;
        categoryId?: string;
        channel: string;
        notifPriority: any;
        triggerConfig: any;
      }

      const preparedList: PreparedNotif[] = [];

      for (const notif of pendingQueue) {
        if (preparedList.length >= ALARM_CAP) {
          droppedCount++;
          continue;
        }

        let finalTrigger = notif.trigger;

        // Quiet hours: sara_critical and reminders always ignore, others are deferred to quiet end
        if (isQuiet(finalTrigger) && notif.channel !== 'sara_critical' && notif.channel !== 'reminders') {
          // NEVER clamp water reminders to 07:00 AM — drop them if they fall in quiet hours
          if (notif.channel === 'wellness' || notif.data?.type === 'WATER_REMINDER' || notif.data?.type === 'water_reminder') {
            continue;
          }
          const catchUp = new Date(finalTrigger);
          catchUp.setHours(quietEnd.hours, quietEnd.minutes, 0, 0);
          if (catchUp <= now) catchUp.setDate(catchUp.getDate() + 1);
          finalTrigger = catchUp;
        }

        // Weekend mode: only reminders, critical, and wellness hydration pass through
        if (weekendMode && isWeekend && notif.channel !== 'reminders' && notif.channel !== 'sara_critical' && notif.channel !== 'wellness') {
          continue;
        }

        // Continuous Sliding-Window Deduplication:
        // Use true temporal distance rather than discrete bucket division so :58 and :00
        // (which cross integer bucket boundaries) are reliably identified as duplicates.
        const keyId = notif.data?.taskId
          || (notif.data?.subjectId ? `class_${notif.data.subjectId}_${notif.data.sessionIdx ?? 0}` : undefined)
          || notif.data?.habitId
          || notif.data?.type
          || `${notif.channel}_${notif.title}`;

        const candidateMs = finalTrigger.getTime();

        // Water reminders must be separated by at least 45 minutes.
        // Other reminder types must be separated by at least 10 minutes.
        const minGapMs = (keyId === 'water_reminder' || notif.channel === 'wellness')
          ? 45 * 60 * 1000
          : 10 * 60 * 1000;

        const isDuplicate = scheduledItems.some(
          item => item.keyId === keyId && Math.abs(item.triggerMs - candidateMs) < minGapMs
        );
        if (isDuplicate) {
          continue;
        }
        scheduledItems.push({ keyId, triggerMs: candidateMs });

        const delaySeconds = Math.max(3, Math.round((finalTrigger.getTime() - Date.now()) / 1000));
        const notifPriority = (notif.channel === 'reminders' || notif.channel === 'sara_critical' || notif.channel === 'wellness' || notif.channel === 'task_alarm')
          ? (Notifications.AndroidNotificationPriority?.MAX ?? ('max' as any))
          : (Notifications.AndroidNotificationPriority?.HIGH ?? ('high' as any));

        // Use DATE trigger on both platforms for future-dated notifications.
        // Android TIME_INTERVAL with large values (hours) is silently dropped by battery
        // optimization on Android 12+. DATE type uses AlarmManager.setExactAndAllowWhileIdle
        // which correctly fires even for multi-hour delays.
        const targetFireTime = new Date(Math.max(finalTrigger.getTime(), Date.now() + 3000));
        const triggerConfig: any = Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: targetFireTime,
              channelId: notif.channel,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: targetFireTime,
            };

        // Deterministic, timestamp-free slot IDs for ALL 14 notification types.
        // A Unix-second suffix is unique per scheduling run — AlarmManager creates a NEW
        // PendingIntent instead of overwriting the existing one, causing zombie double-fires.
        // Entity + date + slot-type IDs are stable across reschedules for the same logical alarm.
        const fireDateKey = formatLocalDateStr(targetFireTime);
        const fireHM = `${targetFireTime.getHours()}_${targetFireTime.getMinutes()}`;
        let notifId: string;

        if (notif.data?.taskId) {
          // Distinguish buffer / 5-min / exact alarms for the same task on the same day.
          const subType = notif.title.startsWith('Upcoming:') ? 'buf'
            : notif.title.startsWith('5 minutes:') ? '5m'
            : 'exact';
          notifId = `task_${notif.data.taskId}_${subType}_${fireDateKey}`;
        } else if (notif.data?.habitId) {
          const hType = notif.data?.type === 'habit_streak' ? 'risk' : 'daily';
          notifId = `habit_${notif.data.habitId}_${hType}_${fireDateKey}`;
        } else if (notif.data?.subjectId) {
          const sIdx = typeof notif.data.sessionIdx === 'number' ? notif.data.sessionIdx : 0;
          const cType = notif.data.type || 'class';
          notifId = `class_${notif.data.subjectId}_${sIdx}_${cType}_${fireDateKey}_${fireHM}`;
        } else if (notif.data?.eventId) {
          notifId = `event_${notif.data.eventId}_${fireDateKey}`;
        } else if (notif.data?.asnId) {
          notifId = `asn_${notif.data.asnId}_${notif.data.type}_${fireDateKey}`;
        } else if (notif.data?.type === 'water_reminder') {
          notifId = notif.data?.slotKey
            ? `water_${notif.data.slotKey}`
            : `water_${fireDateKey}_h${targetFireTime.getHours()}_m${targetFireTime.getMinutes()}`;
        } else if (notif.data?.type === 'morning_brief') {
          notifId = `brief_${notif.data?.date || fireDateKey}`;
        } else if (notif.data?.type === 'gym' || notif.data?.type === 'gym_rest') {
          notifId = `gym_${notif.data.type}_${fireDateKey}`;
        } else if (notif.data?.type) {
          // All other typed system notifications (overdue_nudge, attendance_warning, sleep, etc.)
          notifId = `sys_${notif.data.type}_${fireDateKey}_${fireHM}`;
        } else {
          // Catch-all: channel + date + slot time (inbox_nudge, weekly_review, inactivity, etc.)
          notifId = `gen_${notif.channel}_${fireDateKey}_${fireHM}`;
        }

        preparedList.push({
          identifier: notifId,
          title: notif.title,
          body: notif.body,
          // CRITICAL: On Android, omit `data` to prevent `java.io.NotSerializableException: org.json.JSONObject`.
          // Android native AlarmManager serialization throws when `content.data` is an object.
          // Entity IDs (taskId, habitId, subjectId) are encoded in `identifier` above instead.
          data: Platform.OS === 'ios' ? notif.data : undefined,
          categoryId: notif.categoryId,
          channel: notif.channel,
          notifPriority,
          triggerConfig,
        });
      }

      // Schedule in concurrent batches of 6 with event loop yields between batches
      const CHUNK_SIZE = 6;
      for (let i = 0; i < preparedList.length; i += CHUNK_SIZE) {
        const chunk = preparedList.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (item) => {
            try {
              await Notifications.scheduleNotificationAsync({
                ...(item.identifier ? { identifier: item.identifier } : {}),
                content: {
                  title: item.title,
                  body: item.body,
                  data: item.data,
                  categoryIdentifier: item.categoryId,
                  channelId: item.channel,
                  ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
                  priority: item.notifPriority,
                } as any,
                trigger: item.triggerConfig,
              });
              scheduledCount++;
            } catch (e: any) {
              // Capture FIRST error only so it isn't overwritten by subsequent failures
              if (!_lastScheduleError) {
                _lastScheduleError = e?.message || String(e);
              }
              console.warn('[Notifications] Failed to schedule notification:', item.title, e);
            }
          })
        );
        // Yield to JS event loop so UI / touch / animation events process with 0 lag
        if (i + CHUNK_SIZE < preparedList.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (droppedCount > 0) {
        console.warn(`[Notifications] Budget hit: ${droppedCount} low-priority notifications dropped (${Platform.OS} cap=${ALARM_CAP}).`);
      }
      console.log(`[Notifications] Schedule Complete: ${scheduledCount}/${ALARM_CAP} alarms set (${Platform.OS}) âœ…`);
      _lastScheduledCount = scheduledCount;
      if (scheduledCount > 0 || pendingQueue.length === 0) {
        _lastScheduleFingerprint = fingerprint;
        _lastScheduleError = null;
        AsyncStorage.setItem(NOTIF_FINGERPRINT_KEY, fingerprint).catch(() => {});
        updateL1Cache('notifFingerprint', fingerprint);
        // Push to Firestore so the other device (tablet/phone) picks up the same
        // fingerprint on its next run and reschedules at identical absolute times.
        const uid = auth.currentUser?.uid;
        if (uid) _pushFingerprintToFirestore(uid, fingerprint);
      } else if (pendingQueue.length > 0) {
        console.warn(`[Notifications] 0 of ${pendingQueue.length} notifications scheduled! Last error: ${_lastScheduleError}`);
      }
}

// â”€â”€ Hydration Milestone Trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function checkAndTriggerWaterMilestones(
  previousTotalMl: number,
  newTotalMl: number,
  targetMl: number
): Promise<void> {
  if (targetMl <= 0 || newTotalMl <= 0) return;
  const todayStr = formatLocalDateStr(new Date());
  const milestoneKey = `@zentrack_water_milestones_${todayStr}`;

  let passedMilestones: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(milestoneKey);
    if (raw) passedMilestones = JSON.parse(raw);
  } catch {}

  const p50 = 0.5 * targetMl;
  const p75 = 0.75 * targetMl;
  const p100 = 1.0 * targetMl;

  let milestoneToTrigger: '50' | '75' | '100' | null = null;

  if (previousTotalMl < p100 && newTotalMl >= p100 && !passedMilestones.includes('100')) {
    milestoneToTrigger = '100';
  } else if (previousTotalMl < p75 && newTotalMl >= p75 && !passedMilestones.includes('75')) {
    milestoneToTrigger = '75';
  } else if (previousTotalMl < p50 && newTotalMl >= p50 && !passedMilestones.includes('50')) {
    milestoneToTrigger = '50';
  }

  if (!milestoneToTrigger) return;

  passedMilestones.push(milestoneToTrigger);
  await AsyncStorage.setItem(milestoneKey, JSON.stringify(passedMilestones));

  const loggedL = (newTotalMl / 1000).toFixed(1);
  const targetL = (targetMl / 1000).toFixed(1);

  let title = 'Hydration Milestone';
  let body = '';

  if (milestoneToTrigger === '50') {
    title = 'Hydration: 50% Reached';
    body = getRandomMessage(WATER_MILESTONE_50_POOLS(loggedL, targetL));
  } else if (milestoneToTrigger === '75') {
    title = 'Hydration: 75% Reached';
    body = getRandomMessage(WATER_MILESTONE_75_POOLS(loggedL, targetL));
  } else if (milestoneToTrigger === '100') {
    title = 'Hydration: Goal Completed';
    body = getRandomMessage(WATER_MILESTONE_100_POOLS(loggedL));
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        channelId: 'wellness',
        ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
        priority: Notifications.AndroidNotificationPriority?.HIGH ?? ('high' as any),
      } as any,
      trigger: null,
    });
  } catch (err) {
    console.warn('[Notifications] Failed to trigger water milestone notification:', err);
  }
}

// â”€â”€ Test Notification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function sendTestNotification(userName?: string) {
  const name = userName ? userName.split(' ')[0] : 'there';
  const bodies = [
    `Notifications are functioning properly for your account, ${name}.`,
    'ZenTrack notification engine is active and ready.',
    `System check complete, ${name}. All channels are verified.`,
  ];
  const body = bodies[Math.floor(Math.random() * bodies.length)];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'ZenTrack System Check',
      body,
      channelId: 'reminders',
      ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
      priority: Notifications.AndroidNotificationPriority?.MAX ?? ('max' as any),
      vibrate: [0, 500, 250, 500],
    } as any,
    trigger: null,
  });
}

// â”€â”€ Notification Diagnostic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Runs each step of the pipeline independently and returns a report.
// Call this from the settings screen to pinpoint exactly why scheduling fails.
export async function runNotificationDiagnostic(): Promise<string> {
  const lines: string[] = [];
  const ok = 'âœ…';
  const fail = 'âŒ';
  const warn = 'âš ï¸';

  try {
    // 1. Permission
    const { status, granted, canAskAgain } = await Notifications.getPermissionsAsync();
    lines.push(`${status === 'granted' ? ok : fail} Permission: ${status} (granted=${granted}, canAskAgain=${canAskAgain})`);

    // 2. SchedulableTriggerInputTypes & Priority enums
    const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
    const prioMax = Notifications.AndroidNotificationPriority?.MAX ?? 'max';
    const hasDateEnum = typeof (Notifications as any).SchedulableTriggerInputTypes?.DATE !== 'undefined';
    const hasPrioEnum = typeof (Notifications as any).AndroidNotificationPriority?.MAX !== 'undefined';
    lines.push(`${hasDateEnum ? ok : warn} SchedulableTriggerInputTypes.DATE: ${dateType}`);
    lines.push(`${hasPrioEnum ? ok : warn} AndroidNotificationPriority.MAX: ${prioMax}`);

    // 3. Android Channels
    if (Platform.OS === 'android') {
      try {
        await ensureNotificationChannels();
        const channels = await Notifications.getNotificationChannelsAsync();
        const ids = (channels || []).map(c => c.id);
        lines.push(`${channels.length >= 5 ? ok : warn} Notification Channels (${channels.length}): ${ids.join(', ')}`);
      } catch (ce: any) {
        lines.push(`${fail} Channels Error: ${ce?.message}`);
      }
    }

    // 4. Inspect existing scheduled alarms without cancelling them
    try {
      const scheduledBefore = await Notifications.getAllScheduledNotificationsAsync();
      lines.push(`${ok} Existing Active Alarms: ${scheduledBefore.length} alarm(s) queued in OS`);
    } catch (e: any) {
      lines.push(`${fail} Inspect Existing Alarms: ${e?.message}`);
    }

    // 5. Try scheduling a test notification 30s from now using DATE trigger (same as real scheduler)
    const testDate = new Date(Date.now() + 30000);
    let scheduleError: string | null = null;
    let scheduledId: string | null = null;
    try {
      const triggerConfig: any = Platform.OS === 'android'
        ? {
            type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
            date: testDate,
            channelId: 'reminders',
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
            date: testDate,
          };

      scheduledId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'ðŸ”¬ Diagnostic Test',
          body: 'If you see this, OS alarms are active.',
          channelId: 'reminders',
          ...(Platform.OS === 'ios' ? { sound: 'default' } : {}),
          priority: Notifications.AndroidNotificationPriority?.MAX ?? ('max' as any),
        } as any,
        trigger: triggerConfig,
      });
      lines.push(`${ok} Test Alarm Scheduled (+30s DATE): OK (id: ${scheduledId?.slice(0, 8)})`);
    } catch (e: any) {
      scheduleError = e?.message || String(e);
      lines.push(`${fail} Test Alarm Scheduled (+10s): ${scheduleError}`);
    }

    // 6. Read back
    await new Promise(r => setTimeout(r, 600));
    let scheduled = await Notifications.getAllScheduledNotificationsAsync();
    lines.push(`${scheduled.length > 0 ? ok : fail} getAllScheduledNotificationsAsync: ${scheduled.length} alarm(s) in OS queue`);
    if (scheduledId) {
      await Notifications.cancelScheduledNotificationAsync(scheduledId).catch(() => {});
    }

    // 7. Long-range DATE probe (1h) â€” representative of real multi-hour notifications
    if (Platform.OS === 'android') {
      try {
        const longDate = new Date(Date.now() + 60 * 60 * 1000);
        const longTestId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'ðŸ”¬ Long-Range Probe',
            body: 'Testing 1h DATE trigger (representative of real alarms)',
            channelId: 'reminders',
          } as any,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
            date: longDate,
            channelId: 'reminders',
          } as any,
        });
        lines.push(`${ok} Long-Range DATE Trigger (1h): OK (id: ${longTestId?.slice(0, 8)})`);
        await Notifications.cancelScheduledNotificationAsync(longTestId).catch(() => {});
      } catch (de: any) {
        lines.push(`${warn} Long-Range DATE Trigger (1h) FAILED: ${de?.message || String(de)}`);
      }
    }

    // 8. AsyncStorage prefs check
    const freq = await AsyncStorage.getItem('@zentrack_water_reminder_freq');
    const modTasks = await AsyncStorage.getItem('zentrack_notif_mod_tasks');
    const modGym = await AsyncStorage.getItem('zentrack_notif_mod_gym');
    lines.push(`â„¹ï¸ Prefs: waterFreq="${freq ?? '0'}", modTasks="${modTasks ?? 'true'}", modGym="${modGym ?? 'true'}"`);
    lines.push(`â„¹ï¸ Last Schedule: ${_lastScheduledCount} alarm(s) set, error="${_lastScheduleError ?? 'none'}"`);
    lines.push(`â„¹ï¸ Cache cleared â€” next app tick will force full reschedule.`);

    // 8b. Queue summary from last real scheduling run
    try {
      const qsRaw = await AsyncStorage.getItem('@zentrack_last_notif_queue_summary');
      if (qsRaw) {
        const qs = JSON.parse(qsRaw);
        const age = Math.round((Date.now() - qs.ts) / 1000);
        lines.push(`â„¹ï¸ Last queue (${age}s ago): ${qs.total} items | tasks=${qs.taskCount}, habits=${qs.habitCount}, attendance=${qs.attendanceCount}`);
        lines.push(`â„¹ï¸ Modules: tasks=${qs.modTasks}, habits=${qs.modHabits}, gym=${qs.modGym}, attend=${qs.modAttendance}, brief=${qs.morningBriefEnabled}`);
        if (qs.total === 0) {
          lines.push(`âš ï¸ Queue was 0 â€” all triggers were in the past OR per-habit notifications are not enabled individually (check each habitâ€™s reminder settings).`);
        } else {
          lines.push(`â„¹ï¸ Types: ${Object.entries(qs.byType).map(([k,v]) => `${k}:${v}`).join(', ')}`);
        }
      }
    } catch {}

    // 9. Summary
    lines.push('');
    if (status !== 'granted') {
      lines.push('RESULT: Notifications are BLOCKED by system. Enable in phone Settings.');
    } else if (scheduleError) {
      lines.push(`RESULT: Schedule error: ${scheduleError}`);
    } else if (scheduled.length > 0) {
      lines.push('RESULT: Notification engine is healthy! Alarms are successfully queuing into the OS.');
    } else {
      lines.push('RESULT: OS alarm queue rejected/dropped the alarm.');
    }
  } catch (outer: any) {
    lines.push(`${fail} DIAGNOSTIC CRASHED: ${outer?.message}`);
  }

  return lines.join('\n');
}



// â”€â”€ Immediate / Direct Task Reminder Scheduler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function scheduleSingleTaskReminder(task: Task) {
  // Cancel all identifier variants so stale alarms never accumulate when the task time changes.
  // The `task_${id}_exact_${dateStr}` form MUST match what scheduleAllNotifications() writes above,
  // so that whichever runs second simply overwrites the PendingIntent rather than duplicating it.
  const dateStr = task.date || formatLocalDateStr(new Date());
  if (task.id) {
    await Promise.all([
      Notifications.cancelScheduledNotificationAsync(`task_${task.id}`).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(`task_${task.id}_exact_${dateStr}`).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(`task_${task.id}_buf_${dateStr}`).catch(() => {}),
      Notifications.cancelScheduledNotificationAsync(`task_${task.id}_5m_${dateStr}`).catch(() => {}),
    ]);
  }
  if (!task.title || task.status === 'completed') return;
  const parsedTime = parseTimeString(task.timeSlot);
  if (!parsedTime && !task.isReminder) return;

  const now = new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year) return;

  const targetDate = new Date(year, month - 1, day);
  if (parsedTime) {
    targetDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  } else {
    const isToday = dateStr === formatLocalDateStr(now);
    if (isToday) {
      targetDate.setTime(now.getTime() + 30 * 60 * 1000);
    } else {
      targetDate.setHours(9, 0, 0, 0);
    }
  }

  // Apply the same 150-second guard as enqueue() — if the slot is within 2.5 minutes it is
  // already in-flight inside AlarmManager and scheduling again would create a duplicate.
  if (targetDate.getTime() <= now.getTime() + 150 * 1000) {
    console.log(`[Notifications] Skipping near-future/past task reminder for "${task.title}" at ${targetDate.toLocaleTimeString()}`);
    return;
  }

  try {
    const isUrgent = !!task.isReminder;
    const targetChannel = isUrgent ? 'task_urgent_alarm_v1' : 'reminders';
    const triggerConfig: any = Platform.OS === 'android'
      ? { type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date', date: targetDate, channelId: targetChannel }
      : { type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date', date: targetDate };

    // Deterministic ID matches the batch scheduler — second caller overwrites, not duplicates.
    const directId = task.id ? `task_${task.id}_exact_${dateStr}` : undefined;

    await Notifications.scheduleNotificationAsync({
      ...(directId ? { identifier: directId } : {}),
      content: {
        title: isUrgent ? `⏰ REMINDER: ${task.title}` : task.title,
        body: isUrgent
          ? `🚨 Urgent reminder: "${task.title}". Time to start!`
          : `Scheduled task: ${task.timeSlot || 'Starting now'}. Tap to open or mark as done.`,
        data: Platform.OS === 'ios' ? { taskId: task.id, taskTitle: task.title, isReminder: isUrgent } : undefined,
        channelId: targetChannel,
        ...(Platform.OS === 'ios' ? { sound: isUrgent ? 'default' : undefined } : {}),
        priority: Notifications.AndroidNotificationPriority?.MAX ?? ('max' as any),
        categoryIdentifier: 'task_reminder',
      } as any,
      trigger: triggerConfig,
    });
    console.log(`[Notifications] Direct reminder scheduled for "${task.title}" at ${targetDate.toLocaleTimeString()} [id: ${directId}]`);
  } catch (err) {
    console.warn('[Notifications] scheduleSingleTaskReminder error:', err);
  }
}

// â”€â”€ Legacy compatibility export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function scheduleTaskReminders(
  tasks: Task[] = [],
  customEvents: CustomEvent[] = [],
  gymLogs: GymLog[] = [],
  attendance: AttendanceSubject[] = [],
  habitLogs: HabitLog[] = [],
  allHabits: Habit[] = [],
  assignments: Assignment[] = [],
  waterLogs: WaterLog[] = [],
  sleepLogs: SleepLog[] = [],
  attendanceLogs: AttendanceLog[] = []
) {
  return scheduleAllNotifications({
    tasks, customEvents, gymLogs, attendance,
    habitLogs, allHabits, assignments,
    waterLogs, sleepLogs, attendanceLogs,
  });
}

// â”€â”€ Background Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const BACKGROUND_NOTIFICATION_SYNC_TASK = 'background-notification-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_SYNC_TASK, async () => {
  try {
    const manifest = await loadBootManifest();
    if (!manifest.optimisticUser?.uid && !auth.currentUser?.uid) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await scheduleAllNotifications({
      tasks: manifest.tasks || [],
      customEvents: manifest.customEvents || [],
      gymLogs: manifest.gymLogs || [],
      attendance: manifest.attendance || [],
      attendanceLogs: manifest.attendanceLogs || [],
      allHabits: manifest.habits || [],
      habitLogs: manifest.habitLogs || [],
      assignments: manifest.assignments || [],
      waterLogs: manifest.waterLogs || [],
      sleepLogs: manifest.sleepLogs || [],
      userGymPlan: manifest.userGymPlan || null,
      holidays: manifest.holidays || [],
    });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[BackgroundFetch] Failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundNotificationFetch() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_SYNC_TASK, {
        minimumInterval: 60 * 60 * 2, // FIX 7.6: 2 hours instead of 4 hours
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[Notifications] Background fetch registered!');
    }
  } catch (err) {
    console.error('[Notifications] Failed to register background fetch:', err);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push tokens only work on physical devices.');
    return undefined;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Push permission not granted.');
    return undefined;
  }
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Notifications] No EAS projectId found in app config.');
      return undefined;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    console.warn('[Notifications] Failed to get push token:', e);
    return undefined;
  }
}

export async function getAppNotificationSettings(): Promise<{ summary: string }> {
  try {
    const defaultTime = await AsyncStorage.getItem('zentrack_default_notif_time') || '08:00';
    const gymTime = await AsyncStorage.getItem('zentrack_gym_notif_time') || '18:00';
    return {
      summary: `Daily Briefing: ${defaultTime}, Gym Reminder: ${gymTime}`,
    };
  } catch {
    return { summary: 'Default notification settings active' };
  }
}

/**
 * Cancels all pending scheduled class and lab notifications (upcoming, mid-lab checkpoint, post-class logging)
 * for a specific date (e.g. when that day is marked as a holiday).
 */
export async function cancelAllClassNotificationsForDate(dateStr?: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled || scheduled.length === 0) return;

    const targetDateStr = (dateStr ? dateStr.slice(0, 10) : formatLocalDateStr(new Date())).trim();
    const toCancel: string[] = [];

    for (const notif of scheduled) {
      const id = notif.identifier || '';
      const data = (notif.content?.data || {}) as any;

      // Class/lab notification identification
      const isClassIdentifier = id.startsWith('class_') || id.startsWith('lab_');
      const isClassData =
        data.type === 'class_pre' ||
        data.type === 'class_log' ||
        data.type === 'lab_mid' ||
        data.type === 'lab_log' ||
        data.type === 'class_reminder';

      if (!isClassIdentifier && !isClassData) continue;

      // Date matching
      let matchesDate = false;
      const trigger = notif.trigger as any;
      const fireTimestamp = trigger?.value ?? trigger?.date;
      if (fireTimestamp) {
        const fireDate = new Date(fireTimestamp);
        if (!isNaN(fireDate.getTime())) {
          const fireDateStr = formatLocalDateStr(fireDate);
          if (fireDateStr === targetDateStr) matchesDate = true;
        }
      } else if (data.date && String(data.date).slice(0, 10) === targetDateStr) {
        matchesDate = true;
      } else if (isClassIdentifier) {
        // Fallback: identifier format class_{subjectId}_{sessionIdx}_{unixSec}
        const parts = id.split('_');
        if (parts.length >= 4) {
          const sec = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(sec) && sec > 0) {
            const fireDateStr = formatLocalDateStr(new Date(sec * 1000));
            if (fireDateStr === targetDateStr) matchesDate = true;
          }
        }
      }

      if (matchesDate) {
        toCancel.push(notif.identifier);
      }
    }

    if (toCancel.length > 0) {
      console.log(`[Notifications] cancelAllClassNotificationsForDate: cancelling ${toCancel.length} notif(s) on ${targetDateStr}`);
      await Promise.all(toCancel.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    } else {
      console.log(`[Notifications] cancelAllClassNotificationsForDate: no scheduled class notifs found for ${targetDateStr}`);
    }
  } catch (err) {
    console.warn('[Notifications] Failed to cancel all class notifications for date:', err);
  }
}

/**
 * Immediately cancels any pending scheduled OS notifications for a given class or lab session.
 * Used when a user logs/cancels attendance in-app, via widget, or from an actionable notification.
 *
 * ANDROID NOTE: content.data is stripped to prevent NotSerializableException, so we cannot
 * rely on data.type / data.subjectId on Android. We use the deterministic identifier
 * "class_{subjectId}_{sessionIdx}_{timestamp}" as the primary match signal on all platforms.
 */
export async function cancelClassNotificationsImmediately(
  subjectId?: string,
  subjectName?: string,
  dateStr?: string,
  sessionIdx?: number
): Promise<void> {
  try {
    if (!subjectId && !subjectName) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled || scheduled.length === 0) return;

    const targetDateStr = dateStr ? dateStr.slice(0, 10) : formatLocalDateStr(new Date());
    const toCancel: string[] = [];

    for (const notif of scheduled) {
      const id = notif.identifier || ``;
      // On Android, content.data is undefined -- do NOT rely solely on it for matching.
      const data = (notif.content?.data || {}) as any;
      const title = (notif.content?.title || ``) as string;

      // Is this a class/lab notification?
      // Strategy 1 (Android + iOS): identifier prefix
      const isClassIdentifier = id.startsWith(`class_`) || id.startsWith(`lab_`);
      // Strategy 2 (iOS only): data.type since data is available on iOS
      const isClassData =
        data.type === `class_pre` ||
        data.type === `class_log` ||
        data.type === `lab_mid` ||
        data.type === `lab_log`;

      if (!isClassIdentifier && !isClassData) continue;

      // Subject matching
      let matchesSubject = false;

      if (isClassIdentifier) {
        // identifier: class_{subjectId}_{sessionIdx}_{unixSec}
        const parts = id.split(`_`);
        const idSubjId = parts.length >= 4 ? parts.slice(1, -2).join('_') : (parts.length >= 2 ? parts[1] : undefined);
        if (subjectId && idSubjId === subjectId) {
          matchesSubject = true;
        }
        // Title fallback
        if (!matchesSubject && subjectName && title.includes(subjectName)) {
          matchesSubject = true;
        }
      }

      if (!matchesSubject && isClassData) {
        // iOS path: data fields are available
        const notifSubjId = data.subjectId;
        if (subjectId && notifSubjId === subjectId) {
          matchesSubject = true;
        } else if (subjectName && (
          data.subject === subjectName ||
          data.subject === `${subjectName} Lab` ||
          title.includes(subjectName)
        )) {
          matchesSubject = true;
        }
      }

      if (!matchesSubject) continue;

      // Date matching: verify the notification fires on targetDateStr
      const trigger = notif.trigger as any;
      const fireTimestamp = trigger?.value ?? trigger?.date;
      if (fireTimestamp) {
        const fireDate = new Date(fireTimestamp);
        if (!isNaN(fireDate.getTime())) {
          const fireDateStr = formatLocalDateStr(fireDate);
          if (fireDateStr !== targetDateStr) continue;
        }
      } else if (isClassData && data.date && data.date !== targetDateStr) {
        continue;
      }

      // Session index matching
      if (sessionIdx !== undefined) {
        let notifSessionIdx: number | undefined = undefined;

        if (isClassIdentifier) {
          const parts = id.split(`_`);
          if (parts.length >= 4) {
            const parsed = parseInt(parts[parts.length - 2], 10);
            if (!isNaN(parsed)) notifSessionIdx = parsed;
          }
        }
        if (notifSessionIdx === undefined && typeof data.sessionIdx === `number`) {
          notifSessionIdx = data.sessionIdx;
        }

        if (notifSessionIdx !== undefined) {
          if (notifSessionIdx !== sessionIdx) continue;
        } else if (sessionIdx !== 0) {
          continue;
        }
      }

      toCancel.push(notif.identifier);
    }

    if (toCancel.length > 0) {
      console.log(`[Notifications] cancelClassNotificationsImmediately: cancelling ${toCancel.length} notif(s) for "${subjectName || subjectId}" on ${targetDateStr} slot ${sessionIdx ?? 0}`);
      await Promise.all(toCancel.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    } else {
      console.log(`[Notifications] cancelClassNotificationsImmediately: no pending notifications found for "${subjectName || subjectId}" on ${targetDateStr} slot ${sessionIdx ?? 0}`);
    }
  } catch (err) {
    console.warn(`[Notifications] Failed to cancel class notifications immediately:`, err);
  }
}

