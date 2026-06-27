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
      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        time: now,
        type: step.type,
        title: '',
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
        newLog.text = text;
      } else if (step.type === 'tool_call') {
        newLog.text = getActionText(step.toolName || step.title || '');
        newLog.data = step.args || step.data;
      } else if (step.type === 'tool_result') {
        newLog.text = `✓ ${getResultText(step.toolName || step.title || '')}`;
        newLog.data = step.result || step.data;
      } else if (step.type === 'answer') {
        const fullText = step.text || step.title || step.message || '';
        if (fullText.length > 120) {
          newLog.text = fullText.substring(0, 120) + '...';
        } else {
          newLog.text = fullText;
        }
      } else {
        newLog.text = step.text || step.title || step.message || JSON.stringify(step);
      }

      setLogs(prev => [...prev, newLog]);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLogs([]);
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
          background: 'rgba(5, 5, 10, 0.95)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 20px rgba(168,85,247,0.15)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(168,85,247,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7', fontSize: '14px', fontWeight: 'bold' }}>
            <Terminal size={16} />
            <span>ZEN AGENT TERMINAL</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('show-report-archive'))}
              style={{ background: 'none', border: 'none', color: '#a855f7', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
              title="View Mission Archives"
            >
              <Archive size={14} /> Archives
            </button>
            <button 
              onClick={() => {
                setLogs([]);
                window.dispatchEvent(new CustomEvent('agent-clear-memory'));
              }} 
              style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Clear Terminal & Agent Memory"
            >
              <Trash size={14} />
            </button>
            <button onClick={() => setIsMinimized(!isMinimized)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button onClick={() => { setIsOpen(false); setLogs([]); window.dispatchEvent(new CustomEvent('agent-clear-memory')); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
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
              overscrollBehavior: 'contain'
            }}
          >
            {logs.map((log) => (
              <div key={log.id} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#6b7280', flexShrink: 0 }}>[{log.time}]</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ 
                      color: log.type === 'tool_call' ? '#eab308' : 
                             log.type === 'tool_result' ? '#10b981' : 
                             log.type === 'answer' ? '#a855f7' : '#9ca3af'
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
                style={{ width: '8px', height: '14px', background: '#a855f7', marginTop: '4px', marginLeft: '60px' }}
              />
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
