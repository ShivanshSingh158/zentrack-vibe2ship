import {
  collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * PROACTIVE-GAP-1 FIX: Cross-Session Persistent Agent Memory
 *
 * Firestore collection: agent_memory/{userId}/interactions
 * Stores: approval rejections, user preferences, ghost tasks, emails sent, snooze interventions.
 * Feed into ORACLE/AEGIS via loadAgentMemoryContext() so the agent remembers across sessions.
 */

export interface AgentMemoryEntry {
  date: string;
  type: 'approval_rejected' | 'approval_granted' | 'preference_expressed'
      | 'ghost_task_created' | 'email_sent' | 'agent_action' | 'snooze_intervention';
  tool?: string;
  key?: string;
  value?: string;
  taskTitle?: string;
  sourceEmailId?: string;
  recipient?: string;
  subject?: string;
  summary?: string;
}

const getToday = () => new Date().toISOString().split('T')[0];

/** Non-blocking — memory failure must NEVER crash agent execution */
export const recordMemory = async (entry: AgentMemoryEntry): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'agent_memory', user.uid, 'interactions'), {
      ...entry,
      date: entry.date || getToday(),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[AgentMemory] Write failed (non-blocking):', err);
  }
};

export const recordApprovalRejection = (tool: string) =>
  recordMemory({ type: 'approval_rejected', tool, summary: 'User rejected ' + tool, date: getToday() });

export const recordApprovalGrant = (tool: string) =>
  recordMemory({ type: 'approval_granted', tool, summary: 'User approved ' + tool, date: getToday() });


export const recordGhostTaskCreated = (taskTitle: string, sourceEmailId?: string) =>
  recordMemory({ type: 'ghost_task_created', taskTitle, sourceEmailId, summary: 'Ghost task: ' + taskTitle, date: getToday() });

export const recordEmailSent = (recipient: string, subject: string) =>
  recordMemory({ type: 'email_sent', recipient, subject, summary: 'Email sent to ' + recipient + ': ' + subject, date: getToday() });

export const recordAgentAction = (summary: string, tool?: string) =>
  recordMemory({ type: 'agent_action', tool, summary, date: getToday() });

export const recordSnoozeIntervention = (taskTitle: string, snoozeCount: number) =>
  recordMemory({ type: 'snooze_intervention', taskTitle, summary: 'Snooze intervention: ' + taskTitle + ' (' + snoozeCount + 'x)', date: getToday() });

/** Load last 14 days of memory — formatted string injected into ORACLE/AEGIS context */
export const loadAgentMemoryContext = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) return '';
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const q = query(
      collection(db, 'agent_memory', user.uid, 'interactions'),
      where('date', '>=', cutoffStr),
      orderBy('date', 'desc'),
      limit(50) // cap at 50 to stay within token budget
    );
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const entries = snap.docs.map(d => d.data() as AgentMemoryEntry);

    const rejected   = entries.filter(e => e.type === 'approval_rejected');
    const prefs      = entries.filter(e => e.type === 'preference_expressed');
    const ghosts     = entries.filter(e => e.type === 'ghost_task_created').slice(0, 5);
    const emailsSent = entries.filter(e => e.type === 'email_sent').slice(0, 5);
    const snoozed    = entries.filter(e => e.type === 'snooze_intervention').slice(0, 3);
    const actions    = entries.filter(e => e.type === 'agent_action').slice(0, 5);

    const lines: string[] = ['[AGENT LONG-TERM MEMORY — Last 14 Days]'];

    if (rejected.length > 0) {
      const counts: Record<string, number> = {};
      rejected.forEach(e => { if (e.tool) counts[e.tool] = (counts[e.tool] || 0) + 1; });
      const summary = Object.entries(counts).map(([t, n]) => (n > 1 ? t + '(' + n + 'x)' : t)).join(', ');
      lines.push('REJECTED TOOLS (do not auto-trigger without asking first): ' + summary);
    }
    if (prefs.length > 0) {
      lines.push('USER PREFERENCES: ' + prefs.map(p => p.key + '="' + p.value + '"').join('; '));
    }
    if (ghosts.length > 0) {
      lines.push('AUTO-CREATED TASKS (already in ZenTrack, do not duplicate): ' + ghosts.map(g => '"' + g.taskTitle + '"').join(', '));
    }
    if (emailsSent.length > 0) {
      lines.push('EMAILS ALREADY SENT BY AGENT: ' + emailsSent.map(e => 'to ' + e.recipient + ' re: "' + e.subject + '"').join('; '));
    }
    if (snoozed.length > 0) {
      lines.push('SNOOZE INTERVENTIONS ALREADY DONE: ' + snoozed.map(s => '"' + s.taskTitle + '"').join(', ') + ' — do not re-trigger');
    }
    if (actions.length > 0) {
      lines.push('RECENT AGENT ACTIONS: ' + actions.map(a => a.summary).join('; '));
    }

    return lines.join('\n') + '\n';
  } catch (err) {
    console.warn('[AgentMemory] Load failed (non-blocking):', err);
    return '';
  }
};
