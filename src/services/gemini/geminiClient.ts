/**
 * src/services/gemini/geminiClient.ts
 *
 * ZenTrack — Thin Proxy Client for the Gemini API
 *
 * REPLACES: Direct `new GoogleGenerativeAI(apiKey).getGenerativeModel()` calls.
 *
 * All Gemini API keys now live in `api/gemini-proxy.js` (server-side).
 * This client forwards requests to our own backend, attaching the user's
 * Firebase ID token so the server can verify identity and enforce rate limits.
 *
 * DROP-IN COMPATIBILITY:
 *   callGeminiProxy() returns the raw Gemini REST API response object, which
 *   matches the shape returned by the GoogleGenerativeAI SDK's generateContent().
 *   Consumers can access: result.candidates[0].content.parts[0].text
 *
 * STREAMING:
 *   callGeminiProxyStream() uses the server-sent-events streaming endpoint.
 *   It yields text chunks as they arrive — same UX as SDK's generateContentStream().
 */

import { auth } from '../firebase';

// ── Types matching the Gemini REST API shape ───────────────────────────────────
export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string } | { inlineData?: { mimeType: string; data: string } }>;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
}

export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

export interface GeminiProxyRequest {
  model?: string;
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  systemInstruction?: GeminiSystemInstruction;
}

// ── Get Firebase ID Token (cached by Firebase SDK, auto-refreshed) ─────────────
async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated. Please sign in.');
  // Firebase SDK automatically refreshes the token when needed.
  return user.getIdToken();
}

// ── Core Proxy Call ────────────────────────────────────────────────────────────
/**
 * Calls /api/gemini-proxy with the authenticated user's Firebase ID token.
 * Returns the raw Gemini generateContent response.
 *
 * @throws Error with Gemini-compatible message on failure
 */
export async function callGeminiProxy(
  request: GeminiProxyRequest,
  signal?: AbortSignal
): Promise<any> {
  const idToken = await getIdToken();

  const res = await fetch('/api/gemini-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(request),
    signal,
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.error || `Gemini proxy error (HTTP ${res.status})`;
    throw Object.assign(new Error(errMsg), { status: res.status });
  }

  return data;
}

// ── Streaming Proxy Call ───────────────────────────────────────────────────────
/**
 * Calls /api/gemini-proxy-stream and yields text chunks as they stream.
 * Falls back to callGeminiProxy (non-streaming) if streaming isn't available.
 *
 * Usage:
 *   for await (const chunk of callGeminiProxyStream({ contents: [...] })) {
 *     console.log(chunk); // text chunk
 *   }
 */
export async function* callGeminiProxyStream(
  request: GeminiProxyRequest,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const idToken = await getIdToken();

  const res = await fetch('/api/gemini-proxy-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(data?.error || `Streaming proxy error (HTTP ${res.status})`),
      { status: res.status }
    );
  }

  if (!res.body) {
    // Fallback: non-streaming
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    yield text;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines: "data: {...}\n\n"
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return;
      try {
        const chunk = JSON.parse(jsonStr);
        const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // Skip malformed chunks
      }
    }
  }
}

// ── Convenience: extract text from Gemini response ────────────────────────────
export function extractGeminiText(response: any): string {
  return response?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || '')
    .join('') ?? '';
}
