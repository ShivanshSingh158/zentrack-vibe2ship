import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, ShieldAlert, Ghost, Mail, Calendar, Target, Sun } from 'lucide-react';
import { useVoice } from '../contexts/VoiceContext';
import { FloatingDock } from './FloatingDock';
import { CommandPalette } from './CommandPalette';
import { VoiceQuickCaptureWidget } from '../features/_shared/VoiceQuickCaptureWidget';

interface BottomHeaderProps {
  onOpenSara: () => void;
  showSara: boolean;
}

export const BottomHeader: React.FC<BottomHeaderProps> = ({ onOpenSara, showSara }) => {
  const [showPetals, setShowPetals] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/home' || location.pathname === '/';

  const petals = [
    {
      id: 'risk',
      label: 'Risk Scan',
      icon: <ShieldAlert size={16} />,
      color: 'linear-gradient(135deg,#ef4444,#f97316)',
      shadow: 'rgba(239,68,68,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "ARGUS_RISK_SCAN: Call get_tasks('all') then score all overdue and high-priority tasks by risk level (CRITICAL/HIGH/MEDIUM). Send a send_notification with the top 3 critical items listed clearly. Be concise." } }));
        setShowPetals(false);
      },
    },
    {
      id: 'ghost',
      label: 'Ghost Scan',
      icon: <Ghost size={16} />,
      color: 'linear-gradient(135deg,#06b6d4,#0891b2)',
      shadow: 'rgba(6,182,212,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "SPECTRE_GHOST_SCAN: Scan my Gmail inbox for hidden deadlines and commitments (phrases like 'by Friday', 'due date', 'ASAP', 'please submit', 'can you send'). Create a ZenTrack task for each untracked commitment you find. Report how many ghost tasks were created." } }));
        setShowPetals(false);
      },
    },
    {
      id: 'inbox',
      label: 'Inbox Zero',
      icon: <Mail size={16} />,
      color: 'linear-gradient(135deg,#eab308,#ca8a04)',
      shadow: 'rgba(234,179,8,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "HERMES_INBOX_ZERO: Read my 10 most recent unread emails. For each one: (1) summarize in one line, (2) flag if it needs a task created. Create tasks for any actionable emails. Then list the summaries. Keep total response under 300 words." } }));
        setShowPetals(false);
      },
    },
    {
      id: 'schedule',
      label: 'Auto-Schedule',
      icon: <Calendar size={16} />,
      color: 'linear-gradient(135deg,#10b981,#059669)',
      shadow: 'rgba(16,185,129,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "CHRONOS_SCHEDULE_OPTIMIZER: Call get_tasks('today') to get today's pending tasks and get_free_calendar_slots() to find available time blocks. Block calendar time for the top 3 priority tasks in the best available slots. Report what was scheduled." } }));
        setShowPetals(false);
      },
    },
    {
      id: 'focus',
      label: 'Deep Focus',
      icon: <Target size={16} />,
      color: 'linear-gradient(135deg,#f43f5e,#e11d48)',
      shadow: 'rgba(244,63,94,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('zen-tool-direct', { detail: { tool: 'focus_lock', args: { durationHours: 1 } } }));
        setShowPetals(false);
      },
    },
    {
      id: 'briefing',
      label: 'Daily Briefing',
      icon: <Sun size={16} />,
      color: 'linear-gradient(135deg,#f59e0b,#d97706)',
      shadow: 'rgba(245,158,11,0.5)',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "ORACLE_DAILY_BRIEF: Call get_tasks('dashboard') for today's agenda. Output a clean morning brief: 📅 TODAY (top 3 tasks by priority) | ⚠️ OVERDUE (count) | 💡 ONE THING to start with. Max 150 words. Be direct and energizing." } }));
        setShowPetals(false);
      },
    },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      height: '80px',
      background: 'transparent',
      borderTop: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      zIndex: 1000,
    }}>
      
      {/* ── LEFT: Logo & Search ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '24px' }}>
        {/* ZenTrack Logo Removed */}
      </div>



      {/* ── CENTER: Navigation Dock ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ transform: 'translateY(-4px)' }}>
          <FloatingDock hidden={false} inHeader={true} />
        </div>
      </div>

      {/* ── RIGHT: Agent Controls ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px' }}>

        {/* Voice Toggle (Floating Mic) - Hidden per user request */}
        {/* {!isHomePage && <VoiceQuickCaptureWidget inline={true} />} */}

        {/* Bot / S.A.R.A Toggle */}
        <div style={{ position: 'relative' }}>
          <AnimatePresence>
            {showPetals && petals.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: -(72 + i * 62) }}
                exit={{ opacity: 0, scale: 0.5, y: 20, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 25, delay: i * 0.04 }}
                style={{ 
                  position: 'absolute', bottom: '10px', right: '24px', 
                  display: 'flex', alignItems: 'center', gap: '0.5rem', 
                  justifyContent: 'flex-end', transformOrigin: 'bottom right' 
                }}
              >
                <motion.span
                  style={{ 
                    background: 'rgba(15,15,20,0.85)', backdropFilter: 'blur(12px)', 
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', 
                    padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 600, 
                    color: '#f4f4f5', whiteSpace: 'nowrap', boxShadow: '0 8px 16px rgba(0,0,0,0.5)' 
                  }}
                >
                  {p.label}
                </motion.span>
                <motion.button
                  onClick={p.action}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  style={{ 
                    width: 48, height: 48, borderRadius: '50%', border: 'none', 
                    background: p.color, color: '#fff', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', cursor: 'pointer', flexShrink: 0, 
                    boxShadow: `0 8px 24px ${p.shadow}, inset 0 2px 4px rgba(255,255,255,0.2)` 
                  }}
                >
                  {p.icon}
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.button
            onClick={() => onOpenSara()}
            onContextMenu={(e) => { e.preventDefault(); setShowPetals(!showPetals); }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            style={{
              position: 'relative',
              zIndex: 1,
              background: 'linear-gradient(135deg,#8b5cf6,#a599ff)',
              border: 'none',
              borderRadius: '50%',
              width: '56px',
              height: '56px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45)',
              cursor: 'pointer',
            }}
          >
            <Bot size={26} />
          </motion.button>
        </div>

      </div>
    </div>
  );
};
