/**
 * @file VoiceContext.tsx
 * @module src/contexts/VoiceContext
 *
 * React Context provider for ZenTrack's voice system.
 *
 * ## Two Voice Capabilities
 *
 * ### 1. Agent TTS (Passive)
 * Listens for `agent-log` CustomEvents of type `answer` from the agent fleet
 * and speaks the response via the Sarvam TTS API. Falls back to browser TTS
 * if Sarvam is unavailable. Responses are queued (`ttsQueueRef`) to prevent
 * audio overlap when multiple agents respond quickly.
 *
 * ### 2. Conversational Voice Loop (Active)
 * A real-time, hands-free conversation mode:
 * ```
 * User speaks
 *     → Browser SpeechRecognition (continuous mode, lang: en-IN)
 *     → Silence detected after 1800ms of no speech
 *     → Gemini LLM corrects domain-specific STT mishearings
 *     → agent-shortcut CustomEvent dispatched to HomeDashboard
 *     → Agent fleet processes the command
 *     → SPOKEN_SUMMARY extracted from agent answer
 *     → Sarvam TTS speaks the response
 *     → Mic auto-restarts → back to listening
 * ```
 *
 * ## Key Design Decisions
 *
 * - **Ref-based state for audio** — `ttsQueueRef`, `isPlayingRef`, and
 *   `recognitionRef` use refs (not state) to avoid re-render loops during audio
 *   playback and mic handling.
 *
 * - **Circular dependency fix** — `sendToAgent` calls `startMicListening` via a
 *   `startMicListeningRef` to avoid a circular `useCallback` dependency chain that
 *   caused "Cannot access 'Q' before initialization" in production builds.
 *
 * - **Muted mode** — When `isMuted=true`, TTS is skipped but the mic still restarts
 *   via `startMicListeningRef.current()` after a 2s delay.
 *
 * ## Consumed By
 * - `SaraInterface.tsx` — reads `startConversation`, `stopConversation`,
 *   `isConversationActive`, `isConversationListening`, `isSpeaking`
 * - `TopNav.tsx` — reads `isMuted`, `toggleMute`
 *
 * @see {@link ../services/voice/sarvamStream.ts} for STT implementation
 * @see {@link ../hooks/useAgentVoice.ts} for command input mic handling
 */


import React, {
  createContext, useContext, useEffect, useState,
  useRef, useCallback, ReactNode,
} from 'react';
import { synthesizeSpeechSarvam, speakWithBrowserTTS } from '../services/voice/sarvam';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoiceContextType {
  /** Whether agent TTS output is muted */
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  /** True while Sarvam TTS audio is playing */
  isSpeaking: boolean;

  // ── Conversational loop ───────────────────────────────────────────────────
  /** True when the voice conversation session is active */
  isConversationActive: boolean;
  /** True while the mic is open and listening for user speech */
  isConversationListening: boolean;
  /** Start the real-time voice conversation loop */
  startConversation: () => void;
  /** End the real-time voice conversation loop */
  stopConversation: () => void;
  /** Live partial transcript from Sarvam STT while user is speaking */
  conversationTranscript: string;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// ── Constants ─────────────────────────────────────────────────────────────────
// How long of a silence after last speech before we send the query to the agent
const VOICE_SILENCE_MS = 1800;

// ── Provider ──────────────────────────────────────────────────────────────────
export function VoiceProvider({ children }: { children: ReactNode }) {

  // ── Mute / TTS state ──────────────────────────────────────────────────────
  const [isMuted, _setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('zentrack_voice_muted');
    // ✅ FIX: Default to false (voice ON) so agent responses are audible on first use.
    // Previously defaulted to true — users never heard any voice until manually unmuting.
    return saved ? JSON.parse(saved) : false;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);

  const setIsMuted = useCallback((muted: boolean) => {
    _setIsMuted(muted);
    localStorage.setItem('zentrack_voice_muted', JSON.stringify(muted));
  }, []);

  // ── AudioContext (shared, resumed on first interaction) ───────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = useCallback(async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ── TTS queue (for agent answers) ─────────────────────────────────────────
  const ttsQueueRef = useRef<{text: string, isClarification?: boolean}[]>([]);
  const isProcessingRef  = useRef(false);

  const playBase64Audio = useCallback(async (base64: string): Promise<void> => {
    const ctx = await getAudioCtx();
    const binary = window.atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    setIsSpeaking(true);
    return new Promise<void>(resolve => {
      source.onended = () => { setIsSpeaking(false); resolve(); };
      source.start(0);
    });
  }, [getAudioCtx]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || ttsQueueRef.current.length === 0) return;
    isProcessingRef.current = true;

    try {
      while (ttsQueueRef.current.length > 0) {
        const item = ttsQueueRef.current[0];
        try {
          const base64 = await synthesizeSpeechSarvam({ text: item.text });
          await playBase64Audio(base64);
          if (item.isClarification && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-reopen-mic'));
          }
        } catch (err: any) {
          const isRateLimit = err.message?.includes('rate-limited') || err.message?.includes('429') || err.message?.includes('TTS failed');
          const isKeyError = err.message?.includes('API key') || err.message?.includes('401');

          if (isRateLimit) {
            // ✅ FALLBACK: Sarvam rate-limited → use browser TTS instantly (no wait)
            console.warn('[VoiceContext] Sarvam rate-limited, using browser TTS fallback');
            setIsSpeaking(true);
            try {
              await speakWithBrowserTTS(item.text);
            } finally {
              setIsSpeaking(false);
            }
          } else if (isKeyError) {
            toast.error('Sarvam API key missing. Set VITE_SARVAM_API_KEY.', { id: 'sarvam-key-err' });
          } else {
            console.error('[VoiceContext] TTS error:', err.message);
          }
        }
        ttsQueueRef.current.shift();
      }
    } finally {
      isProcessingRef.current = false;
      setIsSpeaking(false);
      
      // ✅ Restart conversational mic after speaking finishes (if mode is active)
      if (isConvActiveRef.current) {
        setTimeout(() => {
          window.dispatchEvent(new Event('agent-reopen-mic-conversational'));
        }, 300);
      }
    }
  }, [playBase64Audio]);

  // ── Agent-answer TTS listener (existing behaviour) ────────────────────────
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    const onAgentLog = (e: CustomEvent) => {
      // We now allow all answers to flow into the global TTS queue.
      // processQueue will automatically handle restarting the mic for conversational mode.
      
      const step = e.detail;
      if (step.type !== 'answer') return;
      let text: string = step.text || step.message || step.title || '';
      
      // ✅ Extract spoken summary if present, otherwise read full text
      const summaryMatch = text.match(/SPOKEN_SUMMARY:\s*([\s\S]*)$/i);
      if (summaryMatch && summaryMatch[1]) {
        text = summaryMatch[1];
      }
      
      text = text.replace(/[#*`_]/g, '').trim();
      if (!text || isMutedRef.current) return;
      ttsQueueRef.current.push({ text, isClarification: step.isClarification });
      processQueue();
    };

    window.addEventListener('agent-log', onAgentLog as EventListener);
    return () => window.removeEventListener('agent-log', onAgentLog as EventListener);
  }, [processQueue]);

  // ── Immediate TTS listener (bypass UI side-effects) ───────────────────────
  useEffect(() => {
    const onAgentSpeak = (e: CustomEvent) => {
      const text = e.detail?.text;
      if (!text || isMutedRef.current) return;
      ttsQueueRef.current.push({ text, isClarification: false });
      processQueue();
    };

    window.addEventListener('agent-speak', onAgentSpeak as EventListener);
    return () => window.removeEventListener('agent-speak', onAgentSpeak as EventListener);
  }, [processQueue]);

  useEffect(() => {
    if (!isMuted) {
      processQueue();
    } else {
      ttsQueueRef.current = [];
      setIsSpeaking(false);
    }
  }, [isMuted, processQueue]);

  // ── Conversational Loop ───────────────────────────────────────────────────
  const [isConversationActive,   setIsConversationActive]   = useState(false);
  const [isConversationListening, setIsConversationListening] = useState(false);
  const [conversationTranscript,  setConversationTranscript]  = useState('');

  // We use the browser's SpeechRecognition API for the conversational loop
  // (Sarvam WebSocket STT requires the separate gateway server to be running;
  //  the browser Web Speech API works out-of-the-box in Chrome/Edge with no server).
  // When the Sarvam gateway IS running, the SarvamAudioStreamer in useAgentVoice
  // handles STT for the command bar. This loop uses the native API for zero-latency
  // always-on conversation without needing the gateway.
  const recognitionRef     = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const isConvActiveRef    = useRef(false);
  const isSpeakingRef      = useRef(false);

  useEffect(() => { isConvActiveRef.current = isConversationActive; }, [isConversationActive]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  /**
   * Speak text via Sarvam TTS and return a promise that resolves
   * when audio finishes playing.
   */
  const speakText = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return;
    const clean = text.replace(/[#*`_[\]()]/g, '').trim();
    try {
      const base64 = await synthesizeSpeechSarvam({ text: clean });
      await playBase64Audio(base64);
    } catch (err: any) {
      console.warn('[VoiceConversation] TTS failed, skipping audio:', err.message);
    }
  }, [playBase64Audio]);

  /**
   * Correct STT transcript with Gemini Flash Lite.
   * Fixes common mishearings for tech/education domain terms before routing to agent.
   * This runs in <200ms and dramatically improves accuracy.
   */
  const correctTranscript = useCallback(async (raw: string): Promise<string> => {
    if (!raw.trim() || raw.trim().split(' ').length < 3) return raw; // skip tiny inputs
    try {
      const { callWithVoiceModel, SAFETY_SETTINGS } = await import('../services/gemini/core');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const result = await callWithVoiceModel(async (genAI: any, modelName: string) => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0, maxOutputTokens: 200 },
          safetySettings: SAFETY_SETTINGS,
        });
        const res = await model.generateContent(`You are a speech-to-text corrector for a student productivity app.
Fix common STT mishearings in the following transcript. Focus on:
- Tech/CS terms: "DSA" (Data Structures & Algorithms), "LeetCode", "Apna College", "lecture"
- Course names, playlist names, channel names
- Numbers spoken as words: "twenty three" → "23"
- Common Indian English: "na" = "no", "kal" = "tomorrow"
- Do NOT change the meaning. Only fix obvious mishearings.
- Return ONLY the corrected text. Nothing else.

Raw transcript: "${raw}"`);
        return res.response.text().trim();
      });
      return (typeof result === 'string' && result.length > 0) ? result : raw;
    } catch {
      return raw; // gracefully fall back to original on error
    }
  }, []);

  /**
   * Send accumulated transcript to the Sara agent loop.
   * The agent fires window events with its answer; we intercept the final
   * 'answer' event to speak it, then restart listening.
   */
  // ✅ CRASH FIX: Use a ref so sendToAgent can call startMicListening without creating
  // a circular dependency (sendToAgent → startMicListening → sendToAgent).
  // The circular dep caused "Cannot access 'Q' before initialization" in production builds.
  const startMicListeningRef = useRef<() => void>(() => {});

  const sendToAgent = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    setConversationTranscript('');
    accumulatedTextRef.current = '';

    // ✅ STT CORRECTION: Fix domain-specific mishearings before sending to agent
    const corrected = await correctTranscript(transcript);
    const finalTranscript = corrected || transcript;

    console.log('[VoiceConversation] 🎙️ Sending to agent:', finalTranscript, corrected !== transcript ? `(corrected from: "${transcript}")` : '');
    toast.info(`🎙️ "${finalTranscript.substring(0, 60)}${finalTranscript.length > 60 ? '…' : ''}"`, { duration: 3000 });

    // Fire a synthetic agent-shortcut event so HomeDashboard's handleExecuteCommand runs
    window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: finalTranscript } }));

    // ✅ FIX: If voice is muted, the TTS queue never drains so processQueue never restarts the mic.
    // Use startMicListeningRef (not the direct fn) to avoid circular dep.
    if (isMutedRef.current) {
      setTimeout(() => {
        if (isConvActiveRef.current) {
          startMicListeningRef.current();
        }
      }, 2000); // Give agent 2s to register the command, then listen again
    }
    // In unmuted mode, processQueue restarts the mic after TTS finishes playing (existing behavior).
  }, [speakText, correctTranscript]);

  /**
   * Open the microphone and start listening for speech.
   * On final transcript → silence → send to agent.
   */
  const startMicListening = useCallback(() => {
    if (!isConvActiveRef.current) return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error('Your browser does not support speech recognition. Use Chrome or Edge.');
      return;
    }

    // Cleanup any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
    recognitionRef.current = recognition;

    recognition.lang = 'en-IN'; // English (India) — best for Hinglish
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    accumulatedTextRef.current = '';

    recognition.onstart = () => {
      setIsConversationListening(true);
      console.log('[VoiceConversation] 🎤 Microphone open');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalPart = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalPart += t + ' ';
        } else {
          interim = t;
        }
      }

      if (finalPart) {
        accumulatedTextRef.current += finalPart;
      }

      const display = (accumulatedTextRef.current + interim).trim();
      setConversationTranscript(display);

      // Reset silence timer on every speech event
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (accumulatedTextRef.current.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          const captured = accumulatedTextRef.current.trim();
          recognition.stop();
          setIsConversationListening(false);
          
          // 🔥 Auto-sleep command detection
          const lower = captured.toLowerCase().replace(/[^a-z ]/g, '').trim();
          if (/^(turn off|good night|goodnight|go to sleep|stop listening|shut down|quit|exit|bye|goodbye|see you)$/i.test(lower)) {
            window.dispatchEvent(new Event('agent-stop-conversation-command'));
            return;
          }

          if (captured) {
            sendToAgent(captured);
          } else if (isConvActiveRef.current) {
            setTimeout(startMicListening, 300);
          }
        }, VOICE_SILENCE_MS);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' && isConvActiveRef.current) {
        // No speech detected — restart mic silently
        setTimeout(startMicListening, 500);
        return;
      }
      if (event.error === 'aborted') return; // intentional stop
      console.warn('[VoiceConversation] Mic error:', event.error);
    };

    recognition.onend = () => {
      setIsConversationListening(false);
    };

    recognition.start();
  }, [sendToAgent]);

  // ✅ CRASH FIX: Keep startMicListeningRef always pointing to the latest version.
  // This allows sendToAgent to call startMicListening via ref without creating a
  // circular hook dependency that caused "Cannot access 'Q' before initialization".
  useEffect(() => {
    startMicListeningRef.current = startMicListening;
  }, [startMicListening]);


  const startConversation = useCallback(async () => {

    if (isConvActiveRef.current) return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error('Voice conversation requires Chrome or Edge browser.');
      return;
    }

    setIsConversationActive(true);
    isConvActiveRef.current = true;
    setConversationTranscript('');

    toast.success('🎙️ Voice conversation started! Speak naturally — Sara is listening.', { duration: 4000 });

    // ✅ FIX: Pre-warm microphone permission in parallel with greeting TTS.
    // We request mic access NOW so by the time the greeting finishes playing,
    // the mic is already initialized and opens instantly (removes 1-2s delay).
    let prewarmStream: MediaStream | null = null;
    try {
      prewarmStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Permission denied or unavailable — startMicListening will handle the error
    }

    // Greet the user dynamically based on time of day
    // (TTS greeting removed for instant mic activation)

    // Release the pre-warm stream — startMicListening creates its own
    if (prewarmStream) {
      prewarmStream.getTracks().forEach(t => t.stop());
    }

    startMicListening();
  }, [speakText, startMicListening]);

  const stopConversation = useCallback(() => {
    isConvActiveRef.current = false;
    setIsConversationActive(false);
    setIsConversationListening(false);
    setConversationTranscript('');

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    toast.info('Voice conversation ended.', { duration: 2000 });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onReopen = () => {
      if (isConvActiveRef.current) startMicListening();
    };
    const onStopCommand = () => {
      stopConversation();
      
      const goodbyes = [
        "Alright, good night! I'll be here if you need me.",
        "Catch you later. Let me know when you need me again.",
        "See you later! Shutting down for now.",
        "Take care! I'm always a tap away.",
        "Good night! Have a great rest of your day."
      ];
      const randomGoodbye = goodbyes[Math.floor(Math.random() * goodbyes.length)];
      speakText(randomGoodbye);
    };
    window.addEventListener('agent-reopen-mic-conversational', onReopen);
    window.addEventListener('agent-stop-conversation-command', onStopCommand);
    return () => {
      window.removeEventListener('agent-reopen-mic-conversational', onReopen);
      window.removeEventListener('agent-stop-conversation-command', onStopCommand);
    };
  }, [startMicListening, stopConversation, speakText]);

  return (
    <VoiceContext.Provider value={{
      isMuted,
      setIsMuted,
      isSpeaking,
      isConversationActive,
      isConversationListening,
      startConversation,
      stopConversation,
      conversationTranscript,
    }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
