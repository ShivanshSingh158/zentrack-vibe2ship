/**
 * useAgentVoice — Continuous speech recognition with silence-detection submit.
 *
 * Uses the Web Speech API in continuous mode so the recognition never stops
 * on natural mid-sentence pauses. The command is submitted automatically
 * after SILENCE_THRESHOLD_MS of no new speech — not on first pause.
 *
 * Returns:
 *  - isListening       — whether the mic is currently open
 *  - silencePercent    — 0-100, progress toward auto-submit (drives countdown ring)
 *  - interimTranscript — live partial speech (not yet finalized)
 *  - toggleListening   — start/stop the mic
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';

const SILENCE_THRESHOLD_MS = 1800;

interface UseAgentVoiceOptions {
  onCommand: (text: string) => void;
  commandInput: string;
  setCommandInput: (value: string | ((prev: string) => string)) => void;
}

export function useAgentVoice({ onCommand, commandInput, setCommandInput }: UseAgentVoiceOptions) {
  const [isListening,       setIsListening]       = useState(false);
  const [silencePercent,    setSilencePercent]     = useState(0);
  const [interimTranscript, setInterimTranscript]  = useState('');

  // Keep a ref to commandInput so event handler closures see the latest value
  const commandInputRef  = useRef(commandInput);
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef  = useRef<number>(0);
  const silenceAnimRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { commandInputRef.current = commandInput; }, [commandInput]);

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = useMemo(() => {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.continuous     = true;  // Never stop on natural pauses
    r.interimResults = true;  // Stream partial transcript live
    r.lang = 'en-US';
    return r;
  }, [SpeechRecognition]);

  const cancelSilenceCountdown = useCallback(() => {
    if (silenceTimerRef.current)  { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current  = null; }
    if (silenceAnimRef.current)   { clearInterval(silenceAnimRef.current);   silenceAnimRef.current   = null; }
    setSilencePercent(0);
  }, []);

  const startSilenceCountdown = useCallback(() => {
    silenceStartRef.current = Date.now();
    setSilencePercent(0);
    if (silenceAnimRef.current) clearInterval(silenceAnimRef.current);
    silenceAnimRef.current = setInterval(() => {
      const elapsed = Date.now() - silenceStartRef.current;
      const pct = Math.min(100, (elapsed / SILENCE_THRESHOLD_MS) * 100);
      setSilencePercent(pct);
      if (pct >= 100 && silenceAnimRef.current) {
        clearInterval(silenceAnimRef.current);
        silenceAnimRef.current = null;
      }
    }, 50);
  }, []);

  const submitAfterSilence = useCallback(() => {
    const captured = commandInputRef.current.trim();
    if (!captured) return;
    recognition?.stop();
    setIsListening(false);
    setInterimTranscript('');
    cancelSilenceCountdown();
    setTimeout(() => onCommand(captured), 80);
  }, [recognition, cancelSilenceCountdown, onCommand]);

  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimTranscript(interim);
      if (finalChunk) {
        setCommandInput(prev => prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim());
      }
      // Every new word resets the silence timer
      cancelSilenceCountdown();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(submitAfterSilence, SILENCE_THRESHOLD_MS);
      startSilenceCountdown();
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return; // Normal — keep waiting
      console.error('[Voice] Recognition error:', event.error);
      setIsListening(false);
      setInterimTranscript('');
      cancelSilenceCountdown();
    };

    recognition.onend = () => {
      cancelSilenceCountdown();
      setInterimTranscript('');
      const captured = commandInputRef.current.trim();
      if (captured && isListening) {
        setIsListening(false);
        setTimeout(() => onCommand(captured), 80);
      } else {
        setIsListening(false);
      }
    };
  }, [recognition, submitAfterSilence, isListening, cancelSilenceCountdown, startSilenceCountdown, setCommandInput, onCommand]);

  const toggleListening = useCallback(() => {
    if (!recognition) {
      toast.error('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    if (isListening) {
      recognition.stop();
      cancelSilenceCountdown();
      setIsListening(false);
      const captured = commandInputRef.current.trim();
      if (captured) setTimeout(() => onCommand(captured), 80);
    } else {
      setCommandInput('');
      try {
        recognition.start();
        setIsListening(true);
        toast.info("🎙️ Listening... speak naturally. I'll send when you stop.", { duration: 3000 });
      } catch {
        try { recognition.stop(); } catch {}
        setTimeout(() => {
          try { recognition.start(); setIsListening(true); } catch {}
        }, 300);
      }
    }
  }, [recognition, isListening, cancelSilenceCountdown, onCommand, setCommandInput]);

  return { isListening, silencePercent, interimTranscript, toggleListening };
}
