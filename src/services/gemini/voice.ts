import { callWithFallback, parseAIJson, SAFETY_SETTINGS } from './core';
import { getLocalDateString } from '../../utils/dateUtils';

export const parseVoiceToKanban = async (text: string) => {
  if (!text.trim()) {
    throw new Error('No voice input detected.');
  }

  const prompt = `You are an AI assistant parsing voice commands into Kanban tasks.
Your job is to extract actionable items from the user's spoken sentence and format them into a structured task.

Current Date and Time for context: ${new Date().toLocaleString()}

Voice Command:
"${text}"

RULES:
1. Extract the main task "text" concisely (e.g., "Finish Physics lab report").
2. Determine a realistic "date" (YYYY-MM-DD format) based on any spoken deadlines (e.g., "by Thursday"). If no date is implied, use today's date: ${getLocalDateString(new Date())}.
3. Guess the "priority" ("high", "medium", or "low"). Defaults to "medium", but "high" if words like "urgent" or "ASAP" or a close deadline are used.
4. Guess the "subject" or category (e.g., "Physics", "Groceries", "Work"). If none is obvious, leave it empty.

Return ONLY raw JSON (no markdown, no preamble):
{
  "text": "Cleaned up task title",
  "date": "YYYY-MM-DD",
  "priority": "medium",
  "subject": "Category if any, otherwise empty string"
}`;

  return callWithFallback(async (genAI, modelName) => {
    // Flash models are extremely fast and good enough for this simple extraction
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    const safeP = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};

    return {
      text: typeof safeP.text === 'string' ? safeP.text : text,
      date: typeof safeP.date === 'string' ? safeP.date : getLocalDateString(new Date()),
      priority: ['high', 'medium', 'low'].includes(safeP.priority) ? safeP.priority : 'medium',
      subject: typeof safeP.subject === 'string' ? safeP.subject : '',
    };
  });
};

export const parseUniversalVoiceCommand = async (text: string, contextString?: string) => {
  if (!text.trim()) {
    throw new Error('No voice input detected.');
  }

  const prompt = `You are a universal AI voice command parser for a productivity app with multiple modules.
Your job is to route the user's spoken sentence to the correct module and extract the necessary data.

Current Date: ${getLocalDateString(new Date())}
Current Time: ${new Date().toLocaleTimeString()}
${contextString ? `\nUSER CONTEXT (Tasks/Events etc):\n${contextString}\n` : ''}
Voice Command:
"${text}"

MODULES AND RULES:

1. "todo" (Tasks, Homework, Reminders)
   - Actions: "add" or "complete"
   - Example (add): "Remind me to finish the physics lab by Thursday for 45 mins" -> payload: { text: "Finish physics lab", date: "2026-06-12", priority: "high", estimatedMinutes: 45, isRecurring: "once" }
   - Example (add): "do today till lecture 32 for 55 minute and do daily" -> payload: { text: "do today till lecture 32", estimatedMinutes: 55, isRecurring: "daily" }
   - Example (add): "do dsa till lecture 28 from 7 pm to 9 pm" -> payload: { text: "do dsa till lecture 28", estimatedMinutes: 120, timeSlot: "19:00" }
   - Example (complete): "Mark physics assignment as done" -> payload: { keyword: "physics assignment" }
   - IMPORTANT: If user mentions a specific time range like "from 7 pm to 9 pm" or "at 5 pm for 2 hours", CALCULATE the exact total minutes between the times and set that as estimatedMinutes. ALSO extract the starting time as timeSlot in "HH:MM" 24-hour format (e.g., "19:00"). If no time range is given but they say "for X mins", extract that.

2. "gym" (Workouts, Exercises)
   - Actions: "add"
   - Example: "I just benched 225 for 5 reps" -> payload: { exercise: "Bench Press", weight: 225, reps: 5, rpe: 8 }
   - Always guess RPE (Rate of Perceived Exertion, 1-10) if not mentioned, default to 8. Weight should be a number.

3. "attendance" (Classes, Lectures, University)
   - Actions: "log_attendance", "create_subject", or "update_schedule"
   - Example (log_attendance): "Mark me absent for Chemistry lab today" -> payload: { subject: "Chemistry", status: "absent", date: "2026-06-10", type: "lab", isExtra: false }
   - Example (create_subject): "Add new subject Electrical Drive with classes from Monday to Friday" -> payload: { subject: "Electrical Drive", scheduleDays: [{ dayText: "Monday to Friday", classCount: 1, labCount: 0 }] }
   - Example (update_schedule): "Add a lab to Electrical Drive on Wednesday" -> payload: { subject: "Electrical Drive", scheduleDays: [{ dayText: "Wednesday", classCount: 0, labCount: 1 }] }
   - CRITICAL: ONLY use "create_subject" if the user explicitly says "add new subject" or "create new subject". Otherwise, if they are adding classes to a schedule, use "update_schedule".
   - CRITICAL: dayText should be the EXACT raw words the user spoke regarding the days (e.g., "Monday to Wednesday", or "Monday and Thursday").
   - For 'log_attendance', Status must be exactly "present", "absent", or "cancelled".
   - Type must be exactly "class" or "lab". Default to "class".
   - isExtra is a boolean. Default to false.

4. "tools" (Job Applications, Learning Topics, Mock Interviews)
   - Actions: "add"
   - Example: "I applied to Google for Frontend Developer" -> payload: { type: "job", company: "Google", role: "Frontend Developer", status: "Applied" }
   - Example: "I want to learn about React hooks" -> payload: { type: "learning", topic: "React hooks" }

5. "sleep" (Sleep Tracking)
   - Actions: "log"
   - Example: "I woke up at 6:20 am and sleep at 11:30 pm" -> payload: { wakeUpTime: "06:20", sleepTime: "23:30" }
   - Always convert times to 24-hour format (HH:MM).

6. "extraworks" (Brain Dump, Scratchpad, Extra Works)
   - Actions: "add"
   - Example: "Add buy groceries to extra works" -> payload: { text: "Buy groceries" }
   - Example: "Brain dump I need to call mom tomorrow" -> payload: { text: "I need to call mom tomorrow" }
   - Simply extract the raw sentence/thought into the 'text' payload string.

7. "chat" (Conversations, Questions, Summaries)
   - Actions: "speak"
   - Example: "What do I have to do today?" -> payload: { response: "You have 3 tasks today. I recommend starting with the physics lab." }
   - IMPORTANT: If the user asks a question, wants a summary, or is just chatting (not adding/logging anything), generate a short, friendly, helpful spoken response to their query based on the USER CONTEXT provided above. Put the answer in the "response" field. Do NOT use markdown.

CRITICAL INSTRUCTIONS:
- You are a data router. DO NOT output conversational text, greetings, or explanations anywhere outside the JSON payload.
- Do NOT explain your choices.
- You must fix common voice transcription errors by sounding them out phonetically. Examples:
  * "lock" -> "log"
  * "wrap" / "rap" / "laps" / "lefts" -> "reps"
  * "said" / "sit" / "sad" -> "set"
  * "marble" / "bar well" -> "barbell"
  * "bunch" -> "bench"
  * "spot" -> "squat"
  * "dad lift" -> "deadlift"
  * "wait" / "way" -> "weight"
  * "thread mill" / "red mill" -> "Treadmill"
  * "easy bar" -> "EZ-Bar"
  * "creature" / "feature" -> "Preacher"
  * "hot squats" -> "Hack Squats"
  * "leg girls" -> "Leg Curls"
  * "cough raises" / "half raises" -> "Calf Raises"
  * "branches" -> "Crunches"
  * "paul of press" / "olive press" -> "Pallof Press"
  * "rest curls" -> "Wrist Curls"
  * "pack deck" / "tech deck" -> "Pec Deck"
  * "a bright rose" -> "Upright Rows"
  * "goblin squats" -> "Goblet Squats"
  * "barbarian" -> "Bulgarian"
- If the command is completely unintelligible but sounds like a gym command, guess the closest matching exercise from this user's typical routine: Treadmill, Deadlifts, Squats, Hack Squats, Leg Press, Leg Curls, Calf Raises, Crunches, Pallof Press, Wrist Curls, Pronation/Supination, Bench Press, Lat Pulldowns, T-Bar, Crossovers, Face Pulls, Back Extensions, Overhead Press, Lateral Raises, Shrugs, Pushdowns, EZ-Bar Curls, Preacher Curls, Hammer Curls, Pull-Ups, Rows, Flys, Woodchoppers.
- Return ONLY a valid JSON object. Do NOT include comments (//) inside the JSON.
- Output ONLY the literal values, do NOT output schema types.
- Be concise. Keep strings as short as possible.
- CRITICAL: NEVER use double quotes (") inside any string values. If you must quote something, use single quotes ('). Unescaped double quotes will crash the system.
- CRITICAL: For NUMBER fields (weight, reps, distanceKm, speedKmh, durationMinutes), output ONLY the raw number (e.g. 15 or 5.8). DO NOT append units like "kg", "km", "km/h", or "reps" to the number, as it will invalidate the JSON.
- CRITICAL: Do NOT map time or minutes to 'weight' or 'reps'. Always map time/minutes exclusively to 'durationMinutes'.

EXAMPLE OUTPUT 1 (Lifting):
{
  "module": "gym",
  "action": "add",
  "payload": {
    "exercise": "Standard Barbell Deadlift",
    "weight": 55,
    "reps": 15
  }
}

EXAMPLE OUTPUT 2 (Cardio):
{
  "module": "gym",
  "action": "add",
  "payload": {
    "exercise": "Treadmill",
    "distanceKm": 15,
    "speedKmh": 5.8,
    "durationMinutes": 45
  }
}
`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({ 
      model: modelName, 
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 2000
      },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    
    if (!parsed.module || !parsed.action || !parsed.payload) {
      throw new Error("AI returned an invalid routing payload.");
    }
    return parsed;
  });
};
