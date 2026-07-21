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
  HabitLog, Habit, Assignment,
} from '../contexts/MobileDataContext';
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
      { identifier: 'mark_present', buttonTitle: 'Present' },
      { identifier: 'mark_bunking', buttonTitle: 'Bunking', options: { isDestructive: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('gym_reminder', [
      { identifier: 'start_workout', buttonTitle: 'Start Workout' },
      { identifier: 'snooze_15m', buttonTitle: 'Snooze 15m' },
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

// ── Main export ───────────────────────────────────────────────────────────────

export interface ScheduleParams {
  tasks: Task[];
  customEvents: CustomEvent[];
  gymLogs: GymLog[];
  attendance: AttendanceSubject[];
  habitLogs?: HabitLog[];
  allHabits?: Habit[];
  assignments?: Assignment[];
}

// ── O1/M10: Data Fingerprint Cache ───────────────────────────────────────────
// Prevents the full cancel-and-reschedule cycle from running on every Firestore
// snapshot burst at app startup (fires 10-15 times in the first 5 seconds).
// If task count, habit count, gym log count, and assignment count are all the
// same as last run, skip entirely. Estimated savings: 50-100 cycles per session.
let _lastScheduleFingerprint: string | null = null;

function _buildFingerprint(params: ScheduleParams): string {
  return [
    params.tasks.length,
    (params.habitLogs || []).length,
    (params.gymLogs || []).length,
    (params.assignments || []).length,
    // Include today's date so midnight always triggers a fresh schedule
    new Date().toISOString().slice(0, 10),
  ].join('|');
}

export async function scheduleAllNotifications(params: ScheduleParams) {
  const { tasks = [], customEvents = [], gymLogs = [], attendance = [], habitLogs = [], allHabits = [], assignments = [] } = params;

  // O1/M10 FIX: Skip full reschedule if data fingerprint hasn't changed.
  const fingerprint = _buildFingerprint({ tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments });
  if (fingerprint === _lastScheduleFingerprint) {
    console.log('[Notifications] Data unchanged — skipping reschedule.');
    return;
  }
  _lastScheduleFingerprint = fingerprint;

  await Notifications.cancelAllScheduledNotificationsAsync();

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
    'zentrack_notif_habit_streak_time', 'zentrack_default_notif_time',
    '@gym_notification_time', '@gym_notification_enabled',
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
      
      let title = 'Good Morning 🌅';
      let body = `Today: ${summary}. What's your first move?`;
      
      if (saraEscalation && modGym) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        // BUG-M7 FIX: Only complain about missed gym if yesterday was a SCHEDULED gym day.
        // Previously this fired on ANY day where gymLogs existed but yesterday had none —
        // which includes rest days and weekends when no workout was planned.
        const yesterdayDayIndex = WEEKDAY_TO_PLAN[yesterday.getDay()];
        const yesterdayPlan = GYM_PLAN.find(p => p.dayIndex === yesterdayDayIndex);
        const wasScheduledGymDay = yesterdayPlan && !yesterdayPlan.isRest;
        const missedGym = wasScheduledGymDay && !gymLogs.some(g => g.date === yesterdayStr);
        if (missedGym) {
          title = 'S.A.R.A Here 🤖';
          body = `I didn't see a workout logged yesterday. Are we skipping two days in a row? Let's go. Today: ${summary}.`;
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
      const on = parseHM(overdueNudgeTimeStr);
      const trigger = dateAtHM(now, on.hours, on.minutes);
      await schedule(
        'Tasks still pending ⚠️',
        `${overdueTasks.length} task${overdueTasks.length !== 1 ? 's' : ''} from yesterday left open. Reschedule or close them.`,
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
        await schedule('Mission window 🎯', `Your mission opens in ${taskBufferMin} min: "${task.title}"`, t1, { taskId: task.id }, 'reminders');
        const t15 = new Date(base.getTime() - 15 * 60 * 1000);
        if (taskBufferMin > 15) {
          await schedule('T-15 minutes ⚡', `Almost time: ${task.title}`, t15, { taskId: task.id }, 'reminders');
        }
      } else {
        base.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
        await schedule('Daily target 📋', `Pending today: "${task.title}"`, base, { taskId: task.id });
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
      const title = saraEscalation ? 'S.A.R.A Warning ⚠️' : 'Streak at risk 🔥';
      const body = saraEscalation
        ? `Your ${habit.streak}-day streak for "${habit.name}" is about to break. Don't ruin your momentum now.`
        : `"${habit.name}" — ${habit.streak} day streak ends at midnight if you skip today.`;
      await schedule(title, body, trigger, { type: 'habit_streak', habitId: habit.id }, saraEscalation ? 'sara_critical' : 'habits');
    }
  }

  // ── 5 & 6. Assignment due alerts ─────────────────────────────────────────────
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
      const pct = (subj.classesAttended / subj.classesTotal) * 100;
      if (pct < THRESHOLD) {
        const trigger = dateAtHM(now, 9, 0);
        const title = saraEscalation ? 'S.A.R.A Critical Alert 🚨' : 'Attendance warning 📉';
        const body = saraEscalation 
          ? `Your attendance in ${subj.name} is slipping to ${pct.toFixed(0)}%. You absolutely cannot afford to miss this lecture.`
          : `${subj.name}: ${pct.toFixed(0)}% — below ${THRESHOLD}% threshold. Missing more classes could fail you.`;
        
        await schedule(title, body, trigger, { type: 'attendance_warning', subjectId: subj.id }, saraEscalation ? 'sara_critical' : 'default');
      }
    }
  }

  // ── 9. Weekly review reminder (Sunday evening, recurring) ───────────────────
  // BUG-M2 FIX: Was using a loop with a break — only ever scheduled once.
  // Now uses Expo's native WEEKLY trigger for true infinite recurrence.
  if (weeklyReview) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Weekly review time 📊',
          body: 'Sunday check-in: reflect on what went well, what to improve, and set priorities.',
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
      await schedule('Weekly review time 📊',
        'Sunday check-in: reflect on what went well, set priorities.',
        d, { type: 'weekly_review' });
    }
  }

  // ── Gym + Classes for next 7 days ────────────────────────────────────────────
  for (let i = 0; i < 7; i++) {
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
    const plan = GYM_PLAN.find(p => p.dayIndex === planIndex);

    if (plan && !plan.isRest && gymNotifEnabled) {
      const hasLogged = gymLogs.some(g => g.date === dateStr);
      if (!hasLogged) {
        await schedule(
          'Gym day 🏋️',
          `Time for ${plan.name}. One workout closer to your goal.`,
          dateAtHM(d, gymNotifHours, gymNotifMinutes),
          { type: 'gym' },
          'default',
          actionableNotifs ? 'gym_reminder' : undefined
        );
      }
    }

    // ── 8. Rest day reminder ─────────────────────────────────────────────────
    if (gymRestDay && plan?.isRest && modGym) {
      await schedule(
        'Rest day 🧘',
        'Recovery day — light stretch or a 20-minute walk keeps momentum going.',
        dateAtHM(d, gymNotifHours, gymNotifMinutes),
        { type: 'gym_rest' }
      );
    }

    // ── 13. Class reminders ──────────────────────────────────────────────────
    if (!modAttendance) continue;
    const dayClasses: { subject: string; subjectId: string; time: string }[] = [];
    attendance.forEach(subj => {
      const sch = subj.schedule?.[dayOfWeek.toString()];
      if (!sch) return;
      (sch.classes || []).forEach((c: any) => c.time && dayClasses.push({ subject: subj.name, subjectId: subj.id, time: c.time }));
      (sch.labs    || []).forEach((l: any) => l.time && dayClasses.push({ subject: `${subj.name} Lab`, subjectId: subj.id, time: l.time }));
    });

    const parsedClasses = dayClasses
      .map(c => ({ ...c, parsed: parseTimeString(c.time) }))
      .filter(c => c.parsed !== null)
      .sort((a, b) => (a.parsed!.hours * 60 + a.parsed!.minutes) - (b.parsed!.hours * 60 + b.parsed!.minutes));

    for (let ci = 0; ci < parsedClasses.length; ci++) {
      const cls = parsedClasses[ci];
      const classTime = dateAtHM(d, cls.parsed!.hours, cls.parsed!.minutes);
      
      // BUG-H3 FIX: Was firing 1h after class START (while user is still in class).
      // Now fires 15 min after a standard 60-min class ends = 75 min after start.
      const triggerTime = new Date(classTime.getTime() + 75 * 60 * 1000);

      await schedule(
        'Log Attendance 📝',
        `Were you present for ${cls.subject}?`,
        triggerTime,
        { type: 'class', subject: cls.subject, subjectId: cls.subjectId, time: cls.time },
        'default',
        actionableNotifs ? 'class_reminder' : undefined
      );
    }
  }

  // ── 12. Inactivity nudge ─────────────────────────────────────────────────────
  if (inactivityNudge) {
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() - inactivityDays);
    const thresholdStr = thresholdDate.toISOString().slice(0, 10);

    const recentTask  = tasks.find(t    => t.completedAt && t.completedAt >= thresholdStr);
    const recentHabit = habitLogs.find(l => l.date >= thresholdStr);
    const recentGym   = gymLogs.find(g  => g.date >= thresholdStr);

    if (!recentTask && !recentHabit && !recentGym) {
      const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
      await schedule(
        'Still there? 👋',
        `Haven't seen you in ${inactivityDays} days. Pick one habit and check it off — momentum beats perfection.`,
        trigger, { type: 'inactivity' }
      );
    }
  }

  console.log('[Notifications] All notifications scheduled ✅');
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
    const [tasksSnap, eventsSnap, gymSnap, attendanceSnap, habitsSnap, habitLogsSnap, assignmentsSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTION.TASKS), where('userId', '==', userId), where('status', 'in', ['pending', 'in_progress']))),
      getDocs(query(collection(db, COLLECTION.CALENDAR_EVENTS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.GYM_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ATTENDANCE), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.HABITS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ASSIGNMENTS), where('userId', '==', userId)))
    ]);

    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
    const customEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent));
    const gymLogs = gymSnap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog));
    const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject));
    const allHabits = habitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
    const habitLogs = habitLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog));
    const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));

    await scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance, allHabits, habitLogs, assignments });
    
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
