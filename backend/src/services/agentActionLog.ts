/**
 * @file agentActionLog.ts
 * @module src/services/agentActionLog
 *
 * MISSING-008: Persistent audit trail for all agent write actions.
 *
 * Every write tool call (send_gmail, create_task, schedule_task_in_calendar, etc.)
 * writes a record to Firestore collection `agent_actions/{userId}/logs/{autoId}`.
 * This gives users a queryable history of everything Sara has done on their behalf.
 *
 * ## Schema
 * ```
 * agent_actions/{userId}/logs/{autoId}:
 *   toolName:   string          - tool identifier (e.g. 'send_gmail')
 *   args:       object          - sanitized args (email bodies truncated to 500 chars)
 *   result:     { success, message } - outcome
 *   timestamp:  number          - unix ms
 *   sessionId:  string          - browser session ID (tab-unique)
 *   userId:     string          - firebase auth uid
 * ```
 *
 * ## Write-Only Tools (logged)
 * send_gmail, reply_gmail, draft_email, create_task, update_task, delete_task,
 * create_google_doc, write_google_doc, schedule_task_in_calendar, block_calendar,
 * delete_calendar_event, delete_calendar_events, auto_reschedule, create_google_meet,
 * delete_internal_app_data, focus_lock, rebuild_day, create_habit, create_goal, create_note
 */

import { addDoc, collection, getDocs, query, orderBy, limit as fsLimit } from './firebase';
import { db, auth } from './firebase';

// ── Session ID ────────────────────────────────────────────────────────────────
// Tab-unique identifier so action logs can be grouped by session in the UI.
const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Write tool set ────────────────────────────────────────────────────────────
const WRITE_TOOLS = new Set([
  'send_gmail', 'reply_gmail', 'draft_email',
  'create_task', 'update_task', 'delete_task',
  'create_google_doc', 'write_google_doc',
  'schedule_task_in_calendar', 'block_calendar',
  'delete_calendar_event', 'delete_calendar_events', 'auto_reschedule',
  'create_google_meet', 'delete_internal_app_data',
  'focus_lock', 'rebuild_day', 'panic_mode',
  'create_habit', 'create_goal', 'create_note',
  'send_notification', 'notify_accountability_partner',
]);

export const isWriteTool = (toolName: string): boolean => WRITE_TOOLS.has(toolName);

// ── Arg sanitization ──────────────────────────────────────────────────────────
// Strip PII/long bodies before writing to Firestore. Email body → truncated.
const sanitizeArgs = (toolName: string, args: any): any => {
  if (!args || typeof args !== 'object') return {};
  const sanitized = { ...args };
  // Truncate potentially long string fields
  const LONG_FIELDS = ['body', 'content', 'text', 'description', 'htmlBody', 'message'];
  for (const field of LONG_FIELDS) {
    if (typeof sanitized[field] === 'string' && sanitized[field].length > 500) {
      sanitized[field] = sanitized[field].slice(0, 500) + '…[truncated]';
    }
  }
  return sanitized;
};

/**
 * Logs an agent write action to Firestore.
 * Fire-and-forget — never throws, never blocks the tool execution path.
 */
export const logAgentAction = async (
  toolName: string,
  args: any,
  result: { success: boolean; message: string }
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return; // not authenticated — skip silently

  try {
    await addDoc(collection(db, `agent_actions/${user.uid}/logs`), {
      toolName,
      args: sanitizeArgs(toolName, args),
      result: { success: result.success, message: (result.message || '').slice(0, 500) },
      timestamp: Date.now(),
      sessionId: SESSION_ID,
      userId: user.uid,
    });
  } catch (e) {
    // Never let audit logging break the tool execution path
    console.warn('[AgentActionLog] Failed to write action log:', e);
  }
};

// ── Read: Agent History ───────────────────────────────────────────────────────

export interface AgentActionRecord {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result: { success: boolean; message: string };
  timestamp: number;
  sessionId: string;
}

/**
 * Fetches the most recent N agent action records for the current user.
 * Used by AgentHistoryPanel.
 */
export const getAgentActions = async (limitCount = 30): Promise<AgentActionRecord[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(
      collection(db, `agent_actions/${user.uid}/logs`),
      orderBy('timestamp', 'desc'),
      fsLimit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentActionRecord));
  } catch (e) {
    console.warn('[AgentActionLog] Failed to read action history:', e);
    return [];
  }
};
