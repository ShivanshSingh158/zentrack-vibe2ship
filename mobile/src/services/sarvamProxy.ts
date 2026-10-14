import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { auth } from './firebase';

const VOICE_PROXY_URL = 'https://myzentrack.vercel.app/api/gemini-proxy?action=tts';
const TTS_FETCH_TIMEOUT_MS = 10000;

let _currentSound: Audio.Sound | null = null;
let _currentPlaybackResolver: (() => void) | null = null;
let _currentAbortController: AbortController | null = null;
let _speechSessionId = 0;
let _isSpeaking = false;

export async function stopSpeech(): Promise<void> {
  _speechSessionId++;
  _isSpeaking = false;

  if (_currentAbortController) {
    try {
      _currentAbortController.abort();
    } catch {}
    _currentAbortController = null;
  }

  if (_currentSound) {
    const soundToStop = _currentSound;
    _currentSound = null;
    try {
      await soundToStop.stopAsync().catch(() => {});
      await soundToStop.unloadAsync().catch(() => {});
    } catch {}
  }

  if (_currentPlaybackResolver) {
    const resolve = _currentPlaybackResolver;
    _currentPlaybackResolver = null;
    resolve();
  }

  Speech.stop();
}

export function isSpeaking(): boolean {
  return _isSpeaking;
}

function detectLanguageCode(text: string): 'en-IN' | 'hi-IN' {
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en-IN';
  const ratio = devanagariChars / totalChars;
  return ratio > 0.15 ? 'hi-IN' : 'en-IN';
}

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

function chunkText(text: string, maxLen = 490): string[] {
  if (!text || text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    if ((current + ' ' + sentence).trim().length <= maxLen) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
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

export async function speakWithSarvam(
  rawText: string,
  onStart?: () => void,
  onDone?: () => void,
  onError?: (msg: string) => void
): Promise<void> {
  await stopSpeech();
  const sessionId = _speechSessionId;

  const text = stripMarkdown(rawText);
  if (!text) {
    onDone?.();
    return;
  }

  const languageCode = detectLanguageCode(text);
  const chunks = chunkText(text, 490);

  let idToken: string | null = null;
  try {
    idToken = (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    console.warn('[Sarvam] Could not get ID token');
  }

  async function playChunk(chunk: string): Promise<boolean> {
    if (sessionId !== _speechSessionId) return true;
    let tmpUri: string | null = null;
    const controller = new AbortController();
    _currentAbortController = controller;
    const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

    try {
      const resp = await fetch(VOICE_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ text: chunk, target_language_code: languageCode, pace: 1.0 }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (sessionId !== _speechSessionId) return true;

      if (!resp.ok) throw new Error(`Voice proxy error: ${resp.status}`);

      const data = await resp.json();
      const base64Audio = data?.audios?.[0];
      if (!base64Audio) throw new Error('No audio data in proxy response');

      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
      tmpUri = `${baseDir}sara_tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`;
      await FileSystem.writeAsStringAsync(tmpUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (sessionId !== _speechSessionId) {
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
        return true;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: tmpUri });
      if (sessionId !== _speechSessionId) {
        await sound.unloadAsync().catch(() => {});
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
        return true;
      }

      _currentSound = sound;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (_currentPlaybackResolver === finish) {
            _currentPlaybackResolver = null;
          }
          resolve();
        };
        _currentPlaybackResolver = finish;

        sound.setOnPlaybackStatusUpdate(async (status: any) => {
          if (!status.isLoaded || status.didJustFinish || status.error) {
            try {
              await sound.stopAsync().catch(() => {});
              await sound.unloadAsync().catch(() => {});
            } catch {}
            if (_currentSound === sound) _currentSound = null;
            if (tmpUri) {
              FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
              tmpUri = null;
            }
            finish();
          }
        });

        sound.playAsync().catch(() => finish());
      });

      return true;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (_currentSound) {
        const s = _currentSound;
        _currentSound = null;
        try {
          await s.stopAsync().catch(() => {});
          await s.unloadAsync().catch(() => {});
        } catch {}
      }
      if (tmpUri) {
        FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
      }
      if (sessionId === _speechSessionId) {
        console.warn('[Sarvam] Chunk TTS failed:', err?.message);
      }
      return false;
    } finally {
      if (_currentAbortController === controller) {
        _currentAbortController = null;
      }
    }
  }

  _isSpeaking = true;
  onStart?.();

  let useDeviceTTS = false;
  for (let i = 0; i < chunks.length; i++) {
    if (sessionId !== _speechSessionId || !_isSpeaking) break;

    if (!useDeviceTTS) {
      const ok = await playChunk(chunks[i]);
      if (!ok && sessionId === _speechSessionId) {
        useDeviceTTS = true;
      }
    }

    if (useDeviceTTS && sessionId === _speechSessionId && _isSpeaking) {
      await new Promise<void>((resolve) => {
        _currentPlaybackResolver = resolve;
        Speech.speak(chunks.slice(i).join(' '), {
          language: languageCode,
          onDone: () => {
            if (_currentPlaybackResolver === resolve) _currentPlaybackResolver = null;
            resolve();
          },
          onStopped: () => {
            if (_currentPlaybackResolver === resolve) _currentPlaybackResolver = null;
            resolve();
          },
          onError: (e: any) => {
            if (_currentPlaybackResolver === resolve) _currentPlaybackResolver = null;
            onError?.(e?.message || 'Device TTS failed');
            resolve();
          },
        });
      });
      break;
    }
  }

  if (sessionId === _speechSessionId) {
    _isSpeaking = false;
    onDone?.();
  }
}
