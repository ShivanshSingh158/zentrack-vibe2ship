/**
 * geminiProxy.ts — ZenTrack Mobile
 *
 * Calls the Gemini API directly with 9-key rotation.
 * Keys come from EXPO_PUBLIC_GEMINI_API_KEY (comma-separated).
 * These same keys are used by the Vercel proxy server-side.
 *
 * Why direct instead of Vercel proxy?
 *   The Vercel endpoint (myzentrack.vercel.app/api/gemini-proxy) returns
 *   HTML 404 from APK builds — the deployment doesn't reach the function.
 *   Direct API calls with key rotation are equivalent and simpler.
 *
 * Key rotation: tries keys in order, moves to next on 429/5xx.
 * On success, updates the round-robin index for the next call.
 */

const RAW_KEYS = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_KEYS: string[] = RAW_KEYS.split(',').map((k: string) => k.trim()).filter(Boolean);

// ✅ Startup diagnostic — verifies keys are baked into the bundle
console.log(`[GeminiProxy] Loaded ${GEMINI_KEYS.length} API key(s). Direct-to-Gemini mode.`);
if (GEMINI_KEYS.length === 0) {
  console.error('[GeminiProxy] ⚠️  EXPO_PUBLIC_GEMINI_API_KEY is empty! Reload Metro (press r) to pick up .env changes.');
}

// Round-robin index — cycles through keys to spread load
let keyIndex = 0;

function getNextKey(): string {
  if (GEMINI_KEYS.length === 0) {
    throw new Error('No Gemini API keys configured. Set EXPO_PUBLIC_GEMINI_API_KEY in .env');
  }
  const key = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
  keyIndex = (keyIndex + 1) % GEMINI_KEYS.length;
  return key;
}

// ─── Core Interface ──────────────────────────────────────────────────────────

export interface ProxyCallOptions {
  model?: string;
  contents: any[];
  systemInstruction?: string;
  tools?: any[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
  };
}

// ─── Core Gemini call with key rotation ──────────────────────────────────────

export async function callProxy(options: ProxyCallOptions): Promise<any> {
  const {
    model = 'gemini-2.5-flash',
    contents,
    systemInstruction,
    tools,
    generationConfig,
  } = options;

  const netState = await import('@react-native-community/netinfo').then(m => m.default.fetch());
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        return resp.json();
      }

      // 429 = rate limited — try next key
      if (resp.status === 429) {
        console.warn(`[GeminiProxy] Key rate-limited (429), trying next key...`);
        lastError = new Error('Rate limited');
        continue;
      }

      // 400/404 = bad request or invalid model — don't retry
      let errData: any = {};
      try { errData = await resp.json(); } catch (_) {}
      const msg = errData?.error?.message || `Gemini API error: HTTP ${resp.status}`;
      console.error('[GeminiProxy] Gemini error:', resp.status, msg);
      throw new Error(msg);

    } catch (fetchErr: any) {
      if (fetchErr.message && !fetchErr.message.includes('Rate limited')) {
        // Real error (not rate limit) — propagate immediately
        throw fetchErr;
      }
      lastError = fetchErr;
    }
  }

  throw lastError || new Error('All Gemini API keys exhausted or rate-limited. Try again in a minute.');
}

// ─── Parse Gemini REST response ──────────────────────────────────────────────

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

// ─── Convenience: transcribe audio ──────────────────────────────────────────

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

// ─── Convenience: quick text prompt ─────────────────────────────────────────

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
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  });
  const { text } = parseProxyResponse(data);
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}
