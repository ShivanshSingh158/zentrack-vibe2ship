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



      {/* Terminal Prefix */}
      <span className="terminal-prefix" style={{ 
        color: 'var(--vault-primary)', 
        fontFamily: 'var(--vault-font-mono)', 
        fontSize: '0.95rem', 
        marginLeft: '0.5rem',
        fontWeight: 600,
        textShadow: '0 0 8px rgba(167, 139, 250, 0.6)'
      }}>
        Sara\&gt;
      </span>

      <input
        type="text"
        value={commandInput}
        onChange={e => setCommandInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onExecute(); }}
        placeholder={isExecuting ? "INTERRUPT OR ASK QUESTION..." : "AWAITING COMMAND SEQUENCE..."}
        className="agent-command-input focus:outline-none focus:ring-0 focus:border-transparent"
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
            title={isListening ? 'Stop & submit what you said' : 'Start voice command (auto-sends after 1.8s silence)'}
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
