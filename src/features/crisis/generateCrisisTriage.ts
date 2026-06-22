import { callWithFallback, parseAIJson } from '../../services/gemini';

export const generateCrisisTriage = async (userData: any) => {
  // Minimize payload
  const safeData = {
    tasks: (userData.todos || []).filter((t: any) => !t.isCompleted).map((t: any) => ({ text: t.text, priority: t.priority, date: t.date })),
    goals: (userData.goals || []).map((g: any) => ({ title: g.title, deadline: g.deadline })),
    habits: (userData.habits || []).slice(0, 5)
  };

  const prompt = `You are Zen AI — a brutal, clear-thinking Crisis Triage assistant.
The user is completely overwhelmed. They have too much to do.
Look at their incomplete tasks, habits, and goals.
Identify the ONE most important, highest-leverage task they must do today to stop the bleeding.
Break it down into 3 tiny, frictionless steps (e.g. "Open the document").
Identify 3 things they MUST drop, postpone, or ignore today. Be brutal.

User Data:
${JSON.stringify(safeData, null, 2)}

Return ONLY raw JSON in this format:
{
  "focusTask": "Name of the ONE thing",
  "why": "Brief explanation of why this matters most to survive today",
  "tinySteps": ["micro step 1", "micro step 2", "micro step 3"],
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
