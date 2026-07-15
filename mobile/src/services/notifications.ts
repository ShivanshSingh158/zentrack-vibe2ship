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
import {
  Task, CustomEvent, GymLog, AttendanceSubject,
  HabitLog, Habit, Assignment,
} from '../contexts/MobileDataContext';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';

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

export async function scheduleAllNotifications(params: ScheduleParams) {
  const { tasks = [], customEvents = [], gymLogs = [], attendance = [], habitLogs = [], allHabits = [], assignments = [] } = params;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // ── Load all user preferences ────────────────────────────────────────────────
  const modTasks       = await getBool('mod_tasks');
  const modHabits      = await getBool('mod_habits');
  const modGym         = await getBool('mod_gym');
  const modAttendance  = await getBool('mod_attendance');

  const habitStreakRisk    = await getBool('habit_streak_risk');
  const overdueNudge       = await getBool('overdue_nudge');
  const assignment48h      = await getBool('assignment_48h');
  const assignment24h      = await getBool('assignment_24h');
  const gymRestDay         = await getBool('gym_rest_day', false);
  const weeklyReview       = await getBool('weekly_review');
  const attendanceWarning  = await getBool('attendance_warning');
  const morningBriefEnabled = await getBool('morning_brief');
  const inactivityNudge    = await getBool('inactivity_nudge');
  const quietHoursEnabled  = await getBool('quiet_hours');
  const weekendMode        = await getBool('weekend_mode', false);
  const saraEscalation     = await getBool('sara_escalation', true);
  const actionableNotifs   = await getBool('actionable_notifs', true);

  const morningBriefTimeStr = await getString('morning_brief_time', '07:30');
  const overdueNudgeTimeStr = await getString('overdue_nudge_time', '08:00');
  const quietStartStr       = await getString('quiet_start', '23:00');
  const quietEndStr         = await getString('quiet_end', '07:00');
  const taskBufferMin       = parseInt(await getString('task_buffer', '60'), 10);
  const inactivityDays      = parseInt(await getString('inactivity_days', '3'), 10);
  const habitStreakTimeStr   = await getString('habit_streak_time', '20:00');

  const defaultTimeStr = await AsyncStorage.getItem('zentrack_default_notif_time') || '08:00';
  const defaultTime = parseHM(defaultTimeStr);

  // Gym prefs (legacy keys kept for compatibility)
  const gymNotifTimeStr    = await AsyncStorage.getItem('@gym_notification_time');
  const gymNotifEnabledStr = await AsyncStorage.getItem('@gym_notification_enabled');
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
    if (isQuiet(trigger)) return;
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
        date: trigger,
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
        // Extremely simple check: if gym logs exist but not yesterday
        const missedGym = gymLogs.length > 0 && !gymLogs.some(g => g.date === yesterdayStr);
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
    for (const habit of unloggedHabits.slice(0, 3)) {
      if ((habit.streak || 0) >= 2) {
        const title = saraEscalation ? 'S.A.R.A Warning ⚠️' : 'Streak at risk 🔥';
        const body = saraEscalation 
          ? `Your ${habit.streak}-day streak for "${habit.name}" is about to break. Don't ruin your momentum now.`
          : `"${habit.name}" — ${habit.streak} day streak ends at midnight if you skip today.`;
        await schedule(title, body, trigger, { type: 'habit_streak', habitId: habit.id }, saraEscalation ? 'sara_critical' : 'habits');
      }
    }
  }

  // ── 5 & 6. Assignment due alerts ─────────────────────────────────────────────
  if (modAttendance) {
    for (const asn of assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate)) {
      const [y, m, d] = asn.dueDate.split('-').map(Number);
      if (!y) continue;
      const dueDate = new Date(y, m - 1, d);

      // 48h alert
      if (assignment48h) {
        const t48 = new Date(dueDate.getTime() - 48 * 60 * 60 * 1000);
        t48.setHours(9, 0, 0, 0);
        await schedule('Assignment due in 48h 📚', `"${asn.title}" is due in 2 days. Start early.`, t48, { type: 'assignment_48h', asnId: asn.id });
      }
      // 24h alert
      if (assignment24h) {
        const t24 = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
        t24.setHours(9, 0, 0, 0);
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

  // ── 9. Weekly review reminder (Sunday evening) ───────────────────────────────
  if (weeklyReview) {
    const daysUntilSunday = (7 - now.getDay()) % 7;
    for (let i = daysUntilSunday === 0 ? 0 : daysUntilSunday; i <= daysUntilSunday + 7; i += 7) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(20, 0, 0, 0);
      await schedule(
        'Weekly review time 📊',
        'Sunday check-in: reflect on what went well, what to improve, and set next week\'s priorities.',
        d, { type: 'weekly_review' }
      );
      break;
    }
  }

  // ── Gym + Classes for next 7 days ────────────────────────────────────────────
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr  = d.toISOString().slice(0, 10);
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
      
      // Trigger exactly 1 hour after class starts to log attendance
      const triggerTime = new Date(classTime.getTime() + 60 * 60 * 1000);
      
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
// Old callers (MobileDataContext useEffect) use scheduleTaskReminders
export async function scheduleTaskReminders(
  tasks: Task[] = [],
  customEvents: CustomEvent[] = [],
  gymLogs: GymLog[] = [],
  attendance: AttendanceSubject[] = [],
) {
  return scheduleAllNotifications({ tasks, customEvents, gymLogs, attendance });
}
