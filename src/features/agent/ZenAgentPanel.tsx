import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { runAgentLoop } from '../../agent/runAgentLoop';
import type { AgentStep } from '../../agent/runAgentLoop';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { Bot, Send, X, Loader2 } from 'lucide-react';

const STEP_ICON: Record<string, string> = {
  'get_tasks': '📋 Reading your tasks...',
  'create_task': '✏️ Creating task...',
  'schedule_task_in_calendar': '📅 Blocking calendar...',
  'get_free_calendar_slots': '🔍 Checking free slots...',
  'send_reminder': '🔔 Setting reminder...',
  'complete_task': '✅ Marking complete...',
};

export const ZenAgentPanel = ({ onClose }: { onClose: () => void }) => {
  const { todos } = useGlobalData();
  const calendarEvents: any[] = []; // If you have calendar events in context, use them here.
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string; steps?: AgentStep[] }[]>([
    { role: 'agent', text: "Hey! I'm Zen Agent. I can read your tasks, schedule your calendar, create reminders, and more — all in one command. Try: \"Schedule my top 3 tasks for today\" or \"I'm overwhelmed, what should I do first?\"" }
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveSteps]);

  const handleSend = async () => {
    if (!input.trim() || isRunning) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', text: userMsg }]);
    setIsRunning(true);
    setLiveSteps([]);

    try {
      const stepsAccumulated: AgentStep[] = [];
      const answer = await runAgentLoop(
        userMsg,
        todos,
        calendarEvents,
        apiKey,
        (step) => {
          stepsAccumulated.push(step);
          setLiveSteps([...stepsAccumulated]);
        }
      );
      setMessages(m => [...m, { 
        role: 'agent', 
        text: answer, 
        steps: stepsAccumulated.filter(s => s.type === 'tool_call' || s.type === 'tool_result')
      }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'agent', text: `Sorry, something went wrong: ${err.message}` }]);
    } finally {
      setIsRunning(false);
      setLiveSteps([]);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: '400px',
        background: 'rgba(10,10,15,0.97)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(139,92,246,0.3)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)'
      }}
    >
      {/* Header */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={18} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>Zen Agent</div>
          <div style={{ fontSize: '0.72rem', color: '#a78bfa' }}>AI with real tools • Can act on your behalf</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
          <X size={18} />
        </button>
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {/* Tool steps (collapsed summary) */}
            {msg.steps && msg.steps.filter(s => s.type === 'tool_call').length > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                {msg.steps.filter(s => s.type === 'tool_call').map((s: any, si: number) => (
                  <div key={si}>⚡ {STEP_ICON[s.toolName] || `Ran: ${s.toolName}`}</div>
                ))}
              </div>
            )}
            <div style={{
              maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,0.05)',
              color: '#fff', fontSize: '0.88rem', lineHeight: 1.5,
              whiteSpace: 'pre-wrap'
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* Live steps while running */}
        {isRunning && liveSteps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {liveSteps.filter(s => s.type === 'tool_call').map((s: any, i) => (
              <div key={i} style={{ fontSize: '0.75rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                {STEP_ICON[s.toolName] || `Calling ${s.toolName}...`}
              </div>
            ))}
          </div>
        )}
        {isRunning && liveSteps.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            Zen Agent is thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '0.5rem' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
          placeholder="Tell me what to do..."
          disabled={isRunning}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px', padding: '0.7rem 1rem', color: '#fff', fontSize: '0.88rem', outline: 'none'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isRunning}
          style={{
            padding: '0.7rem 1rem', borderRadius: '12px', border: 'none',
            background: input.trim() && !isRunning ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.05)',
            color: '#fff', cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed'
          }}
        >
          {isRunning ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
        </button>
      </div>
    </motion.div>
  );
};
