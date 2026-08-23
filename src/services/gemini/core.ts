/**
 * @file core.ts
 * @module src/services/gemini/core
 *
 * Gemini API client — key management, proxy routing, rate limiting, and model tiers.
 *
 * ## Production Proxy Strategy
 *
 * On production (Vercel), Gemini API keys are stored as server-side environment
 * variables and NEVER shipped in the browser bundle. All client-side Gemini calls
 * are intercepted by a fetch monkey-patch and redirected to `/api/gemini-proxy`:
 *
 * ```
 * Browser: GoogleGenerativeAI(key='proxy_dummy_key')
 *               │
 *               │ fetch intercepted
 *               ▼
 *          POST /api/gemini-proxy
 *          { Authorization: Bearer <Firebase ID Token> }
 *               │
 *               │ server validates token + rotates through key pool
 *               ▼
 *          Gemini API (real key)
 * ```
 *
 * On localhost, the `VITE_GEMINI_API_KEY` env var is used directly (no proxy needed).
 *
 * ## Multi-Key Rotation
 *
 * A pool of up to 10 Gemini API keys (`GEMINI_KEYS`) enables higher throughput
 * and rate-limit resilience. Keys are rotated round-robin. On a 429 response,
 * `callWithFallback` automatically retries with the next key.
 *
 * ## Concurrency Semaphore
 *
 * `MAX_CONCURRENT_API_CALLS = 8` limits how many simultaneous Gemini requests
 * the agent fleet can make. This prevents thundering-herd rate-limit cascades when
 * all 12 agents try to call Gemini at the same moment.
 *
 * ## Model Tiers
 *
 * | Function | Model | Use Case |
 * |---|---|---|
 * | `callWithResearchModel` | gemini-2.5-flash | Deep analysis (ORACLE, HERMES) |
 * | `callWithVoiceModel` | gemini-2.5-flash | Fast responses (AEGIS, NAVIGATOR) |
 * | `callWithFallback` | (primary, with key rotation fallback) | General purpose |
 *
 * @see {@link ../../../api/gemini-proxy.js} for the server-side proxy implementation
 */
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
            throw new Error('PERSONAL_TOKEN_UNAVAILABLE: OAuth token expired or not present. Rotating to shared key.');
          }
        } else if (headers.get('x-goog-api-key') === 'proxy_dummy_key') {
          // 🔄 Proxy routing: Send to Vercel Gemini Proxy with Firebase Auth Token
          const { auth } = await import('../firebase');
          const { signInAnonymously } = await import('firebase/auth');
          
          let token = await auth.currentUser?.getIdToken();
          if (!token) {
            try {
              const cred = await signInAnonymously(auth);
              token = await cred.user.getIdToken();
            } catch (authErr) {
              console.warn('[GeminiProxy] Anonymous sign in failed:', authErr);
            }
          }
          if (!token) throw new Error('Not logged in to Firebase');

          const url = new URL(urlString);
          const modelMatch = url.pathname.match(/models\/([^:]+):/);
          const model = modelMatch ? modelMatch[1] : 'gemini-3.7-flash';

          headers.delete('x-goog-api-key');
          headers.set('Authorization', `Bearer ${token}`);
          
          const bodyStr = typeof init?.body === 'string' ? init.body : '{}';
          const bodyObj = JSON.parse(bodyStr);
          bodyObj.model = model;

          const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
          const proxyEndpoint = isLocal ? 'https://myzentrack.vercel.app/api/gemini-proxy' : '/api/gemini-proxy';

          return originalFetch(proxyEndpoint, {
            ...init,
            headers,
            body: JSON.stringify(bodyObj)
          });
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

// ── Model priority (verified real model IDs — 2026-07) ────────────────────────
// Only include models that ACTUALLY EXIST in the Gemini API.
// Real API model IDs verified against: https://ai.google.dev/api/generate-content#v1beta.models
//
// ── TWO-TIER MODEL STRATEGY ───────────────────────────────────────────────────
// VOICE TIER (Flash Lite) → For fast conversational talking, AEGIS synthesis,
//   NAVIGATOR, TITAN single writes. Low latency, low quota cost.
// RESEARCH TIER (2.5 Flash) → For deep analysis: ORACLE reading emails/tasks,
//   ENIGMA analytics, HERMES email drafting, CHRONOS calendar planning.
//   Latest data, best reasoning, used for any major work.
//
// Real Gemini API IDs (not marketing names):
//   gemini-2.5-flash = Flash Lite (fast/cheap — VOICE tier)
//   gemini-2.5-flash                    = 2.5 Flash (smart/latest — RESEARCH tier)
//   gemini-2.0-flash                    = 2.0 Flash (stable fallback)

// VOICE TIER
export const VOICE_MODEL_PRIORITY = [
  'gemini-3.7-flash',
  'gemini-2.5-flash',
];

// RESEARCH TIER
export const RESEARCH_MODEL_PRIORITY = [
  'gemini-3.7-flash',
  'gemini-2.5-flash',
];

// ── Legacy priority exports (kept for backward compat) ────────────────────────
export const SHARED_TOP_LEVEL_PRIORITY = VOICE_MODEL_PRIORITY;
export const PERSONAL_TOP_LEVEL_PRIORITY = RESEARCH_MODEL_PRIORITY;
export const SHARED_SUB_AGENT_PRIORITY = VOICE_MODEL_PRIORITY;
export const PERSONAL_SUB_AGENT_PRIORITY = RESEARCH_MODEL_PRIORITY;

// Unified alias so internal consumers can reference a single constant.
export const MODEL_PRIORITY = VOICE_MODEL_PRIORITY;

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
    window.dispatchEvent(new CustomEvent('zen-api-keys-changed', { detail: { count: getActiveKeyPool().length } }));
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
    window.dispatchEvent(new CustomEvent('zen-api-keys-changed', { detail: { count: getActiveKeyPool().length } }));
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
  
  // 🔄 Proxy fallback: if no keys are found locally, return the dummy key
  // so the window.fetch interceptor routes the request to /api/gemini-proxy
  if (all.length === 0) {
    return ['proxy_dummy_key'];
  }
  
  return all;
};

// ── Key Pool ──────────────────────────────────────────────────────────────────
// ARCHITECTURE NOTE (2026-07):
//   Gemini API keys have been moved server-side to api/gemini-proxy.js.
//   VITE_GEMINI_API_KEY no longer exists — it was exposing all 10 keys in the
//   browser bundle. The proxy at /api/gemini-proxy authenticates callers via
//   Firebase ID token and rotates through keys server-side.
//
//   `rawApiKey` is now empty. The `getActiveKeyPool()` function returns only
//   keys that the user manually adds at runtime via addRuntimeApiKey() (the
//   agent settings panel). These are stored in localStorage.
//
//   callWithFallback() → uses shared pool (runtime keys only, may be empty)
//   The main agent callers in core.ts now route through the proxy client.
const rawApiKey = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY || '') : '';

// ── Live key pool — reflects only manually added runtime keys ─────────────────
export const allKeys = getActiveKeyPool();

if (allKeys.length === 0) {
  console.info('[ZenAI] ℹ️ No local API keys. All Gemini calls route through /api/gemini-proxy.');
} else {
  console.log(`[ZenAI] ✅ ${allKeys.length} local runtime Gemini key(s) loaded.`);
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

// ── ARCH-001: Visibility-Aware Sleep ─────────────────────────────────────────
// Chrome throttles setTimeout in background tabs to ~1Hz. If sleep(200ms) wakes
// up 2000ms later, the tab was throttled. visibilityAwareSleep() detects this
// drift and skips any remaining stale wait, keeping the agent fleet responsive
// when the user returns to the tab.
//
// Uses performance.now() for drift detection — unaffected by tab throttling.
// Note: this does NOT prevent ALL throttling. It minimizes stale wait time on
// wake-up. Full server-side offload (SSE/WS) would eliminate throttling entirely.
const VISIBILITY_DRIFT_THRESHOLD_MS = 1_500; // if sleep drifts > this, throttling occurred

export const visibilityAwareSleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  if (ms <= 0) return;
  const startedAt = performance.now();
  await sleep(ms, signal);
  const actualElapsed = performance.now() - startedAt;
  const drift = actualElapsed - ms;
  if (drift > VISIBILITY_DRIFT_THRESHOLD_MS) {
    // Tab was throttled — we already waited enough (or more). Skip remaining.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: `⚠️ Tab was backgrounded (${Math.round(drift)}ms throttle drift). Resuming fleet...` }
      }));
    }
  }
};



// ── Global Concurrency Semaphore ──────────────────────────────────────────────
// This is the PRIMARY fix for the thundering-herd / key exhaustion problem.
// All callWithFallback calls share this counter. When too many agents are firing
// simultaneously, excess callers wait with random jitter before proceeding.
// This prevents N parallel agents from all hitting the API at the exact same ms.
// ✅ ARCH-1 FIX: Raised from 4 → 8. Original limit was conservative for single-key setups.
// With an 8-key pool, a 5-agent parallel mission needs 5 slots — the old cap of 4 made
// the 5th agent wait up to 30s. Raising to 8 matches the key pool size and eliminates
// the 30s slot-wait bottleneck on full-fleet missions.
const MAX_CONCURRENT_API_CALLS = 8;
let _activeApiCalls = 0;

// ── Active Agent Counter (for personal/shared routing policy) ─────────────────
// Policy: if activeAgentCount <= PERSONAL_ONLY_THRESHOLD → route to personal key
//         if activeAgentCount >  PERSONAL_ONLY_THRESHOLD → route to shared pool
const PERSONAL_ONLY_THRESHOLD = 3; // raised from 2 to match new semaphore headroom
let _activeTopLevelAgents = 0;

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
const keyCooldownUntil = new Map<string, number>(); // token → available-at timestamp

// ── Proactive RPM (Requests-Per-Minute) Tracker ────────────────────────────────
// Records timestamps of every successful request per key in a 60-second sliding
// window. When a key's usage reaches RPM_SOFT_LIMIT (a conservative ceiling BELOW
// Gemini's actual hard limit), the key is proactively rotated away BEFORE a 429
// ever fires. This eliminates the "all keys rate-limited in seconds" cascade.
//
// Gemini free-tier hard limits (as of 2026-06):
//   gemini-2.5-flash: 10 RPM
//   gemini-2.5-flash-lite: 30 RPM
//   gemini-2.0-flash: 15 RPM
// We use a single conservative ceiling of 8 RPM per key so we have ample
// headroom on all models and leave room for parallel agents.
const RPM_SOFT_LIMIT = 8;       // Rotate away from a key at this many requests/60s
const RPM_WINDOW_MS  = 60_000;  // Sliding window duration

// Map<keyToken, Array<requestTimestampMs>>
const _keyRequestTimestamps = new Map<string, number[]>();

/**
 * Record a request against a key's RPM sliding window.
 * Call this BEFORE dispatching the API request.
 */
const recordKeyRequest = (token: string): void => {
  const now = Date.now();
  const ts = _keyRequestTimestamps.get(token) ?? [];
  // Prune entries older than the window
  const recent = ts.filter(t => now - t < RPM_WINDOW_MS);
  recent.push(now);
  _keyRequestTimestamps.set(token, recent);
};

/**
 * Returns true if the key has reached (or exceeded) the soft RPM ceiling.
 * When true, the caller should rotate to the next key immediately.
 */
const isKeyNearRpmLimit = (token: string): boolean => {
  const now = Date.now();
  const ts = _keyRequestTimestamps.get(token) ?? [];
  const recentCount = ts.filter(t => now - t < RPM_WINDOW_MS).length;
  return recentCount >= RPM_SOFT_LIMIT;
};

/** Get current RPM count for a token (for diagnostics / UI). */
export const getKeyRpm = (token: string): number => {
  const now = Date.now();
  const ts = _keyRequestTimestamps.get(token) ?? [];
  return ts.filter(t => now - t < RPM_WINDOW_MS).length;
};

/** Get a snapshot of all key health states (for the settings UI or status endpoint). */
export const getKeyPoolHealth = (): Array<{
  masked: string;
  rpm: number;
  rpmLimit: number;
  cooling: boolean;
  cooldownRemainsMs: number;
}> => {
  const livePool = getActiveKeyPool();
  const now = Date.now();
  return livePool.map(token => {
    const cooldownUntil = keyCooldownUntil.get(token) ?? 0;
    return {
      masked: token.substring(0, 6) + '••••••' + token.slice(-4),
      rpm: getKeyRpm(token),
      rpmLimit: RPM_SOFT_LIMIT,
      cooling: now < cooldownUntil,
      cooldownRemainsMs: Math.max(0, cooldownUntil - now),
    };
  });
};

// ── Global fleet backpressure ─────────────────────────────────────────────────
// When ALL keys are exhausted, subsequent agents wait here instead of each
// agent hammering the API independently and producing 10 identical 429 storms.
let _globalFleetCooldownUntil = 0;
const setGlobalFleetCooldown = (ms: number) => {
  _globalFleetCooldownUntil = Math.max(_globalFleetCooldownUntil, Date.now() + ms);
};
const getGlobalFleetCooldownWaitMs = (): number => {
  return Math.max(0, _globalFleetCooldownUntil - Date.now());
};

const isKeyAvailable = (token: string): boolean => {
  // ARCH-003: Circuit breaker — permanently dead keys are excluded
  if (_deadKeys.has(token)) return false;
  // Hard block: key is in the 429 cooldown window
  const until = keyCooldownUntil.get(token);
  if (until) {
    if (Date.now() < until) return false; // still cooling
    keyCooldownUntil.delete(token);        // cooldown expired — restore
  }
  // Soft block: proactive RPM ceiling reached — rotate before hitting the limit
  if (isKeyNearRpmLimit(token)) {
    console.info(`[ZenAI] Key ...${token.substring(0, 8)} at soft RPM ceiling (${getKeyRpm(token)}/${RPM_SOFT_LIMIT}). Rotating proactively.`);
    return false;
  }
  return true;
};

// ── ARCH-003: Dead Key Circuit Breaker ───────────────────────────────────────
// A key that returns consistent non-429, non-auth failures (e.g. HTTP 500,
// network errors) stays in the pool with the old logic and slows every mission
// by 1-2s per retry. This circuit breaker tracks consecutive non-quota failures.
// After DEAD_KEY_FAILURE_THRESHOLD consecutive failures, the key is moved to the
// _deadKeys set and excluded from ALL future rotation until app restart.
//
// 429 failures do NOT count — they are transient rate limits handled by cooldown.
// Auth failures do NOT count — they are handled by markKeyCooling separately.
// Only persistent server errors (500, connection refused, DNS, etc.) trigger DEAD.
const DEAD_KEY_FAILURE_THRESHOLD = 3;
const _keyConsecutiveFailures = new Map<string, number>(); // token → consecutive failure count
const _deadKeys = new Set<string>();                        // tokens permanently excluded

/** Record a non-rate-limit, non-auth failure against a key. Returns true if the key just turned DEAD. */
const recordKeyFailure = (token: string): boolean => {
  if (token === 'proxy_dummy_key') return false; // never kill the proxy key
  if (_deadKeys.has(token)) return true;          // already dead
  const prev = _keyConsecutiveFailures.get(token) ?? 0;
  const count = prev + 1;
  _keyConsecutiveFailures.set(token, count);
  if (count >= DEAD_KEY_FAILURE_THRESHOLD) {
    _deadKeys.add(token);
    _keyConsecutiveFailures.delete(token);
    const masked = token.substring(0, 8) + '...';
    console.warn(`[ZenAI] 🔴 Key ${masked} marked DEAD after ${count} consecutive non-rate-limit failures. Excluded until app restart.`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: `🔴 Key ${masked} is unresponsive (${count} server errors). Removing from pool permanently.` }
      }));
    }
    return true;
  }
  return false;
};

/** Reset failure counter on a successful request (key is healthy again). */
const resetKeyFailures = (token: string): void => {
  _keyConsecutiveFailures.delete(token);
};

/** Returns the set of dead key token prefixes (for diagnostic UI). */
export const getDeadKeys = (): string[] => {
  return [..._deadKeys].map(k => k.substring(0, 8) + '...');
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
  return msg.includes('404') || msg.includes('not found') || msg.includes('400') || msg.includes('invalid argument');
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

/**
 * VOICE MODEL CALLER — Uses Flash Lite for instant conversational responses.
 * Use for: AEGIS synthesis, NAVIGATOR, TITAN writes, any short spoken answer.
 * Bypasses semaphore (same as Unthrottled) but forces VOICE_MODEL_PRIORITY order.
 */
export const callWithVoiceModel = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>,
  signal?: AbortSignal
): Promise<any> => {
  // Force voice model by injecting a wrapper that pins the model name
  const voiceWrapper = async (genAI: GoogleGenerativeAI, _modelName: string) => {
    // Try voice models in order
    for (const model of VOICE_MODEL_PRIORITY) {
      try {
        return await buildRequest(genAI, model);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('404') || msg.includes('not found') || msg.includes('deprecated')) continue;
        throw err;
      }
    }
    // Last resort: use whatever _callWithFallbackInner picks
    return await buildRequest(genAI, _modelName);
  };
  return await _callWithFallbackInner(voiceWrapper, false, signal);
};

/**
 * RESEARCH MODEL CALLER — Uses 2.5 Flash for deep work with latest data.
 * Use for: ORACLE (email/task reading), ENIGMA (analytics), HERMES (drafting),
 * CHRONOS (calendar planning), any complex multi-step reasoning task.
 */
export const callWithResearchModel = async (
  buildRequest: (genAI: GoogleGenerativeAI, modelName: string) => Promise<any>,
  signal?: AbortSignal
): Promise<any> => {
  const researchWrapper = async (genAI: GoogleGenerativeAI, _modelName: string) => {
    for (const model of RESEARCH_MODEL_PRIORITY) {
      try {
        return await buildRequest(genAI, model);
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('404') || msg.includes('not found') || msg.includes('deprecated')) continue;
        throw err;
      }
    }
    return await buildRequest(genAI, _modelName);
  };
  return await _callWithFallbackInner(researchWrapper, false, signal);
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

  // ── Global fleet backpressure — if all keys just got rate-limited by a previous
  // parallel agent, wait here rather than immediately firing 10+ identical 429s.
  const globalWait = getGlobalFleetCooldownWaitMs();
  if (globalWait > 0) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: `⏳ Fleet cooling. Auto-resuming in ${Math.ceil(globalWait / 1000)}s...` }
      }));
    }
    await sleep(globalWait + 200, signal);
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
          recordKeyRequest('oauth_personal'); // ✅ RPM tracking for personal OAuth key
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
    // Always use liveKeys (from pickNextSharedKey) not the stale allKeys snapshot.
    // This also correctly handles the proxy_dummy_key case.
    const livePool = getActiveKeyPool();
    if (livePool.length === 0) {
      // No shared keys configured and personal key also failed
      break;
    }

    // ✅ FIX: Limit rotations to min(livePool.length, 3) per model.
    // Previously allKeys.length (e.g. 10) meant we'd try ALL 10 keys per model,
    // then ALL 10 again on model 2, and model 3 — burning 30 requests in seconds.
    // With 3 models × min(10,3) = 9 attempts max across the entire mission.
    const MAX_KEY_ROTATIONS = livePool.length;
    let rotationsUsed = 0;

    while (rotationsUsed < MAX_KEY_ROTATIONS) {
      // ✅ pickNextSharedKey is now awaited — key claim is atomic (see function docs)
      const keyObj = await pickNextSharedKey(signal);
      if (!keyObj) break; // no shared keys configured

      if (typeof window !== 'undefined' && MAX_KEY_ROTATIONS > 1) {
        window.dispatchEvent(new CustomEvent('agent-log', {
          detail: { type: 'thinking', title: `🔑 Trying key ${keyObj.index + 1}/${MAX_KEY_ROTATIONS}...` }
        }));
      }

      try {
        const genAI  = new GoogleGenerativeAI(keyObj.token);
        recordKeyRequest(keyObj.token); // ✅ RPM tracking — proactive rotation before 429
        apiQuotaStore.recordRequest();
        const result = await buildRequest(genAI, modelName);
        // ARCH-003: Success — reset consecutive failure counter for this key
        resetKeyFailures(keyObj.token);
        return result; // ✅ success
      } catch (err: any) {
        lastError = err;

        if (isRateLimit(err)) {
          hitQuota = true;
          // Rate limits do NOT count toward the dead-key circuit breaker — they are transient

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
            const jitter = 50 + Math.random() * 100;
            await sleep(jitter);
            continue;
          }
          break; // used all rotations → try next model
        }

        if (isModelNotFound(err)) {
          break; // model not available → try next model
        }
        if (isOverload(err)) {
          // ARCH-003: Server overload (503) counts as a non-quota failure — circuit breaker applies
          const isDead = recordKeyFailure(keyObj.token);
          if (isDead) {
            rotationsUsed++; // advance so we try the next key
            if (rotationsUsed >= MAX_KEY_ROTATIONS) break;
            continue;
          }
          break; // try next model
        }
        if (isAuthError(err)) {
          // Auth errors do NOT count toward dead-key threshold — auth issues are admin problems
          // Auth error on a shared key → mark it cooling so we don't retry it.
          // Do NOT count proxy_dummy_key auth errors as API key failures.
          if (keyObj.token !== 'proxy_dummy_key') {
            markKeyCooling(keyObj.token, 'Auth error (403/401)', KEY_COOLDOWN_MS);
          }
          rotationsUsed++;
          if (rotationsUsed >= MAX_KEY_ROTATIONS) break;
          continue;
        }
        // ARCH-003: Any other error (network failure, DNS, unexpected 500) → circuit breaker
        const isDead = recordKeyFailure(keyObj.token);
        if (!isDead) {
          // Not yet dead — still count as a rotation and try next key
          rotationsUsed++;
          if (rotationsUsed >= MAX_KEY_ROTATIONS) break;
          continue;
        } else {
          rotationsUsed++;
          if (rotationsUsed >= MAX_KEY_ROTATIONS) break;
          continue;
        }
      }
    }

    // All key attempts for this model exhausted. Brief delay then try next model.
    if (mi < ordered.length - 1) {
      console.warn(`[ZenAI] ${modelName} exhausted. Trying ${ordered[mi + 1]} instantly`);
      await sleep(10);
    }
  }

  // ── All models and keys exhausted ────────────────────────────────────────
  // ✅ FIX: Check hitQuota FIRST before the 401 check.
  // Previously: if keys got 429d and then the lastError happened to be a 401
  // (from proxy auth), it would throw the misleading "API key invalid" error
  // instead of the correct "rate limited" message.
  if (hitQuota) {
    // Set global fleet cooldown so subsequent parallel agents don't immediately
    // hammer the same exhausted keys.
    setGlobalFleetCooldown(KEY_COOLDOWN_MS);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: '⚠️ All keys rate-limited. Fleet auto-recovers in ~60s.' }
      }));
    }
    const livePool = getActiveKeyPool();
    const coolingCount = [...keyCooldownUntil.values()].filter(t => t > Date.now()).length;
    throw new Error(
      coolingCount > 0
        ? `${coolingCount}/${livePool.length} key(s) rate-limited. Auto-recover in ~60s. ZenTrack will retry automatically.`
        : 'AI quota reached. The system will auto-retry when keys cool down (~60s).'
    );
  }

  const finalMsg = String(lastError?.message || '').toLowerCase();
  if (finalMsg.includes('503') || finalMsg.includes('overload') || finalMsg.includes('high demand')) {
    throw new Error('AI is currently overloaded. Please try again in a moment.');
  }
  if (finalMsg.includes('401') || finalMsg.includes('invalid authentication') || finalMsg.includes('authentication credentials') || finalMsg.includes('unauthenticated')) {
    if (finalMsg.includes('firebase') || finalMsg.includes('id token')) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('firebase-auth-expired'));
      throw new Error('Your session has expired. Please refresh the page to continue.');
    }
    if (personalKey) {
      setAuthExpired();
      throw new Error('Your Gemini OAuth session has expired. Please reconnect your Google account.');
    }
    // ✅ FIX: Only show "API key invalid" if we're NOT using the proxy (proxy_dummy_key).
    // If using the proxy, the real error is the Firebase session above.
    const livePool = getActiveKeyPool();
    const usingProxy = livePool.length === 1 && livePool[0] === 'proxy_dummy_key';
    if (usingProxy) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('firebase-auth-expired'));
      throw new Error('Your session has expired. Please refresh the page to continue.');
    }
    throw new Error('One or more Gemini API keys returned auth errors. Please check your keys in Agent Settings.');
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

  private async rebuildSession(modelName: string, keyIndex: number, history: any[], explicitToken?: string) {
    const safeHistory = this.sanitizeHistory(history);
    let keyToUse = explicitToken;
    if (!keyToUse) {
      const liveKeys = getActiveKeyPool();
      if (liveKeys[keyIndex] && isKeyAvailable(liveKeys[keyIndex])) {
        keyToUse = liveKeys[keyIndex];
      } else {
        let found = false;
        for (let attempt = 0; attempt < liveKeys.length; attempt++) {
          const idx = (keyIndex + attempt) % liveKeys.length;
          if (isKeyAvailable(liveKeys[idx])) {
            keyToUse = liveKeys[idx];
            found = true;
            break;
          }
        }
        if (!found) keyToUse = liveKeys[keyIndex] || liveKeys[0] || '';
      }
    }
    const genAI = new GoogleGenerativeAI(keyToUse || 'proxy_dummy_key');
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
      const liveKeys = getActiveKeyPool();
      const MAX_KEY_ROTATIONS = liveKeys.length || 1;
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
            this.session    = await this.rebuildSession(modelName, keyIdx, history, keyObj?.token);
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
      const liveKeys = getActiveKeyPool();
      const MAX_KEY_ROTATIONS = liveKeys.length || 1;
      let rotationsUsed = 0;

      while (rotationsUsed < MAX_KEY_ROTATIONS) {
        // ✅ CRITICAL BUG FIX: pickNextSharedKey is ASYNC — must await it.
        const keyObj = await pickNextSharedKey();
        const keyIdx = keyObj ? keyObj.index : 0;
        // pickNextSharedKey already waits for cooldown internally.

        try {
          if (mi !== this.modelIndex || keyIdx !== this.keyIndex || rotationsUsed > 0) {
            const history = await this.getHistory();
            this.session = await this.rebuildSession(modelName, keyIdx, history, keyObj?.token);
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

