import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
  id: string;
  text: string;
}

export const AgentDataStream: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const handleLog = (e: CustomEvent) => {
      const step = e.detail;
      const isProactive = step.isProactive === true || step.source === 'proactive';
      const sourceLabel = isProactive ? '[PROACTIVE] ' : '';

      let text = '';
      if (step.type === 'thinking') {
        text = step.text || step.title || step.message || '';
        text = text.replace('Supervisor mapping DAG...', 'Fleet Commander organizing mission...');
        text = text.replace(/Zen AI is thinking\.\.\. \(.*?\)/, 'Synthesizing neural pathways...');
        text = text.replace(/\[(.*?)\] Running\.\.\./, 'Deploying $1 agent...');
      } else if (step.type === 'tool_call') {
        const tool = step.toolName || step.title || '';
        text = `Executing Protocol: ${tool}`;
      } else if (step.type === 'tool_result') {
        const tool = step.toolName || step.title || '';
        text = `Protocol complete: ${tool}`;
      } else if (step.type === 'answer') {
        // Do not display the final answer in the processing stream to avoid duplicating UI text.
        return;
      } else {
        text = step.text || step.title || step.message || JSON.stringify(step);
      }

      if (text) {
        // Truncate massively long markdown answers so they don't break the UI
        if (text.length > 120) {
          text = text.substring(0, 120) + '...';
        }
        
        setLogs(prev => {
          // Deduplicate: Don't add if the text is exactly the same as the last one
          if (prev.length > 0 && prev[prev.length - 1].text === sourceLabel + text) {
            return prev;
          }
          const newLogs = [...prev, { id: Math.random().toString(36).substr(2, 9), text: sourceLabel + text }];
          // Keep only the last 3 logs for a clean cinematic look
          return newLogs.slice(-3);
        });
        
        // Reset the inactivity timer every time a new log arrives
        if (window as any) {
          clearTimeout((window as any)._agentStreamTimer);
          (window as any)._agentStreamTimer = setTimeout(() => {
            setLogs([]);
          }, 30000); // Fade out all logs after 30 seconds of silence
        }
      }
    };

    window.addEventListener('agent-log', handleLog as EventListener);
    return () => window.removeEventListener('agent-log', handleLog as EventListener);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: '220px', // Moved up to prevent overlap with AWAITING INPUT
      left: '0',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      pointerEvents: 'none', // Click through to the orb
      zIndex: 50,
      padding: '0 20px',
      gap: '8px'
    }}>
      <AnimatePresence mode="popLayout">
        {logs.map((log, index) => {
          // Calculate opacity: newest is 1, oldest is faint
          const isLatest = index === logs.length - 1;
          const opacity = isLatest ? 1 : index === logs.length - 2 ? 0.6 : 0.3;
          const scale = isLatest ? 1 : index === logs.length - 2 ? 0.95 : 0.9;
          
          return (
            <motion.div
              key={log.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(5px)' }}
              animate={{ opacity, y: 0, scale, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.8, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                color: 'var(--vault-secondary)',
                fontFamily: 'monospace',
                fontSize: isLatest ? '1.1rem' : '0.9rem',
                textShadow: `0 0 10px var(--vault-secondary)`,
                textAlign: 'center',
                maxWidth: '800px',
                letterSpacing: '1px'
              }}
            >
              {log.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
