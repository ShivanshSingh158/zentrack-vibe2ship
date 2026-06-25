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
// Verified against: https://ai.google.dev/api/generate-content#v1beta.models
//
// ── Model priority lists ──────────────────────────────────────────────────────
// User-specified order (June 2026 GA model IDs):
//
// SHARED POOL (cheapest/highest-quota first to preserve budget):
//   1st: gemini-2.5-flash-lite-preview-06-17 → user's "gemini-3.1-flash-lite" tier
//   2nd: gemini-2.5-flash                    → user's "gemini-3.5-flash" tier
//   3rd: gemini-2.0-flash                    → fallback for stability
//
// PERSONAL (best capability first, user's own quota):
//   1st: gemini-2.5-flash                    → user's "gemini-3.5-flash" tier
//   2nd: gemini-2.5-flash-lite-preview-06-17 → user's "gemini-3.1-flash-lite" tier
//   3rd: gemini-2.0-flash                    → fallback for stability
//
// NOTE: Model IDs like "gemini-3.5-flash" and "gemini-3.1-flash-lite" are NOT
// available as public API strings. The equivalent current GA IDs are used above.
export const SHARED_MODEL_PRIORITY = [
  'gemini-2.5-flash-lite-preview-06-17', // Cheapest quota — "3.1 flash lite" tier, try first
  'gemini-2.5-flash',                    // Mid tier — "3.5 flash" equivalent
  'gemini-2.0-flash',                    // Stable fallback
];

export const PERSONAL_MODEL_PRIORITY = [
  'gemini-2.5-flash',                    // Best available — "3.5 flash" tier
  'gemini-2.5-flash-lite-preview-06-17', // Fast fallback — "3.1 flash lite" tier
  'gemini-2.0-flash',                    // Stable fallback
];

// Unified alias so internal consumers can reference a single constant.
// Defaults to SHARED_MODEL_PRIORITY (used by RobustChatSession without personal key).
export const MODEL_PRIORITY = SHARED_MODEL_PRIORITY;

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

const rawApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' && process.env?.VITE_GEMINI_API_KEY) || '';
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

// ── Global Concurrency Semaphore ──────────────────────────────────────────────
// This is the PRIMARY fix for the thundering-herd / key exhaustion problem.
// All callWithFallback calls share this counter. When too many agents are firing
// simultaneously, excess callers wait with random jitter before proceeding.
// This prevents N parallel agents from all hitting the API at the exact same ms.
const MAX_CONCURRENT_API_CALLS = 3; // Max simultaneous Gemini API calls across ALL agents
let _activeApiCalls = 0;

const acquireSemaphore = async (): Promise<void> => {
  const MAX_WAIT_MS = 30_000; // max 30s wait in queue
  const startedAt = Date.now();
  while (_activeApiCalls >= MAX_CONCURRENT_API_CALLS) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      // Timeout: proceed anyway rather than deadlocking
      console.warn('[ZenAI] Semaphore wait timeout — proceeding anyway to avoid deadlock.');
      break;
    }
    // Wait with random jitter so multiple queued calls don't all wake at the same time
    const jitter = 200 + Math.random() * 300;
    await sleep(jitter);
  }
  _activeApiCalls++;
};

const releaseSemaphore = () => {
  _activeApiCalls = Math.max(0, _activeApiCalls - 1);
};

// ── Per-key cooldown tracker ─────────────────────────────────────────────────
// When a key hits 429, mark it unavailable for KEY_COOLDOWN_MS.
// All subsequent callWithFallback calls skip that key until it cools down.
// This prevents the 1/8→2/8→8/8 waterfall exhaustion spiral.
const KEY_COOLDOWN_MS = 62_000; // 62s — just over Gemini's typical 60s 429 window
const keyCooldownUntil = new Map<string, number>(); // token (first 8 chars) → available-at timestamp

const isKeyAvailable = (token: string): boolean => {
  const key = token.substring(0, 8); // use prefix as map key (never log full key)
  const until = keyCooldownUntil.get(key);
  if (!until) return true;
  if (Date.now() >= until) {
    keyCooldownUntil.delete(key);
    return true;
  }
  return false;
};

const markKeyCooling = (token: string, reason: string, customCooldownMs?: number) => {
  const key = token.substring(0, 8);
  // ✅ FIXED: Use dynamic cooldown from Retry-After header if available,
  // otherwise fall back to the default 62s window.
  const cooldownMs = customCooldownMs ?? KEY_COOLDOWN_MS;
  const until = Date.now() + cooldownMs;
  keyCooldownUntil.set(key, until);
  console.warn(`[ZenAI] Key ...${key} rate-limited. Cooling for ${Math.ceil(cooldownMs / 1000)}s. Reason: ${reason.substring(0, 60)}`);
};

const isRateLimit = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted');
};

const isAuthError = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('401') || msg.includes('403') || msg.includes('invalid authentication') || msg.includes('authentication credentials') || msg.includes('permission denied');
};

const isModelNotFound = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('404') || msg.includes('not found');
};

const isOverload = (err: any): boolean => {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('503') || msg.includes('overload') || msg.includes('high demand') || msg.includes('unavailable');
};

// ── True round-robin key pointer ──────────────────────────────────────────────
// globalKeyIndex is the NEXT key to try. Each callWithFallback call picks the
// first available (non-cooling) key starting at globalKeyIndex, then advances
// the pointer. This distributes load across parallel agents correctly.
export let globalKeyIndex = 0;

export const takeNextKeyIndex = (): number => {
  const current = globalKeyIndex;
  globalKeyIndex = (globalKeyIndex + 1) % Math.max(allKeys.length, 1);
  return current;
};

/**
 * Picks the next available (non-cooling) shared API key using round-robin.
 * If all keys are cooling, waits for the soonest one to become available.
 * Returns { token, index } or null if no shared keys configured.
 */
const pickNextSharedKey = async (): Promise<{ token: string; index: number } | null> => {
  if (allKeys.length === 0) return null;
  const startIdx = globalKeyIndex;
  for (let attempt = 0; attempt < allKeys.length; attempt++) {
    const idx = (startIdx + attempt) % allKeys.length;
    const token = allKeys[idx];
    if (isKeyAvailable(token)) {
      // Advance global pointer so the NEXT call starts after this key
      globalKeyIndex = (idx + 1) % allKeys.length;
      return { token, index: idx };
    }
  }
  // All shared keys are cooling — find the one that comes back soonest
  let soonestToken = allKeys[0];
  let soonestIdx   = 0;
  let soonestTime  = keyCooldownUntil.get(allKeys[0].substring(0, 8)) ?? 0;
  for (let i = 1; i < allKeys.length; i++) {
    const t = keyCooldownUntil.get(allKeys[i].substring(0, 8)) ?? 0;
    if (t < soonestTime) { soonestTime = t; soonestToken = allKeys[i]; soonestIdx = i; }
  }
  // ✅ FIXED: Actually WAIT for the cooldown to expire before returning the key.
  // The old code returned the dead key immediately, causing the caller to fire
  // another instant 429 at the same key, wasting a retry slot.
  const waitMs = Math.max(0, soonestTime - Date.now());
  if (waitMs > 0) {
    console.warn(`[ZenAI] All ${allKeys.length} shared keys cooling. Waiting ${Math.ceil(waitMs / 1000)}s for key ...${soonestToken.substring(0, 8)} to recover.`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: `⏳ All keys cooling. Recovering in ${Math.ceil(waitMs / 1000)}s...` }
      }));
    }
    await sleep(waitMs + 500); // +500ms buffer to be safe
    keyCooldownUntil.delete(soonestToken.substring(0, 8)); // Clear its cooldown
  }
  return { token: soonestToken, index: soonestIdx };
};

/**
 * Core AI caller — redesigned for correct key load distribution:
 *
 * STRATEGY:
 *  1. Personal OAuth key first (if available)
 *  2. ONE shared key per request (true round-robin, no waterfall)
 *  3. If that key 429s → mark it cooling, pick next available key, one retry
 *  4. Max 3 key rotations per request (not 8)
 *  5. Model fallback: if model 404s or overloads, try next model in priority list
 *
 * PARALLEL AGENT SAFETY:
 *  - keyCooldownUntil is module-level → shared across all simultaneous callWithFallback calls
 *  - pickNextSharedKey() atomically advances globalKeyIndex → no two parallel calls grab the same key
 */
/**
 * PUBLIC: Full semaphore-protected API caller for top-level agent calls.
 * Acquires a global slot, runs the request, then releases the slot.
 * Use this for all orchestrator-level agent invocations.
 */
export const callWithFallback = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>
): Promise<any> => {
  // ✅ Acquire global semaphore — prevents thundering herd from parallel agents
  await acquireSemaphore();
  try {
    return await _callWithFallbackInner(buildRequest);
  } finally {
    releaseSemaphore();
  }
};

/**
 * PUBLIC: Semaphore-BYPASSED API caller for sub-agent delegation.
 *
 * ✅ CRITICAL FIX: When a top-level agent calls delegate_task, it already holds
 * a semaphore slot. If the sub-agent tries to acquire another slot via
 * callWithFallback, it may block indefinitely if the pool is full (3 slots).
 * A TITAN delegating to HERMES + CHRONOS would consume all 3 slots, hard-
 * blocking every other top-level agent.
 *
 * Sub-delegated calls must skip semaphore acquisition because the parent
 * agent's slot implicitly covers the sub-agent's work.
 */
export const callWithFallbackUnthrottled = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>
): Promise<any> => {
  return await _callWithFallbackInner(buildRequest);
};

// ── Startup Model Health Check ──────────────────────────────────────────────────────
// Proactively validates which models are actually available before any user
// request arrives. Preview models (e.g. flash-lite-preview) can be deprecated
// without notice. Models that fail the ping are removed from priority lists.
const _unavailableModels = new Set<string>();

export const getEffectivePriorityList = (isPersonal: boolean): string[] => {
  const base = isPersonal ? PERSONAL_MODEL_PRIORITY : SHARED_MODEL_PRIORITY;
  return base.filter(m => !_unavailableModels.has(m));
};

export const runModelHealthCheck = async (): Promise<void> => {
  if (allKeys.length === 0) return; // no keys to test with
  const testKey = allKeys[0];
  const allModels = Array.from(new Set([...SHARED_MODEL_PRIORITY, ...PERSONAL_MODEL_PRIORITY]));
  const testGenAI = new GoogleGenerativeAI(testKey);

  console.log('[ZenAI] 🤖 Running startup model health check...');
  await Promise.allSettled(allModels.map(async (modelId) => {
    try {
      const model = testGenAI.getGenerativeModel({ model: modelId });
      // Minimal ping: just ask for 1 token
      await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
      console.log(`[ZenAI] ✅ Model available: ${modelId}`);
    } catch (err: any) {
      if (isModelNotFound(err) || err?.message?.includes('deprecated')) {
        _unavailableModels.add(modelId);
        console.warn(`[ZenAI] ⚠️ Model unavailable (marked skip): ${modelId}`);
      }
      // Rate limits / overloads are transient — don't mark as unavailable
    }
  }));
  console.log(`[ZenAI] Health check done. Unavailable: [${[..._unavailableModels].join(', ') || 'none'}]`);
};

// Internal implementation — separated so semaphore wraps the entire execution
const _callWithFallbackInner = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>
): Promise<any> => {
  const personalKey = getActiveGeminiKey();

  if (!personalKey && allKeys.length === 0) {
    throw new Error('No Gemini API key found. Add your API key in Settings → AI Key.');
  }

  // Model priority list — uses health-check-filtered list so deprecated/unavailable
  // preview models (e.g. flash-lite-preview) are automatically excluded at startup.
  const isPersonalRequest = !!personalKey;
  const ordered = getEffectivePriorityList(isPersonalRequest);
  if (ordered.length === 0) {
    // All models marked unavailable — use full list as emergency fallback
    ordered.push(...(isPersonalRequest ? PERSONAL_MODEL_PRIORITY : SHARED_MODEL_PRIORITY));
  }

  let lastError: any;
  let hitQuota = false;

  for (let mi = 0; mi < ordered.length; mi++) {
    const modelName = ordered[mi];

    // ── Attempt 1: personal OAuth key (if valid) ──────────────────────────
    if (personalKey) {
      // Re-check at time of use — token may have expired
      const freshToken = getActiveGeminiKey();
      if (!freshToken) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent-log', {
            detail: { type: 'thinking', title: '🔄 Personal token expired. Using shared key pool...' }
          }));
        }
      } else {
        try {
          const genAI = new GoogleGenerativeAI('oauth_dummy_key');
          const result = await buildRequest(genAI, modelName);
          return result;
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || '').toLowerCase();

          if (msg.includes('personal_token_unavailable') || isAuthError(err)) {
            // Personal key failed — fall through to shared pool silently
          } else if (isModelNotFound(err)) {
            break; // this model doesn't exist → try next model
          } else if (isOverload(err)) {
            break; // overloaded → try next model
          } else if (!isRateLimit(err)) {
            throw err; // non-retryable
          }
          // 429 on personal key → fall through to shared key
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { type: 'thinking', title: `⚠️ Personal quota exceeded for ${modelName}. Using shared pool...` }
            }));
          }
          await sleep(1500);
        }
      }
    }

    // ── Attempt 2-N: shared key pool (true round-robin) ──
    // Max 2 key rotations per request — we must NOT exhaust all 8 keys per failed request.
    // With the global semaphore, only 3 agents run at once, so at most 6 key slots are used
    // per second rather than 24.
    const MAX_KEY_ROTATIONS = Math.min(2, Math.max(1, allKeys.length));
    let rotationsUsed = 0;

    while (rotationsUsed < MAX_KEY_ROTATIONS) {
      const keyObj = await pickNextSharedKey(); // ✅ Now async — properly awaits cooldowns
      if (!keyObj) break; // no shared keys configured

      // If all keys are cooling, pickNextSharedKey already waited.
      // No additional wait needed here — trust the semaphore + async pickNextSharedKey.

      try {
        const genAI  = new GoogleGenerativeAI(keyObj.token);
        const result = await buildRequest(genAI, modelName);
        return result; // ✅ success
      } catch (err: any) {
        lastError = err;

        if (isRateLimit(err)) {
          hitQuota = true;
          // ✅ Parse Retry-After header for exact cooldown duration from the API.
          // This is far more accurate than a hardcoded 62s guess.
          let retryAfterMs: number | undefined;
          try {
            // Gemini SDK wraps the response — try multiple known paths
            const retryAfterHeader =
              err?.response?.headers?.get?.('Retry-After') ||
              err?.message?.match(/retry[\s-]?after[:\s]*(\d+)/i)?.[1];
            if (retryAfterHeader) {
              retryAfterMs = parseInt(String(retryAfterHeader), 10) * 1000;
              console.log(`[ZenAI] Parsed Retry-After: ${Math.ceil(retryAfterMs / 1000)}s`);
            }
          } catch { /* ignore header parse errors */ }
          markKeyCooling(keyObj.token, err.message, retryAfterMs);
          rotationsUsed++;
          if (rotationsUsed < MAX_KEY_ROTATIONS) {
            // Small delay before trying next key — prevents thundering-herd
            const label = `shared key [${keyObj.index + 1}/${allKeys.length}]`;
            console.warn(`[ZenAI] ${label} 429 — rotating to next available key (${rotationsUsed}/${MAX_KEY_ROTATIONS})`);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('agent-log', {
                detail: { type: 'thinking', title: `↩ Key ${keyObj.index + 1} rate-limited. Trying next...` }
              }));
            }
            // Exponential backoff with jitter to prevent parallel agent thundering herds
            const baseDelay = 1500 * Math.pow(2, rotationsUsed);
            const jitter = Math.random() * 1000;
            const backoffMs = baseDelay + jitter;
            console.warn(`[ZenAI] Applying exponential backoff of ${Math.round(backoffMs)}ms before next key rotation.`);
            await sleep(backoffMs);
            continue;
          }
          break; // used all rotations → try next model
        }

        if (isModelNotFound(err)) break;  // model not available → try next model
        if (isOverload(err))    break;    // server overloaded → try next model
        if (isAuthError(err)) { rotationsUsed++; continue; } // invalid key → skip
        throw err; // non-retryable error
      }
    }

    // All key attempts for this model exhausted. Brief delay then try next model.
    if (mi < ordered.length - 1) {
      let delay = Math.min(1200 * (mi + 1), 4000);
      if (lastError) {
        const retryMatch = String(lastError.message).match(/retry[\s-]?after[:\s]*(\d+)/i);
        if (retryMatch?.[1]) delay = Math.min(parseInt(retryMatch[1], 10) * 1000, 8_000);
      }
      console.warn(`[ZenAI] ${modelName} exhausted. Trying ${ordered[mi + 1]} in ${delay}ms`);
      await sleep(delay);
    }
  }

  const finalMsg = String(lastError?.message || '').toLowerCase();
  if (finalMsg.includes('503') || finalMsg.includes('overload') || finalMsg.includes('high demand')) {
    throw new Error('AI is currently overloaded. Please try again in a moment.');
  }
  if (finalMsg.includes('401') || finalMsg.includes('invalid authentication') || finalMsg.includes('authentication credentials')) {
    if (personalKey) {
      setAuthExpired();
      throw new Error('Your Gemini OAuth session has expired. Please reconnect your Google account.');
    }
    throw new Error('Gemini API key is invalid. Please update VITE_GEMINI_API_KEY in your environment settings.');
  }

  // ── All models and keys exhausted ────────────────────────────────────────
  if (hitQuota) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: '⚠️ Rate limits hit. Please wait ~60s before retrying.' }
      }));
    }
    const coolingCount = [...keyCooldownUntil.values()].filter(t => t > Date.now()).length;
    throw new Error(
      coolingCount > 0
        ? `${coolingCount}/${allKeys.length} API key(s) are rate-limited. They auto-recover in ~60s. Add more keys in .env → VITE_GEMINI_API_KEY for higher throughput.`
        : 'AI quota reached. Add your own Gemini API key in Settings for uninterrupted access.'
    );
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
      const MAX_KEY_ROTATIONS = Math.min(3, allKeys.length || 1);
      let rotationsUsed = 0;

      while (rotationsUsed < MAX_KEY_ROTATIONS) {
        const keyObj = pickNextSharedKey();
        const keyToken = keyObj ? keyObj.token : (allKeys[0] || '');
        const keyIdx = keyObj ? keyObj.index : 0;

        if (keyObj && !isKeyAvailable(keyObj.token)) {
          const until  = keyCooldownUntil.get(keyObj.token.substring(0, 8)) ?? Date.now();
          const waitMs = Math.min(Math.max(0, until - Date.now()), 8_000);
          if (waitMs > 0) {
            console.warn(`[ZenAI Stream] Waiting ${Math.ceil(waitMs / 1000)}s for cooldown...`);
            await sleep(waitMs);
          }
        }

        try {
          if (mi !== this.modelIndex || keyIdx !== this.keyIndex || rotationsUsed > 0) {
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
          const isAuth = errMsg.includes('401') || errMsg.includes('invalid authentication') || errMsg.includes('authentication credentials');
          const isNotFound = errMsg.includes('404') || errMsg.includes('not found');
          const isRateLimit = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('resource_exhausted');
          const isOverload = errMsg.includes('503') || errMsg.includes('overload') || errMsg.includes('high demand');

          if (isAuth) {
            console.warn(`[ZenAI Stream] ${modelName} auth error (key ${keyIdx}), trying next key`);
            rotationsUsed++;
            continue;
          }

          if (isNotFound) {
            console.warn(`[ZenAI Stream] ${modelName} 404 not found, trying next model`);
            break;
          }

          if (errMsg.includes('first content should be with role') || errMsg.includes('role \'user\'')) {
            console.warn(`[ZenAI Stream] History role error, resetting to seed history`);
            try {
              this.session = await this.rebuildSession(modelName, keyIdx, this.seedHistory);
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
            break;
          }

          if (isRateLimit) {
            console.warn(`[ZenAI Stream] ${modelName} rate limited (key ${keyIdx + 1}/${allKeys.length})`);
            if (keyObj) {
              markKeyCooling(keyObj.token, err.message);
            }
            rotationsUsed++;
            if (rotationsUsed < MAX_KEY_ROTATIONS) {
              await sleep(400);
              continue;
            }
            break;
          }

          if (isOverload) {
            console.warn(`[ZenAI Stream] ${modelName} overloaded, trying next model`);
            await sleep(400);
            break;
          }

          throw new Error(err.message || 'AI failed to respond. Please try again.');
        }
      }
    }
    throw lastError || new Error('All models exhausted in stream.');
  }

  async sendMessage(msg: string) {
    let lastError: any;
    for (let mi = this.modelIndex; mi < MODEL_PRIORITY.length; mi++) {
      const modelName = MODEL_PRIORITY[mi];
      const MAX_KEY_ROTATIONS = Math.min(3, allKeys.length || 1);
      let rotationsUsed = 0;

      while (rotationsUsed < MAX_KEY_ROTATIONS) {
        const keyObj = pickNextSharedKey();
        const keyToken = keyObj ? keyObj.token : (allKeys[0] || '');
        const keyIdx = keyObj ? keyObj.index : 0;

        if (keyObj && !isKeyAvailable(keyObj.token)) {
          const until  = keyCooldownUntil.get(keyObj.token.substring(0, 8)) ?? Date.now();
          const waitMs = Math.min(Math.max(0, until - Date.now()), 8_000);
          if (waitMs > 0) {
            console.warn(`[ZenAI Chat] Waiting ${Math.ceil(waitMs / 1000)}s for cooldown...`);
            await sleep(waitMs);
          }
        }

        try {
          if (mi !== this.modelIndex || keyIdx !== this.keyIndex || rotationsUsed > 0) {
            const history = await this.getHistory();
            this.session = await this.rebuildSession(modelName, keyIdx, history);
            this.modelName = modelName;
            this.modelIndex = mi;
            this.keyIndex = keyIdx;
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
          const isRateLimit  = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('resource_exhausted');
          const isOverload   = errMsg.includes('503') || errMsg.includes('overload') || errMsg.includes('high demand');
          const isHistoryBad = errMsg.includes('first content should be with role') || errMsg.includes('role \'user\'');

          if (isAuth) {
            console.warn(`[ZenAI Chat] ${modelName} auth error (key ${keyIdx}), trying next key`);
            rotationsUsed++;
            continue;
          }

          if (isNotFound) {
            console.warn(`[ZenAI Chat] ${modelName} 404 not found, trying next model`);
            break;
          }

          if (isHistoryBad) {
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
            console.warn(`[ZenAI Chat] ${modelName} rate limited (key ${keyIdx + 1}/${allKeys.length})`);
            if (keyObj) {
              markKeyCooling(keyObj.token, err.message);
            }
            rotationsUsed++;
            if (rotationsUsed < MAX_KEY_ROTATIONS) {
              await sleep(400);
              continue;
            }
            break;
          }

          if (isOverload) {
            console.warn(`[ZenAI Chat] ${modelName} overloaded, trying next model`);
            await sleep(400);
            break;
          }

          throw new Error(err.message || 'AI failed to respond. Please try again.');
        }
      }
    }

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
      
      // If we reach the end and stack is not empty, the JSON was truncated.
      // Repair it by closing any open strings and brackets.
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

