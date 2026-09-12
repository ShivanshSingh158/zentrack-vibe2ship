/**
 * notificationPools.ts — ZenTrack Mobile
 * Professional, hooky, minimal-emoji notification copy.
 * Tone: Sharp, direct, high-agency. No filler, no cringe, no slang.
 */

export function getRandomMessage(messages: string[]): string {
  if (!messages || messages.length === 0) return '';
  return messages[Math.floor(Math.random() * messages.length)];
}

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ══════════════════════════════════════════════════════════════════════════════
//   NOTIFICATION COPY POOLS
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Morning Briefing ───────────────────────────────────────────────────────

export const MORNING_BRIEF_TITLES_STANDARD = (name?: string) => [
  name ? `Morning, ${name}.` : 'Good Morning.',
  "Today's Briefing",
  'Your Day Starts Now',
  name ? `${name}, here's your plan.` : "Here's your plan.",
  'Daily Agenda Ready',
  'Time to Get Moving',
];

export const MORNING_BRIEF_STANDARD_POOLS = (summary: string, name?: string) => [
  name
    ? `${name}, you have ${summary} lined up today. Tap to review.`
    : `You have ${summary} lined up today. Tap to review.`,
  `Today's agenda: ${summary}. Start whenever you're ready.`,
  name
    ? `${name}: ${summary} on deck. Let's make today count.`
    : `${summary} on deck today. Tap to open your schedule.`,
  `${summary} scheduled for today. Tap for the full view.`,
  `Your plan is set — ${summary} awaits. Tap to begin.`,
  `Day loaded: ${summary} in your queue. Tap to dive in.`,
];

export const MORNING_BRIEF_MISSED_GYM_TITLES = (name?: string) => [
  name ? `${name}, don't skip the gym again.` : 'Workout Missed Yesterday',
  'Back on Track Today',
  'Training Day',
  'Pick Up Where You Left Off',
];

export const MORNING_BRIEF_MISSED_GYM_POOLS = (summary: string, name?: string) => [
  name
    ? `${name}: ${summary} plus a workout session today. Don't let two days slip.`
    : `${summary} and a gym session today. Don't let two days slip.`,
  `Consistency wins over intensity. Today: ${summary} and your workout.`,
  `Reset the streak. Hit ${summary} and the gym before the day's out.`,
  `Back at it: ${summary} and your training session are both on the list.`,
];

// ── 2. Overdue Task Nudge ─────────────────────────────────────────────────────

export const OVERDUE_TASK_POOLS = (countStr: string) => [
  `${countStr} from yesterday, still unfinished. Quick — review or reschedule.`,
  `Your backlog grew overnight: ${countStr} waiting. Clear it before today piles on.`,
  `${countStr} carried over from yesterday. A two-minute review keeps things clean.`,
  `Don't start today behind. ${countStr} pending — tap to sort it out.`,
  `${countStr} unresolved from yesterday. Reschedule or close them now.`,
];

// ── 3. Task Buffer Alert ──────────────────────────────────────────────────────

export const TASK_BUFFER_POOLS = (title: string, bufferMin: number) => [
  `"${title}" kicks off in ${bufferMin} minutes. Wrap up and get ready.`,
  `${bufferMin} minutes to "${title}". Time to shift focus.`,
  `Coming up in ${bufferMin}m: "${title}". Tap to review before you start.`,
  `"${title}" starts in ${bufferMin} minutes. Close what you're doing.`,
  `${bufferMin}-minute heads-up: "${title}" is next on your schedule.`,
];

// ── 4. T-15 Execution Warning ─────────────────────────────────────────────────

export const TASK_T15_POOLS = (title: string) => [
  `15 minutes to "${title}". Finish up and focus.`,
  `"${title}" starts in 15 minutes. Tap to review your notes.`,
  `Final 15 minutes before "${title}". Clear your desk and get set.`,
  `Your next focus block — "${title}" — begins in 15 minutes.`,
];

// ── 5. Daily Unscheduled Task ─────────────────────────────────────────────────

export const TASK_DAILY_POOLS = (title: string) => [
  `"${title}" is on today's list. Mark it done or set a time.`,
  `Don't let "${title}" carry over. Tap to schedule or complete.`,
  `Today's item: "${title}". Find a slot or close it out.`,
  `"${title}" is waiting. Tap to take action.`,
];

// ── 6. Calendar Event ─────────────────────────────────────────────────────────
// offsetLabel: e.g. "1 hour", "30 min", "15 min"

export const CALENDAR_EVENT_POOLS = (title: string, time?: string, offsetLabel?: string) => {
  const when = offsetLabel ?? '1 hour';
  const at = time ? ` (${time})` : '';
  return [
    `"${title}" starts in ${when}${at}. Tap to review the details.`,
    `Upcoming: "${title}"${at} — ${when} away. Time to prepare.`,
    `${when} until "${title}"${at}. Don't be the one who shows up late.`,
    `Event alert: "${title}"${at} begins in ${when}. Tap to view.`,
  ];
};

// ── 7. Habit Streak At Risk ───────────────────────────────────────────────────

export const HABIT_STREAK_RISK_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days of "${habitName}" — don't let tonight break the chain.`,
  `"${habitName}" still unlogged. You have until midnight to protect your ${streakCount}-day streak.`,
  `Your ${streakCount}-day run on "${habitName}" is on the line. Tap to log.`,
  `Streak at risk: "${habitName}" needs a check-in before midnight.`,
];

// ── 8. Habit Daily — Streak Tier 30+ ─────────────────────────────────────────

export const HABIT_DAILY_30_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount}. "${habitName}" has become part of who you are. Log it.`,
  `${streakCount}-day streak on "${habitName}". Don't make today the exception.`,
  `"${habitName}" — Day ${streakCount}. Keep the standard you've built.`,
  `Exceptional: ${streakCount} days straight on "${habitName}". Tap to record today.`,
];

// ── 9. Habit Daily — Streak Tier 7+ ──────────────────────────────────────────

export const HABIT_DAILY_7_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days in a row on "${habitName}". Don't break it today.`,
  `"${habitName}" is building momentum — Day ${streakCount}. Tap to log.`,
  `Solid ${streakCount}-day run. "${habitName}" is becoming automatic. Log it.`,
  `Day ${streakCount} of "${habitName}". Small actions, compounding results.`,
];

// ── 10. Habit Daily — Streak Tier 1+ ─────────────────────────────────────────

export const HABIT_DAILY_1_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} of "${habitName}". Keep the streak alive — tap to log.`,
  `"${habitName}" (Day ${streakCount}) is ready for today's check-in.`,
  `Building something real: "${habitName}", Day ${streakCount}. Don't skip.`,
  `Log "${habitName}" for Day ${streakCount}. Progress is made one day at a time.`,
];

// ── 11. Habit Daily — Streak Tier 0 (Fresh Start) ────────────────────────────

export const HABIT_DAILY_0_POOLS = (habitName: string) => [
  `Day 1 of "${habitName}" starts now. Tap to log your first check-in.`,
  `Every streak starts somewhere. Begin "${habitName}" today.`,
  `"${habitName}" — your first check-in is one tap away.`,
  `Start clean: log Day 1 of "${habitName}" and build from here.`,
];

// ── 12. Gym Workout Reminder ──────────────────────────────────────────────────

export const GYM_WORKOUT_POOLS = (planName: string, exercisePreview?: string, totalExercises?: number) => {
  const previewClause = exercisePreview
    ? `: ${exercisePreview}${totalExercises && totalExercises > 3 ? ` +${totalExercises - 3} more` : ''}`
    : '';
  return [
    `Today's session: ${planName}${previewClause}. Tap to view and start tracking.`,
    `${planName} is on the schedule${previewClause}. No excuses — tap to begin.`,
    `Time to train. ${planName}${previewClause} is waiting.`,
    `Workout ready: ${planName}${previewClause}. Tap to log your sets.`,
  ];
};

// ── 13. Gym Rest Day ──────────────────────────────────────────────────────────

export const GYM_REST_DAY_POOLS = () => [
  'Scheduled rest day. Recover well — your next session depends on it.',
  'Today is recovery. Sleep, hydrate, and let the muscles rebuild.',
  'Active rest day. A short walk or stretch counts. Don\'t overdo it.',
  'Rest is training too. Protect today\'s recovery for tomorrow\'s performance.',
];

// ── 14. Attendance < 75% Warning ─────────────────────────────────────────────

export const ATTENDANCE_CRITICAL_POOLS = (subjName: string, pct: string, needed: number) => [
  `${subjName}: ${pct}% attendance. You need ${needed} more classes to hit the safety mark.`,
  `Attendance risk in ${subjName} (${pct}%). Attend the next ${needed} sessions — no exceptions.`,
  `${subjName} is below threshold at ${pct}%. ${needed} consecutive classes will get you back to 75%.`,
  `Warning: ${subjName} attendance is ${pct}%. Missing today costs you more to recover.`,
];

// ── 15. Class Pre-Warning ─────────────────────────────────────────────────────

export const CLASS_PRE_POOLS = (subject: string, time: string, timeStr: string, bunkStatus?: string) => [
  `${subject} in ${timeStr}${time ? ` (${time})` : ''}.${bunkStatus ? ` ${bunkStatus}` : ' Tap to check notes or room.'}`,
  `Heads-up: ${subject} starts in ${timeStr}.${bunkStatus ? ` ${bunkStatus}` : " Don't be late."}`,
  `${timeStr} until ${subject}${time ? ` at ${time}` : ''}.${bunkStatus ? ` ${bunkStatus}` : ' Tap to review your schedule.'}`,
  `Class alert: ${subject} — ${timeStr} away.${bunkStatus ? ` ${bunkStatus}` : ' Start making your way over.'}`,
];

// ── 16. Post-Class Attendance Log ────────────────────────────────────────────

export const POST_CLASS_LOG_POOLS = (subject: string) => [
  `${subject} is done. Log your attendance before you forget.`,
  `Class over: mark yourself for ${subject} — present, absent, or cancelled.`,
  `Keep your records accurate. Tap to log ${subject} attendance.`,
  `${subject} wrapped up. Quick tap to update your attendance.`,
];

// ── 17. Mid-Lab Checkpoint ────────────────────────────────────────────────────

export const LAB_MID_POOLS = (subject: string) => [
  `One hour into ${subject} lab. Tap to log if hourly attendance is tracked.`,
  `${subject} practical — first hour done. Mark your checkpoint if needed.`,
  `Mid-session: ${subject} lab is halfway. Tap to update your log.`,
];

// ── 18. Post-Lab Log ─────────────────────────────────────────────────────────

export const POST_LAB_LOG_POOLS = (subject: string) => [
  `${subject} lab is done. Log your practical attendance now.`,
  `Practical session complete: mark your attendance for ${subject}.`,
  `${subject} lab finished. Tap to update your record before you move on.`,
];

// ── 19. Assignment 48h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_48H_POOLS = (title: string) => [
  `"${title}" is due in 48 hours. Make real progress today, not tomorrow.`,
  `Two days left for "${title}". Start now — review, outline, or draft.`,
  `48-hour mark: "${title}" is due soon. Tap to check what's left.`,
  `Deadline in 2 days: "${title}". Don't let it sneak up on you.`,
];

// ── 20. Assignment 24h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_24H_POOLS = (title: string) => [
  `"${title}" is due tomorrow. Final review, polish, and submit.`,
  `24 hours left on "${title}". Submit on time — late is worse than imperfect.`,
  `Due tomorrow: "${title}". If it's not done, it needs to be today.`,
  `Final call: "${title}" is due in a day. Tap to wrap it up.`,
];

// ── 21. Hydration — Titles ───────────────────────────────────────────────────

export const WATER_TITLES_POOL = [
  'Hydration Check',
  'Drink Some Water',
  'Time to Hydrate',
  'Water Break',
  'Stay Sharp — Drink Up',
];

// ── 22. Hydration — With Progress ────────────────────────────────────────────

export const WATER_PROGRESS_POOLS = (loggedL: string, remainingL: string, goalL: string) => [
  `${loggedL}L in. ${remainingL}L left to hit your ${goalL}L goal — keep drinking.`,
  `Progress: ${loggedL}L of ${goalL}L logged. One more glass keeps the streak clean.`,
  `${remainingL}L to go for your ${goalL}L target. Grab a glass and log it.`,
  `You're at ${loggedL}L. ${remainingL}L stands between you and your daily goal.`,
  `Halfway or more: ${loggedL}L logged. Keep the intake steady through the day.`,
];

// ── 23. Hydration — Zero Logged ───────────────────────────────────────────────

export const WATER_EMPTY_POOLS = () => [
  'Nothing logged yet. Start with one glass — it takes ten seconds.',
  'Dehydration quietly tanks your focus. Drink something and log it.',
  'First water of the day: tap to log and start your intake goal.',
  'Your water count is at zero. Grab a glass and check it off.',
  'No intake recorded today. A glass of water is a two-second habit.',
];

// ── 24. Sleep Wind-Down ───────────────────────────────────────────────────────

export const SLEEP_NIGHT_POOLS = () => [
  'Time to wind down. Good sleep is the most underrated productivity tool.',
  "Put the screen away. Your recovery starts when you close your eyes.",
  "Dim the lights and disconnect. Tomorrow's performance is built tonight.",
  'End-of-day reminder: rest well. Eight hours now means eight strong ones tomorrow.',
];

// ── 25. Sleep Morning Log ─────────────────────────────────────────────────────

export const SLEEP_MORNING_POOLS = () => [
  "Log last night's sleep. Ten seconds of data, better long-term insights.",
  'Morning. Tap to record your sleep hours and start the day with a clear head.',
  'Track your recovery: log how many hours you slept last night.',
  'Sleep logged means better patterns spotted. Take a second and record it.',
];

// ── 26. Weekly Review ─────────────────────────────────────────────────────────

export const WEEKLY_REVIEW_POOLS = () => [
  'The week is done. Five minutes of reflection changes how you start the next one.',
  "Weekly review time. What went well, what didn't, what's next — tap to reflect.",
  "Sunday debrief: review your week and set the tone for tomorrow's Monday.",
  'Progress compounds when you actually track it. Tap to open your weekly review.',
];

// ── 27. Inactivity Nudge ──────────────────────────────────────────────────────

export const INACTIVITY_POOLS = (days: number) => [
  `${days} days without a check-in. Your tasks and streaks are waiting — tap to catch up.`,
  `It's been ${days} days. Momentum is easier to maintain than rebuild. Come back.`,
  `ZenTrack hasn't heard from you in ${days} days. Two minutes to get back on track.`,
  `${days}-day gap. Log one thing today — it's all it takes to restart the habit.`,
];

// ── 28. Hydration Milestones ──────────────────────────────────────────────────

export const WATER_MILESTONE_50_POOLS = (loggedL: string, targetL: string) => [
  `Halfway: ${loggedL}L of ${targetL}L done. Keep the pace through the afternoon.`,
  `50% of your water goal reached (${loggedL}L). Drink steady — don't coast.`,
  `${loggedL}L logged — you're at the halfway mark. ${targetL}L is the target.`,
];

export const WATER_MILESTONE_75_POOLS = (loggedL: string, targetL: string) => [
  `${loggedL}L in — 75% done. One more push and you've hit your ${targetL}L target.`,
  `Three-quarters there: ${loggedL}L of ${targetL}L logged. Finish it off.`,
  `75% reached. ${loggedL}L down — one glass away from your daily goal.`,
];

export const WATER_MILESTONE_100_POOLS = (loggedL: string) => [
  `${loggedL}L — daily goal done. That's a clean win for today.`,
  `Goal reached: ${loggedL}L logged. Stay hydrated through the evening too.`,
  `Hydration complete: ${loggedL}L. Well done — your body will thank you.`,
];
