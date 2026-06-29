/**
 * PanicModeWarRoom — ART 6 UPGRADE
 *
 * Was: Advisory-only visual alert (WarRoomMode.tsx).
 * Now: Fully autonomous action center that:
 *   1. Triggers on zen-panic-mode event (from toolExecutor.ts panic_mode tool)
 *   2. Shows overdue tasks and recovery window
 *   3. Has 4 concrete "EXECUTE" buttons for each autonomous action
 *   4. Has a "1-CLICK EXECUTE ALL" master button
 *   5. Can also be triggered manually from urgency state (legacy)
 *
 * All actions route through onAgentCommand → orchestrateAgent.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, XCircle, AlertTriangle, Calendar, Mail, Bell, RefreshCw,
  Zap, Clock, CheckCircle, Loader
} from 'lucide-react';

interface PanicModeWarRoomProps {
  /** Legacy: pass the most critical task for the old urgency-triggered mode */
  task?: any;
  onExit: () => void;
  onAgentCommand: (prompt: string) => void;
}

interface PanicDetail {
  triggered: boolean;
  triggeredAt: number;
  overdueTasks?: { id: string; title: string }[];
  highPriToday?: string[];
  recoveryWindowStart?: string;
}

type ActionStatus = 'idle' | 'running' | 'done' | 'error';

export const PanicModeWarRoom = ({ task, onExit, onAgentCommand }: PanicModeWarRoomProps) => {
  const [panicDetail, setPanicDetail] = useState<PanicDetail | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});
  const [allExecuted, setAllExecuted] = useState(false);
  const [isExecutingAll, setIsExecutingAll] = useState(false);

  // Listen for the zen-panic-mode event from toolExecutor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as PanicDetail;
      if (detail?.triggered) {
        setPanicDetail(detail);
        setActionStatus({});
        setAllExecuted(false);
      }
    };
    window.addEventListener('zen-panic-mode', handler);
    return () => window.removeEventListener('zen-panic-mode', handler);
  }, []);

  // If triggered by legacy urgency state, treat it as an agent-less war room
  const isAgentTriggered = panicDetail !== null;

  const recoveryTime = panicDetail?.recoveryWindowStart
    ? new Date(panicDetail.recoveryWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date(Date.now() + 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const executeAction = useCallback(async (actionId: string, prompt: string) => {
    setActionStatus(prev => ({ ...prev, [actionId]: 'running' }));
    try {
      onAgentCommand(prompt);
      // Simulate completion (agent command is async fire-and-forget)
      setTimeout(() => {
        setActionStatus(prev => ({ ...prev, [actionId]: 'done' }));
      }, 2000);
    } catch {
      setActionStatus(prev => ({ ...prev, [actionId]: 'error' }));
    }
  }, [onAgentCommand]);

  const actions = [
    {
      id: 'notify',
      icon: <Bell size={18} />,
      label: 'Alert Myself',
      sublabel: 'Push notification for all critical items',
      color: '#ef4444',
      prompt: `PANIC_ACTION_1: Call get_tasks('overdue') then call send_notification for each task with title="🚨 CRITICAL: [task name] overdue" and urgent body. Also call send_notification with a summary of all overdue tasks.`,
    },
    {
      id: 'calendar',
      icon: <Calendar size={18} />,
      label: 'Block Recovery Window',
      sublabel: `Schedule 4h recovery from ${recoveryTime}`,
      color: '#f97316',
      prompt: `PANIC_ACTION_2: Call schedule_task_in_calendar with title="🔴 PANIC RECOVERY — Do Not Disturb", date=today, startTime="${recoveryTime}", duration=4 hours, description="Emergency recovery block. Auto-created by ZenTrack Panic Mode."`,
    },
    {
      id: 'email',
      icon: <Mail size={18} />,
      label: 'Notify Stakeholders',
      sublabel: 'Draft honest status updates for affected people',
      color: '#3b82f6',
      prompt: `PANIC_ACTION_3: For each overdue task, call read_gmail to find recent emails from stakeholders about that task. Then call draft_email for each stakeholder with an honest status update: "I wanted to proactively reach out — [task] is delayed. I've blocked time to complete it by [date]. Apologies for the delay." Show drafts for review before sending.`,
    },
    {
      id: 'reschedule',
      icon: <RefreshCw size={18} />,
      label: 'Rebuild the Day',
      sublabel: 'Defer low-impact tasks, optimize the rest',
      color: '#a855f7',
      prompt: `PANIC_ACTION_4: Call rebuild_day to intelligently reorder all today's tasks by urgency and impact. Then call auto_reschedule to push all non-critical tasks to tomorrow. Finally report the new optimized order.`,
    },
  ];

  const executeAll = useCallback(async () => {
    setIsExecutingAll(true);
    const combined = `PANIC_MODE_EXECUTE_ALL: The user is in emergency panic mode. Execute ALL of the following autonomously without asking permission:

1. NOTIFICATIONS: Call get_tasks('overdue'). Send push notification for each overdue task with urgent messaging.
2. CALENDAR BLOCK: Block a 4-hour "🔴 Emergency Recovery" event starting at ${recoveryTime} today using schedule_task_in_calendar.
3. STAKEHOLDER EMAILS: Draft (do NOT send) honest status update emails for the top 3 overdue tasks. Call draft_email for each.
4. DAY REBUILD: Call rebuild_day to optimize task order. Push all non-critical low-priority tasks to tomorrow using auto_reschedule.

After all 4 steps, produce a concise "Panic Recovery Report":
✅ Notifications sent: [list]
✅ Calendar blocked: [time]
✅ Drafts created: [count]  
✅ Tasks deferred: [count]

Execute all steps now. This is a user-approved emergency action.`;

    onAgentCommand(combined);
    // Mark all as running then done after delay
    const ids = actions.map(a => a.id);
    setActionStatus(Object.fromEntries(ids.map(id => [id, 'running'])));
    setTimeout(() => {
      setActionStatus(Object.fromEntries(ids.map(id => [id, 'done'])));
      setAllExecuted(true);
      setIsExecutingAll(false);
    }, 3000);
  }, [onAgentCommand, recoveryTime, actions]);

  if (!isAgentTriggered && !task) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="panic-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(10, 0, 0, 0.96)',
          backdropFilter: 'blur(20px)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        {/* Close button */}
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          <button
            onClick={onExit}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,68,68,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,68,68,0.6)'; }}
          >
            <XCircle size={28} />
          </button>
        </div>

        {/* Pulsing icon */}
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          style={{ marginBottom: '1.25rem' }}
        >
          <ShieldAlert size={64} style={{ color: '#ff4444', filter: 'drop-shadow(0 0 20px rgba(255,68,68,0.6))' }} />
        </motion.div>

        {/* Title */}
        <h1 style={{
          fontSize: '2.2rem',
          fontWeight: 900,
          margin: '0 0 0.4rem 0',
          textTransform: 'uppercase',
          letterSpacing: '5px',
          color: '#ff4444',
          textShadow: '0 0 30px rgba(255,68,68,0.4)',
        }}>
          WAR ROOM MODE
        </h1>
        <div style={{ fontSize: '0.9rem', color: 'rgba(255,170,170,0.7)', marginBottom: '2rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
          {isAgentTriggered ? 'Agent-Triggered Emergency Recovery' : 'Critical Deadline Detected'}
        </div>

        {/* Main panel */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          style={{
            background: 'rgba(20, 3, 3, 0.85)',
            border: '1px solid rgba(255, 0, 0, 0.3)',
            borderRadius: '20px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '660px',
            boxShadow: '0 0 60px rgba(255,0,0,0.15)',
          }}
        >
          {/* Task summary */}
          {(panicDetail?.overdueTasks && panicDetail.overdueTasks.length > 0) ? (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: '#ff6666', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                🚨 {panicDetail.overdueTasks.length} Overdue Task{panicDetail.overdueTasks.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {panicDetail.overdueTasks.slice(0, 4).map(t => (
                  <span key={t.id} style={{
                    background: 'rgba(255,68,68,0.12)',
                    border: '1px solid rgba(255,68,68,0.25)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    color: '#fca5a5',
                  }}>
                    {t.title}
                  </span>
                ))}
              </div>
            </div>
          ) : task ? (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>{task.title || task.text}</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', color: '#ffaaaa', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} /> {new Date(task.date).toLocaleDateString()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} /> Priority: {task.priority || 'high'}
                </span>
              </div>
            </div>
          ) : null}

          {/* 4 Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {actions.map(action => {
              const status = actionStatus[action.id] || 'idle';
              return (
                <motion.button
                  key={action.id}
                  whileHover={status === 'idle' ? { scale: 1.02 } : {}}
                  whileTap={status === 'idle' ? { scale: 0.98 } : {}}
                  onClick={() => status === 'idle' && executeAction(action.id, action.prompt)}
                  disabled={status !== 'idle' || isExecutingAll}
                  style={{
                    background: status === 'done'
                      ? 'rgba(16,185,129,0.12)'
                      : status === 'running'
                      ? `rgba(255,255,255,0.05)`
                      : `rgba(${action.color === '#ef4444' ? '239,68,68' : action.color === '#f97316' ? '249,115,22' : action.color === '#3b82f6' ? '59,130,246' : '168,85,247'}, 0.1)`,
                    border: `1px solid ${status === 'done' ? 'rgba(16,185,129,0.4)' : status === 'running' ? 'rgba(255,255,255,0.12)' : `${action.color}50`}`,
                    borderRadius: '12px',
                    padding: '0.875rem',
                    cursor: status === 'idle' && !isExecutingAll ? 'pointer' : 'default',
                    textAlign: 'left',
                    color: '#fff',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <span style={{
                      color: status === 'done' ? '#10b981' : action.color,
                      display: 'flex',
                      alignItems: 'center',
                    }}>
                      {status === 'running' ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader size={18} />
                        </motion.div>
                      ) : status === 'done' ? (
                        <CheckCircle size={18} />
                      ) : action.icon}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                      {status === 'done' ? '✓ Done' : status === 'running' ? 'Executing...' : action.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                    {action.sublabel}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* 1-Click Execute All */}
          {!allExecuted ? (
            <motion.button
              whileHover={!isExecutingAll ? { scale: 1.02 } : {}}
              whileTap={!isExecutingAll ? { scale: 0.98 } : {}}
              onClick={executeAll}
              disabled={isExecutingAll}
              style={{
                width: '100%',
                padding: '1rem',
                background: isExecutingAll
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, rgba(239,68,68,0.8), rgba(249,115,22,0.8))',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 800,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                cursor: isExecutingAll ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                boxShadow: isExecutingAll ? 'none' : '0 4px 24px rgba(239,68,68,0.35)',
                transition: 'all 0.3s ease',
              }}
            >
              {isExecutingAll ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Loader size={18} />
                  </motion.div>
                  Executing All Actions...
                </>
              ) : (
                <>
                  <Zap size={18} />
                  1-Click Execute All 4 Actions
                </>
              )}
            </motion.button>
          ) : (
            <div style={{
              width: '100%',
              padding: '1rem',
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '12px',
              color: '#10b981',
              textAlign: 'center',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}>
              <CheckCircle size={18} />
              All recovery actions executing — check Agent Terminal for progress
            </div>
          )}

          {/* Exit */}
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              onClick={onExit}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '0.4rem 0.8rem',
              }}
            >
              Dismiss War Room
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
