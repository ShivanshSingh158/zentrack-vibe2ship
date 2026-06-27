import { callWithFallback, parseAIJson, SAFETY_SETTINGS } from './core';
import { getLocalDateString } from '../../utils/dateUtils';

// ── AI Features ───────────────────────────────────────────────────────────────

export const generateAnalyticsInsights = async (userData: any) => {
  // Trim data to avoid token overflow — summarise arrays instead of dumping raw JSON
  const safe = {
    summary: userData.summary,
    recentTasks: (userData.tasks || []).slice(0, 20).map((t: any) => ({ title: t.text, done: t.status === 'completed', date: t.date, priority: t.priority })),
    recentLogs: (userData.logs || []).slice(0, 14).map((l: any) => ({ date: l.date, mood: l.mood, hours: l.productiveHours, water: l.waterIntakeLiters, notes: l.notes })),
    habits: {
      totalCheckins: (userData.habits || []).length,
      activeDays: new Set((userData.habits || []).map((h: any) => h.date)).size,
      rawSample: (userData.habits || []).slice(0, 20),
    },
    goals: (userData.goals || []).map((g: any) => ({ title: g.title, status: g.status, progress: g.progress, deadline: g.deadline })),
    jobs: (userData.jobs || []).map((j: any) => ({ company: j.company, role: j.role, status: j.status, appliedDate: j.appliedDate })),
    gym: userData.gym || null,
  };

  const prompt = `You are Zen AI — a world-class behavioural data analyst, productivity psychologist, and life coach embedded inside ZenTrack.

Your job is to find NON-OBVIOUS patterns, correlations, and trends across the user's real tracked data from the last 30 days.
You have access to: tasks, daily mood/hours/water logs, habit streaks, goals progress, job applications, and gym/fitness data.

ANALYSIS FRAMEWORK — apply all of these:
1. CORRELATION DETECTION: Find links between variables (e.g. "on days you log ≥7h productive, mood averages 8.2 vs 5.1 on low days")
2. PATTERN RECOGNITION: Identify recurring cycles, best/worst days, streaks, drops
3. BEHAVIOUR GAPS: What's being neglected? What habits are slipping? What goals haven't moved?
4. MOMENTUM SIGNALS: What is trending up? What is declining? Give week-over-week direction.
5. GYM & WELLNESS INTEGRATION: If gym data exists, connect it to mood/productivity patterns
6. JOB ORACLE FUNNEL: If job data exists, analyze pipeline health and application velocity

RULES:
- Every insight MUST cite actual numbers from the data (dates, counts, averages, percentages)
- Do NOT give generic advice like "drink more water" — say "your water dropped from 2.8L (week 1) to 1.4L (week 4), correlating with a 1.9-point mood dip"
- Recommendations must be specific tasks the user can do TODAY or THIS WEEK
- Prioritize insights by impact — lead with the most significant pattern
- Be honest about negative trends, not just positive ones

User Data (30 days):
${JSON.stringify(safe, null, 2)}

Return ONLY a raw JSON object (no markdown, no explanation, no preamble):
{
  "insights": [
    "Specific data-driven pattern with actual numbers cited (e.g. week-over-week change)",
    "Cross-variable correlation found in the data",
    "Trend or momentum signal with direction",
    "Behavioural gap or slippage spotted"
  ],
  "recommendations": [
    {
      "title": "Short actionable task title",
      "description": "Why this matters RIGHT NOW based on specific numbers in their data",
      "estimatedMinutes": 25,
      "priority": "high"
    }
  ]
}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

// Daily workspace intelligence

export const generateMorningBriefing = async (userData: any) => {
  const safeData = {
    tasks: (userData.tasks || []).map((t: any) => t.text).slice(0, 10),
    assignments: (userData.assignments || []).map((a: any) => a.title).slice(0, 5),
    jobs: (userData.jobs || []).map((j: any) => j.company).slice(0, 5),
    habits: (userData.habits || []).map((h: any) => h.name).slice(0, 5),
    goals: (userData.goals || []).map((g: any) => g.title).slice(0, 3),
    isGymDay: userData.isGymDay || false
  };

  const prompt = `You are Zen AI, a high-performance productivity coach. 
Generate a short, punchy, highly motivating Morning Briefing for the user.

Rules:
1. Speak directly to the user (e.g. "Good morning!").
2. Reference their actual data across tasks, assignments, goals, and gym schedule. (e.g. if isGymDay is true, mention getting to the gym).
3. Keep it under 3 sentences. No fluff. Extremely crisp and energizing.
4. Return raw JSON ONLY in this format:
{
  "greeting": "Good morning!",
  "message": "You have 3 tasks and an assignment due today. It's also a training day—let's crush it.",
  "quote": "Win the morning, win the day."
}

User Data:
${JSON.stringify(safeData, null, 2)}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const generateEveningWindDown = async (userData: any) => {
  const safeData = {
    completedTasks: (userData.completedTasks || []).map((t: any) => t.text).slice(0, 10),
    completedHabits: userData.completedHabitsCount || 0,
    totalHabits: userData.totalHabitsCount || 0,
    gymLogged: userData.gymLogged || false
  };

  const prompt = `You are Zen AI, a calm and supportive life coach.
Generate a short, relaxing Evening Wind-Down message for the user.

Rules:
1. Speak directly to the user in a calm tone.
2. Acknowledge what they completed today (tasks, habits, and if gymLogged is true, acknowledge their workout).
3. If they missed habits, gently remind them to log them if they forgot.
4. Keep it under 3 sentences.
5. Return raw JSON ONLY in this format:
{
  "greeting": "Good evening.",
  "message": "You knocked out 5 tasks today and crushed your workout. Take a deep breath and disconnect.",
  "quote": "Rest is not idleness, it is necessary to recharge."
}

User Data:
${JSON.stringify(safeData, null, 2)}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const generateNextActionRecommendation = async (userData: any) => {
  const safeData = {
    tasks: (userData.tasks || []).map((t: any) => ({ title: t.text, priority: t.priority, isOverdue: t.isOverdue })),
    assignments: (userData.assignments || []).map((a: any) => ({ title: a.title, isOverdue: a.isOverdue, dueSoon: a.dueSoon })),
    habitsPending: userData.habitsPending || 0,
    isGymDay: userData.isGymDay || false,
    gymLogged: userData.gymLogged || false
  };

  const prompt = `You are Zen AI. The user has 45 minutes of free time and is asking: "What should I do right now?"
Analyze their pending tasks, assignments, habits, and gym schedule.
Pick the single highest-impact thing they should do right now and provide a 1-sentence reasoning.
Prioritize: Overdue assignments > Overdue tasks > High priority tasks > Gym (if it's a gym day and not logged) > Habits > Medium tasks.

Return raw JSON ONLY in this format:
{
  "action": "Complete the Physics Assignment",
  "reasoning": "It's due soon and holds the highest priority right now."
}

User Data:
${JSON.stringify(safeData, null, 2)}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const analyzeNoteWithAI = async (noteContent: string, action: 'summarize' | 'concepts' | 'flashcards' | 'question', customQuestion?: string) => {
  let prompt = '';
  if (action === 'summarize') {
    prompt = `You are Zen AI, a learning assistant. Summarize the following note into a concise paragraph followed by 3 key bullet points.\n\nNote Content:\n${noteContent}`;
  } else if (action === 'concepts') {
    prompt = `You are Zen AI. Extract the core concepts, definitions, and important formulas/facts from the following note. Present them as a clean Markdown list.\n\nNote Content:\n${noteContent}`;
  } else if (action === 'flashcards') {
    prompt = `You are Zen AI. Generate 5-7 high-yield flashcards (Question & Answer format) based on the following note. Format them as bold Q: and A: pairs.\n\nNote Content:\n${noteContent}`;
  } else if (action === 'question') {
    prompt = `You are Zen AI. Answer the user's question directly based ONLY on the following note. If the answer isn't in the note, say so.\n\nQuestion: ${customQuestion}\n\nNote Content:\n${noteContent}`;
  }

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.5, maxOutputTokens: 1000 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
};

// ── Autonomous Task Planning & Scheduling ──────────────────────────────────────

export const autoScheduleDay = async (tasks: any[], existingEvents: any[], peakEnergyTime: string = 'morning') => {
  const safeTodos = tasks.map(t => ({ id: t.id, title: t.text, priority: t.priority, energyRequirement: t.energyRequirement || 'medium' }));
  const safeEvents = existingEvents.map(e => ({ title: e.title, date: e.date, type: e.type }));

  const prompt = `You are Zen AI, an autonomous scheduling agent.
The user wants to auto-schedule their uncompleted tasks for today and tomorrow.
I am providing you a list of their tasks and their existing calendar events.

CRITICAL: The user's peak energy time is ${peakEnergyTime}. 
You must schedule 'high' energy tasks during their peak energy time.
Schedule 'low' energy tasks (mechanical/easy) during their off-peak hours.

Rules:
1. Prioritize 'high' priority tasks for today.
2. If today is too packed, push medium/low tasks to tomorrow.
3. Respect energy requirements vs peak energy time.
4. Return raw JSON ONLY in this format:
{
  "scheduledTasks": [
    { "id": "task_id_here", "date": "YYYY-MM-DD", "time": "HH:MM", "reasoning": "High priority, scheduled for afternoon." }
  ]
}

Today's Date: ${getLocalDateString(new Date())}
Tasks: ${JSON.stringify(safeTodos)}
Existing Events: ${JSON.stringify(safeEvents)}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const autoBreakdownGoal = async (goalTitle: string, goalDescription: string) => {
  const prompt = `You are Zen AI, an autonomous project manager.
The user has a massive goal. Break it down into highly actionable, step-by-step sub-tasks.
Each task should take no more than a few hours. 
Assign a suggested delay in days from today for when it should be completed.

Goal Title: ${goalTitle}
Goal Description: ${goalDescription}

Rules:
1. Return realistic tasks.
2. 'daysFromNow' should be an integer (0 = today, 1 = tomorrow).
3. Return raw JSON ONLY in this format:
{
  "subtasks": [
    { "text": "Set up project repository", "priority": "high", "daysFromNow": 0 },
    { "text": "Design database schema", "priority": "medium", "daysFromNow": 1 }
  ]
}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const generateRecoveryPlan = async (task: any) => {
  const prompt = `You are Zen AI, an emergency "Life Saver" recovery planner.
The user has a task that is either extremely overdue or due within the hour. They are panicking.
Task: "${task.text}"
Estimated Minutes: ${task.estimatedMinutes || 30}

Generate a hyper-actionable, minute-by-minute recovery plan. Break the task down into 3-5 tiny micro-steps.
The total time must be slightly less than or equal to the estimated minutes.
Be extremely encouraging but firm. Tell them "You can make it. Start the Pomodoro now."

Return raw JSON ONLY in this format:
{
  "message": "Your DB assignment is due in 47 minutes. Here's your triage plan:",
  "steps": [
    { "text": "Write header + intro", "minutes": 8 },
    { "text": "Complete section 1", "minutes": 15 }
  ],
  "totalMinutes": 42
}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0.2 }, safetySettings: SAFETY_SETTINGS });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};

export const generateExtensionEmail = async (task: any, recipient: string) => {
  const prompt = `You are Zen AI, an assistant helping the user draft an emergency extension request.
Task: "${task.text}"
Recipient: "${recipient}"
Overdue by / Due Date: ${task.date}

Write a professional, apologetic, but firm email requesting a brief extension (e.g., 24-48 hours). 
Leave placeholders like [Reason] or [X]% for the user to fill in.
Do not include a subject line inside the body, just the body text.

Return raw JSON ONLY:
{
  "subject": "Request for Extension — [Assignment Name]",
  "body": "Dear [Recipient], ..."
}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0.4 }, safetySettings: SAFETY_SETTINGS });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};
