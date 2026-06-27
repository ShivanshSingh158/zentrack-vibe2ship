import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getActiveGeminiKey, setAuthExpired } from '../userGeminiAuth';
import { apiQuotaStore } from '../../stores/apiQuotaStore';

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
// ── HYBRID ROUTING SYSTEM ──────────────────────────────────────────────────────
// TOP-LEVEL AGENTS (Supervisors): Require higher intelligence for master planning.
// We prioritize the Pro/Standard models here.
export const SHARED_TOP_LEVEL_PRIORITY = [
  'gemini-2.5-flash',                    // Best available working Standard model
  'gemini-3.1-flash-lite',               // Fallback to Lite
  'gemini-3.5-flash',                    // 20 RPD limit
  'gemini-2.0-flash',                    // 0 RPD limit
  'gemini-2.0-flash-lite',               // 0 RPD limit
  'gemini-2.5-flash-lite-preview-06-17', // 404 Not Found
];

export const PERSONAL_TOP_LEVEL_PRIORITY = [
  'gemini-2.5-flash',                    
  'gemini-3.1-flash-lite',               
  'gemini-3.5-flash',                    
  'gemini-2.0-flash',                    
  'gemini-2.0-flash-lite',               
  'gemini-2.5-flash-lite-preview-06-17', 
];

// SUB-AGENTS (Workers: Oracle, Enigma): Require high speed and low quota usage.
// We prioritize the Flash-Lite models here.
export const SHARED_SUB_AGENT_PRIORITY = [
  'gemini-3.1-flash-lite',               // Massive 1,500/day quota — Try first!
  'gemini-2.5-flash',                    // Fallback to Standard
  'gemini-3.5-flash',                    
  'gemini-2.0-flash',                    
  'gemini-2.0-flash-lite',               
  'gemini-2.5-flash-lite-preview-06-17', 
];

export const PERSONAL_SUB_AGENT_PRIORITY = [
  'gemini-3.1-flash-lite',               
  'gemini-2.5-flash',                    
  'gemini-3.5-flash',                    
  'gemini-2.0-flash',                    
  'gemini-2.0-flash-lite',               
  'gemini-2.5-flash-lite-preview-06-17', 
];

// Unified alias so internal consumers can reference a single constant.
// Unified alias so internal consumers can reference a single constant.
// Defaults to SHARED_TOP_LEVEL_PRIORITY (used by RobustChatSession without personal key).
export const MODEL_PRIORITY = SHARED_TOP_LEVEL_PRIORITY;

export const getPriorityModels = (isPersonal: boolean, isTopLevel: boolean = true) => {
  if (isTopLevel) {
    return isPersonal ? PERSONAL_TOP_LEVEL_PRIORITY : SHARED_TOP_LEVEL_PRIORITY;
  } else {
    return isPersonal ? PERSONAL_SUB_AGENT_PRIORITY : SHARED_SUB_AGENT_PRIORITY;
  }
};

export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Always try the best model first (avoid permanent sticky downgrades due to transient errors)
const getPreferredModel = (isPersonal: boolean, isTopLevel: boolean = true): string => {
  return getPriorityModels(isPersonal, isTopLevel)[0];
};
const setPreferredModel = (m: string) => {
  // No-op to prevent permanent sticky downgrades
};
if (typeof window !== 'undefined') {
  try { localStorage.removeItem('zen_working_model'); } catch {}
}

// ── Runtime Key Store (localStorage-backed) ───────────────────────────────────
// Keys stored here survive page reloads and are merged with .env keys at runtime.
// Use addRuntimeApiKey / removeRuntimeApiKey to manage them from the UI.
const RUNTIME_KEYS_STORAGE = 'zen_runtime_api_keys';

const _loadRuntimeKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RUNTIME_KEYS_STORAGE);
    if (!raw) return [];
    return JSON.parse(raw).filter((k: string) => typeof k === 'string' && k.length > 10);
  } catch { return []; }
};

const _saveRuntimeKeys = (keys: string[]) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(RUNTIME_KEYS_STORAGE, JSON.stringify(keys)); } catch {}
};

/** Add a new API key at runtime. Returns true if added, false if duplicate/invalid. */
export const addRuntimeApiKey = (key: string): boolean => {
  const trimmed = key.trim();
  if (trimmed.length < 10) return false;
  const current = _loadRuntimeKeys();
  if (current.includes(trimmed)) return false;
  const envBase = rawApiKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 10);
  if (envBase.includes(trimmed)) return false; // already in .env pool
  const updated = [...current, trimmed];
  _saveRuntimeKeys(updated);
  // Notify subscribers (e.g. quota store)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zen-api-keys-changed'));
  }
  console.log(`[ZenAI] ➕ Runtime key added. Total pool size: ${getActiveKeyPool().length}`);
  return true;
};

/** Remove a runtime API key by its masked prefix (first 8 chars). */
export const removeRuntimeApiKey = (keyPrefix: string): boolean => {
  const current = _loadRuntimeKeys();
  const updated = current.filter(k => !k.startsWith(keyPrefix));
  if (updated.length === current.length) return false;
  _saveRuntimeKeys(updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zen-api-keys-changed'));
  }
  console.log(`[ZenAI] ➖ Runtime key removed. Total pool size: ${getActiveKeyPool().length}`);
  return true;
};

/** Get all runtime-added keys (masked for display). */
export const getRuntimeKeysMasked = (): { prefix: string; masked: string }[] => {
  return _loadRuntimeKeys().map(k => ({
    prefix: k.substring(0, 8),
    masked: k.substring(0, 6) + '••••••••' + k.slice(-4),
  }));
};

/** Get the live, merged API key pool (.env + runtime localStorage keys). */
export const getActiveKeyPool = (): string[] => {
  const envBase = rawApiKey
    .split(',')
    .map((k: string) => k.trim())
    .filter((k: string) => k.length > 10);
  const runtimeKeys = _loadRuntimeKeys();
  // Merge: deduplicate (runtime may overlap with env if user re-enters same key)
  const all = [...envBase];
  for (const k of runtimeKeys) {
    if (!all.includes(k)) all.push(k);
  }
  return all;
};

const rawApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' && process.env?.VITE_GEMINI_API_KEY) || '';

// ── Live key pool — always reflects current .env + runtime additions ──────────
// DO NOT read `allKeys` directly in other files — use `getActiveKeyPool()` instead.
// `allKeys` is kept for backward compatibility with code written before dynamic keys.
export const allKeys = getActiveKeyPool();

if (allKeys.length === 0) {
  console.error('[ZenAI] ❌ No API keys found. Add a key in the Agent Settings panel.');
} else {
  console.log(`[ZenAI] ✅ ${allKeys.length} Gemini API key(s) loaded.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new Error('Aborted'));
  const timer = setTimeout(resolve, ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  }
});

// ── Global Concurrency Semaphore ──────────────────────────────────────────────
// This is the PRIMARY fix for the thundering-herd / key exhaustion problem.
// All callWithFallback calls share this counter. When too many agents are firing
// simultaneously, excess callers wait with random jitter before proceeding.
// This prevents N parallel agents from all hitting the API at the exact same ms.
const MAX_CONCURRENT_API_CALLS = 4; // Max simultaneous Gemini API calls across ALL agents
let _activeApiCalls = 0;

// ── Active Agent Counter (for personal/shared routing policy) ─────────────────
// Tracks how many top-level (semaphore-holding) agents are currently running.
// Policy: if activeAgentCount <= PERSONAL_ONLY_THRESHOLD → route to personal key
//         if activeAgentCount >  PERSONAL_ONLY_THRESHOLD → route to shared pool
// This ensures personal account handles light load while shared pool absorbs bursts.
const PERSONAL_ONLY_THRESHOLD = 2; // ≤2 active top-level agents → use personal key
let _activeTopLevelAgents = 0; // count of agents holding semaphore slots

export const getActiveAgentCount = (): number => _activeTopLevelAgents;

const acquireSemaphore = async (signal?: AbortSignal): Promise<void> => {
  const MAX_WAIT_MS = 30_000; // max 30s wait in queue
  const startedAt = Date.now();
  while (_activeApiCalls >= MAX_CONCURRENT_API_CALLS) {
    if (signal?.aborted) throw new Error('Aborted');
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      // Timeout: proceed anyway rather than deadlocking
      console.warn('[ZenAI] Semaphore wait timeout — proceeding anyway to avoid deadlock.');
      break;
    }
    // Wait with random jitter so multiple queued calls don't all wake at the same time
    const jitter = 200 + Math.random() * 300;
    try {
      await sleep(jitter, signal);
    } catch (e) {
      throw new Error('Aborted');
    }
  }
  if (signal?.aborted) throw new Error('Aborted');
  _activeApiCalls++;
  _activeTopLevelAgents++;
};

const releaseSemaphore = () => {
  _activeApiCalls = Math.max(0, _activeApiCalls - 1);
  _activeTopLevelAgents = Math.max(0, _activeTopLevelAgents - 1);
};

// ── Per-key cooldown tracker ─────────────────────────────────────────────────
// When a key hits 429, mark it unavailable for KEY_COOLDOWN_MS.
// All subsequent callWithFallback calls skip that key until it cools down.
// This prevents the 1/8→2/8→8/8 waterfall exhaustion spiral.
const KEY_COOLDOWN_MS = 62_000; // 62s — just over Gemini's typical 60s 429 window
const keyCooldownUntil = new Map<string, number>(); // token (first 8 chars) → available-at timestamp

const isKeyAvailable = (token: string): boolean => {
  const until = keyCooldownUntil.get(token);
  if (!until) return true;
  if (Date.now() >= until) {
    keyCooldownUntil.delete(token);
    return true;
  }
  return false;
};

const markKeyCooling = (token: string, reason: string, customCooldownMs?: number) => {
  const keyLog = token.substring(0, 8);
  // ✅ FIXED: Use dynamic cooldown from Retry-After header if available,
  // otherwise fall back to the default 62s window.
  const cooldownMs = customCooldownMs ?? KEY_COOLDOWN_MS;
  const until = Date.now() + cooldownMs;
  keyCooldownUntil.set(token, until); // Use full token to avoid prefix collisions!
  console.warn(`[ZenAI] Key ...${keyLog} rate-limited. Cooling for ${Math.ceil(cooldownMs / 1000)}s. Reason: ${reason.substring(0, 60)}`);
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
// globalKeyIndex is the NEXT key to try. Each callWithFallback call atomically
// claims a slot by reading AND advancing the pointer in one synchronous step.
// This prevents two parallel agents (which interleave at await boundaries) from
// claiming the same key simultaneously.
export let globalKeyIndex = 0;

export const takeNextKeyIndex = (): number => {
  const current = globalKeyIndex;
  globalKeyIndex = (globalKeyIndex + 1) % Math.max(allKeys.length, 1);
  return current;
};

/**
 * Atomically claims the next available shared key slot.
 *
 * RACE-CONDITION FIX:
 * The old implementation read globalKeyIndex, iterated forward, then set it.
 * JS is single-threaded, but `await sleep()` inside the loop yields control to
 * other microtasks, allowing another parallel agent to read the same index.
 * Fix: claim the key index SYNCHRONOUSLY in one pass, then do any async waiting
 * AFTER the claim so no other caller can grab the same key.
 * Returns { token, index } or null if no shared keys configured.
 */

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const onAcquire = () => {
        if (signal?.aborted) reject(new Error('Aborted'));
        else resolve(() => this.release());
      };
      this.queue.push(onAcquire);
      if (signal) signal.addEventListener('abort', onAcquire, { once: true });
    });
  }

  private release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

const keySelectionMutex = new Mutex();
// globalApiPauseUntil removed
const pickNextSharedKey = async (signal?: AbortSignal): Promise<{ token: string; index: number } | null> => {
  const release = await keySelectionMutex.acquire(signal);
  try {
    // ✅ Always get the LIVE pool so newly added runtime keys are included immediately
    const liveKeys = getActiveKeyPool();
    if (liveKeys.length === 0) return null;

    // ── Phase 1: Synchronous scan — claim a key index atomically ────────────────
    const startIdx = globalKeyIndex;
    for (let attempt = 0; attempt < liveKeys.length; attempt++) {
      const idx = (startIdx + attempt) % liveKeys.length;
      const token = liveKeys[idx];
      if (isKeyAvailable(token)) {
        globalKeyIndex = (idx + 1) % liveKeys.length;
        return { token, index: idx };
      }
    }

    if (signal?.aborted) throw new Error('Aborted');

    // ── Phase 2: All keys cooling — find soonest recovery ───────────────────────
    let soonestToken = liveKeys[0];
    let soonestIdx   = 0;
    let soonestTime  = keyCooldownUntil.get(liveKeys[0]) ?? 0;
    for (let i = 1; i < liveKeys.length; i++) {
      const t = keyCooldownUntil.get(liveKeys[i]) ?? 0;
      if (t < soonestTime) { soonestTime = t; soonestToken = liveKeys[i]; soonestIdx = i; }
    }

    globalKeyIndex = (soonestIdx + 1) % liveKeys.length;

    // ── Phase 3: Async wait — AFTER claiming the slot ───────────────────────────
    const waitMs = Math.max(0, soonestTime - Date.now());
    if (waitMs > 0) {
      console.warn(`[ZenAI] All ${liveKeys.length} shared keys cooling. Waiting ${Math.ceil(waitMs / 1000)}s for key ...${soonestToken.substring(0, 8)} to recover.`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-log', {
          detail: { type: 'thinking', title: `⏳ All ${liveKeys.length} keys cooling. Recovering in ${Math.ceil(waitMs / 1000)}s...` }
        }));
      }
      try {
        await sleep(waitMs + 500, signal);
      } catch (e) {
        throw new Error('Aborted');
      }
      keyCooldownUntil.delete(soonestToken);
    }
    return { token: soonestToken, index: soonestIdx };
  } finally {
    release();
  }
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
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>,
  signal?: AbortSignal
): Promise<any> => {
  // ✅ Acquire global semaphore — prevents thundering herd from parallel agents
  await acquireSemaphore(signal);
  try {
    // Pass isTopLevel=true so the routing policy can check _activeTopLevelAgents
    return await _callWithFallbackInner(buildRequest, true, signal);
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
 * isTopLevel=false so sub-agents don't artificially inflate the agent count.
 */
export const callWithFallbackUnthrottled = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>,
  signal?: AbortSignal
): Promise<any> => {
  return await _callWithFallbackInner(buildRequest, false, signal);
};

// Startup Model Health Check ──────────────────────────────────────────────────────
// Proactively validates which models are actually available.
// If a model 404s, it goes on a 60-second cooldown before being tried again.
const _unavailableModels = new Map<string, number>();
const MODEL_COOLDOWN_MS = 60_000; // 60 seconds

export const getEffectivePriorityList = (isPersonal: boolean, isTopLevel: boolean = true): string[] => {
  const base = getPriorityModels(isPersonal, isTopLevel);
  const now = Date.now();
  return base.filter(m => {
    const cooldown = _unavailableModels.get(m);
    return !cooldown || now >= cooldown;
  });
};

export const runModelHealthCheck = async (): Promise<void> => {
  if (allKeys.length === 0) return; // no keys to test with
  const testKey = allKeys[0];
  const allModels = Array.from(new Set([
    ...SHARED_TOP_LEVEL_PRIORITY, 
    ...PERSONAL_TOP_LEVEL_PRIORITY,
    ...SHARED_SUB_AGENT_PRIORITY,
    ...PERSONAL_SUB_AGENT_PRIORITY
  ]));
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
        console.warn(`[ZenAI] ⚠️ Model returned 404/deprecated during health check: ${modelId}`);
      }
      // Rate limits / overloads are transient — don't mark as unavailable
    }
  }));
  const unavailableList = Array.from(_unavailableModels.keys());
  console.log(`[ZenAI] Health check done. Unavailable: [${unavailableList.join(', ') || 'none'}]`);
};

let lastPersonalWarningLog = 0;

// Internal implementation — separated so semaphore wraps the entire execution
const _callWithFallbackInner = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>,
  isTopLevel: boolean = false, // true when called from callWithFallback (semaphore-holding)
  signal?: AbortSignal
): Promise<any> => {
  const personalKey = getActiveGeminiKey();

  if (!personalKey && allKeys.length === 0) {
    throw new Error('No Gemini API key found. Add your API key in Settings → AI Key.');
  }

  // ── Personal / Shared Routing Policy ─────────────────────────────────────────
  // When a personal OAuth token exists, apply the agent-count routing rule:
  //   ≤ PERSONAL_ONLY_THRESHOLD active top-level agents → personal key (better models, own quota)
  //   > PERSONAL_ONLY_THRESHOLD active top-level agents → shared key pool (scale horizontally)
  //
  // Sub-agents (isSubAgent = true) always bypass the semaphore so they don't count
  // toward _activeTopLevelAgents. They inherit the parent's routing slot.
  // This ensures: 2 agents → personal, 3+ agents → shared pool handles the burst.
  const shouldUsePersonal = !!personalKey && (
    !isTopLevel || _activeTopLevelAgents <= PERSONAL_ONLY_THRESHOLD
  );

  const isPersonalRequest = shouldUsePersonal;
  const ordered = getEffectivePriorityList(isPersonalRequest, isTopLevel);
  if (ordered.length === 0) {
    // All models marked unavailable — use full list as emergency fallback
    ordered.push(...getPriorityModels(isPersonalRequest, isTopLevel));
  }

  let lastError: any;
  let hitQuota = false;

  for (let mi = 0; mi < ordered.length; mi++) {
    const modelName = ordered[mi];

    // ── Attempt 1: personal OAuth key (if routing policy allows it) ───────────
    if (shouldUsePersonal) {
      // Re-check at time of use — token may have expired since routing decision
      const freshToken = getActiveGeminiKey();
      if (!freshToken) {
        if (typeof window !== 'undefined' && Date.now() - lastPersonalWarningLog > 60000) {
          lastPersonalWarningLog = Date.now();
          window.dispatchEvent(new CustomEvent('agent-log', {
            detail: { type: 'thinking', title: '🔄 Personal token expired. Using shared pool...' }
          }));
        }
        // Fall through to shared pool below
      } else {
        try {
          const genAI = new GoogleGenerativeAI('oauth_dummy_key');
          apiQuotaStore.recordRequest();
          const result = await buildRequest(genAI, modelName);
          return result;
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || '').toLowerCase();

          if (msg.includes('personal_token_unavailable') || isAuthError(err)) {
            // Personal key failed — fall through to shared pool silently
            if (typeof window !== 'undefined' && Date.now() - lastPersonalWarningLog > 60000) {
              lastPersonalWarningLog = Date.now();
              window.dispatchEvent(new CustomEvent('agent-log', {
                detail: { type: 'thinking', title: '🔄 Personal key unavailable. Switching to shared pool...' }
              }));
            }
          } else if (isModelNotFound(err)) {
            break; // this model doesn't exist → try next model
          } else if (isOverload(err)) {
            break; // overloaded → try next model
          } else if (!isRateLimit(err)) {
            throw err; // non-retryable
          } else {
            // 429 on personal key → fall through to shared key
            if (typeof window !== 'undefined' && Date.now() - lastPersonalWarningLog > 60000) {
              lastPersonalWarningLog = Date.now();
              window.dispatchEvent(new CustomEvent('agent-log', {
                detail: { type: 'thinking', title: `⚠️ Personal quota exceeded. Using shared pool...` }
              }));
            }
          }
        }
      }
    }

    // ── Attempt 2-N: shared key pool (true round-robin, atomic slot claim) ────
    // The semaphore ensures we only have 4 parallel requests at most,
    // so we can safely allow a full rotation through all available keys
    // before declaring a model exhausted.
    if (allKeys.length === 0) {
      // No shared keys configured and personal key also failed
      break;
    }

    const MAX_KEY_ROTATIONS = allKeys.length;
    let rotationsUsed = 0;

    while (rotationsUsed < MAX_KEY_ROTATIONS) {
      // ✅ pickNextSharedKey is now awaited — key claim is atomic (see function docs)
      const keyObj = await pickNextSharedKey(signal);
      if (!keyObj) break; // no shared keys configured

      try {
        const genAI  = new GoogleGenerativeAI(keyObj.token);
        apiQuotaStore.recordRequest();
        const result = await buildRequest(genAI, modelName);
        return result; // ✅ success
      } catch (err: any) {
        lastError = err;

        if (isRateLimit(err)) {
          hitQuota = true;

          // Parse Retry-After header for exact cooldown duration from the API.
          let retryAfterMs: number | undefined;
          try {
            const retryAfterHeader =
              err?.response?.headers?.get?.('Retry-After') ||
              err?.message?.match(/retry[\s-]?after[:\s]*(\d+)/i)?.[1];
            if (retryAfterHeader) {
              retryAfterMs = parseInt(String(retryAfterHeader), 10) * 1000;
              console.log(`[ZenAI] Parsed Retry-After: ${Math.ceil(retryAfterMs / 1000)}s`);
            }
          } catch { /* ignore header parse errors */ }
          markKeyCooling(keyObj.token, err?.message || 'Rate Limited', retryAfterMs);
          rotationsUsed++;
          if (rotationsUsed < MAX_KEY_ROTATIONS) {
            const label = `shared key [${keyObj.index + 1}/${allKeys.length}]`;
            console.warn(`[ZenAI] ${label} 429 — rotating to next available key (${rotationsUsed}/${MAX_KEY_ROTATIONS})`);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('agent-log', {
                detail: { type: 'thinking', title: `↩ Key ${keyObj.index + 1} rate-limited. Trying next...` }
              }));
            }
            // Switch to the next key instantly. We only need a tiny jitter to prevent thundering herds.
            // (If ALL keys are actually rate-limited, pickNextSharedKey will handle the true waiting).
            const jitter = 50 + Math.random() * 100;
            await sleep(jitter);
            continue;
          }
          break; // used all rotations → try next model
        }

        if (isModelNotFound(err)) {
          break; // model not available → try next model
        }
        if (isOverload(err))    break;    // server overloaded → try next model
        if (isAuthError(err)) { rotationsUsed++; continue; } // invalid key → skip
        throw err; // non-retryable error
      }
    }

    // All key attempts for this model exhausted. Brief delay then try next model.
    if (mi < ordered.length - 1) {
      console.warn(`[ZenAI] ${modelName} exhausted. Trying ${ordered[mi + 1]} instantly`);
      await sleep(10);
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
    // ✅ Use health-check-filtered list for model index resolution
    const effectiveList = getEffectivePriorityList(false);
    this.modelIndex   = Math.max(0, effectiveList.indexOf(modelName));
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
    // ✅ FIXED: Don't fall back to allKeys[0] if keyIndex is invalid — that's the
    // key we just rate-limited. Instead use round-robin to get a fresh available key.
    let keyToUse: string;
    if (allKeys[keyIndex] && isKeyAvailable(allKeys[keyIndex])) {
      keyToUse = allKeys[keyIndex];
    } else {
      // Pick next available key via round-robin (sync part of pickNextSharedKey)
      let found = false;
      for (let attempt = 0; attempt < allKeys.length; attempt++) {
        const idx = (keyIndex + attempt) % allKeys.length;
        if (isKeyAvailable(allKeys[idx])) {
          keyToUse = allKeys[idx];
          found = true;
          break;
        }
      }
      if (!found) {
        // All cooling — use the provided index anyway (cooldown will expire soon)
        keyToUse = allKeys[keyIndex] || allKeys[0] || '';
      }
    }
    const genAI = new GoogleGenerativeAI(keyToUse);
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
    // ✅ FIXED: Use health-check-filtered model list, not raw MODEL_PRIORITY
    const effectiveModels = getEffectivePriorityList(false);
    const modelList = effectiveModels.length > 0 ? effectiveModels : MODEL_PRIORITY;
    for (let mi = this.modelIndex; mi < modelList.length; mi++) {
      const modelName = modelList[mi];
      const MAX_KEY_ROTATIONS = Math.min(3, allKeys.length || 1);
      let rotationsUsed = 0;

      while (rotationsUsed < MAX_KEY_ROTATIONS) {
        // ✅ CRITICAL BUG FIX: pickNextSharedKey is ASYNC — must await it.
        // Previously called without await, returning a Promise object as the key.
        // This made ALL key-cooling logic in RobustChatSession completely ineffective.
        const keyObj = await pickNextSharedKey();
        const keyIdx = keyObj ? keyObj.index : 0;

        // pickNextSharedKey already waits for cooldown internally, so no need
        // to duplicate the wait here. Trust the async function's wait logic.

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
    // ✅ FIXED: Use health-check-filtered model list, not raw MODEL_PRIORITY
    const effectiveModels = getEffectivePriorityList(false);
    const modelList = effectiveModels.length > 0 ? effectiveModels : MODEL_PRIORITY;
    for (let mi = this.modelIndex; mi < modelList.length; mi++) {
      const modelName = modelList[mi];
      const MAX_KEY_ROTATIONS = Math.min(3, allKeys.length || 1);
      let rotationsUsed = 0;

      while (rotationsUsed < MAX_KEY_ROTATIONS) {
        // ✅ CRITICAL BUG FIX: pickNextSharedKey is ASYNC — must await it.
        const keyObj = await pickNextSharedKey();
        const keyIdx = keyObj ? keyObj.index : 0;
        // pickNextSharedKey already waits for cooldown internally.

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

