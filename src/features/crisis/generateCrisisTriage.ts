import { callWithFallback, parseAIJson } from '../../services/gemini';

export const generateCrisisTriage = async (userData: any) => {
  // Minimize payload
  const safeData = {
    tasks: (userData.todos || []).filter((t: any) => !t.isCompleted).map((t: any) => ({ text: t.text, priority: t.priority, date: t.date })),
    goals: (userData.goals || []).map((g: any) => ({ title: g.title, deadline: g.deadline })),
    habits: (userData.habits || []).slice(0, 5)
  };

  const prompt = `You are Zen AI — a brutal, clear-thinking Crisis Triage assistant.
The user is completely overwhelmed and in a panic state. They have too much to do.
Look at their incomplete tasks, habits, and goals.

Generate a "Priority War Room" plan.
1. Identify the top 5 most important things that matter in the next 6 hours.
2. Select the absolute most urgent 3 tasks from those 5.
3. Identify 3 things they MUST drop, postpone, or ignore today. Be brutal.

User Data:
${JSON.stringify(safeData, null, 2)}

Return ONLY raw JSON in this format:
{
  "message": "Here are the 5 things that will matter most in the next 6 hours. Ignore everything else. I've planned a calendar block for the most urgent 3. The rest can wait or be dropped. Here's your exact order of execution.",
  "top5": ["task 1", "task 2", "task 3", "task 4", "task 5"],
  "blockCalendarTop3": [
    { "task": "task 1", "durationMinutes": 60 },
    { "task": "task 2", "durationMinutes": 45 },
    { "task": "task 3", "durationMinutes": 30 }
  ],
  "dropToday": ["thing to ignore 1", "thing to ignore 2", "thing to ignore 3"]
}`;

  return callWithFallback(async (genAI, modelName) => {
    // We import SAFETY_SETTINGS in gemini.ts, but here we can just pass basic config
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
    });
    const result = await model.generateContent(prompt);
    return parseAIJson(result.response.text());
  });
};
