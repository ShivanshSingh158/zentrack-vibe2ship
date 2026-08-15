/**
 * notifications.ts — ZenTrack Mobile
 *
 * scheduleAllNotifications() — the single source of truth for all local notifications.
 * Reads all user prefs from AsyncStorage before scheduling.
 *
 * FEATURES & REVAMPS:
 *  1. 2-Day Rolling Window: Schedules exclusively for Today + Tomorrow (0 and 1 day ahead)
 *     to prevent alarm exhaustion, memory bloat, and stale notifications.
 *  2. Smart Rate Limiting & Alarm Budget: Safety cap of 64 alarms with deduplication.
 *  3. Dynamic Hinglish & Sara Persona: Multi-variant randomized message pools for
 *     playful cheesy nudges, gym hype, and academic reality checks.
 *  4. Actionable Notifications: Mark Done, Log Habit, Log Attendance, Start Workout buttons.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getDocs, collection, query, where, getFirestore } from 'firebase/firestore';
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

    // Actionable Notification Categories
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimeString(t?: string): { hours: number; minutes: number } | null {
  if (!t || typeof t !== 'string') return null;
  const str = t.trim().toLowerCase();

  // Pattern 1: "9:30 am", "09:30pm", "9.30 am", "14:30"
  const colonMatch = str.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const min = parseInt(colonMatch[2], 10);
    const ampm = colonMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!isNaN(h) && !isNaN(min) && h >= 0 && h < 24 && min >= 0 && min < 60) {
      return { hours: h, minutes: min };
    }
  }

  // Pattern 2: "9 am", "11pm", "9am"
  const hourAmPmMatch = str.match(/(\d{1,2})\s*(am|pm)/);
  if (hourAmPmMatch) {
    let h = parseInt(hourAmPmMatch[1], 10);
    const ampm = hourAmPmMatch[2];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!isNaN(h) && h >= 0 && h < 24) {
      return { hours: h, minutes: 0 };
    }
  }

  // Pattern 3: Raw hour e.g. "9", "14"
  const rawH = parseInt(str, 10);
  if (!isNaN(rawH) && rawH >= 0 && rawH < 24) {
    return { hours: rawH, minutes: 0 };
  }

  return null;
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

function getRandomMessage(messages: string[]): string {
  if (!messages || messages.length === 0) return '';
  return messages[Math.floor(Math.random() * messages.length)];
}

// ── Shuffled Hinglish Notification Pools ───────────────────────────────────────

const MORNING_BRIEF_STANDARD_POOLS = (summary: string) => [
  `Utho utho, aankhein kholo! Aaj ${summary} pending hain... thoda kuchu puchu kaam kar lo na please? 🥹`,
  `Subah ho gayi champ! ☀️ Aaj ka docket ready hai: ${summary}. Chalo shuru ho jao!`,
  `Sara: Status report ready hai! Aaj ${summary} niptana hai. Let's make today productive 🚀`,
  `Oye suno, uth jao! Aaj ${summary} line mein lage hain. Chai piyo aur focus shuru karo ☕`,
  `A new day, a new grind! Aaj ka target: ${summary}. Shaam ko guilt-free chill karna hai toh abhi lag jao!`,
  `Sara: Good morning! Aaj ka mission map set hai: ${summary}. Let's execute without delay 🎯`,
  `Aankh khulte hi phone dekh liya na? Chalo ab ${summary} bhi complete kar lo cutie ✨`,
];

const MORNING_BRIEF_MISSED_GYM_POOLS = (summary: string) => [
  `Kal gym kyu miss kiya tha? 👀 Aaj double mehnat karni padegi! Agenda: ${summary}.`,
  `Sara: Kal ka workout skip ho gaya tha. Aaj no excuses, pehle gym aur fir ${summary}!`,
  `Bhai kal gym nahi gaye the na? Aaj compensate karna hai. Target: ${summary}.`,
  `Kal ka cheat day over! Aaj ${summary} ke sath workout bhi compulsory hai 🏋️`,
];

const TASK_BUFFER_POOLS = (title: string, bufferMin: number) => [
  `Hey cutie, "${title}" shuru karne mein bas ${bufferMin} min baki hain! Phone side rakho aur ready ho jao 🚀`,
  `Prep time! "${title}" ka execution window ${bufferMin} min mein khul raha hai. Chai/coffee ready rakhna ☕`,
  `Sara: Standby. ${bufferMin} minutes until "${title}". Distractions eliminate karo 🎯`,
  `Next mission approaching in ${bufferMin} mins: "${title}". Thoda focus mode on karo!`,
  `Alarm check! ${bufferMin} minute bache hain "${title}" ke liye. Mental preparation shuru karo 🧠`,
  `Oye, "${title}" ka time aa raha hai (${bufferMin}m). Aalsi mat bano, ready raho!`,
];

const TASK_T15_POOLS = (title: string) => [
  `Bas 15 minute baki hain! "${title}" shuru hone wala hai. Final prep kar lo ⚡`,
  `Sara: T-minus 15 minutes to "${title}". Deep breath lo aur focus mode lock karo 🔒`,
  `15 minutes out! Jo kar rahe ho wrap up karo, next objective is "${title}" 🎯`,
  `Tik-tok! 15 min mein "${title}" ka countdown over. Let's crush it!`,
  `Sara: 15-minute alert. Stop multitasking and jump into "${title}" now.`,
  `Hero banne ka time aa gaya! 15 min mein "${title}" start ho raha hai 🔥`,
];

const TASK_DAILY_POOLS = (title: string) => [
  `Aaj ye kaam niptana hai: "${title}". Shaam tak pending mat chhodna please 🥹`,
  `Sara: Today's agenda item: "${title}". Schedule it or knock it out now 📋`,
  `Radar pe ek task hai: "${title}". Free time mein sabse pehle yehi karna!`,
  `Don't forget "${title}" today! Done karke tick lagane ka alag hi maza hai ✨`,
  `Sara: Objective logged for today: "${title}". Let's see it marked done.`,
  `Ek chhota sa mission bacha hai: "${title}". Fatafat niptate hain!`,
];

const OVERDUE_TASK_POOLS = (countStr: string) => [
  `Kal ke ${countStr} ro rahe hain kone mein... 🥺 Aaj unhe khatam karke khush kar do!`,
  `Sara: Kal ka kaam kal par chhod diya? ${countStr} pending hain. Clear the backlog now ⚠️`,
  `Aalsi mat bano yaar! Yesterday's ${countStr} are still waiting for you. Niptao fatafat!`,
  `Procrastination alert! ${countStr} overdue hain. Ek cup coffee piyo aur abhi finish karo ☕`,
  `Sara: Backlog badhta ja raha hai (${countStr}). Don't let yesterday ruin today's momentum.`,
  `Kal ka pending kaam aaj ka headache banega agar abhi ${countStr} complete nahi kiye toh!`,
];

const HABIT_STREAK_RISK_POOLS = (habitName: string, streakCount: number) => [
  `Oye! ${streakCount} din ki mehnat barbad mat karo yaar! Bas 2 min deke "${habitName}" log kar lo na 🥺💔`,
  `Sara: Your ${streakCount}-day streak for "${habitName}" is about to reset at midnight. Save it now! 🔥`,
  `12 bajne wale hain! "${habitName}" ki ${streakCount}-day streak toot jayegi bhai, jaldi log karo ⏳`,
  `Sara: I refuse to let your ${streakCount}-day streak for "${habitName}" die today. Complete it!`,
  `Itni mehnat se ${streakCount} days banaye the, ab aalsi banoge kya? Tap karke "${habitName}" log karo 👑`,
  `Streak alert! "${habitName}" (${streakCount}d) is crying for a checkmark. Jaldi bacha lo!`,
];

const HABIT_DAILY_30_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days of "${habitName}"! King/Queen behavior 👑 Legend streak alive rakho!`,
  `Sara: ${streakCount} days! Ek mahine se upar ki discipline. Don't let the empire crumble today.`,
  `Ek mahina ho gaya! "${habitName}" is now in your DNA. Log today's checkmark ✨`,
];

const HABIT_DAILY_7_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days strong! Ek pura week in the bag 🔥 "${habitName}" log karo aur aage badho.`,
  `Sara: ${streakCount} days. Real momentum build ho raha hai. Don't break the chain now.`,
  `Keep the fire burning! "${habitName}" ka day ${streakCount + 1} unlock karo 💥`,
];

const HABIT_DAILY_1_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} of "${habitName}"! Chhote steps se hi bada badlav aata hai 🌱`,
  `Sara: Consistency is key. Day ${streakCount} of "${habitName}" complete karo.`,
  `Streak active hai! Tap karke "${habitName}" log kar lo cutie ✨`,
];

const HABIT_DAILY_0_POOLS = (habitName: string) => [
  `Aaj se nayi shuruat! Day 1 of "${habitName}" start karo aaj hi 🚀`,
  `Sara: Kal kare so aaj kar! "${habitName}" aaj se shuru karte hain.`,
  `A blank slate. Shuruat karne ka best time aaj hai: "${habitName}" ✨`,
];

const GYM_WORKOUT_POOLS = (planName: string, countSuffix: string) => [
  `Iron is calling you! 🦾 Aaj ${planName}${countSuffix} phodna hai. Pre-workout piyo aur nikal pado!`,
  `Biceps bol rahe hain gym le chalo! 🥺 Aaj ka ${planName} miss kiya toh gains naraz ho jayenge 💥`,
  `Sara: Your ${planName} session is scheduled. Discipline over motivation. Go hit the weights!`,
  `Gym bro alert! ${planName}${countSuffix} ka time ho gaya. No excuses, pump await kar raha hai 🏋️`,
  `Shaam ho gayi, iron ready hai! ${planName} karke din ko legendary banao 🔥`,
  `Sara: ${planName} time. Put on your workout shoes and let's conquer today's lifts.`,
];

const GYM_REST_DAY_POOLS = () => [
  `Aaram karo sher! 🛌 Aaj official recovery mode hai. Proper protein khao aur relax karo.`,
  `Sara: Scheduled rest day. Central nervous system recharge karo, overtraining avoid karo 💆‍♂️`,
  `Active rest day! Thoda walk kar lo ya light stretch, kal heavy compound lifts phodne hain 🚶‍♂️`,
  `Muscles are growing today! Eat clean, hydrate, and get 8+ hours of sleep tonight 🥑`,
  `Sara: Rest protocol active. Hydrate and let your muscle fibers repair for next workout.`,
];

const ATTENDANCE_CRITICAL_POOLS = (subjName: string, pct: string, needed: number) => [
  `Bhai class chale jao! 🚨 ${subjName} mein sirf ${pct}% attendance bachi hai! ${needed} classes attend karni padengi safe zone ke liye!`,
  `Sara: ${subjName} attendance dropped to ${pct}%. Debar list se bachna hai toh next ${needed} classes attend karo ⚠️`,
  `Danger zone! ${subjName} (${pct}%). Professor target kar rahe hain, kal se compulsory present rehna 🚨`,
  `Sara: Academic penalty risk. You are below 75% in ${subjName}. Attend ${needed} more classes immediately.`,
];

const CLASS_PRE_POOLS = (subject: string, time: string, timeStr: string) => [
  `${subject} starts at ${time || 'soon'} (${timeStr}) — baste uthao aur nikal pado! 🎒`,
  `Time to head out! ${subject} is at ${time || 'scheduled time'}. Proxy ka bharosa mat rakhna 😉`,
  `Don't be late! ${subject} begins at ${time || 'class time'}. Get your seat ready 📚`,
  `Sara: Your ${subject} lecture starts in ${timeStr}. Mobilize and be punctual.`,
  `Class alert! ${subject} in ${timeStr}. Grab your notes and water bottle 🏃‍♂️`,
];

const POST_CLASS_LOG_POOLS = (subject: string) => [
  `Class khatam! Present the ya bunk mara? Tap karke turant attendance log kar lo ✅`,
  `Sara: Class concluded. Report your attendance status immediately 📝`,
  `Ek aur class done! Fatafat attendance mark karo warna baad mein bhool jaoge 🧠`,
  `Proxy lagi ya khud the? Tap karke attendance record update karo 😉`,
  `Sara: Attendance verification required for ${subject}. Confirm your presence now.`,
];

const LAB_MID_POOLS = (subject: string) => [
  `Halfway through ${subject}! Don't forget to mark the first hour if required 🧪`,
  `Sara: Hour 1 of lab elapsed. Input attendance data if your college needs it.`,
  `Lab checkpoint! Pehla ghanta complete, attendance track rakhna ⏱️`,
  `Sara: Mid-lab status check. Confirm attendance for session 1.`,
];

const POST_LAB_LOG_POOLS = (subject: string) => [
  `Lab session done! You survived! 🧪 Tap karke final lab attendance mark kar lo.`,
  `Sara: Lab session terminated. Confirm your attendance protocol now.`,
  `Lab over! Practical credit lene ke liye abhi attendance log karo ✅`,
  `Sara: Lab complete. Log your final presence status.`,
];

const ASSIGNMENT_48H_POOLS = (title: string) => [
  `"${title}" submit karne ke sirf 2 din bache hain! Last night panic mat karna, aaj hi start kar lo ⏳`,
  `Sara: 48-hour alert for "${title}". Start early to avoid low-quality submissions.`,
  `Deadline countdown: "${title}" is due in 2 days. Thoda kaam aaj nipta lo 📚`,
  `Sara: Assignment approaching. Complete "${title}" before the last-minute server crash.`,
];

const ASSIGNMENT_24H_POOLS = (title: string) => [
  `Kal submission hai bhai! 🚨 "${title}" ka final push de do aaj raat!`,
  `Sara: FINAL 24 HOURS for "${title}". Stop procrastinating and submit it today.`,
  `Deadline tomorrow! "${title}" pending hai. Raat jagna hai ya abhi finish karna hai? ⚠️`,
  `Sara: Critical deadline. Submit "${title}" before time runs out.`,
];

const WATER_PROGRESS_POOLS = (loggedL: string, remainingL: string, goalL: string) => [
  `Aaj ${loggedL}L hua hai, bas ${remainingL}L aur baki hai ${goalL}L goal ke liye! Ek glass abhi gatak lo 💧`,
  `Hydration check! ${loggedL}L done. Just ${remainingL}L to reach your ${goalL}L target 🥤`,
  `Sara: You are ${remainingL}L short of your daily ${goalL}L hydration goal. Drink a glass now.`,
];

const WATER_EMPTY_POOLS = () => [
  `Paani pi lo jaaneman! 💧 Glowing skin aur sharp brain chahiye toh ek glass abhi pi lo 🥤`,
  `Sara: Zero water logged today. Hydration levels critical. Drink a tall glass now!`,
  `Body dehydrated ho rahi hai champ! Ek glass thanda paani piyo aur refresh ho jao 💧`,
  `Water check! Paani ki bottle uthao aur ek bada sip lo 💦`,
];

const SLEEP_NIGHT_POOLS = () => [
  `Bahut ho gaya reels scroll karna! 🌙 Phone side rakho, sleep log karo aur so jao kal subah machana hai 😴`,
  `Sara: Recovery protocol initiated. Turn off blue light, log sleep, and go to bed 🛌`,
  `Sleep is the ultimate pre-workout! Phone band karo aur so jao cutie 😴✨`,
  `Battery low ho gayi tumhari! Screen off karo aur 8 ghante ki solid neend lo 🌙`,
];

const SLEEP_MORNING_POOLS = () => [
  `Subah ho gayi! ☀️ Kaise soye kal raat? Fast tap karke sleep hours log karo aur energy check karo!`,
  `Sara: Good morning. Report last night's recovery metrics (sleep) to calibrate today.`,
  `Rise and shine! 🌅 Kal raat ki neend kaisi thi? Sleep log karke din shuru karo.`,
  `Sara: Morning check-in. Log your sleep data so I can track your readiness score.`,
];

const WEEKLY_REVIEW_POOLS = () => [
  `Weekly report card out! 📈 Poore hafte kya ukhaada? Aao check karte hain! Tap karke review dekho 🎯`,
  `Sara: Weekly audit required. Review your performance stats and calibrate next week's game plan.`,
  `Hafta khatam! Reflect on wins, fix the mistakes, and plan for Monday 🔥`,
  `Sara: Sunday calibration. Close out the week's review to claim your progress XP.`,
];

const INACTIVITY_POOLS = (days: number) => [
  `Hamari yaad nahi aati kya? 🥺💔 ${days} din se gayab ho yaar! ZenTrack sunsaan ho gaya hai.`,
  `Sara: ${days} days of complete inactivity detected. Aise banega topper? Open app and restart momentum 🚀`,
  `Bro ${days} din se koi log nahi aaya! Ek 2-minute task check-off karke wapas aao na?`,
  `Don't let your discipline slip away! ${days} days off is enough, let's get back in the game today 🔥`,
];

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
  attendanceLogs?: AttendanceLog[];
  userGymPlan?: UserGymPlanDoc | null;
}

// ── Data Fingerprint Cache ───────────────────────────────────────────────────
let _lastScheduleFingerprint: string | null = null;

export function clearScheduleCache() {
  _lastScheduleFingerprint = null;
}

function _buildFingerprint(params: ScheduleParams): string {
  const attendanceFingerprint = (params.attendance || [])
    .map(s => `${s.id}_${s.classesTotal}_${s.classesAttended}_${JSON.stringify(s.schedule || {})}`)
    .join(';');
  return [
    params.tasks.length,
    (params.habitLogs || []).length,
    (params.gymLogs || []).length,
    (params.assignments || []).length,
    (params.waterLogs || []).length,
    (params.sleepLogs || []).length,
    (params.attendanceLogs || []).length,
    (params.attendance || []).length,
    attendanceFingerprint,
    new Date().toISOString().slice(0, 13), // Invalidate hourly so upcoming triggers stay active
  ].join('|');
}

let _isScheduling = false;
let _latestParams: ScheduleParams | null = null;

export async function scheduleAllNotifications(params: ScheduleParams) {
  _latestParams = params;
  if (_isScheduling) return;
  _isScheduling = true;

  try {
    while (_latestParams) {
      const currentParams = _latestParams;
      _latestParams = null;

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
      } = currentParams;

      const fingerprint = _buildFingerprint(currentParams);
      if (fingerprint === _lastScheduleFingerprint) {
        console.log('[Notifications] Data unchanged — skipping reschedule.');
        continue;
      }
      _lastScheduleFingerprint = fingerprint;

      await Notifications.cancelAllScheduledNotificationsAsync();

      let scheduledCount = 0;
      const ALARM_CAP = 64; // Optimized 2-day budget: guarantees safe OS alarm scheduling

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

      // ── Batched Preference Retrieval ──────────────────────────────────────────
      const BOOL_KEYS = [
        'zentrack_notif_mod_tasks', 'zentrack_notif_mod_habits', 'zentrack_notif_mod_gym',
        'zentrack_notif_mod_attendance', 'zentrack_notif_mod_assignments',
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
        '@zentrack_water_reminder_freq', '@zentrack_sleep_reminders_enabled',
        '@zentrack_sleep_reminder_night', '@zentrack_sleep_reminder_morning',
        'zentrack_water_goal_ml',
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
      const habitStreakTimeStr  = strVal('habit_streak_time', '20:00');

      const defaultTimeStr = kv['zentrack_default_notif_time'] ?? '08:00';
      const defaultTime = parseHM(defaultTimeStr);

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

      function isQuiet(date: Date): boolean {
        if (!quietHoursEnabled) return false;
        const val = date.getHours() * 60 + date.getMinutes();
        const qs  = quietStart.hours * 60 + quietStart.minutes;
        const qe  = quietEnd.hours   * 60 + quietEnd.minutes;
        if (qs > qe) return val >= qs || val < qe;
        return val >= qs && val < qe;
      }

      const scheduledKeys = new Set<string>();

      async function schedule(
        title: string,
        body: string,
        trigger: Date,
        data?: any,
        channel = 'default',
        categoryId?: string
      ) {
        if (trigger <= now) return;
        if (scheduledCount >= ALARM_CAP) {
          console.warn(`[Notifications] 2-day alarm budget (${ALARM_CAP}) reached.`);
          return;
        }

        let finalTrigger = trigger;
        if (isQuiet(trigger)) {
          if (channel === 'sara_critical') {
            finalTrigger = trigger;
          } else {
            const catchUp = new Date(trigger);
            catchUp.setHours(quietEnd.hours, quietEnd.minutes, 0, 0);
            if (catchUp <= now) {
              catchUp.setDate(catchUp.getDate() + 1);
            }
            finalTrigger = catchUp;
          }
        }

        if (weekendMode && isWeekend && channel !== 'reminders' && channel !== 'sara_critical') {
          return;
        }

        // Deduplication key
        const dedupeKey = `${channel}_${Math.floor(finalTrigger.getTime() / 60000)}_${title}`;
        if (scheduledKeys.has(dedupeKey)) return;
        scheduledKeys.add(dedupeKey);

        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              data,
              categoryIdentifier: categoryId,
              ...(channel === 'reminders' || channel === 'sara_critical'
                ? { sound: 'default', priority: 'max' }
                : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: finalTrigger.getTime(),
              channelId: channel,
            } as any,
          });
          scheduledCount++;
        } catch (e) {
          console.warn('[Notifications] Failed to schedule notification:', e);
        }
      }

      // ── 1. Morning Briefings (Today & Tomorrow) ───────────────────────────────
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

          let title = dayOffset === 0 ? 'Good Morning Champ 🌅' : 'Tomorrow\'s Briefing 🌅';
          let body = getRandomMessage(MORNING_BRIEF_STANDARD_POOLS(summary));

          // Missed gym accountability check for today's morning brief
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
              title = 'Sara Here 👀';
              body = getRandomMessage(MORNING_BRIEF_MISSED_GYM_POOLS(summary));
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
              body += ` (⚠️ ${worst.name}: ${pct}% attendance)`;
            }
          }

          await schedule(
            title,
            body,
            trigger,
            { type: 'morning_brief', date: dateString },
            title.includes('Sara') ? 'sara_critical' : 'default'
          );
        }
      }

      // ── 2. Overdue Task Nudge (Today Only) ────────────────────────────────────
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
            await schedule(
              'Aalsi mat bano yaar! 🥱',
              getRandomMessage(OVERDUE_TASK_POOLS(countStr)),
              trigger,
              { type: 'overdue_nudge' },
              'default',
              actionableNotifs ? 'task_reminder' : undefined
            );
          }
        }
      }

      // ── 3. Task Reminders & Time Windows (2-Day Rolling: Today & Tomorrow) ─────
      if (modTasks) {
        const eligibleTasks = tasks
          .filter(t => t.status !== 'completed' && (t.date === todayStr || t.date === tomorrowStr))
          .sort((a, b) => {
            const pOrder: Record<string, number> = { P1: 1, high: 1, P2: 2, medium: 2, P3: 3, low: 3 };
            return (pOrder[a.priority] || 4) - (pOrder[b.priority] || 4);
          });

        let timedTaskCount = 0;
        for (const task of eligibleTasks) {
          const [year, month, day] = task.date!.split('-').map(Number);
          if (!year) continue;
          const base = new Date(year, month - 1, day);
          const parsedTime = parseTimeString(task.timeSlot);

          if (parsedTime) {
            if (timedTaskCount >= 6) continue; // Rate limit buffer alarms
            timedTaskCount++;

            base.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

            // Buffer alert (e.g. 60m / 30m)
            const tBuffer = new Date(base.getTime() - taskBufferMin * 60 * 1000);
            if (tBuffer > now) {
              await schedule(
                'Mission Approaching 🎯',
                getRandomMessage(TASK_BUFFER_POOLS(task.title, taskBufferMin)),
                tBuffer,
                { taskId: task.id, taskTitle: task.title },
                'reminders',
                actionableNotifs ? 'task_reminder' : undefined
              );
            }

            // T-15 execution warning
            if (taskBufferMin > 15) {
              const t15 = new Date(base.getTime() - 15 * 60 * 1000);
              if (t15 > now) {
                await schedule(
                  'Bas 15 Minute Baki Hain ⚡',
                  getRandomMessage(TASK_T15_POOLS(task.title)),
                  t15,
                  { taskId: task.id, taskTitle: task.title },
                  'reminders',
                  actionableNotifs ? 'task_reminder' : undefined
                );
              }
            }
          } else if (task.date === todayStr) {
            // Unscheduled tasks: morning radar notification for today only
            base.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (base > now) {
              await schedule(
                'Daily Target 📋',
                getRandomMessage(TASK_DAILY_POOLS(task.title)),
                base,
                { taskId: task.id, taskTitle: task.title },
                'default',
                actionableNotifs ? 'task_reminder' : undefined
              );
            }
          }
        }
      }

      // ── 4. Calendar Custom Events (Next 2 Days) ───────────────────────────────
      for (const event of customEvents.filter(e => e.date === todayStr || e.date === tomorrowStr)) {
        const [year, month, day] = event.date.split('-').map(Number);
        if (!year) continue;
        const base = new Date(year, month - 1, day);
        const t = parseTimeString(event.startTime);
        if (t) {
          base.setHours(t.hours, t.minutes, 0, 0);
          const evTrigger = new Date(base.getTime() - 60 * 60 * 1000);
          if (evTrigger > now) {
            await schedule(
              `Event in 1h: ${event.title} 📅`,
              `Incoming calendar event: "${event.title}" starts at ${event.startTime}.`,
              evTrigger,
              { eventId: event.id }
            );
          }
        }
      }

      // ── 5. Habit Streak at Risk (Midnight Reset Protection) ───────────────────
      if (habitStreakRisk && modHabits) {
        const hst = parseHM(habitStreakTimeStr);
        const trigger = dateAtHM(now, hst.hours, hst.minutes);
        if (trigger > now) {
          const unloggedHabits = allHabits.filter(h => {
            if (h.archived) return false;
            return !habitLogs.some(l => l.habitId === h.id && l.date === todayStr);
          });

          const prioritizedHabits = unloggedHabits
            .filter(h => (h.streak || 0) >= 2)
            .sort((a, b) => (b.streak || 0) - (a.streak || 0))
            .slice(0, 4); // Limit to top 4 highest-stake habits

          for (const habit of prioritizedHabits) {
            const streakCount = habit.streak || 0;
            await schedule(
              'Oye! Streak toot jayegi! 💔',
              getRandomMessage(HABIT_STREAK_RISK_POOLS(habit.name, streakCount)),
              trigger,
              { type: 'habit_streak', habitId: habit.id },
              saraEscalation ? 'sara_critical' : 'habits',
              actionableNotifs ? 'habit_reminder' : undefined
            );
          }
        }
      }

      // ── 6. Per-Habit Daily Reminders (2-Day Rolling: Today & Tomorrow) ─────────
      if (modHabits && (allHabits?.length ?? 0) > 0) {
        const habitsWithReminders = allHabits.slice(0, 8);
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
            const [h, m] = timeStr.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m)) { rH = h; rM = m; }
          }

          for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
            const fireDate = new Date(now);
            fireDate.setDate(fireDate.getDate() + dayOffset);
            fireDate.setHours(rH, rM, 0, 0);
            if (fireDate <= now) continue;

            const fdDateStr = dayOffset === 0 ? todayStr : tomorrowStr;
            const alreadyLogged = habitLogs.some(l => l.habitId === habit.id && l.date === fdDateStr);
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

            await schedule(
              `${habit.emoji || '⭐'} ${habit.name}`,
              habitBody,
              fireDate,
              { type: 'habit_reminder', habitId: habit.id },
              'habits',
              actionableNotifs ? 'habit_reminder' : undefined
            );
          }
        }
      }

      // ── 7. Assignment Deadlines (48h & 24h) ────────────────────────────────────
      if (modAssignments) {
        for (const asn of assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate)) {
          const [yA, mA, dA] = asn.dueDate.split('-').map(Number);
          if (!yA) continue;
          const dueDate = new Date(yA, mA - 1, dA);

          // 48h warning
          if (assignment48h) {
            const t48 = new Date(dueDate.getTime() - 48 * 60 * 60 * 1000);
            t48.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (t48 > now && (t48.getTime() - now.getTime()) <= 48 * 60 * 60 * 1000) {
              await schedule(
                'Assignment Alert ⏳',
                getRandomMessage(ASSIGNMENT_48H_POOLS(asn.title)),
                t48,
                { type: 'assignment_48h', asnId: asn.id }
              );
            }
          }

          // 24h warning
          if (assignment24h) {
            const t24 = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
            t24.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (t24 > now && (t24.getTime() - now.getTime()) <= 24 * 60 * 60 * 1000) {
              await schedule(
                'Kal Deadline Hai Bhai! 🚨',
                getRandomMessage(ASSIGNMENT_24H_POOLS(asn.title)),
                t24,
                { type: 'assignment_24h', asnId: asn.id },
                'reminders'
              );
            }
          }
        }
      }

      // ── 8. Attendance Low-Percentage Warnings (<75%) ───────────────────────────
      if (attendanceWarning && modAttendance) {
        const THRESHOLD = 75;
        for (const subj of attendance) {
          const totalAtt = (subj.classesAttended || 0) + (subj.labsAttended || 0);
          const totalTotal = (subj.classesTotal || 0) + (subj.labsTotal || 0);
          if (!totalTotal) continue;
          const pct = (totalAtt / totalTotal) * 100;
          if (pct < THRESHOLD) {
            const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
            if (trigger > now) {
              const needed = Math.ceil((THRESHOLD / 100 * totalTotal - totalAtt) / (1 - THRESHOLD / 100));
              await schedule(
                'Bhai Class Chale Jao! 🚨',
                getRandomMessage(ATTENDANCE_CRITICAL_POOLS(subj.name, pct.toFixed(0), needed)),
                trigger,
                { type: 'attendance_warning', subjectId: subj.id },
                saraEscalation ? 'sara_critical' : 'default'
              );
            }
          }
        }
      }

      // ── 9. Sunday Weekly Review ───────────────────────────────────────────────
      if (weeklyReview) {
        const daysUntilSunday = (7 - now.getDay()) % 7;
        if (daysUntilSunday <= 1) {
          const sunDate = new Date(now);
          sunDate.setDate(sunDate.getDate() + daysUntilSunday);
          sunDate.setHours(20, 0, 0, 0);
          if (sunDate > now) {
            await schedule(
              'Weekly Report Card Out! 📈',
              getRandomMessage(WEEKLY_REVIEW_POOLS()),
              sunDate,
              { type: 'weekly_review' }
            );
          }
        }
      }

      // ── 10. Gym & Academic Classes (2-Day Rolling: Today & Tomorrow) ──────────
      for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dayOfWeek = targetDate.getDay();
        const dateStr = dayOffset === 0 ? todayStr : tomorrowStr;

        // Gym workout or rest day reminder
        const planIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
        const plan = userGymPlan?.customDays?.[planIndex] || GYM_PLAN.find(p => p.dayIndex === planIndex);

        if (plan && !plan.isRest && gymNotifEnabled) {
          const hasLogged = gymLogs.some(g => g.date === dateStr);
          if (!hasLogged) {
            const exerciseCount = plan.exercises?.length || 0;
            const countSuffix = exerciseCount > 0 ? ` (${exerciseCount} exercises)` : '';
            const gymTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);

            if (gymTrigger > now) {
              await schedule(
                'Iron Calling You! 🦾',
                getRandomMessage(GYM_WORKOUT_POOLS(plan.name, countSuffix)),
                gymTrigger,
                { type: 'gym', planName: plan.name },
                'default',
                actionableNotifs ? 'gym_reminder' : undefined
              );
            }
          }
        } else if (gymRestDay && plan?.isRest && modGym) {
          const restTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);
          if (restTrigger > now) {
            await schedule(
              'Aaram Karo Sher 🛌',
              getRandomMessage(GYM_REST_DAY_POOLS()),
              restTrigger,
              { type: 'gym_rest' }
            );
          }
        }

        // Academic Classes & Labs
        if (modAttendance) {
          interface DaySession {
            subject: string;
            subjectId: string;
            time: string;
            isLab: boolean;
            startMs: number;
          }
          const daySessions: DaySession[] = [];

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
              classes.forEach((c: any) => {
                const parsed = parseTimeString(c?.time ?? '');
                const startMs = parsed
                  ? dateAtHM(targetDate, parsed.hours, parsed.minutes).getTime()
                  : dateAtHM(targetDate, 9, 0).getTime();
                daySessions.push({ subject: subj.name, subjectId: subj.id!, time: c?.time ?? '', isLab: false, startMs });
              });
            } else {
              for (let ci = 0; ci < classCnt; ci++) {
                daySessions.push({
                  subject: subj.name,
                  subjectId: subj.id!,
                  time: '',
                  isLab: false,
                  startMs: dateAtHM(targetDate, 9, 0).getTime() + ci * 60 * 60 * 1000,
                });
              }
            }

            if (labs.length > 0) {
              labs.forEach((l: any) => {
                const parsed = parseTimeString(l?.time ?? '');
                const startMs = parsed
                  ? dateAtHM(targetDate, parsed.hours, parsed.minutes).getTime()
                  : dateAtHM(targetDate, 14, 0).getTime();
                daySessions.push({ subject: `${subj.name} Lab`, subjectId: subj.id!, time: l?.time ?? '', isLab: true, startMs });
              });
            } else {
              for (let li = 0; li < labCnt; li++) {
                daySessions.push({
                  subject: `${subj.name} Lab`,
                  subjectId: subj.id!,
                  time: '',
                  isLab: true,
                  startMs: dateAtHM(targetDate, 14, 0).getTime() + li * 2 * 60 * 60 * 1000,
                });
              }
            }
          });

          daySessions.sort((a, b) => a.startMs - b.startMs);

          for (const sess of daySessions) {
            const sid = sess.subjectId;
            const subjectEnabled = kv[`@class_notif_enabled_${sid}`] !== 'false';
            if (!subjectEnabled) continue;

            // 1. Pre-class early warnings (custom user offsets or default to 30m)
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
                await schedule(
                  `Class in ${offsetLabel}: ${sess.subject} 🎒`,
                  getRandomMessage(CLASS_PRE_POOLS(sess.subject, sess.time, offsetLabel)),
                  new Date(triggerMs),
                  { type: 'class_pre', subject: sess.subject, subjectId: sid, isLab: sess.isLab, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            }

            // 2. Post-class / Post-lab log reminder
            const logDelay = parseInt(kv[`@class_notif_log_delay_${sid}`] || '0', 10);
            const durationMs = sess.isLab ? 120 * 60 * 1000 : 60 * 60 * 1000;
            const endTriggerMs = sess.startMs + durationMs + logDelay * 60 * 1000;
            const alreadyLogged = attendanceLogs.some(
              l => l.subjectId === sid && l.date === dateStr && (sess.isLab ? l.type === 'lab' : (l.type === 'class' || !l.type)) && !l.isExtra
            );

            if (!sess.isLab) {
              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                await schedule(
                  'Attendance Lagayi Kya? 📝',
                  getRandomMessage(POST_CLASS_LOG_POOLS(sess.subject)),
                  new Date(endTriggerMs),
                  { type: 'class_log', subject: sess.subject, subjectId: sid, isLab: false, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            } else {
              // Mid-lab checkpoint (at 60 min mark)
              const midEnabled = kv[`@class_notif_lab_mid_${sid}`] !== 'false';
              const midTriggerMs = sess.startMs + 60 * 60 * 1000;
              if (midEnabled && midTriggerMs > now.getTime()) {
                await schedule(
                  `Lab Checkpoint: ${sess.subject} 🧪`,
                  getRandomMessage(LAB_MID_POOLS(sess.subject)),
                  new Date(midTriggerMs),
                  { type: 'lab_mid', subject: sess.subject, subjectId: sid, isLab: true, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }

              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                await schedule(
                  'Attendance Lagayi Kya? 📝',
                  getRandomMessage(POST_LAB_LOG_POOLS(sess.subject)),
                  new Date(endTriggerMs),
                  { type: 'lab_log', subject: sess.subject, subjectId: sid, isLab: true, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            }
          }
        }
      }

      // ── 11. Inactivity Nudge (3+ Days Inactive) ───────────────────────────────
      if (inactivityNudge) {
        const thresholdDate = new Date(now);
        thresholdDate.setDate(thresholdDate.getDate() - inactivityDays);
        const thresholdStr = thresholdDate.toISOString().slice(0, 10);

        const recentTask = tasks.find(t => t.completedAt && t.completedAt >= thresholdStr);
        const recentHabit = habitLogs.find(l => l.date >= thresholdStr);
        const recentGym = gymLogs.find(g => g.date >= thresholdStr);

        if (!recentTask && !recentHabit && !recentGym) {
          const trigger = dateAtHM(now, defaultTime.hours, defaultTime.minutes);
          if (trigger > now) {
            await schedule(
              'Hamari yaad nahi aati kya? 🥺💔',
              getRandomMessage(INACTIVITY_POOLS(inactivityDays)),
              trigger,
              { type: 'inactivity' }
            );
          }
        }
      }

      // ── 12. Sleep Reminders (Night Wind-Down & Morning Recovery) ───────────────
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
            await schedule(
              'Chalo Phone Rakho Aur So Jao 🌙',
              getRandomMessage(SLEEP_NIGHT_POOLS()),
              nightTrigger,
              { type: 'sleep_night' }
            );
          }

          if (morningTrigger > now) {
            await schedule(
              'Subah Ho Gayi! ☀️',
              getRandomMessage(SLEEP_MORNING_POOLS()),
              morningTrigger,
              { type: 'sleep_morning' }
            );
          }
        }
      }

      // ── 13. Hydration Checks (2-Day Rolling: Today & Tomorrow) ─────────────────
      const waterReminderFreq = parseInt(kv['@zentrack_water_reminder_freq'] || '0', 10);
      if (waterReminderFreq > 0) {
        const savedWaterGoal = kv['zentrack_water_goal_ml'];
        const DAILY_WATER_GOAL_ML = savedWaterGoal ? parseInt(savedWaterGoal, 10) : 2000;
        const waterLoggedTodayMl = waterLogs
          .filter(w => w.date === todayStr)
          .reduce((sum, w) => sum + (w.amountMl || 0), 0);
        const waterGoalMet = waterLoggedTodayMl >= DAILY_WATER_GOAL_ML;

        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
          const isToday = dayOffset === 0;
          if (isToday && waterGoalMet) continue;

          for (let h = 9; h <= 21; h += waterReminderFreq) {
            const baseDay = new Date(now);
            baseDay.setDate(baseDay.getDate() + dayOffset);
            const waterTrigger = dateAtHM(baseDay, h, 0);

            if (waterTrigger.getTime() <= now.getTime() + 30 * 60 * 1000) continue;

            let waterBody: string;
            if (isToday && waterLoggedTodayMl > 0) {
              const remaining = Math.max(0, DAILY_WATER_GOAL_ML - waterLoggedTodayMl);
              const remainingL = (remaining / 1000).toFixed(1);
              const goalL = (DAILY_WATER_GOAL_ML / 1000).toFixed(1);
              const loggedL = (waterLoggedTodayMl / 1000).toFixed(1);
              waterBody = getRandomMessage(WATER_PROGRESS_POOLS(loggedL, remainingL, goalL));
            } else {
              waterBody = getRandomMessage(WATER_EMPTY_POOLS());
            }

            await schedule(
              'Paani Pi Lo Jaaneman! 💧',
              waterBody,
              waterTrigger,
              { type: 'water_reminder' }
            );
          }
        }
      }

      console.log(`[Notifications] 2-Day Rolling Schedule Complete: ${scheduledCount} alarms set ✅`);
    }
  } finally {
    _isScheduling = false;
  }
}

// ── Test Notification ────────────────────────────────────────────────────────
export async function sendTestNotification(userName?: string) {
  const name = userName ? userName.split(' ')[0] : 'Champ';
  const bodies = [
    `Oye ${name}, notifications ekdum badiya chal rahe hain! 🚀✨`,
    `Sara is online and tracking your progress, ${name}. Sab systems green hain! ✅`,
    `System check complete, ${name}! ZenTrack notification engine ready to fire 📡`,
  ];
  const body = bodies[Math.floor(Math.random() * bodies.length)];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sara System Check 🚀',
      body,
      sound: 'default',
      priority: 'max',
    },
    trigger: null,
  });
}

// ── Legacy compatibility export ───────────────────────────────────────────────
export async function scheduleTaskReminders(
  tasks: Task[] = [],
  customEvents: CustomEvent[] = [],
  gymLogs: GymLog[] = [],
  attendance: AttendanceSubject[] = [],
  habitLogs: HabitLog[] = [],
  allHabits: Habit[] = [],
  assignments: Assignment[] = []
) {
  return scheduleAllNotifications({
    tasks,
    customEvents,
    gymLogs,
    attendance,
    habitLogs,
    allHabits,
    assignments,
  });
}

// ── Background Fetch ──────────────────────────────────────────────────────────
export const BACKGROUND_NOTIFICATION_SYNC_TASK = 'background-notification-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_SYNC_TASK, async () => {
  try {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;

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

    const [
      tasksSnap,
      eventsSnap,
      gymSnap,
      attendanceSnap,
      attendanceLogsSnap,
      habitsSnap,
      habitLogsSnap,
      assignmentsSnap,
      waterSnap,
      sleepSnap,
    ] = await Promise.all([
      getDocs(query(collection(db, COLLECTION.TASKS), where('userId', '==', userId), where('status', 'in', ['pending', 'in_progress']))),
      getDocs(query(collection(db, COLLECTION.CALENDAR_EVENTS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.GYM_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ATTENDANCE), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.ATTENDANCE_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.HABITS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.ASSIGNMENTS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.WATER_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
      getDocs(query(collection(db, COLLECTION.SLEEP_LOGS), where('userId', '==', userId), where('date', '>=', todayStr))),
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

    await scheduleAllNotifications({
      tasks,
      customEvents,
      gymLogs,
      attendance,
      attendanceLogs,
      allHabits,
      habitLogs,
      assignments,
      waterLogs,
      sleepLogs,
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
        minimumInterval: 60 * 60 * 4,
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
