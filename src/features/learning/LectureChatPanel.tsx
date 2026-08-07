import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send, Loader2, Trash2, Bot, User,
  AlertCircle, LogOut, ChevronDown,
  Copy, Check, Flag, BookOpen, Zap, HelpCircle,
  Maximize2, Minimize2,
} from 'lucide-react';
import { callGeminiProxyStream, callGeminiProxy, extractGeminiText } from '../../services/gemini/geminiClient';
import { auth, db } from '../../services/firebase';
import { addDoc, collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

// Global Learning Context — cross-video memory stored in localStorage

// ── Global Learning Context helpers ──────────────────────────────────────────

interface VideoSummary { videoId: string; title: string; summary: string; ts: number; }

const loadGlobalCtx = (): VideoSummary[] => {
  try { return JSON.parse(localStorage.getItem(GLOBAL_CTX_KEY) || '[]'); } catch { return []; }
};
const saveVideoToGlobalCtx = (vs: VideoSummary) => {
  try {
    const ctx = loadGlobalCtx().filter(v => v.videoId !== vs.videoId);
    ctx.unshift(vs);
    localStorage.setItem(GLOBAL_CTX_KEY, JSON.stringify(ctx.slice(0, MAX_GLOBAL_CTX)));
  } catch { /* ignore */ }
};
const buildGlobalCtxString = (currentVideoId: string): string => {
  const ctx = loadGlobalCtx().filter(v => v.videoId !== currentVideoId);
  if (ctx.length === 0) return '';
  const lines = ctx.map(v => `  - "${v.title}": ${v.summary}`).join('\n');
  return `\n\n=== STUDENT'S RECENT LECTURE HISTORY (last ${ctx.length} videos) ===\nYou may reference these to make comparisons or connect concepts:\n${lines}\n=== END HISTORY ===`;
};

// ── Types ─────────────────────────────────────────────────────────────────────

import type { ChatMessage } from './ChatMessage';
import { ChatMessageBubble, TypingDots } from './ChatMessage';

interface LectureChatPanelProps {
  videoId: string;
  videoTitle: string;
  topicName: string;
  onClose: () => void;
  isFullscreen?: boolean;
  progressPct?: number;
  completedTopics?: string[];
  totalProgress?: { completed: number; total: number };
  onMarkDoubt?: (videoId: string) => void;
  autoTriggerMessage?: string | null;
  onAutoTriggerComplete?: () => void;
}

// ── Firestore chat persistence ─────────────────────────────────────────────────

const chatDocRef = (userId: string, videoId: string) =>
  doc(db, 'lectureChats', userId, 'videos', videoId);

const loadHistoryFromFirestore = async (userId: string, videoId: string): Promise<ChatMessage[]> => {
  try {
    const snap = await getDoc(chatDocRef(userId, videoId));
    if (!snap.exists()) return [];
    return (snap.data().messages as ChatMessage[]) || [];
  } catch { return []; }
};

const saveHistoryToFirestore = async (userId: string, videoId: string, msgs: ChatMessage[]) => {
  try {
    const trimmed = msgs.slice(-100);
    await setDoc(chatDocRef(userId, videoId), { messages: trimmed, updatedAt: Date.now() }, { merge: true });
  } catch { /* ignore */ }
};

// ── YouTube Transcript Fetcher & Fallback ───────────────────────────────────

const fetchYouTubeTranscript = async (videoId: string): Promise<{ transcript: string; source: string; error: string | null }> => {
  try {
    const { auth } = await import('../../services/firebase');
    const idToken = await auth.currentUser?.getIdToken() ?? '';
    const res = await fetch(`/api/transcript?videoId=${videoId}`, {
      headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (data.transcript && data.transcript.length > 50) {
        return { transcript: data.transcript, source: 'captions', error: null };
      }
    }
  } catch (e: any) {
    return { transcript: '', source: 'none', error: e?.message || 'Server error' };
  }
  return { transcript: '', source: 'none', error: 'No transcript found via server' };
};

const GEMINI_VIDEO_TIMEOUT_MS = 25000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const analyzeVideoWithGemini = async (
  videoId: string,
  videoTitle: string,
): Promise<{ analysis: string; error: string | null }> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const timeoutFallback = { analysis: '', error: 'Timed out after 25s — video may be too long for real-time analysis' };

  const work = (async (): Promise<{ analysis: string; error: string | null }> => {
    try {
      const data = await callGeminiProxy({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: youtubeUrl, mimeType: 'video/mp4' } } as any,
            {
              text: `Analyze this YouTube lecture: "${videoTitle}".
Produce a DETAILED breakdown with:
## Overview (2-3 sentences)
## Timestamped Breakdown — every 2-3 min: [MM:SS] what is taught, code shown, examples
## Key Concepts — every concept/algorithm/technique
## Code Examples — reproduce any code shown (specify language)
## Key Takeaways
Be precise. Reproduce exact code from the screen.`,
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 4096 },
      });
      const analysis = extractGeminiText(data);
      if (!analysis || analysis.length < 50) return { analysis: '', error: 'Gemini returned empty analysis' };
      return { analysis, error: null };
    } catch (e: any) {
      return { analysis: '', error: e?.message || 'Gemini video analysis failed' };
    }
  })();

  return withTimeout(work, GEMINI_VIDEO_TIMEOUT_MS, timeoutFallback);
};

const fetchLectureContext = async (
  videoId: string,
  videoTitle: string,
): Promise<{ content: string; source: 'captions' | 'gemini-vision' | 'none'; error: string | null }> => {
  const captionResult = await fetchYouTubeTranscript(videoId);
  if (captionResult.transcript) {
    return { content: captionResult.transcript, source: 'captions', error: null };
  }
  const geminiResult = await analyzeVideoWithGemini(videoId, videoTitle);
  if (geminiResult.analysis) {
    return { content: geminiResult.analysis, source: 'gemini-vision', error: null };
  }
  return {
    content: '',
    source: 'none',
    error: `Server: ${captionResult.error || 'none'} | Gemini Vision: ${geminiResult.error || 'failed'}`,
  };
};

// ── Doubt detection ───────────────────────────────────────────────────────────


const DOUBT_PATTERNS = [
  /i don'?t understand/i, /i('m| am) confused/i,
  /can you explain/i, /i('m| am) lost/i,
  /this is confusing/i, /not getting it/i,
  /i don'?t get/i, /please (clarify|explain)/i,
];
const isDoubtMessage = (text: string) => DOUBT_PATTERNS.some(r => r.test(text));

// ── Follow-up question parser ─────────────────────────────────────────────────

const parseFollowUps = (text: string): string[] => {
  const match = text.match(/💡\s*\*?\*?Ask next:\*?\*?\s*(.+)/i);
  if (!match) return [];
  const raw = match[1];
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (quoted.length > 0) return quoted.slice(0, 3);
  return raw.split(/[·|]/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length > 5).slice(0, 3);
};

const stripFollowUpLine = (text: string): string =>
  text.replace(/\n*💡\s*\*?\*?Ask next:\*?\*?.*$/im, '').trim();

// ── System prompt builder ─────────────────────────────────────────────────────

const buildSystemInstruction = (
  videoTitle: string, topicName: string, transcript?: string,
  progressPct?: number, completedTopics?: string[],
  totalProgress?: { completed: number; total: number }, globalCtx?: string,
) => `You are Zen Tutor — a world-class expert educator and pedagogy specialist embedded inside ZenTrack.
The student is watching: 📺 "${videoTitle}" — 📚 Topic: "${topicName}"
${progressPct !== undefined ? `Topic progress: ~${progressPct}% of videos watched.` : ''}
${totalProgress ? `Overall course progress: ${totalProgress.completed}/${totalProgress.total} videos completed.` : ''}
${completedTopics && completedTopics.length > 0 ? `Their completed topics: ${completedTopics.slice(0, 6).join(', ')}.` : ''}
${globalCtx || ''}

== THE 8 LAWS OF ZEN TUTORING (NEVER BREAK) ==

1. RICHARD FEYNMAN TECHNIQUE: You MUST explain concepts simply, as if teaching a beginner. Strip away all jargon. Use clear, vivid, everyday analogies. If the student doesn't understand, you have failed to explain it simply enough.

2. CODE = WORKING + EXPLAINED: For any code question, provide:
   a) A minimal working code example (< 30 lines if possible)
   b) A line-by-line explanation of the key parts
   c) One common mistake beginners make
   Use \`\`\`language\ncode\n\`\`\` blocks always.
   ADAPTIVE LANGUAGE: Always use the coding language the student asks for, or detect it from the transcript. If unsure, ask which language they prefer before writing code.

3. ANALOGIES ARE MANDATORY: For abstract concepts, you MUST provide a real-world analogy before the technical explanation. E.g., "Think of a pointer like a sticky note with someone's address written on it — the note isn't the house, it just tells you where the house is."

4. CONFUSION DETECTION: If a student says "I don't get it", "confused", "can you explain again", or similar — NEVER repeat the same explanation. Instead:
   a) Ask: "Which specific part is unclear — [concept A] or [concept B]?"
   b) Break it into the smallest possible step
   c) Use a different analogy

5. CROSS-TOPIC CONNECTIONS: When you detect concepts from their completed topics, actively make connections. E.g., "You already know recursion from your Trees topic — this is the exact same pattern applied to graphs."

6. FOLLOW-UP QUESTIONS: End EVERY response with 2 specific, intellectually curious follow-up questions that will naturally deepen their understanding:
   💡 **Ask next:** "Question 1?" · "Question 2?"
   Questions must be specific to THIS video's content, not generic.

7. QUIZ MODE (triggered by "quiz me", "test me", "give me questions"):
   - Generate exactly 3 MCQ questions labeled Q1, Q2, Q3
   - Each question must test application/understanding, not memorization
   - Difficulty: Q1 = conceptual, Q2 = applied, Q3 = tricky edge case
   - Options labeled (A) (B) (C) (D)
   - Do NOT reveal answers until the student responds
   - After they answer, explain WHY each option is right/wrong

8. NOTE-SAVING (triggered by "save this", "note this down", "add to notes"):
   - Start with ## [Clear Title]
   - Structure: Key concept → How it works → Code example → When to use it
   - Make it a self-contained reference they can study from later

== RESPONSE FORMAT ==
- **bold** for key terms, \`inline code\` for snippets, fenced code blocks with language for all code
- Numbered lists for steps/processes, bullets for features/options/comparisons
- Use markdown headers (## and ###) to organise detailed responses
- For mathematical content: use LaTeX inline ($formula$) and block ($$formula$$)
- Write as deeply as the topic demands — never artificially truncate a response
- Complex concepts deserve full explanations with multiple examples, edge cases, and analogies
- Never start with "Sure!", "Of course!", "Great question!" — get directly to the explanation
- Always finish every thought completely. If a response is long, that means the topic deserved it.

${transcript
    ? `=== VIDEO TRANSCRIPT (with timestamps) ===
Reference timestamps precisely: "At 4:32, she explains..." — quote the video directly when answering transcript-specific questions.

${transcript}
=== END TRANSCRIPT ===`
    : '(No transcript available — answer from the video title, topic context, and your deep expert knowledge of this subject.)'}`;

// ── Main Component ────────────────────────────────────────────────────────────

export const LectureChatPanel: React.FC<LectureChatPanelProps> = ({
  videoId, videoTitle, topicName, onClose, isFullscreen = false,
  progressPct, completedTopics, totalProgress, onMarkDoubt,
  autoTriggerMessage, onAutoTriggerComplete
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatError, setChatError] = useState('');
  const [transcriptStatus, setTranscriptStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const systemRef = useRef(buildSystemInstruction(videoTitle, topicName, undefined, progressPct, completedTopics, totalProgress));
  const contentsRef = useRef<any[]>([]);
  const userId = auth.currentUser?.uid || '';

  const persistMessages = useCallback((msgs: ChatMessage[]) => {
    if (userId && videoId) saveHistoryToFirestore(userId, videoId, msgs);
  }, [userId, videoId]);

  const [transcriptSource, setTranscriptSource] = useState<'captions' | 'gemini-vision' | 'none' | 'loading'>('loading');

  // ── Load transcript + history ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return; // Wait for Firebase Auth session to restore

    setTranscriptStatus('loading');
    setTranscriptSource('loading');
    setMessages([]);
    contentsRef.current = [];

    Promise.all([
      fetchLectureContext(videoId, videoTitle),
      userId ? loadHistoryFromFirestore(userId, videoId) : Promise.resolve([] as ChatMessage[]),
    ]).then(([context, history]) => {
      const globalCtx = buildGlobalCtxString(videoId);
      systemRef.current = buildSystemInstruction(videoTitle, topicName, context.content || undefined, progressPct, completedTopics, totalProgress, globalCtx);
      setTranscriptStatus(context.content ? 'ready' : 'unavailable');
      setTranscriptSource(context.source);
      setMessages(history);
      contentsRef.current = history.filter(m => !m.error).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    }).catch(() => {
      setTranscriptStatus('unavailable');
      setTranscriptSource('none');
    });
  }, [videoId, videoTitle, topicName, userId, progressPct]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const NOTE_TRIGGERS = [/save\s+(this|that)\s+to\s+(my\s+)?notes?/i, /add\s+(this|that)\s+to\s+(my\s+)?notes?/i, /note\s+(this|that)\s+down/i, /save\s+(this|that)\s+as\s+a\s+note/i];

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;
    if (!overrideText) setInput('');
    setIsLoading(true); setChatError('');

    if (isDoubtMessage(text) && onMarkDoubt) {
      onMarkDoubt(videoId);
      toast('🚩 Lecture flagged for review!', { duration: 2500 });
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now() };
    const newContents = [...contentsRef.current, { role: 'user', parts: [{ text }] }];
    contentsRef.current = newContents;
    setMessages(prev => { const n = [...prev, userMsg]; persistMessages(n); return n; });

    try {
      const msgId = crypto.randomUUID?.() || Date.now().toString();
      const placeholder: ChatMessage = { id: msgId, role: 'model', text: '', ts: Date.now() };
      setMessages(prev => [...prev, placeholder]);

      const generator = callGeminiProxyStream({
        contents: newContents,
        systemInstruction: { parts: [{ text: systemRef.current }] },
        generationConfig: { maxOutputTokens: 32768, temperature: 0.7 }
      });

      let aiText = '';
      for await (const chunk of generator) {
        aiText += chunk;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: aiText } : m));
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }

      const followUps = parseFollowUps(aiText);
      const cleanText = stripFollowUpLine(aiText);
      const finalMsg: ChatMessage = { id: msgId, role: 'model', text: cleanText, ts: Date.now(), model: 'gemini-2.5-flash', followUps };
      contentsRef.current = [...newContents, { role: 'model', parts: [{ text: cleanText }] }];
      setMessages(prev => { const n = prev.map(m => m.id === msgId ? finalMsg : m); persistMessages(n); return n; });

      saveVideoToGlobalCtx({ videoId, title: videoTitle, summary: `Asked: "${text.slice(0, 60)}" — Topic: ${topicName}`, ts: Date.now() });

      // Auto-save to notes
      if (NOTE_TRIGGERS.some(r => r.test(text)) && auth.currentUser) {
        try {
          const noteDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          await addDoc(collection(db, 'storage_nodes'), {
            userId: auth.currentUser.uid, type: 'note',
            name: `📚 ${videoTitle} — ${noteDate}`,
            content: `## 📺 From Lecture: ${videoTitle}\n> **Topic:** ${topicName}\n> **Saved:** ${noteDate}\n\n---\n\n${cleanText}`,
            parentId: null, createdAt: Date.now(), updatedAt: Date.now(),
            source: 'lecture_chat', videoId,
          });
          toast.success('✅ Saved to your Notes!');
        } catch { toast.error('Could not save to Notes.'); }
      }
    } catch (err: any) {
      const errMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', text: err.message || 'AI failed to respond.', ts: Date.now(), error: true };
      contentsRef.current = contentsRef.current.slice(0, -1);
      setChatError(err.message || 'Request failed. Please try again.');
      setMessages(prev => { const n = [...prev, errMsg]; persistMessages(n); return n; });
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isLoading, videoId, videoTitle, topicName, persistMessages, onMarkDoubt]);

  // ── Auto-trigger external message (e.g. Quiz) ──────────────────────────────
  useEffect(() => {
    if (autoTriggerMessage && !isLoading) {
      sendMessage(autoTriggerMessage);
      if (onAutoTriggerComplete) onAutoTriggerComplete();
    }
  }, [autoTriggerMessage, isLoading, sendMessage, onAutoTriggerComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = async () => {
    setMessages([]); contentsRef.current = []; setChatError('');
    if (userId) { try { await setDoc(chatDocRef(userId, videoId), { messages: [], updatedAt: Date.now() }); } catch { /* ignore */ } }
  };

  const panelWidth = isFullscreen ? '390px' : '340px';

  const QUICK_ACTIONS = [
    { label: '🧪 Quiz Me', icon: <HelpCircle size={11} />, prompt: 'Quiz me on what we just covered. Give me 3 multiple-choice questions (A/B/C/D). Label them Q1, Q2, Q3. Do NOT reveal the answers yet.', accent: '130,170,255' },
    { label: '⚡ Key Points', icon: <Zap size={11} />, prompt: 'Give me a concise bullet-point summary of the key concepts from this lecture.', accent: '199,146,234' },
    { label: '📖 Examples', icon: <BookOpen size={11} />, prompt: 'Show me 2 practical real-world examples of the main concept in this lecture with code if applicable.', accent: '195,232,141' },
    { label: '💾 Save to Notes', icon: <Copy size={11} />, prompt: 'Save the key concepts of this lecture to my notes.', accent: '139,92,246' },
  ];

  return (
    <div style={{
      width: panelWidth, flexShrink: 0, display: 'flex', flexDirection: 'column',
      height: isFullscreen ? '100%' : '650px',
      maxHeight: isFullscreen ? '100%' : '650px',
      background: '#212121',
      border: '1px solid #303030',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      boxSizing: 'border-box', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', borderBottom: '1px solid #303030', background: '#212121', flexShrink: 0 }}>
        {/* ZEN-GPT Logo */}
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ececec', letterSpacing: '-0.01em' }}>ZEN-GPT</div>
          <div style={{ fontSize: '0.65rem', color: '#6b6b6b', marginTop: '0.1rem' }}>
            {transcriptStatus === 'ready' ? 'Knowledge base active' : transcriptStatus === 'loading' ? 'Analyzing lecture...' : 'Standard mode'}
          </div>
        </div>

        <button onClick={clearChat} title="Clear chat" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', padding: '0.25rem', borderRadius: '5px', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', padding: '0.25rem', borderRadius: '5px', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
          <X size={13} />
        </button>
      </div>

      {/* ── Chat ── */}
      <>
        {/* Messages scrollable area */}
          <div ref={chatRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <div data-lenis-prevent style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '1rem 0.85rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', scrollbarWidth: 'thin', scrollbarColor: 'rgba(130,170,255,0.12) transparent' }}>

              {/* Welcome / empty state */}
              {messages.length === 0 && !isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2rem 0.5rem 1rem', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ececec', marginBottom: '0.5rem' }}>How can I help you today?</div>
                    <div style={{ fontSize: '0.75rem', color: '#8e8e8e', lineHeight: 1.6, maxWidth: '280px' }}>
                      {transcriptSource === 'captions' ? (
                        <>✅ <strong>YouTube captions loaded</strong> — I know this lecture in precise detail. Let's dive deep.</>
                      ) : transcriptSource === 'gemini-vision' ? (
                        <>🧠 <strong>Gemini Video AI</strong> analyzed this lecture directly. I watched the video and heard the audio. Let's dive deep.</>
                      ) : transcriptSource === 'none' ? (
                        <>❌ <strong>Could not analyze video.</strong> I will answer from general knowledge of the topic.</>
                      ) : (
                        <>Loading lecture context...</>
                      )}
                    </div>
                  </div>
                  {/* Starter chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
                    {['Explain the key concept', 'Show me a code example', 'Quiz me', 'Key takeaways'].map(q => (
                      <button key={q} onClick={() => sendMessage(q)} disabled={isLoading}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 500, background: 'transparent', border: '1px solid #424242', color: '#ececec', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '-0.01em' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#2f2f2f'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map(msg => (
                <ChatMessageBubble key={msg.id} msg={msg} isLoading={isLoading} onSendMessage={sendMessage} />
              ))}

              {/* Standalone loading dots (before first model chunk arrives) */}
              {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== 'model') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.8rem', padding: '0.5rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ececec' }}>ZEN-GPT</span>
                  </div>
                  <div style={{ padding: '0 0.2rem', color: '#ececec' }}>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Error bar */}
          {chatError && (
            <div style={{ padding: '0.45rem 0.85rem', background: 'rgba(239,68,68,0.06)', borderTop: '1px solid rgba(239,68,68,0.12)', display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.71rem', color: '#f87171', flexShrink: 0 }}>
              <AlertCircle size={12} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{chatError}</span>
              <button onClick={() => setChatError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex' }}><X size={11} /></button>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ padding: '0.5rem 0.85rem 0', display: 'flex', gap: '0.3rem', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {QUICK_ACTIONS.map(({ label, prompt }) => (
              <button key={label} onClick={() => sendMessage(prompt)} disabled={isLoading}
                style={{ padding: '0.3rem 0.7rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500, background: 'transparent', border: '1px solid #424242', color: '#ececec', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1, transition: 'all 0.15s', letterSpacing: '-0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.background = '#2f2f2f'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                {label}
              </button>
            ))}
            {onMarkDoubt && (
              <button onClick={() => { onMarkDoubt(videoId); toast('🚩 Flagged for review!', { duration: 2000 }); }}
                style={{ padding: '0.3rem 0.7rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 500, background: 'transparent', border: '1px solid #424242', color: '#ececec', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.22rem', letterSpacing: '-0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2f2f2f'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <Flag size={10} /> Doubt
              </button>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: '0.6rem 0.85rem 0.7rem', display: 'flex', gap: '0.45rem', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ flex: 1, position: 'relative', background: '#2f2f2f', borderRadius: '24px', display: 'flex', alignItems: 'center', padding: '0.25rem 0.5rem' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message ZEN-GPT..."
                disabled={isLoading}
                rows={1}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: '0.45rem 0.7rem', color: '#ececec', fontSize: '0.85rem', resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: '110px', overflowY: 'auto', fontFamily: 'inherit', boxSizing: 'border-box', scrollbarWidth: 'none' }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; }}
              />
              <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading}
                style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: input.trim() && !isLoading ? '#ffffff' : '#454545', border: 'none', color: input.trim() && !isLoading ? '#212121' : '#212121', cursor: input.trim() && !isLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', marginLeft: '0.2rem' }}>
                {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} style={{ marginRight: '2px', marginTop: '2px' }} />}
              </button>
            </div>
          </div>

          <div style={{ paddingBottom: '0.45rem', fontSize: '0.57rem', color: 'rgba(255,255,255,0.14)', textAlign: 'center', flexShrink: 0, letterSpacing: '0.01em' }}>
            Enter to send · Shift+Enter for new line
          </div>
        </>

      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        [data-lenis-prevent]::-webkit-scrollbar { width: 4px; }
        [data-lenis-prevent]::-webkit-scrollbar-track { background: transparent; }
        [data-lenis-prevent]::-webkit-scrollbar-thumb { background: rgba(130,170,255,0.1); border-radius: 4px; }
        [data-lenis-prevent]::-webkit-scrollbar-thumb:hover { background: rgba(130,170,255,0.2); }
      `}</style>
    </div>
  );
};
