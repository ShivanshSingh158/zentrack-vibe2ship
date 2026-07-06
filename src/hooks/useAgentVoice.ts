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
import { SarvamAudioStreamer } from '../services/voice/sarvamStream';

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
  const [playbackVolume,    setPlaybackVolume]     = useState(0);

  // Keep a ref to commandInput so event handler closures see the latest value
  const commandInputRef  = useRef(commandInput);
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef  = useRef<number>(0);
  const silenceAnimRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { commandInputRef.current = commandInput; }, [commandInput]);

  const streamerRef = useRef<SarvamAudioStreamer | null>(null);

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
    if (streamerRef.current) {
      streamerRef.current.stopListening();
      streamerRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
    cancelSilenceCountdown();
    setTimeout(() => onCommand(captured), 80);
  }, [cancelSilenceCountdown, onCommand]);

  useEffect(() => {
    return () => {
      if (streamerRef.current) {
        streamerRef.current.stopListening();
      }
    };
  }, []);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      if (streamerRef.current) {
        streamerRef.current.stopListening();
        streamerRef.current = null;
      }
      cancelSilenceCountdown();
      setIsListening(false);
      const captured = commandInputRef.current.trim();
      if (captured) setTimeout(() => onCommand(captured), 80);
    } else {
      setCommandInput('');
      try {
        streamerRef.current = new SarvamAudioStreamer();
        
        streamerRef.current.onTranscript = (text, isFinal) => {
          if (isFinal) {
            setCommandInput(prev => prev ? `${prev} ${text.trim()}` : text.trim());
            setInterimTranscript('');
          } else {
            setInterimTranscript(text);
          }
          
          cancelSilenceCountdown();
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(submitAfterSilence, SILENCE_THRESHOLD_MS);
          startSilenceCountdown();
        };

        streamerRef.current.onVolumeChange = (vol) => setPlaybackVolume(vol);

        await streamerRef.current.startListening();
        setIsListening(true);
        toast.info("🎙️ Listening securely via Sarvam Gateway...", { duration: 3000 });
      } catch (err) {
        toast.error('Could not connect to microphone or Gateway.');
        setIsListening(false);
      }
    }
  }, [isListening, cancelSilenceCountdown, onCommand, setCommandInput, submitAfterSilence, startSilenceCountdown]);

  // ── Auto-reopen mic for clarifications ──
  useEffect(() => {
    const handleReopen = () => {
      if (!isListening) toggleListening();
    };
    window.addEventListener('agent-reopen-mic', handleReopen);
    return () => window.removeEventListener('agent-reopen-mic', handleReopen);
  }, [isListening, toggleListening]);

  return { isListening, silencePercent, interimTranscript, playbackVolume, toggleListening };
}
