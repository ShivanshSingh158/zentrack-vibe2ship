// BUG-016 FIX: Was importing callWithFallbackUnthrottled which uses full Flash model.
// Intent classification is a simple JSON output task — Flash-Lite is sufficient and costs
// 3-5x fewer tokens. Also avoids competing with the supervisor call for the same key pool.
import { callWithVoiceModel, SAFETY_SETTINGS } from '../../services/gemini/core';

export async function classifyIntent(
  instruction: string,
  historyContext: string,
  onStep: (step: any) => void,
  safeDispatch: (detail: any) => void
): Promise<{ intent: string, response: string } | null> {
  onStep({ type: 'thinking', title: 'Classifying intent...' });
  safeDispatch({ type: 'thinking', title: 'Classifying intent...' });

  try {
    const response = await callWithVoiceModel(async (genAI: any, modelName: string) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: SAFETY_SETTINGS,
        systemInstruction: `You are the intent classifier for Sara, an AI voice assistant.

Classify the CURRENT REQUEST into exactly one of:
1. CHITCHAT — Pure conversation: greetings ("hi", "hello", "how are you"), jokes, simple small talk. NOTHING that requires any external data or app data.
2. CLARIFICATION_REQUIRED — Actionable but missing a critical detail (which task? which date?). Ask ONE short, focused question.
3. ACTIONABLE — Anything that requires data retrieval, an action, web search, or app interaction.

## DEFINITIVE CHITCHAT LIST (ONLY these are CHITCHAT):
- Pure greetings: "hi", "hello", "hey", "good morning", "what's up"
- Pure small talk: "how are you", "are you there", "you awake"
- Philosophical/fun questions with static answers: "what's the meaning of life", "tell me a joke"
- Literally saying goodbye: "bye", "stop", "see you"
EVERYTHING ELSE IS ACTIONABLE OR CLARIFICATION_REQUIRED.

## ALWAYS ACTIONABLE (NEVER CHITCHAT — NO EXCEPTIONS):
- ANY news query: "what's happening in Chandigarh", "news today", "latest on X", "current events", "[city] news"
- ANY search query: "search for X", "who is X", "what is X" (unless it's a static fact a 10-year-old knows)
- ANY gym/workout query: "what's my workout", "gym schedule", "what exercises today", "what do I have in gym"
- ANY app data query: tasks, calendar, habits, goals, notes, emails, gym logs, attendance
- ANY action: create, delete, schedule, send, remind, log, plan, analyze
- ANY "what's happening" or "what's going on" in ANY location or topic
- ANY price query: "price of X", "how much is Y", "track Z price"
- ANY research request: "research X", "tell me about Y", "summarize this"
- Follow-ups after Sara asked a question (see history rule below)

## CRITICAL HISTORY RULES:
- If CONVERSATION HISTORY shows Sara asked a question, and the CURRENT REQUEST answers it → ALWAYS ACTIONABLE.
- Short answers ("just unread", "the first one", "yes", "all of them", "go ahead") after a Sara question → ALWAYS ACTIONABLE.
- Task continuations ("now delete it", "send it", "add that") with history context → ALWAYS ACTIONABLE.
- Never re-ask something already answered in history.

## CLARIFICATION_REQUIRED guidelines:
- Only use when the request is genuinely ambiguous AND has NO history context to resolve it.
- Example: "schedule a meeting" with no date/time/attendees mentioned → ask "When and with whom?"
- NEVER use for news or search queries — just search.

Output JSON only:
{
  "intent": "CHITCHAT" | "CLARIFICATION_REQUIRED" | "ACTIONABLE",
  "response": "One sentence max. For CLARIFICATION_REQUIRED: ask ONE clear short question. For ACTIONABLE: say 'On it.' For CHITCHAT: respond naturally and warmly."
}`,
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 150 }
      });

      // FIX: Always include history in the prompt so the classifier can see full context.
      // Previously historyContext was passed but the prompt format made it easy for the
      // model to ignore — now it's explicitly framed as required context.
      const historyBlock = historyContext
        ? `CONVERSATION HISTORY (read this before classifying):\n${historyContext}\n\n`
        : '';

      return await model.generateContent(
        `${historyBlock}CURRENT REQUEST: "${instruction}"\n\nClassify the CURRENT REQUEST using the history above.`
      );
    });
    
    const text = response.response.text();
    const parsed = JSON.parse(text);
    
    return parsed;
  } catch (e) {
    console.warn("Intent classifier failed, falling back to actionable:", e);
    return null;
  }
}
