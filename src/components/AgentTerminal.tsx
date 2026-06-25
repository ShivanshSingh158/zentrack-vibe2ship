import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Minimize2, Maximize2, Trash } from 'lucide-react';

interface LogEntry {
  id: string;
  time: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer';
  title: string;
  data?: any;
}

export const AgentTerminal: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLog = (e: CustomEvent) => {
      setIsOpen(true);
      const step = e.detail;
      const now = new Date().toLocaleTimeString([], { hour12: false });
      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        time: now,
        type: step.type,
        title: '',
      };

      if (step.type === 'thinking') {
        newLog.text = step.text || step.title || step.message;
      } else if (step.type === 'tool_call') {
        newLog.text = `Executing: ${step.toolName || step.title}`;
        newLog.data = step.args || step.data;
      } else if (step.type === 'tool_result') {
        newLog.text = `Result: ${step.toolName || step.title}`;
        newLog.data = step.result || step.data;
      } else if (step.type === 'answer') {
        const fullText = step.text || step.title || step.message || '';
        newLog.text = fullText.length > 80 ? fullText.substring(0, 80) + '... (See Mission Report)' : fullText;
      } else {
        newLog.text = step.text || step.title || step.message || JSON.stringify(step);
      }

      setLogs(prev => [...prev, newLog]);
    };

    window.addEventListener('agent-log' as any, handleLog);
    return () => window.removeEventListener('agent-log' as any, handleLog);
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
            ZEN AGENT TERMINAL
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ color: '#6b7280' }}>[{log.time}]</span>
                  <span style={{ 
                    color: log.type === 'tool_call' ? '#eab308' : 
                           log.type === 'tool_result' ? '#10b981' : 
                           log.type === 'answer' ? '#a855f7' : '#9ca3af'
                  }}>
                    {log.text}
                  </span>
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
