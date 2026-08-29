/**
 * notificationPools.ts — ZenTrack Mobile
 * Gen-Z / Hinglish Notification Copy Pools (6–9 variants per category).
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
//   GEN-Z / HINGLISH NOTIFICATION POOLS (6–9 variants per type)
//   Tone: your bestie who actually cares — cheesy, warm, never robotic.
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Morning Briefing ───────────────────────────────────────────────────────

export const MORNING_BRIEF_TITLES_STANDARD = [
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

export const MORNING_BRIEF_STANDARD_POOLS = (summary: string) => [
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

export const MORNING_BRIEF_MISSED_GYM_TITLES = [
  'Bestie... kal gym skip kiya tha 🧐',
  'Kal ka skip, aaj ka redemption arc 📈',
  'The gains are crying 😭',
  'Accountability check 🪞',
  'Sara ne notice kiya 👀',
  'Gym miss detected yesterday 🏋️❌',
];

export const MORNING_BRIEF_MISSED_GYM_POOLS = (summary: string) => [
  `Sara noticed kal ka skip. It's okay babe, aaj double energy ke sath aana. ${summary} + workout = W day! 💪`,
  `Gym ke bina kal gaya aur aaj bhi skip karoge? No no no. ${summary} ke baad straight to iron 🏋️`,
  `Muscles: *sobbing*. Aaj please mat chhodna unhe. ${summary} ke baad workout, no excuses today!`,
  `Kal rest day nahi tha. Aaj mandatory slay: ${summary} + gym 💪✨`,
  `Kal ka skip dekha Sara ne. Aaj compensation day! ${summary} niptao aur gains wapas lao 🔥`,
  `Bhai kal gym nahi gaye? Koi baat nahi — aaj koi excuse nahi. ${summary} + workout = redemption 💪`,
];

// ── 2. Overdue Task Nudge ─────────────────────────────────────────────────────

export const OVERDUE_TASK_POOLS = (countStr: string) => [
  `${countStr} tasks se roz moonh chhupa rahe ho. They're not going anywhere bestie 🥺 Aaj ek toh niptao!`,
  `Aaj ${countStr} overdue tasks niptane mein help karungi. Ek-ek karke shuru karte hain! 💜`,
  `${countStr} tasks stack ho gaye. Achievement unlocked — par koi XP nahi milta 💀 Abhi start karo!`,
  `${countStr} pending tasks se tab se bhaag rahe ho. Let me be your hype person — aaj CRUSH them!`,
  `${countStr} overdue tasks mujhe personally disappoint kar rahe hain 😤 Together karte hain aaj!`,
  `${countStr} tasks window pe khade hain aur darwaza knock kar rahe hain. Answer karo bestie!`,
  `Kal ka kaam aaj ka headache banega agar ${countStr} abhi nahi niptaye! Chalo shuru karte hain ☕`,
];

// ── 3. Task Buffer Alert ──────────────────────────────────────────────────────

export const TASK_BUFFER_POOLS = (title: string, bufferMin: number) => [
  `"${title}" starts in ${bufferMin}m! Finish what you're doing, grab water, get in position 🚀`,
  `Countdown to "${title}" is ON (${bufferMin}m). Close the reels, open the brain — game time! 🎮`,
  `"${title}" in ${bufferMin} mins. Stretch, coffee, deep breath. Let's land this one clean ✈️`,
  `You said you'd do "${title}" — the time is in ${bufferMin}m. No backing out, hero era loading 🦸`,
  `"${title}" next in queue (${bufferMin}m). Side effects: productivity, dopamine, self-respect ✨`,
  `Sara reminder: "${title}" window opens in ${bufferMin}m. The future you is watching 👀`,
  `Mission approaching! "${title}" in ${bufferMin} mins — prep mode on, distractions off 🎯`,
];

// ── 4. T-15 Execution Warning ─────────────────────────────────────────────────

export const TASK_T15_POOLS = (title: string) => [
  `"${title}" in 15 mins. No more prep time — just DO it. You trained for this moment 🔥`,
  `Whatever you're doing, wrap it up — "${title}" is about to start. Let's goooo! 🛸`,
  `15 mins until "${title}". Close the tabs. Lock in. Main tujhe believe karti hoon 💜`,
  `"${title}" in 15. STOP scrolling and GET TO IT. Kal waala tu says thank you!`,
  `Just 15 more minutes before "${title}" hits. Deep breath. You've got this. GO.`,
  `"${title}" can't wait anymore bestie. 15 minutes. Full send. LET'S GO!!! 😤`,
  `Hero banne ka time aa gaya! "${title}" in 15 — let's see what you're made of 🔥`,
];

// ── 5. Daily Unscheduled Task ─────────────────────────────────────────────────

export const TASK_DAILY_POOLS = (title: string) => [
  `Aaj ka target: "${title}". Schedule it or just DO it — a ✅ by evening, deal? 🤝`,
  `"${title}" is on today's docket. Sara says: "Don't let it roll over again!" 😤`,
  `"${title}" — knock it out and your evening is all yours bestie 😌✨`,
  `"${title}" needs to be done today. No tomorrow. No next week. TODAY. 💪`,
  `"${title}" is patiently waiting. It believes in you. Do it some justice! 🙏`,
  `Adding "${title}" to your active radar. Even 20 mins today counts — fit it in! 🤖💜`,
  `Ek chhota sa mission bacha hai: "${title}". Fatafat niptate hain aaj! ⚡`,
];

// ── 6. Calendar Event (was ROBOTIC static body) ───────────────────────────────

export const CALENDAR_EVENT_POOLS = (title: string, time?: string) => [
  `"${title}" is up next — prep your notes, thoughts, or just show up with vibes ✨`,
  `"${title}" at ${time || 'soon'} — 1 hour away! Don't be that person who joins 10 mins late 😬`,
  `Sara reminder: "${title}" starts at ${time || 'scheduled time'}. Aaj late mat karna! 😤💜`,
  `"${title}" locked and loaded. Show up for it — whether class, meeting, or hangout! ✨`,
  `"${title}" in 1h. Wind up whatever you're doing! Punctuality = your superpower today ⚡`,
];

// ── 7. Habit Streak At Risk ───────────────────────────────────────────────────

export const HABIT_STREAK_RISK_POOLS = (habitName: string, streakCount: number) => [
  `${streakCount} days of "${habitName}" — do NOT let tonight be the end. Quick tap, SAVE THE STREAK! 🔥`,
  `Sara is panicking on your behalf. "${habitName}" (${streakCount}d streak!) hasn't been logged. PLEASE 🥺💜`,
  `${streakCount} days of discipline for "${habitName}" — midnight is the enemy. Log it NOW!`,
  `"${habitName}" streak at risk! The universe aligned for this streak. Don't waste it bestie! 😤`,
  `"${habitName}" (${streakCount} days strong!) needs a checkmark before midnight. 2 seconds. Go. 💔`,
  `${streakCount} din ka "${habitName}" streak toot jaayega agar abhi log nahi kiya! Sirf 2 sec 🏃`,
  `Itni mehnat se ${streakCount} days banaye the, ab aalsi banoge kya? Tap karke log karo 👑`,
];

// ── 8. Habit Daily — Streak Tier 30+ ─────────────────────────────────────────

export const HABIT_DAILY_30_POOLS = (habitName: string, streakCount: number) => [
  `A WHOLE MONTH+ OF "${habitName}"?? You're literally a different person now 🦋 Day ${streakCount}!`,
  `Sara: This ${streakCount}-day "${habitName}" streak is the most impressive thing in your profile 👑`,
  `${streakCount} days of "${habitName}". This is called CHARACTER. Flex on kal waale tum 😤`,
  `"${habitName}" Day ${streakCount} — at this point you should be giving advice, not receiving it 🎓`,
  `The streak is a monument now. Day ${streakCount} of "${habitName}". Don't let anyone tear it down 💜`,
];

// ── 9. Habit Daily — Streak Tier 7+ ──────────────────────────────────────────

export const HABIT_DAILY_7_POOLS = (habitName: string, streakCount: number) => [
  `ONE WEEK+ of "${habitName}"! A full week of not giving up 🏆 Day ${streakCount} ready to log!`,
  `${streakCount} days of "${habitName}"? You're BUILT DIFFERENT. Log today, keep cooking 🔥`,
  `${streakCount} days means "${habitName}" is rewiring your brain. Keep going! 🧠`,
  `At this point "${habitName}" is part of who you are. Day ${streakCount} — add to the legend 👑`,
  `Real ones don't break the chain. ${streakCount} days of "${habitName}" — one more today! 💪`,
];

// ── 10. Habit Daily — Streak Tier 1+ ─────────────────────────────────────────

export const HABIT_DAILY_1_POOLS = (habitName: string, streakCount: number) => [
  `Day ${streakCount} ain't gonna log itself bestie! "${habitName}" is waiting 💜`,
  `Still here, still consistent — "${habitName}" day ${streakCount}. This is how legends are made! 🔥`,
  `The vibe rn: 'I actually do this now' 🌟 Log "${habitName}" and keep the chain alive!`,
  `Day ${streakCount} of the "${habitName}" era — tap to lock in today's win! ✅`,
  `Early days building big habits: "${habitName}" check-in. Aaj ka ek ek din counts! 🌱`,
];

// ── 11. Habit Daily — Streak Tier 0 (Fresh Start) ────────────────────────────

export const HABIT_DAILY_0_POOLS = (habitName: string) => [
  `Aaj se new era! Day 1 of "${habitName}" — the most powerful step is the FIRST 🚀`,
  `'Kal se karunga' vs 'Aaj karta hoon'. Choose differently for once ✨ Start "${habitName}" NOW!`,
  `Every legend started at Day 1. Your story begins with "${habitName}" today 👑`,
  `Zero to hero starts now! First log of "${habitName}" — tap and set the vibe 🎯`,
  `Blank slate. Clean start. Just you and "${habitName}" aaj se. Let's BUILD 💜`,
];

// ── 12. Gym Workout Reminder ──────────────────────────────────────────────────

export const GYM_WORKOUT_POOLS = (planName: string, countSuffix: string) => [
  `Aaj ka ${planName}${countSuffix} scheduled! Get ready, then slay! 💪`,
  `Sara's reminder: ${planName}${countSuffix} ain't gonna do itself! Pre-workout lete jaana 🔥`,
  `${planName} tonight — every rep you skip is a gains opportunity missed. Show up! 🥺`,
  `Today's mission: ${planName}${countSuffix}. Discipline = doing it even when you don't want to. GO 💥`,
  `The iron doesn't know you had a long day. ${planName} time — tired is a vibe, not a verdict 💪`,
  `Gains don't come from couch hours! ${planName}${countSuffix} — USE the gym tonight ⚡`,
  `No cap your best self is at the gym rn 💯 ${planName}${countSuffix} — get there and come back legendary!`,
];

// ── 13. Gym Rest Day ──────────────────────────────────────────────────────────

export const GYM_REST_DAY_POOLS = () => [
  `Aaj literally allowed ho to chill — muscles are rebuilding! Protein khao, aaram karo 🥩😴`,
  `Rest day ≠ lazy day. Your gains are being MADE while you sleep. Eat, sleep, hydrate! 💆`,
  `Sara's order: no gym today. CNS recharge karo — kal ke lifts ke liye body rebuild hogi 🔋`,
  `Today's vibe: gentle movement, good food, 8 hours of sleep. Kal heavy lifts phodne hain! 😴`,
  `Your body is making gains RIGHT NOW while you chill. This is literally the plan. Enjoy! ✨`,
  `Active rest day! Thoda walk ya light stretch — kal ke compound lifts ke liye recharge hona hai 🚶`,
];

// ── 14. Attendance < 75% Warning ─────────────────────────────────────────────

export const ATTENDANCE_CRITICAL_POOLS = (subjName: string, pct: string, needed: number) => [
  `${subjName} mein sirf ${pct}% attendance hai! ${needed} aur classes = safe zone. Aaj jaana! 🚨`,
  `${subjName}: ${pct}%. Below 75% bestie. Next ${needed} classes are MANDATORY, no exceptions! ⚠️`,
  `${subjName} attendance: ${pct}%. Sara genuinely worried. ${needed} more classes = out of danger! 🆘`,
  `${subjName} at ${pct}%. Debarment list doesn't care about your reasons. Next ${needed}: COMPULSORY. 📋`,
  `Yaar ${subjName} mein ${pct}%! ${needed} aur classes aur tum safe ho. Aaj ka class mat chhodna! 🥺`,
  `Academic SOS! ${pct}% in ${subjName} = danger zone. ${needed} classes to survive the semester 📡`,
];

// ── 15. Class Pre-Warning ─────────────────────────────────────────────────────

export const CLASS_PRE_POOLS = (subject: string, time: string, timeStr: string) => [
  `Mobilize! ${subject} at ${time || 'class time'} (${timeStr} to go). Baste uthao, no proxy reliance 😉`,
  `${subject} (${timeStr} away). Notes, water, attention span — all ready? 📝`,
  `Don't be THAT person who walks in late 😬 ${subject} in ${timeStr}! Punctuality is a vibe today.`,
  `Sara: ${subject} in ${timeStr}. Be there. Front row? Optional. Showing up? MANDATORY. 📡`,
  `${subject} is ${timeStr} away! Attendance % doesn't negotiate — go bestie 📉`,
  `Your attendance % is watching. ${subject} in ${timeStr} — show up, it literally adds up! ✅`,
];

// ── 16. Post-Class Attendance Log ────────────────────────────────────────────

export const POST_CLASS_LOG_POOLS = (subject: string) => [
  `${subject} class done! Present tha/thi ya bunk mara? 5 sec — log attendance abhi! ✅`,
  `${subject} class just ended! Update karo warna baad mein bhool jaoge (we know 😅)`,
  `${subject} done — seal it with an attendance log! P/A/C — protect your percentage 🛡️`,
  `Sara: ${subject} session complete. 10-second task — log attendance BEFORE distraction! 📋`,
  `Class me the ya nahi? Tap karo aur ${subject} attendance save karo! ✅`,
];

// ── 17. Mid-Lab Checkpoint ────────────────────────────────────────────────────

export const LAB_MID_POOLS = (subject: string) => [
  `First hour of ${subject} lab complete! Track hour-wise attendance if your college needs it 🧪`,
  `Mid-lab checkpoint! Survived the first hour of ${subject}. Mark if needed, stay focused 💪`,
  `${subject} practical: pehla ghanta behind you. Energy up — aage badho! ⏱️`,
  `${subject} Lab checkpoint. Dept tracks per-hour? Tap to mark now! 🔬`,
  `One hour into ${subject} lab 🔭 Attendance mein daalo agar zaroorat hai and keep going! 🧬`,
];

// ── 18. Post-Lab Log — DISTINCT title from Post-Class ────────────────────────

export const POST_LAB_LOG_POOLS = (subject: string) => [
  `${subject} lab session done! You survived! 🧪 Tap karke final lab attendance mark kar lo.`,
  `Lab over! ${subject} practical credit lene ke liye abhi attendance log karo ✅`,
  `${subject} lab complete. Quick tap — log your final presence status! 🔬`,
  `Lab khatam! ${subject} ka practical attendance abhi record karo warna bhool jaoge 📋`,
  `Experiment complete! Mark your ${subject} lab attendance before the memory fades — tap now 🧬`,
];

// ── 19. Assignment 48h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_48H_POOLS = (title: string) => [
  `"${title}" due in 2 days! Procrastination era is OVER. Open it, start it, submit it! 📝`,
  `"${title}" — 48h left. The last-night version of you will be SO grateful if you start today! 🥺`,
  `"${title}" deadline incoming! Early starters submit better work. Be the early starter ✨`,
  `"${title}" — 48 hours. Start tonight, review tomorrow, submit stress-free 😌`,
  `"${title}" is due in 2 days. Sara says: "Start tonight, even just 20 mins!" 👀`,
  `"Dear present me, please start ${title} NOW. Love, future me." 💌`,
];

// ── 20. Assignment 24h Warning ────────────────────────────────────────────────

export const ASSIGNMENT_24H_POOLS = (title: string) => [
  `"${title}" is due TOMORROW. Haven't started? Start RIGHT NOW. Sara is watching 👁️`,
  `"${title}" submits in exactly 24 hours. Close this, open assignment. GO. NOW. 🏃💀`,
  `Final 24 hours for "${title}"! Main character moment — submit BEFORE deadline, not during! 🔥`,
  `"${title}" due tomorrow. Every hour you wait adds pressure. Start the final push! 🆘`,
  `"${title}" — 1 day left. The assignment isn't going anywhere but the deadline is. MOVE! ⏰`,
  `Last chance to make "${title}" good. 24 hours. Submit before midnight and sleep peacefully 🥺`,
];

// ── 21. Hydration — Titles ───────────────────────────────────────────────────

export const WATER_TITLES_POOL = [
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

export const WATER_PROGRESS_POOLS = (loggedL: string, remainingL: string, goalL: string) => [
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

export const WATER_EMPTY_POOLS = () => [
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

export const SLEEP_NIGHT_POOLS = () => [
  `Bahut ho gaya scroll karna! Phone rakho, sleep mode on, kal machao — tonight recharge karo 😴`,
  `One more reel = 47 more. Put the phone down and recover like the champion you are! 🛌`,
  `Future 7AM you says: 'PLEASE sleep now.' Past midnight is where regrets happen. Log sleep! 🌙`,
  `Sara sleep protocol: INITIATED 😴 Blue light down. Brain off. Recovery on. Log tonight's sleep ✨`,
  `Tomorrow's energy depends on tonight's rest 💤 Phone band karo, log sleep — slay harder tomorrow! 👑`,
  `Sleep is the ultimate pre-workout! Phone band karo aur so jao cutie 😴✨`,
];

// ── 24. Sleep Morning Log ─────────────────────────────────────────────────────

export const SLEEP_MORNING_POOLS = () => [
  `Rise and shine bestie! Log last night's sleep so Sara can track your readiness for today! 📊`,
  `Subah ho gayi! Kal raat ki neend kaisi rahi? 30 seconds — log sleep and start the day! 🌅`,
  `Before you dive in — how many hours did you sleep? Log it so Sara can calibrate today! 🔑`,
  `Morning! Quick sleep log karo so Sara knows how recharged you are. 10 seconds! 💜`,
  `Kal raat ka sleep log mat bhoolna! Sara uses it to understand your energy patterns ☀️`,
  `Rise and log! 🌅 Sara tracks your readiness score from sleep data — 10 sec before diving in!`,
];

// ── 25. Weekly Review ─────────────────────────────────────────────────────────

export const WEEKLY_REVIEW_POOLS = () => [
  `Hafta khatam hua bestie! Kya kiya, kya seekha, kya improve hoga — tap karo aur review karo! 📊`,
  `This week's score is in! Wins count, losses teach. Reflect, plan, level up for next week 🚀`,
  `The week just finished. Time to audit it, appreciate the wins, and close properly. Review! 🎯`,
  `Week done! What went well, what didn't, what's next — 5 mins makes next week legendary 💜`,
  `Sunday = clean slate time. Weekly review nahi kiya toh same mistakes repeat honge. 5 min! 🔄`,
];

// ── 26. Inactivity Nudge ──────────────────────────────────────────────────────

export const INACTIVITY_POOLS = (days: number) => [
  `${days} days and no tasks, habits, or gym. Sara has been waiting. Come back, even 5 mins! 💜`,
  `${days} days MIA! Tasks, habits, goals have been waiting patiently. Come show them some love! 😢`,
  `${days} days of silence bestie. It's not too late! Log ONE thing and restart the momentum!`,
  `${days} days since last log. No judgment — just a gentle nudge. We'll be here when you're ready 💜`,
  `${days} days since last activity! Future you sends one word: PLEASE. Come back to ZenTrack! 🆘`,
  `Hamari yaad nahi aati kya? 🥺💔 ${days} din se gayab ho yaar! ZenTrack sunsaan ho gaya hai.`,
];
