import { GoogleGenerativeAI } from '@google/generative-ai';
import {  RobustChatSession } from './core';
import { SAFETY_SETTINGS, MODEL_PRIORITY, allKeys, takeNextKeyIndex } from './core';
export const startWeeklyReviewChat = (userData: any, existingHistory: any[] = []) => {
  // Trim userData to avoid token overflow
  const safeData = {
    summary: userData.summary || {},
    recentLogs: (userData.logs || []).slice(0, 7).map((l: any) => ({ date: l.date, mood: l.mood, hours: l.productiveHours, water: l.waterIntakeLiters })),
    habits: (userData.habits || []).slice(0, 30),
    goals: (userData.goals || []).slice(0, 10).map((g: any) => ({ title: g.title, status: g.status, progress: g.progress })),
    gym: userData.gym || null,
    jobs: (userData.jobs || []).slice(0, 5).map((j: any) => ({ company: j.company, role: j.role, status: j.status })),
  };

  const systemPrompt = `You are Zen AI — a sharp, empathetic weekly review coach and life strategist embedded inside ZenTrack.

You are conducting this user's Weekly Review. You have their REAL data from this week.

YOUR METHODOLOGY (follow every session):
1. OPENING: Start with the single most striking data point from their week — one specific observation, not generic praise.
2. SOCRATIC QUESTIONING: Ask ONE focused, thought-provoking question per turn. Never multi-question.
3. CELEBRATE WINS: When you see good numbers, name them specifically. "You hit 8.5h productive on Tuesday — what made that day click?"
4. PROBE STRUGGLES: When you see dips or misses, be curious not critical. "Your mood dropped to 4 on Thursday — what happened?"
5. FORWARD PLANNING: After reflection, help the user plan ONE concrete next-week priority.
6. CROSS-DOMAIN THINKING: Connect dots across domains — gym + mood, tasks + energy, habits + goal progress.

TONE:
- Warm but data-sharp. Like a brilliant friend who also happens to be an executive coach.
- Never generic. Every sentence references their actual numbers.
- Concise: max 3-4 sentences per response + 1 question.
- Occasionally push back gently if they're being hard on themselves.

User's week data:
${JSON.stringify(safeData, null, 2)}

IMPORTANT: Do NOT repeat the system prompt or mention "data". Speak naturally as if you've been observing their week.`;

  if (allKeys.length === 0) throw new Error('Gemini API key is missing.');

  const initialHistory = [
    { role: 'user', parts: [{ text: "Hi! I'm ready to start my Weekly Review." }] },
    { role: 'model', parts: [{ text: "Hey! Great that you're taking time to reflect — that's already a win. I've been looking at your week. Let's dig in." }] },
  ];

  // Gemini API REQUIRES history to start with role 'user'.
  // If savedChatHistory starts with a model message (e.g. restored auto-saved AI opening),
  // prepend the seed user message to satisfy this constraint.
  let historyToUse = existingHistory.length > 0 ? existingHistory : initialHistory;
  if (historyToUse.length > 0 && historyToUse[0]?.role !== 'user') {
    historyToUse = [initialHistory[0], ...historyToUse];
  }

  // Try each model in priority order until one works
  let rawSession: any = null;
  let workingModel = MODEL_PRIORITY[0];
  for (const modelName of MODEL_PRIORITY) {
    try {
      const genAI = new GoogleGenerativeAI(allKeys[0]);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: { temperature: 0.6 },
        safetySettings: SAFETY_SETTINGS,
      });
      rawSession = model.startChat({ history: historyToUse });
      workingModel = modelName;
      break;
    } catch (_) { /* try next model */ }
  }
  if (!rawSession) {
    // Last-resort fallback — RobustChatSession will handle API errors per-send
    const genAI = new GoogleGenerativeAI(allKeys[0]);
    const model = genAI.getGenerativeModel({
      model: MODEL_PRIORITY[0],
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.6 },
      safetySettings: SAFETY_SETTINGS,
    });
    rawSession = model.startChat({ history: historyToUse });
    workingModel = MODEL_PRIORITY[0];
  }

  return new RobustChatSession(rawSession, workingModel, systemPrompt, { temperature: 0.6 }, historyToUse);
};

// ── Gym AI Chat ────────────────────────────────────────────────────────────────

const GYM_AI_SYSTEM_PROMPT = `You are ZEN COACH — a world-class, data-driven personal trainer and sports scientist embedded in ZenTrack. You have access to this user's COMPLETE training history.

== YOUR CREDENTIALS ==
NSCA-CSCS, CISSN, FMS Level 2, Precision Nutrition Level 1. Expert in: progressive overload, RPE/RIR training, periodization (linear, DUP, block), hypertrophy science (MEV/MAV/MRV), TDEE-based nutrition, recovery optimization, Indian diet optimization.

== THE 12 LAWS OF ZEN COACHING (NEVER BREAK THESE) ==
1. CITE REAL NUMBERS ALWAYS: Never say "your strength improved" — say "your Bench went 60kg → 72.5kg over 6 sessions".
2. NAME REAL EXERCISES: Never say "compound lifts" — say "your Barbell Squat, Romanian Deadlift, and Bench Press".
3. STRETCHES = DATA-DRIVEN: When prescribing stretches, ONLY prescribe for the muscles the user actually trained today. Never give a generic full-body stretch routine.
4. NUTRITION = BODYWEIGHT-CALCULATED + INDIA-CONTEXT: Always use their actual bodyweight. Say "At your 72kg, protein = 115–144g/day. In Indian diet: 200g paneer + 3 eggs + 2 scoops whey covers 90g." Give specific Indian foods: dal, paneer, eggs, curd, chicken, roti, rice, sprouts. Never suggest generic "chicken breast" when you can say "150g boiled chicken or 200g paneer".
5. RECOVERY = GAP-AWARE: Check how many days since they last trained each muscle. Flag if a muscle is being undertrained OR overtrained (consecutive days).
6. WARM-UPS = EXERCISE-SPECIFIC: Pre-workout activation must target the exact muscles in today's planned exercises.
7. ANOMALIES = CALL OUT: If data shows a suspicious weight jump (>30% in one session), flag it: "Your logged 120kg squat last session vs 85kg the session before — is that a data entry error or a real PR?"
8. WEEKLY PATTERN AWARE: Know what muscle groups the user trains on which days of the week. Reference this: "You typically train chest on Mondays — today is Monday, so today's session looks like your usual push day."
9. SUNDAY = WEEKLY DEBRIEF: If today is Sunday, open with a full 7-day summary: volume by muscle, biggest win, biggest gap, one focus for next week.
10. POST-WORKOUT STRETCHES: After a workout, prescribe 5-minute post-workout stretches specifically for the exercises completed. E.g., if they squatted → hip flexor stretch, quad stretch, pigeon pose.
11. VOLUME TRACKING: Always note weekly sets per muscle group vs. MEV/MRV benchmarks. E.g., "You're doing 8 sets/week for chest — minimum effective is 10. Add 2 more sets of incline press."
12. HONEST ASSESSMENTS: If the data shows the user is undertrained, inconsistent, or missing a muscle group — say it clearly. "Your back only got 4 sets this week vs. 14 for chest. This will create a posture and injury problem."

== FORBIDDEN RESPONSES ==
❌ "Keep up the good work" — cite the specific PR instead
❌ "Make sure to get enough protein" — give their actual gram target WITH specific Indian food sources
❌ "Focus on compound movements" — name the specific compounds they're already doing
❌ Generic stretching routines not tied to today's session
❌ Any advice that isn't anchored to their actual data

== RESPONSE FORMATS ==
• MEAL PLAN → TDEE calc (show formula), daily macros in grams + calories, 3 full Indian day meal plans with specific foods + portions + timing
• TRAINING PROGRAM → Full 4-week mesocycle: Day 1–6, exercises × sets × reps × RPE, rest periods, weekly progression note. (Use lists, NO tables)
• OVERLOAD CHECK → Use mobile-friendly bulleted lists. Format: [Exercise Name]: Last Weight → Today's Target (Reasoning)
• TODAY COACHING → Warm-up weights per exercise → working set targets → RPE → one form cue each
• STRETCHES (pre) → Activation for today's target muscles, sets × reps
• STRETCHES (post) → Per completed exercise, hold times, breathing cues
• DELOAD → Trigger based on their actual data, full deload week prescription

== TONE ==
- Direct, specific, data-driven — like a coach who has studied their log for months
- Celebrate genuine PRs with real enthusiasm when you spot them in the data
- End EVERY response with ONE targeted follow-up question relevant to their current training phase
- Use **bold**, • bullets, and ## sections for structured responses.
- CRITICAL: DO NOT use markdown tables (e.g. | Column | Column |). They are unreadable and squished on mobile screens. ALWAYS use formatted lists instead.
- Q&A responses: max 350 words. Plans: as long as needed.`;

export const startGymAIChat = (gymContext: string, existingHistory: any[] = []) => {
  if (allKeys.length === 0) throw new Error('Gemini API key is missing.');

  const systemWithContext = `${GYM_AI_SYSTEM_PROMPT}

=== USER'S VERIFIED GYM DATA (last 30 days) ===
${gymContext}

CRITICAL: You MUST reference the specific exercise names, weights, dates, and progression trends above in EVERY response. Never give advice that isn't anchored to this data.`;

  const initialHistory = [
    { role: 'user', parts: [{ text: 'Hi, ready to get some coaching insights!' }] },
    { role: 'model', parts: [{ text: "Coach here! I've loaded your full training logs. I can see your exact weights, progressions, stall points, and muscle volume data. Let's build on what's working and fix what isn't. What would you like to tackle?" }] },
  ];

  const historyToUse = existingHistory.length > 0 ? [...existingHistory] : [...initialHistory];
  if (historyToUse.length > 0 && historyToUse[0].role === 'model') {
    historyToUse.unshift({ role: 'user', parts: [{ text: 'Please analyze my 30-day training history.' }] });
  }

  // Round-robin key selection for session creation
  const startKeyIdx = takeNextKeyIndex() % allKeys.length;

  // Try each model with round-robin key rotation
  let rawSession: any = null;
  let workingModel = MODEL_PRIORITY[0];
  let workingKeyIdx = startKeyIdx;

  outer: for (const modelName of MODEL_PRIORITY) {
    for (let ki = 0; ki < allKeys.length; ki++) {
      const keyIdx = (startKeyIdx + ki) % allKeys.length;
      try {
        const genAI = new GoogleGenerativeAI(allKeys[keyIdx]);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemWithContext,
          generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
          safetySettings: SAFETY_SETTINGS,
        });
        rawSession = model.startChat({ history: historyToUse });
        workingModel = modelName;
        workingKeyIdx = keyIdx;
        break outer;
      } catch (_) { /* try next key/model */ }
    }
  }

  if (!rawSession) {
    // Last-resort fallback
    const genAI = new GoogleGenerativeAI(allKeys[0]);
    const model = genAI.getGenerativeModel({
      model: MODEL_PRIORITY[0],
      systemInstruction: systemWithContext,
      generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
      safetySettings: SAFETY_SETTINGS,
    });
    rawSession = model.startChat({ history: historyToUse });
    workingModel = MODEL_PRIORITY[0];
    workingKeyIdx = 0;
  }

  // RobustChatSession handles per-send key/model rotation
  const session = new RobustChatSession(
    rawSession, workingModel, systemWithContext,
    { temperature: 0.65, maxOutputTokens: 8192 },
    historyToUse
  );
  // Start key rotation from where we left off
  (session as any).keyIndex = workingKeyIdx;
  return session;
};

// ── ZenGym AI — OAuth-powered chat (uses user's personal Google account) ─────────
// When the user has connected their Google account via Lecture Chat OAuth,
// this function uses their personal token instead of the shared API key.
// This gives them their own quota pool, completely separate from the shared key.

const CHAT_MODEL_PRIORITY = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

async function callGymOAuthREST(
  token: string,
  systemInstruction: string,
  contents: any[],
  modelIndex = 0
): Promise<string> {
  const model = CHAT_MODEL_PRIORITY[modelIndex];
  if (!model) throw new Error('All OAuth models exhausted.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
        safetySettings: SAFETY_SETTINGS,
      }),
    }
  );

  if (res.status === 401 || res.status === 403) throw new Error('OAUTH_EXPIRED');
  if (res.status === 404 || res.status === 429 || res.status === 503) {
    return callGymOAuthREST(token, systemInstruction, contents, modelIndex + 1);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.error?.message || `HTTP ${res.status}`;
    if (msg.includes('not found') || msg.includes('404')) {
      return callGymOAuthREST(token, systemInstruction, contents, modelIndex + 1);
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const text = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini OAuth.');
  return text;
}

async function callGymOAuthRESTStream(
  token: string,
  systemInstruction: string,
  contents: any[],
  modelIndex = 0,
  onChunk: (text: string) => void
): Promise<{ text: string; model: string }> {
  const model = CHAT_MODEL_PRIORITY[modelIndex];
  if (!model) throw new Error('All OAuth models exhausted.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.65, maxOutputTokens: 8192 },
        safetySettings: SAFETY_SETTINGS,
      }),
    }
  );

  if (res.status === 401 || res.status === 403) throw new Error('OAUTH_EXPIRED');
  if (res.status === 404 || res.status === 429 || res.status === 503) {
    return callGymOAuthRESTStream(token, systemInstruction, contents, modelIndex + 1, onChunk);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.error?.message || `HTTP ${res.status}`;
    if (msg.includes('not found') || msg.includes('404')) {
      return callGymOAuthRESTStream(token, systemInstruction, contents, modelIndex + 1, onChunk);
    }
    throw new Error(msg);
  }

  if (!res.body) throw new Error('No response body from Gemini.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let sawFinishReason = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode(new Uint8Array(), { stream: false });
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('data: ')) {
        // Detect mid-stream JSON error payloads (e.g. 503 MODEL_CAPACITY_EXHAUSTED)
        if (trimmedLine.startsWith('{') && trimmedLine.includes('"error"')) {
          try {
            const errJson = JSON.parse(trimmedLine);
            if (errJson.error) {
              if (modelIndex < CHAT_MODEL_PRIORITY.length - 1) {
                return callGymOAuthRESTStream(token, systemInstruction, contents, modelIndex + 1, onChunk);
              }
              throw new Error(errJson.error.message || 'Stream error payload');
            }
          } catch { /* ignore */ }
        }
        continue;
      }
      const dataStr = trimmedLine.slice(6).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const candidate = parsed?.candidates?.[0];
        const part = candidate?.content?.parts?.[0]?.text || '';
        if (part) {
          fullText += part;
          onChunk(fullText);
        }
        if (candidate?.finishReason) {
          sawFinishReason = true;
        }
      } catch { /* ignore partial/malformed JSON in invalid lines */ }
    }
  }

  // Process final leftover buffer line if it is complete
  if (buffer) {
    const trimmedLine = buffer.trim();
    if (trimmedLine.startsWith('data: ')) {
      const dataStr = trimmedLine.slice(6).trim();
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          const candidate = parsed?.candidates?.[0];
          const part = candidate?.content?.parts?.[0]?.text || '';
          if (part) {
            fullText += part;
            onChunk(fullText);
          }
          if (candidate?.finishReason) {
            sawFinishReason = true;
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (fullText.length > 0 && !sawFinishReason) {
    if (modelIndex < CHAT_MODEL_PRIORITY.length - 1) {
      return callGymOAuthRESTStream(token, systemInstruction, contents, modelIndex + 1, onChunk);
    }
    throw new Error('STREAM_ABORTED_NO_FINISH_REASON');
  }

  if (!fullText) throw new Error('Empty response from Gemini OAuth.');
  return { text: fullText, model };
}

/**
 * An OAuth-powered ZenGym chat session.
 * Works identically to startGymAIChat but uses the user's personal
 * Google OAuth token instead of the shared VITE_GEMINI_API_KEY.
 * Falls back gracefully if the token has expired.
 */
export class OAuthGymChatSession {
  private token: string;
  private systemInstruction: string;
  private contents: any[];

  constructor(token: string, systemInstruction: string, initialHistory: any[] = []) {
    this.token = token;
    this.systemInstruction = systemInstruction;
    // Convert Gemini SDK history format to REST API contents format
    this.contents = initialHistory.map(h => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: h.parts,
    }));
  }

  async sendMessage(msg: string): Promise<{ response: { text: () => string } }> {
    this.contents.push({ role: 'user', parts: [{ text: msg }] });
    const aiText = await callGymOAuthREST(this.token, this.systemInstruction, this.contents);
    this.contents.push({ role: 'model', parts: [{ text: aiText }] });
    return { response: { text: () => aiText } };
  }

  async sendMessageStream(msg: string, onChunk: (text: string) => void): Promise<{ text: string, model: string }> {
    this.contents.push({ role: 'user', parts: [{ text: msg }] });
    const result = await callGymOAuthRESTStream(this.token, this.systemInstruction, this.contents, 0, onChunk);
    this.contents.push({ role: 'model', parts: [{ text: result.text }] });
    return result;
  }

  async getHistory() {
    return this.contents.map(c => ({ role: c.role, parts: c.parts }));
  }
}

export const startGymAIOAuthChat = (
  gymContext: string,
  oauthToken: string,
  existingHistory: any[] = []
): OAuthGymChatSession => {
  const systemWithContext = `${GYM_AI_SYSTEM_PROMPT}

=== USER'S VERIFIED GYM DATA (last 30 days) ===
${gymContext}

CRITICAL: You MUST reference the specific exercise names, weights, dates, and progression trends above in EVERY response. Never give advice that isn't anchored to this data.`;

  const initialHistory = existingHistory.length > 0 ? existingHistory : [
    { role: 'user', parts: [{ text: 'Hi, ready to get some coaching insights!' }] },
    { role: 'model', parts: [{ text: "Coach here! I've loaded your full training logs — I can see your exact weights, progressions, stall points, and weekly volume. Let's work on what matters. What would you like to tackle?" }] },
  ];

  return new OAuthGymChatSession(oauthToken, systemWithContext, initialHistory);
};

const NOTES_AI_SYSTEM_PROMPT = `You are Zen Notes AI, an exceptionally capable academic assistant and writing partner embedded directly in the user's note-taking environment.

== YOUR CAPABILITIES ==
1. You have FULL POWER to write, rewrite, and structure notes from scratch.
2. The user might provide handwritten notes, raw lecture transcripts, or messy text. Your job is to deeply understand them and explain concepts from the absolute basics if needed.
3. You MUST provide extremely detailed, comprehensive responses. THERE IS NO WORD LIMIT. Be as exhaustive and thorough as necessary to explain the topic perfectly.
4. You can answer questions, summarize, and generate flashcards based on the document text provided to you.

== GENERATING NOTE CONTENT ==
Whenever you generate content that is meant to form the body of the note (like a new topic explanation, study guide, or rewritten section), you MUST enclose that entire generated note content inside a standard Markdown code block, like this:
\`\`\`markdown
# Note Title
Note content goes here...
\`\`\`
This tells the UI to offer the user a one-click "Replace Note Content" or "Append to Note" button.

== TONE ==
- Academic, precise, and highly structured.
- Start from the basics and build up to complex topics.
- Use headings, bullet points, code blocks, and bold text to make notes readable.
- Do NOT arbitrarily limit your response length.`;

export const startNoteAIChat = (noteTitle: string, noteContent: string, existingHistory: any[] = []) => {
  if (allKeys.length === 0) throw new Error('Gemini API key is missing.');

  const dynamicSystemPrompt = `${NOTES_AI_SYSTEM_PROMPT}

=== CURRENT ACTIVE NOTE ===
Title: ${noteTitle || 'Untitled Note'}
Content:
${noteContent ? noteContent : '(Note is currently empty)'}
==========================
`;

  const initialHistory = [
    { role: 'user', parts: [{ text: 'Hello!' }] },
    { role: 'model', parts: [{ text: "Hi! I'm your Zen Notes Assistant. I can summarize this note, explain concepts, generate flashcards, or even write entirely new structured notes for you. What do you need?" }] }
  ];

  let historyToUse = existingHistory.length > 0 ? existingHistory : initialHistory;
  if (historyToUse.length > 0 && historyToUse[0]?.role !== 'user') {
    historyToUse = [initialHistory[0], ...historyToUse];
  }

  let rawSession: any = null;
  let workingModel = MODEL_PRIORITY[0];
  for (const modelName of MODEL_PRIORITY) {
    try {
      const genAI = new GoogleGenerativeAI(allKeys[0]);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: dynamicSystemPrompt,
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
        safetySettings: SAFETY_SETTINGS,
      });
      rawSession = model.startChat({ history: historyToUse });
      workingModel = modelName;
      break;
    } catch (_) {}
  }
  if (!rawSession) {
    const genAI = new GoogleGenerativeAI(allKeys[0]);
    const model = genAI.getGenerativeModel({
      model: MODEL_PRIORITY[0],
      systemInstruction: dynamicSystemPrompt,
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      safetySettings: SAFETY_SETTINGS,
    });
    rawSession = model.startChat({ history: historyToUse });
    workingModel = MODEL_PRIORITY[0];
  }

  return new RobustChatSession(rawSession, workingModel, dynamicSystemPrompt, { temperature: 0.6, maxOutputTokens: 8192 }, historyToUse);
};
