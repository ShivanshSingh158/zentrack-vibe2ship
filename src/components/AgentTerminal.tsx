import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Minimize2, Maximize2, Trash, Archive } from 'lucide-react';

interface LogEntry {
  id: string;
  time: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer';
  title: string;
  data?: unknown;
  text?: string;
  isProactive?: boolean; // ✅ U6: distinguishes background proactive logs from user-initiated logs
}

export const AgentTerminal: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleLog = (e: CustomEvent) => {
      // Accumulate logs silently — user opens terminal explicitly via toggle button
      const step = e.detail;
      const now = new Date().toLocaleTimeString([], { hour12: false });

      // ✅ U6 FIX: Tag log entries by source (user command vs. proactive background loop).
      // ZenAgentPanel tags its events with source:'user'.
      // useProactiveAgent tags its events with isProactive:true.
      // AgentTerminal is the DEVELOPER DEBUG view — it shows ALL sources with clear labels.
      // ZenAgentPanel (user-facing chat) only shows source:'user' logs (handled in ZenAgentPanel itself).
      const isProactive = step.isProactive === true || step.source === 'proactive';
      const sourceLabel = isProactive ? '[PROACTIVE] ' : '';

      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        time: now,
        type: step.type,
        title: '',
        isProactive,
      };

      const getActionText = (tool: string) => {
        const mapping: Record<string, string> = {
          read_gmail: 'Scanning inbox radar...',
          send_gmail: 'Dispatching secure email...',
          reply_gmail: 'Drafting reply...',
          archive_gmail: 'Archiving thread...',
          get_tasks: 'Analyzing ZenTrack backlog...',
          get_free_calendar_slots: 'Scanning calendar availability...',
          list_calendar_events: 'Reviewing schedule...',
          create_google_doc: 'Initializing new document...',
          write_google_doc: 'Finalizing document...',
          send_notification: 'Pinging user...',
          delegate_task: 'Deploying sub-agent...',
        };
        return mapping[tool] || `Executing Protocol: ${tool}`;
      };

      const getResultText = (tool: string) => {
        const mapping: Record<string, string> = {
          read_gmail: 'Inbox scan complete',
          send_gmail: 'Email dispatched',
          reply_gmail: 'Reply sent',
          archive_gmail: 'Thread archived',
          get_tasks: 'Backlog retrieved',
          get_free_calendar_slots: 'Availability confirmed',
          list_calendar_events: 'Schedule verified',
          create_google_doc: 'Document initialized',
          write_google_doc: 'Document written',
          send_notification: 'Ping delivered',
          delegate_task: 'Sub-agent deployed',
        };
        return mapping[tool] || `Protocol complete: ${tool}`;
      };

      if (step.type === 'thinking') {
        let text = step.text || step.title || step.message || '';
        text = text.replace('Supervisor mapping DAG...', 'Fleet Commander organizing mission...');
        text = text.replace(/Zen AI is thinking\.\.\. \(.*?\)/, 'Synthesizing neural pathways...');
        text = text.replace(/\[(.*?)\] Running\.\.\./, 'Deploying $1 agent...');
        newLog.text = sourceLabel + text;
      } else if (step.type === 'tool_call') {
        newLog.text = sourceLabel + getActionText(step.toolName || step.title || '');
        newLog.data = step.args || step.data;
      } else if (step.type === 'tool_result') {
        newLog.text = `${sourceLabel}✓ ${getResultText(step.toolName || step.title || '')}`;
        newLog.data = step.result || step.data;
      } else if (step.type === 'answer') {
        const fullText = step.text || step.title || step.message || '';
        if (fullText.length > 120) {
          newLog.text = sourceLabel + fullText.substring(0, 120) + '...';
        } else {
          newLog.text = sourceLabel + fullText;
        }
      } else {
        newLog.text = sourceLabel + (step.text || step.title || step.message || JSON.stringify(step));
      }

      setLogs(prev => [...prev, newLog]);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLogs([]);
        setIsOpen(false);
      }, 120000); // 2 minutes auto-clear
    };


    window.addEventListener('agent-log', handleLog as EventListener);

    const handleToggle = () => setIsOpen(o => !o);
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    
    window.addEventListener('agent-terminal-toggle', handleToggle);
    window.addEventListener('agent-terminal-open', handleOpen);
    window.addEventListener('agent-terminal-close', handleClose);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('agent-log', handleLog as EventListener);
      window.removeEventListener('agent-terminal-toggle', handleToggle);
      window.removeEventListener('agent-terminal-open', handleOpen);
      window.removeEventListener('agent-terminal-close', handleClose);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0, height: isMinimized ? '40px' : '400px' }}
        exit={{ opacity: 0, y: 50 }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '500px',
          background: 'rgba(5, 5, 10, 0.85)',
          border: '1px solid rgba(0, 240, 255, 0.4)',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.9), 0 0 30px rgba(0, 240, 255, 0.2)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono)',
          backdropFilter: 'blur(20px) saturate(150%)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.1), transparent)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00F0FF', fontSize: '13px', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.1em' }}>
            <Terminal size={16} />
            <span>SYS.OP // ZEN_AGENT</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('show-report-archive'))}
              style={{ background: 'none', border: 'none', color: '#00F0FF', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0, fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}
              title="View Mission Archives"
            >
              <Archive size={12} /> Data_Logs
            </button>
            <button 
              onClick={() => {
                setLogs([]);
                window.dispatchEvent(new CustomEvent('agent-clear-memory'));
              }} 
              style={{ background: 'transparent', border: 'none', color: '#506070', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Clear Terminal & Agent Memory"
            >
              <Trash size={14} />
            </button>
            <button onClick={() => setIsMinimized(!isMinimized)} style={{ background: 'transparent', border: 'none', color: '#506070', cursor: 'pointer' }}>
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button onClick={() => { setIsOpen(false); setLogs([]); window.dispatchEvent(new CustomEvent('agent-clear-memory')); }} style={{ background: 'transparent', border: 'none', color: '#FF0055', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div 
            ref={scrollRef} 
            data-lenis-prevent="true"
            style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '12px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px',
              overscrollBehavior: 'contain',
              position: 'relative'
            }}
          >
            {/* Radar Scan Overlay */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, height: '50%',
              background: 'linear-gradient(to bottom, transparent, rgba(0, 240, 255, 0.05))',
              borderBottom: '1px solid rgba(0, 240, 255, 0.3)',
              animation: 'radar-scan 4s linear infinite',
              pointerEvents: 'none',
              zIndex: 10
            }} />
            {logs.map((log) => (
              <div key={log.id} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#6b7280', flexShrink: 0 }}>[{log.time}]</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{
                      // ✅ U6: proactive logs are visually dimmer (slate) so developers can
                      // immediately distinguish background autonomous activity from user-initiated commands
                      color: log.isProactive
                        ? (log.type === 'tool_call' ? '#506070' : log.type === 'tool_result' ? '#00FF88' : '#90A0B0')
                        : (log.type === 'tool_call' ? '#FF8A00' :
                           log.type === 'tool_result' ? '#00F0FF' :
                           log.type === 'answer' ? '#B534FF' : '#ffffff'),
                      fontStyle: log.isProactive ? 'italic' : 'normal',
                      textShadow: log.type === 'answer' ? '0 0 8px rgba(181,52,255,0.4)' : 'none'
                    }}>
                      {log.text}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {logs.length > 0 && logs[logs.length - 1].type !== 'answer' && (
              <motion.div 
                animate={{ opacity: [1, 0] }} 
                transition={{ repeat: Infinity, duration: 0.8 }}
                style={{ width: '8px', height: '14px', background: '#00F0FF', marginTop: '4px', marginLeft: '60px', boxShadow: '0 0 8px #00F0FF' }}
              />
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
