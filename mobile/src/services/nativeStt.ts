/**
 * nativeStt.ts — Native OS Speech-to-Text Engine
 *
 * Uses `expo-speech-recognition` to access the native OS SpeechRecognizer:
 *   - Android: android.speech.SpeechRecognizer (same engine as Gboard)
 *   - iOS: SFSpeechRecognizer (Apple's Speech framework)
 *
 * This provides Gboard-level STT quality:
 *   - ~200ms latency to first word (streaming interim results)
 *   - No API cost (runs on-device / OS cloud)
 *   - No LLM hallucinations ("[silence]", "Thank you.")
 *   - Same callback interface as voiceEngine.ts for drop-in usage
 *
 * Fallback: If native STT is unavailable on a device, consumers should
 * fall back to the existing Gemini-based transcription in voiceEngine.ts.
 */

import type {
  ExpoSpeechRecognitionNativeEventMap,
} from 'expo-speech-recognition';
import type { EventSubscription } from 'expo-modules-core';

// Safely resolve native module at runtime without crashing if running on a pre-existing APK build
let ExpoSpeechRecognitionModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const speechModule = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechModule?.ExpoSpeechRecognitionModule ?? null;
} catch (err) {
  console.warn('[NativeSTT] Native module ExpoSpeechRecognition not available in current APK binary:', err);
}

// ── Types ────────────────────────────────────────────────────────────────────

export type NativeSttState = 'idle' | 'listening' | 'processing' | 'error';

export interface NativeSttCallbacks {
  /** Called when the STT state changes */
  onStateChange: (state: NativeSttState) => void;
  /** Called with streaming interim text while user speaks (isFinal=false)
   *  and the final committed transcript (isFinal=true) */
  onResult: (text: string, isFinal: boolean) => void;
  /** Called with native mic audio volume for live visualizer reaction */
  onVolumeChange?: (volume: number) => void;
  /** Called on error */
  onError: (error: string) => void;
}

// ── Internal State ───────────────────────────────────────────────────────────

let _isListening = false;
let _latestTranscript = '';
let _hasDeliveredFinal = false;
let _callbacks: NativeSttCallbacks | null = null;
let _removeResultListener: EventSubscription | null = null;
let _removeVolumeListener: EventSubscription | null = null;
let _removeErrorListener: EventSubscription | null = null;
let _removeEndListener: EventSubscription | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if native speech recognition is available on this device.
 */
export async function isNativeSttAvailable(): Promise<boolean> {
  if (!ExpoSpeechRecognitionModule) return false;
  try {
    const result = await ExpoSpeechRecognitionModule.getStateAsync();
    // If we can query the state, the module is available
    return result != null;
  } catch {
    return false;
  }
}

/**
 * Request speech recognition permissions (mic + speech).
 * Returns true if both permissions are granted.
 */
export async function requestSttPermissions(): Promise<boolean> {
  if (!ExpoSpeechRecognitionModule) return false;
  try {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return result?.granted ?? false;
  } catch (err) {
    console.warn('[NativeSTT] Permission request failed:', err);
    return false;
  }
}

/**
 * Start native speech recognition with streaming interim results.
 *
 * This is the primary entry point. Words appear in ~200ms as the user speaks.
 * The native engine handles silence detection and auto-stops.
 *
 * @param callbacks - Event callbacks for state changes, results, and errors
 * @param options - Optional configuration overrides
 */
export async function startNativeStt(
  callbacks: NativeSttCallbacks,
  options?: {
    lang?: string;
    continuous?: boolean;
  }
): Promise<void> {
  if (!ExpoSpeechRecognitionModule) {
    callbacks.onError('Native speech recognition is not installed in this APK build.');
    callbacks.onStateChange('error');
    return;
  }

  // Prevent double-start
  if (_isListening) {
    console.log('[NativeSTT] Already listening, stopping first...');
    stopNativeStt();
  }

  _callbacks = callbacks;
  _latestTranscript = '';
  _hasDeliveredFinal = false;

  // Request permissions
  const hasPermission = await requestSttPermissions();
  if (!hasPermission) {
    callbacks.onError('Speech recognition permission denied');
    callbacks.onStateChange('error');
    return;
  }

  try {
    // Clean up any previous listeners
    _removeListeners();

    // Register event listeners BEFORE starting
    _removeResultListener = ExpoSpeechRecognitionModule.addListener(
      'result',
      (event: ExpoSpeechRecognitionNativeEventMap['result']) => {
        if (!_callbacks) return;

        // CRITICAL BUG FIX: event.results is an array of candidate hypothesis alternatives
        // (N-best hypothesis candidates) sorted by highest confidence first!
        // event.results[0] is the top, most accurate transcription.
        // Previously: .map(r => r.transcript).join(' ') concatenated ALL 5 alternative guesses
        // into a single repeating sentence!
        const topTranscript = (event.results?.[0]?.transcript || '').trim();

        const isFinal = event.isFinal ?? false;

        if (topTranscript) {
          _latestTranscript = topTranscript;
          if (isFinal) {
            _hasDeliveredFinal = true;
          }
          _callbacks.onResult(topTranscript, isFinal);
        }

        // On final result, auto-stop only if continuous mode is explicitly false
        if (isFinal && options?.continuous === false) {
          _isListening = false;
          _callbacks.onStateChange('idle');
        }
      }
    );

    // Audio level meter listener
    try {
      _removeVolumeListener = ExpoSpeechRecognitionModule.addListener(
        'volumechange',
        (event: ExpoSpeechRecognitionNativeEventMap['volumechange']) => {
          if (_callbacks?.onVolumeChange && event && typeof event.value === 'number') {
            _callbacks.onVolumeChange(event.value);
          }
        }
      );
    } catch {
      // Non-critical if volume listener is unsupported on older OS
    }

    _removeErrorListener = ExpoSpeechRecognitionModule.addListener(
      'error',
      (event: ExpoSpeechRecognitionNativeEventMap['error']) => {
        if (!_callbacks) return;

        const errorCode = event.error;
        const errorMsg = event.message || `Speech recognition error: ${errorCode}`;

        _isListening = false;

        // If we already have captured spoken text, do NOT drop it on trailing timeout!
        if (!_hasDeliveredFinal && _latestTranscript.trim().length > 0) {
          console.log('[NativeSTT] Preserving captured speech on error:', _latestTranscript);
          _hasDeliveredFinal = true;
          _callbacks.onResult(_latestTranscript.trim(), true);
          _callbacks.onStateChange('idle');
          return;
        }

        // "no-speech" / "speech-timeout" when nothing was spoken
        if (errorCode === 'no-speech' || errorCode === 'speech-timeout') {
          _callbacks.onError('No speech detected. Tap mic to speak.');
        } else if (errorCode === 'aborted') {
          console.log('[NativeSTT] Recognition aborted.');
        } else {
          console.warn('[NativeSTT] Error:', errorCode, errorMsg);
          _callbacks.onError(errorMsg);
        }

        _callbacks.onStateChange('idle');
      }
    );

    _removeEndListener = ExpoSpeechRecognitionModule.addListener(
      'end',
      () => {
        _isListening = false;
        if (_callbacks) {
          // If speech was spoken before engine ended and final result hasn't been emitted yet, commit it now!
          if (!_hasDeliveredFinal && _latestTranscript.trim().length > 0) {
            _hasDeliveredFinal = true;
            _callbacks.onResult(_latestTranscript.trim(), true);
          }
          _callbacks.onStateChange('idle');
        }
      }
    );

    // Start the native recognizer in continuous ramble mode with maxAlternatives: 1
    ExpoSpeechRecognitionModule.start({
      lang: options?.lang || 'en-IN',     // Indian English by default
      interimResults: true,                // Stream words live as user speaks
      maxAlternatives: 1,                  // Return only the top-confidence hypothesis
      continuous: options?.continuous ?? true, // Continuous ramble by default!
      requiresOnDeviceRecognition: false,  // Allow network for best recognition
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'free_form',
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
      } as any,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 80,
      },
    });

    _isListening = true;
    callbacks.onStateChange('listening');
    console.log('[NativeSTT] Started native continuous speech recognition (maxAlternatives: 1)');

  } catch (err: any) {
    console.error('[NativeSTT] Failed to start:', err);
    callbacks.onError(`Failed to start speech recognition: ${err.message}`);
    callbacks.onStateChange('error');
    _isListening = false;
  }
}

/**
 * Stop the native speech recognizer.
 * Commits any pending speech before exiting.
 */
export function stopNativeStt(): void {
  try {
    if (_isListening && ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
      _isListening = false;
      console.log('[NativeSTT] Stopped.');
    }
    // Deliver captured speech as final immediately if not already finalized
    if (!_hasDeliveredFinal && _callbacks && _latestTranscript.trim().length > 0) {
      _hasDeliveredFinal = true;
      _callbacks.onResult(_latestTranscript.trim(), true);
    }
  } catch (err) {
    console.warn('[NativeSTT] Stop error:', err);
  }
}

/**
 * Abort the native speech recognizer immediately.
 * Unlike stop(), this discards any pending results.
 */
export function abortNativeStt(): void {
  try {
    if (ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.abort();
    }
    _isListening = false;
    _latestTranscript = '';
    _hasDeliveredFinal = false;
    _removeListeners();
    if (_callbacks) {
      _callbacks.onStateChange('idle');
    }
    console.log('[NativeSTT] Aborted.');
  } catch (err) {
    console.warn('[NativeSTT] Abort error:', err);
  }
}

/**
 * Check if native STT is currently listening.
 */
export function isNativeSttListening(): boolean {
  return _isListening;
}

/**
 * Get the latest transcript accumulated so far.
 */
export function getLatestTranscript(): string {
  return _latestTranscript;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function _removeListeners(): void {
  if (_removeResultListener) {
    _removeResultListener.remove();
    _removeResultListener = null;
  }
  if (_removeVolumeListener) {
    _removeVolumeListener.remove();
    _removeVolumeListener = null;
  }
  if (_removeErrorListener) {
    _removeErrorListener.remove();
    _removeErrorListener = null;
  }
  if (_removeEndListener) {
    _removeEndListener.remove();
    _removeEndListener = null;
  }
}
