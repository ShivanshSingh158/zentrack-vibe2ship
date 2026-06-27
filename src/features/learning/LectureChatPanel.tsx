import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send, Loader2, Trash2, Bot, User,
  AlertCircle, LogOut, ChevronDown,
  Copy, Check, Flag, BookOpen, Zap, HelpCircle,
  Maximize2, Minimize2,
} from 'lucide-react';
import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth, db } from '../../services/firebase';
import { addDoc, collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'zen_gemini_oauth_token';
const TOKEN_EXPIRY_KEY = 'zen_gemini_oauth_expiry';
const GEMINI_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Models to try in order
const MODEL_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-pro',
];

// Global Learning Context — cross-video memory stored in localStorage
const GLOBAL_CTX_KEY = 'zenLectureGlobalCtx';
const MAX_GLOBAL_CTX = 5;

// ── Token helpers ─────────────────────────────────────────────────────────────

const getStoredToken = (): string | null => {
  try {
    const expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY) || '0');
    if (Date.now() > expiry) { clearToken(); return null; }
    return sessionStorage.getItem(TOKEN_KEY);
  } catch { return null; }
};
const saveToken = (token: string, expiresInSecs = 3600) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSecs * 1000 - 60_000));
  } catch { /* ignore */ }
};
const clearToken = () => {
  try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_EXPIRY_KEY); } catch { /* ignore */ }
};

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

// ── YouTube Transcript Fetcher ────────────────────────────────────────────────
// YouTube's timedtext API is CORS-blocked from browsers. We try:
//   1. Direct fetch (sometimes works in non-strict CORS environments)
//   2. corsproxy.io (free, reliable CORS proxy)
//   3. allorigins.win (free alternative proxy)
//   4. api.codetabs.com (another free proxy)
// AI still works without transcript — it answers from title + expert knowledge.

const fetchYouTubeTranscript = async (videoId: string): Promise<string> => {
  try {
    const res = await fetch(`/api/transcript?videoId=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.transcript && data.transcript.length > 50) {
        return data.transcript.slice(0, 14000);
      }
    }
  } catch { /* Fail silently */ }

  return ''; // No transcript found
};


// ── Doubt detection ───────────────────────────────────────────────────────────


const DOUBT_PATTERNS = [
  /i don'?t understand/i, /i('m| am) confused/i,
  /can you explain/i, /i('m| am) lost/i,
  /this is confusing/i, /not getting it/i,
  /i don'?t get/i, /please (clarify|explain)/i,
];
const isDoubtMessage = (title: string) => DOUBT_PATTERNS.some(r => r.test(text));

// ── OAuth sign-in ─────────────────────────────────────────────────────────────

const requestGeminiToken = async (): Promise<string> => {
  const provider = new GoogleAuthProvider();
  provider.addScope(GEMINI_SCOPE);
  let result;
  const user = auth.currentUser;
  if (user) {
    try { result = await reauthenticateWithPopup(user, provider); }
    catch { result = await signInWithPopup(auth, provider); }
  } else {
    result = await signInWithPopup(auth, provider);
  }
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) throw new Error('Could not get access token from Google.');
  return token;
};

// ── Gemini REST Streaming API ─────────────────────────────────────────────────

async function callGeminiREST(
  token: string,
  systemInstruction: any,
  contents: any[],
  modelIndex = 0,
  onChunk?: (title: string) => void
): Promise<{ title: string; model: string }> {
  const model = MODEL_FALLBACKS[modelIndex];
  if (!model) throw new Error('All models exhausted. Please try again.');

  const res = await fetch(`${API_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      system_instruction: systemInstruction,
      contents,
      generationConfig: { temperature: 0.65, maxOutputTokens: 2048 },
    }),
  });

  if (res.status === 401 || res.status === 403) throw new Error('AUTH_EXPIRED');
  if (res.status === 404 || res.status === 429 || res.status === 503)
    return callGeminiREST(token, systemInstruction, contents, modelIndex + 1, onChunk);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as any)?.error?.message || `HTTP ${res.status}`;
    if (msg.includes('not found') || msg.includes('404'))
      return callGeminiREST(token, systemInstruction, contents, modelIndex + 1, onChunk);
    throw new Error(msg);
  }

  if (!res.body) throw new Error('No response body from Gemini.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode(new Uint8Array(), { stream: false });
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('data: ')) continue;
      const dataStr = trimmedLine.slice(6).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const part = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (part) {
          fullText += part;
          if (onChunk) onChunk(fullText);
        }
      } catch { /* ignore partial SSE parse errors */ }
    }
  }

  // Process final leftover buffer line if it is complete
  if (buffer) {
    const trimmedLine = buffer.trim();
    if (trimmedLine.startsWith('data: ')) {
      const dataStr = trimmedLine.slice(6).trim();
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          const part = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (part) {
            fullText += part;
            if (onChunk) onChunk(fullText);
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (!fullText) throw new Error('Empty response from Gemini.');
  return { title: fullText, model };
}

// ── Follow-up question parser ─────────────────────────────────────────────────

const parseFollowUps = (title: string): string[] => {
  const match = text.match(/💡\s*\*?\*?Ask next:\*?\*?\s*(.+)/i);
  if (!match) return [];
  const raw = match[1];
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (quoted.length > 0) return quoted.slice(0, 3);
  return raw.split(/[·|]/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length > 5).slice(0, 3);
};

const stripFollowUpLine = (title: string): string =>
  text.replace(/\n*💡\s*\*?\*?Ask next:\*?\*?.*$/im, '').trim();

// ── System prompt builder ─────────────────────────────────────────────────────

const buildSystemInstruction = (
  videoTitle: string, topicName: string, transcript?: string,
  progressPct?: number, completedTopics?: string[],
  totalProgress?: { completed: number; total: number }, globalCtx?: string,
) => ({
  parts: [{ text: `You are Zen Tutor — a world-class expert educator and pedagogy specialist embedded inside ZenTrack.
The student is watching: 📺 "${videoTitle}" — 📚 Topic: "${topicName}"
${progressPct !== undefined ? `Topic progress: ~${progressPct}% of videos watched.` : ''}
${totalProgress ? `Overall course progress: ${totalProgress.completed}/${totalProgress.total} videos completed.` : ''}
${completedTopics && completedTopics.length > 0 ? `Their completed topics: ${completedTopics.slice(0, 6).join(', ')}.` : ''}
${globalCtx || ''}

== THE 8 LAWS OF ZEN TUTORING (NEVER BREAK) ==

1. SOCRATIC FIRST: When a student asks "how does X work?", don't just explain — ask a probing question first to gauge their current understanding level. E.g., "Before I explain it fully — what does your intuition say about what happens when Y?" Then explain based on their response.

2. CODE = WORKING + EXPLAINED: For any code question, provide:
   a) A minimal working code example (< 30 lines if possible)
   b) A line-by-line explanation of the key parts
   c) One common mistake beginners make
   Use \`\`\`language\\ncode\\n\`\`\` blocks always.

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
- **bold** for key terms, \`inline code\` for snippets
- Numbered lists for steps, bullets for options
- Keep Q&A under 300 words unless code example requires more
- Never start with "Sure!", "Of course!", "Great question!" — just answer

${transcript
    ? `=== VIDEO TRANSCRIPT (with timestamps) ===
Reference timestamps precisely: "At 4:32, she explains..." — quote the video directly when answering transcript-specific questions.

${transcript}
=== END TRANSCRIPT ===`
    : '(No transcript available — answer from the video title, topic context, and your deep expert knowledge of this subject.)'}`,
  }],
});



// ── Main Component ────────────────────────────────────────────────────────────

export const LectureChatPanel: React.FC<LectureChatPanelProps> = ({
  videoId, videoTitle, topicName, onClose, isFullscreen = false,
  progressPct, completedTopics, totalProgress, onMarkDoubt,
  autoTriggerMessage, onAutoTriggerComplete
}) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
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

  // ── Load transcript + history ─────────────────────────────────────────────
  useEffect(() => {
    setTranscriptStatus('loading');
    setMessages([]);
    contentsRef.current = [];

    Promise.all([
      fetchYouTubeTranscript(videoId),
      userId ? loadHistoryFromFirestore(userId, videoId) : Promise.resolve([] as ChatMessage[]),
    ]).then(([tx, history]) => {
      const globalCtx = buildGlobalCtxString(videoId);
      systemRef.current = buildSystemInstruction(videoTitle, topicName, tx || undefined, progressPct, completedTopics, totalProgress, globalCtx);
      setTranscriptStatus(tx ? 'ready' : 'unavailable');
      setMessages(history);
      contentsRef.current = history.filter(m => !m.error).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    }).catch(() => setTranscriptStatus('unavailable'));
  }, [videoId, videoTitle, topicName, userId, progressPct]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Sign in ───────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    setSigningIn(true); setAuthError(''); setNeedsSetup(false);
    try {
      const newToken = await requestGeminiToken();
      saveToken(newToken); setToken(newToken);
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch (err: any) {
      const msg = String(err.message || err.code || '');
      if (msg.includes('invalid_scope') || msg.includes('scope') || msg.includes('access_denied')) setNeedsSetup(true);
      else if (msg.includes('popup-closed') || msg.includes('cancelled') || msg.includes('popup_closed')) setAuthError('Sign-in cancelled.');
      else if (msg.includes('popup-blocked')) setAuthError('Popup blocked — please allow popups and try again.');
      else setAuthError(msg || 'Sign-in failed. Please try again.');
    } finally { setSigningIn(false); }
  };

  const NOTE_TRIGGERS = [/save\s+(this|that)\s+to\s+(my\s+)?notes?/i, /add\s+(this|that)\s+to\s+(my\s+)?notes?/i, /note\s+(this|that)\s+down/i, /save\s+(this|that)\s+as\s+a\s+note/i];

  // ── Proactive AI Greeting ───────────────────────────────────────────────────
  const initTriggeredRef = useRef(false);
  useEffect(() => {
    if (transcriptStatus === 'loading' || !token || messages.length > 0 || isLoading || initTriggeredRef.current) return;
    initTriggeredRef.current = true;

    const initChat = async () => {
      setIsLoading(true); setChatError('');
      const initPrompt = `I just started watching this video. Introduce yourself proactively, tell me what this lecture covers in 2 sentences, and invite me to ask questions.`;
      const newContents = [...contentsRef.current, { role: 'user', parts: [{ text: initPrompt }] }];
      
      try {
        const msgId = crypto.randomUUID();
        const placeholder: ChatMessage = { id: msgId, role: 'model', title: '', ts: Date.now() };
        setMessages(prev => [...prev, placeholder]);

        const { title: aiText, model: usedModel } = await callGeminiREST(
          token, systemRef.current, newContents, 0,
          (chunk) => {
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, title: chunk } : m));
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        );

        const followUps = parseFollowUps(aiText);
        const cleanText = stripFollowUpLine(aiText);
        const finalMsg: ChatMessage = { id: msgId, role: 'model', title: cleanText, ts: Date.now(), model: usedModel, followUps };
        
        contentsRef.current = [...newContents, { role: 'model', parts: [{ text: cleanText }] }];
        setMessages(prev => { const n = prev.map(m => m.id === msgId ? finalMsg : m); persistMessages(n); return n; });
      } catch (err: any) {
        // Silently fail proactive greeting to avoid showing errors to user
        setMessages(prev => prev.filter(m => m.text !== ''));
      } finally {
        setIsLoading(false);
      }
    };
    
    initChat();
  }, [transcriptStatus, token, messages.length, isLoading, persistMessages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading || !token) return;
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
      const msgId = crypto.randomUUID();
      const placeholder: ChatMessage = { id: msgId, role: 'model', title: '', ts: Date.now() };
      setMessages(prev => [...prev, placeholder]);

      const { title: aiText, model: usedModel } = await callGeminiREST(
        token, systemRef.current, newContents, 0,
        (chunk) => {
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, title: chunk } : m));
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      );

      const followUps = parseFollowUps(aiText);
      const cleanText = stripFollowUpLine(aiText);
      const finalMsg: ChatMessage = { id: msgId, role: 'model', title: cleanText, ts: Date.now(), model: usedModel, followUps };
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
      if (err.message === 'AUTH_EXPIRED') { clearToken(); setToken(null); return; }
      const errMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', title: err.message || 'AI failed to respond.', ts: Date.now(), error: true };
      contentsRef.current = contentsRef.current.slice(0, -1);
      setChatError(err.message || 'Request failed. Please try again.');
      setMessages(prev => { const n = [...prev, errMsg]; persistMessages(n); return n; });
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isLoading, token, videoId, videoTitle, topicName, persistMessages, onMarkDoubt]);

  // ── Auto-trigger external message (e.g. Quiz) ──────────────────────────────
  useEffect(() => {
    if (autoTriggerMessage && token && !isLoading) {
      sendMessage(autoTriggerMessage);
      if (onAutoTriggerComplete) onAutoTriggerComplete();
    }
  }, [autoTriggerMessage, token, isLoading, sendMessage, onAutoTriggerComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = async () => {
    setMessages([]); contentsRef.current = []; setChatError('');
    if (userId) { try { await setDoc(chatDocRef(userId, videoId), { messages: [], updatedAt: Date.now() }); } catch { /* ignore */ } }
  };

  const signOut = () => { clearToken(); setToken(null); setMessages([]); contentsRef.current = []; setShowSettings(false); };

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
      background: 'linear-gradient(180deg, rgba(10,11,20,0.99) 0%, rgba(8,9,17,0.99) 100%)',
      border: '1px solid rgba(130,170,255,0.12)',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(130,170,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
      boxSizing: 'border-box', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(130,170,255,0.04)', flexShrink: 0, backdropFilter: 'blur(10px)' }}>
        {/* Gemini star */}
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))', border: '1px solid rgba(130,170,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1C7 1 9 5 13 7C9 9 7 13 7 13C7 13 5 9 1 7C5 5 7 1 7 1Z" fill="url(#hstar)" />
            <defs><linearGradient id="hstar" x1="1" y1="1" x2="13" y2="13" gradientUnits="userSpaceOnUse"><stop stopColor="#82aaff"/><stop offset="1" stopColor="#c792ea"/></linearGradient></defs>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.01em' }}>Lecture AI Tutor</div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.08rem', flexWrap: 'wrap' }}>
            {token ? (auth.currentUser?.displayName?.split(' ')[0] || 'Connected') : 'Sign in to start'}
            {token && (
              <span style={{
                fontSize: '0.54rem', padding: '0.04rem 0.3rem', borderRadius: '4px', fontWeight: 600, flexShrink: 0,
                background: transcriptStatus === 'ready' ? 'rgba(195,232,141,0.08)' : transcriptStatus === 'loading' ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
                color: transcriptStatus === 'ready' ? '#c3e88d' : transcriptStatus === 'loading' ? '#fbbf24' : 'rgba(255,255,255,0.25)',
                border: `1px solid ${transcriptStatus === 'ready' ? 'rgba(195,232,141,0.2)' : transcriptStatus === 'loading' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                {transcriptStatus === 'ready' ? '✓ Transcript' : transcriptStatus === 'loading' ? '⋯ Loading' : '— No transcript'}
              </span>
            )}
          </div>
        </div>

        {token && (
          <>
            <button onClick={clearChat} title="Clear chat" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', padding: '0.25rem', borderRadius: '5px', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>
              <Trash2 size={12} />
            </button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowSettings(v => !v)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', padding: '0.25rem', borderRadius: '5px' }}>
                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: showSettings ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showSettings && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.35rem', background: 'rgba(10,11,20,0.99)', border: '1px solid rgba(130,170,255,0.12)', borderRadius: '10px', padding: '0.35rem', zIndex: 200, boxShadow: '0 16px 40px rgba(0,0,0,0.8)', minWidth: '160px' }}>
                  <button onClick={signOut} style={{ width: '100%', background: 'none', border: 'none', color: '#f87171', padding: '0.45rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.74rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <LogOut size={12} /> Disconnect account
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', padding: '0.25rem', borderRadius: '5px', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
          <X size={13} />
        </button>
      </div>

      {/* ── Sign-in ── */}
      {!token && <SignInScreen onSignIn={handleSignIn} signingIn={signingIn} error={authError} onClose={onClose} needsSetup={needsSetup} />}

      {/* ── Chat ── */}
      {token && (
        <>
          {/* Messages scrollable area */}
          <div ref={chatRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <div data-lenis-prevent style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '1rem 0.85rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', scrollbarWidth: 'thin', scrollbarColor: 'rgba(130,170,255,0.12) transparent' }}>

              {/* Welcome / empty state */}
              {messages.length === 0 && !isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.5rem 1rem', textAlign: 'center' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.18))', border: '1px solid rgba(130,170,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={26} style={{ color: '#82aaff' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e8eaf0', marginBottom: '0.25rem' }}>Ask me anything</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, maxWidth: '230px' }}>
                      I've analyzed <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{videoTitle}</strong> — let's dive deep.
                    </div>
                  </div>
                  {/* Starter chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
                    {['Explain the key concept', 'Show me a code example', 'Quiz me', 'Key takeaways'].map(q => (
                      <button key={q} onClick={() => sendMessage(q)} disabled={isLoading}
                        style={{ padding: '0.28rem 0.65rem', borderRadius: '6px', fontSize: '0.66rem', fontWeight: 500, background: 'rgba(130,170,255,0.06)', border: '1px solid rgba(130,170,255,0.14)', color: 'rgba(165,180,252,0.85)', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '-0.01em' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(130,170,255,0.14)'; e.currentTarget.style.borderColor = 'rgba(130,170,255,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(130,170,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(130,170,255,0.14)'; }}>
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))', border: '1px solid rgba(130,170,255,0.2)' }}>
                    <Bot size={12} style={{ color: '#82aaff' }} />
                  </div>
                  <div style={{ padding: '0.55rem 0.8rem', borderRadius: '4px 14px 14px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
          <div style={{ padding: '0.5rem 0.85rem 0', display: 'flex', gap: '0.3rem', flexShrink: 0, flexWrap: 'wrap' }}>
            {QUICK_ACTIONS.map(({ label, prompt, accent }) => (
              <button key={label} onClick={() => sendMessage(prompt)} disabled={isLoading}
                style={{ padding: '0.26rem 0.62rem', borderRadius: '6px', fontSize: '0.63rem', fontWeight: 500, background: `rgba(${accent},0.06)`, border: `1px solid rgba(${accent},0.15)`, color: `rgba(${accent},0.85)`, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1, transition: 'all 0.15s', letterSpacing: '-0.01em' }}
                onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.background = `rgba(${accent},0.14)`; e.currentTarget.style.borderColor = `rgba(${accent},0.35)`; } }}
                onMouseLeave={e => { e.currentTarget.style.background = `rgba(${accent},0.06)`; e.currentTarget.style.borderColor = `rgba(${accent},0.15)`; }}>
                {label}
              </button>
            ))}
            {onMarkDoubt && (
              <button onClick={() => { onMarkDoubt(videoId); toast('🚩 Flagged for review!', { duration: 2000 }); }}
                style={{ padding: '0.26rem 0.62rem', borderRadius: '6px', fontSize: '0.63rem', fontWeight: 500, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.85)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.22rem', letterSpacing: '-0.01em' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.12)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.06)'; e.currentTarget.style.borderColor = 'rgba(251,191,36,0.15)'; }}>
                <Flag size={10} /> Doubt
              </button>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: '0.6rem 0.85rem 0.7rem', display: 'flex', gap: '0.45rem', alignItems: 'flex-end', flexShrink: 0 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this lecture…"
                disabled={isLoading}
                rows={1}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(130,170,255,0.15)', borderRadius: '10px', padding: '0.55rem 0.7rem', color: '#e8eaf0', fontSize: '0.81rem', resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: '110px', overflowY: 'auto', transition: 'border-color 0.2s, box-shadow 0.2s', fontFamily: 'inherit', boxSizing: 'border-box', scrollbarWidth: 'none', display: 'block' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(130,170,255,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(130,170,255,0.06)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(130,170,255,0.15)'; e.target.style.boxShadow = 'none'; }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; }}
              />
            </div>
            <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading}
              style={{ width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0, background: input.trim() && !isLoading ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : 'rgba(255,255,255,0.04)', border: `1px solid ${input.trim() && !isLoading ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`, color: input.trim() && !isLoading ? '#fff' : 'rgba(255,255,255,0.2)', cursor: input.trim() && !isLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: input.trim() && !isLoading ? '0 4px 12px rgba(67,56,202,0.4)' : 'none' }}>
              {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
            </button>
          </div>

          <div style={{ paddingBottom: '0.45rem', fontSize: '0.57rem', color: 'rgba(255,255,255,0.14)', textAlign: 'center', flexShrink: 0, letterSpacing: '0.01em' }}>
            Enter to send · Shift+Enter for new line
          </div>
        </>
      )}

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
