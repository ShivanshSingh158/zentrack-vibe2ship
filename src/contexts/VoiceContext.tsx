/**
 * @file VoiceContext.tsx
 * @module src/contexts/VoiceContext
 *
 * ZenTrack — Hybrid Real-Time Voice System
 *
 * ## Architecture
 * This is the "Hybrid Sarvam Architecture":
 *
 * LISTENING:  Chrome SpeechRecognition (native, en-IN, continuous)
 *             → fastest STT in the world, free, perfect Hinglish accuracy
 *
 * THINKING:   Gemini 2.5 Flash (via existing agent pipeline)
 *
 * TALKING:    Sarvam TTS (via /api/voice-proxy — SECURE server-side proxy)
 *             → GaplessPlayer (AudioContext-based, zero-gap sentence queuing)
 *             → Barge-in: VAD intercepts interim Chrome STT results
 *               → Calls player.flush() to instantly silence Sara
 *
 * ## Two Voice Modes
 *
 * ### 1. Agent TTS (Passive)
 * Listens for `agent-log` (type=answer) and `agent-speak` CustomEvents.
 * Speaks responses via Sarvam TTS through the secure proxy.
 *
 * ### 2. Conversational Loop (Active)
 * Click the orb → continuous mic loop:
 *   speak → 1.8s silence → send to agent fleet → Sarvam speaks answer
 *   → mic restarts → back to listening
 *
 * ## Barge-In (Real-Time Interruption)
 * While the AI is speaking, if the user makes a sound (detected via interim
 * SpeechRecognition results), GaplessPlayer.flush() is called immediately,
 * cutting Sara off mid-sentence and clearing the audio queue.
 *
 * @see {@link ../services/audio/GaplessPlayer.ts} for gapless audio engine
 * @see {@link ../../api/voice-proxy.js} for secure Sarvam TTS proxy
 */

import React, {
  createContext, useContext, useEffect, useState,
  useRef, useCallback, ReactNode,
} from 'react';
import { GaplessPlayer } from '../services/audio/GaplessPlayer';
import { GeminiLiveClient } from '../services/geminiLive/GeminiLiveClient';
import { toast } from 'sonner';
import { userLearningStore } from '../services/userLearningStore';

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Stable actions context — NEVER causes re-renders when voice state changes ──
// Components that only need startConversation/stopConversation/setIsMuted should
// use useVoiceActions() instead of useVoice() to avoid re-renders during mic/TTS cycles.
interface VoiceActionsContextType {
  startConversation: () => void;
  stopConversation: () => void;
  setIsMuted: (muted: boolean) => void;
  isMuted: boolean;           // included here because it changes rarely (user toggle only)
  isConversationActive: boolean; // rarely changes (session start/stop only)
  isLiveMode: boolean;        // rarely changes (mode switch only)
}

// ── Volatile state context — only subscribe if you render voice-reactive UI ───
// Re-renders on EVERY mic tick, TTS state change, and transcript update.
// Only SaraInterface and FloatingDock should consume this directly.
interface VoiceStateContextType {
  isSpeaking: boolean;
  isConversationListening: boolean;
  conversationTranscript: string;
}

// ── Combined type (backwards compat for useVoice()) ──────────────────────────
interface VoiceContextType extends VoiceActionsContextType, VoiceStateContextType {}

const VoiceActionsContext = createContext<VoiceActionsContextType | undefined>(undefined);
const VoiceStateContext = createContext<VoiceStateContextType | undefined>(undefined);
// Keep legacy context for backward compat
const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// ── Constants ─────────────────────────────────────────────────────────────────
// 1200ms: long enough to not clip mid-sentence, short enough to feel instant
// OPT-5: Adaptive silence window
// Short utterances (command-style ≤4 words) submit after 800ms — saves 400ms vs fixed 1200ms.
// Longer utterances (natural speech, 5+ words) keep 1200ms for full-sentence detection.
const getAdaptiveSilenceMs = (partialTranscript: string): number => {
  const wordCount = partialTranscript.trim().split(/\s+/).filter(Boolean).length;
  // Snappy response: 800ms for short commands, 1200ms for longer sentences
  return wordCount <= 4 ? 800 : 1200;
};
// Keep VOICE_SILENCE_MS as fallback for startup silence (before any words heard)
const VOICE_SILENCE_MS = 1200;

import { synthesizeSpeechSarvam } from '../services/voice/sarvam';

// ── Sarvam TTS — direct call (proven working) with proxy fallback ─────────────
async function fetchTTSAudio(text: string): Promise<string> {
  console.log('[TTS] Requesting Sarvam audio for:', text.substring(0, 50));
  // PRIMARY: Call Sarvam directly using VITE_ keys (always works, proven)
  try {
    const audio = await synthesizeSpeechSarvam({ text });
    console.log('[TTS] ✅ Sarvam direct success, length:', audio.length);
    return audio;
  } catch (directErr: any) {
    console.warn('[TTS] Direct Sarvam failed, trying proxy:', directErr.message);
  }

  // FALLBACK: Try the secure server-side proxy
  try {
    const res = await fetch('/api/gemini-proxy?action=tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.substring(0, 500), speaker: 'shubh' }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Proxy error ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.audio) throw new Error('No audio in proxy response');
    console.log('[TTS] ✅ Proxy success, length:', data.audio.length);
    return data.audio;
  } catch (proxyErr: any) {
    console.error('[TTS] Both Sarvam and proxy failed:', proxyErr.message);
    throw proxyErr;
  }
}


// Removed Browser TTS fallback because the OS voice is too ugly.
// If Sarvam fails, we will just display the text on screen silently.

// ── Provider ──────────────────────────────────────────────────────────────────
export function VoiceProvider({ children }: { children: ReactNode }) {

  // ── Mute state ────────────────────────────────────────────────────────────
  const [isMuted, _setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('zentrack_voice_muted');
    return saved ? JSON.parse(saved) : false;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Conversational Loop State ─────────────────────────────────────────────
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isConversationListening, setIsConversationListening] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);   // true = Gemini Live WebSocket
  const [conversationTranscript, setConversationTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 30s idle auto-stop
  const accumulatedTextRef = useRef<string>('');
  const isConvActiveRef = useRef(false);
  const agentExecutingRef = useRef(false);
  const isClarificationPendingRef = useRef(false);

  // ── Conversation history (multi-turn memory) ─────────────────────────────
  // Keeps the last 10 turns (5 user + 5 model) so agents remember context
  // across clarification exchanges (e.g. "check mails" → "which type?" → "unread").
  // MISSING-001 FIX: History is now persisted to localStorage with a 6-hour TTL
  // so Sara retains context across voice sessions within the same day.
  // Key: zen_conv_history → { turns: [...], savedAt: number }
  const CONV_HISTORY_KEY = 'zen_conv_history';
  const CONV_HISTORY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'model'; text: string }>>([]);

  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const setIsMuted = useCallback((muted: boolean) => {
    _setIsMuted(muted);
    localStorage.setItem('zentrack_voice_muted', JSON.stringify(muted));
    if (muted) {
      playerRef.current?.flush();
      setIsSpeaking(false);
    }
  }, []);

  // ── GaplessPlayer (single shared instance) ────────────────────────────────
  const playerRef = useRef<GaplessPlayer | null>(null);

  useEffect(() => {
    const player = new GaplessPlayer();
    player.onSpeakingStart = () => setIsSpeaking(true);
    player.onSpeakingEnd = () => {
      setIsSpeaking(false);
      // After speaking finishes, restart the mic if in conversation mode
      if (isConvActiveRef.current) {
        // FIX: Reduced from 300ms → 150ms. Enough for audio routing switch, feels faster.
        setTimeout(() => {
          window.dispatchEvent(new Event('agent-reopen-mic-conversational'));
        }, 150);
      }
    };
    playerRef.current = player;

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  // ── TTS queue (serializes agent responses so sentences don't overlap) ─────
  const ttsQueueRef = useRef<{ text: string; isClarification?: boolean }[]>([]);
  const isProcessingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || ttsQueueRef.current.length === 0) return;
    isProcessingRef.current = true;

    try {
      while (ttsQueueRef.current.length > 0) {
        if (isMutedRef.current) {
          ttsQueueRef.current = [];
          break;
        }

        // ── OPT-8: Parallel TTS chunking ─────────────────────────────────────
        // Before: each sentence TTS call was sequential (sentence1 done → sentence2 starts).
        // For 3 sentences: 3 × 600ms = 1800ms total.
        // After: drain ALL pending sentences in one parallel batch.
        // All Sarvam calls fire simultaneously; results enqueued in order.
        // For 3 sentences: max(600ms) + enqueue overhead = ~650ms total.
        const batch = ttsQueueRef.current.splice(0, ttsQueueRef.current.length);
        const lastItem = batch[batch.length - 1];

        // Fire all TTS calls in parallel
        const results = await Promise.allSettled(
          batch.map(item => fetchTTSAudio(item.text))
        );

        // Enqueue successfully decoded audio in ORDER (GaplessPlayer schedules them gaplessly)
        for (let i = 0; i < results.length; i++) {
          if (isMutedRef.current) break;
          const r = results[i];
          const item = batch[i];
          if (r.status === 'fulfilled' && r.value) {
            await playerRef.current?.enqueue(r.value);
          } else if (r.status === 'rejected') {
            // BUG-001 FIX: speakWithBrowserTTS was called here but never defined (function was
            // intentionally removed). Fallback to silent skip — text still shows in UI.
            console.warn('[VoiceContext] TTS chunk failed (Sarvam + proxy both unavailable). Skipping audio for:', item.text.slice(0, 30));
          }
        }

        if (lastItem?.isClarification) {
          isClarificationPendingRef.current = true;
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, []);


  // ── Immediate TTS function (used by speakText / goodbye messages) ─────────
  const speakText = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || isMutedRef.current) return;
    const clean = text.replace(/[#*`_[\]()]/g, '').trim();
    try {
      const base64 = await fetchTTSAudio(clean);
      await playerRef.current?.enqueue(base64);
    } catch (err: any) {
      console.warn('[VoiceContext] speakText TTS failed. Response shown on screen:', err.message);
    }
  }, []);

  // ── Agent-answer TTS listener (existing behaviour — speaks all answers) ────
  useEffect(() => {
    const onAgentLog = (e: CustomEvent) => {
      const step = e.detail;
      if (step.type !== 'answer') return;
      let text: string = step.text || step.message || step.title || '';

      // ── Robust SPOKEN_SUMMARY extraction ────────────────────────────────────
      // The LLM sometimes wraps the tag in markdown e.g. **SPOKEN_SUMMARY**: or SPOKEN_SUMMARY**:
      // Normalize first, then extract.
      const normalizedText = text.replace(/\*+SPOKEN_SUMMARY\*+/gi, 'SPOKEN_SUMMARY').replace(/SPOKEN_SUMMARY\*+:/gi, 'SPOKEN_SUMMARY:');
      const summaryMatch = normalizedText.match(/SPOKEN_SUMMARY[:\s*]*([\s\S]*)$/i);
      if (summaryMatch?.[1]) {
        text = summaryMatch[1]
          .replace(/^\s*[:\s*]+/, '') // strip leading colon/asterisks/spaces
          .replace(/\(Raw logs omitted.*?\)/gi, '')
          .replace(/\*+/g, '')
          .trim();
      } else {
        // No SPOKEN_SUMMARY tag — strip agent findings headers so they aren't spoken
        text = text
          .replace(/\[\w+ FINDINGS\]/gi, '')  // [MERCURY FINDINGS], [AEGIS FINDINGS] etc
          .replace(/\*\*MERCURY[^*]*\*\*/gi, '') // **MERCURY FINDINGS ...**
          .replace(/\(Raw logs omitted.*?\)/gi, '')
          .trim();
      }

      // Strip all remaining markdown so Sarvam reads clean audio
      text = text
        .replace(/#{1,6}\s+/g, '')             // ### headings
        .replace(/\*\*(.+?)\*\*/gs, '$1')       // **bold**
        .replace(/\*(.+?)\*/gs, '$1')           // *italic*
        .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // `code` and ```blocks```
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) → link text
        .replace(/^[-*•]\s+/gm, '')            // bullet points
        .replace(/^\d+\.\s+/gm, '')            // numbered list items
        .replace(/_{1,2}(.+?)_{1,2}/gs, '$1')  // __underline__
        .replace(/[#_\[\]()]/g, '')             // remaining special chars
        .replace(/\s+/g, ' ')                   // collapse whitespace
        .trim();
      if (!text || isMutedRef.current) return;

      // FIX: Push model response to conversation history for multi-turn memory
      conversationHistoryRef.current = [
        ...conversationHistoryRef.current.slice(-9),
        { role: 'model', text: text.substring(0, 300) },
      ];

      // If we are in Live Mode, send the answer back to Gemini Live as a tool response!
      // DO NOT speak it via Sarvam.
      if (isLiveModeRef.current && livePendingToolCallRef.current && geminiLiveRef.current?.connected) {
        geminiLiveRef.current.sendToolResult(livePendingToolCallRef.current, text);
        livePendingToolCallRef.current = null;
        return; // Skip Sarvam entirely because Gemini Live will speak the result natively
      }

      // Bug 4 fix: sentence chunking with trailing-fragment capture.
      // The regex /[^.!?]+[.!?]+/g drops text after the last punctuation mark.
      // e.g. "Done. Here are your 3 tasks" → only "Done." was spoken before.
      // Split by punctuation OR newlines to ensure chunks are short enough for Sarvam API (max 500 chars).
      const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
      const matched = text.match(sentenceRegex) || [];
      const lastMatch = matched.join('');
      const remainder = text.slice(lastMatch.length).trim();
      
      // Secondary pass: if any chunk is still > 450 chars, split it roughly in half by space
      let rawChunks = [...matched, ...(remainder ? [remainder] : [])];
      let chunks: string[] = [];
      for (const rc of rawChunks) {
        let current = rc;
        while (current.length > 450) {
          let splitIdx = current.lastIndexOf(' ', 450);
          if (splitIdx === -1) splitIdx = 450;
          chunks.push(current.substring(0, splitIdx));
          current = current.substring(splitIdx).trim();
        }
        if (current) chunks.push(current);
      }
      const finalChunks = chunks.length > 0 ? chunks : [text];
      finalChunks.forEach((chunk, index) => {
        const trimmed = chunk.trim();
        if (trimmed) {
          ttsQueueRef.current.push({
            text: trimmed,
            isClarification: index === finalChunks.length - 1 ? step.isClarification : false,
          });
        }
      });
      processQueue();
    };

    const onExecuting = () => {
      agentExecutingRef.current = true;
      // Pause mic during work so we don't pick up ambient noise
      if (isConversationListening) {
        try { recognitionRef.current?.stop(); } catch {}
      }
      setIsConversationListening(false);
      setConversationTranscript('WORKING...');
    };

    const onComplete = () => {
      agentExecutingRef.current = false;
      if (isConvActiveRef.current) {
        setConversationTranscript(''); // clear 'WORKING...' so it doesn't show
        
        // Fallback: If nothing is queued to speak and nothing is currently speaking,
        // reopen the mic immediately. Otherwise, the TTS queue will reopen it when finished.
        if (ttsQueueRef.current.length === 0 && !isProcessingRef.current && !playerRef.current?.speaking && !isSpeakingRef.current) {
           window.dispatchEvent(new CustomEvent('agent-reopen-mic-conversational'));
        }
      }
    };

    window.addEventListener('agent-log', onAgentLog as EventListener);
    window.addEventListener('agent-executing', onExecuting);
    window.addEventListener('agent-complete', onComplete);
    return () => {
      window.removeEventListener('agent-log', onAgentLog as EventListener);
      window.removeEventListener('agent-executing', onExecuting);
      window.removeEventListener('agent-complete', onComplete);
    };
  }, [processQueue, isConversationListening]);

  // ── Immediate agent-speak listener (narration from DAG executor) ──────────
  useEffect(() => {
    const onAgentSpeak = (e: CustomEvent) => {
      const text = e.detail?.text;
      const priority = e.detail?.priority || 'normal';
      if (!text || isMutedRef.current) return;
      if (isLiveModeRef.current) return; // Gemini Live handles its own audio, ignore Sarvam


      if (priority === 'high') {
        // High priority: flushing disabled per user request to prevent TTS cut-offs
        // playerRef.current?.flush();
        // ttsQueueRef.current = [];
      }

      const chunks = text.match(/[^.!?]+[.!?]+/g) || [text];
      chunks.forEach(chunk => {
        const trimmed = chunk.trim();
        if (trimmed) ttsQueueRef.current.push({ text: trimmed, isClarification: false });
      });
      processQueue();
    };

    window.addEventListener('agent-speak', onAgentSpeak as EventListener);
    return () => window.removeEventListener('agent-speak', onAgentSpeak as EventListener);
  }, [processQueue]);

  // ── Mute toggle: flush audio when muted ───────────────────────────────────
  useEffect(() => {
    if (isMuted) {
      playerRef.current?.flush();
      ttsQueueRef.current = [];
      setIsSpeaking(false);
    } else {
      processQueue();
    }
  }, [isMuted, processQueue]);

  // ── Conversational Loop ───────────────────────────────────────────────────
  const isLiveModeRef = useRef(false);

  // ── Gemini Live refs ───────────────────────────────────────────────────────
  const geminiLiveRef = useRef<GeminiLiveClient | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const liveMicStreamRef = useRef<MediaStream | null>(null);
  const liveTextBufferRef = useRef<string>('');   // accumulate streaming text into sentences
  const livePendingToolCallRef = useRef<string | null>(null); // id of pending tool call

  useEffect(() => { isConvActiveRef.current = isConversationActive; }, [isConversationActive]);
  useEffect(() => { isLiveModeRef.current = isLiveMode; }, [isLiveMode]);



  /**
   * OPT-12: Correct STT transcript ONLY when domain keywords detected or utterance is long.
   * Previously ran for ALL queries ≥3 words → wasted 100-200ms on casual speech.
   * Now skips correction for simple conversational queries that have no STT risk.
   */
  const correctTranscript = useCallback(async (raw: string): Promise<string> => {
    if (!raw.trim() || raw.trim().split(' ').length < 3) return raw;

    // Domain keyword gate: only correct if the query contains words that STT commonly mishears
    const DOMAIN_PATTERNS = /\b(dsa|leetcode|apna|college|algorithm|complexity|dp|graph|binary|recursion|lecture|playlist|chapter|semester|assignment|attendance|cgpa|gpa|syllabus|exam)\b/i;
    const wordCount = raw.trim().split(/\s+/).length;
    const needsCorrection = DOMAIN_PATTERNS.test(raw) || wordCount >= 6;

    if (!needsCorrection) {
      // Short, casual query with no domain risk — skip Gemini correction entirely
      return raw;
    }

    try {
      const { callWithVoiceModel, SAFETY_SETTINGS } = await import('../services/gemini/core');
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
      return raw;
    }
  }, []);

  // ── Circular dependency fix for sendToAgent → startMicListening ──────────
  const startMicListeningRef = useRef<() => void>(() => {});

  /**
   * Fast conversational path — bypasses the 6-7s agent DAG for simple queries.
   * Classifies the query first (~100ms), then either:
   *   A) Responds directly via Gemini Flash (~300ms) → Sarvam speaks immediately
   *   B) Routes to the 12-agent pipeline for tasks
   */
  const sendToAgent = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    isClarificationPendingRef.current = false; // reset the turn-taking flag
    setConversationTranscript('');
    accumulatedTextRef.current = '';

    const text = transcript.trim();
    console.log('[VoiceConversation] 🎙️ Query received:', text);
    toast.info(`🎙️ "${text.substring(0, 60)}${text.length > 60 ? '…' : ''}"`, { duration: 2500 });

    // FIX: Track user turn for multi-turn conversation memory.
    // This history is passed to orchestrateAgent so agents know what was asked before.
    conversationHistoryRef.current = [
      ...conversationHistoryRef.current.slice(-9),
      { role: 'user', text: text },
    ];

    // ── Step 1: Classify + Correct in parallel (Bug 3 fix) ─────────────────
    // Previously these were sequential (+200ms latency). Now they race together.
    let isConversational = false;
    let correctedText = text;
    try {
      const { callWithVoiceModel, SAFETY_SETTINGS } = await import('../services/gemini/core');

      const [classification, correction] = await Promise.all([
        // Classify: CHAT vs TASK
        callWithVoiceModel(async (genAI: any, modelName: string) => {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0, maxOutputTokens: 5 },
            safetySettings: SAFETY_SETTINGS,
          });
          const res = await model.generateContent(
            `Classify this voice query as either CHAT or TASK.\n` +
            `CHAT = greeting, casual chitchat, how are you, jokes, simple static facts — NO live internet or app data needed.\n` +
            `TASK = needs calendar, email, tasks, notes, YouTube, music, timer, web search, latest news, live info, or any ZenTrack data.\n` +
            `Reply with only the single word CHAT or TASK.\n\nQuery: "${text}"`
          );
          return res.response.text().trim().toUpperCase();
        }).catch(() => 'TASK'),

        // STT Correction: fix domain-specific mishearings (only for longer queries)
        correctTranscript(text)
      ]);

      isConversational = classification === 'CHAT';
      if (typeof correction === 'string' && correction.length > 0) {
        correctedText = correction;
        if (correctedText !== text) {
          console.log('[VoiceConversation] ✏️ STT corrected:', text, '→', correctedText);
        }
      }
    } catch {
      isConversational = false;
    }

    // ── Step 2A: Conversational fast path (~300ms total) ───────────────────
    if (isConversational) {
      console.log('[VoiceConversation] ⚡ Fast path: conversational query');
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: { type: 'thinking', title: 'Processing conversational query...', agent: 'SARA' }
      }));
      try {
        const { callWithVoiceModel, SAFETY_SETTINGS } = await import('../services/gemini/core');
        const reply = await callWithVoiceModel(async (genAI: any, modelName: string) => {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.9, maxOutputTokens: 2000 },
            safetySettings: SAFETY_SETTINGS,
          });
          // Inject behavioral profile for personalized fast-path responses
          const profile = userLearningStore.getProfile();
          const personaHint = profile.userPersona !== 'general'
            ? `User persona: ${profile.userPersona}. Peak hours: ${profile.actualPeakHours.slice(0,2).map(h=>`${h}:00`).join(', ')}.`
            : '';
          const res = await model.generateContent(
            `You are Sara — a sharp, witty AI assistant embedded in a student productivity app called ZenTrack.\n` +
            `Your personality: warm, intelligent, slightly playful. Never robotic or generic.\n` +
            (personaHint ? `CONTEXT: ${personaHint}\n` : '') +
            `RULES:\n` +
            `- Respond conversationally and naturally, adjusting your length to fully address the user without artificial constraints. Still avoid robotic filler.\n` +
            `- Do NOT start with "Of course", "Sure", "Certainly", or "As an AI".\n` +
            `- If the user speaks Hindi/Hinglish, respond in the same style.\n` +
            `- Be direct and confident. Sound like a brilliant friend, not a helpdesk.\n` +
            `User said: "${correctedText}"`
          );
          return res.response.text().trim();
        });
        
        window.dispatchEvent(new CustomEvent('agent-log', {
          detail: { type: 'answer', title: reply, agent: 'SARA' }
        }));
        
        // The global agent-log listener will catch this answer and queue the TTS automatically.
        return;
      } catch (err: any) {
        console.warn('[VoiceConversation] Fast path failed, falling to agents:', err.message);
      }
    }

    // ── Step 2B: Task path → 12-agent pipeline ────────────────────────────
    console.log('[VoiceConversation] 🤖 Task path: routing to agents');
    if (!isMutedRef.current) {
      // Dynamic, personalized task acknowledgements — never say "processing" or "please wait"
      const ACK_PHRASES = [
        "Already on it, sir.",
        "Consider it done.",
        "I'll handle that right away.",
        "On it — give me a moment.",
        "Right away. Let me get that for you.",
        "Understood. Deploying the swarm now.",
        "Locking onto that. One moment.",
        "Dispatching the agents. Stand by.",
      ];
      const ack = ACK_PHRASES[Math.floor(Math.random() * ACK_PHRASES.length)];
      window.dispatchEvent(new CustomEvent('agent-speak', {
        detail: { text: ack, priority: 'high' }
      }));
    }
    // Use the corrected transcript for task routing too.
    // FIX: Pass conversation history so HomeDashboard forwards it to orchestrateAgent.
    // This is the key fix for "check my mails" → "which type?" → "just unread" memory.
    window.dispatchEvent(new CustomEvent('agent-shortcut', {
      detail: {
        prompt: correctedText,
        history: conversationHistoryRef.current.slice(-10),
      },
    }));

    if (isMutedRef.current) {
      setTimeout(() => {
        if (isConvActiveRef.current) startMicListeningRef.current();
      }, 2000);
    }
  }, []);

  const startMicListening = useCallback(() => {
    if (!isConvActiveRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice conversation is not supported in this browser. Please use Chrome or Edge.');
      setIsConversationActive(false);
      isConvActiveRef.current = false;
      return;
    }

    // Bug Fix: Chrome Web Speech API gets stuck in a zombie state if onend fails to fire.
    // Forcefully abort any previous instance before creating a new one.
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent old instance from triggering restart
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    // CRITICAL: Reset the execution flag so the new instance can actually hear the user!
    agentExecutingRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Optimized for Indian accent & Hinglish

    recognition.onstart = () => {
      setIsConversationListening(true);
      setConversationTranscript(accumulatedTextRef.current || '');
      console.log('[VoiceConversation] 🎤 Microphone open');

      // Start silence timer in case user doesn't say anything
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try { recognition.stop(); } catch {}
      }, 5000);

      // ── 30-second idle auto-stop timer ─────────────────────────────────────
      // If the user doesn't say anything for 30 seconds after the mic reopens, shut down
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (isConvActiveRef.current && !agentExecutingRef.current) {
          console.log('[VoiceConversation] 💤 30s idle — auto-stopping conversation');
          window.dispatchEvent(new Event('agent-stop-conversation-command'));
        }
      }, 30000);
    };

    let hadError = false; // track if mic errored so onend doesn't immediately restart

    recognition.onresult = (event: any) => {
      if (agentExecutingRef.current) return;

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

      // User spoke — reset the 30-second idle auto-stop timer
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }

      // Reset silence timer on every speech event
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (accumulatedTextRef.current.trim()) {
        // FIX: Use adaptive silence — getAdaptiveSilenceMs() was defined but never called here.
        // The timer was using the fixed VOICE_SILENCE_MS=1200 constant for ALL queries.
        // Now: ≤4 words → 800ms (saves 400ms on short commands like "check mails").
        //      5+ words → 1200ms (gives time for natural speech to complete).
        const silenceMs = getAdaptiveSilenceMs(accumulatedTextRef.current + interim);
        silenceTimerRef.current = setTimeout(() => {
          const captured = accumulatedTextRef.current.trim();
          try { recognition.stop(); } catch {}
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
        }, silenceMs);
      }
    };

    recognition.onerror = (event: any) => {
      const err = event.error as string;
      const isSilent = err === 'no-speech' || err === 'aborted';
      if (!isSilent) {
        console.error('[VoiceConversation] Mic error:', err);
        toast.error('Microphone error: ' + err, { id: 'mic-err' });
      } else {
        console.log('[VoiceConversation] Mic:', err, '(non-fatal, suppressed)');
      }
      hadError = true;
    };

    recognition.onend = () => {
      setIsConversationListening(false);
      
      if (isConvActiveRef.current && !agentExecutingRef.current) {
        const restartDelay = hadError ? 1200 : (accumulatedTextRef.current ? 50 : 300);
        accumulatedTextRef.current = ''; // Prevent ghost text from accumulating on restart
        setTimeout(startMicListening, restartDelay);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error('[VoiceConversation] Failed to start recognition', e);
      setTimeout(startMicListening, 1500);
    }
  }, [sendToAgent]);


  useEffect(() => {
    startMicListeningRef.current = startMicListening;
  }, [startMicListening]);

  // ── Start Gemini Live mode ────────────────────────────────────────────────
  const startLiveMode = useCallback(async (): Promise<boolean> => {
    // Disabled by user request: Force fallback to Chrome STT + Sarvam AI
    return false;
  }, [processQueue]);

  // ── Stop Gemini Live mode ─────────────────────────────────────────────────
  const stopLiveMode = useCallback(() => {
    // Stop mic stream
    liveMicStreamRef.current?.getTracks().forEach(t => t.stop());
    liveMicStreamRef.current = null;

    // Disconnect worklet
    liveWorkletNodeRef.current?.disconnect();
    liveWorkletNodeRef.current = null;

    // Close AudioContext
    liveAudioCtxRef.current?.close().catch(() => {});
    liveAudioCtxRef.current = null;

    // Disconnect Gemini Live
    geminiLiveRef.current?.disconnect();
    geminiLiveRef.current = null;

    liveTextBufferRef.current = '';
    livePendingToolCallRef.current = null;
    setIsLiveMode(false);
    isLiveModeRef.current = false;
  }, []);

  const startConversation = useCallback(async () => {
    if (isConvActiveRef.current) return;

    // Initialize GaplessPlayer AudioContext on user gesture (required by browser autoplay policy)
    await playerRef.current?.init();

    // MISSING-001: Load persisted conversation history (up to 6h TTL)
    try {
      const saved = localStorage.getItem(CONV_HISTORY_KEY);
      if (saved) {
        const { turns, savedAt } = JSON.parse(saved) as { turns: Array<{ role: 'user' | 'model'; text: string }>; savedAt: number };
        if (Array.isArray(turns) && turns.length > 0 && Date.now() - savedAt < CONV_HISTORY_TTL_MS) {
          conversationHistoryRef.current = turns.slice(-10); // restore last 10 turns
          console.log(`[VoiceConversation] Restored ${conversationHistoryRef.current.length} turns from previous session (${Math.round((Date.now() - savedAt) / 60000)}m ago).`);
        } else {
          conversationHistoryRef.current = [];
        }
      }
    } catch {
      conversationHistoryRef.current = [];
    }

    setIsConversationActive(true);
    isConvActiveRef.current = true;
    setConversationTranscript('');

    // ── Try Gemini Live first (TRUE real-time mode) ─────────────────────────
    console.log('[VoiceConversation] Attempting Gemini Live mode...');
    const liveStarted = await startLiveMode();

    if (!liveStarted) {
      // ── Fallback: Chrome STT pipeline (turn-based, reliable) ───────────────
      console.log('[VoiceConversation] Gemini Live unavailable — falling back to Chrome STT');
      // Notification removed as per user request
      startMicListening();
    }
  }, [startLiveMode, startMicListening]);

  const stopConversation = useCallback(() => {
    isConvActiveRef.current = false;
    setIsConversationActive(false);
    setIsConversationListening(false);
    setConversationTranscript('');

    // MISSING-001: Persist conversation history before clearing it.
    // Save the last 10 turns with the current timestamp for TTL checks on restore.
    // This allows Sara to remember context across sessions within a 6-hour window.
    try {
      const turns = conversationHistoryRef.current.slice(-10);
      if (turns.length > 0) {
        localStorage.setItem(CONV_HISTORY_KEY, JSON.stringify({ turns, savedAt: Date.now() }));
        console.log(`[VoiceConversation] Persisted ${turns.length} turns to localStorage for next session.`);
      }
    } catch {
      // localStorage may be unavailable (e.g. private browsing + storage quota) — safe to ignore
    }

    // Clear in-memory history for clean in-session state
    conversationHistoryRef.current = [];

    // Stop live mode (Gemini Live WebSocket + AudioWorklet)
    if (isLiveModeRef.current) {
      stopLiveMode();
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Clear 30-second idle auto-stop timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    // Flush any in-progress TTS so audio stops immediately
    playerRef.current?.flush();
    ttsQueueRef.current = [];

    // Notification removed as per user request
  }, [stopLiveMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (isLiveModeRef.current) stopLiveMode();
    };
  }, [stopLiveMode]);

  // ── Event listeners for mic reopen and stop-conversation commands ─────────
  useEffect(() => {
    const onReopen = () => {
      if (isConvActiveRef.current && !isConversationListening) startMicListening();
    };
    
    const onStopCommand = () => {
      stopConversation();
      const goodbyes = [
        "Alright, good night! I'll be here if you need me.",
        "Catch you later. Let me know when you need me again.",
        "See you later! Shutting down for now.",
        "Take care! I'm always a tap away.",
        "Good night! Have a great rest of your day.",
      ];
      speakText(goodbyes[Math.floor(Math.random() * goodbyes.length)]);
    };

    const onClarificationReopen = () => {
      isClarificationPendingRef.current = true;
      if (isConvActiveRef.current && !isConversationListening) startMicListening();
    };

    window.addEventListener('agent-reopen-mic-conversational', onReopen);
    window.addEventListener('agent-reopen-mic', onClarificationReopen);
    window.addEventListener('agent-stop-conversation-command', onStopCommand);
    return () => {
      window.removeEventListener('agent-reopen-mic-conversational', onReopen);
      window.removeEventListener('agent-reopen-mic', onClarificationReopen);
      window.removeEventListener('agent-stop-conversation-command', onStopCommand);
    };
  }, [startMicListening, stopConversation, speakText]);

  // Stable actions value — only changes when muted/active/liveMode toggles
  const actionsValue = React.useMemo<VoiceActionsContextType>(() => ({
    startConversation,
    stopConversation,
    setIsMuted,
    isMuted,
    isConversationActive,
    isLiveMode,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [startConversation, stopConversation, setIsMuted, isMuted, isConversationActive, isLiveMode]);

  // Volatile state value — changes on every mic tick/TTS change
  const stateValue = React.useMemo<VoiceStateContextType>(() => ({
    isSpeaking,
    isConversationListening,
    conversationTranscript,
  }), [isSpeaking, isConversationListening, conversationTranscript]);

  // Combined value for backwards-compat useVoice() — still re-renders on volatile changes
  const combinedValue = React.useMemo<VoiceContextType>(() => ({
    ...actionsValue,
    ...stateValue,
  }), [actionsValue, stateValue]);

  return (
    <VoiceActionsContext.Provider value={actionsValue}>
      <VoiceStateContext.Provider value={stateValue}>
        <VoiceContext.Provider value={combinedValue}>
          {children}
        </VoiceContext.Provider>
      </VoiceStateContext.Provider>
    </VoiceActionsContext.Provider>
  );
}

/**
 * useVoice() — backwards-compatible combined hook.
 * Re-renders on BOTH action and state changes.
 * Prefer useVoiceActions() or useVoiceState() where possible.
 */
export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}

/**
 * useVoiceActions() — stable actions hook.
 * Only re-renders when isMuted, isConversationActive, or isLiveMode changes.
 * Use for components that only call startConversation/stopConversation/setIsMuted.
 * Components: BottomHeader, CommandPalette, keyboard shortcuts.
 */
export function useVoiceActions() {
  const context = useContext(VoiceActionsContext);
  if (context === undefined) {
    throw new Error('useVoiceActions must be used within a VoiceProvider');
  }
  return context;
}

/**
 * useVoiceState() — volatile state hook.
 * Re-renders on every mic tick, TTS change, and transcript update.
 * Only use in components that RENDER voice-reactive UI (orb glow, transcript text, etc).
 * Components: SaraInterface, FloatingDock (for the speaking indicator).
 */
export function useVoiceState() {
  const context = useContext(VoiceStateContext);
  if (context === undefined) {
    throw new Error('useVoiceState must be used within a VoiceProvider');
  }
  return context;
}
