import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudioViaProxy } from './geminiProxy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

export interface VoiceEngineCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
  onAudioReady?: (base64Audio: string) => void;
}

// ── State ───────────────────────────────────────────────────────────────────────

const g = globalThis as any;
let _callbacks: VoiceEngineCallbacks | null = null;
let _recording: Audio.Recording | null = g.__expo_audio_recording || null;
// BUG-H1 FIX: Track when recording started so we can reject sub-600ms clips
// that Gemini cannot transcribe, instead of failing silently.
let _recordingStartTime: number = 0;
let _isPreparing: boolean = false;

// ─── VAD State (Capability 6) ─────────────────────────────────────────────────
let _vadPollInterval: NodeJS.Timeout | null = null;
let _vadSilenceTimer: NodeJS.Timeout | null = null;
let _vadActive = false;
let _lastAudioLevel = 0;

// VAD constants
const VAD_POLL_INTERVAL_MS = 100;      // Check RMS every 100ms
const VAD_SILENCE_THRESHOLD = -32;     // dB level below which = silence (real speech > -32dB)
const VAD_SILENCE_DURATION_MS = 850;   // 850ms silence → auto-submit (snappy, responsive tuning)

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Checks if transcribed speech is empty, silence, background noise,
 * or STT hallucination (e.g. "[silence]", "Thank you.", "Task", etc.)
 */
export function isSilenceOrNoise(text: string | null | undefined): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  if (clean.length === 0) return true;

  // Single punctuation marks or symbols
  if (/^[\s.?!,\-–—_"'`~*#@$%^&()\[\]{}|\\/<>:;+=]*$/.test(clean)) return true;

  // Known STT / Gemini silence & noise hallucination patterns
  const silenceTokens = [
    'silence',
    '[silence]',
    '(silence)',
    'blank audio',
    '[blank_audio]',
    '(blank_audio)',
    'background noise',
    '[background noise]',
    'coughing',
    '[coughing]',
    'music',
    '[music]',
    'thank you',
    'thank you.',
    'thanks',
    'thanks.',
    'subtitles by',
    'am',
    'task',
    'task.',
    'add task',
    'add task.',
    'unspecified',
    'unspecified.',
    'listening',
    'listening...',
    'sound of',
    'you',
    'the',
    // Network fallback / error strings that must never become tasks
    'network is too weak right now',
    'network is too weak right now.',
    'network is too weak',
    'network is too weak.',
    'i cannot reach the network right now',
    'i cannot reach the network right now.',
    'i cannot reach the network right now, but your logs will be saved locally.',
    'i cannot reach the network right now, but your logs will be saved locally',
    'i cannot reach the network',
    'network offline',
    'connection timed out',
    'network error',
  ];

  if (silenceTokens.includes(clean)) return true;

  // Starts with bracketed/parenthesized noise description e.g. "[music]", "(silence)"
  if (/^\[.*\]$/.test(clean) || /^\(.*\)$/.test(clean)) return true;

  // Subtitles by / translated by hallucination
  if (clean.startsWith('subtitles by') || clean.startsWith('captioned by')) return true;

  return false;
}

// ─── Start Recording (manual mode — original, unchanged) ─────────────────────

export async function startVoiceRecording(
  callbacks: VoiceEngineCallbacks
): Promise<void> {
  if (_isPreparing) {
    console.log('[Voice] Already preparing, skipping startVoiceRecording.');
    return;
  }
  _isPreparing = true;

  try {
    if (_recording) {
      try { await _recording.stopAndUnloadAsync(); } catch (e) {}
      _recording = null;
      g.__expo_audio_recording = null;
    }
    _callbacks = callbacks;
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      callbacks.onError('Microphone permission denied');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    _recording = recording;
    g.__expo_audio_recording = recording;
    
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    _recordingStartTime = Date.now(); // BUG-H1 FIX: track start time
    callbacks.onStateChange('recording');
  } catch (err: any) {
    console.error('[Voice] Failed to start recording:', err);
    callbacks.onError(`Failed to start microphone: ${err.message}`);
    callbacks.onStateChange('idle');
  } finally {
    _isPreparing = false;
  }
}

// ─── Start VAD Recording (Capability 6 — auto-submit on silence) ─────────────

/**
 * Starts recording with Voice Activity Detection.
 * Monitors RMS amplitude every 100ms via expo-av metering.
 * After 1.5s of silence (dB < VAD_SILENCE_THRESHOLD), automatically
 * stops recording and calls stopAndTranscribe().
 *
 * This replaces the manual tap-to-stop button in voice mode.
 * Existing startVoiceRecording() is unchanged for manual mode.
 */
export async function startVADRecording(
  callbacks: VoiceEngineCallbacks,
  onVoiceDetected?: () => void  // Optional: fires when user starts speaking
): Promise<void> {
  if (_isPreparing) {
    console.log('[Voice] Already preparing, skipping startVADRecording.');
    return;
  }
  _isPreparing = true;

  // Clean up any existing VAD session
  _stopVAD();

  try {
    if (_recording) {
      try { await _recording.stopAndUnloadAsync(); } catch (e) {}
      _recording = null;
      g.__expo_audio_recording = null;
    }
    _callbacks = callbacks;
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      callbacks.onError('Microphone permission denied');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    // Enable audio metering so we can read dB levels
    // meteringEnabled is valid at runtime on Android/iOS but not always typed
    const recordingOptions = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      android: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
        meteringEnabled: true,
      } as any,
      ios: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
        meteringEnabled: true,
      } as any,
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
      },
    };
    const recording = new Audio.Recording();
    _recording = recording;
    g.__expo_audio_recording = recording;

    await recording.prepareToRecordAsync(recordingOptions);
    await recording.startAsync();

    _recordingStartTime = Date.now(); // BUG-H1 FIX: track start time for VAD mode too
    _vadActive = true;
    callbacks.onStateChange('recording');

    let hasSpeechStarted = false;
    let speechFrameCount = 0;

    // Poll RMS amplitude every 100ms
    _vadPollInterval = setInterval(async () => {
      if (!_vadActive || !_recording) return;

      try {
        const status = await _recording.getStatusAsync();
        if (!status.isRecording) return;

        const dbLevel = (status as any).metering ?? -160;
        _lastAudioLevel = dbLevel;

        const isSpeaking = dbLevel > VAD_SILENCE_THRESHOLD;

        if (isSpeaking) {
          speechFrameCount++;
          if (speechFrameCount >= 2 && !hasSpeechStarted) {
            hasSpeechStarted = true;
            onVoiceDetected?.();
          }
          if (_vadSilenceTimer) {
            clearTimeout(_vadSilenceTimer);
            _vadSilenceTimer = null;
          }
        } else {
          speechFrameCount = 0;
          // Silence detected — start/extend silence timer
          // Only trigger auto-submit if the user has spoken at least once
          if (hasSpeechStarted && !_vadSilenceTimer) {
            _vadSilenceTimer = setTimeout(() => {
              if (!_vadActive) return;
              console.log('[VAD] Silence detected for 1.5s — auto-submitting');
              _vadActive = false;
              _stopVAD();
              stopAndTranscribe(callbacks);
            }, VAD_SILENCE_DURATION_MS);
          }
        }
      } catch (e) {
        // Metering can fail on some devices — non-fatal
      }
    }, VAD_POLL_INTERVAL_MS);

  } catch (err: any) {
    console.error('[Voice/VAD] Failed to start:', err);
    callbacks.onError(`Failed to start microphone: ${err.message}`);
    callbacks.onStateChange('idle');
    _stopVAD();
  } finally {
    _isPreparing = false;
  }
}

function _stopVAD() {
  if (_vadPollInterval) {
    clearInterval(_vadPollInterval);
    _vadPollInterval = null;
  }
  if (_vadSilenceTimer) {
    clearTimeout(_vadSilenceTimer);
    _vadSilenceTimer = null;
  }
  _vadActive = false;
}

// ─── Stop Recording & Transcribe via Gemini ───────────────────────────────────

export async function stopAndTranscribe(
  callbacks: VoiceEngineCallbacks
): Promise<void> {
  // Stop VAD polling if it was active
  _stopVAD();

  try {
    _callbacks = callbacks;
    callbacks.onStateChange('processing');

    let audioUri: string | null = null;

    if (_recording) {
      // BUG-H1 FIX: Reject recordings under 600ms. Gemini rejects near-empty audio files,
      // causing silent failures. Give the user a clear, friendly error instead.
      const durationMs = Date.now() - _recordingStartTime;
      if (durationMs < 600) {
        await _recording.stopAndUnloadAsync();
        const shortUri = _recording.getURI();
        if (shortUri) FileSystem.deleteAsync(shortUri, { idempotent: true }).catch(() => {});
        _recording = null;
        g.__expo_audio_recording = null;
        callbacks.onError('Recording too short — hold the button and speak for at least 1 second.');
        callbacks.onStateChange('idle');
        return;
      }

      await _recording.stopAndUnloadAsync();
      audioUri = _recording.getURI() ?? null;
      console.log('[Voice] Recorded audio to:', audioUri);
      _recording = null;
      g.__expo_audio_recording = null;
    }

    if (!audioUri) {
      callbacks.onError('No recording found');
      callbacks.onStateChange('idle');
      return;
    }

    // Read the audio file as base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Clean up temp file
    FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => {});

    // Fast-path: If caller provides onAudioReady, directly forward base64 for One-Shot Structured Extraction
    if (callbacks.onAudioReady) {
      callbacks.onAudioReady(base64Audio);
      return;
    }

    // Transcribe via Gemini Proxy
    const transcript = await transcribeAudioViaProxy(base64Audio);

    if (!transcript || isSilenceOrNoise(transcript)) {
      callbacks.onError("No speech detected. Please try again.");
      callbacks.onStateChange('idle');
      return;
    }

    callbacks.onTranscript(transcript.trim());
    callbacks.onStateChange('idle');

  } catch (err: any) {
    console.error('[Voice] Transcription error:', err);
    callbacks.onError(`Voice error: ${err.message}`);
    callbacks.onStateChange('idle');
  }
}

// ─── Cancel Recording ─────────────────────────────────────────────────────────

export async function cancelVoiceRecording(): Promise<void> {
  // Stop VAD if active
  _stopVAD();

  try {
    if (_recording) {
      await _recording.stopAndUnloadAsync();
      const uri = _recording.getURI();
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      _recording = null;
      g.__expo_audio_recording = null;
    }
    _callbacks?.onStateChange('idle');
  } catch (e) {
    console.error('[Voice] Cancel error:', e);
  }
}

// ─── Get current VAD state ────────────────────────────────────────────────────

export function getVADState(): { isActive: boolean; lastDbLevel: number } {
  return { isActive: _vadActive, lastDbLevel: _lastAudioLevel };
}

export async function stopAndGetBase64(): Promise<string | null> {
  _stopVAD();
  try {
    if (!_recording) return null;
    await _recording.stopAndUnloadAsync();
    const audioUri = _recording.getURI();
    _recording = null;
    g.__expo_audio_recording = null;
    if (!audioUri) return null;
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => {});
    return base64Audio;
  } catch (err) {
    console.error('[Voice] stopAndGetBase64 error:', err);
    return null;
  }
}


