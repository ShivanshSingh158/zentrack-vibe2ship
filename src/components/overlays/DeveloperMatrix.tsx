import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Terminal, X, ArrowRight, Activity, Zap, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import type { NetworkLog } from '../../utils/networkLogger';

export const DeveloperMatrix: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [logs, setLogs] = useState<NetworkLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLog = (e: Event) => {
      const customEvent = e as CustomEvent<NetworkLog>;
      setLogs(prev => [...prev.slice(-199), customEvent.detail]); // keep last 200 logs
    };
    window.addEventListener('network-log', handleLog);
    return () => window.removeEventListener('network-log', handleLog);
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const apiLogs = logs.filter(l => l.type === 'API');
  const wsLogs = logs.filter(l => l.type === 'WEBSOCKET');

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: isExpanded ? 'calc(100vw - 4rem)' : '800px',
        height: isExpanded ? 'calc(100vh - 4rem)' : '500px',
        background: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(124, 58, 237, 0.3)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Fira Code', 'Courier New', monospace"
      }}
    >
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}>
          <Terminal size={18} />
          <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>Developer Matrix</span>
          <span style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem' }}>
            LIVE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setLogs([])} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}>
            <Trash2 size={16} />
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}>
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* API Traffic Pane */}
        <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Activity size={14} /> REST API Traffic (Cloud Functions)
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {apiLogs.map(log => (
              <div key={log.id} style={{ fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ 
                    color: log.method === 'GET' ? '#3b82f6' : log.method === 'POST' ? '#10b981' : log.method === 'DELETE' ? '#ef4444' : '#f59e0b',
                    fontWeight: 700
                  }}>
                    {log.method}
                  </span>
                  <span style={{ color: '#e5e7eb' }}>{log.endpoint}</span>
                  <span style={{ marginLeft: 'auto', color: log.status === 'success' ? '#10b981' : log.status === 'pending' ? '#fbbf24' : '#ef4444', fontSize: '0.7rem' }}>
                    {log.status === 'success' ? '200 OK' : log.status === 'pending' ? '...' : '500 ERR'}
                  </span>
                </div>
                {Object.keys(log.payload).length > 0 && (
                  <pre style={{ margin: 0, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', color: '#9ca3af', fontSize: '0.7rem', overflowX: 'auto' }}>
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={apiLogs.length > wsLogs.length ? bottomRef : null} />
          </div>
        </div>

        {/* WebSocket Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Zap size={14} color="#f59e0b" /> WebSocket Stream (Firebase RTDB)
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {wsLogs.map(log => (
              <div key={log.id} style={{ fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <ArrowRight size={12} color="#f59e0b" />
                  <span style={{ color: '#fcd34d', fontWeight: 600 }}>{log.event}</span>
                  <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
                    {new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1)}
                  </span>
                </div>
                {Object.keys(log.payload).length > 0 && (
                  <pre style={{ margin: 0, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', color: '#d1d5db', fontSize: '0.7rem', overflowX: 'auto' }}>
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={wsLogs.length >= apiLogs.length ? bottomRef : null} />
          </div>
        </div>

      </div>
    </motion.div>
  );
};
