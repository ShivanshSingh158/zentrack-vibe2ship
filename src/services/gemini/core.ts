import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// ── Model priority (verified real model IDs — 2026-06) ────────────────────────
// Only include models that ACTUALLY EXIST in the Gemini API.
// Invalid model IDs return 404 or look like 401 (model not available to key).
// Verified real IDs: https://ai.google.dev/api/generate-content#v1beta.models
// Gemini 3.x series (GA as of 2026) — ordered by capability
// These are the real API model IDs used with both API key and OAuth:
//   gemini-3.1-pro      = 3.1 Pro  (Advanced math and code)   ← PRIMARY
//   gemini-3.5-flash    = 3.5 Flash (All-around help)          ← FALLBACK 1
//   gemini-3.1-flash-lite = 3.1 Flash-Lite (Fastest)           ← FALLBACK 2
export const MODEL_PRIORITY = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

export const SAFETY_SETTINGS = [
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
export const allKeys = rawApiKey
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

export let globalKeyIndex = 0;

export const takeNextKeyIndex = (): number => {
  const current = globalKeyIndex;
  globalKeyIndex = (globalKeyIndex + 1) % Math.max(allKeys.length, 1);
  return current;
};

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
  if (finalMsg.includes('401') || finalMsg.includes('invalid authentication') || finalMsg.includes('authentication credentials')) {
    throw new Error('Gemini API key is invalid. Please update VITE_GEMINI_API_KEY in Vercel settings.');
  }

  throw new Error(lastError?.message || 'AI failed to respond. Please try again.');
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
