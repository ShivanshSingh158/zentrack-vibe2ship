import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudioViaProxy } from './geminiProxy';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

export interface VoiceEngineCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
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
const VAD_SILENCE_THRESHOLD = -50;     // dB level below which = silence (expo-av metering)
const VAD_SILENCE_DURATION_MS = 1500;  // 1.5s silence → auto-submit

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
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
          // Speech detected — clear silence timer
          if (!hasSpeechStarted) {
            hasSpeechStarted = true;
            onVoiceDetected?.();
          }
          if (_vadSilenceTimer) {
            clearTimeout(_vadSilenceTimer);
            _vadSilenceTimer = null;
          }
        } else {
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

    // Transcribe via Gemini Proxy
    const transcript = await transcribeAudioViaProxy(base64Audio);

    if (!transcript || transcript.trim().length === 0) {
      callbacks.onError("Couldn't hear that clearly. Please try again.");
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


