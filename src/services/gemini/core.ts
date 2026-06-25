import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getActiveGeminiKey, setAuthExpired } from '../userGeminiAuth';

// ── Global Fetch Interceptor for Gemini OAuth ───────────────────────────────
// The official GoogleGenerativeAI SDK does not natively support OAuth Bearer tokens
// and ignores customFetch in newer versions. This interceptor catches requests
// containing our dummy key and rewrites them into valid OAuth requests.
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    try {
      const urlString = input instanceof Request ? input.url : input.toString();
      if (urlString.includes('generativelanguage.googleapis.com')) {
        const headers = new Headers(init?.headers);
        if (input instanceof Request) {
          input.headers.forEach((v, k) => headers.set(k, v));
        }
        
        // The SDK passes the key in headers, not the URL
        if (headers.get('x-goog-api-key') === 'oauth_dummy_key') {
          const url = new URL(urlString);
          url.searchParams.delete('key'); // just in case
          headers.delete('x-goog-api-key');
          
          const token = getActiveGeminiKey();
          if (token) {
            // ✅ Happy path: inject the live OAuth bearer token
            headers.set('Authorization', `Bearer ${token}`);
            return originalFetch(url.toString(), { ...init, headers });
          } else {
            // ❌ CRITICAL FIX: The personal key was requested but is expired or missing.
            // Instead of sending a request with NO auth header (which causes a confusing
            // generic fetch error), throw a clear, typed error that callWithFallback
            // can detect and use to immediately rotate to the shared key pool.
            throw new Error('PERSONAL_TOKEN_UNAVAILABLE: OAuth token expired or not present. Rotating to shared key.');
          }
        }
      }
    } catch (e: any) {
      // If our own typed error, re-throw so callWithFallback catches it correctly
      if (e?.message?.startsWith('PERSONAL_TOKEN_UNAVAILABLE')) throw e;
      // All other interceptor errors: fall back to normal fetch
    }
    return originalFetch(input, init);
  };
}

// ── Model priority (verified real model IDs — 2026-06) ────────────────────────
// Only include models that ACTUALLY EXIST in the Gemini API.
// Invalid model IDs return 404 or look like 401 (model not available to key).
// Verified real IDs: https://ai.google.dev/api/generate-content#v1beta.models
// Gemini 3.x series (GA as of 2026) — ordered by capability
// These are the real API model IDs used with both API key and OAuth:
//   gemini-3.1-pro      = 3.1 Pro  (Advanced math and code)   ← PRIMARY
//   gemini-3.5-flash    = 3.5 Flash (All-around help)          ← FALLBACK 1
//   gemini-3.1-flash-lite = 3.1 Flash-Lite (Fastest)           ← FALLBACK 2
export const SHARED_MODEL_PRIORITY = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-pro',
];

export const PERSONAL_MODEL_PRIORITY = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro',
  'gemini-2.5-flash',
];

export const getPriorityModels = (isPersonal: boolean) => {
  return isPersonal ? PERSONAL_MODEL_PRIORITY : SHARED_MODEL_PRIORITY;
};

export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Always try the best model first (avoid permanent sticky downgrades due to transient errors)
const getPreferredModel = (isPersonal: boolean): string => {
  return getPriorityModels(isPersonal)[0];
};
const setPreferredModel = (m: string) => {
  // No-op to prevent permanent sticky downgrades
};
if (typeof window !== 'undefined') {
  try { localStorage.removeItem('zen_working_model'); } catch {}
}

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
    (msg.includes('400') && msg.includes('size')) ||
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
 *  - Personal OAuth key first, shared key pool fallback (automatic, no errors shown)
 *  - Smart model ordering (cached winner first)
 *  - Capped exponential backoff (max 4s) on retryable errors
 *  - Automatic fallback through all models in MODEL_PRIORITY
 *  - Round-robin load balancing across all available shared API keys
 */

export const callWithFallback = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>
): Promise<any> => {
  // ── Key Resolution: always call getActiveGeminiKey() FRESH (it auto-expires) ──
  const personalKey = getActiveGeminiKey();

  if (!personalKey && allKeys.length === 0) {
    throw new Error('No Gemini API key found. Add your API key in Settings → AI Key.');
  }

  // Build the ordered key trial list: personal first (if valid), then round-robin shared
  const keysToTry: { token: string, isPersonal: boolean, isSharedIndex?: number }[] = [];
  
  if (personalKey) {
    keysToTry.push({ token: personalKey, isPersonal: true });
  }

  if (allKeys.length > 0) {
    const startIndex = globalKeyIndex;
    globalKeyIndex = (globalKeyIndex + 1) % allKeys.length;
    for (let i = 0; i < allKeys.length; i++) {
      const idx = (startIndex + i) % allKeys.length;
      keysToTry.push({ token: allKeys[idx], isPersonal: false, isSharedIndex: idx });
    }
  }

  const safeDispatchRotation = (nextKeyObj: any, reason?: string) => {
    const label = nextKeyObj.isPersonal
      ? 'personal key'
      : `shared key [${(nextKeyObj.isSharedIndex ?? 0) + 1}/${allKeys.length}]`;
    console.warn(`[ZenAI] → Rotating to ${label}. Reason: ${(reason || '').substring(0, 80)}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: `↩ Rotating to ${label}...` }
      }));
    }
  };

  // Model order: cached winner first, then priority list
  const isPersonalRequest = !!personalKey;
  const priorityList = getPriorityModels(isPersonalRequest);
  const preferred = getPreferredModel(isPersonalRequest);
  const ordered = [preferred, ...priorityList.filter(m => m !== preferred)];

  let lastError: any;
  let hitQuota = false;

  for (let i = 0; i < ordered.length; i++) {
    const modelName = ordered[i];
    let keyAttempts = 0;

    while (keyAttempts < keysToTry.length) {
      const currentKeyObj = keysToTry[keyAttempts];
      const isPersonalToken = currentKeyObj.isPersonal;

      try {
        // IMPORTANT: For the personal OAuth key, re-check validity at time of use.
        // The token may have expired between when we built keysToTry and now.
        if (isPersonalToken && !getActiveGeminiKey()) {
          // Personal key is gone (expired). Skip directly to shared keys.
          console.warn('[ZenAI] Personal key expired mid-loop. Skipping to shared key pool.');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { type: 'thinking', title: '🔄 Personal token expired. Using shared key pool...' }
            }));
          }
          keyAttempts++;
          continue;
        }

        const genAI = new GoogleGenerativeAI(isPersonalToken ? 'oauth_dummy_key' : currentKeyObj.token);
        const result = await buildRequest(genAI, modelName);
        setPreferredModel(modelName);
        return result;

      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '').toLowerCase();

        if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) hitQuota = true;

        // Personal token unavailable (detected by interceptor) → skip straight to shared key
        if (msg.includes('personal_token_unavailable')) {
          console.warn('[ZenAI] Interceptor: personal token unavailable. Rotating to shared key.');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { type: 'thinking', title: '🔄 Personal AI token unavailable. Switching to shared key...' }
            }));
          }
          keyAttempts++;
          continue;
        }

        // 404 = model doesn't exist for this key/region → skip to next model immediately
        if (msg.includes('404') || msg.includes('not found')) break;

        // Rate limit / quota / auth error → try next key for the SAME model
        if (isAuthError(err)) {
          if (keyAttempts + 1 < keysToTry.length) {
            safeDispatchRotation(keysToTry[keyAttempts + 1], err.message);
            keyAttempts++;
            continue;
          }
          // Exhausted all keys on auth error
          break;
        }

        // Other retryable error (503, overload) → skip model entirely
        if (isRetryableError(err)) break;

        // Non-retryable → surface immediately
        throw err;
      }
    }

    // All keys failed for this model. Apply capped delay then try next model.
    if (i < ordered.length - 1) {
      let delay = Math.min(1000 * Math.pow(2, i), 4000);
      if (lastError) {
        const retryMatch = String(lastError.message).toLowerCase().match(/retry after (\d+)/);
        if (retryMatch?.[1]) delay = parseInt(retryMatch[1], 10) * 1000;
      }
      delay = Math.min(delay, 4000); // Hard cap — never sleep > 4s between model fallbacks
      console.warn(`[ZenAI] ${modelName} exhausted, trying ${ordered[i + 1]} in ${delay}ms`);
      await sleep(delay);
    }
  }

  // All models and keys exhausted
  if (hitQuota) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: '⚠️ All API keys hit rate limits.' }
      }));
    }
    if (personalKey) {
      throw new Error('Both your personal Gemini key AND the shared pool have hit their rate limits. Please try again in a minute.');
    } else if (allKeys.length > 1) {
      throw new Error(`All ${allKeys.length} shared API keys hit their rate limit. Add your personal Gemini key in Settings → AI Key.`);
    } else {
      throw new Error('AI quota reached. Add your own Gemini API key in Settings for uninterrupted access.');
    }
  }

  const finalMsg = String(lastError?.message || '').toLowerCase();
  if (finalMsg.includes('503') || finalMsg.includes('overload') || finalMsg.includes('high demand')) {
    throw new Error('AI is currently overloaded. Please try again in a moment.');
  }
  if (finalMsg.includes('401') || finalMsg.includes('invalid authentication') || finalMsg.includes('authentication credentials')) {
    if (personalKey) {
      setAuthExpired();
      throw new Error('Your Gemini OAuth session has expired. Please reconnect your Google account to continue using your private quota.');
    }
    throw new Error('Gemini API key is invalid. Please update VITE_GEMINI_API_KEY in your environment settings.');
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

  async sendMessageStream(msg: string, onChunk: (title: string) => void): Promise<{ title: string, model: string }> {
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
          return { title: fullText, model: modelName };
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
              return { title: ft, model: modelName };
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
export const parseAIJson = (title: string): any => {
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

  console.error("AI JSON Parse Failed. Raw title:", text, "Errors:", errors);
  throw new Error(`Parse error: ${errors[0] || 'unknown'}. Raw: ${text.substring(0, 80)}...`);
};
