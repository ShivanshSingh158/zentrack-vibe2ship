/**
 * sarvaProxy.ts — ZenTrack Mobile TTS
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
 * Speak text using Sarvam TTS via Vercel proxy.
 * Falls back to expo-speech if proxy fails.
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

  try {
    let idToken: string | null = null;
    try {
      idToken = (await auth.currentUser?.getIdToken()) ?? null;
    } catch (e) {
      console.warn('[Sarvam] Could not get ID token');
    }

    const resp = await fetch(VOICE_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ text, target_language_code: languageCode, pace: 1.0 }),
    });

    if (!resp.ok) throw new Error(`Voice proxy error: ${resp.status}`);

    const data = await resp.json();
    const base64Audio = data?.audios?.[0];
    if (!base64Audio) throw new Error('No audio data in proxy response');

    // Write to temp file and play
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
    _isSpeaking = true;
    onStart?.();

    await sound.playAsync();

    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) {
        _isSpeaking = false;
        _currentSound = null;
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
        onDone?.();
      }
    });
  } catch (err: any) {
    console.warn('[Sarvam] TTS failed, falling back to expo-speech:', err.message);
    // Fallback: expo-speech (device voice)
    _isSpeaking = true;
    onStart?.();
    Speech.speak(text, {
      onDone: () => {
        _isSpeaking = false;
        onDone?.();
      },
      onError: () => {
        _isSpeaking = false;
        onError?.(err.message);
        onDone?.();
      },
    });
  }
}
