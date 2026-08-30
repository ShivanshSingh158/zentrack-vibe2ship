// src/services/voice/sarvam.ts
// TTS service with client-side round-robin key rotation.
// Add keys to your .env as: VITE_SARVAM_API_KEY_1, VITE_SARVAM_API_KEY_2, …
// The legacy VITE_SARVAM_API_KEY is also supported as a fallback.

export interface SarvamTTSOptions {
  text: string;
  speaker?: string;
}

const DEFAULT_SPEAKER = import.meta.env.VITE_SARVAM_VOICE_ID || 'shubh';
const COOLDOWN_MS = 60_000; // 1 minute cooldown after a 429

// ─── Build key pool from env ───────────────────────────────────────────────
function buildKeyPool(): string[] {
  const keys: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const key = (import.meta.env[`VITE_SARVAM_API_KEY_${i}`] as string | undefined)?.trim();
    if (key) keys.push(key);
  }

  // Legacy single-key fallback
  const legacy = (import.meta.env.VITE_SARVAM_API_KEY as string | undefined)?.trim();
  if (legacy && !keys.includes(legacy)) keys.push(legacy);

  return keys;
}

interface KeyEntry {
  key: string;
  label: string;
  rateLimitedUntil: number;
  useCount: number;
}

const keyPool: KeyEntry[] = buildKeyPool().map((key, i) => ({
  key,
  label: `key${i + 1}`,
  rateLimitedUntil: 0,
  useCount: 0,
}));

let rrIndex = 0;

function getNextKey(): KeyEntry | null {
  const now = Date.now();
  const total = keyPool.length;

  for (let attempt = 0; attempt < total; attempt++) {
    const idx = (rrIndex + attempt) % total;
    const entry = keyPool[idx];
    if (now >= entry.rateLimitedUntil) {
      rrIndex = (idx + 1) % total;
      entry.useCount++;
      return entry;
    }
  }

  // All rate-limited – return soonest-recovering key info for logging
  console.warn('[Sarvam] All API keys are rate-limited.');
  return null;
}

function markRateLimited(entry: KeyEntry) {
  entry.rateLimitedUntil = Date.now() + COOLDOWN_MS;
  const available = keyPool.filter(k => Date.now() >= k.rateLimitedUntil).length;
  console.warn(`[Sarvam] ${entry.label} rate-limited. Cooling down for ${COOLDOWN_MS / 1000}s. Keys still available: ${available}`);
}

// ─── Language detection ────────────────────────────────────────────────────
/**
 * Auto-detects whether text is primarily English or Hindi (Devanagari).
 * Sarvam bulbul:v3 applies phoneme rules per target_language_code — using
 * hi-IN for English text causes mispronunciation. Using en-IN for Hinglish
 * still works fine because bulbul handles code-switching internally.
 */
function detectLanguageCode(text: string): 'en-IN' | 'hi-IN' {
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const ratio = devanagariChars / Math.max(text.length, 1);
  // If >15% of characters are Devanagari script → use hi-IN; otherwise en-IN
  return ratio > 0.15 ? 'hi-IN' : 'en-IN';
}

// ─── Public TTS function ─────────────────────────────────────────────────────

/**
 * Calls the Sarvam AI TTS endpoint.
 * Automatically rotates through all configured API keys on 429 responses.
 * Returns the raw base64 encoded audio string.
 */
export async function synthesizeSpeechSarvam({ text, speaker = DEFAULT_SPEAKER }: SarvamTTSOptions): Promise<string> {
  if (keyPool.length === 0) {
    throw new Error('No Sarvam API keys configured. Add VITE_SARVAM_API_KEY_1 (and optionally _2, _3 …) to your .env file.');
  }

  const maxAttempts = keyPool.length;
  let attemptsLeft = maxAttempts;

  while (attemptsLeft > 0) {
    const entry = getNextKey();

    if (!entry) {
      throw new Error('All Sarvam API keys are currently rate-limited. Please wait ~1 minute and try again.');
    }

    console.log(`[Sarvam] Using ${entry.label} (use #${entry.useCount})`);

    // FIX: 8-second timeout prevents TTS queue from hanging forever on Sarvam API slowness
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': entry.key,
        },
        body: JSON.stringify({
          inputs: [text],
          // FIX: Auto-detect language — 'hi-IN' hardcoded caused English words to be
          // pronounced with Hindi phonemes, causing quality drift mid-response.
          target_language_code: detectLanguageCode(text),
          speaker: speaker.toLowerCase(),
          // FIX: pace 1.05 caused audio clipping on some hardware. 1.0 is natural speed.
          pace: 1.0,
          speech_sample_rate: 22050,
          enable_preprocessing: true,
          model: 'bulbul:v3',
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('Sarvam TTS timeout after 8s — queue will retry with next key');
      throw err;
    }
    clearTimeout(timeoutId);

    if (response.status === 429) {
      markRateLimited(entry);
      attemptsLeft--;
      // Immediately try the next key
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sarvam API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.audios || data.audios.length === 0) {
      throw new Error('Sarvam API returned no audio data');
    }

    return data.audios[0]; // base64 string
  }

  throw new Error('TTS failed: all Sarvam API keys were rate-limited during this request.');
}

// ─── Web Speech API Fallback (zero-latency, no API key needed) ────────────────
/**
 * Speaks text using the browser's built-in speechSynthesis as an immediate
 * fallback when Sarvam is rate-limited. Returns a base64-compatible empty
 * string but triggers native TTS audio directly (bypasses the audio pipeline).
 * 
 * Use this when synthesizeSpeechSarvam throws a rate-limit error.
 */
export function speakWithBrowserTTS(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel(); // clear any pending speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick the best available voice (prefer en-IN, then en-GB, then any English)
    const voices = window.speechSynthesis.getVoices();
    const preferred = (
      voices.find(v => v.lang === 'en-IN' && v.localService) ||
      voices.find(v => v.lang === 'en-IN') ||
      voices.find(v => v.lang === 'en-GB') ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0]
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // don't throw — just continue

    window.speechSynthesis.speak(utterance);
  });
}


/**
 * Converts speech to text using Sarvam AI's STT endpoint.
 * Automatically rotates through configured API keys on 429.
 */
export async function transcribeSpeechSarvam(audioBlob: Blob): Promise<string> {
  if (keyPool.length === 0) {
    throw new Error('No Sarvam API keys configured.');
  }

  const maxAttempts = keyPool.length;
  let attemptsLeft = maxAttempts;

  while (attemptsLeft > 0) {
    const entry = getNextKey();
    if (!entry) throw new Error('All Sarvam API keys are currently rate-limited.');

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('prompt', ''); // Optional context

    try {
      const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
        method: 'POST',
        headers: {
          'api-subscription-key': entry.key,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 429) {
          markRateLimited(entry);
          attemptsLeft--;
          continue;
        }
        throw new Error(`Sarvam API STT error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.transcript || '';
    } catch (err) {
      console.error('[Sarvam] STT API Error:', err);
      throw err;
    }
  }
  throw new Error('All Sarvam keys rate-limited during transcription.');
}
