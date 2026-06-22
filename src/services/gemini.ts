import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getLocalDateString } from '../utils/dateUtils';

// ── Model priority (verified real model IDs — 2026-06) ────────────────────────
// Only include models that ACTUALLY EXIST in the Gemini API.
// Invalid model IDs return 404 or look like 401 (model not available to key).
// Verified real IDs: https://ai.google.dev/api/generate-content#v1beta.models
// Gemini 3.x series (GA as of 2026) — ordered by capability
// These are the real API model IDs used with both API key and OAuth:
//   gemini-3.1-pro      = 3.1 Pro  (Advanced math and code)   ← PRIMARY
//   gemini-3.5-flash    = 3.5 Flash (All-around help)          ← FALLBACK 1
//   gemini-3.1-flash-lite = 3.1 Flash-Lite (Fastest)           ← FALLBACK 2
const MODEL_PRIORITY = [
  'gemini-3.1-pro',        // PRIMARY — strongest (3.1 Pro)
  'gemini-3.5-flash',      // FALLBACK 1 — balanced (3.5 Flash)
  'gemini-3.1-flash-lite', // FALLBACK 2 — fastest (3.1 Flash-Lite)
  'gemini-2.5-pro',        // FALLBACK 3 — legacy
  'gemini-2.5-flash-lite', // FALLBACK 4 — last resort
];

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Remember which model worked last → try it first next time (faster)
const MODEL_CACHE_KEY = 'zen_working_model';
const getPreferredModel = (): string => {
  try {
    const cached = localStorage.getItem(MODEL_CACHE_KEY) || '';
    // Only use the cached model if it's still in our valid list
    if (cached && MODEL_PRIORITY.includes(cached)) return cached;
    localStorage.removeItem(MODEL_CACHE_KEY);
    return MODEL_PRIORITY[0];
  } catch { return MODEL_PRIORITY[0]; }
};
const setPreferredModel = (m: string) => {
  try { localStorage.setItem(MODEL_CACHE_KEY, m); } catch { /* ignore */ }
};

const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
// Filter out empty strings and obviously invalid keys (too short)
const allKeys = rawApiKey
  .split(',')
  .map((k: string) => k.trim())
  .filter((k: string) => k.length > 10);

if (allKeys.length === 0) {
  console.error('[ZenAI] ❌ VITE_GEMINI_API_KEY is missing or empty. Set it in Vercel → Settings → Environment Variables.');
} else {
  console.log(`[ZenAI] ✅ ${allKeys.length} Gemini API key(s) loaded.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const isRetryableError = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('503') || msg.includes('overload') || msg.includes('high demand') ||
    msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') ||
    // Note: 404 is NOT here — invalid model = skip immediately, handled separately
    msg.includes('unavailable') ||
    msg.includes('500') || msg.includes('internal') ||
    // 401 on a specific model often means that model is not available to this key
    // → retry on next model instead of treating as a hard auth failure
    msg.includes('401') || msg.includes('invalid authentication') || msg.includes('authentication credentials')
  );
};

const isAuthError = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  // Treat as auth error (key rotation) for quota/rate-limit AND 401 invalid credentials
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') ||
         msg.includes('401') || msg.includes('invalid authentication') || msg.includes('authentication credentials');
};

let globalKeyIndex = 0;

/**
 * Core AI caller with:
 *  - Smart model ordering (cached winner first)
 *  - Per-model timeout (30s)
 *  - Exponential backoff on retryable errors
 *  - Automatic fallback through MODEL_PRIORITY
 *  - Round-robin load balancing across all available API keys
 */
export const callWithFallback = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>
): Promise<any> => {
  if (allKeys.length === 0) throw new Error('Gemini API key is missing. Please contact support.');

  // Round-robin start index for this specific request
  let localKeyIndex = globalKeyIndex;
  globalKeyIndex = (globalKeyIndex + 1) % allKeys.length;

  const getKey = () => allKeys[localKeyIndex] || '';
  const rotateKey = (): boolean => {
    if (allKeys.length > 1) {
      localKeyIndex = (localKeyIndex + 1) % allKeys.length;
      console.warn(`[ZenAI] Switched to fallback API key (${localKeyIndex + 1}/${allKeys.length})`);
      return true;
    }
    return false;
  };

  // Build ordered list: cached winner first, then rest
  const preferred = getPreferredModel();
  const ordered = [preferred, ...MODEL_PRIORITY.filter(m => m !== preferred)];

  let lastError: any;
  let hitQuota = false;
  for (let i = 0; i < ordered.length; i++) {
    const modelName = ordered[i];

    let keyAttempts = 0;
    while (keyAttempts < allKeys.length) {
      try {
        const genAI = new GoogleGenerativeAI(getKey());
        const result = await Promise.race([
          buildRequest(genAI, modelName),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout after 45s')), 45_000))
        ]);
        setPreferredModel(modelName); // Cache this winner
        return result;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) hitQuota = true;

        // 404 = model doesn't exist for this key/region → skip to next model immediately
        if (msg.includes('404') || msg.includes('not found')) break;

        // Rate limit / quota / auth error → try next key for the SAME model
        if (isAuthError(err)) {
          if (rotateKey()) {
            keyAttempts++;
            continue;
          }
        }

        // Other retryable error → break key loop, try next model
        if (isRetryableError(err)) break;

        // Non-retryable → throw immediately
        throw err;
      }
    }

    // Exhausted all keys for this model. Delay then try next model.
    if (i < ordered.length - 1) {
      const delay = Math.min(1000 * Math.pow(2, i), 4000); // 1s, 2s, 4s max
      console.warn(`[ZenAI] ${modelName} failed, trying ${ordered[i + 1]} in ${delay}ms`);
      await sleep(delay);
    }
  }

  if (hitQuota) {
    if (allKeys.length > 1) {
      throw new Error(`All ${allKeys.length} API keys have hit their rate limit. Please try again in a minute.`);
    } else {
      throw new Error('AI quota reached. Please try again in a few minutes.');
    }
  }

  const finalMsg = String(lastError?.message || '').toLowerCase();
  if (finalMsg.includes('503') || finalMsg.includes('overload') || finalMsg.includes('high demand')) {
    throw new Error('AI is currently overloaded. Please try again later.');
  }
  if (finalMsg.includes('401') || finalMsg.includes('invalid authentication')) {
    throw new Error('Gemini API key is invalid. Please update VITE_GEMINI_API_KEY in Vercel settings.');
  }

  throw new Error('AI failed to respond. Please try again.');
};

// ── Robust Chat Wrapper ───────────────────────────────────────────────────────
// Wraps a Gemini chat session with:
//  1. Model fallback — tries every model in MODEL_PRIORITY
//  2. Key rotation — tries every API key per model
//  3. History preservation — stores initial seed so rebuilds always have valid history
//  4. History validation — ensures first message is always role 'user'
export class RobustChatSession {
  private session: any;
  private modelName: string;
  private modelIndex: number;
  private systemPrompt: string;
  private keyIndex = 0;
  private genConfig: any;
  private seedHistory: any[];  // stored at creation so rebuilds are safe

  constructor(
    initialSession: any,
    modelName: string,
    systemPrompt: string,
    genConfig: any = { temperature: 0.65 },
    seedHistory: any[] = []
  ) {
    this.session      = initialSession;
    this.modelName    = modelName;
    this.modelIndex   = Math.max(0, MODEL_PRIORITY.indexOf(modelName));
    this.systemPrompt = systemPrompt;
    this.genConfig    = genConfig;
    this.seedHistory  = seedHistory;
  }

  async getHistory() {
    try {
      const h = await this.session.getHistory();
      return Array.isArray(h) && h.length > 0 ? h : this.seedHistory;
    } catch {
      return this.seedHistory;
    }
  }

  // Validate history: must start with 'user' role and alternate correctly
  private sanitizeHistory(history: any[]): any[] {
    if (!Array.isArray(history) || history.length === 0) return this.seedHistory;
    // If first entry isn't 'user', use the stored seed instead
    if (history[0]?.role !== 'user') return this.seedHistory;
    return history;
  }

  private async rebuildSession(modelName: string, keyIndex: number, history: any[]) {
    const safeHistory = this.sanitizeHistory(history);
    const genAI = new GoogleGenerativeAI(allKeys[keyIndex] || allKeys[0]);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: this.systemPrompt,
      generationConfig: this.genConfig,
      safetySettings: SAFETY_SETTINGS,
    });
    return model.startChat({ history: safeHistory });
  }

  async sendMessageStream(msg: string, onChunk: (text: string) => void): Promise<{ text: string, model: string }> {
    let lastError: any;
    for (let mi = this.modelIndex; mi < MODEL_PRIORITY.length; mi++) {
      const modelName = MODEL_PRIORITY[mi];
      const keyCount = Math.max(allKeys.length, 1);
      for (let ki = 0; ki < keyCount; ki++) {
        const keyIdx = (this.keyIndex + ki) % keyCount;
        try {
          if (mi !== this.modelIndex || ki > 0) {
            const history = await this.getHistory();
            this.session    = await this.rebuildSession(modelName, keyIdx, history);
            this.modelName  = modelName;
            this.modelIndex = mi;
            this.keyIndex   = keyIdx;
          }

          const result = await this.session.sendMessageStream(msg);
          let fullText = '';
          let sawFinish = false;
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            onChunk(fullText);
            if (chunk.candidates?.[0]?.finishReason) {
              sawFinish = true;
            }
          }
          if (fullText.length > 0 && !sawFinish) {
            throw new Error('STREAM_ABORTED_NO_FINISH_REASON');
          }
          setPreferredModel(modelName);
          return { text: fullText, model: modelName };
        } catch (err: any) {
          lastError = err;
          const errMsg = String(err?.message || '').toLowerCase();
          const isAuth = errMsg.includes('401') || errMsg.includes('invalid authentication');
          const isNotFound = errMsg.includes('404') || errMsg.includes('not found');
          if (isAuth && ki < keyCount - 1) continue;
          if (isNotFound || isAuth) break;
          if (errMsg.includes('first content should be with role')) {
            this.session = await this.rebuildSession(modelName, keyIdx, this.seedHistory);
            try {
              const retryResult = await this.session.sendMessageStream(msg);
              let ft = '';
              let sawRetryFinish = false;
              for await (const chunk of retryResult.stream) {
                ft += chunk.text();
                onChunk(ft);
                if (chunk.candidates?.[0]?.finishReason) sawRetryFinish = true;
              }
              if (ft.length > 0 && !sawRetryFinish) {
                throw new Error('STREAM_ABORTED_NO_FINISH_REASON');
              }
              return { text: ft, model: modelName };
            } catch (e: any) { lastError = e; }
          }
          if (ki === keyCount - 1) break;
        }
      }
    }
    throw lastError || new Error('All models exhausted in stream.');
  }

  async sendMessage(msg: string) {
    let lastError: any;

    // Try every model starting from current
    for (let mi = this.modelIndex; mi < MODEL_PRIORITY.length; mi++) {
      const modelName = MODEL_PRIORITY[mi];

      // Try each API key for this model
      const keyCount = Math.max(allKeys.length, 1);
      for (let ki = 0; ki < keyCount; ki++) {
        const keyIdx = (this.keyIndex + ki) % keyCount;

        try {
          // Rebuild if we switched model or key
          if (mi !== this.modelIndex || ki > 0) {
            const history = await this.getHistory();
            this.session    = await this.rebuildSession(modelName, keyIdx, history);
            this.modelName  = modelName;
            this.modelIndex = mi;
            this.keyIndex   = keyIdx;
          }

          const result = await this.session.sendMessage(msg);
          setPreferredModel(modelName);
          return result;

        } catch (err: any) {
          lastError = err;
          const errMsg = String(err?.message || '').toLowerCase();

          const isAuth      = errMsg.includes('401') || errMsg.includes('invalid authentication') ||
                              errMsg.includes('authentication credentials');
          const isNotFound   = errMsg.includes('404') || errMsg.includes('not found');
          const isRateLimit  = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit');
          const isOverload   = errMsg.includes('503') || errMsg.includes('overload') || errMsg.includes('high demand');
          const isHistoryBad = errMsg.includes('first content should be with role') || errMsg.includes('role \'user\'');

          if (isAuth) {
            console.warn(`[ZenAI Chat] ${modelName} auth error (key ${keyIdx}), trying next key`);
            if (ki < keyCount - 1) continue;
            break;
          }

          if (isNotFound) {
            console.warn(`[ZenAI Chat] ${modelName} 404 not found, trying next model`);
            break;
          }

          if (isHistoryBad) {
            // History format error → reset to seed history and retry SAME model
            console.warn(`[ZenAI Chat] History role error, resetting to seed history`);
            try {
              this.session = await this.rebuildSession(modelName, keyIdx, this.seedHistory);
              const result = await this.session.sendMessage(msg);
              setPreferredModel(modelName);
              return result;
            } catch { /* fall through to next model */ }
            break;
          }

          if (isRateLimit) {
            // Rate limited → try next key, then next model
            console.warn(`[ZenAI Chat] ${modelName} rate limited (key ${ki+1}/${keyCount})`);
            if (ki < keyCount - 1) {
              await new Promise(r => setTimeout(r, 300));
              continue; // try next key
            }
            break; // exhausted keys → try next model
          }

          if (isOverload) {
            console.warn(`[ZenAI Chat] ${modelName} overloaded, trying next model`);
            await new Promise(r => setTimeout(r, 300));
            break;
          }

          // Unknown error → throw (not retryable)
          throw new Error(err.message || 'AI failed to respond. Please try again.');
        }
      }
    }

    // All models exhausted
    console.error('[ZenAI Chat] All models failed:', lastError?.message);
    throw new Error('AI is temporarily unavailable. Please try again in a moment.');
  }
}


/**
 * Robustly parse JSON from an AI response.
 * Handles markdown fences, leading/trailing text, escaped JSON strings.
 */
export const parseAIJson = (text: string): any => {
  if (!text || typeof text !== 'string') throw new Error('parseAIJson received empty or non-string input');
  const t = text.trim();
  const errors: string[] = [];

  // Clean trailing commas (very common AI mistake)
  const cleanTrailing = (str: string) => str.replace(/,\s*([\}\]])/g, '$1');
  
  // Strip markdown blocks even if there is leading text
  const stripped = t.replace(/[\s\S]*?```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();

  const attempts = [
    stripped,
    cleanTrailing(stripped),
    t,
    cleanTrailing(t)
  ];

  // Bracket-counting safe extractor with auto-repair for truncated JSON
  const extractJson = (src: string): string | null => {
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch !== '{' && ch !== '[') continue;
      const stack: string[] = [];
      let inStr = false;
      let escape = false;
      for (let j = i; j < src.length; j++) {
        const c = src[j];
        if (escape) { escape = false; continue; }
        if (c === '\\' && inStr) { escape = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}' || c === ']') {
          if (stack[stack.length - 1] === c) stack.pop();
          if (stack.length === 0) return src.slice(i, j + 1);
        }
      }
      
      // If we reach the end and stack is not empty, it means the JSON was cut off.
      // Let's repair it by closing any open strings and brackets.
      let repaired = src.slice(i);
      if (inStr) repaired += '"';
      while (stack.length > 0) {
        repaired += stack.pop();
      }
      return repaired;
    }
    return null;
  };

  const extracted = extractJson(t);
  if (extracted) {
    attempts.push(extracted);
    attempts.push(cleanTrailing(extracted));
  }

  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return JSON.parse(attempt);
    } catch (e: any) {
      if (!errors.includes(e.message)) errors.push(e.message);
    }
  }

  console.error("AI JSON Parse Failed. Raw text:", text, "Errors:", errors);
  throw new Error(`Parse error: ${errors[0] || 'unknown'}. Raw: ${text.substring(0, 80)}...`);
};

// ── AI Features ───────────────────────────────────────────────────────────────

export const generateAnalyticsInsights = async (userData: any) => {
  // Trim data to avoid token overflow — summarise arrays instead of dumping raw JSON
  const safe = {
    summary: userData.summary,
    recentTasks: (userData.todos || []).slice(0, 20).map((t: any) => ({ text: t.text, done: t.isCompleted, date: t.date, priority: t.priority })),
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
6. JOB SEARCH FUNNEL: If job data exists, analyze pipeline health and application velocity

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
  const startKeyIdx = globalKeyIndex % allKeys.length;
  globalKeyIndex = (globalKeyIndex + 1) % allKeys.length;

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

const GYM_OAUTH_MODELS = [
  'gemini-3.1-pro',        // PRIMARY — 3.1 Pro (Advanced math & code)
  'gemini-3.5-flash',      // FALLBACK 1 — 3.5 Flash (All-around help)
  'gemini-3.1-flash-lite', // FALLBACK 2 — 3.1 Flash-Lite (Fastest)
  'gemini-2.5-pro',        // FALLBACK 3 — legacy pro
  'gemini-2.5-flash-lite', // FALLBACK 4 — last resort
];

async function callGymOAuthREST(
  token: string,
  systemInstruction: string,
  contents: any[],
  modelIndex = 0
): Promise<string> {
  const model = GYM_OAUTH_MODELS[modelIndex];
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
  const model = GYM_OAUTH_MODELS[modelIndex];
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
              if (modelIndex < GYM_OAUTH_MODELS.length - 1) {
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
    if (modelIndex < GYM_OAUTH_MODELS.length - 1) {
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


export const analyzeJobDescription = async (text: string) => {
  const jdText = text.trim().slice(0, 10000);

  const prompt = `You are a precision job description parser trained on millions of job postings across tech, finance, healthcare, and business sectors.

Your ONLY job is to extract factual data from the job description text below. Never infer. Never guess. Never fabricate.

EXTRACTION RULES (follow exactly):

"company":
  - Look for: company letterhead at top, "About [Company]", "at [Company]", "[Company] is hiring", "Join the [Company] team"
  - Must be a proper noun (company name, not a description)
  - If multiple names appear, pick the HIRING company (not the client they serve)
  - Return "" if genuinely not found

"role":
  - Look for: title in bold/header, "Job Title:", "Position:", "Role:", the FIRST bolded or capitalized job title
  - Return exact text as written (e.g. "Senior Software Engineer - Backend" not "Software Engineer")
  - Return "" if not found

"location":
  - Look for: city names, country names, "Remote", "Hybrid", "On-site", "WFH", "Location:", "Based in"
  - Include work model if stated (e.g. "New York, NY (Hybrid)")
  - Return "" if not found

"salary":
  - Look for: "$", "₹", "€", "£", "LPA", "CTC", "per year", "per annum", "annually", salary ranges with numbers
  - Return the EXACT text as written (e.g. "$120,000 - $160,000 per year")
  - Return "" if not found

"skills":
  - Extract ONLY from: Requirements, Qualifications, Must-have, Nice-to-have, Technical Skills sections
  - Include: programming languages, frameworks, tools, databases, platforms, methodologies
  - Exclude: soft skills ("communication", "teamwork"), vague phrases ("fast learner")
  - Clean up: remove duplicates, normalize case ("react" → "React", "nodejs" → "Node.js")
  - Max 20 skills, each < 40 characters

CRITICAL:
- Return ONLY raw JSON. No markdown, no explanation, no preamble.
- Never use placeholder text like "[Company Name]"
- Never use "Not specified", "N/A", or similar — use "" instead

Job Description text:
---
${jdText}
---

{"company":"","role":"","location":"","salary":"","skills":[]}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());

    const cleanStr = (val: any): string => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      const rejects = new Set([
        '', 'unknown', 'n/a', 'na', 'not specified', 'not found', 'not mentioned',
        'not provided', 'not available', 'null', 'none', 'unspecified', 'company',
        'company name', 'job title', 'role', 'location', 'salary',
      ]);
      if (rejects.has(s.toLowerCase())) return '';
      if (/^\[.+\]$/.test(s)) return ''; // Reject [placeholders]
      if (s.length > 150) return ''; // Too long = probably a sentence not a name
      return s;
    };

    const cleanSkills = (val: any): string[] => {
      if (!Array.isArray(val)) return [];
      return [...new Set(
        val
          .map((s: any) => cleanStr(s))
          .filter(s => s.length > 0 && s.length <= 50)
      )];
    };

    // Safe parse guard — ensure parsed is an object
    const safeP = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};

    // Regex fallback for company: find first capitalized word sequence on its own line in first 300 chars
    let company = cleanStr(safeP.company);
    if (!company) {
      const firstChunk = jdText.slice(0, 300);
      const match = firstChunk.match(/^([A-Z][a-zA-Z0-9&.,' -]{2,40})$/m);
      if (match) company = match[1].trim();
    }

    return {
      company,
      role:     cleanStr(safeP.role),
      location: cleanStr(safeP.location),
      salary:   cleanStr(safeP.salary),
      skills:   cleanSkills(safeP.skills),
    };
  });
};

export const analyzeLeetCodeSlug = async (slug: string) => {
  const cleanSlug = slug.replace(/.*leetcode\.com\/problems\//, '').replace(/[/?#].*/,'').trim();

  let problemContext = `Problem Slug: ${cleanSlug}`;
  let apiDataValid = false;
  try {
    const res = await fetch(`/api/leetcode?slug=${encodeURIComponent(cleanSlug)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && data.title && data.difficulty) {
        apiDataValid = true;
        const tags = Array.isArray(data.topicTags)
          ? data.topicTags.map((t: any) => (typeof t === 'object' ? t.name : t)).join(', ')
          : 'None';
        const hints = Array.isArray(data.hints) ? data.hints.join(' | ') : 'None provided.';
        problemContext = `Problem Title: ${data.title}
Difficulty: ${data.difficulty}
Tags: ${tags}
Description (HTML): ${String(data.content || '').substring(0, 3000) || 'None provided.'}
Hints: ${hints}`;
      } else {
        console.warn(`[ZenAI] LeetCode API returned invalid data for ${cleanSlug}`);
      }
    } else {
      console.warn(`[ZenAI] LeetCode API ${res.status} for ${cleanSlug}, using AI knowledge`);
    }
  } catch (error) {
    console.warn('[ZenAI] Network error fetching LeetCode data:', error);
  }

  const prompt = `You are a FAANG-level senior software engineer and technical interview specialist with 10+ years of experience at Google, Meta, Amazon, and Apple.

You are analyzing a LeetCode problem to help a candidate prepare for technical interviews.
${apiDataValid ? 'You have been given the VERIFIED problem details below. Use them precisely.' : 'The live API is unavailable. Use your expert knowledge of LeetCode problems for this slug.'}

Problem Data:
---
${problemContext}
---

Your analysis must cover:
1. ALGORITHM PATTERN: The primary CS pattern this problem tests (e.g. "Sliding Window", "Two Pointers", "Dynamic Programming - Knapsack", "Graph BFS", "Monotonic Stack", "Trie", "Union-Find")
2. COMPLEXITY: Optimal time AND space complexity with brief justification (e.g. "O(N) time — single pass hash map lookup")
3. SIMILAR PROBLEMS: 3-5 problems that use the same pattern/technique, by exact LeetCode title
4. PROGRESSIVE HINTS: 3 hints of increasing specificity — Hint 1 nudges direction, Hint 2 reveals approach, Hint 3 gives near-solution structure. Never give away the full solution.
5. SUBTASKS: 4-6 concrete implementation steps a candidate should follow in an interview setting

Return ONLY raw JSON (no markdown, no explanation):
{"title":"","difficulty":"Easy","tags":[],"optimalTimeComplexity":"O(N)","optimalSpaceComplexity":"O(1)","pattern":"","patternExplanation":"","similarProblems":[],"hints":["Hint 1 — direction nudge","Hint 2 — approach reveal","Hint 3 — near-solution structure"],"subTasks":["Step 1","Step 2","Step 3","Step 4"]}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.15, maxOutputTokens: 1200 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());

    const safeP = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    const validDifficulty = ['Easy', 'Medium', 'Hard'];
    const titleFallback = cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return {
      title:                  typeof safeP.title === 'string' && safeP.title ? safeP.title : titleFallback,
      difficulty:             validDifficulty.includes(safeP.difficulty) ? safeP.difficulty : 'Medium',
      tags:                   Array.isArray(safeP.tags) ? safeP.tags.filter(Boolean) : [],
      optimalTimeComplexity:  typeof safeP.optimalTimeComplexity === 'string' ? safeP.optimalTimeComplexity : 'O(N)',
      optimalSpaceComplexity: typeof safeP.optimalSpaceComplexity === 'string' ? safeP.optimalSpaceComplexity : 'O(1)',
      pattern:                typeof safeP.pattern === 'string' ? safeP.pattern : 'General',
      patternExplanation:     typeof safeP.patternExplanation === 'string' ? safeP.patternExplanation : '',
      similarProblems:        Array.isArray(safeP.similarProblems) ? safeP.similarProblems.filter(Boolean) : [],
      hints:                  Array.isArray(safeP.hints) && safeP.hints.length > 0 ? safeP.hints.filter(Boolean) : ['Think about the brute force first', 'Can you avoid recomputing with a data structure?', 'Consider the optimal substructure'],
      subTasks:               Array.isArray(safeP.subTasks) && safeP.subTasks.length > 0 ? safeP.subTasks.filter(Boolean) : ['Read & restate the problem', 'Identify examples + edge cases', 'Choose data structures', 'Code the solution', 'Test & optimize'],
      _dataSource:            apiDataValid ? 'api' : 'ai_knowledge',
    };
  });
};

export const gradeLeetCodeSolution = async (
  title: string, code: string, optimalTime: string, optimalSpace: string
) => {
  if (!code.trim() || code.trim().length < 10) {
    throw new Error('Code is too short. Please paste your full solution.');
  }

  const prompt = `You are a Staff Engineer at a FAANG company conducting a technical interview code review.

You are reviewing a candidate's LeetCode solution. Your job is to give HONEST, SPECIFIC, ACTIONABLE feedback — the kind that helps them improve for real interviews.

Problem: "${title}"
Expected optimal complexity: Time ${optimalTime} | Space ${optimalSpace}

Candidate's Solution:
\`\`\`
${code.slice(0, 4000)}
\`\`\`

REVIEW FRAMEWORK:
1. CORRECTNESS: Does the logic handle all cases? Look for off-by-one errors, null/empty edge cases, integer overflow.
2. COMPLEXITY ANALYSIS: What is the ACTUAL time and space complexity of THIS specific code? Show your work briefly.
3. OPTIMALITY GAP: How far is this from optimal? If suboptimal, why and by how much?
4. CODE QUALITY (interview perspective): Variable naming, code readability, would an interviewer approve?
5. BUGS: List specific bugs with line-by-line detail if found. Not vague — point to exact issue.
6. OPTIMAL SOLUTION: Provide the cleanest, most interview-ready optimal solution in the SAME programming language as the candidate's code.

TONE: Direct and honest. Not harsh, not fluffy. Like feedback from a respected senior engineer.

Return ONLY raw JSON (no markdown, no preamble):
{
  "timeComplexity": "O(?)",
  "spaceComplexity": "O(?)",
  "isOptimal": false,
  "complexityExplanation": "Why this complexity — one sentence referencing actual loops/data structures in the code",
  "bugsFound": ["Specific bug description with what line/pattern causes it"],
  "codeQualityNotes": "One sentence on interview-readiness of the code style",
  "feedback": "2-3 sentence overall assessment a senior engineer would give in a debrief",
  "optimalCode": "Clean optimal solution code here"
}`;

  return callWithFallback(async (genAI, modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      safetySettings: SAFETY_SETTINGS,
    });
    const result = await model.generateContent(prompt);
    const parsed = parseAIJson(result.response.text());
    const safeP = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};

    return {
      timeComplexity:       typeof safeP.timeComplexity === 'string' ? safeP.timeComplexity : 'Unknown',
      spaceComplexity:      typeof safeP.spaceComplexity === 'string' ? safeP.spaceComplexity : 'Unknown',
      isOptimal:            safeP.isOptimal === true,
      complexityExplanation:typeof safeP.complexityExplanation === 'string' ? safeP.complexityExplanation : '',
      bugsFound:            Array.isArray(safeP.bugsFound) ? safeP.bugsFound.filter(Boolean) : [],
      codeQualityNotes:     typeof safeP.codeQualityNotes === 'string' ? safeP.codeQualityNotes : '',
      feedback:             typeof safeP.feedback === 'string' ? safeP.feedback : 'Solution reviewed.',
      optimalCode:          typeof safeP.optimalCode === 'string' ? safeP.optimalCode : '// See editorial solution on LeetCode',
    };
  });
};

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

export const parseUniversalVoiceCommand = async (text: string) => {
  if (!text.trim()) {
    throw new Error('No voice input detected.');
  }

  const prompt = `You are a universal AI voice command parser for a productivity app with multiple modules.
Your job is to route the user's spoken sentence to the correct module and extract the necessary data.

Current Date: ${getLocalDateString(new Date())}
Current Time: ${new Date().toLocaleTimeString()}

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

CRITICAL INSTRUCTIONS:
- You are a data router. DO NOT output conversational text, greetings, or explanations anywhere.
- Do NOT explain your choices, not even inside the "text" or "topic" fields.
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

// ── Daily Overlays AI ─────────────────────────────────────────────────────────

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
    todos: (userData.todos || []).map((t: any) => ({ text: t.text, priority: t.priority, isOverdue: t.isOverdue })),
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

// ── Autonomous Task Planning & Scheduling ──────────────────────────────────────

export const autoScheduleDay = async (todos: any[], existingEvents: any[]) => {
  const safeTodos = todos.map(t => ({ id: t.id, text: t.text, priority: t.priority }));
  const safeEvents = existingEvents.map(e => ({ title: e.title, date: e.date, type: e.type }));

  const prompt = `You are Zen AI, an autonomous scheduling agent.
The user wants to auto-schedule their uncompleted tasks for today and tomorrow.
I am providing you a list of their tasks and their existing calendar events.

Your job is to assign a realistic "date" (YYYY-MM-DD) and a "time" (e.g., "14:00") for each task.
Spread the tasks intelligently so they are not overwhelmed.

Rules:
1. Prioritize 'high' priority tasks for today.
2. If today is too packed, push medium/low tasks to tomorrow.
3. Return raw JSON ONLY in this format:
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
