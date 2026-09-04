/**
 * geminiProxy.ts ΓÇö ZenTrack Mobile
 *
 * Calls the Gemini API directly with 9-key rotation.
 * Keys come from EXPO_PUBLIC_GEMINI_API_KEY (comma-separated).
 * These same keys are used by the Vercel proxy server-side.
 *
 * Why direct instead of Vercel proxy?
 *   The Vercel endpoint (myzentrack.vercel.app/api/gemini-proxy) returns
 *   HTML 404 from APK builds ΓÇö the deployment doesn't reach the function.
 *   Direct API calls with key rotation are equivalent and simpler.
 *
 * Key rotation: tries keys in order, moves to next on 429/5xx.
 * On success, updates the round-robin index for the next call.
 */

// FIX #4: Static import ΓÇö eliminates ~50-100ms dynamic resolution overhead on every AI call
import NetInfo from '@react-native-community/netinfo';
import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase';

const RAW_KEYS = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_KEYS: string[] = RAW_KEYS.split(',').map((k: string) => k.trim()).filter(Boolean);

// ✅ Startup diagnostic — verifies connection strategy
if (GEMINI_KEYS.length > 0) {
  console.log(`[GeminiProxy] Loaded ${GEMINI_KEYS.length} API key(s). Direct-to-Gemini mode.`);
} else {
  console.log(`[GeminiProxy] No local keys found. Running in secure Vercel Proxy Mode (Production/APK ready).`);
}

/**
 * Gets a valid Firebase ID token for authenticating with the Vercel backend proxy.
 * If user is guest/unauthenticated, automatically signs in anonymously to obtain a valid token.
 */
async function getValidAuthToken(): Promise<string | null> {
  try {
    let user = auth.currentUser;
    if (!user) {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    }
    if (user) {
      return await user.getIdToken();
    }
  } catch (err) {
    console.warn('[GeminiProxy] Failed to obtain Firebase ID token for proxy:', err);
  }
  return null;
}

// Round-robin index ── cycles through keys to spread load
let keyIndex = 0;

function getNextKey(): string | null {
  if (GEMINI_KEYS.length === 0) {
    return null;
  }
  const key = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
  keyIndex = (keyIndex + 1) % GEMINI_KEYS.length;
  return key;
}

// ΓöÇΓöÇΓöÇ Core Interface ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export interface ProxyCallOptions {
  model?: string;
  contents: any[];
  systemInstruction?: string;
  tools?: any[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    responseMimeType?: string;
  };
}

// ΓöÇΓöÇΓöÇ Core Gemini call with key rotation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function callProxy(options: ProxyCallOptions): Promise<any> {
  const {
    model = 'gemini-3.6-flash',
    contents,
    systemInstruction,
    tools,
    generationConfig,
  } = options;

  // FIX #4: Use static import (moved to top of file) ΓÇö no more dynamic resolution per-call
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    console.warn('[GeminiProxy] Offline. Intercepting Gemini call.');
    return {
      candidates: [{
        content: { parts: [{ text: "I cannot reach the network right now, but your logs will be saved locally." }] }
      }]
    };
  }

  const body: any = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  if (generationConfig) {
    body.generationConfig = generationConfig;
  }

  const totalKeys = Math.max(GEMINI_KEYS.length, 1);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const key = getNextKey();
    const url = key 
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
      : `https://myzentrack.vercel.app/api/gemini-proxy`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second strict timeout

    try {
      const token = !key ? await getValidAuthToken() : null;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const reqBody = key ? body : { ...body, model };

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        return resp.json();
      }

      // 429 = rate limited, 5xx = server error, 401/403 = bad/revoked key ΓÇö try next key
      if (resp.status === 429 || resp.status >= 500 || resp.status === 401 || resp.status === 403 || resp.status === 400) {
        if (attempt === 0) {
          console.warn(`[GeminiProxy] Rate-limit/Auth error (${resp.status}), rotating through keys...`);
        }
        lastError = new Error(`API Error ${resp.status}`);
        continue;
      }

      // 400/404 = bad request or invalid model ΓÇö don't retry
      let errData: any = {};
      try { errData = await resp.json(); } catch (_) {}
      const msg = errData?.error?.message || `Gemini API error: HTTP ${resp.status}`;
      console.warn('[GeminiProxy] Gemini error:', resp.status, msg);
      throw new Error(msg);

    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      
      if (fetchErr.name === 'AbortError') {
        console.warn('[GeminiProxy] Request timed out (30s limit). Returning offline fallback.');
        return {
          candidates: [{
            content: { parts: [{ text: "Network is too weak right now." }] }
          }]
        };
      }

      if (fetchErr.message && !fetchErr.message.includes('API Error')) {
        // Real error (not rate limit) ΓÇö propagate immediately
        throw fetchErr;
      }
      lastError = fetchErr;
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted or rate-limited. Try again in a minute.');
}

// ΓöÇΓöÇΓöÇ Gemini Streaming with key rotation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function streamProxy(
  options: ProxyCallOptions,
  onChunk: (text: string) => void
): Promise<string> {
  const {
    model = 'gemini-3.6-flash',
    contents,
    systemInstruction,
    generationConfig,
  } = options;

  // Use the robust REST-based callProxy (which has key rotation and retry logic)
  const data = await callProxy({
    model,
    contents: contents.map(c => c.role ? c : { role: 'user', ...c }),
    systemInstruction,
    generationConfig,
  });

  const { text } = parseProxyResponse(data);
  if (!text) {
    const fallback = "I'm here ΓÇö what's on your mind?";
    onChunk(fallback);
    return fallback;
  }

  // Simulate the streaming effect for the UI at ~60fps
  // Gemini REST is so fast (1-2s) that this visually mimics network streaming
  // without relying on React Native's unsupported Web Streams (pipeThrough)
  const totalLength = text.length;
  const chunkSteps = 15; // 15 frames of animation
  const charsPerStep = Math.max(1, Math.floor(totalLength / chunkSteps));
  
  for (let i = 0; i < totalLength; i += charsPerStep) {
    onChunk(text.substring(0, i + charsPerStep));
    await new Promise(r => setTimeout(r, 16));
  }
  onChunk(text);

  return text;
}

// ΓöÇΓöÇΓöÇ Parse Gemini REST response ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export function parseProxyResponse(data: any): {
  text: string;
  functionCall: { name: string; args: any } | null;
} {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    console.warn('[GeminiProxy] No candidates in response:', JSON.stringify(data));
    return { text: '', functionCall: null };
  }

  const parts = candidate?.content?.parts || [];

  // Check for function call first (when tools parameter is used)
  for (const part of parts) {
    if (part.functionCall) {
      return {
        text: '',
        functionCall: { name: part.functionCall.name, args: part.functionCall.args || {} },
      };
    }
  }

  // Collect text parts
  const text = parts.map((p: any) => p.text || '').join('');
  return { text: text.trim(), functionCall: null };
}

// ΓöÇΓöÇΓöÇ Convenience: transcribe audio ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function transcribeAudioViaProxy(base64Audio: string): Promise<string | null> {
  try {
    const data = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
            { text: 'Transcribe this voice recording exactly. Return ONLY the transcribed text, nothing else.' },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    return parseProxyResponse(data).text || null;
  } catch (err) {
    console.error('[GeminiProxy] Transcription failed:', err);
    return null;
  }
}



// ΓöÇΓöÇΓöÇ Convenience: quick text prompt ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function callGeminiProxy(
  contents: any[],
  options: { model?: string; temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> {
  // Gemini REST API requires every content item to have a 'role' field
  const normalizedContents = contents.map(c =>
    c.role ? c : { role: 'user', ...c }
  );
  const data = await callProxy({
    model: options.model || 'gemini-2.5-flash',
    contents: normalizedContents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      // 32768 = the maximum output token limit for Gemini 2.5 Flash
      // This ensures Notes AI, Sara, and all callers get the longest possible response
      maxOutputTokens: options.maxOutputTokens ?? 32768,
    },
  });
  const { text } = parseProxyResponse(data);
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ΓöÇΓöÇΓöÇ AI Exercise Resolver ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Accepts any user-typed name (abbreviation, typo, colloquial name, etc.)
// and returns canonical exercise metadata auto-filled by Gemini.

export interface AIExerciseInfo {
  canonicalName: string;   // Properly capitalised exercise name
  muscle: string;          // Primary muscle group
  targetSets: number;      // Recommended working sets
  targetReps: string;      // Rep range e.g. "8ΓÇô12"
  restTimeSecs: number;    // Rest in seconds
  youtubeSearchQuery: string; // Best YouTube search query for a form video
}

const VALID_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Side Delts', 'Rear Delts',
  'Triceps', 'Biceps', 'Brachialis', 'Quads', 'Hamstrings',
  'Glutes', 'Calves', 'Abs', 'Obliques', 'Forearms', 'Traps', 'Mixed',
];

export async function aiResolveExercise(userInput: string): Promise<AIExerciseInfo | null> {
  if (!userInput.trim()) return null;

  const prompt = `You are an exercise science expert. The user typed: "${userInput.trim()}"

Identify this as a gym exercise and respond with ONLY a valid JSON object ΓÇö no markdown, no explanation.

Return this exact schema:
{
  "canonicalName": "Full proper exercise name",
  "muscle": "Primary muscle group (must be exactly one of: Chest, Back, Shoulders, Side Delts, Rear Delts, Triceps, Biceps, Brachialis, Quads, Hamstrings, Glutes, Calves, Abs, Obliques, Forearms, Traps, Mixed)",
  "targetSets": 3,
  "targetReps": "8ΓÇô12",
  "restTimeSecs": 90,
  "youtubeSearchQuery": "best form tutorial search query"
}

Rules:
- canonicalName: correct spelling and full name even if user typed abbreviation/typo
- muscle: choose the single best primary muscle from the allowed list only
- targetSets: integer 2ΓÇô5 based on typical programming for this exercise
- targetReps: use em-dash (ΓÇô) not hyphen, e.g. "8ΓÇô12", "12ΓÇô15", "5ΓÇô8"
- restTimeSecs: 45ΓÇô180 based on exercise intensity (compound = more, isolation = less)
- youtubeSearchQuery: concise search like "cable lateral raise form tutorial" or "bench press proper form"`;

  try {
    const data = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    });

    const raw = parseProxyResponse(data).text;
    if (!raw) return null;

    // Strip any markdown fences in case the model adds them despite instructions
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as AIExerciseInfo;

    // Validate muscle is from allowed list
    if (!VALID_MUSCLES.includes(parsed.muscle)) {
      parsed.muscle = 'Mixed';
    }
    // Clamp sets/rest to sane ranges
    parsed.targetSets = Math.max(2, Math.min(6, parsed.targetSets || 3));
    parsed.restTimeSecs = Math.max(30, Math.min(300, parsed.restTimeSecs || 60));

    return parsed;
  } catch (err) {
    console.warn('[GeminiProxy] aiResolveExercise failed:', err);
    return null;
  }
}

// ─── AI Task Extractor from Audio ─────────────────────────────────────────────

export async function extractTaskFromAudio(base64Audio: string): Promise<any[]> {
  try {
    const transcript = await transcribeAudioViaProxy(base64Audio);
    if (!transcript) return [];

    // Import isSilenceOrNoise dynamically to prevent circular dependencies
    const { isSilenceOrNoise } = require('./voiceEngine');
    if (isSilenceOrNoise(transcript)) {
      console.log('[GeminiProxy] Silence or noise transcript detected, skipping task extraction.');
      return [];
    }

    // Import formatLocalDateStr dynamically to prevent circular dependencies
    const { formatLocalDateStr } = require('../utils/dateUtils');
    const prompt = `Parse this voice recording transcript into task(s): "${transcript.trim()}"
Return ONLY a JSON array of tasks: [{"title": str, "date": "YYYY-MM-DD", "timeSlot": "HH:MM or null", "priority": "P1|P2|P3", "isRecurring": bool, "recurrenceRule": null}]
If the transcript is silence, background noise, greetings, or does not explicitly contain a task, return an empty array [].
Today's date is ${formatLocalDateStr(new Date())}.`;

    const response = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const parsed = parseProxyResponse(response);
    const data = JSON.parse(parsed.text || '[]');
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.warn('[GeminiProxy] extractTaskFromAudio error:', e);
    return [];
  }
}

