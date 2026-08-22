/**
 * notifications.ts — ZenTrack Mobile
 *
 * scheduleAllNotifications() — the single source of truth for all local notifications.
 * Reads all user prefs from AsyncStorage before scheduling.
 *
 * REVAMPS v2:
 *  1. 2-Day Rolling Window: Today + Tomorrow only. Prevents alarm exhaustion.
 *  2. Smart Priority-Queue Scheduler:
 *     - All notifications collected into a priority queue (1=Critical, 4=Low).
 *     - Queue sorted by priority then trigger time before flushing.
 *     - iOS: hard cap at 64 (OS system limit).
 *     - Android: cap at 450 (full 2-day coverage).
 *  3. Gen-Z / Hinglish Pools: 6-9 variants per type — never robotic, never repetitive.
 *  4. Actionable Notifications: Mark Done, Log Habit, Log Attendance, Start Workout.
 *
 * PRIORITY TIERS:
 *  1 CRITICAL : attendance < 75%, assignment 24h, streak at risk
 *  2 HIGH     : task buffer, T-15, overdue, 48h assignment, class pre-warn, post-class log
 *  3 MEDIUM   : morning brief, gym workout, daily tasks, habit daily, calendar, weekly review
 *  4 LOW      : sleep, hydration, gym rest, inactivity
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
import { formatLocalDateStr } from '../utils/dateUtils';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimeString(t?: string): { hours: number; minutes: number } | null {
  if (!t || typeof t !== 'string') return null;
  const str = t.trim().toLowerCase();
  const colonMatch = str.match(/(\d{1,2})[:.:](\d{2})\s*(am|pm)?/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const min = parseInt(colonMatch[2], 10);
    const ampm = colonMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!isNaN(h) && !isNaN(min) && h >= 0 && h < 24 && min >= 0 && min < 60) return { hours: h, minutes: min };
  }
  const hourAmPmMatch = str.match(/(\d{1,2})\s*(am|pm)/);
  if (hourAmPmMatch) {
    let h = parseInt(hourAmPmMatch[1], 10);
    const ampm = hourAmPmMatch[2];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!isNaN(h) && h >= 0 && h < 24) return { hours: h, minutes: 0 };
  }
  const rawH = parseInt(str, 10);
  if (!isNaN(rawH) && rawH >= 0 && rawH < 24) return { hours: rawH, minutes: 0 };
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

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Priority Tiers ─────────────────────────────────────────────────────────────
const PRIORITY = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 } as const;

// ── OS Alarm Budget ────────────────────────────────────────────────────────────
// iOS hard system limit = 64. Android = generous 450 to cover all 2-day types.
const ALARM_CAP = Platform.OS === 'ios' ? 64 : 450;

// ══════════════════════════════════════════════════════════════════════════════
//   GEN-Z / HINGLISH NOTIFICATION POOLS (6–9 variants per type)
//   Tone: your bestie who actually cares — cheesy, warm, never robotic.
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Morning Briefing ───────────────────────────────────────────────────────

const MORNING_BRIEF_TITLES_STANDARD = [
  'Uth jao bestie, sara din wait kar raha hai 🌞',
  'Rise & grind era loading... 🔄',
  'No pressure but also... PRESSURE 💀',
  'Good morning king/queen 👑',
  'Sara online hai aur judge kar rahi hai 👁️',
  'Wake up, the grind never sleeps 🌅',
  'Bhai/Bestie subah ho gayi, let\'s get this! ☀️',
  'New day, new W incoming 🚀',
  'Aankh khulte hi phone dekh liya na? 📱',
];

const MORNING_BRIEF_STANDARD_POOLS = (summary: string) => [
  `Aaj ${summary} pending hai! Coffee piyo, phone rakho, move — let's get this bread bestie 🍞✨`,
  `Subah ho gayi! ${summary} queue mein hai. Sara says: 'Tumhe ho sakta hai!' (she believes in u fr 💜)`,
  `Aaj ka agenda: ${summary}. Kal waala tu aaj ke tujhse thank you bolega 🙏 Let's go!`,
  `Vibe check: productive ✅. ${summary} await karna hai. Coffee piyo, phone rakho, move 🚀`,
  `Seriously though — ${summary} niptana hai aaj. You got this bestie 🫂`,
  `New day, new W incoming! ${summary} today. Let's make the ancestors proud ✊💜`,
  `Aaj ka plan tight hai: ${summary}. One task at a time, chal shuru karte hain 🎯`,
  `Oye suno! ${summary} line mein laga hai. Chai piyo aur focus karo ☕ Let's crush it!`,
  `Aankh khulte hi phone dekh liya? Smart move! Aaj ${summary} niptaate hain ✨`,
];

const MORNING_BRIEF_MISSED_GYM_TITLES = [
  'Bestie... kal gym skip kiya tha 🧐',
  'Kal ka skip, aaj ka redemption arc 📈',
  'The gains are crying 😭',
  'Accountability check 🪞',
  'Sara ne notice kiya 👀',
  'Gym miss detected yesterday 🏋️❌',
];

const MORNING_BRIEF_MISSED_GYM_POOLS = (summary: string) => [
  `Sara noticed kal ka skip. It's okay babe, aaj double energy ke sath aana. ${summary} + workout = W day! 💪`,
  `Gym ke bina kal gaya aur aaj bhi skip karoge? No no no. ${summary} ke baad straight to iron 🏋️`,
  `Muscles: *sobbing*. Aaj please mat chhodna unhe. ${summary} ke baad workout, no excuses today!`,
  `Kal rest day nahi tha. Aaj mandatory slay: ${summary} + gym 💪✨`,
  `Kal ka skip dekha Sara ne. Aaj compensation day! ${summary} niptao aur gains wapas lao 🔥`,
  `Bhai kal gym nahi gaye? Koi baat nahi — aaj koi excuse nahi. ${summary} + workout = redemption 💪`,
];

// ── 2. Overdue Task Nudge ─────────────────────────────────────────────────────

const OVERDUE_TASK_POOLS = (countStr: string) => [
  `${countStr} tasks se roz moonh chhupa rahe ho. They're not going anywhere bestie 🥺 Aaj ek toh niptao!`,
  `Aaj ${countStr} overdue tasks niptane mein help karungi. Ek-ek karke shuru karte hain! 💜`,
  `${countStr} tasks stack ho gaye. Achievement unlocked — par koi XP nahi milta 💀 Abhi start karo!`,
  `${countStr} pending tasks se tab se bhaag rahe ho. Let me be your hype person — aaj CRUSH them!`,
  `${countStr} overdue tasks mujhe personally disappoint kar rahe hain 😤 Together karte hain aaj!`,
  `${countStr} tasks window pe khade hain aur darwaza knock kar rahe hain. Answer karo bestie!`,
  `Kal ka kaam aaj ka headache banega agar ${countStr} abhi nahi niptaye! Chalo shuru karte hain ☕`,
];

// ── 3. Task Buffer Alert ──────────────────────────────────────────────────────

const TASK_BUFFER_POOLS = (title: string, bufferMin: number) => [
  `"${title}" starts in ${bufferMin}m! Finish what you're doing, grab water, get in position 🚀`,
  `Countdown to "${title}" is ON (${bufferMin}m). Close the reels, open the brain — game time! 🎮`,
  `"${title}" in ${bufferMin} mins. Stretch, coffee, deep breath. Let's land this one clean ✈️`,
  `You said you'd do "${title}" — the time is in ${bufferMin}m. No backing out, hero era loading 🦸`,
  `"${title}" next in queue (${bufferMin}m). Side effects: productivity, dopamine, self-respect ✨`,
  `Sara reminder: "${title}" window opens in ${bufferMin}m. The future you is watching 👀`,
  `Mission approaching! "${title}" in ${bufferMin} mins — prep mode on, distractions off 🎯`,
];

// ── 4. T-15 Execution Warning ─────────────────────────────────────────────────

const TASK_T15_POOLS = (title: string) => [
  `"${title}" in 15 mins. No more prep time — just DO it. You trained for this moment 🔥`,
  `Whatever you're doing, wrap it up — "${title}" is about to start. Let's goooo! 🛸`,
  `15 mins until "${title}". Close the tabs. Lock in. Main tujhe believe karti hoon 💜`,
  `"${title}" in 15. STOP scrolling and GET TO IT. Kal waala tu says thank you!`,
  `Just 15 more minutes before "${title}" hits. Deep breath. You've got this. GO.`,
  `"${title}" can't wait anymore bestie. 15 minutes. Full send. LET'S GO!!! 😤`,
  `Hero banne ka time aa gaya! "${title}" in 15 — let's see what you're made of 🔥`,
];

// ── 5. Daily Unscheduled Task ─────────────────────────────────────────────────

const TASK_DAILY_POOLS = (title: string) => [
  `Aaj ka target: "${title}". Schedule it or just DO it — a ✅ by evening, deal? 🤝`,
  `"${title}" is on today's docket. Sara says: "Don't let it roll over again!" 😤`,
  `"${title}" — knock it out and your evening is all yours bestie 😌✨`,
  `"${title}" needs to be done today. No tomorrow. No next week. TODAY. 💪`,
  `"${title}" is patiently waiting. It believes in you. Do it some justice! 🙏`,
  `Adding "${title}" to your active radar. Even 20 mins today counts — fit it in! 🤖💜`,
  `Ek chhota sa mission bacha hai: "${title}". Fatafat niptate hain aaj! ⚡`,
];

// ── 6. Calendar Event (was ROBOTIC static body) ───────────────────────────────

const CALENDAR_EVENT_POOLS = (title: string, time?: string) => [
  `"${title}" is up next — prep your notes, thoughts, or just show up with vibes ✨`,
  `"${title}" at ${time || 'soon'} — 1 hour away! Don't be that person who joins 10 mins late 😬`,
  `Sara reminder: "${title}" starts at ${time || 'scheduled time'}. Aaj late mat karna! 😤💜`,
  `"${title}" locked and loaded. Show up for it — whether class, meeting, or hangout! ✨`,
  `"${title}" in 1h. Wind up whatever you're doing! Punctuality = your superpower today ⚡`,
];

// ── 7. Habit Streak At Risk ───────────────────────────────────────────────────

const HABIT_STREAK_RISK_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days of "${habitName}" — do NOT let tonight be the end. Quick tap, SAVE THE STREAK! 🔥`,
  `Sara is panicking on your behalf. "${habitName}" (${streakCount}d streak!) hasn't been logged. PLEASE 🥺💜`,
  `${streakCount} days of discipline for "${habitName}" — midnight is the enemy. Log it NOW!`,
  `"${habitName}" streak at risk! The universe aligned for this streak. Don't waste it bestie! 😤`,
  `"${habitName}" (${streakCount} days strong!) needs a checkmark before midnight. 2 seconds. Go. 💔`,
  `${streakCount} din ka "${habitName}" streak toot jaayega agar abhi log nahi kiya! Sirf 2 sec 🏃`,
  `Itni mehnat se ${streakCount} days banaye the, ab aalsi banoge kya? Tap karke log karo 👑`,
];

// ── 8. Habit Daily — Streak Tier 30+ ─────────────────────────────────────────

const HABIT_DAILY_30_POOLS = (habitName: string, streakCount: number) => [
  `A WHOLE MONTH+ OF "${habitName}"?? You're literally a different person now 🦋 Day ${streakCount}!`,
  `Sara: This ${streakCount}-day "${habitName}" streak is the most impressive thing in your profile 👑`,
  `${streakCount} days of "${habitName}". This is called CHARACTER. Flex on kal waale tum 😤`,
  `"${habitName}" Day ${streakCount} — at this point you should be giving advice, not receiving it 🎓`,
  `The streak is a monument now. Day ${streakCount} of "${habitName}". Don't let anyone tear it down 💜`,
];

// ── 9. Habit Daily — Streak Tier 7+ ──────────────────────────────────────────

const HABIT_DAILY_7_POOLS = (habitName: string, streakCount: number) => [
  `ONE WEEK+ of "${habitName}"! A full week of not giving up 🏆 Day ${streakCount} ready to log!`,
  `${streakCount} days of "${habitName}"? You're BUILT DIFFERENT. Log today, keep cooking 🔥`,
  `${streakCount} days means "${habitName}" is rewiring your brain. Keep going! 🧠`,
  `At this point "${habitName}" is part of who you are. Day ${streakCount} — add to the legend 👑`,
  `Real ones don't break the chain. ${streakCount} days of "${habitName}" — one more today! 💪`,
];

// ── 10. Habit Daily — Streak Tier 1+ ─────────────────────────────────────────

const HABIT_DAILY_1_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} ain't gonna log itself bestie! "${habitName}" is waiting 💜`,
  `Still here, still consistent — "${habitName}" day ${streakCount}. This is how legends are made! 🔥`,
  `The vibe rn: 'I actually do this now' 🌟 Log "${habitName}" and keep the chain alive!`,
  `Day ${streakCount} of the "${habitName}" era — tap to lock in today's win! ✅`,
  `Early days building big habits: "${habitName}" check-in. Aaj ka ek ek din counts! 🌱`,
];

// ── 11. Habit Daily — Streak Tier 0 (Fresh Start) ────────────────────────────

const HABIT_DAILY_0_POOLS = (habitName: string) => [
  `Aaj se new era! Day 1 of "${habitName}" — the most powerful step is the FIRST 🚀`,
  `'Kal se karunga' vs 'Aaj karta hoon'. Choose differently for once ✨ Start "${habitName}" NOW!`,
  `Every legend started at Day 1. Your story begins with "${habitName}" today 👑`,
  `Zero to hero starts now! First log of "${habitName}" — tap and set the vibe 🎯`,
  `Blank slate. Clean start. Just you and "${habitName}" aaj se. Let's BUILD 💜`,
];

// ── 12. Gym Workout Reminder ──────────────────────────────────────────────────

const GYM_WORKOUT_POOLS = (planName: string, countSuffix: string) => [
  `Aaj ka ${planName}${countSuffix} scheduled! Get ready, then slay! 💪`,
  `Sara's reminder: ${planName}${countSuffix} ain't gonna do itself! Pre-workout lete jaana 🔥`,
  `${planName} tonight — every rep you skip is a gains opportunity missed. Show up! 🥺`,
  `Today's mission: ${planName}${countSuffix}. Discipline = doing it even when you don't want to. GO 💥`,
  `The iron doesn't know you had a long day. ${planName} time — tired is a vibe, not a verdict 💪`,
  `Gains don't come from couch hours! ${planName}${countSuffix} — USE the gym tonight ⚡`,
  `No cap your best self is at the gym rn 💯 ${planName}${countSuffix} — get there and come back legendary!`,
];

// ── 13. Gym Rest Day ──────────────────────────────────────────────────────────

const GYM_REST_DAY_POOLS = () => [
  `Aaj literally allowed ho to chill — muscles are rebuilding! Protein khao, aaram karo 🥩😴`,
  `Rest day ≠ lazy day. Your gains are being MADE while you sleep. Eat, sleep, hydrate! 💆`,
  `Sara's order: no gym today. CNS recharge karo — kal ke lifts ke liye body rebuild hogi 🔋`,
  `Today's vibe: gentle movement, good food, 8 hours of sleep. Kal heavy lifts phodne hain! 😴`,
  `Your body is making gains RIGHT NOW while you chill. This is literally the plan. Enjoy! ✨`,
  `Active rest day! Thoda walk ya light stretch — kal ke compound lifts ke liye recharge hona hai 🚶`,
];

// ── 14. Attendance < 75% Warning ─────────────────────────────────────────────

const ATTENDANCE_CRITICAL_POOLS = (subjName: string, pct: string, needed: number) => [
  `${subjName} mein sirf ${pct}% attendance hai! ${needed} aur classes = safe zone. Aaj jaana! 🚨`,
  `${subjName}: ${pct}%. Below 75% bestie. Next ${needed} classes are MANDATORY, no exceptions! ⚠️`,
  `${subjName} attendance: ${pct}%. Sara genuinely worried. ${needed} more classes = out of danger! 🆘`,
  `${subjName} at ${pct}%. Debarment list doesn't care about your reasons. Next ${needed}: COMPULSORY. 📋`,
  `Yaar ${subjName} mein ${pct}%! ${needed} aur classes aur tum safe ho. Aaj ka class mat chhodna! 🥺`,
  `Academic SOS! ${pct}% in ${subjName} = danger zone. ${needed} classes to survive the semester 📡`,
];

// ── 15. Class Pre-Warning ─────────────────────────────────────────────────────

const CLASS_PRE_POOLS = (subject: string, time: string, timeStr: string) => [
  `Mobilize! ${subject} at ${time || 'class time'} (${timeStr} to go). Baste uthao, no proxy reliance 😉`,
  `${subject} (${timeStr} away). Notes, water, attention span — all ready? 📝`,
  `Don't be THAT person who walks in late 😬 ${subject} in ${timeStr}! Punctuality is a vibe today.`,
  `Sara: ${subject} in ${timeStr}. Be there. Front row? Optional. Showing up? MANDATORY. 📡`,
  `${subject} is ${timeStr} away! Attendance % doesn't negotiate — go bestie 📉`,
  `Your attendance % is watching. ${subject} in ${timeStr} — show up, it literally adds up! ✅`,
];

// ── 16. Post-Class Attendance Log ────────────────────────────────────────────

const POST_CLASS_LOG_POOLS = (subject: string) => [
  `${subject} class done! Present tha/thi ya bunk mara? 5 sec — log attendance abhi! ✅`,
  `${subject} class just ended! Update karo warna baad mein bhool jaoge (we know 😅)`,
  `${subject} done — seal it with an attendance log! P/A/C — protect your percentage 🛡️`,
  `Sara: ${subject} session complete. 10-second task — log attendance BEFORE distraction! 📋`,
  `Class me the ya nahi? Tap karo aur ${subject} attendance save karo! ✅`,
];

// ── 17. Mid-Lab Checkpoint ────────────────────────────────────────────────────

const LAB_MID_POOLS = (subject: string) => [
  `First hour of ${subject} lab complete! Track hour-wise attendance if your college needs it 🧪`,
  `Mid-lab checkpoint! Survived the first hour of ${subject}. Mark if needed, stay focused 💪`,
  `${subject} practical: pehla ghanta behind you. Energy up — aage badho! ⏱️`,
  `${subject} Lab checkpoint. Dept tracks per-hour? Tap to mark now! 🔬`,
  `One hour into ${subject} lab 🔭 Attendance mein daalo agar zaroorat hai and keep going! 🧬`,
];

// ── 18. Post-Lab Log — DISTINCT title from Post-Class ────────────────────────

const POST_LAB_LOG_POOLS = (subject: string) => [
  `${subject} lab session done! You survived! 🧪 Tap karke final lab attendance mark kar lo.`,
  `Lab over! ${subject} practical credit lene ke liye abhi attendance log karo ✅`,
  `${subject} lab complete. Quick tap — log your final presence status! 🔬`,
  `Lab khatam! ${subject} ka practical attendance abhi record karo warna bhool jaoge 📋`,
  `Experiment complete! Mark your ${subject} lab attendance before the memory fades — tap now 🧬`,
];

// ── 19. Assignment 48h Warning ────────────────────────────────────────────────

const ASSIGNMENT_48H_POOLS = (title: string) => [
  `"${title}" due in 2 days! Procrastination era is OVER. Open it, start it, submit it! 📝`,
  `"${title}" — 48h left. The last-night version of you will be SO grateful if you start today! 🥺`,
  `"${title}" deadline incoming! Early starters submit better work. Be the early starter ✨`,
  `"${title}" — 48 hours. Start tonight, review tomorrow, submit stress-free 😌`,
  `"${title}" is due in 2 days. Sara says: "Start tonight, even just 20 mins!" 👀`,
  `"Dear present me, please start ${title} NOW. Love, future me." 💌`,
];

// ── 20. Assignment 24h Warning ────────────────────────────────────────────────

const ASSIGNMENT_24H_POOLS = (title: string) => [
  `"${title}" is due TOMORROW. Haven't started? Start RIGHT NOW. Sara is watching 👁️`,
  `"${title}" submits in exactly 24 hours. Close this, open assignment. GO. NOW. 🏃💀`,
  `Final 24 hours for "${title}"! Main character moment — submit BEFORE deadline, not during! 🔥`,
  `"${title}" due tomorrow. Every hour you wait adds pressure. Start the final push! 🆘`,
  `"${title}" — 1 day left. The assignment isn't going anywhere but the deadline is. MOVE! ⏰`,
  `Last chance to make "${title}" good. 24 hours. Submit before midnight and sleep peacefully 🥺`,
];

// ── 21. Hydration — Titles ───────────────────────────────────────────────────

const WATER_TITLES_POOL = [
  'Hydration Check Bestie 💧',
  'Sip Check! Paani Piya Kya? 🥤',
  'Water Alert 🚨 Stay Hydrated!',
  'Gatak Lo Ek Glass 💦',
  'Skin & Brain Fuel 🧠💧',
  'Refill That Bottle! 🧊',
  'Sara Hydration Check 💙',
  'Dehydration Is NOT The Vibe 🚫🌵',
  'Power Sip Time ⚡💧',
  'Paani Break, Champ! 🚰',
  'Drink Up, Slay Down ✨🥤',
  'Hydrate Or Diedrate 💀💧',
  'H2O Refuel Alert 🌊',
  'Glow Mode: Drink Water ✨💧',
];

// ── 21. Hydration — With Progress ────────────────────────────────────────────

const WATER_PROGRESS_POOLS = (loggedL: string, remainingL: string, goalL: string) => [
  `Hydration check: ${loggedL}L down, only ${remainingL}L left for ${goalL}L! Almost at the finish line 💧`,
  `${loggedL}L logged so far! Sirf ${remainingL}L baki hai for today's ${goalL}L target. Ek aur glass finish karo 🥤`,
  `Bestie you're crushing it — ${loggedL}L in! Keep the momentum, ${remainingL}L more to hit ${goalL}L 🎯`,
  `Skin glowing, brain buzzing! 💆 ${remainingL}L away from your ${goalL}L goal. Grab that bottle!`,
  `Progress report: ${loggedL}L / ${goalL}L complete 📊 Just one or two more glasses to seal the deal 💦`,
  `Almost in the hydrated elite club! ${remainingL}L left to reach ${goalL}L. Take a big gulp right now 🏆`,
  `${loggedL}L logged! Halfway there is good, but hitting ${goalL}L is legendary 🔥 Sip up!`,
  `Level up your hydration stats: ${remainingL}L baki hai ${goalL}L target ke liye. Don't stop now ⚡`,
  `Your body is loving this ${loggedL}L hydration! Finish the remaining ${remainingL}L and celebrate 🎉`,
  `Target in sight: ${remainingL}L remaining for ${goalL}L goal 🎯 Ek glass abhi gatak lo aur win today!`,
  `Great pace! ${loggedL}L done, ${remainingL}L to go. Refill that bottle and stay unstoppable 💧🚀`,
];

// ── 22. Hydration — Zero Logged ───────────────────────────────────────────────

const WATER_EMPTY_POOLS = () => [
  `Sara emergency: ZERO water logged today 💧 Running on 1% battery? Ek bada glass gatak lo right now! 🥤`,
  `Your brain is literally 75% water and currently running dry 💀 Go grab a cold glass, fast!`,
  `Dehydration is NOT aesthetic bestie 😤 Skin glow aur energy boost ke liye go drink a glass now! ✨`,
  `Bottle dhoondo aur paani piyo! 🚰 Future productive you will thank you for this one sip 💙`,
  `Are you waiting for a written invitation to drink water? 🤨 Break lo aur bottle khatam karo!`,
  `Energy drop feel ho raha hai? It's not tiredness, it's dehydration! 🚨 Drink 300ml right now.`,
  `Coffee/chai se pehle paani zaroori hai boss ☕➡️💧 Ek bada sip and back to slaying!`,
  `No water logged yet today? 😱 Don't let your body run on empty. Sip up immediately!`,
  `Reminder: Plants need water and so do YOU 🌱 Paani pi lo aur refresh ho jao champ!`,
  `Slump antidote: ONE chilled glass of water 🧊 Drink now and level up your focus!`,
  `Hustle tabhi hogi jab body hydrated hogi 🔥 Chalo jaldi se bottle bhar lo!`,
  `Brain fog clearing protocol: Drink 1 glass of water 🧠💧 Works 10x faster than doomscrolling!`,
  `Friendly aggressive reminder to DRINK WATER 🔫💧 Hydrate yourself right now!`,
  `The audacity of going this long without water 😤 One glass, right now — your body demands it 💧`,
  `Glowing skin aur sharp focus chahiye? Start with ONE full glass of water right now 🥤✨`,
];

// ── 23. Sleep Wind-Down ───────────────────────────────────────────────────────

const SLEEP_NIGHT_POOLS = () => [
  `Bahut ho gaya scroll karna! Phone rakho, sleep mode on, kal machao — tonight recharge karo 😴`,
  `One more reel = 47 more. Put the phone down and recover like the champion you are! 🛌`,
  `Future 7AM you says: 'PLEASE sleep now.' Past midnight is where regrets happen. Log sleep! 🌙`,
  `Sara sleep protocol: INITIATED 😴 Blue light down. Brain off. Recovery on. Log tonight's sleep ✨`,
  `Tomorrow's energy depends on tonight's rest 💤 Phone band karo, log sleep — slay harder tomorrow! 👑`,
  `Sleep is the ultimate pre-workout! Phone band karo aur so jao cutie 😴✨`,
];

// ── 24. Sleep Morning Log ─────────────────────────────────────────────────────

const SLEEP_MORNING_POOLS = () => [
  `Rise and shine bestie! Log last night's sleep so Sara can track your readiness for today! 📊`,
  `Subah ho gayi! Kal raat ki neend kaisi rahi? 30 seconds — log sleep and start the day! 🌅`,
  `Before you dive in — how many hours did you sleep? Log it so Sara can calibrate today! 🔑`,
  `Morning! Quick sleep log karo so Sara knows how recharged you are. 10 seconds! 💜`,
  `Kal raat ka sleep log mat bhoolna! Sara uses it to understand your energy patterns ☀️`,
  `Rise and log! 🌅 Sara tracks your readiness score from sleep data — 10 sec before diving in!`,
];

// ── 25. Weekly Review ─────────────────────────────────────────────────────────

const WEEKLY_REVIEW_POOLS = () => [
  `Hafta khatam hua bestie! Kya kiya, kya seekha, kya improve hoga — tap karo aur review karo! 📊`,
  `This week's score is in! Wins count, losses teach. Reflect, plan, level up for next week 🚀`,
  `The week just finished. Time to audit it, appreciate the wins, and close properly. Review! 🎯`,
  `Week done! What went well, what didn't, what's next — 5 mins makes next week legendary 💜`,
  `Sunday = clean slate time. Weekly review nahi kiya toh same mistakes repeat honge. 5 min! 🔄`,
];

// ── 26. Inactivity Nudge ──────────────────────────────────────────────────────

const INACTIVITY_POOLS = (days: number) => [
  `${days} days and no tasks, habits, or gym. Sara has been waiting. Come back, even 5 mins! 💜`,
  `${days} days MIA! Tasks, habits, goals have been waiting patiently. Come show them some love! 😢`,
  `${days} days of silence bestie. It's not too late! Log ONE thing and restart the momentum!`,
  `${days} days since last log. No judgment — just a gentle nudge. We'll be here when you're ready 💜`,
  `${days} days since last activity! Future you sends one word: PLEASE. Come back to ZenTrack! 🆘`,
  `Hamari yaad nahi aati kya? 🥺💔 ${days} din se gayab ho yaar! ZenTrack sunsaan ho gaya hai.`,
];

// ── Main export ───────────────────────────────────────────────────────────────

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
}

// ── Data Fingerprint Cache ────────────────────────────────────────────────────
let _lastScheduleFingerprint: string | null = null;

export function clearScheduleCache() {
  _lastScheduleFingerprint = null;
}

function _buildFingerprint(params: ScheduleParams): string {
  const attendanceFingerprint = (params.attendance || [])
    .map(s => `${s.id}_${s.classesTotal}_${s.classesAttended}_${s.lastUpdated || 0}`)
    .join(';');
  const taskFingerprint = (params.tasks || [])
    .filter(t => t.status !== 'completed')
    .map(t => `${t.id}_${t.date}_${t.timeSlot || ''}`)
    .join(';');
  const eventFingerprint = (params.customEvents || [])
    .map(e => `${e.id}_${e.date}_${e.startTime || ''}`)
    .join(';');

  const attendanceLogFingerprint = (params.attendanceLogs || [])
    .map(l => `${l.id}_${l.action}_${l.date}`)
    .join(';');

  const flashcardDueCount = (params.flashcards || [])
    .filter(f => f.nextReviewDate && f.nextReviewDate <= formatLocalDateStr(new Date())).length;

  // Track today's total water logged to invalidate fingerprint immediately when goal is hit
  const todayDateStr = formatLocalDateStr(new Date());
  const waterTodayMl = (params.waterLogs || [])
    .filter(w => (w.date || '').slice(0, 10) === todayDateStr)
    .reduce((acc, w) => acc + (w.amountMl || 0), 0);

  return [
    taskFingerprint,
    eventFingerprint,
    (params.habitLogs || []).length,
    (params.gymLogs || []).length,
    (params.assignments || []).length,
    (params.waterLogs || []).length,
    waterTodayMl,
    (params.sleepLogs || []).length,
    attendanceLogFingerprint,
    (params.attendance || []).length,
    attendanceFingerprint,
    flashcardDueCount,
    new Date().toISOString().slice(0, 13),
  ].join('|');
}

let _isScheduling = false;
let _latestParams: ScheduleParams | null = null;

// ── Priority Queue Entry ──────────────────────────────────────────────────────

interface PendingNotif {
  title: string;
  body: string;
  trigger: Date;
  data?: any;
  channel: string;
  categoryId?: string;
  priority: number; // 1 = highest, use PRIORITY.* constants
}

// ── scheduleAllNotifications ──────────────────────────────────────────────────

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
        flashcards = [],
      } = currentParams;

      const fingerprint = _buildFingerprint(currentParams);
      if (fingerprint === _lastScheduleFingerprint) {
        console.log('[Notifications] Data unchanged — skipping reschedule.');
        continue;
      }
      _lastScheduleFingerprint = fingerprint;

      await Notifications.cancelAllScheduledNotificationsAsync();

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

      // ── Batched Preference Retrieval ──────────────────────────────────────
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

      const morningBriefTimeStr = strVal('morning_brief_time', '07:30');
      const overdueNudgeTimeStr = strVal('overdue_nudge_time', '08:00');
      const quietStartStr       = strVal('quiet_start', '23:00');
      const quietEndStr         = strVal('quiet_end', '07:00');
      const taskBufferMin       = parseInt(strVal('task_buffer', '60'), 10);
      const inactivityDays      = parseInt(strVal('inactivity_days', '3'), 10);
      const habitStreakTimeStr   = strVal('habit_streak_time', '20:00');

      const defaultTimeStr = kv['zentrack_default_notif_time'] ?? '08:00';
      const defaultTime = parseHM(defaultTimeStr);

      const gymNotifTimeStr    = kv['@gym_notification_time'];
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

      // ── Priority Queue ────────────────────────────────────────────────────
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
        if (trigger <= now) return;
        pendingQueue.push({ priority, title, body, trigger, data, channel, categoryId });
      }

      // ── 1. Morning Briefings (Today & Tomorrow) ────────────────────────────
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

          let title = getRandomMessage(MORNING_BRIEF_TITLES_STANDARD);
          let body = getRandomMessage(MORNING_BRIEF_STANDARD_POOLS(summary));

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
              title = getRandomMessage(MORNING_BRIEF_MISSED_GYM_TITLES);
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

          enqueue(
            PRIORITY.MEDIUM,
            title,
            body,
            trigger,
            { type: 'morning_brief', date: dateString },
            title.toLowerCase().includes('accountability') || title.toLowerCase().includes('crying') ? 'sara_critical' : 'default'
          );
        }
      }

      // ── 2. Overdue Task Nudge (Today Only) ──────────────────────────────────
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
              'Kal ka kaam, aaj ka problem 💀',
              getRandomMessage(OVERDUE_TASK_POOLS(countStr)),
              trigger,
              { type: 'overdue_nudge' },
              'default',
              actionableNotifs ? 'task_reminder' : undefined
            );
          }
        }
      }

      // ── 3. Task Reminders & Time Windows (2-Day Rolling) ──────────────────
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
            // Android budget is large enough to relax the cap; iOS cap is 64 total anyway
            if (timedTaskCount >= (Platform.OS === 'ios' ? 6 : 12)) continue;
            timedTaskCount++;

            base.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

            const tBuffer = new Date(base.getTime() - taskBufferMin * 60 * 1000);
            if (tBuffer > now) {
              enqueue(
                PRIORITY.HIGH,
                `Mission Approaching in ${taskBufferMin}m 🎯`,
                getRandomMessage(TASK_BUFFER_POOLS(task.title, taskBufferMin)),
                tBuffer,
                { taskId: task.id, taskTitle: task.title },
                'reminders',
                actionableNotifs ? 'task_reminder' : undefined
              );
            }

            if (taskBufferMin > 15) {
              const t15 = new Date(base.getTime() - 15 * 60 * 1000);
              if (t15 > now) {
                enqueue(
                  PRIORITY.HIGH,
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
            base.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (base > now) {
              enqueue(
                PRIORITY.MEDIUM,
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

      // ── 4. Calendar Custom Events (Next 2 Days) ────────────────────────────
      for (const event of customEvents.filter(e => e.date === todayStr || e.date === tomorrowStr)) {
        const [year, month, day] = event.date.split('-').map(Number);
        if (!year) continue;
        const base = new Date(year, month - 1, day);
        const t = parseTimeString(event.startTime);
        if (t) {
          base.setHours(t.hours, t.minutes, 0, 0);
          const evTrigger = new Date(base.getTime() - 60 * 60 * 1000);
          if (evTrigger > now) {
            // FIX: was static robotic body — now uses Gen-Z pool
            enqueue(
              PRIORITY.MEDIUM,
              `Event in 1h: ${event.title} 📅`,
              getRandomMessage(CALENDAR_EVENT_POOLS(event.title, event.startTime)),
              evTrigger,
              { eventId: event.id }
            );
          }
        }
      }

      // ── 5. Habit Streak at Risk (Midnight Protection) ──────────────────────
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
            .slice(0, 5);

          for (const habit of prioritizedHabits) {
            const streakCount = habit.streak || 0;
            enqueue(
              PRIORITY.CRITICAL,
              'NOOOO Your Streak Is Dying!! 💀',
              getRandomMessage(HABIT_STREAK_RISK_POOLS(habit.name, streakCount)),
              trigger,
              { type: 'habit_streak', habitId: habit.id },
              saraEscalation ? 'sara_critical' : 'habits',
              actionableNotifs ? 'habit_reminder' : undefined
            );
          }
        }
      }

      // ── 6. Per-Habit Daily Reminders (2-Day Rolling) ──────────────────────
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

      // ── 7. Assignment Deadlines (48h & 24h) ───────────────────────────────
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
                'Assignment Alert ⏳',
                getRandomMessage(ASSIGNMENT_48H_POOLS(asn.title)),
                t48,
                { type: 'assignment_48h', asnId: asn.id }
              );
            }
          }

          if (assignment24h) {
            // FIX 7.8: Resilient 24h deadline trigger — if 8:00 AM has passed today, fire in 15min
            const dayBeforeDue = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
            let t24 = new Date(dayBeforeDue);
            t24.setHours(defaultTime.hours, defaultTime.minutes, 0, 0);
            if (t24 <= now && dueDate.getTime() > now.getTime()) {
              t24 = new Date(now.getTime() + 15 * 60 * 1000);
            }
            if (t24 > now && t24 < dueDate) {
              enqueue(
                PRIORITY.CRITICAL,
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

      // ── 8. Attendance Low-Percentage Warnings (<75%) — CRITICAL ───────────
      if (attendanceWarning && modAttendance) {
        const THRESHOLD = 75;
        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
          const targetDay = new Date(now);
          targetDay.setDate(targetDay.getDate() + dayOffset);

          for (const subj of attendance) {
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
      }

      // ── 9. Sunday Weekly Review ────────────────────────────────────────────
      if (weeklyReview) {
        const daysUntilSunday = (7 - now.getDay()) % 7;
        if (daysUntilSunday <= 1) {
          const sunDate = new Date(now);
          sunDate.setDate(sunDate.getDate() + daysUntilSunday);
          sunDate.setHours(20, 0, 0, 0);
          if (sunDate > now) {
            enqueue(
              PRIORITY.MEDIUM,
              'Weekly Report Card Out! 📈',
              getRandomMessage(WEEKLY_REVIEW_POOLS()),
              sunDate,
              { type: 'weekly_review' }
            );
          }
        }
      }

      // ── 10. Gym & Academic Classes (2-Day Rolling) ─────────────────────────
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
            const exerciseCount = plan.exercises?.length || 0;
            const countSuffix = exerciseCount > 0 ? ` (${exerciseCount} exercises)` : '';
            const gymTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);
            if (gymTrigger > now) {
              enqueue(
                PRIORITY.MEDIUM,
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
          // FIX: gymRestDay now defaults to true
          const restTrigger = dateAtHM(targetDate, gymNotifHours, gymNotifMinutes);
          if (restTrigger > now) {
            enqueue(
              PRIORITY.LOW,
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
            durationMinutes?: number;
          }
          const daySessions: DaySession[] = [];

          const parseSessionTimes = (timeStr: string, isLab: boolean) => {
            const trimmed = (timeStr || '').trim();
            const parts = trimmed.split(/[-–—•]| to /i).map(s => s.trim());
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
              classes.forEach((c: any) => {
                const { startH, startM, durationMinutes } = parseSessionTimes(c?.time ?? '', false);
                const startMs = dateAtHM(targetDate, startH, startM).getTime();
                daySessions.push({
                  subject: subj.name,
                  subjectId: subj.id!,
                  time: c?.time ?? '',
                  isLab: false,
                  startMs,
                  durationMinutes,
                });
              });
            } else {
              for (let ci = 0; ci < classCnt; ci++) {
                daySessions.push({
                  subject: subj.name, subjectId: subj.id!, time: '', isLab: false,
                  startMs: dateAtHM(targetDate, 9, 0).getTime() + ci * 60 * 60 * 1000,
                  durationMinutes: 60,
                });
              }
            }

            if (labs.length > 0) {
              labs.forEach((l: any) => {
                const { startH, startM, durationMinutes } = parseSessionTimes(l?.time ?? '', true);
                const startMs = dateAtHM(targetDate, startH, startM).getTime();
                daySessions.push({
                  subject: `${subj.name} Lab`,
                  subjectId: subj.id!,
                  time: l?.time ?? '',
                  isLab: true,
                  startMs,
                  durationMinutes,
                });
              });
            } else {
              for (let li = 0; li < labCnt; li++) {
                daySessions.push({
                  subject: `${subj.name} Lab`, subjectId: subj.id!, time: '', isLab: true,
                  startMs: dateAtHM(targetDate, 14, 0).getTime() + li * 2 * 60 * 60 * 1000,
                  durationMinutes: 120,
                });
              }
            }
          });

          daySessions.sort((a, b) => a.startMs - b.startMs);

          for (const sess of daySessions) {
            const sid = sess.subjectId;
            const subjectEnabled = kv[`@class_notif_enabled_${sid}`] !== 'false';
            if (!subjectEnabled) continue;

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
                  `Class in ${offsetLabel}: ${sess.subject} 🎒`,
                  getRandomMessage(CLASS_PRE_POOLS(sess.subject, sess.time, offsetLabel)),
                  new Date(triggerMs),
                  { type: 'class_pre', subject: sess.subject, subjectId: sid, isLab: sess.isLab, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }
            }

            const logDelay = parseInt(kv[`@class_notif_log_delay_${sid}`] || '0', 10);
            const durationMs = (sess.durationMinutes ?? (sess.isLab ? 120 : 60)) * 60 * 1000;
            const endTriggerMs = sess.startMs + durationMs + logDelay * 60 * 1000;
            const alreadyLogged = attendanceLogs.some(
              l => l.subjectId === sid && l.date === dateStr && (sess.isLab ? l.type === 'lab' : (l.type === 'class' || !l.type)) && !l.isExtra
            );

            if (!sess.isLab) {
              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                enqueue(
                  PRIORITY.HIGH,
                  'Attendance Lagayi Kya? 📝',
                  getRandomMessage(POST_CLASS_LOG_POOLS(sess.subject)),
                  new Date(endTriggerMs),
                  { type: 'class_log', subject: sess.subject, subjectId: sid, isLab: false, date: dateStr },
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
                  `Lab Checkpoint: ${sess.subject} 🧪`,
                  getRandomMessage(LAB_MID_POOLS(sess.subject)),
                  new Date(midTriggerMs),
                  { type: 'lab_mid', subject: sess.subject, subjectId: sid, isLab: true, date: dateStr },
                  'reminders',
                  actionableNotifs ? 'class_reminder' : undefined
                );
              }

              // FIX: Post-lab title is now DISTINCT from post-class
              if (!alreadyLogged && endTriggerMs > now.getTime()) {
                enqueue(
                  PRIORITY.HIGH,
                  'Lab Done! Log Attendance 🧪',
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

      // ── 11. Inactivity Nudge (3+ Days Inactive) ────────────────────────────
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
              'Hamari yaad nahi aati kya? 🥺💔',
              getRandomMessage(INACTIVITY_POOLS(inactivityDays)),
              trigger,
              { type: 'inactivity' }
            );
          }
        }
      }

      // ── 12. Sleep Reminders (Night Wind-Down & Morning Recovery) ──────────
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
              'Chalo Phone Rakho Aur So Jao 🌙',
              getRandomMessage(SLEEP_NIGHT_POOLS()),
              nightTrigger,
              { type: 'sleep_night' }
            );
          }

          if (morningTrigger > now) {
            enqueue(
              PRIORITY.LOW,
              'Subah Ho Gayi! ☀️',
              getRandomMessage(SLEEP_MORNING_POOLS()),
              morningTrigger,
              { type: 'sleep_morning' }
            );
          }
        }
      }

      // ── 13. Hydration Checks (2-Day Rolling) ──────────────────────────────
      const waterReminderFreq = parseInt(kv['@zentrack_water_reminder_freq'] || '0', 10);
      if (waterReminderFreq > 0) {
        const savedWaterGoal = kv['zentrack_water_goal_ml'];
        const DAILY_WATER_GOAL_ML = savedWaterGoal ? parseInt(savedWaterGoal, 10) : 2000;
        const waterLoggedTodayMl = waterLogs
          .filter(w => w.date === todayStr)
          .reduce((sum, w) => sum + (w.amountMl || 0), 0);
        const waterGoalMet = waterLoggedTodayMl >= DAILY_WATER_GOAL_ML;

        // Pre-shuffle titles and body pools so each reminder throughout the day is unique & non-repetitive
        const shuffledTitles = shuffleArray(WATER_TITLES_POOL);
        const shuffledEmptyBodies = shuffleArray(WATER_EMPTY_POOLS());
        let titleIdx = 0;
        let bodyIdx = 0;

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
              const progressPool = shuffleArray(WATER_PROGRESS_POOLS(loggedL, remainingL, goalL));
              waterBody = progressPool[bodyIdx % progressPool.length];
            } else {
              waterBody = shuffledEmptyBodies[bodyIdx % shuffledEmptyBodies.length];
            }

            const waterTitle = shuffledTitles[titleIdx % shuffledTitles.length];
            titleIdx++;
            bodyIdx++;

            enqueue(
              PRIORITY.LOW,
              waterTitle,
              waterBody,
              waterTrigger,
              { type: 'water_reminder' }
            );
          }
        }
      }


      // ── 14. Flashcard Spaced Repetition Due Review Nudge ─────────────────
      const dueCards = (flashcards || []).filter(f => f.nextReviewDate && f.nextReviewDate <= todayStr);
      if (dueCards.length > 0) {
        const reviewTrigger = dateAtHM(now, 19, 0); // 7:00 PM
        if (reviewTrigger.getTime() > now.getTime() + 15 * 60 * 1000) {
          enqueue(
            PRIORITY.LOW,
            '🧠 Flashcards Due for Review!',
            `You have ${dueCards.length} cards scheduled for active recall today. Strengthen your retention!`,
            reviewTrigger,
            { type: 'flashcard_review' }
          );
        }
      }

      // ── Flush Priority Queue ───────────────────────────────────────────────
      // Sort: ascending priority (1=Critical first), then ascending trigger time.
      // Critical notifications always win the budget race.
      // On iOS (cap=64): low-priority items are dropped before any high-priority one is.
      // On Android (cap=450): virtually all notifications fit; sorted order still applies.
      pendingQueue.sort((a, b) => a.priority - b.priority || a.trigger.getTime() - b.trigger.getTime());

      const scheduledKeys = new Set<string>();
      let scheduledCount = 0;
      let droppedCount = 0;

      for (const notif of pendingQueue) {
        if (scheduledCount >= ALARM_CAP) {
          droppedCount++;
          continue;
        }

        let finalTrigger = notif.trigger;

        // Quiet hours: sara_critical always ignores, others are deferred to quiet end
        if (isQuiet(finalTrigger) && notif.channel !== 'sara_critical') {
          const catchUp = new Date(finalTrigger);
          catchUp.setHours(quietEnd.hours, quietEnd.minutes, 0, 0);
          if (catchUp <= now) catchUp.setDate(catchUp.getDate() + 1);
          finalTrigger = catchUp;
        }

        // Weekend mode: only reminders and critical pass through
        if (weekendMode && isWeekend && notif.channel !== 'reminders' && notif.channel !== 'sara_critical') {
          continue;
        }

        // Deduplication: same channel + minute bucket + title
        const dedupeKey = `${notif.channel}_${Math.floor(finalTrigger.getTime() / 60000)}_${notif.title}`;
        if (scheduledKeys.has(dedupeKey)) continue;
        scheduledKeys.add(dedupeKey);

        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: notif.title,
              body: notif.body,
              data: notif.data,
              categoryIdentifier: notif.categoryId,
              ...(notif.channel === 'reminders' || notif.channel === 'sara_critical'
                ? { sound: 'default', priority: 'max' }
                : {}),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: finalTrigger.getTime(),
              channelId: notif.channel,
            } as any,
          });
          scheduledCount++;
        } catch (e) {
          console.warn('[Notifications] Failed to schedule notification:', e);
        }
      }

      if (droppedCount > 0) {
        console.warn(`[Notifications] Budget hit: ${droppedCount} low-priority notifications dropped (${Platform.OS} cap=${ALARM_CAP}).`);
      }
      console.log(`[Notifications] Schedule Complete: ${scheduledCount}/${ALARM_CAP} alarms set (${Platform.OS}) ✅`);
    }
  } finally {
    _isScheduling = false;
  }
}

// ── Test Notification ─────────────────────────────────────────────────────────
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

// ── Background Fetch ──────────────────────────────────────────────────────────
export const BACKGROUND_NOTIFICATION_SYNC_TASK = 'background-notification-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_SYNC_TASK, async () => {
  try {
    const userId = (await AsyncStorage.getItem('@zentrack_uid')) || (await AsyncStorage.getItem('user_id'));
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

    // FIX 4.3 & 6.7: Fetch USER_GYM_PLANS & FLASHCARDS docs in headless reschedule
    const [
      tasksSnap, eventsSnap, gymSnap, attendanceSnap, attendanceLogsSnap,
      habitsSnap, habitLogsSnap, assignmentsSnap, waterSnap, sleepSnap, gymPlanSnap, flashcardsSnap,
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
      getDocs(query(collection(db, COLLECTION.USER_GYM_PLANS), where('userId', '==', userId))),
      getDocs(query(collection(db, COLLECTION.FLASHCARDS), where('userId', '==', userId))),
    ]);

    const rawGymPlanDoc = gymPlanSnap.docs[0];
    const fetchedUserGymPlan = rawGymPlanDoc ? ({ id: rawGymPlanDoc.id, ...rawGymPlanDoc.data() } as UserGymPlanDoc) : null;

    await scheduleAllNotifications({
      tasks: tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)),
      customEvents: eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent)),
      gymLogs: gymSnap.docs.map(d => ({ id: d.id, ...d.data() } as GymLog)),
      attendance: attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject)),
      attendanceLogs: attendanceLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)),
      allHabits: habitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Habit)),
      habitLogs: habitLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as HabitLog)),
      assignments: assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)),
      waterLogs: waterSnap.docs.map(d => ({ id: d.id, ...d.data() } as WaterLog)),
      sleepLogs: sleepSnap.docs.map(d => ({ id: d.id, ...d.data() } as SleepLog)),
      userGymPlan: fetchedUserGymPlan,
      flashcards: flashcardsSnap.docs.map(d => d.data() as any),
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
