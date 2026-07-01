import { useState, useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { orchestrateAgent } from '../../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../../agent/orchestrationLock'; // ✅ U7
import type { AgentStep } from '../../agent/runAgentLoop';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { Bot, Send, X, Loader2, Mic, MicOff, Volume2, VolumeX, Sparkles, Download, ExternalLink } from 'lucide-react';
import { agentMemoryStore } from '../../stores/agentMemoryStore';
import { ApiKeyManager } from './ApiKeyManager';


// ── Rich inline content parser (bold, italic, code, links) ────────────────────
const parseInline = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:0.1em 0.35em;border-radius:4px;font-size:0.82em;font-family:monospace">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" style="color:#818cf8;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;gap:0.2em">$1 ↗</a>');
};

// ── Download as PDF helper ────────────────────────────────────────────────────
const downloadAsPdf = (text: string) => {
  // Use print-to-PDF via a hidden iframe containing styled HTML
  const clean = text.replace(/SPOKEN_SUMMARY:.*$/s, '').trim();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>ZenTrack Mission Report</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;color:#111;line-height:1.7;font-size:15px}
    h1,h2,h3{color:#1a1a2e;margin-top:1.5em}
    h2{font-size:1.2em;border-bottom:2px solid #8b5cf6;padding-bottom:0.3em}
    h3{font-size:1.05em;color:#4c1d95}
    a{color:#7c3aed;text-decoration:underline}
    table{width:100%;border-collapse:collapse;margin:1em 0}
    th,td{border:1px solid #e5e7eb;padding:0.5em 0.75em;text-align:left}
    th{background:#f5f3ff;font-weight:600}
    code{background:#f3f4f6;padding:0.1em 0.3em;border-radius:4px;font-size:0.9em}
    hr{border:none;border-top:1px solid #e5e7eb;margin:1.5em 0}
    li{margin:0.25em 0}
    @media print{body{margin:20px}}
  </style></head><body>
  ${clean.split('\n').map(line => {
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('---')) return '<hr>';
    if (line.startsWith('- ') || line.startsWith('* ')) return `<li>${line.slice(2)}</li>`;
    if (/^\d+\.\s/.test(line)) return `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
    if (line.startsWith('|')) {
      const cols = line.split('|').filter(c => c.trim() && !c.match(/^[\s\-:]+$/));
      if (!cols.length) return '';
      return `<tr>${cols.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`;
    }
    if (!line.trim()) return '<br>';
    return `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2">$1</a>')}</p>`;
  }).join('\n')}
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.contentDocument!.write(html);
  iframe.contentDocument!.close();
  setTimeout(() => {
    iframe.contentWindow!.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 300);
};

// ── Advanced Markdown renderer with links, tables, PDF download ───────────────
const AdvancedMarkdown = ({ text }: { text: string }) => {
  const clean = text.replace(/SPOKEN_SUMMARY:.*$/s, '').trim();
  const lines = clean.split('\n');
  const isLongReport = clean.length > 600;

  // Merge table lines into groups
  const blocks: { type: string; lines: string[] }[] = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (line.startsWith('|')) {
      if (last?.type === 'table') last.lines.push(line);
      else blocks.push({ type: 'table', lines: [line] });
    } else {
      blocks.push({ type: 'line', lines: [line] });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {isLongReport && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
          <button
            onClick={() => downloadAsPdf(text)}
            title="Download as PDF"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '8px', padding: '0.3rem 0.7rem', color: '#a78bfa',
              fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.12)')}
          >
            <Download size={11} /> Download PDF
          </button>
        </div>
      )}

      {blocks.map((block, i) => {
        if (block.type === 'table') {
          const rows = block.lines.filter(l => !l.match(/^\|[\s\-:]+\|/));
          if (rows.length === 0) return null;
          const [headerRow, ...dataRows] = rows;
          const headers = headerRow.split('|').filter(c => c.trim());
          return (
            <div key={i} style={{ overflowX: 'auto', margin: '0.4rem 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    {headers.map((h, hi) => (
                      <th key={hi} style={{
                        background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(255,255,255,0.1)',
                        padding: '0.4rem 0.6rem', textAlign: 'left', color: '#c4b5fd', fontWeight: 600,
                      }}>{h.trim()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, ri) => {
                    const cells = row.split('|').filter(c => c.trim());
                    return (
                      <tr key={ri}>
                        {cells.map((cell, ci) => (
                          <td key={ci} style={{
                            border: '1px solid rgba(255,255,255,0.07)', padding: '0.35rem 0.6rem',
                            fontSize: '0.77rem', color: '#d1d5db',
                            background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                          }} dangerouslySetInnerHTML={{ __html: parseInline(cell.trim()) }} />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }

        const line = block.lines[0];
        if (line.startsWith('### ')) return <strong key={i} style={{ fontSize: '0.88rem', color: '#e4e4e7', display: 'block', marginTop: '0.6rem' }} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(4)) }} />;
        if (line.startsWith('## ')) return <strong key={i} style={{ fontSize: '0.93rem', color: '#fff', display: 'block', marginTop: '0.75rem', borderBottom: '1px solid rgba(139,92,246,0.2)', paddingBottom: '0.2rem' }} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(3)) }} />;
        if (line.startsWith('# ')) return <strong key={i} style={{ fontSize: '1rem', color: '#fff', display: 'block', marginTop: '0.75rem' }} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(2)) }} />;
        if (line.startsWith('---')) return <hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.09)', margin: '0.5rem 0' }} />;
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const content = line.slice(2);
          return <div key={i} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.85rem', lineHeight: 1.6 }}><span style={{ color: '#8b5cf6', flexShrink: 0, marginTop: '0.15em' }}>•</span><span dangerouslySetInnerHTML={{ __html: parseInline(content) }} /></div>;
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^\d+/)?.[0];
          return <div key={i} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.85rem', lineHeight: 1.6 }}><span style={{ color: '#6366f1', flexShrink: 0, minWidth: '1.2rem' }}>{num}.</span><span dangerouslySetInnerHTML={{ __html: parseInline(line.replace(/^\d+\.\s/, '')) }} /></div>;
        }
        if (!line.trim()) return <div key={i} style={{ height: '0.3rem' }} />;
        return <p key={i} style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: parseInline(line) }} />;
      })}
    </div>
  );
};

// ── Tool step label map ───────────────────────────────────────────────────────
const STEP_ICON: Record<string, string> = {
  'get_tasks':                   '📋 Reading your tasks...',
  'create_task':                 '✏️ Creating task...',
  'schedule_task_in_calendar':   '📅 Blocking calendar...',
  'get_free_calendar_slots':     '🔍 Checking free slots...',
  'send_reminder':               '🔔 Setting reminder...',
  'complete_task':               '✅ Marking complete...',
  'query_internal_app_data':     '📦 Fetching your data...',
  'navigate_to_module':          '🗺️ Opening module...',
  'open_gym_workout':            '💪 Opening workout...',
  'read_gmail':                  '📧 Reading emails...',
  'send_gmail':                  '📤 Sending email...',
  'list_calendar_events':        '📅 Checking calendar...',
  'search_google_drive':         '🔍 Searching Drive...',
  'create_google_meet':          '🎥 Creating meeting...',
  'create_google_doc':           '📄 Creating document...',
  'delegate_task':               '🤖 Spawning sub-agent...',
};

// ── Dynamic suggestions based on user's real app state ────────────────────────
function useDynamicSuggestions() {
  const globalData = useGlobalData();
  const today = new Date().toISOString().split('T')[0];

  return [
    // Gym suggestion — if today has a workout
    !globalData.gymSchedule?.isRest
      ? `💪 Show today's gym workout`
      : null,
    // Learning suggestion — if topics exist
    globalData.learningTopics?.length > 0
      ? `📚 Open my latest lecture`
      : null,
    // Overdue tasks
    globalData.tasks?.some((t: any) => t.status !== 'completed' && t.date && t.date < today)
      ? `🚨 What tasks are overdue?`
      : `📋 What do I have today?`,
    // Habits
    globalData.habits?.length > 0
      ? `✅ How are my habits today?`
      : null,
    // Always available
    `🎯 Plan my day`,
  ].filter(Boolean).slice(0, 4) as string[];
}

// ── Speech Recognition hook ───────────────────────────────────────────────────
function useSpeechRecognition(onTranscript: (text: string, final: boolean) => void) {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[STT] SpeechRecognition not supported in this browser');
      return;
    }
    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      const isFinal = event.results[event.results.length - 1].isFinal;
      onTranscript(transcript, isFinal);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') console.warn('[STT] Error:', e.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, startListening, stopListening };
}

// ── Main Component ────────────────────────────────────────────────────────────
export const ZenAgentPanel = ({ onClose }: { onClose: () => void }) => {
  const globalData = useGlobalData();
  const messages = useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);
  const suggestions = useDynamicSuggestions();

  const [input, setInput] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('zen_tts_enabled') !== 'false'; } catch { return true; }
  });
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [liveThinkingText, setLiveThinkingText] = useState('');
  const [approvalRequest, setApprovalRequest] = useState<{ id: string; toolName: string; summary: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Keyboard Avoidance (iOS Safari) ──
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (!window.visualViewport) return;
    const updateOffset = () => {
      // Calculate how much the viewport shrank from the bottom
      const offset = window.innerHeight - window.visualViewport!.height - window.visualViewport!.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    };
    
    window.visualViewport.addEventListener('resize', updateOffset);
    window.visualViewport.addEventListener('scroll', updateOffset);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateOffset);
      window.visualViewport?.removeEventListener('scroll', updateOffset);
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveSteps, liveThinkingText]);

  // Cancel TTS when panel closes
  useEffect(() => {
    return () => {
      stopSpeaking();
      abortRef.current?.abort();
    };
  }, []);

  // Human-in-the-Loop approval gate listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, toolName, summary } = (e as CustomEvent).detail;
      setApprovalRequest({ id, toolName, summary });
    };
    window.addEventListener('zen-approval-request', handler);
    return () => window.removeEventListener('zen-approval-request', handler);
  }, []);

  const handleApprove = () => {
    if (!approvalRequest) return;
    window.dispatchEvent(new CustomEvent(approvalRequest.id, { detail: { approved: true } }));
    setApprovalRequest(null);
  };

  const handleReject = () => {
    if (!approvalRequest) return;
    window.dispatchEvent(new CustomEvent(approvalRequest.id, { detail: { approved: false } }));
    setApprovalRequest(null);
  };

  const handleSend = useCallback(async (msgOverride?: string) => {
    const userMsg = (msgOverride || input).trim();
    if (!userMsg || isRunning) return;

    // ✅ U7 FIX: Acquire the global orchestration lock before calling orchestrateAgent.
    // This prevents simultaneous orchestrations from ZenAgentPanel + HomeDashboard + proactive loops.
    // tryAcquireLock('user') also preempts any running proactive loop.
    if (!tryAcquireLock('user')) {
      console.warn('[ZenAgentPanel] Could not acquire orchestration lock — another command is running.');
      return;
    }

    setInput('');
    setInterimTranscript('');
    setIsSpeakingState(false);


    agentMemoryStore.appendMessage({ role: 'user', title: userMsg });
    setIsRunning(true);
    setLiveSteps([]);
    setLiveThinkingText('');

    abortRef.current = new AbortController();

    try {
      const stepsAccumulated: AgentStep[] = [];
      const historyContext = messages.map(h => ({ role: h.role as 'user' | 'model', text: h.title }));

      const answer = await orchestrateAgent(
        userMsg,
        globalData,
        apiKey,
        (step) => {
          stepsAccumulated.push(step);
          setLiveSteps([...stepsAccumulated]);
          if (step.type === 'thinking') setLiveThinkingText(step.title);
          // ✅ U6: Tag all events from ZenAgentPanel with source:'user'
          // so AgentTerminal can distinguish them from proactive background logs
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
        },
        historyContext,
        abortRef.current.signal
      );

      agentMemoryStore.appendMessage({
        role: 'agent',
        title: answer,
        steps: stepsAccumulated.filter(s => s.type === 'tool_call' || s.type === 'tool_result')
      });
    } catch (err: any) {

      if (err.name !== 'AbortError') {
        agentMemoryStore.appendMessage({ role: 'agent', title: `Sorry, something went wrong: ${err.message}` });
      }
    } finally {
      setIsRunning(false);
      setLiveSteps([]);
      setLiveThinkingText('');
      releaseLock('user'); // ✅ U7: always release
    }
  }, [input, isRunning, messages, globalData, apiKey, ttsEnabled]);


  // STT voice recognition
  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInput(text);
      setInterimTranscript('');
      // Auto-send after final transcript with 800ms delay (cancellable by typing)
      setTimeout(() => {
        handleSend(text);
      }, 800);
    } else {
      setInterimTranscript(text);
    }
  }, [handleSend]);

  const { isListening, startListening, stopListening } = useSpeechRecognition(handleTranscript);

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      stopSpeaking();
      setIsSpeakingState(false);
      startListening();
    }
  };

  const handleTtsToggle = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    try { localStorage.setItem('zen_tts_enabled', String(next)); } catch {}
    if (!next) {
      stopSpeaking();
      setIsSpeakingState(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    stopSpeaking();
    setIsSpeakingState(false);
    setIsRunning(false);
    setLiveSteps([]);
    setLiveThinkingText('');
  };

  const displayInput = interimTranscript || input;

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 'clamp(340px, 28vw, 460px)',
        background: 'rgba(5,5,10,0.95)', backdropFilter: 'blur(30px) saturate(150%)',
        borderLeft: '1px solid rgba(0,240,255,0.3)', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,0.8), -2px 0 20px rgba(0,240,255,0.1)',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: '1rem 1.25rem', borderBottom: '1px solid rgba(0,240,255,0.2)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        background: 'linear-gradient(90deg, rgba(0,240,255,0.05), transparent)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '8px', flexShrink: 0,
          background: 'linear-gradient(135deg, #00F0FF, #B534FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 15px rgba(0,240,255,0.5)',
        }}>
          <Bot size={18} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>SYS.OP // ZEN</div>
          <div style={{ fontSize: '0.68rem', color: '#00F0FF', display: 'flex', alignItems: 'center', gap: '0.35rem', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            {isSpeakingState && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#34d399' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', animation: 'pulse 1s infinite' }} />
                Speaking...
              </span>
            )}
            {!isSpeakingState && 'AI with real tools • Can act on your behalf'}
          </div>
        </div>
        {/* TTS toggle */}
        <button
          onClick={handleTtsToggle}
          title={ttsEnabled ? 'Mute voice responses' : 'Enable voice responses'}
          style={{
            background: ttsEnabled ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${ttsEnabled ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '8px', width: 32, height: 32, color: ttsEnabled ? '#34d399' : '#6b7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.2s',
          }}
        >
          {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}>
          <X size={18} />
        </button>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Empty state — dynamic suggestions */}
        {messages.length === 0 && !isRunning && (
          <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '25%', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Sparkles size={14} color="#a78bfa" />
              <div style={{ fontSize: '0.82rem', color: '#a78bfa', fontWeight: 600 }}>Try asking me...</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              {suggestions.map(suggestion => (
                <motion.button
                  key={suggestion}
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(139,92,246,0.12)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSend(suggestion)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)',
                    padding: '0.7rem 1rem', borderRadius: '12px', color: '#e4e4e7', fontSize: '0.84rem',
                    cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.2s',
                    fontFamily: 'inherit',
                  }}
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#4b5563', marginTop: '0.5rem', textAlign: 'center' }}>
              🎤 Voice enabled · 🔊 TTS {ttsEnabled ? 'on' : 'off'}
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {/* Tool steps (collapsed) */}
            {msg.steps && msg.steps.filter(s => s.type === 'tool_call').length > 0 && (
              <div style={{
                fontSize: '0.7rem', color: '#6366f1',
                background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.14)',
                borderRadius: '8px', padding: '0.45rem 0.7rem',
              }}>
                {msg.steps.filter(s => s.type === 'tool_call').map((s: any, si: number) => (
                  <div key={si}>⚡ {STEP_ICON[s.toolName] || `Ran: ${s.toolName}`}</div>
                ))}
              </div>
            )}
            <div style={{
              maxWidth: '88%', padding: '0.75rem 1rem',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                : 'rgba(255,255,255,0.045)',
              color: '#f0f0f0', fontSize: '0.87rem', lineHeight: 1.65,
              border: msg.role === 'agent' ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              {msg.role === 'agent' ? (
                <AdvancedMarkdown text={msg.title} />
              ) : (
                msg.title
              )}
            </div>
          </div>
        ))}

        {/* Live thinking while running */}
        {isRunning && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {liveSteps.filter(s => s.type === 'tool_call').slice(-3).map((s: any, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                {STEP_ICON[s.toolName] || `Calling ${s.toolName}...`}
              </div>
            ))}
            {liveThinkingText && (
              <div style={{ fontSize: '0.7rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.8 }}>
                <Loader2 size={10} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                {liveThinkingText.length > 80 ? liveThinkingText.slice(0, 80) + '…' : liveThinkingText}
              </div>
            )}
            {liveSteps.length === 0 && (
              <div style={{ fontSize: '0.72rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Zen Agent is thinking...
              </div>
            )}
          </div>
        )}

        {/* STT interim transcript ghost text */}
        {isListening && interimTranscript && (
          <div style={{
            alignSelf: 'flex-end', maxWidth: '88%',
            padding: '0.6rem 0.9rem', borderRadius: '12px',
            background: 'rgba(139,92,246,0.15)', border: '1px dashed rgba(139,92,246,0.4)',
            color: '#c4b5fd', fontSize: '0.84rem', fontStyle: 'italic',
          }}>
            {interimTranscript}...
          </div>
        )}

        {/* ── Human-in the-Loop Approval Card ── */}
        <AnimatePresence>
          {approvalRequest && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: '14px', padding: '1rem 1.1rem',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.2rem' }}>
                    Agent Requesting Permission
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#e4e4e7', lineHeight: 1.5 }}>
                    {approvalRequest.summary}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleApprove}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg,#10b981,#059669)',
                    color: '#fff', fontWeight: 700, fontSize: '0.78rem',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ✅ Approve
                </button>
                <button
                  onClick={handleReject}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: '8px',
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#f87171', fontWeight: 700, fontSize: '0.78rem',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ❌ Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── API Key Manager ── */}
      <ApiKeyManager />

      {/* ── Input area ── */}
      <div style={{
        padding: '0.85rem 1rem', 
        paddingBottom: keyboardOffset ? `calc(0.85rem + ${keyboardOffset}px)` : '0.85rem',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.3)',
      }}>
        {/* Abort button when running */}
        <AnimatePresence>
          {isRunning && (
            <motion.button
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              onClick={handleAbort}
              style={{
                width: '100%', marginBottom: '0.6rem',
                padding: '0.45rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.75rem',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              ✕ Stop Agent
            </motion.button>
          )}
        </AnimatePresence>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          {/* Voice mic button */}
          <button
            onClick={handleMicClick}
            disabled={isRunning}
            title={isListening ? 'Stop listening' : 'Start voice input'}
            style={{
              width: 40, height: 40, borderRadius: '12px', border: 'none', flexShrink: 0,
              background: isListening
                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                : 'rgba(255,255,255,0.06)',
              color: isListening ? '#fff' : '#9ca3af',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              boxShadow: isListening ? '0 0 16px rgba(239,68,68,0.5)' : 'none',
              transition: 'all 0.2s', opacity: isRunning ? 0.5 : 1,
              animation: isListening ? 'pulse 1.5s infinite' : 'none',
            }}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          {/* Text input */}
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              id="zen-agent-input"
              value={displayInput}
              onChange={e => { setInput(e.target.value); setInterimTranscript(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isListening ? '🎤 Listening...' : 'Ask anything or give a command...'}
              disabled={isRunning || isListening}
              rows={1}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${isListening ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.09)'}`,
                borderRadius: '12px', padding: '0.65rem 0.9rem',
                color: isListening ? '#fca5a5' : '#fff', fontSize: '0.86rem', outline: 'none',
                resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => handleSend()}
            disabled={!displayInput.trim() || isRunning}
            style={{
              width: 40, height: 40, borderRadius: '12px', border: 'none', flexShrink: 0,
              background: displayInput.trim() && !isRunning
                ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)'
                : 'rgba(255,255,255,0.04)',
              color: displayInput.trim() && !isRunning ? '#fff' : '#4b5563',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: displayInput.trim() && !isRunning ? 'pointer' : 'not-allowed',
              boxShadow: displayInput.trim() && !isRunning ? '0 4px 16px rgba(139,92,246,0.35)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {isRunning
              ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={17} />
            }
          </button>
        </div>

        {/* Voice hint */}
        {isListening && (
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#ef4444', marginTop: '0.4rem', opacity: 0.8 }}>
            🔴 Listening... speak now, then pause to send
          </div>
        )}
      </div>
    </motion.div>
  );
};
