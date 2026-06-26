import React, { RefObject, Dispatch, SetStateAction } from 'react';
import { Dumbbell, ChevronDown, ChevronUp, Zap, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { GymProfile } from '../../types/gym.types';

export const QUICK_PROMPTS = [
  { label: '📊 30-day overview', text: 'Give me a detailed analysis of my last 30 days — volume trends, consistency, top progressions, and 2 things I need to fix.' },
  { label: '🍽️ Meal plan', text: 'Build me a full meal plan for today based on my training goal and profile. Include specific foods, portions, and timing.' },
  { label: '⚠️ Stall analysis', text: 'Which exercises have stalled? For each one, tell me the exact progression strategy to break through.' },
  { label: '📅 Mesocycle plan', text: 'Design a 4-week periodization mesocycle based on my current training data.' },
  { label: '🎯 Today targets', text: "What exact weights should I target for every exercise in today's session? Give me a table: Exercise | Recommended | Why." },
  { label: '😴 Recovery check', text: 'Based on my training frequency and volume, am I recovered enough to train hard today? Give me a 1-5 recovery score.' },
  { label: '💪 Weakest muscle', text: 'Which muscle group is getting the least stimulus? Give me 3 exercises to add and how to fit them in.' },
  { label: '🎥 Form tip', text: "Give me one advanced form cue for my most frequent exercise. Include setup, execution, and a common mistake to avoid." },
];

export interface GymChatUIProps {
  messages: any[]; // ChatMessage[]
  isLoading: boolean;
  isLoadingContext: boolean;
  input: string;
  setInput: (value: string) => void;
  send: (prompt?: string) => void;
  showQuickPrompts: boolean;
  setShowQuickPrompts: Dispatch<SetStateAction<boolean>>;
  profile: GymProfile | null;
  chatRef: RefObject<HTMLDivElement>;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export const GymChatUI: React.FC<GymChatUIProps> = ({
  messages,
  isLoading,
  isLoadingContext,
  input,
  setInput,
  send,
  showQuickPrompts,
  setShowQuickPrompts,
  profile,
  chatRef,
  inputRef
}) => {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Scrollable messages — uses absolute positioning for reliable iOS scroll */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%', width: '100%' }}>
        <div
          ref={chatRef}
          id="zenGymAI-chat-scroll"
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch' as any,
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            padding: '0.75rem 1rem',
            display: 'flex', flexDirection: 'column', gap: '0.7rem',
          }}
        >
          {messages.length === 0 && !isLoadingContext && !isLoading && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.28)', fontSize: '0.82rem' }}>
              <Dumbbell size={26} style={{ opacity: 0.2, margin: '0 auto 0.5rem', display: 'block' }} />
              Your coaching session will start here
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.2rem' }}>
              {msg.role === 'model' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.1rem', paddingLeft: '0.2rem' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '6px', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Dumbbell size={10} color="#fff" />
                  </div>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Zen Coach</span>
                </div>
              )}
              <div style={{
                maxWidth: '88%', padding: '0.6rem 0.85rem',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                background: msg.role === 'user' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'rgba(255,255,255,0.05)',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                wordBreak: 'break-word',
              }}>
                {msg.role === 'user'
                  ? <div style={{ fontSize: '0.83rem', color: '#fff', lineHeight: 1.5 }}>{msg.text}</div>
                  : (msg.text === '' ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '1.2rem', padding: '0 0.3rem' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#a855f7', animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                        ))}
                      </div>
                    ) : (
                      <div className="markdown-body" style={{ color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ))
                }
                {msg.role === 'model' && msg.model && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
                    ✨ Generated by {msg.model}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Prompts — sticky at bottom of chat */}
      <div style={{ flexShrink: 0, padding: '0 1rem 0.3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setShowQuickPrompts(p => !p)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem', fontWeight: 600, width: '100%' }}
        >
          <Zap size={10} style={{ color: '#f59e0b' }} />
          Quick Prompts
          {showQuickPrompts ? <ChevronDown size={11} style={{ marginLeft: 'auto' }} /> : <ChevronUp size={11} style={{ marginLeft: 'auto' }} />}
        </button>
        {showQuickPrompts && (
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.3rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as any }}>
            {profile?.targetBodyweightKg && profile?.targetTimelineWeeks && (
               <button onClick={() => { send(`Build me a step-by-step ${profile.targetTimelineWeeks}-week plan to hit my target bodyweight of ${profile.targetBodyweightKg}kg. Break it down by phases.`); setShowQuickPrompts(false); }}
                 style={{ flexShrink: 0, padding: '0.45rem 0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                 🎯 Build my {profile.targetTimelineWeeks}-week target plan
               </button>
            )}
            {QUICK_PROMPTS.map(qp => (
              <button
                key={qp.label}
                onClick={() => send(qp.text)}
                disabled={isLoading}
                style={{
                  padding: '0.28rem 0.6rem', borderRadius: '99px', flexShrink: 0,
                  border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)',
                  color: '#a855f7', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
                  minHeight: '30px', opacity: isLoading ? 0.5 : 1,
                }}
              >
                {qp.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: '0 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px)) 1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask your coach anything…"
            rows={1}
            style={{
              flex: 1, padding: '0.65rem 0.8rem', borderRadius: '14px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none',
              lineHeight: 1.5, overflowY: 'hidden', boxSizing: 'border-box',
              fontFamily: 'inherit', maxHeight: '90px', overflowX: 'hidden',
            }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 90)}px`;
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            style={{
              width: '44px', height: '44px', borderRadius: '12px', border: 'none', flexShrink: 0,
              background: !input.trim() || isLoading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#7c3aed,#a855f7)',
              color: !input.trim() || isLoading ? 'rgba(255,255,255,0.2)' : '#fff',
              cursor: !input.trim() || isLoading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
