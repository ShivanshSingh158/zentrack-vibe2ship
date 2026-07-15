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

// ─── State ────────────────────────────────────────────────────────────────────

let _callbacks: VoiceEngineCallbacks | null = null;
let _recording: Audio.Recording | null = null;

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Start Recording ──────────────────────────────────────────────────────────

export async function startVoiceRecording(
  callbacks: VoiceEngineCallbacks
): Promise<void> {
  try {
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

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    _recording = recording;
    callbacks.onStateChange('recording');
  } catch (err: any) {
    console.error('[Voice] Failed to start recording:', err);
    callbacks.onError(`Failed to start microphone: ${err.message}`);
    callbacks.onStateChange('idle');
  }
}

// ─── Stop Recording & Transcribe via Gemini ───────────────────────────────────

export async function stopAndTranscribe(
  callbacks: VoiceEngineCallbacks
): Promise<void> {
  try {
    _callbacks = callbacks;
    callbacks.onStateChange('processing');

    let audioUri: string | null = null;

    if (_recording) {
      await _recording.stopAndUnloadAsync();
      audioUri = _recording.getURI() ?? null;
      console.log('[Voice] Recorded audio to:', audioUri);
      _recording = null;
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
  try {
    if (_recording) {
      await _recording.stopAndUnloadAsync();
      const uri = _recording.getURI();
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      _recording = null;
    }
    _callbacks?.onStateChange('idle');
  } catch (e) {
    console.error('[Voice] Cancel error:', e);
  }
}
