import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentLogEntry } from './hooks/useSaraOrchestration';

interface TerminalFeedProps {
  agentLogs: AgentLogEntry[];
  terminalLines: string[];
  activeAgents: string[];
  AGENTS: any[];
}

const THREADS = [
  'COGNI', 'NEURA', 'SYNTH', 'QUANT', 'HOLOG',
  'CHRON', 'AETHE', 'NEXUS', 'SENTI', 'STATI',
  'RISK',  'GHOST', 'HYPER', 'INTER', 'VIRTU'
];

export const TerminalFeed: React.FC<TerminalFeedProps> = ({
  agentLogs,
  terminalLines,
  activeAgents,
  AGENTS,
}) => {
  const recentActivities = agentLogs.filter(log => log.type !== 'system').slice(-4);
  const recentTerminal = terminalLines.slice(-5);
  const isAnyActive = activeAgents.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.85rem' }}>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      {/* ── AGENT ACTIVITY // LIVE FEED (30%) ───────────────────────────── */}
      <div style={{
        flex: 3,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '1.2rem', flexShrink: 0 }}>
          Agent Activity
        </div>
        <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
          <AnimatePresence initial={false}>
            {recentActivities.map(log => {
              const isAnswer = log.type === 'answer';
              
              if (isAnswer) {
                return (
                  <motion.div
                    key={log.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    style={{
                      background: 'rgba(122, 158, 130, 0.1)',
                      border: '1px solid rgba(122, 158, 130, 0.2)',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: '0.3rem',
                      marginTop: '0.4rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result: log.text } }));
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#7a9e82', fontSize: '0.8rem' }}>✓</span>
                      <span style={{ color: '#7a9e82', fontSize: '0.75rem', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '0.02em' }}>
                        Mission Report Generated
                      </span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', paddingLeft: '1.1rem', fontFamily: "'Inter', sans-serif" }}>
                      Tap to open full response
                    </div>
                  </motion.div>
                );
              }
              const agentObj = log.agent ? AGENTS.find(a => a.id === log.agent) : null;
              const dotColor = agentObj ? agentObj.color : '#d1b28e';
              const textColor = agentObj ? agentObj.color + 'e6' : 'rgba(235, 210, 175, 0.8)';
              
              return (
                <motion.div
                  layout
                  key={log.id}
                  initial={{ opacity: 0, filter: 'blur(4px)', x: -10 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}
                >
                  <span style={{ color: dotColor, fontSize: '0.8rem', marginTop: '2px', flexShrink: 0, textShadow: `0 0 12px ${dotColor}80` }}>●</span>
                  <span style={{ 
                    color: textColor, 
                    fontSize: '0.8rem', 
                    fontFamily: "'Inter', sans-serif",
                    lineHeight: 1.6,
                    fontWeight: 400
                  }}>
                    {log.agent ? <span style={{ fontWeight: 600, color: dotColor, textTransform: 'capitalize' }}>{log.agent.toLowerCase()}</span> : null}
                    {log.agent ? ' is ' : ''}
                    {log.agent ? log.text.toLowerCase().replace(/^\[.*?\]\s*/, '') : log.text}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {recentActivities.length === 0 && (
            <div style={{ fontSize: '0.52rem', color: 'rgba(196,149,106,0.25)', fontStyle: 'italic', fontFamily: "'JetBrains Mono', monospace" }}>
              &gt; awaiting agent dispatch...
            </div>
          )}
        </div>
      </div>

      {/* ── SYSTEM TERMINAL // LIVE LOG (50%) ────────────────────────────── */}
      <div style={{
        flex: 5,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '1.2rem', flexShrink: 0 }}>
          Terminal Logs
        </div>
        <div className="hide-scrollbar" style={{ 
          flex: 1, overflowY: 'auto', paddingRight: '0.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          paddingLeft: '0.2rem', marginLeft: '0'
        }}>
          {recentTerminal.map((line, idx) => {
            const isErr = line.includes('ERR') || line.includes('WARN') || line.includes('❌');
            const isSuccess = line.includes('✓') || line.includes('success') || line.includes('OK') || line.includes('complete');
            const isReal = line.includes('[APP]') || line.includes('[SYS]') || line.includes('[SYNC]');
            
            let bg = 'rgba(255, 255, 255, 0.03)';
            let border = 'rgba(255, 255, 255, 0.1)';
            let color = '#d1b28e';
            let glow = 'none';

            if (isErr) {
              bg = 'rgba(255, 50, 50, 0.08)';
              border = '#f87171';
              color = '#fca5a5';
              glow = '0 0 10px rgba(255,50,50,0.2)';
            } else if (isSuccess) {
              bg = 'rgba(122, 158, 130, 0.05)';
              border = '#7a9e82';
              bg = 'rgba(16, 185, 129, 0.08)';
              border = 'rgba(16, 185, 129, 0.2)';
              color = '#10b981';
            } else if (isReal) {
              bg = 'rgba(165, 153, 255, 0.08)';
              border = 'rgba(165, 153, 255, 0.2)';
              color = '#a599ff';
            }

            return (
              <motion.div
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                key={idx}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  color: color,
                  fontFamily: "'Inter', sans-serif",
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                  fontWeight: 400
                }}
              >
                {line}
              </motion.div>
            );
          })}
          {recentTerminal.length === 0 && (
             <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
               Awaiting system logs...
             </div>
          )}
        </div>
      </div>

      {/* ── ACTIVE ORCHESTRATION GRAPH (20%) ────────────────────────────── */}
      <div style={{
        flex: 2,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '1.2rem', flexShrink: 0 }}>
          Orchestration Graph
        </div>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.02em', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>
          Live Sub-Agent Tracker
        </div>
        <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start' }}>
          {activeAgents.length > 0 ? (
            activeAgents.map(agentId => {
              const agent = AGENTS.find(a => a.id === agentId);
              if (!agent) return null;
              return (
                <motion.div
                  key={agent.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '12px',
                    border: `1px solid ${agent.color}40`,
                    background: `${agent.color}15`,
                    display: 'flex', alignItems: 'center', gap: '10px',
                    boxShadow: `0 4px 12px ${agent.color}20`
                  }}
                >
                  <motion.div 
                    animate={{ opacity: [1, 0.4, 1] }} 
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.color, boxShadow: `0 0 12px ${agent.color}` }}
                  />
                  <span style={{ fontSize: '0.75rem', color: agent.color, fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '0.02em', textTransform: 'capitalize' }}>
                    {agent.title.split(' ')[0].toLowerCase()}
                  </span>
                </motion.div>
              );
            })
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif", width: '100%', textAlign: 'center', marginTop: '10px', fontWeight: 500 }}>
              No active orchestrations
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

