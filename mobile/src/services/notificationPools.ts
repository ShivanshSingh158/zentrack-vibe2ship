/**
 * notificationPools.ts — ZenTrack Mobile
 * Clean, high-agency, professional notification copy pools.
 * Tone: Respectful, disciplined, encouraging, non-cringe, with minimal purposeful emojis.
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
  name ? `Good Morning, ${name}` : 'Good Morning',
  name ? `Daily Briefing for ${name}` : 'Daily Briefing',
  'Today\'s Overview',
  name ? `Ready for Today, ${name}` : 'Ready for Today',
  'Your Agenda for Today',
  'Plan for the Day',
];

export const MORNING_BRIEF_STANDARD_POOLS = (summary: string, name?: string) => [
  name
    ? `Good morning, ${name}. You have ${summary} on your agenda today.`
    : `You have ${summary} on your agenda today. Tap to review your schedule.`,
  `Here is your plan for today: ${summary}. Ready when you are.`,
  name
    ? `Today's focus, ${name}: ${summary}. Make steady progress step by step.`
    : `Today's focus: ${summary}. Make steady progress step by step.`,
  `Scheduled for today: ${summary}. Tap to open ZenTrack.`,
  `Daily overview ready: ${summary} in your queue. Have a productive day.`,
  `Your agenda is set: ${summary}. Tap to view details or begin.`,
];

export const MORNING_BRIEF_MISSED_GYM_TITLES = (name?: string) => [
  name ? `Workout Check-in, ${name}` : 'Workout Check-in',
  'Fitness Schedule',
  name ? `Back on Track Today, ${name}` : 'Back on Track Today',
  'Training Check-in',
];

export const MORNING_BRIEF_MISSED_GYM_POOLS = (summary: string, name?: string) => [
  name
    ? `Resume your momentum today, ${name}: ${summary} plus your scheduled workout session.`
    : `Resume your momentum today: ${summary} plus your scheduled workout session.`,
  `Consistency builds progress. Today\'s agenda includes ${summary} and your workout.`,
  `Get back into your training rhythm today. Focus on ${summary} and hit the gym.`,
  `Reset today with focus: ${summary} and your workout are on the docket.`,
];

// ── 2. Overdue Task Nudge ─────────────────────────────────────────────────────

export const OVERDUE_TASK_POOLS = (countStr: string) => [
  `You have ${countStr} uncompleted from yesterday. Tap to review or reschedule.`,
  `Clear your backlog: ${countStr} carried over. A quick review keeps your agenda clean.`,
  `${countStr} remaining from yesterday. Take a few minutes to check them off or adjust dates.`,
  `Pending tasks: ${countStr} carried over. Tap to organize today\'s priorities.`,
  `Review backlog: ${countStr} awaiting completion. Tap to update your list.`,
];

// ── 3. Task Buffer Alert ──────────────────────────────────────────────────────

export const TASK_BUFFER_POOLS = (title: string, bufferMin: number) => [
  `"${title}" starts in ${bufferMin} minutes. Tap to view details or prepare.`,
  `Upcoming task: "${title}" begins in ${bufferMin} minutes. Wrap up current work and get ready.`,
  `In ${bufferMin} minutes: "${title}". Take a moment to prepare your workspace.`,
  `Scheduled in ${bufferMin}m: "${title}". Tap to view task notes or start early.`,
  `Reminder: "${title}" is set to begin in ${bufferMin} minutes.`,
];

// ── 4. T-15 Execution Warning ─────────────────────────────────────────────────

export const TASK_T15_POOLS = (title: string) => [
  `"${title}" begins in 15 minutes. Time to focus and get started.`,
  `Starting in 15 minutes: "${title}". Tap to view task notes.`,
  `15-minute reminder for "${title}". Get ready to dive in.`,
  `Your next focus block is "${title}" in 15 minutes. Tap to open.`,
];

// ── 5. Daily Unscheduled Task ─────────────────────────────────────────────────

export const TASK_DAILY_POOLS = (title: string) => [
  `Today\'s focus: "${title}". Tap to view details or mark as complete.`,
  `You have "${title}" planned for today. Tap to schedule a time or complete it.`,
  `Focus item for today: "${title}". Make steady progress today.`,
  `Planned for today: "${title}". Tap to view or complete.`,
];

// ── 6. Calendar Event ─────────────────────────────────────────────────────────

export const CALENDAR_EVENT_POOLS = (title: string, time?: string) => [
  `"${title}" starts in 1 hour${time ? ` (${time})` : ''}. Tap to view event details.`,
  `Upcoming event: "${title}" at ${time || 'scheduled time'}. Prepare your notes.`,
  `1-hour reminder for "${title}". Tap to check location and details.`,
  `Scheduled event: "${title}" is coming up in 1 hour.`,
];

// ── 7. Habit Streak At Risk ───────────────────────────────────────────────────

export const HABIT_STREAK_RISK_POOLS = (habitName: string, streakCount: number) => [
  `Your ${streakCount}-day streak for "${habitName}" is at risk. Tap to log before midnight.`,
  `Keep your momentum going: "${habitName}" (${streakCount} days) hasn't been recorded today.`,
  `Protect your ${streakCount}-day streak. Take 5 seconds to log "${habitName}".`,
  `Streak reminder: ${streakCount} days on "${habitName}". Log today\'s completion to maintain it.`,
];

// ── 8. Habit Daily — Streak Tier 30+ ─────────────────────────────────────────

export const HABIT_DAILY_30_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} of "${habitName}". Exceptional consistency—tap to record today.`,
  `${streakCount}-day streak on "${habitName}". Maintain your discipline today.`,
  `Outstanding progress: Day ${streakCount} for "${habitName}". Tap to check in.`,
  `Long-term mastery: "${habitName}" is on Day ${streakCount}. Tap to keep the chain strong.`,
];

// ── 9. Habit Daily — Streak Tier 7+ ──────────────────────────────────────────

export const HABIT_DAILY_7_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} of "${habitName}". Solid momentum—tap to record today.`,
  `${streakCount} consecutive days for "${habitName}". Keep the chain unbroken.`,
  `Great consistency: Day ${streakCount} of "${habitName}". Tap to log your check-in.`,
  `Habit building: "${habitName}" reaches Day ${streakCount}. Tap to log.`,
];

// ── 10. Habit Daily — Streak Tier 1+ ─────────────────────────────────────────

export const HABIT_DAILY_1_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} of "${habitName}". Tap to log your progress today.`,
  `Keep the habit alive: "${habitName}" (Day ${streakCount}) is ready to be logged.`,
  `Building momentum: remember to complete "${habitName}" today.`,
  `Daily check-in: log your progress on "${habitName}" for Day ${streakCount}.`,
];

// ── 11. Habit Daily — Streak Tier 0 (Fresh Start) ────────────────────────────

export const HABIT_DAILY_0_POOLS = (habitName: string) => [
  `Start strong: Day 1 of "${habitName}". Tap to record your first check-in.`,
  `New habit starting today: "${habitName}". Take the first step.`,
  `Set the foundation: log Day 1 of "${habitName}" today.`,
  `First check-in: start your consistency streak with "${habitName}".`,
];

// ── 12. Gym Workout Reminder ──────────────────────────────────────────────────

export const GYM_WORKOUT_POOLS = (planName: string, exercisePreview?: string, totalExercises?: number) => {
  const previewClause = exercisePreview
    ? `: ${exercisePreview}${totalExercises && totalExercises > 3 ? ` +${totalExercises - 3} more` : ''}`
    : '';
  return [
    `Scheduled for today: ${planName}${previewClause}. Tap to view your workout.`,
    `Time to train: ${planName}${previewClause}. Stay consistent and log your sets.`,
    `Today's session: ${planName}${previewClause}. Tap to begin tracking.`,
    `Workout ready: ${planName}${previewClause}. Tap to review exercises.`,
  ];
};

// ── 13. Gym Rest Day ──────────────────────────────────────────────────────────

export const GYM_REST_DAY_POOLS = () => [
  'Today is a scheduled recovery day. Focus on rest, hydration, and nutrition.',
  'Active recovery day. Allow muscles to recover for your next session.',
  'Rest and recharge today. Quality recovery supports steady progress.',
  'Recovery day: hydrate, stretch, and get adequate sleep.',
];

// ── 14. Attendance < 75% Warning ─────────────────────────────────────────────

export const ATTENDANCE_CRITICAL_POOLS = (subjName: string, pct: string, needed: number) => [
  `${subjName} attendance is at ${pct}%. Attend the next ${needed} classes to reach 75%.`,
  `Attendance alert: ${subjName} is currently ${pct}%. You need ${needed} consecutive classes for safety.`,
  `${subjName} is below the 75% threshold (${pct}%). Ensure you attend today\'s session.`,
  `Academic alert: ${subjName} at ${pct}%. ${needed} more attendances required to reach safety margin.`,
];

// ── 15. Class Pre-Warning ─────────────────────────────────────────────────────

export const CLASS_PRE_POOLS = (subject: string, time: string, timeStr: string, bunkStatus?: string) => [
  `${subject} begins in ${timeStr}${time ? ` (${time})` : ''}.${bunkStatus ? ` ${bunkStatus}` : ' Tap to view class details.'}`,
  `Upcoming class: ${subject} in ${timeStr}.${bunkStatus ? ` ${bunkStatus}` : ' Time to head over.'}`,
  `Class reminder: ${subject} starts in ${timeStr}.${bunkStatus ? ` ${bunkStatus}` : ' Tap to check notes or room.'}`,
  `${subject} starts in ${timeStr}.${bunkStatus ? ` ${bunkStatus}` : ' Tap to view your schedule.'}`,
];

// ── 16. Post-Class Attendance Log ────────────────────────────────────────────

export const POST_CLASS_LOG_POOLS = (subject: string) => [
  `${subject} class has ended. Tap to record your attendance status.`,
  `Update your records: mark Present, Absent, or Cancelled for ${subject}.`,
  `Keep your attendance accurate: log your status for ${subject}.`,
  `Class finished: tap to log attendance for ${subject}.`,
];

// ── 17. Mid-Lab Checkpoint ────────────────────────────────────────────────────

export const LAB_MID_POOLS = (subject: string) => [
  `One hour completed in ${subject} lab. Tap if you need to log hourly attendance.`,
  `Mid-session checkpoint for ${subject} lab. Tap to update your log.`,
  `${subject} practical: first hour completed. Tap to record progress.`,
];

// ── 18. Post-Lab Log ─────────────────────────────────────────────────────────

export const POST_LAB_LOG_POOLS = (subject: string) => [
  `${subject} lab completed. Tap to record your practical attendance.`,
  `Practical session finished for ${subject}. Mark your attendance to stay up to date.`,
  `${subject} lab has concluded. Tap to log your final status.`,
];

// ── 19. Assignment 48h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_48H_POOLS = (title: string) => [
  `"${title}" is due in 48 hours. Review requirements and make headway today.`,
  `Upcoming deadline: 2 days left for "${title}". Tap to view details.`,
  `48-hour reminder for "${title}". Plan time today to finish without rushing.`,
  `Assignment deadline approaching: "${title}" is due in 2 days.`,
];

// ── 20. Assignment 24h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_24H_POOLS = (title: string) => [
  `"${title}" is due tomorrow. Complete your final review and submit on time.`,
  `Final 24 hours for "${title}". Ensure your submission is ready.`,
  `Due tomorrow: "${title}". Tap to check requirements and submit.`,
  `Upcoming deadline tomorrow: finish and submit "${title}".`,
];

// ── 21. Hydration — Titles ───────────────────────────────────────────────────

export const WATER_TITLES_POOL = [
  'Hydration Reminder',
  'Water Check-in',
  'Time to Hydrate',
  'Daily Water Check',
  'Stay Hydrated',
];

// ── 21. Hydration — With Progress ────────────────────────────────────────────

export const WATER_PROGRESS_POOLS = (loggedL: string, remainingL: string, goalL: string) => [
  `${loggedL}L logged so far. ${remainingL}L remaining toward your ${goalL}L goal.`,
  `Hydration progress: ${loggedL}L / ${goalL}L completed. Remember to drink a glass of water.`,
  `You're at ${loggedL}L today with ${remainingL}L to reach your ${goalL}L target.`,
  `Keep steady hydration: ${remainingL}L left to complete your ${goalL}L daily goal.`,
  `Steady progress: ${loggedL}L recorded. Drink some water to stay on track.`,
];

// ── 22. Hydration — Zero Logged ───────────────────────────────────────────────

export const WATER_EMPTY_POOLS = () => [
  'No water logged yet today. Take a moment to drink a glass and log your intake.',
  'Stay refreshed and focused today. Remember to drink some water.',
  'Hydration check: log your first glass of water to track today\'s progress.',
  'Maintain your focus and energy. Drink a glass of water to start today\'s goal.',
  'Health reminder: take a water break and log your intake.',
];

// ── 23. Sleep Wind-Down ───────────────────────────────────────────────────────

export const SLEEP_NIGHT_POOLS = () => [
  'Time to wind down for the night. Good rest prepares you for a productive day tomorrow.',
  'Prepare for sleep. Dim the screen, disconnect, and recharge for tomorrow.',
  'End-of-day recovery: restful sleep supports your energy and mental clarity tomorrow.',
  'Wind-down reminder: disconnect for the night and log your sleep schedule.',
];

// ── 24. Sleep Morning Log ─────────────────────────────────────────────────────

export const SLEEP_MORNING_POOLS = () => [
  'Good morning. Take 10 seconds to log your sleep and check your daily readiness.',
  'Record last night\'s sleep duration to keep your recovery insights accurate.',
  'Start the day fresh: tap to log your sleep and view today\'s schedule.',
  'Morning check-in: how did you sleep? Tap to record your rest hours.',
];

// ── 25. Weekly Review ─────────────────────────────────────────────────────────

export const WEEKLY_REVIEW_POOLS = () => [
  'Your weekly summary is ready. Tap to review your accomplishments and plan ahead.',
  'Take 5 minutes to reflect on this week\'s progress, habits, and priorities for next week.',
  'Weekly reflection: review your completed tasks, streak continuity, and upcoming goals.',
  'Sunday review: audit your progress and set priorities for the upcoming week.',
];

// ── 26. Inactivity Nudge ──────────────────────────────────────────────────────

export const INACTIVITY_POOLS = (days: number) => [
  `You haven't checked in for ${days} days. Tap to review your tasks and get back on track.`,
  `A quick check-in can rebuild your momentum. Take 2 minutes to plan your day.`,
  `ZenTrack is ready when you are. Review your goals and log today\'s progress.`,
  `Check in to keep your streak and tasks organized. Tap to open ZenTrack.`,
];

// ── 27. Hydration Milestones ──────────────────────────────────────────────────

export const WATER_MILESTONE_50_POOLS = (loggedL: string, targetL: string) => [
  `Halfway there: you've reached 50% of your daily water goal (${loggedL}L / ${targetL}L).`,
  `50% hydration achieved. Maintain steady intake through the day.`,
  `Halfway mark reached: ${loggedL}L logged today. Keep going.`,
];

export const WATER_MILESTONE_75_POOLS = (loggedL: string, targetL: string) => [
  `75% achieved: you've logged ${loggedL}L today. Almost at your ${targetL}L target.`,
  `Three-quarters completed (${loggedL}L). One more glass will close out today's goal.`,
  `Steady progress: 75% of your target is complete. Keep the momentum going.`,
];

export const WATER_MILESTONE_100_POOLS = (loggedL: string) => [
  `Daily goal reached: you've completed 100% of your hydration target (${loggedL}L). Excellent consistency.`,
  `Hydration goal completed: ${loggedL}L logged today. Target achieved.`,
  `100% hydration milestone reached. Well hydrated for the day.`,
];
