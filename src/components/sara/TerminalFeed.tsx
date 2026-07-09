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
        background: 'rgba(10, 8, 5, 0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(196, 149, 106, 0.08)',
        borderRadius: '12px',
        padding: '1.2rem 1rem',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.65rem', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.22em', color: '#c4956a', opacity: 0.7, marginBottom: '0.4rem', flexShrink: 0 }}>
          Agent Activity
        </div>
        <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem' }}>
          <AnimatePresence initial={false}>
            {recentActivities.map(log => {
              const isAnswer = log.type === 'answer';
              
              if (isAnswer) {
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(122, 158, 130, 0.07)',
                      border: '1px solid rgba(122, 158, 130, 0.18)',
                      borderRadius: '6px',
                      padding: '7px 8px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: '0.2rem',
                      marginTop: '0.2rem'
                    }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result: log.text } }));
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#7a9e82', fontSize: '0.7rem' }}>✓</span>
                      <span style={{ color: '#7a9e82', fontSize: '0.65rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.05em' }}>
                        MISSION REPORT GENERATED
                      </span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', paddingLeft: '1.1rem', fontFamily: "'Rajdhani', sans-serif" }}>
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
                  key={log.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}
                >
                  <span style={{ color: dotColor, fontSize: '0.7rem', marginTop: '1px', flexShrink: 0, textShadow: `0 0 8px ${dotColor}80` }}>◎</span>
                  <span style={{ 
                    color: textColor, 
                    fontSize: '0.7rem', 
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1.5 
                  }}>
                    {log.agent ? `${log.agent} is ${log.text.toLowerCase().replace(/^\[.*?\]\s*/, '')}` : log.text}
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
        background: 'rgba(10, 8, 5, 0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(196, 149, 106, 0.08)',
        borderRadius: '12px',
        padding: '1.2rem 1rem',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.65rem', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.22em', color: '#c4956a', opacity: 0.7, marginBottom: '0.4rem', flexShrink: 0 }}>
          Terminal Logs
        </div>
        <div className="hide-scrollbar" style={{ 
          flex: 1, overflowY: 'auto', paddingRight: '0.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.9rem',
          borderLeft: '1px solid rgba(196, 149, 106, 0.3)',
          paddingLeft: '0.8rem', marginLeft: '0.2rem'
        }}>
          {recentTerminal.map((line, idx) => {
            const isErr = line.includes('ERR') || line.includes('WARN') || line.includes('❌');
            const isSuccess = line.includes('✓') || line.includes('success') || line.includes('OK') || line.includes('complete');
            const isReal = line.includes('[APP]') || line.includes('[SYS]') || line.includes('[SYNC]');
            
            let bg = 'rgba(196, 149, 106, 0.03)';
            let border = 'rgba(196, 149, 106, 0.3)';
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
              color = '#c2d6c6';
              glow = '0 0 10px rgba(122,158,130,0.1)';
            } else if (isReal) {
              const match = line.match(/^\[([A-Z_]+)\]/);
              const agentId = match ? match[1] : null;
              const agentObj = agentId ? AGENTS.find(a => a.id === agentId) : null;
              
              if (agentObj) {
                bg = agentObj.color + '10'; // 6% opacity approx
                border = agentObj.color;
                color = agentObj.color + 'e6'; // 90% opacity
                glow = `0 0 10px ${agentObj.color}20`;
              } else {
                bg = 'rgba(255, 170, 0, 0.08)';
                border = '#fbbf24';
                color = '#fde68a';
                glow = '0 0 10px rgba(255,170,0,0.15)';
              }
            }

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  background: bg,
                  borderLeft: `3px solid ${border}`,
                  borderRadius: '0 4px 4px 0',
                  padding: '8px 12px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.65rem',
                  color: color,
                  lineHeight: 1.5,
                  boxShadow: `0 2px 5px rgba(0,0,0,0.2), ${glow}`,
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  wordBreak: 'break-word',
                  letterSpacing: '0.02em',
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
        background: 'rgba(10, 8, 5, 0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(196, 149, 106, 0.08)',
        borderRadius: '12px',
        padding: '1.2rem 1rem',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.65rem', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.22em', color: '#c4956a', opacity: 0.7, marginBottom: '1rem', flexShrink: 0 }}>
          Orchestration Graph
        </div>
        <div style={{ fontSize: '0.5rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.8rem', flexShrink: 0 }}>
          LIVE SUB-AGENT TRACKER
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
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${agent.color}80`,
                    background: `${agent.color}15`,
                    display: 'flex', alignItems: 'center', gap: '8px',
                    boxShadow: `0 0 12px ${agent.color}30`
                  }}
                >
                  <motion.div 
                    animate={{ opacity: [1, 0.4, 1] }} 
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ width: '6px', height: '6px', borderRadius: '50%', background: agent.color, boxShadow: `0 0 8px ${agent.color}` }}
                  />
                  <span style={{ fontSize: '0.6rem', color: agent.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.05em' }}>
                    {agent.title.split(' ')[0].toUpperCase()}
                  </span>
                </motion.div>
              );
            })
          ) : (
            <div style={{ fontSize: '0.55rem', color: 'rgba(196,149,106,0.3)', fontStyle: 'italic', fontFamily: "'JetBrains Mono', monospace", width: '100%', textAlign: 'center', marginTop: '10px' }}>
              No active orchestrations
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

