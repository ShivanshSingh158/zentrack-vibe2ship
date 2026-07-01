/**
 * AgentCommandBar — The primary input bar for launching Olympus Protocol agents.
 *
 * Includes the voice microphone with silence auto-submit, text input,
 * and the clear-memory / submit buttons. Also handles the pulsing ring
 * and live-streaming transcription overlay when voice is active.
 *
 * Props:
 *  - isExecuting     — whether an agent is currently running
 *  - isListening     — whether the mic is active
 *  - silencePercent  — progress 0-100 toward auto-submit
 *  - interimTranscript — live speech text
 *  - commandInput    — current text in the input
 *  - setCommandInput — state setter for the input
 *  - onExecute       — callback to run the agent
 *  - onStop          — callback to stop the running agent
 *  - onClearMemory   — callback to wipe the agent history
 *  - onToggleListen  — callback to start/stop the mic
 *  - hasHistory      — whether there's history to clear
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Eraser, Mic, MicOff, Archive } from 'lucide-react';

interface AgentCommandBarProps {
  isExecuting: boolean;
  isListening: boolean;
  silencePercent: number;
  interimTranscript: string;
  commandInput: string;
  setCommandInput: (val: string) => void;
  onExecute: () => void;
  onStop: () => void;
  onClearMemory: () => void;
  onToggleListen: () => void;
  hasHistory: boolean;
}

export function AgentCommandBar({
  isExecuting,
  isListening,
  silencePercent,
  interimTranscript,
  commandInput,
  setCommandInput,
  onExecute,
  onStop,
  onClearMemory,
  onToggleListen,
  hasHistory,
}: AgentCommandBarProps) {
  return (
    <div className={`command-bar-container ${isExecuting ? 'executing-border' : ''}`} style={{ position: 'relative' }}>
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 12px)',
              left: 0, right: 0,
              background: silencePercent > 80 ? 'rgba(16, 185, 129, 0.95)' : 'rgba(109, 40, 217, 0.96)',
              backdropFilter: 'blur(12px)',
              padding: '0.75rem 1rem', borderRadius: '14px',
              color: '#fff', fontSize: '0.88rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              boxShadow: silencePercent > 80 ? '0 4px 24px rgba(16,185,129,0.45)' : '0 4px 24px rgba(139, 92, 246, 0.45)',
              zIndex: 20, pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.18)',
              transition: 'background 0.3s ease, box-shadow 0.3s ease',
            }}
          >
            {/* Silence countdown ring */}
            <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
                <circle
                  cx="14" cy="14" r="11" fill="none"
                  stroke={silencePercent > 80 ? '#6ee7b7' : '#c4b5fd'}
                  strokeWidth="2.5"
                  strokeDasharray={`${2 * Math.PI * 11}`}
                  strokeDashoffset={`${2 * Math.PI * 11 * (1 - silencePercent / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.3s ease' }}
                />
              </svg>
              {/* Mic pulse dot in center */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 8, height: 8, borderRadius: '50%',
                background: silencePercent > 80 ? '#10b981' : '#a78bfa',
                animation: silencePercent > 0 && silencePercent < 80 ? 'none' : 'pulse 0.8s infinite alternate',
                transition: 'background 0.3s ease',
              }} />
            </div>

            {/* Live voice bars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              {[0.4, 0.7, 1, 0.65, 0.45].map((h, i) => (
                <div key={i} style={{
                  width: 3, borderRadius: 2, background: 'rgba(255,255,255,0.7)',
                  height: silencePercent > 5 ? `${4 + h * 10}px` : '4px',
                  animation: silencePercent > 5 && silencePercent < 80 ? `voiceBar ${0.4 + i * 0.12}s ease-in-out infinite alternate` : 'none',
                  transition: 'height 0.2s ease',
                }} />
              ))}
            </div>

            {/* Transcript text */}
            <span style={{ fontStyle: 'italic', flex: 1, lineHeight: 1.4, fontSize: '0.86rem' }}>
              {silencePercent > 80
                ? '⚡ Sending to agents...'
                : interimTranscript
                  ? `"${commandInput ? commandInput + ' ' : ''}${interimTranscript}"`
                  : commandInput
                  ? `"${commandInput}" ✓`
                  : 'Listening... speak naturally'
              }
            </span>

            {/* Hint text */}
            {silencePercent > 0 && silencePercent <= 80 && (
              <span style={{ fontSize: '0.72rem', opacity: 0.7, flexShrink: 0 }}>
                sending in {((1 - silencePercent / 100) * 1.8).toFixed(1)}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always-listening visual pulse ring around mic when active */}
      {isListening && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)',
            width: 40, height: 40, borderRadius: '50%',
            border: `2px solid ${silencePercent > 80 ? '#10b981' : '#a78bfa'}`,
            animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            pointerEvents: 'none', zIndex: 5,
          }}
        />
      )}

      <input
        type="text"
        value={commandInput}
        onChange={e => setCommandInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onExecute(); }}
        disabled={isExecuting}
        placeholder={isListening
          ? "Listening... speak naturally, I'll auto-send when you stop"
          : "Assign a task to the Fleet... e.g. 'Read my latest emails and summarize'"}
        className="agent-command-input focus:outline-none focus:ring-0 focus:border-transparent"
        style={{
          borderColor: isListening ? (silencePercent > 80 ? '#10b981' : '#a78bfa') : undefined,
          transition: 'border-color 0.3s ease'
        }}
      />
      
      <div className="command-bar-actions">
        {!isExecuting && hasHistory && (
          <button
            className="voice-command-btn"
            onClick={onClearMemory}
            title="Clear agent memory for a fresh start"
            style={{ color: '#a1a1aa' }}
          >
            <Eraser size={16} />
          </button>
        )}

        <button
          className="voice-command-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('show-report-archive'))}
          title="View Mission Archives"
          style={{ color: '#a855f7' }}
        >
          <Archive size={16} />
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className={`voice-command-btn ${isListening ? 'listening' : ''}`}
            onClick={onToggleListen}
            disabled={isExecuting}
            title={isListening ? 'Stop & submit what you said' : 'Start voice command (auto-sends after 1.8s silence)'}
            style={{
              background: isListening ? (silencePercent > 80 ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.25)') : undefined,
              boxShadow:  isListening ? `0 0 0 2px ${silencePercent > 80 ? '#10b981' : '#a78bfa'}` : undefined,
              transition: 'all 0.3s ease',
            }}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          className="execute-command-btn"
          onClick={isExecuting ? onStop : onExecute}
          disabled={!isExecuting && !commandInput.trim()}
          title={isExecuting ? 'Stop Agent' : 'Send Task'}
          style={{ background: isExecuting ? 'rgba(239,68,68,0.1)' : undefined }}
        >
          {isExecuting ? <Square size={16} color="#ef4444" fill="#ef4444" /> : <Send size={16} />}
        </motion.button>
      </div>
    </div>
  );
}
