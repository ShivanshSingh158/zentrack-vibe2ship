/**
 * ConflictCard — PROACTIVE-GAP-6 UI
 *
 * Listens for `conflicts-detected` window events dispatched by the ConflictDetector service.
 * Renders proactive suggestion cards for each detected cross-module conflict:
 *   - Task overload (tasks vs calendar)
 *   - Physical double load (habits vs calendar)
 *   - Gym timing conflict (gym vs calendar)
 *   - Assignment overload (assignments vs tasks)
 *   - No free calendar slots for high-priority tasks
 *   - Low attendance risk
 *
 * Zero LLM cost. Pure data-driven, purely reactive to window events.
 * Auto-dismisses per conflict after 1h (sessionStorage).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap, X, ChevronDown, ChevronUp, Wrench, Info } from 'lucide-react';
import type { DetectedConflict } from '../../services/conflictDetector';

interface Props {
  onAgentCommand: (prompt: string) => void;
}

const DISMISS_KEY = 'zen_conflict_dismissed';

function getDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function addDismissed(id: string) {
  try {
    const cur = getDismissed();
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...cur.slice(-30), id]));
  } catch {}
}

const SEVERITY_CONFIG = {
  critical: {
    border: 'rgba(239, 68, 68, 0.5)',
    bg: 'rgba(239, 68, 68, 0.07)',
    iconBg: 'rgba(239, 68, 68, 0.15)',
    iconColor: '#ef4444',
    label: 'CRITICAL',
    labelColor: '#ef4444',
    badgeStyle: { background: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
  },
  warning: {
    border: 'rgba(234, 179, 8, 0.4)',
    bg: 'rgba(234, 179, 8, 0.05)',
    iconBg: 'rgba(234, 179, 8, 0.12)',
    iconColor: '#eab308',
    label: 'WARNING',
    labelColor: '#eab308',
    badgeStyle: { background: 'rgba(234,179,8,0.15)', color: '#fef08a' },
  },
  info: {
    border: 'rgba(59, 130, 246, 0.35)',
    bg: 'rgba(59, 130, 246, 0.04)',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    iconColor: '#3b82f6',
    label: 'INFO',
    labelColor: '#60a5fa',
    badgeStyle: { background: 'rgba(59,130,246,0.15)', color: '#93c5fd' },
  },
};

export function ConflictCard({ onAgentCommand }: Props) {
  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>(getDismissed);

  useEffect(() => {
    const handler = (e: Event) => {
      const incoming: DetectedConflict[] = (e as CustomEvent).detail?.conflicts || [];
      if (incoming.length === 0) return;
      setConflicts(prev => {
        // Merge: keep existing + add new unique ones
        const existingIds = new Set(prev.map(c => c.id));
        const fresh = incoming.filter(c => !existingIds.has(c.id));
        return [...prev, ...fresh];
      });
    };
    window.addEventListener('conflicts-detected', handler);
    return () => window.removeEventListener('conflicts-detected', handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    addDismissed(id);
    setDismissedIds(prev => [...prev, id]);
  }, []);

  const handleAutoFix = useCallback((conflict: DetectedConflict) => {
    if (!conflict.autoFixInstruction) return;
    const prompt = `AUTO_FIX_CONFLICT: ${conflict.autoFixInstruction}. Context: ${conflict.description} ${conflict.suggestion}`;
    onAgentCommand(prompt);
    dismiss(conflict.id);
  }, [onAgentCommand, dismiss]);

  const visible = conflicts.filter(c => !dismissedIds.includes(c.id));
  if (visible.length === 0) return null;

  const critical = visible.filter(c => c.severity === 'critical');
  const warnings = visible.filter(c => c.severity === 'warning');
  const infos    = visible.filter(c => c.severity === 'info');
  const sorted   = [...critical, ...warnings, ...infos];
  const shown    = expanded ? sorted : sorted.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      style={{
        margin: '0 0 0.75rem 0',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        background: 'rgba(10, 5, 20, 0.6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '0.7rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        background: 'rgba(168, 85, 247, 0.08)',
        borderBottom: '1px solid rgba(168,85,247,0.12)',
        cursor: sorted.length > 2 ? 'pointer' : 'default',
      }} onClick={() => sorted.length > 2 && setExpanded(e => !e)}>
        <Zap size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: '#c084fc', textTransform: 'uppercase', flex: 1 }}>
          Proactive Intelligence — {visible.length} Conflict{visible.length !== 1 ? 's' : ''} Detected
        </span>
        {critical.length > 0 && (
          <span style={{ fontSize: '0.62rem', fontWeight: 700, background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '2px 6px', borderRadius: '20px' }}>
            {critical.length} CRITICAL
          </span>
        )}
        {sorted.length > 2 && (
          <span style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </div>

      {/* Conflict rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <AnimatePresence initial={false}>
          {shown.map((conflict, i) => {
            const cfg = SEVERITY_CONFIG[conflict.severity];
            return (
              <motion.div
                key={conflict.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  padding: '0.75rem 1rem',
                  background: cfg.bg,
                  borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                }}
              >
                {/* Severity icon */}
                <div style={{
                  background: cfg.iconBg,
                  borderRadius: '8px',
                  padding: '0.4rem',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                }}>
                  {conflict.severity === 'critical' ? <AlertTriangle size={14} style={{ color: cfg.iconColor }} /> : <Info size={14} style={{ color: cfg.iconColor }} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                      {conflict.title}
                    </span>
                    <span style={{ ...cfg.badgeStyle, fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                      {cfg.label}
                    </span>
                    {/* Module tags */}
                    {conflict.modules.map(m => (
                      <span key={m} style={{ fontSize: '0.58rem', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', padding: '1px 5px', borderRadius: '8px', textTransform: 'capitalize' }}>
                        {m}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.4rem', lineHeight: 1.45 }}>
                    {conflict.suggestion}
                  </div>

                  {/* Action row */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {conflict.autoFixable && conflict.autoFixInstruction && (
                      <button
                        onClick={() => handleAutoFix(conflict)}
                        style={{
                          background: `${cfg.iconColor}20`,
                          border: `1px solid ${cfg.iconColor}40`,
                          borderRadius: '6px',
                          padding: '3px 8px',
                          color: cfg.iconColor,
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${cfg.iconColor}35`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${cfg.iconColor}20`; }}
                      >
                        <Wrench size={10} />
                        Auto-fix
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(conflict.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.25)',
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                        padding: '3px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        borderRadius: '4px',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)'; }}
                    >
                      <X size={10} />
                      Dismiss
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Show more / collapse */}
      {sorted.length > 2 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%',
            background: 'rgba(168,85,247,0.05)',
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            color: 'rgba(168,85,247,0.7)',
            fontSize: '0.7rem',
            cursor: 'pointer',
            padding: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.05)'; }}
        >
          {expanded
            ? <><ChevronUp size={12} /> Collapse</>
            : <><ChevronDown size={12} /> {sorted.length - 2} more conflict{sorted.length - 2 !== 1 ? 's' : ''}</>
          }
        </button>
      )}
    </motion.div>
  );
}
