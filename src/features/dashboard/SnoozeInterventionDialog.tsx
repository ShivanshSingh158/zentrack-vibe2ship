/**
 * SnoozeInterventionDialog — PROACTIVE-GAP-5 UI
 *
 * Listens for `zen-snooze-intervention` events dispatched by useProactiveAgent
 * when a task has snoozeCount >= 3. Renders a premium glass-morphism modal with
 * 3 concrete resolution paths:
 *   A) Break into 3 subtasks (agent command)
 *   B) Draft extension email to supervisor (agent command)
 *   C) Delete the task (direct Firestore delete)
 *
 * This is the difference between a reminder app and a productivity AI coach.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, GitBranch, Mail, Trash2, X, RotateCcw } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { toast } from 'sonner';

interface SnoozeOption {
  id: string;
  label: string;
  action: string;
  icon: React.ReactNode;
  color: string;
  agentPrompt?: string;
}

interface SnoozeInterventionState {
  taskId: string;
  taskTitle: string;
  snoozeCount: number;
  options: { id: string; label: string; action: string }[];
}

interface Props {
  onAgentCommand: (prompt: string) => void;
}

export function SnoozeInterventionDialog({ onAgentCommand }: Props) {
  const [intervention, setIntervention] = useState<SnoozeInterventionState | null>(null);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.taskId && detail?.taskTitle) {
        setIntervention(detail as SnoozeInterventionState);
        setIsLoading(null);
      }
    };
    window.addEventListener('zen-snooze-intervention', handler);
    // Also listen for the manual "show" trigger from toast action
    window.addEventListener('show-snooze-intervention', handler);
    return () => {
      window.removeEventListener('zen-snooze-intervention', handler);
      window.removeEventListener('show-snooze-intervention', handler);
    };
  }, []);

  const dismiss = useCallback(() => {
    setIntervention(null);
    setIsLoading(null);
  }, []);

  const handleBreakDown = useCallback(async () => {
    if (!intervention) return;
    setIsLoading('breakdown');
    const prompt = `SNOOZE_INTERVENTION: The user has snoozed "${intervention.taskTitle}" ${intervention.snoozeCount} times. Break this task into exactly 3 smaller, actionable subtasks. For each subtask: call create_task with a specific title, priority="medium", and date=today. Then call delete_task for taskId="${intervention.taskId}" to remove the original blocked task. Finally call send_notification with title="🔨 Task Broken Down" and body="'${intervention.taskTitle}' → 3 manageable subtasks created." Execute now without asking permission.`;
    onAgentCommand(prompt);
    toast.success(`Breaking "${intervention.taskTitle}" into subtasks...`, { duration: 4000 });
    dismiss();
  }, [intervention, onAgentCommand, dismiss]);

  const handleExtensionEmail = useCallback(async () => {
    if (!intervention) return;
    setIsLoading('extension');
    const prompt = `SNOOZE_INTERVENTION: The user has snoozed "${intervention.taskTitle}" ${intervention.snoozeCount} times. Draft a professional, empathetic extension request email. Use deadline_negotiator with taskTitle="${intervention.taskTitle}" originalDeadline=today recipientEmail="" daysNeeded=3 progressPercent=30 reason="workload prioritization". Then call draft_email so the user can review before sending. Do not send without user review.`;
    onAgentCommand(prompt);
    toast.info(`Drafting extension email for "${intervention.taskTitle}"...`, { duration: 4000 });
    dismiss();
  }, [intervention, onAgentCommand, dismiss]);

  const handleDelete = useCallback(async () => {
    if (!intervention) return;
    setIsLoading('delete');
    try {
      await deleteDoc(doc(db, 'todos', intervention.taskId));
      toast.success(`"${intervention.taskTitle}" removed from your list.`);
    } catch (err) {
      toast.error('Failed to delete task');
    }
    dismiss();
  }, [intervention, dismiss]);

  if (!intervention) return null;

  const options: SnoozeOption[] = [
    {
      id: 'breakdown',
      label: 'Break into 3 subtasks',
      action: 'break_into_subtasks',
      icon: <GitBranch size={20} />,
      color: '#a855f7',
      agentPrompt: 'breakdown',
    },
    {
      id: 'extension',
      label: 'Email supervisor for extension',
      action: 'draft_extension_email',
      icon: <Mail size={20} />,
      color: '#3b82f6',
    },
    {
      id: 'delete',
      label: 'No longer relevant — delete it',
      action: 'delete_task',
      icon: <Trash2 size={20} />,
      color: '#ef4444',
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        key="snooze-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          zIndex: 99990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <motion.div
          key="snooze-dialog"
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(145deg, rgba(15, 8, 30, 0.97), rgba(25, 12, 50, 0.97))',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 0 60px rgba(168, 85, 247, 0.2), 0 25px 50px rgba(0, 0, 0, 0.6)',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={dismiss}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '12px',
              padding: '0.75rem',
              flexShrink: 0,
            }}>
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <RotateCcw size={24} style={{ color: '#eab308' }} />
              </motion.div>
            </div>
            <div>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#eab308',
                textTransform: 'uppercase',
                marginBottom: '0.3rem',
              }}>
                Procrastination Loop Detected
              </div>
              <h2 style={{
                margin: 0,
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.3,
              }}>
                {intervention.taskTitle}
              </h2>
            </div>
          </div>

          {/* Snooze count badge */}
          <div style={{
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.2)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <AlertTriangle size={16} style={{ color: '#eab308', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
              You've snoozed this task{' '}
              <strong style={{ color: '#eab308' }}>{intervention.snoozeCount} times</strong>.
              Your AI detected an avoidance pattern. Choose a resolution:
            </span>
          </div>

          {/* Resolution options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {options.map((option, i) => (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                onClick={() => {
                  if (option.id === 'breakdown') handleBreakDown();
                  else if (option.id === 'extension') handleExtensionEmail();
                  else if (option.id === 'delete') handleDelete();
                }}
                disabled={isLoading !== null}
                style={{
                  background: isLoading === option.id
                    ? `rgba(${option.color === '#a855f7' ? '168,85,247' : option.color === '#3b82f6' ? '59,130,246' : '239,68,68'}, 0.25)`
                    : `rgba(${option.color === '#a855f7' ? '168,85,247' : option.color === '#3b82f6' ? '59,130,246' : '239,68,68'}, 0.08)`,
                  border: `1px solid ${option.color}40`,
                  borderRadius: '12px',
                  padding: '0.875rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.875rem',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: '#fff',
                  textAlign: 'left',
                  width: '100%',
                  opacity: isLoading !== null && isLoading !== option.id ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    (e.currentTarget as HTMLElement).style.background = `rgba(${option.color === '#a855f7' ? '168,85,247' : option.color === '#3b82f6' ? '59,130,246' : '239,68,68'}, 0.18)`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${option.color}80`;
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    (e.currentTarget as HTMLElement).style.background = `rgba(${option.color === '#a855f7' ? '168,85,247' : option.color === '#3b82f6' ? '59,130,246' : '239,68,68'}, 0.08)`;
                    (e.currentTarget as HTMLElement).style.borderColor = `${option.color}40`;
                    (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                  }
                }}
              >
                <div style={{
                  color: option.color,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {isLoading === option.id ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <RotateCcw size={20} />
                    </motion.div>
                  ) : option.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.15rem' }}>
                    {isLoading === option.id ? 'Working...' : option.label}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                    {option.id === 'breakdown' && 'Agent will create 3 specific subtasks and archive this one'}
                    {option.id === 'extension' && 'Agent will draft an email — you review before sending'}
                    {option.id === 'delete' && 'Permanently removes this task from your list'}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'center',
          }}>
            <button
              onClick={dismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.35)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
              }}
            >
              Remind me later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
