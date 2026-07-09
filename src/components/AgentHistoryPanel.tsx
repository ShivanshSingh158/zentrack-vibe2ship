/**
 * @file AgentHistoryPanel.tsx
 * @module src/components/AgentHistoryPanel
 *
 * MISSING-008: Agent Action History timeline.
 *
 * Shows the last 30 write actions Sara has taken on the user's behalf.
 * Loaded from Firestore agent_actions/{userId}/logs on mount.
 * Triggered by a CustomEvent 'show-agent-history' (dispatched by SaraInterface or elsewhere).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAgentActions } from '../services/agentActionLog';
import type { AgentActionRecord } from '../services/agentActionLog';

// Tool → icon mapping for visual timeline
const TOOL_ICONS: Record<string, string> = {
  send_gmail: '📧',
  reply_gmail: '↩️',
  draft_email: '📝',
  create_task: '✅',
  update_task: '✏️',
  delete_task: '🗑️',
  delete_internal_app_data: '🗑️',
  schedule_task_in_calendar: '📅',
  block_calendar: '📅',
  delete_calendar_event: '🗓️',
  delete_calendar_events: '🗓️',
  auto_reschedule: '🔄',
  create_google_meet: '🎥',
  create_google_doc: '📄',
  write_google_doc: '✍️',
  focus_lock: '🔒',
  rebuild_day: '🗓️',
  panic_mode: '🚨',
  create_habit: '💪',
  create_goal: '🎯',
  create_note: '📓',
  send_notification: '🔔',
  notify_accountability_partner: '👥',
};

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatToolName = (toolName: string): string =>
  toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const extractDescription = (record: AgentActionRecord): string => {
  const { toolName, args, result } = record;
  // Try to build a natural language summary from known arg shapes
  if (toolName === 'send_gmail' || toolName === 'reply_gmail' || toolName === 'draft_email') {
    return `To: ${args.to || args.recipientEmail || 'unknown'} — "${(args.subject || '').slice(0, 50)}"`;
  }
  if (toolName === 'create_task' || toolName === 'update_task' || toolName === 'delete_task') {
    return `"${(args.title || args.text || args.taskTitle || '').slice(0, 70)}"`;
  }
  if (toolName === 'schedule_task_in_calendar' || toolName === 'block_calendar') {
    return `"${(args.title || args.taskTitle || args.eventTitle || '').slice(0, 50)}" at ${args.startTime || ''}`;
  }
  if (toolName === 'create_google_meet') {
    return `"${(args.title || args.meetingTitle || '').slice(0, 50)}"`;
  }
  if (toolName === 'focus_lock') {
    return `${args.durationHours || 1.5}h focus on "${(args.taskName || 'Deep Focus').slice(0, 40)}"`;
  }
  // Fallback: use the result message
  return (result?.message || '').slice(0, 100);
};

export function AgentHistoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<AgentActionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAgentActions(30);
      setRecords(data);
    } catch {
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const openHandler = () => {
      setIsOpen(true);
      loadHistory();
    };
    window.addEventListener('show-agent-history', openHandler);
    return () => window.removeEventListener('show-agent-history', openHandler);
  }, [loadHistory]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        zIndex: 1000,
        background: 'rgba(10, 10, 20, 0.97)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(139, 92, 246, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Inter", "Segoe UI", sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>
            🤖 Agent History
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Actions Sara has taken on your behalf
          </p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
            padding: '6px 10px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {isLoading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>
            Loading history…
          </div>
        ) : records.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            No actions logged yet. Sara will record all write actions here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {records.map((record, idx) => {
              const icon = TOOL_ICONS[record.toolName] || '🤖';
              const description = extractDescription(record);
              const timeStr = formatRelativeTime(record.timestamp);
              const isSuccess = record.result?.success !== false;

              return (
                <div
                  key={record.id || idx}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSuccess ? 'rgba(139, 92, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'}`,
                    transition: 'background 0.15s',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                >
                  {/* Icon */}
                  <div style={{
                    fontSize: '20px',
                    lineHeight: 1,
                    minWidth: '24px',
                    paddingTop: '2px',
                  }}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: isSuccess ? '#c4b5fd' : '#fca5a5',
                      marginBottom: '2px',
                    }}>
                      {formatToolName(record.toolName)}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {description}
                    </div>
                  </div>

                  {/* Time */}
                  <div style={{
                    fontSize: '11px',
                    color: '#64748b',
                    whiteSpace: 'nowrap',
                    paddingTop: '2px',
                    flexShrink: 0,
                  }}>
                    {timeStr}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
        display: 'flex',
        gap: '8px',
      }}>
        <button
          onClick={loadHistory}
          style={{
            flex: 1,
            padding: '8px',
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '8px',
            color: '#c4b5fd',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          🔄 Refresh
        </button>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            flex: 1,
            padding: '8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
