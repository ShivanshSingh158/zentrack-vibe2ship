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
