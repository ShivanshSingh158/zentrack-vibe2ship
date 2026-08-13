/**
 * notifications.ts — ZenTrack Mobile
 *
 * scheduleAllNotifications() — the single source of truth for all local notifications.
 * Reads all user prefs from AsyncStorage before scheduling.
 *
 * Supported notification types:
 *  1. Task warning (user-configurable buffer: 15/30/60/120 min)
 *  2. Daily task briefing (default reminder time)
 *  3. Habit streak at risk (per-habit, configurable time)
 *  4. Overdue task nudge (yesterday's pending tasks)
 *  5. Assignment due in 48h
 *  6. Assignment due in 24h
 *  7. Gym workout reminder
 *  8. Gym rest-day stretch reminder
 *  9. Weekly review reminder (Sunday)
 * 10. Attendance low-percentage warning
 * 11. Morning briefing (task + habit + gym summary)
 * 12. Inactivity nudge (if no log in N days)
 * 13. Class reminders (90min first, 30min others)
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getDocs, collection, query, where, getFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
// BUG-M5 FIX: Replaced synchronous require() calls (which block the JS thread
// during first app open) with static top-of-file imports.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  Task, CustomEvent, GymLog, AttendanceSubject,
  HabitLog, Habit, Assignment, WaterLog, SleepLog, AttendanceLog,
} from '../contexts/MobileDataContext';
import { UserGymPlanDoc } from '../types/gym.types';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { COLLECTION } from '../config/constants';

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
        name: 'S.A.R.A Critical Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 600, 200, 600, 200, 600],
        lightColor: '#ff3b30',
        sound: 'default',
      });
    }

    // Actionable Notification Categories
    await Notifications.setNotificationCategoryAsync('class_reminder', [
      { identifier: 'mark_present', buttonTitle: '✅ Present' },
      { identifier: 'mark_bunking', buttonTitle: '❌ Bunking', options: { isDestructive: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('gym_reminder', [
      { identifier: 'start_workout', buttonTitle: '🏋️ Start Workout' },
      { identifier: 'snooze_15m', buttonTitle: '⏰ Snooze 15m' },
    ]);
    await Notifications.setNotificationCategoryAsync('task_reminder', [
      { identifier: 'mark_task_done', buttonTitle: '✅ Mark Done' },
      { identifier: 'open_tasks', buttonTitle: '📋 Open Tasks' },
    ]);
    await Notifications.setNotificationCategoryAsync('habit_reminder', [
      { identifier: 'log_habit', buttonTitle: '🔥 Log It' },
      { identifier: 'open_habits', buttonTitle: '📊 View Habits' },
    ]);

    return true;
  } catch (err: any) {
    console.warn('[Notifications] Setup warning:', err?.message);
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimeString(t?: string): { hours: number; minutes: number } | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return { hours: h, minutes: min };
}

function parseHM(s: string) {
  const [h, m] = s.split(':').map(Number);
  return { hours: isNaN(h) ? 0 : h, minutes: isNaN(m) ? 0 : m };
}

function dateAtHM(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const KEY = (k: string) => `zentrack_notif_${k}`;
async function getBool(key: string, def = true): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY(key));
  return v === null ? def : v === 'true';
}
async function getString(key: string, def: string): Promise<string> {
  return (await AsyncStorage.getItem(KEY(key))) ?? def;
}

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ScheduleParams {
  tasks: Task[];
  customEvents: CustomEvent[];
  gymLogs: GymLog[];
  attendance: AttendanceSubject[];
  habitLogs?: HabitLog[];
  allHabits?: Habit[];
  assignments?: Assignment[];
  waterLogs?: WaterLog[];
  sleepLogs?: SleepLog[];
  // BUG-N1/N2 FIX: attendanceLogs lets us skip post-class log reminders for
  // sessions the user already marked present/absent/cancelled.
  attendanceLogs?: AttendanceLog[];
  // BUG-N5 FIX: userGymPlan lets gym reminders respect custom workout plans.
  userGymPlan?: UserGymPlanDoc | null;
}

// ── O1/M10: Data Fingerprint Cache ───────────────────────────────────────────
// Prevents the full cancel-and-reschedule cycle from running on every Firestore
// snapshot burst at app startup (fires 10-15 times in the first 5 seconds).
// If task count, habit count, gym log count, and assignment count are all the
// same as last run, skip entirely. Estimated savings: 50-100 cycles per session.
let _lastScheduleFingerprint: string | null = null;

/**
 * BUG-4 FIX: Call this before invoking scheduleAllNotifications() directly
 * from a settings screen. Without this, changing a notification preference
 * (e.g., enabling sleep reminders) while data counts are unchanged causes
 * the fingerprint check to short-circuit and skip the reschedule entirely.
 */
export function clearScheduleCache() {
  _lastScheduleFingerprint = null;
}

function _buildFingerprint(params: ScheduleParams): string {
  return [
    params.tasks.length,
    (params.habitLogs || []).length,
    (params.gymLogs || []).length,
    (params.assignments || []).length,
    (params.waterLogs || []).length,
    (params.sleepLogs || []).length,
    // BUG-N2 FIX: Include attendanceLogs count so logging attendance triggers
    // a fresh reschedule (removing the now-stale post-class log reminder).
    (params.attendanceLogs || []).length,
    // Include today's date so midnight always triggers a fresh schedule
    new Date().toISOString().slice(0, 10),
  ].join('|');
}

let _isScheduling = false;
let _latestParams: ScheduleParams | null = null;

export async function scheduleAllNotifications(params: ScheduleParams) {
  _latestParams = params;
  if (_isScheduling) {
    return;
  }
  
  _isScheduling = true;
  
  try {
  while (_latestParams) {
    const currentParams = _latestParams;
    _latestParams = null;
    
    const { tasks = [], customEvents = [], gymLogs = [], attendance = [], habitLogs = [], allHabits = [], assignments = [], waterLogs = [], sleepLogs = [], attendanceLogs = [], userGymPlan } = currentParams;

    // O1/M10 FIX: Skip full reschedule if data fingerprint hasn't changed.
    const fingerprint = _buildFingerprint({ tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments, waterLogs, sleepLogs, attendanceLogs, userGymPlan });
    if (fingerprint === _lastScheduleFingerprint) {
      console.log('[Notifications] Data unchanged — skipping reschedule.');
      continue;
    }
    _lastScheduleFingerprint = fingerprint;

    await Notifications.cancelAllScheduledNotificationsAsync();

    let scheduledCount = 0;
    const ALARM_CAP = 450; // Android has a hard 500-alarm limit per app.

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const dStr = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${dStr}`;
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // ── Load ALL user preferences in ONE batched AsyncStorage read ───────────────
  // Previously these were 25+ individual await calls = 25 bridge round-trips.
  // Now it's a single multiGet = 1 bridge round-trip, saving ~60-120ms.
  const BOOL_KEYS = [
    'zentrack_notif_mod_tasks', 'zentrack_notif_mod_habits', 'zentrack_notif_mod_gym',
    'zentrack_notif_mod_attendance',
    // BUG-M3 FIX: Added separate mod_assignments key so turning off attendance
    // reminders no longer silently disables assignment deadline notifications.
    'zentrack_notif_mod_assignments',
    'zentrack_notif_habit_streak_risk', 'zentrack_notif_overdue_nudge',
    'zentrack_notif_assignment_48h', 'zentrack_notif_assignment_24h', 'zentrack_notif_gym_rest_day',
    'zentrack_notif_weekly_review', 'zentrack_notif_attendance_warning', 'zentrack_notif_morning_brief',
    'zentrack_notif_inactivity_nudge', 'zentrack_notif_quiet_hours', 'zentrack_notif_weekend_mode',
    'zentrack_notif_sara_escalation', 'zentrack_notif_actionable_notifs',
  ];
  const STR_KEYS = [
    'zentrack_notif_morning_brief_time', 'zentrack_notif_overdue_nudge_time', 'zentrack_notif_quiet_start',
    'zentrack_notif_quiet_end', 'zentrack_notif_task_buffer', 'zentrack_notif_inactivity_days',
    'zentrack_notif_quiet_end', 'zentrack_notif_task_buffer', 'zentrack_notif_inactivity_days',
    'zentrack_notif_habit_streak_time', 'zentrack_default_notif_time',
    '@gym_notification_time', '@gym_notification_enabled',
    '@zentrack_water_reminder_freq', '@zentrack_sleep_reminders_enabled',
    '@zentrack_sleep_reminder_night', '@zentrack_sleep_reminder_morning',
    'zentrack_water_goal_ml',
    // Per-subject class notification prefs — read once and stored in kv
    ...attendance.flatMap(s => [
      `@class_notif_enabled_${s.id}`,
      `@class_notif_offset_${s.id}`,       // legacy single offset (kept for compat)
      `@class_notif_pre_offsets_${s.id}`,  // JSON e.g. "[-90,-60,-30]" — pre-class alerts
      `@class_notif_log_delay_${s.id}`,    // minutes after class END before log reminder (default 0)
      `@class_notif_first_pre_${s.id}`,    // 'true'/'false' — send 3× pre-warnings for first session
      `@class_notif_lab_mid_${s.id}`,      // 'true'/'false' — send mid-lab (60 min) reminder
      `@class_notif_lab_end_delay_${s.id}`,// minutes after lab END before log reminder (default 0)
    ]),
  ];

  const allPairs = await AsyncStorage.multiGet([...BOOL_KEYS, ...STR_KEYS]);
  const kv: Record<string, string | null> = {};
  allPairs.forEach(([k, v]) => { kv[k] = v; });

  const boolVal = (suffix: string, def = true) => {
    const v = kv[`zentrack_notif_${suffix}`];
    return v === null ? def : v === 'true';
  };
  const strVal = (suffix: string, def: string) =>
    kv[`zentrack_notif_${suffix}`] ?? def;

  const modTasks            = boolVal('mod_tasks');
  const modHabits           = boolVal('mod_habits');
  const modGym              = boolVal('mod_gym');
  const modAttendance       = boolVal('mod_attendance');
  // BUG-M3 FIX: modAssignments defaults to true (independent of modAttendance).
  // Previously all assignment notifications were gated behind modAttendance,
  // so disabling class reminders silently killed deadline alerts too.
  const modAssignments      = boolVal('mod_assignments', true);
  const habitStreakRisk     = boolVal('habit_streak_risk');
  const overdueNudge        = boolVal('overdue_nudge');
  const assignment48h       = boolVal('assignment_48h');
  const assignment24h       = boolVal('assignment_24h');
  const gymRestDay          = boolVal('gym_rest_day', false);
  const weeklyReview        = boolVal('weekly_review');
  const attendanceWarning   = boolVal('attendance_warning');
  const morningBriefEnabled = boolVal('morning_brief');
  const inactivityNudge     = boolVal('inactivity_nudge');
  const quietHoursEnabled   = boolVal('quiet_hours');
  const weekendMode         = boolVal('weekend_mode', false);
  const saraEscalation      = boolVal('sara_escalation', true);
  const actionableNotifs    = boolVal('actionable_notifs', true);

  const morningBriefTimeStr = strVal('morning_brief_time', '07:30');
  const overdueNudgeTimeStr = strVal('overdue_nudge_time', '08:00');
  const quietStartStr       = strVal('quiet_start', '23:00');
  const quietEndStr         = strVal('quiet_end', '07:00');
  const taskBufferMin       = parseInt(strVal('task_buffer', '60'), 10);
  const inactivityDays      = parseInt(strVal('inactivity_days', '3'), 10);
  const habitStreakTimeStr   = strVal('habit_streak_time', '20:00');

  const defaultTimeStr = kv['zentrack_default_notif_time'] ?? '08:00';
  const defaultTime = parseHM(defaultTimeStr);

  // Gym prefs (legacy keys kept for compatibility)
  const gymNotifTimeStr    = kv['@gym_notification_time'];
  const gymNotifEnabledStr = kv['@gym_notification_enabled'];
  const gymNotifEnabled    = gymNotifEnabledStr !== 'false' && modGym;
  let gymNotifHours = 18, gymNotifMinutes = 0;
  if (gymNotifTimeStr) {
    const [h, m] = gymNotifTimeStr.split(':').map(Number);
    if (!isNaN(h)) { gymNotifHours = h; gymNotifMinutes = m || 0; }
  }

  const quietStart = parseHM(quietStartStr);
  const quietEnd   = parseHM(quietEndStr);

  // ── Quiet hours check ────────────────────────────────────────────────────────
  function isQuiet(date: Date): boolean {
    if (!quietHoursEnabled) return false;
    const h = date.getHours(), m = date.getMinutes();
    const val = h * 60 + m;
    const qs  = quietStart.hours * 60 + quietStart.minutes;
    const qe  = quietEnd.hours   * 60 + quietEnd.minutes;
    if (qs > qe) return val >= qs || val < qe;   // spans midnight
    return val >= qs && val < qe;
  }

  // ── Schedule helper ──────────────────────────────────────────────────────────
  async function schedule(title: string, body: string, trigger: Date, data?: any, channel = 'default', categoryId?: string) {
    if (trigger <= now) return;
    if (scheduledCount >= ALARM_CAP) {
      console.warn(`[Notifications] Safety cap of ${ALARM_CAP} alarms reached. Skipping remaining schedules.`);
      return;
    }

    let finalTrigger = trigger;

    if (isQuiet(trigger)) {
      // BUG-H4 FIX: Instead of silently dropping, redeliver at the end of quiet hours.
      // Critical channels (sara_critical) always fire immediately, never suppressed.
      if (channel === 'sara_critical') {
        finalTrigger = trigger; // never suppress critical
      } else {
        // Reschedule to quietEnd time on the same day (or next day if already past)
        const catchUp = new Date(trigger);
        catchUp.setHours(quietEnd.hours, quietEnd.minutes, 0, 0);
        if (catchUp <= now) {
          // Quiet period spans midnight and the catchup time has already passed today
          catchUp.setDate(catchUp.getDate() + 1);
        }
        finalTrigger = catchUp;
      }
    }

    if (weekendMode && isWeekend) {
      // Reduce weekend notifications — only fire critical ones
      if (channel !== 'reminders' && channel !== 'sara_critical') return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title, body, data, categoryIdentifier: categoryId,
          ...(channel === 'reminders' || channel === 'sara_critical' ? { sound: 'default', priority: 'max' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: finalTrigger.getTime(),
          channelId: channel,
        } as any,
      });
      scheduledCount++;
    } catch (e) {
      console.warn(`[Notifications] Failed to schedule specific alarm:`, e);
    }
  }

  // ── 11. Morning Briefing ─────────────────────────────────────────────────────
  if (morningBriefEnabled) {
    const mbTime = parseHM(morningBriefTimeStr);
    const trigger = dateAtHM(now, mbTime.hours, mbTime.minutes);
    if (trigger > now) {
      const pendingCount  = tasks.filter(t => t.date === todayStr && t.status !== 'completed').length;
      const activeHabits  = allHabits.filter(h => !h.archived).length;
      const todayGym      = gymLogs.find(g => g.date === todayStr);
      const parts: string[] = [];
      if (pendingCount > 0) parts.push(`${pendingCount} task${pendingCount !== 1 ? 's' : ''}`);
      if (activeHabits > 0) parts.push(`${activeHabits} habit${activeHabits !== 1 ? 's' : ''}`);
      if (!todayGym) parts.push('gym day');
      const summary = parts.length > 0 ? parts.join(', ') : 'a clean slate';
      
      const stdBrief = [
        `Today: ${summary}. What's your first move?`,
        `Here is your agenda: ${summary}. Let's make it a good day.`,
        `Wake up! You have ${summary} on the docket today.`
      ];
      const saraBrief = [
        `S.A.R.A: Your daily objectives are set: ${summary}. Do not fail.`,
        `S.A.R.A: Status report. Today requires ${summary}. Execute the plan.`
      ];
      
      let title = saraEscalation ? 'Morning Briefing 🌅' : 'Good Morning 🌅';
      let body = saraEscalation ? getRandomMessage(saraBrief) : getRandomMessage(stdBrief);
      
      if (saraEscalation && modGym) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        // BUG-N8 FIX: Use local date components instead of .toISOString() (UTC).
        // toISOString() returns UTC, so at 12:30 AM IST (7 PM UTC previous day)
        // it would report the wrong date.
        const yyLocal = yesterday.getFullYear();
        const ymLocal = String(yesterday.getMonth() + 1).padStart(2, '0');
        const ydLocal = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${yyLocal}-${ymLocal}-${ydLocal}`;
        // BUG-M7 FIX: Only complain about missed gym if yesterday was a SCHEDULED gym day.
        const yesterdayDayIndex = WEEKDAY_TO_PLAN[yesterday.getDay()];
        // BUG-N5 FIX: Respect userGymPlan when available.
        const effectivePlanForYesterday = userGymPlan?.customDays?.[yesterdayDayIndex] ||
          GYM_PLAN.find(p => p.dayIndex === yesterdayDayIndex);
        const wasScheduledGymDay = effectivePlanForYesterday && !effectivePlanForYesterday.isRest;
        const missedGym = wasScheduledGymDay && !gymLogs.some(g => g.date === yesterdayStr);
        if (missedGym) {
          const saraMissedGym = [
            `I didn't see a workout logged yesterday. Are we skipping two days in a row? Let's go. Today: ${summary}.`,
            `You skipped training yesterday. Unacceptable. Make up for it today: ${summary}.`
          ];
          title = 'S.A.R.A Here 🤖';
          body = `S.A.R.A: ${getRandomMessage(saraMissedGym)}`;
        }

        // I8 IMPROVEMENT: Include the most at-risk subject name in the morning brief.
        if (modAttendance && attendance.length > 0) {
          const THRESHOLD = 75;
          const atRisk = attendance
            .filter(s => s.classesTotal > 0 && ((s.classesAttended / s.classesTotal) * 100) < THRESHOLD)
            .sort((a, b) => (a.classesAttended / a.classesTotal) - (b.classesAttended / b.classesTotal));
          if (atRisk.length > 0) {
            const worst = atRisk[0];
            const pct = ((worst.classesAttended / worst.classesTotal) * 100).toFixed(0);
            body += ` ⚠️ ${worst.name} attendance: ${pct}%.`;
          }
        }
      }

      await schedule(title, body, trigger, { type: 'morning_brief' }, title.includes('S.A.R.A') ? 'sara_critical' : 'default');
    }
  }

  // ── 4. Overdue task nudge ────────────────────────────────────────────────────
  if (overdueNudge && modTasks) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const overdueTasks = tasks.filter(t => t.date === yesterdayStr && t.status !== 'completed');
    if (overdueTasks.length > 0) {
      const count = overdueTasks.length;
      const countStr = `${count} task${count !== 1 ? 's' : ''}`;
      
      const stdNudges = [
        `You left ${countStr} open yesterday. Time to clear the backlog.`,
        `Yesterday's work isn't done. ${countStr} still waiting.`,
        `Don't let yesterday bleed into today. You have ${countStr} pending.`
      ];
      const saraNudges = [
        `S.A.R.A: You left ${countStr} unfinished yesterday. Stop procrastinating and get it done.`,
        `S.A.R.A: I'm still tracking ${countStr} from yesterday. Reschedule them or close them out now.`
      ];
      
      const on = parseHM(overdueNudgeTimeStr);
      const trigger = dateAtHM(now, on.hours, on.minutes);
      await schedule(
        'Tasks still pending ⚠️',
        saraEscalation ? getRandomMessage(saraNudges) : getRandomMessage(stdNudges),
        trigger, { type: 'overdue_nudge' }
      );
    }
  }

  // ── 1. Task reminders (with user-configurable buffer) ────────────────────────
  if (modTasks) {
    for (const task of tasks.filter(t => t.status !== 'completed' && t.date)) {
      const [year, month, day] = task.date!.split('-').map(Number);
      if (!year) continue;
      const base = new Date(year, month - 1, day);
      const parsedTime = parseTimeString(task.timeSlot);
      if (parsedTime) {
        base.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
        const t1 = new Date(base.getTime() - taskBufferMin * 60 * 1000);
        
        const stdWindow = [
          `Your mission opens in ${taskBufferMin} min: "${task.title}"`,
          `Prep time. ${taskBufferMin} minutes until you start: "${task.title}"`,
          `Next objective in ${taskBufferMin} min: "${task.title}"`
        ];
        const saraWindow = [
          `S.A.R.A: Your execution window for "${task.title}" opens in ${taskBufferMin} mins. Get ready.`,
          `S.A.R.A: Standby. ${taskBufferMin} minutes until you tackle "${task.title}".`
        ];
        
        await schedule('Mission window 🎯', saraEscalation ? getRandomMessage(saraWindow) : getRandomMessage(stdWindow), t1, { taskId: task.id, taskTitle: task.title }, 'reminders', actionableNotifs ? 'task_reminder' : undefined);
        
        const t15 = new Date(base.getTime() - 15 * 60 * 1000);
        if (taskBufferMin > 15) {
          const std15 = [
            `Almost time: "${task.title}"`,
            `15 minutes out. Wrap up what you're doing. Next: "${task.title}"`,
            `Approaching start time for "${task.title}".`
          ];
          const sara15 = [
            `S.A.R.A: T-minus 15 minutes to "${task.title}". Focus up.`,
            `S.A.R.A: 15-minute warning. Eliminate distractions. Target: "${task.title}"`
          ];
          await schedule('T-15 minutes ⚡', saraEscalation ? getRandomMessage(sara15) : getRandomMessage(std15), t15, { taskId: task.id, taskTitle: task.title }, 'reminders', actionableNotifs ? 'task_reminder' : undefined);
        }
      } else {
        base.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
        
        const stdTarget = [
          `Pending today: "${task.title}"`,
          `On today's radar: "${task.title}"`,
          `Don't forget to tackle this today: "${task.title}"`
        ];
        const saraTarget = [
          `S.A.R.A: This is on your plate for today: "${task.title}". Don't leave it pending.`,
          `S.A.R.A: Objective logged for today: "${task.title}". Let's see it done.`
        ];
        
        await schedule('Daily target 📋', saraEscalation ? getRandomMessage(saraTarget) : getRandomMessage(stdTarget), base, { taskId: task.id, taskTitle: task.title }, 'default', actionableNotifs ? 'task_reminder' : undefined);
      }
    }
  }

  // ── Custom Events ────────────────────────────────────────────────────────────
  for (const event of customEvents.filter(e => e.date)) {
    const [year, month, day] = event.date.split('-').map(Number);
    if (!year) continue;
    const base = new Date(year, month - 1, day);
    const t = parseTimeString(event.startTime);
    if (t) {
      base.setHours(t.hours, t.minutes, 0, 0);
      await schedule('Incoming 📅', `${event.title} in 1 hour`, new Date(base.getTime() - 60 * 60 * 1000), { eventId: event.id });
    }
  }

  // ── 3. Habit streak at risk ──────────────────────────────────────────────────
  if (habitStreakRisk && modHabits) {
    const hst = parseHM(habitStreakTimeStr);
    const trigger = dateAtHM(now, hst.hours, hst.minutes);
    const unloggedHabits = allHabits.filter(h => {
      if (h.archived) return false;
      return !habitLogs.some(l => l.habitId === h.id && l.date === todayStr);
    });
    // BUG-M4 FIX: Previous code capped at 3 habits with slice(0, 3).
    // Now priority-sorts by streak length (longest at risk first) and allows up to 6.
    const prioritizedHabits = unloggedHabits
      .filter(h => (h.streak || 0) >= 2)
      .sort((a, b) => (b.streak || 0) - (a.streak || 0))
      .slice(0, 6);
    for (const habit of prioritizedHabits) {
      const streakCount = habit.streak || 0;
      const title = saraEscalation ? 'S.A.R.A Warning ⚠️' : `${habit.emoji || '🔥'} Streak at risk!`;
      // BUG-N7 FIX: Personalised body text per habit instead of generic message.
      const stdStreak = [
        `${streakCount} days of "${habit.name}" — don't let midnight reset you.`,
        `Your ${streakCount}-day streak for "${habit.name}" is fading. Keep it alive!`,
        `Almost out of time for "${habit.name}". Tap to log your ${streakCount}-day streak.`
      ];
      const saraStreak = [
        `S.A.R.A: Your ${streakCount}-day streak for "${habit.name}" is about to break. Don't ruin your momentum.`,
        `S.A.R.A: Midnight is approaching. Log "${habit.name}" now, or lose ${streakCount} days of progress.`,
        `S.A.R.A: I refuse to let your ${streakCount}-day streak for "${habit.name}" die today. Execute.`
      ];
      const body = saraEscalation ? getRandomMessage(saraStreak) : getRandomMessage(stdStreak);
      await schedule(title, body, trigger, { type: 'habit_streak', habitId: habit.id }, saraEscalation ? 'sara_critical' : 'habits', actionableNotifs && !saraEscalation ? 'habit_reminder' : undefined);
    }
  }

  // ── 3b. Per-habit daily reminders (user-configurable per habit) ───────────────
  // Reads @habit_notif_enabled_{id} and @habit_notif_time_{id} for each habit.
  // Schedules for the next 7 days so reminders persist across app opens.
  // Notification has the 'habit_reminder' category → 🔥 Log It logs to Firestore.
  if (modHabits && (allHabits?.length ?? 0) > 0) {
    const habitsWithReminders = allHabits ?? [];

    // Batch-read ALL AsyncStorage keys in one call (1 bridge round-trip)
    const notifKeys = habitsWithReminders.flatMap(h => [
      `@habit_notif_enabled_${h.id}`,
      `@habit_notif_time_${h.id}`,
    ]);
    const notifPairs = notifKeys.length > 0
      ? await AsyncStorage.multiGet(notifKeys)
      : [];
    const notifKV: Record<string, string | null> = {};
    notifPairs.forEach(([k, v]) => { notifKV[k] = v; });

    for (const habit of habitsWithReminders) {
      const isEnabled = notifKV[`@habit_notif_enabled_${habit.id}`] === 'true';
      if (!isEnabled) continue;

      const timeStr = notifKV[`@habit_notif_time_${habit.id}`];
      let rH = 20, rM = 0; // default 8 PM
      if (timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) { rH = h; rM = m; }
      }

      // Schedule for next 2 days (ensures daily coverage between reschedule cycles)
      for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
        const fireDate = new Date(now);
        fireDate.setDate(fireDate.getDate() + dayOffset);
        fireDate.setHours(rH, rM, 0, 0);
        if (fireDate <= now) continue; // already passed

        // Use local date string (not UTC) to match how logs are stored
        const fdY = fireDate.getFullYear();
        const fdM = String(fireDate.getMonth() + 1).padStart(2, '0');
        const fdD = String(fireDate.getDate()).padStart(2, '0');
        const dateStr = `${fdY}-${fdM}-${fdD}`;
        // Don't remind if already logged for that day
        const alreadyLogged = (habitLogs ?? []).some(
          l => l.habitId === habit.id && l.date === dateStr
        );
        if (alreadyLogged) continue;

        const streakVal = habit.streak ?? 0;
        // BUG-N7 FIX: Personalised, action-oriented body text per habit.
        let habitBody: string;
        if (streakVal >= 30) {
          const std30 = [
            `${streakVal}-day streak! Keep the legend alive. 🏆`,
            `Over a month of "${habit.name}". You are unstoppable today.`,
            `${streakVal} days of pure discipline. Log today's "${habit.name}".`
          ];
          const sara30 = [
            `S.A.R.A: ${streakVal} days. You've built an empire. Don't let it crumble today.`,
            `S.A.R.A: ${streakVal} days of "${habit.name}". Excellence is a habit. Log it.`
          ];
          habitBody = saraEscalation ? getRandomMessage(sara30) : getRandomMessage(std30);
        } else if (streakVal >= 7) {
          const std7 = [
            `${streakVal} days strong — don't break the chain now! 🔥`,
            `A full week in the bag! Let's make it ${streakVal + 1} for "${habit.name}".`,
            `You've got real momentum on "${habit.name}". Log day ${streakVal}.`
          ];
          const sara7 = [
            `S.A.R.A: ${streakVal} days. You're building a foundation. Keep stacking.`,
            `S.A.R.A: Momentum is hard to earn and easy to lose. Log "${habit.name}".`
          ];
          habitBody = saraEscalation ? getRandomMessage(sara7) : getRandomMessage(std7);
        } else if (streakVal >= 1) {
          const std1 = [
            `${streakVal}-day streak at stake. Tap to log and keep going.`,
            `Day ${streakVal} of "${habit.name}". Small steps every day.`,
            `Keep the fire going! Log day ${streakVal} for "${habit.name}".`
          ];
          const sara1 = [
            `S.A.R.A: A ${streakVal}-day streak is fragile. Solidify it today.`,
            `S.A.R.A: Consistency is everything. Don't skip day ${streakVal} of "${habit.name}".`
          ];
          habitBody = saraEscalation ? getRandomMessage(sara1) : getRandomMessage(std1);
        } else {
          const std0 = [
            `Start your streak today — every journey begins with one tap.`,
            `Today is day one for "${habit.name}". Let's get to work.`,
            `A blank slate. Start building your "${habit.name}" habit today.`
          ];
          const sara0 = [
            `S.A.R.A: Zero days logged. Time to stop wishing and start doing "${habit.name}".`,
            `S.A.R.A: The hardest part is starting. Execute "${habit.name}" today.`
          ];
          habitBody = saraEscalation ? getRandomMessage(sara0) : getRandomMessage(std0);
        }
        await schedule(
          `${habit.emoji || '⭐'} ${habit.name}`,
          habitBody,
          fireDate,
          { type: 'habit_reminder', habitId: habit.id },
          'habits',
          actionableNotifs ? 'habit_reminder' : undefined,
        );
      }
    }
  }

  // BUG-M3 FIX: Now gated by modAssignments (not modAttendance).
  // BUG-M1 FIX: Assignment notifications now use user's defaultNotifTime instead of hardcoded 09:00.
  if (modAssignments) {
    for (const asn of assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate)) {
      const [y, m, d] = asn.dueDate.split('-').map(Number);
      if (!y) continue;
      const dueDate = new Date(y, m - 1, d);

      // 48h alert — fires at user's preferred notification time 2 days before due
      if (assignment48h) {
        const t48 = new Date(dueDate.getTime() - 48 * 60 * 60 * 1000);
        t48.setHours(defaultTime.hours, defaultTime.minutes, 0, 0); // BUG-M1 FIX
        await schedule('Assignment due in 48h 📚', `"${asn.title}" is due in 2 days. Start early.`, t48, { type: 'assignment_48h', asnId: asn.id });
      }
      // 24h alert — fires at user's preferred notification time 1 day before due
      if (assignment24h) {
        const t24 = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
        t24.setHours(defaultTime.hours, defaultTime.minutes, 0, 0); // BUG-M1 FIX
        await schedule('Assignment due tomorrow ⚠️', `"${asn.title}" is due tomorrow. Final push.`, t24, { type: 'assignment_24h', asnId: asn.id }, 'reminders');
      }
    }
  }

  // ── 10. Attendance warning ───────────────────────────────────────────────────
  if (attendanceWarning && modAttendance) {
    const THRESHOLD = 75;
    for (const subj of attendance) {
      if (!subj.classesTotal) continue;
      const totalAtt = (subj.classesAttended || 0) + (subj.labsAttended || 0);
      const totalTotal = (subj.classesTotal || 0) + (subj.labsTotal || 0);
      if (!totalTotal) continue;
      const pct = (totalAtt / totalTotal) * 100;
      if (pct < THRESHOLD) {
        // BUG-N6 FIX: Use user's configured default notification time instead
        // of hardcoded 9:00 AM. This respects the user's morning preferences.
        const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
        const title = saraEscalation ? 'S.A.R.A Critical Alert 🚨' : 'Attendance warning 📉';
        const needed = Math.ceil((THRESHOLD / 100 * totalTotal - totalAtt) / (1 - THRESHOLD / 100));
        const body = saraEscalation 
          ? `${subj.name} attendance is at ${pct.toFixed(0)}%. You need to attend ${needed} more class${needed !== 1 ? 'es' : ''} to get back above ${THRESHOLD}%.`
          : `${subj.name}: ${pct.toFixed(0)}% (need ${needed} more to reach ${THRESHOLD}%). Don't fall further behind.`;
        
        await schedule(title, body, trigger, { type: 'attendance_warning', subjectId: subj.id }, saraEscalation ? 'sara_critical' : 'default');
      }
    }
  }

  // ── 9. Weekly review reminder (Sunday evening, recurring) ───────────────────
  // BUG-M2 FIX: Was using a loop with a break — only ever scheduled once.
  // Now uses Expo's native WEEKLY trigger for true infinite recurrence.
  if (weeklyReview) {
    const stdWeekly = [
      'Sunday check-in: reflect on what went well, what to improve, and set priorities.',
      'Time to wrap up the week. Review your stats and plan for Monday.',
      'Weekly review time. Celebrate the wins and learn from the losses.'
    ];
    const saraWeekly = [
      'S.A.R.A: Weekly audit required. Review your performance data now.',
      'S.A.R.A: The week is over. Analyze your failures and successes to calibrate next week.'
    ];
    const weeklyBody = saraEscalation ? getRandomMessage(saraWeekly) : getRandomMessage(stdWeekly);
    
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Weekly review time 📊',
          body: weeklyBody,
          data: { type: 'weekly_review' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 1, // 1 = Sunday in Expo's 1-indexed weekday system
          hour: 20,
          minute: 0,
          channelId: 'default',
        } as any,
      });
    } catch (e) {
      // Weekly trigger may not be supported on all Expo Go builds — fall back to one-shot
      const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
      const d = new Date(now);
      d.setDate(d.getDate() + daysUntilSunday);
      d.setHours(20, 0, 0, 0);
      await schedule('Weekly review time 📊', weeklyBody, d, { type: 'weekly_review' });
    }
  }

  // ── Gym + Classes for next 2 days ────────────────────────────────────────────
  for (let i = 0; i <= 1; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const yDay = d.getFullYear();
    const mDay = String(d.getMonth() + 1).padStart(2, '0');
    const dDay = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yDay}-${mDay}-${dDay}`;
    const dayOfWeek = d.getDay();
    const dayName  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];

    // ── 7. Gym workout reminder ──────────────────────────────────────────────
    const planIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
    // BUG-N5 FIX: Prefer userGymPlan's custom day over the static template.
    // If the user has customised day 3 (e.g. changed Legs to Deadlifts), use that.
    const plan = userGymPlan?.customDays?.[planIndex] ||
      GYM_PLAN.find(p => p.dayIndex === planIndex);

    if (plan && !plan.isRest && gymNotifEnabled) {
      const hasLogged = gymLogs.some(g => g.date === dateStr);
      if (!hasLogged) {
        // I2 IMPROVEMENT: Include workout name + exercise count in message.
        const exerciseCount = plan.exercises?.length || 0;
        const countSuffix = exerciseCount > 0 ? ` · ${exerciseCount} exercises` : '';
        
        const stdGym = [
          `${plan.focus || plan.name}${countSuffix}. One workout closer to your goal.`,
          `Time to hit the iron. ${plan.name}${countSuffix} awaits.`,
          `Get your reps in today: ${plan.name}${countSuffix}.`
        ];
        const saraGym = [
          `S.A.R.A: Your ${plan.name} session is scheduled. No excuses. Execute.`,
          `S.A.R.A: ${plan.name} awaits. Discipline over motivation. Go.`
        ];
        const gymBody = saraEscalation ? getRandomMessage(saraGym) : getRandomMessage(stdGym);

        await schedule(
          `Gym day 🏋️ — ${plan.name}`,
          gymBody,
          dateAtHM(d, gymNotifHours, gymNotifMinutes),
          { type: 'gym', planName: plan.name },
          'default',
          actionableNotifs ? 'gym_reminder' : undefined
        );
      }
    }

    // ── 8. Rest day reminder ─────────────────────────────────────────────────
    if (gymRestDay && plan?.isRest && modGym) {
      const stdRest = [
        'Recovery day — a light stretch or a 20-minute walk keeps momentum going.',
        'Rest day. Let your muscles recover, but stay active.',
        'Take it easy today. Active recovery is still progress.'
      ];
      const saraRest = [
        'S.A.R.A: Scheduled rest day. Do not overtrain. Active recovery only.',
        'S.A.R.A: Stand down. Let your muscles repair. Do some light stretching.'
      ];
      const restBody = saraEscalation ? getRandomMessage(saraRest) : getRandomMessage(stdRest);
      
      await schedule(
        'Rest day 🧘',
        restBody,
        dateAtHM(d, gymNotifHours, gymNotifMinutes),
        { type: 'gym_rest' }
      );
    }

    // ── 13. Class + Lab reminders (smart multi-trigger) ────────────────────────
    if (!modAttendance) continue;

    // ── Build flat session list for this day ─────────────────────────────────
    interface DaySession {
      subject: string;
      subjectId: string;
      time: string;           // raw time string e.g. "10:00 AM"
      isLab: boolean;
      startMs: number;        // absolute ms
    }
    const daySessions: DaySession[] = [];

    attendance.forEach(subj => {
      const enabledRaw = kv[`@class_notif_enabled_${subj.id}`];
      if (enabledRaw === 'false') return;

      const sch = subj.schedule?.[dayOfWeek.toString()]
        || subj.schedule?.[['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]]
        || subj.schedule?.[['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek].toLowerCase()];
      if (!sch) return;

      const classes  = (sch.classes  || []) as any[];
      const labs     = (sch.labs     || []) as any[];
      const classCnt = (sch.classCount || 0) as number;
      const labCnt   = (sch.labCount   || 0) as number;

      // Class slots
      if (classes.length > 0) {
        classes.forEach((c: any) => {
          const parsed = parseTimeString(c?.time ?? '');
          const startMs = parsed
            ? dateAtHM(d, parsed.hours, parsed.minutes).getTime()
            : dateAtHM(d, 9, 0).getTime();
          daySessions.push({ subject: subj.name, subjectId: subj.id!, time: c?.time ?? '', isLab: false, startMs });
        });
      } else {
        for (let ci = 0; ci < classCnt; ci++) {
          daySessions.push({ subject: subj.name, subjectId: subj.id!, time: '', isLab: false, startMs: dateAtHM(d, 9, 0).getTime() + ci * 60 * 60 * 1000 });
        }
      }

      // Lab slots
      if (labs.length > 0) {
        labs.forEach((l: any) => {
          const parsed = parseTimeString(l?.time ?? '');
          const startMs = parsed
            ? dateAtHM(d, parsed.hours, parsed.minutes).getTime()
            : dateAtHM(d, 14, 0).getTime();
          daySessions.push({ subject: `${subj.name} Lab`, subjectId: subj.id!, time: l?.time ?? '', isLab: true, startMs });
        });
      } else {
        for (let li = 0; li < labCnt; li++) {
          daySessions.push({ subject: `${subj.name} Lab`, subjectId: subj.id!, time: '', isLab: true, startMs: dateAtHM(d, 14, 0).getTime() + li * 2 * 60 * 60 * 1000 });
        }
      }
    });

    // Sort ascending by start time to know which is "first session of the day"
    daySessions.sort((a, b) => a.startMs - b.startMs);
    const firstSessionMs = daySessions[0]?.startMs ?? null;

    // ── Schedule each session's notifications ────────────────────────────────
    for (const sess of daySessions) {
      const sid = sess.subjectId;
      const CLASS_DURATION_MS = 60 * 60 * 1000;   // 1 hour
      const LAB_DURATION_MS   = 2 * 60 * 60 * 1000; // 2 hours

      // ── Pre-class early warnings (FIRST session of day only) ────────────────
      const isFirstSession = sess.startMs === firstSessionMs;
      const firstPreEnabled = kv[`@class_notif_first_pre_${sid}`] !== 'false'; // default true

      if (isFirstSession && firstPreEnabled) {
        // Read user-customised pre-offsets (default: 90, 60, 30 minutes before)
        let preOffsets: number[] = [-90, -60, -30];
        const preRaw = kv[`@class_notif_pre_offsets_${sid}`];
        if (preRaw) {
          try { const parsed = JSON.parse(preRaw); if (Array.isArray(parsed)) preOffsets = parsed; } catch {}
        }

        for (const offsetMin of preOffsets) {
          const triggerMs = sess.startMs + offsetMin * 60 * 1000;
          const absMin = Math.abs(offsetMin);
          const timeStr = absMin >= 60 ? `${absMin / 60}h` : `${absMin} min`;
          const type = sess.isLab ? 'Lab' : 'Class';
          const time = sess.time || 'scheduled time';
          const stdPre = [
            `${type} starts at ${time} — get ready!`,
            `Time to head out. ${type} is at ${time}.`,
            `Don't be late! Your ${type} begins at ${time}.`
          ];
          const saraPre = [
            `S.A.R.A: Your ${type} is scheduled for ${time}. Being late is unacceptable.`,
            `S.A.R.A: ${time} ${type} approaching. Mobilize immediately.`
          ];
          const preBody = saraEscalation ? getRandomMessage(saraPre) : getRandomMessage(stdPre);

          await schedule(
            `📚 ${sess.subject} in ${timeStr}`,
            preBody,
            new Date(triggerMs),
            { type: 'class_pre', subject: sess.subject, subjectId: sid },
            'reminders',
            actionableNotifs ? 'class_reminder' : undefined,
          );
        }
      }

      if (!sess.isLab) {
        // ── Regular class: 1 notification at end (post-class log reminder) ────
        const logDelayMs = parseInt(kv[`@class_notif_log_delay_${sid}`] || '0', 10) * 60 * 1000;
        const endTrigger = new Date(sess.startMs + CLASS_DURATION_MS + logDelayMs);
        // BUG-N1 FIX: Skip the post-class log reminder if the user already logged
        // attendance for this subject on this date. Previously this always fired
        // even if the user had already marked present mid-class.
        const alreadyLoggedClass = attendanceLogs.some(
          l => l.subjectId === sid && l.date === dateStr && (l.type === 'class' || !l.type) && !l.isExtra
        );
        if (!alreadyLoggedClass) {
          const stdPostClass = [
            'Class just ended. Were you present? Tap to mark it now.',
            'Another class down. Remember to log your attendance.',
            'Quick check-in: did you make it to class? Log it here.'
          ];
          const saraPostClass = [
            'S.A.R.A: Class concluded. Report your attendance status immediately.',
            'S.A.R.A: Confirm your presence for the completed class session. Do it now.'
          ];
          const postClassBody = saraEscalation ? getRandomMessage(saraPostClass) : getRandomMessage(stdPostClass);

          await schedule(
            `📝 Log attendance — ${sess.subject}`,
            postClassBody,
            endTrigger,
            { type: 'class_log', subject: sess.subject, subjectId: sid, time: sess.time },
            'default',
            actionableNotifs ? 'class_reminder' : undefined,
          );
        }
      } else {
        // ── Lab: notification at 60 min mark (mid-lab) ───────────────────────
        const labMidEnabled = kv[`@class_notif_lab_mid_${sid}`] !== 'false'; // default true
        if (labMidEnabled) {
          const midTrigger = new Date(sess.startMs + 60 * 60 * 1000);
          // Only fire mid-lab reminder if lab not already logged
          const alreadyLoggedLabMid = attendanceLogs.some(
            l => l.subjectId === sid && l.date === dateStr && l.type === 'lab' && !l.isExtra
          );
          if (!alreadyLoggedLabMid) {
            const stdMidLab = [
              'Log attendance for hour 1 of lab if your system requires it.',
              'Halfway through lab! Don\'t forget to mark the first hour if needed.',
              'Hour 1 complete. Make sure your attendance is tracked.'
            ];
            const saraMidLab = [
              'S.A.R.A: Hour 1 of lab elapsed. Input attendance data if required.',
              'S.A.R.A: Mid-lab checkpoint. Ensure your presence is officially recorded.'
            ];
            const midLabBody = saraEscalation ? getRandomMessage(saraMidLab) : getRandomMessage(stdMidLab);

            await schedule(
              `🧪 ${sess.subject} — 1st hour done`,
              midLabBody,
              midTrigger,
              { type: 'lab_mid', subject: sess.subject, subjectId: sid, time: sess.time },
              'default',
              actionableNotifs ? 'class_reminder' : undefined,
            );
          }
        }

        // ── Lab: notification at end (2hr mark + optional delay) ──────────────
        const labEndDelayMs = parseInt(kv[`@class_notif_lab_end_delay_${sid}`] || '0', 10) * 60 * 1000;
        const labEndTrigger = new Date(sess.startMs + LAB_DURATION_MS + labEndDelayMs);
        // BUG-N1 FIX: Skip lab-end log reminder if lab already logged.
        const alreadyLoggedLabEnd = attendanceLogs.some(
          l => l.subjectId === sid && l.date === dateStr && l.type === 'lab' && !l.isExtra
        );
        if (!alreadyLoggedLabEnd) {
          const stdPostLab = [
            'Lab session done! Were you present? Tap to mark it now.',
            'You survived lab! Take a second to log your attendance.',
            'Lab is over. Make sure you get credit for being there.'
          ];
          const saraPostLab = [
            'S.A.R.A: Lab session terminated. Confirm your attendance protocol.',
            'S.A.R.A: Lab complete. Log your final attendance status.'
          ];
          const postLabBody = saraEscalation ? getRandomMessage(saraPostLab) : getRandomMessage(stdPostLab);

          await schedule(
            `📝 Log attendance — ${sess.subject}`,
            postLabBody,
            labEndTrigger,
            { type: 'lab_log', subject: sess.subject, subjectId: sid, time: sess.time },
            'default',
            actionableNotifs ? 'class_reminder' : undefined,
          );
        }
      }
    }
  } // end for (let i = 0; i <= 2; i++)

  // ── 12. Inactivity nudge ─────────────────────────────────────────────────────
  if (inactivityNudge) {
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() - inactivityDays);
    const thresholdStr = thresholdDate.toISOString().slice(0, 10);

    const recentTask  = tasks.find(t    => t.completedAt && t.completedAt >= thresholdStr);
    const recentHabit = habitLogs.find(l => l.date >= thresholdStr);
    const recentGym   = gymLogs.find(g  => g.date >= thresholdStr);

    if (!recentTask && !recentHabit && !recentGym) {
      const stdNudge = [
        `Haven't seen you in ${inactivityDays} days. Pick one habit and check it off — momentum beats perfection.`,
        `It's been ${inactivityDays} days. A 5-minute task is all it takes to get back on track.`,
        `Take a deep breath and jump back in. You've been away for ${inactivityDays} days.`
      ];
      const saraNudge = [
        `S.A.R.A: ${inactivityDays} days of complete inactivity detected. This is how discipline dies. Log in.`,
        `S.A.R.A: System alert. You have abandoned your routines for ${inactivityDays} days. Report back immediately.`
      ];
      const nudgeBody = saraEscalation ? getRandomMessage(saraNudge) : getRandomMessage(stdNudge);

      const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
      await schedule(
        'Still there? 👋',
        nudgeBody,
        trigger, { type: 'inactivity' }
      );
    }
  }

  // ── 14. Sleep Reminders ────────────────────────────────────────────────────────
  const sleepRemindersEnabled = kv['@zentrack_sleep_reminders_enabled'] === 'true';
  if (sleepRemindersEnabled) {
    const nightTime = parseHM(kv['@zentrack_sleep_reminder_night'] || '22:00');
    const morningTime = parseHM(kv['@zentrack_sleep_reminder_morning'] || '07:00');
    
    const nightTrigger = dateAtHM(now, nightTime.hours, nightTime.minutes);
    const morningTrigger = dateAtHM(now, morningTime.hours, morningTime.minutes);

    // Night reminder: don't fire if already logged sleep today
    const hasLoggedSleepToday = sleepLogs.some(s => s.date === todayStr);
    if (!hasLoggedSleepToday && nightTrigger > now) {
      const stdNight = [
        'Ready for bed soon? Log your sleep to maintain your health streak.',
        'Time to wind down. Screens off, get some rest.'
      ];
      const saraNight = [
        'S.A.R.A: Sleep is not optional. Log it and shut down.',
        'S.A.R.A: Recovery protocol initiated. Go to sleep.'
      ];
      await schedule(
        'Time to wind down 🌙',
        saraEscalation ? getRandomMessage(saraNight) : getRandomMessage(stdNight),
        nightTrigger, { type: 'sleep_night' }
      );
    }

    // BUG-N4 FIX: Morning reminder asks "how did you sleep last night?"
    // so it should check YESTERDAY's sleep log, not today's.
    // If the user logged sleep last night, this reminder is unnecessary.
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const ysY = yesterday.getFullYear();
    const ysM = String(yesterday.getMonth() + 1).padStart(2, '0');
    const ysD = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${ysY}-${ysM}-${ysD}`;
    const hasLoggedSleepYesterday = sleepLogs.some(s => s.date === yesterdayStr);
    if (!hasLoggedSleepYesterday && morningTrigger > now) {
      const stdMorning = [
        'How did you sleep last night? Log your hours to track your recovery.',
        'Good morning! Don\'t forget to record last night\'s sleep.'
      ];
      const saraMorning = [
        'S.A.R.A: Morning. Report your recovery metrics (sleep) immediately.',
        'S.A.R.A: Wake up. Log your sleep data so I can track your readiness.'
      ];
      await schedule(
        'Good Morning ☀️',
        saraEscalation ? getRandomMessage(saraMorning) : getRandomMessage(stdMorning),
        morningTrigger, { type: 'sleep_morning' }
      );
    }
  }

  // ── 15. Water Reminders ────────────────────────────────────────────────────────
  const waterReminderFreq = parseInt(kv['@zentrack_water_reminder_freq'] || '0', 10);
  if (waterReminderFreq > 0) {
    // BUG-N3 / I1 FIX: Check how much water has already been logged today.
    // If user has reached 2000ml (standard daily goal), skip ALL water reminders for today.
    // This prevents nagging the user who has already stayed well-hydrated.
    const savedWaterGoal = kv['zentrack_water_goal_ml'];
    const DAILY_WATER_GOAL_ML = savedWaterGoal ? parseInt(savedWaterGoal, 10) : 2000;
    const waterLoggedTodayMl = waterLogs
      .filter(w => w.date === todayStr)
      .reduce((sum, w) => sum + (w.amountMl || 0), 0);
    const waterGoalMet = waterLoggedTodayMl >= DAILY_WATER_GOAL_ML;

    const startHour = 6;
    const endHour = 23;
    // I5 IMPROVEMENT: Schedule for the next 2 days to ensure coverage
    // even if the app isn't opened for 2 days.
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const isToday = dayOffset === 0;
      // On today only: skip if daily goal is already met
      if (isToday && waterGoalMet) continue;

      for (let h = startHour; h <= endHour; h += waterReminderFreq) {
        // Build the trigger date properly by starting from a clean base date
        const baseDay = new Date(now);
        baseDay.setDate(baseDay.getDate() + dayOffset);
        const waterTrigger = dateAtHM(baseDay, h, 0);
        
        // Prevent "5-minute gap" issue: only schedule if >30 mins in the future
        const minGap = 30 * 60 * 1000;
        if (waterTrigger.getTime() <= now.getTime() + minGap) continue;

        // Dynamic body text based on how much user has logged today
        let waterBody: string;
        if (isToday && waterLoggedTodayMl > 0) {
          const remaining = DAILY_WATER_GOAL_ML - waterLoggedTodayMl;
          const remainingL = (remaining / 1000).toFixed(1);
          const goalL = (DAILY_WATER_GOAL_ML / 1000).toFixed(1);
          const loggedL = (waterLoggedTodayMl / 1000).toFixed(1);
          
          const stdWaterLogged = [
            `${loggedL}L logged today — ${remainingL}L to hit your ${goalL}L goal! 💧`,
            `You're at ${loggedL}L. Just ${remainingL}L away from today's target.`
          ];
          const saraWaterLogged = [
            `S.A.R.A: ${loggedL}L is insufficient. Consume ${remainingL}L to meet your ${goalL}L quota.`,
            `S.A.R.A: You are ${remainingL}L short of optimal hydration. Drink.`
          ];
          waterBody = saraEscalation ? getRandomMessage(saraWaterLogged) : getRandomMessage(stdWaterLogged);
        } else {
          const stdWaterEmpty = [
            'Time to drink some water and stay hydrated! 💧',
            'Grab a glass of water. Keep your body fueled.'
          ];
          const saraWaterEmpty = [
            'S.A.R.A: Hydration levels critical. Drink water immediately.',
            'S.A.R.A: You haven\'t logged any water today. Fix this.'
          ];
          waterBody = saraEscalation ? getRandomMessage(saraWaterEmpty) : getRandomMessage(stdWaterEmpty);
        }

        await schedule(
          'Hydration Check 💧',
          waterBody,
          waterTrigger, { type: 'water_reminder' }
        );
      }
    }
  }

  console.log('[Notifications] All notifications scheduled ✅');
  } // end of while(_latestParams) loop
  } finally {
    _isScheduling = false;
  }
}

// ── Test Notification ────────────────────────────────────────────────────────
export async function sendTestNotification(userName?: string) {
  const name = userName ? userName.split(' ')[0] : 'there';
  const bodies = [
    `Hey ${name}, your notifications are working perfectly! 🚀`,
    `${name}, S.A.R.A is online and tracking. 📡`,
    `System check complete, ${name}. All comms are green. ✅`
  ];
  const body = bodies[Math.floor(Math.random() * bodies.length)];
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'S.A.R.A. System Check',
      body,
      sound: 'default',
      priority: 'max',
    },
    trigger: null, // immediate
  });
}

// ── Legacy compat export ──────────────────────────────────────────────────────
// BUG-C1 FIX: Previous shim silently dropped habitLogs, allHabits, assignments.
// All 3 are now forwarded so habit streak and assignment deadline notifications
// actually fire. All 7 params are optional for backward compatibility.
export async function scheduleTaskReminders(
  tasks: Task[] = [],
  customEvents: CustomEvent[] = [],
  gymLogs: GymLog[] = [],
  attendance: AttendanceSubject[] = [],
  habitLogs: HabitLog[] = [],
  allHabits: Habit[] = [],
  assignments: Assignment[] = [],
) {
  return scheduleAllNotifications({
    tasks, customEvents, gymLogs, attendance,
    habitLogs, allHabits, assignments,
  });
}

// ── Background Fetch ──
export const BACKGROUND_NOTIFICATION_SYNC_TASK = 'background-notification-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_SYNC_TASK, async () => {
  try {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Ensure Firebase is initialized in background thread
    let db;
    if (!getApps().length) {
      const firebaseConfig = {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
      };
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
    } else {
      db = getFirestore(getApps()[0]);
    }

    const tmp = new Date();
    const y = tmp.getFullYear();
    const m = String(tmp.getMonth() + 1).padStart(2, '0');
    const dStr = String(tmp.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${dStr}`;

    // Fetch essential data
    // BUG-C2 FIX: Was querying where('completed', '==', false) — the Task schema
    // uses a 'status' string field, NOT a 'completed' boolean. This caused the
    // background fetch to always return 0 tasks, making all night notifications stale.
    // I3 FIX: Added attendance_logs query so BUG-N1 fix (skip already-logged sessions)
    // works correctly in the background, not just when the app is open.
    const [tasksSnap, eventsSnap, gymSnap, attendanceSnap, attendanceLogsSnap, habitsSnap, habitLogsSnap, assignmentsSnap, waterSnap, sleepSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTION.TASKS), where('userId', '==', userId), where('status', 'in', ['pending', 'in_progress']))),
      getDocs(query(collection(db, COLLECTION.CALENDAR_EVENTS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.GYM_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ATTENDANCE), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.ATTENDANCE_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.HABITS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ASSIGNMENTS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.WATER_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.SLEEP_LOGS), where('userId', '==', userId), where('date', '>=', todayStr)))
    ]);

    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
    const customEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent));
    const gymLogs = gymSnap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog));
    const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject));
    const attendanceLogs = attendanceLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
    const allHabits = habitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
    const habitLogs = habitLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog));
    const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
    const waterLogs = waterSnap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog));
    const sleepLogs = sleepSnap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog));

    await scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance, attendanceLogs, allHabits, habitLogs, assignments, waterLogs, sleepLogs });
    
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
        minimumInterval: 60 * 60 * 4, // 4 hours
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
  // BUG-M5 FIX: Using static top-of-file imports instead of synchronous require().
  // Synchronous require() blocked the JS thread on first app open for ~40-100ms.
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return undefined;
    }
    
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
    try {
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log('[Notifications] Push token generated:', token);
    } catch (e) {
      console.error('[Notifications] Error getting push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

// ── App Notification Settings Reader for Sara ─────────────────────────────────

export interface AppNotificationSettings {
  modTasks: boolean;
  modHabits: boolean;
  modGym: boolean;
  modAttendance: boolean;
  modAssignments: boolean;
  modFocus: boolean;
  habitStreakAtRisk: boolean;
  overdueNudge: boolean;
  assignmentAlert48h: boolean;
  assignmentAlert24h: boolean;
  gymRestDay: boolean;
  weeklyReview: boolean;
  attendanceWarning: boolean;
  morningBrief: boolean;
  inactivityNudge: boolean;
  xpMilestone: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  morningBriefTime: string;
  overdueNudgeTime: string;
  habitStreakTime: string;
  taskBuffer: string;
  weekendMode: boolean;
  saraEscalation: boolean;
  actionableNotifs: boolean;
  gymNotificationTime: string;
  gymNotificationEnabled: boolean;
}

export async function getAppNotificationSettings(): Promise<{ settings: AppNotificationSettings; summary: string }> {
  const keys = [
    'zentrack_notif_mod_tasks', 'zentrack_notif_mod_habits', 'zentrack_notif_mod_gym',
    'zentrack_notif_mod_attendance', 'zentrack_notif_mod_assignments', 'zentrack_notif_mod_focus',
    'zentrack_notif_habit_streak_risk', 'zentrack_notif_overdue_nudge',
    'zentrack_notif_assignment_48h', 'zentrack_notif_assignment_24h', 'zentrack_notif_gym_rest_day',
    'zentrack_notif_weekly_review', 'zentrack_notif_attendance_warning', 'zentrack_notif_morning_brief',
    'zentrack_notif_inactivity_nudge', 'zentrack_notif_xp_milestone', 'zentrack_notif_quiet_hours',
    'zentrack_notif_quiet_start', 'zentrack_notif_quiet_end', 'zentrack_notif_morning_brief_time',
    'zentrack_notif_overdue_nudge_time', 'zentrack_notif_habit_streak_time', 'zentrack_notif_task_buffer',
    'zentrack_notif_weekend_mode', 'zentrack_notif_sara_escalation', 'zentrack_notif_actionable_notifs',
    '@gym_notification_time', '@gym_notification_enabled',
  ];

  try {
    const results = await AsyncStorage.multiGet(keys);
    const dict: Record<string, string | null> = Object.fromEntries(results);

    const getB = (k: string, def = true) => {
      const fullK = k.startsWith('@') ? k : `zentrack_notif_${k}`;
      const v = dict[fullK];
      return v === null || v === undefined ? def : v === 'true';
    };
    const getS = (k: string, def: string) => {
      const fullK = k.startsWith('@') ? k : `zentrack_notif_${k}`;
      return dict[fullK] ?? def;
    };

    const settings: AppNotificationSettings = {
      modTasks: getB('mod_tasks'),
      modHabits: getB('mod_habits'),
      modGym: getB('mod_gym'),
      modAttendance: getB('mod_attendance'),
      modAssignments: getB('mod_assignments'),
      modFocus: getB('mod_focus'),
      habitStreakAtRisk: getB('habit_streak_risk'),
      overdueNudge: getB('overdue_nudge'),
      assignmentAlert48h: getB('assignment_48h'),
      assignmentAlert24h: getB('assignment_24h'),
      gymRestDay: getB('gym_rest_day', false),
      weeklyReview: getB('weekly_review'),
      attendanceWarning: getB('attendance_warning'),
      morningBrief: getB('morning_brief'),
      inactivityNudge: getB('inactivity_nudge'),
      xpMilestone: getB('xp_milestone'),
      quietHours: getB('quiet_hours'),
      quietStart: getS('quiet_start', '23:00'),
      quietEnd: getS('quiet_end', '07:00'),
      morningBriefTime: getS('morning_brief_time', '07:30'),
      overdueNudgeTime: getS('overdue_nudge_time', '08:00'),
      habitStreakTime: getS('habit_streak_time', '20:00'),
      taskBuffer: getS('task_buffer', '60'),
      weekendMode: getB('weekend_mode', false),
      saraEscalation: getB('sara_escalation'),
      actionableNotifs: getB('actionable_notifs'),
      gymNotificationTime: getS('@gym_notification_time', '18:00'),
      gymNotificationEnabled: getB('@gym_notification_enabled'),
    };

    const summary = `═══ NOTIFICATION & APP SETTINGS (LIVE REALTIME READ ACCESS) ═══
- Morning Briefing: ${settings.morningBrief ? 'ENABLED' : 'DISABLED'} at ${settings.morningBriefTime}
- Overdue Task Nudge: ${settings.overdueNudge ? 'ENABLED' : 'DISABLED'} at ${settings.overdueNudgeTime}
- Habit Streak Risk Reminder: ${settings.habitStreakAtRisk ? 'ENABLED' : 'DISABLED'} at ${settings.habitStreakTime}
- Quiet Hours: ${settings.quietHours ? 'ENABLED' : 'DISABLED'} (${settings.quietStart} to ${settings.quietEnd})
- Pre-Task Warning Buffer: ${settings.taskBuffer} minutes before due time
- Gym Reminder: ${settings.gymNotificationEnabled ? 'ENABLED' : 'DISABLED'} at ${settings.gymNotificationTime}
- Module Toggles: Tasks (${settings.modTasks ? 'ON' : 'OFF'}), Habits (${settings.modHabits ? 'ON' : 'OFF'}), Gym (${settings.modGym ? 'ON' : 'OFF'}), Attendance (${settings.modAttendance ? 'ON' : 'OFF'}), Assignments (${settings.modAssignments ? 'ON' : 'OFF'})
- Smart Alerts: Attendance Warning (${settings.attendanceWarning ? 'ON' : 'OFF'}), 48h Assignment Alert (${settings.assignmentAlert48h ? 'ON' : 'OFF'}), 24h Assignment Alert (${settings.assignmentAlert24h ? 'ON' : 'OFF'})`;

    return { settings, summary };
  } catch (err: any) {
    return {
      settings: {
        modTasks: true, modHabits: true, modGym: true, modAttendance: true, modAssignments: true, modFocus: true,
        habitStreakAtRisk: true, overdueNudge: true, assignmentAlert48h: true, assignmentAlert24h: true, gymRestDay: false,
        weeklyReview: true, attendanceWarning: true, morningBrief: true, inactivityNudge: true, xpMilestone: true,
        quietHours: true, quietStart: '23:00', quietEnd: '07:00', morningBriefTime: '07:30', overdueNudgeTime: '08:00',
        habitStreakTime: '20:00', taskBuffer: '60', weekendMode: false, saraEscalation: true, actionableNotifs: true,
        gymNotificationTime: '18:00', gymNotificationEnabled: true,
      },
      summary: '═══ NOTIFICATION & APP SETTINGS ═══\nDefaults active (Morning brief: 07:30, Quiet hours: 23:00-07:00, Task buffer: 60m)',
    };
  }
}

