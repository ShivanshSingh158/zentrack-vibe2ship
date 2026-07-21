import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentClusterProps {
  AGENTS: any[];
  activeAgents: string[];
  agentErrors: Record<string, boolean>;
  isSpeaking: boolean;
  isConversationListening: boolean;
  statusPulse: number;
  globalData?: any;
}

export const AgentCluster: React.FC<AgentClusterProps> = ({
  AGENTS,
  activeAgents,
  agentErrors,
  isSpeaking,
  isConversationListening,
  statusPulse,
  globalData,
}) => {
  const isAnyActive = activeAgents.length > 0;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Compute User Load Diagnostics
  const tasks = globalData?.tasks || [];
  const openTasks = tasks.filter((t: any) => t.status === 'todo' || t.status === 'in-progress');
  const highPriority = openTasks.filter((t: any) => t.priority === 'High' || t.priority === 'Critical');
  const overdue = openTasks.filter((t: any) => t.dueDate && new Date(t.dueDate).getTime() < Date.now() - 86400000);
  const doneToday = tasks.filter((t: any) => t.status === 'done' && t.updatedAt && new Date(t.updatedAt).toDateString() === new Date().toDateString());
  
  const urgencyPercent = openTasks.length ? Math.min(100, Math.round((highPriority.length / openTasks.length) * 100)) : 0;
  const overdueVal = overdue.length;
  const donePercent = tasks.length ? Math.min(100, Math.round((doneToday.length / Math.max(1, openTasks.length + doneToday.length)) * 100)) : 0;
  const focusLoad = isSpeaking ? 95 : isConversationListening ? 88 : isAnyActive ? 75 : 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* ── METRICS (30%) ──────────────────────────────────────────────────────── */}
      <div style={{
        flex: 3,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '1.2rem', flexShrink: 0 }}>
          User Load Diagnostics
        </div>
        {[
          { label: 'URGENCY MATRIX', val: urgencyPercent, text: `${urgencyPercent}%`, color: '#ef4444' },
          { label: 'OVERDUE TASKS',  val: Math.min(100, overdueVal * 10), text: `${overdueVal} PENDING`, color: '#f59e0b' },
          { label: 'DAILY PROGRESS', val: donePercent, text: `${donePercent}%`, color: '#10b981' },
          { label: 'S.A.R.A SYNC',   val: focusLoad, text: `${focusLoad}%`, color: '#c4956a' },
        ].map(item => (
          <div key={item.label} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: "'Inter', sans-serif", letterSpacing: '0.02em', marginBottom: '6px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
              <span style={{ textTransform: 'capitalize' }}>{item.label.toLowerCase()}</span>
              <span style={{ color: item.color, fontWeight: 600 }}>{item.text}</span>
            </div>
            <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
              <motion.div
                animate={{ width: `${item.val}%` }}
                transition={{ duration: 0.5 }}
                style={{ height: '100%', borderRadius: '1px', background: `linear-gradient(90deg, ${item.color}60, ${item.color})`, boxShadow: isAnyActive ? `0 0 4px ${item.color}` : 'none' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── ACTIVE AGENTS LIST (70%) ────────────────────────────────────────────── */}
      <div style={{
        flex: 7,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '1.2rem', flexShrink: 0 }}>
          Active Agents
        </div>
        {AGENTS.map(agent => {
          const isActive = activeAgents.includes(agent.id);
          const isError = agentErrors[agent.id];
          const dotColor = isError ? '#ef4444' : agent.color;
          const inactiveColor = agent.color + '40'; // 25% opacity
          const inactiveTextColor = agent.color + '90'; // 56% opacity
          const isSelected = selectedAgentId === agent.id;

          return (
            <div key={agent.id} style={{ marginBottom: '4px' }}>
              <motion.div
                whileHover={{ scale: 1.02, background: isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedAgentId(isSelected ? null : agent.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '16px',
                  background: isActive ? `${dotColor}15` : isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  boxShadow: isActive ? `inset 0 0 12px ${dotColor}10` : 'none',
                  transition: 'background 0.3s ease, box-shadow 0.3s ease',
                  cursor: 'pointer',
                }}
              >
                <motion.div
                  animate={{
                    scale: isActive ? [1, 1.5, 1] : 1,
                    boxShadow: isActive ? [`0 0 4px ${dotColor}`, `0 0 12px ${dotColor}`, `0 0 4px ${dotColor}`] : 'none',
                  }}
                  transition={{ duration: isError ? 0.4 : 0.8, repeat: isActive ? Infinity : 0 }}
                  style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive ? dotColor : inactiveColor, flexShrink: 0 }}
                />
                <span style={{
                  fontSize: '0.8rem', letterSpacing: '0.02em', flex: 1, fontFamily: "'Inter', sans-serif",
                  color: isActive ? dotColor : isSelected ? agent.color : inactiveTextColor,
                  fontWeight: isActive ? 600 : 500,
                  textTransform: 'capitalize',
                  textShadow: isActive ? `0 0 8px ${dotColor}60` : 'none',
                  transition: 'color 0.2s',
                }}>
                  {agent.id.toLowerCase()}
                </span>
                {isActive && (
                  <span style={{ fontSize: '0.65rem', color: dotColor, fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>
                    {isError ? 'Error' : 'Active'}
                  </span>
                )}
              </motion.div>
              
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      margin: '4px 8px 8px 8px',
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '16px',
                      borderLeft: `3px solid ${dotColor}`,
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.7)',
                      lineHeight: 1.5,
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      <div style={{ color: dotColor, fontWeight: 600, marginBottom: '6px', fontSize: '0.75rem', letterSpacing: '0.02em' }}>
                        {agent.title}
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        {agent.description}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};
