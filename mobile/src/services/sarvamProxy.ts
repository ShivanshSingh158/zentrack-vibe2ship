/**
 * sarvamProxy.ts — ZenTrack Mobile TTS
 *
 * Routes TTS requests through the Vercel proxy (api/voice-proxy.js)
 * which has the 3 Sarvam keys with round-robin rotation server-side.
 *
 * Falls back to expo-speech (device TTS) if the proxy fails.
 */

import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { auth } from './firebase';

const VOICE_PROXY_URL = 'https://myzentrack.vercel.app/api/voice-proxy';

// Current playback sound ref (so we can stop it)
let _currentSound: Audio.Sound | null = null;
let _isSpeaking = false;

export async function stopSpeech() {
  if (_currentSound) {
    try {
      await _currentSound.stopAsync();
      await _currentSound.unloadAsync();
    } catch (e) {
      // swallow
    }
    _currentSound = null;
  }
  _isSpeaking = false;
  Speech.stop();
}

export function isSpeaking() {
  return _isSpeaking;
}

/**
 * Detect if text is mostly Hindi/Devanagari (mirrors web app's detectLanguageCode)
 */
function detectLanguageCode(text: string): 'en-IN' | 'hi-IN' {
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en-IN';
  const ratio = devanagariChars / totalChars;
  return ratio > 0.15 ? 'hi-IN' : 'en-IN';
}

/**
 * Strip markdown formatting before speaking
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^[-•]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
    .replace(/SPOKEN_SUMMARY:\s*/i, '')
    .trim();
}

/**
 * FIX #1 (P0): Chunk text into <=500 char segments at sentence boundaries.
 * Sarvam AI has a hard 500-char limit per call. The web app already does this;
 * the mobile app was sending the full response, causing silent TTS failures.
 * 
 * Strategy:
 *   1. Split on sentence boundaries (. ! ? \n)
 *   2. Greedily accumulate sentences until the chunk would exceed 500 chars
 *   3. If a single sentence > 500 chars, split at the last space before limit
 */
function chunkText(text: string, maxLen = 490): string[] {
  if (!text || text.length <= maxLen) return [text];

  const chunks: string[] = [];
  // Split on sentence-ending punctuation followed by space or end-of-string
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    if ((current + ' ' + sentence).trim().length <= maxLen) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      // If a single sentence itself exceeds maxLen, hard-split at last space
      if (sentence.length > maxLen) {
        let remaining = sentence;
        while (remaining.length > maxLen) {
          const cutAt = remaining.lastIndexOf(' ', maxLen);
          const cut = cutAt > 0 ? cutAt : maxLen;
          chunks.push(remaining.slice(0, cut).trim());
          remaining = remaining.slice(cut).trim();
        }
        current = remaining;
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(c => c.length > 0);
}

/**
 * Speak text using Sarvam TTS via Vercel proxy.
 * FIX #1 (P0): Now chunks text at <=490 chars before calling Sarvam.
 * Falls back to expo-speech if the proxy fails on any chunk.
 */
export async function speakWithSarvam(
  rawText: string,
  onStart?: () => void,
  onDone?: () => void,
  onError?: (msg: string) => void
): Promise<void> {
  await stopSpeech();

  const text = stripMarkdown(rawText);
  if (!text) {
    onDone?.();
    return;
  }

  const languageCode = detectLanguageCode(text);
  // FIX #1: Split into <=490-char chunks at sentence boundaries
  const chunks = chunkText(text, 490);

  let idToken: string | null = null;
  try {
    idToken = (await auth.currentUser?.getIdToken()) ?? null;
  } catch (e) {
    console.warn('[Sarvam] Could not get ID token');
  }

  /**
   * Play a single TTS chunk — fetches audio from Sarvam and plays via expo-av.
   * Returns true on success, false on failure (caller switches to device TTS).
   */
  async function playChunk(chunk: string): Promise<boolean> {
    try {
      const resp = await fetch(VOICE_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ text: chunk, target_language_code: languageCode, pace: 1.0 }),
      });

      if (!resp.ok) throw new Error(`Voice proxy error: ${resp.status}`);

      const data = await resp.json();
      const base64Audio = data?.audios?.[0];
      if (!base64Audio) throw new Error('No audio data in proxy response');

      const tmpUri = `${FileSystem.documentDirectory}sara_tts_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(tmpUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: tmpUri });
      _currentSound = sound;

      await sound.playAsync();

      // Wait for playback to finish before moving to next chunk
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            _currentSound = null;
            FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
            resolve();
          }
        });
      });
      return true;
    } catch (err: any) {
      console.warn('[Sarvam] Chunk TTS failed:', err.message);
      return false;
    }
  }

  _isSpeaking = true;
  onStart?.();

  // Play all chunks sequentially; fall back to expo-speech on any failure
  let useDeviceTTS = false;
  for (let i = 0; i < chunks.length; i++) {
    // If stopSpeech() was called externally, abort the remaining chunks
    if (!_isSpeaking) break;

    if (!useDeviceTTS) {
      const ok = await playChunk(chunks[i]);
      if (!ok) useDeviceTTS = true; // fall back for remaining chunks
    }

    if (useDeviceTTS) {
      // Play remaining chunks sequentially using device TTS
      await new Promise<void>((resolve) => {
        Speech.speak(chunks.slice(i).join(' '), {
          onDone: resolve,
          onError: () => resolve(),
        });
      });
      break; // device TTS handles the rest in one call
    }
  }

  _isSpeaking = false;
  onDone?.();
}
