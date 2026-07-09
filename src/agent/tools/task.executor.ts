/**
 * @file task.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../../services/googleCalendar';
import { sendPushNotification } from '../../services/fcm';
import { getLocalDateString } from '../../utils/dateUtils';
import { logApi, logWebSocket } from '../../utils/networkLogger';
import { recordApprovalRejection, recordApprovalTimeout, recordApprovalGrant, recordEmailSent, recordGhostTaskCreated } from '../../services/agentMemoryPersistence';
import { userLearningStore } from '../../services/userLearningStore';
import {
  fetchUnreadEmails,
  fetchEmailThread,
  sendEmail,
  replyToEmail,
  archiveEmail,
  trashEmail,
  createGoogleDoc,
  writeToGoogleDoc,
  readGoogleDoc,
  searchGoogleDrive,
  trashDriveFile,
  listDriveFiles,
  openDriveFile,
  getFilePdfLink,
  createGoogleMeet,
  createDraftEmail,
  listCalendarEventsOnDate,
  updateCalendarEvent,
} from '../../services/googleWorkspace';
import { requireGoogleAuth, requestApproval } from './shared';
import type { ToolResult } from './shared';


export const executeTaskTools = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult | null> => {
  const user = auth.currentUser;
  if (!user) return { success: false, data: null, message: "Not authenticated. User is not logged in." };
  const today = getLocalDateString(new Date());

  switch (toolName) {
case 'get_tasks': {
      logApi('GET', '/api/v1/tasks', { filter: args.filter }, 'success');
      const filter = args.filter || 'all';
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      
      let tasks = appContext.tasks.filter((t: any) => {
        if (t.status === 'completed') return false;
        // Ignore tasks that are older than 30 days to avoid ancient data noise
        if (t.date && t.date < thirtyDaysAgoStr) return false;
        return true;
      });
      
      if (filter === 'overdue') tasks = tasks.filter((t: any) => t.date && t.date < today);
      else if (filter === 'today') tasks = tasks.filter((t: any) => t.date === today);
      else if (filter === 'high_priority') tasks = tasks.filter((t: any) => t.priority === 'high');
      // ✅ INEFFICIENCY-2 FIX: 'dashboard' filter returns all three segments in a single pass.
      // ORACLE previously made 3 separate get_tasks calls (overdue + today + high_priority).
      // Now one call with filter='dashboard' returns { overdue, today, high_priority } arrays.
      else if (filter === 'dashboard') {
        const overdue   = tasks.filter((t: any) => t.date && t.date < today);
        const dueToday  = tasks.filter((t: any) => t.date === today);
        const highPri   = tasks.filter((t: any) => t.priority === 'high' && t.date && t.date > today);
        return {
          success: true,
          data: { overdue, today: dueToday, high_priority: highPri, all: tasks },
          message: `Dashboard: ${overdue.length} overdue, ${dueToday.length} due today, ${highPri.length} upcoming high-priority`
        };
      }
      return {
        success: true,
        data: tasks.map(t => ({
          id: t.id, title: t.title || t.text, priority: t.priority,
          date: t.date, estimatedMinutes: t.estimatedMinutes
        })),
        message: `Found ${tasks.length} tasks`
      };
    }

case 'create_task': {
      logApi('POST', '/api/v1/tasks', args, 'pending');
      // ✅ Deduplication: prevent SPECTRE from creating duplicate tasks on repeated ghost scans
      const targetDate = args.date || today;
      const existingTasks = appContext.tasks || [];
      const duplicate = existingTasks.find((t: any) => {
        const tTitle = (t.title || t.text || '').toLowerCase().trim();
        const argsTitle = (args.title || '').toLowerCase().trim();
        if (tTitle !== argsTitle) return false;
        // Allow ±2 day window for date matching
        if (!t.date || !targetDate) return tTitle === argsTitle;
        const tDate = new Date(t.date).getTime();
        const aDate = new Date(targetDate).getTime();
        return Math.abs(tDate - aDate) <= 2 * 24 * 60 * 60 * 1000;
      });
      if (duplicate) {
        logApi('POST', '/api/v1/tasks', args, 'success');
        return { success: true, data: { id: duplicate.id }, message: `ℹ️ Task already tracked: "${args.title}" (deduplication check passed — skipped creating duplicate)` };
      }
      const ref = await addDoc(collection(db, 'todos'), {
        userId: user.uid,
        title: args.title,  // Matches TodoListModule field name
        text: args.title,   // Legacy field for backward compat with old data
        priority: args.priority || 'medium',
        date: targetDate,
        status: 'pending',
        estimatedMinutes: args.estimatedMinutes || null,
        createdAt: Date.now(),
        subtasks: [],
        order: Date.now(),
        // ✅ SEC-6: Tag agent-created documents so users can identify them in the UI
        source: args.agentRole ? `agent:${args.agentRole}` : 'agent',
      });
      logApi('POST', '/api/v1/tasks', args, 'success');
      logWebSocket('task.created', { id: ref.id, title: args.title });
      return { success: true, data: { id: ref.id }, message: `✅ Created task: "${args.title}"` };
    }

case 'update_task': {
      if (!args.taskId) return { success: false, data: null, message: 'taskId is required to update a task' };
      const updates: Record<string, any> = {};
      if (args.title) { updates.title = args.title; updates.text = args.title; } // keep both fields in sync
      if (args.priority) updates.priority = args.priority;
      if (args.date) updates.date = args.date;
      if (args.estimatedMinutes !== undefined) updates.estimatedMinutes = args.estimatedMinutes;
      if (args.status) updates.status = args.status;
      if (Object.keys(updates).length === 0) {
        return { success: false, data: null, message: 'No fields to update — provide at least one of: title, priority, date, estimatedMinutes, status' };
      }
      logApi('PATCH', `/api/v1/tasks/${args.taskId}`, updates, 'success');
      await updateDoc(doc(db, 'todos', args.taskId), updates);
      return { success: true, data: {}, message: `✅ Task updated: ${Object.keys(updates).join(', ')} changed` };
    }

case 'delete_task': {
      if (!args.taskId) return { success: false, data: null, message: 'taskId is required to delete a task' };
      const taskApproved = await requestApproval('delete_task', `Delete task permanently?`, signal);
      if (!taskApproved) return { success: false, data: null, message: '🚫 Cancelled by user — task was NOT deleted.' };
      logApi('DELETE', `/api/v1/tasks/${args.taskId}`, {}, 'success');
      logWebSocket('task.deleted', { id: args.taskId });
      await deleteDoc(doc(db, 'todos', args.taskId));
      return { success: true, data: {}, message: `✅ Task successfully deleted` };
    }

case 'complete_task': {
      // ✅ FEAT-3 FIX: complete_task now requires approval so agents can't silently
      // mark user tasks as done without consent. A user who intended to complete
      // a task manually should not lose credit to an autonomous agent action.
      const completeApproved = await requestApproval(
        'complete_task',
        `Mark task as completed? (This records it in your history)`,
        signal
      );
      if (!completeApproved) return { success: false, data: null, message: '🚫 Cancelled by user — task was NOT marked complete.' };
      logApi('POST', `/api/v1/tasks/${args.taskId}/complete`, {}, 'success');
      logWebSocket('task.updated', { id: args.taskId, status: 'completed' });
      await updateDoc(doc(db, 'todos', args.taskId), { status: 'completed', completedAt: Date.now() });
      // ⚡ Real-time learning hook: update peak hours + estimation accuracy from this completion
      const completedTask = (appContext.tasks || []).find((t: any) => t.id === args.taskId);
      if (completedTask) {
        userLearningStore.recordCompletion({ ...completedTask, completedAt: Date.now() });
      }
      return { success: true, data: {}, message: `✅ Task marked as complete` };
    }

case 'search_tasks': {
      if (!args.query) return { success: false, data: null, message: 'query is required for search_tasks' };
      const query_lower = (args.query as string).toLowerCase();
      let candidates = (appContext.tasks || []) as any[];
      // Apply status filter if provided
      if (args.filter === 'pending') candidates = candidates.filter((t: any) => t.status !== 'completed');
      else if (args.filter === 'completed') candidates = candidates.filter((t: any) => t.status === 'completed');
      else if (args.filter === 'overdue') {
        const tod = getLocalDateString(new Date());
        candidates = candidates.filter((t: any) => t.status !== 'completed' && t.date && t.date < tod);
      }
      const matches = candidates.filter((t: any) => {
        const title = ((t.title || t.text) || '').toLowerCase();
        return title.includes(query_lower);
      }).slice(0, 10).map((t: any) => ({
        id: t.id, title: t.title || t.text, date: t.date, priority: t.priority, status: t.status
      }));
      return { success: true, data: matches, message: `Found ${matches.length} task(s) matching "${args.query}"` };
    }

case 'snooze_task': {
      // Used by ARGUS agent to adaptively snooze at-risk tasks.
      // ✅ SNOOZE FIX: Read current snoozeCount from appContext.tasks directly.
      // Previously the tool depended on args.currentSnoozeCount which the agent
      // never passed correctly (agents don't track mutable state between calls).
      // This caused snooze count to always persist as 1 — the counter never incremented.
      if (!args.taskId) return { success: false, data: null, message: 'taskId is required for snooze_task' };
      const snoozeDate = args.snoozeUntilDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return getLocalDateString(d);
      })();
      // Read the ACTUAL current snooze count from the live task data
      const liveTask = (appContext.tasks || []).find((t: any) => t.id === args.taskId);
      const currentSnoozeCount = liveTask?.snoozeCount || 0;
      await updateDoc(doc(db, 'todos', args.taskId), {
        date: snoozeDate,
        snoozeCount: currentSnoozeCount + 1,  // always correct — reads live state
        lastSnoozedAt: Date.now()
      });
      logApi('POST', `/api/v1/tasks/${args.taskId}/snooze`, { snoozeDate, newSnoozeCount: currentSnoozeCount + 1 }, 'success');
      return { success: true, data: { taskId: args.taskId, newDate: snoozeDate, snoozeCount: currentSnoozeCount + 1 }, message: `✅ Task snoozed until ${snoozeDate}. This task has been snoozed ${currentSnoozeCount + 1} time(s).` };
    }

case 'update_task_priority': {
      // Used by ARGUS/ENIGMA agents to escalate task priority based on risk
      if (!args.taskId || !args.priority) return { success: false, data: null, message: 'taskId and priority are required' };
      await updateDoc(doc(db, 'todos', args.taskId), { priority: args.priority });
      logApi('PATCH', `/api/v1/tasks/${args.taskId}`, { priority: args.priority }, 'success');
      return { success: true, data: { taskId: args.taskId, priority: args.priority }, message: `✅ Task priority updated to ${args.priority}` };
    }

case 'complete_habit': {
      if (!args.habitId) return { success: false, data: null, message: 'habitId is required' };
      const habitDate = args.date || today;
      await addDoc(collection(db, 'habit_logs'), {
        userId: user.uid,
        habitId: args.habitId,
        date: habitDate,
        completed: true,
        notes: args.notes || null,
        createdAt: Date.now(),
      });
      logApi('POST', '/api/v1/habits/log', { habitId: args.habitId, date: habitDate }, 'success');
      return { success: true, data: {}, message: `✅ Habit logged as completed for ${habitDate}` };
    }

case 'mark_attendance': {
      if (!args.subject || !args.status) return { success: false, data: null, message: 'subject and status are required' };
      const attendanceDate = args.date || today;
      await addDoc(collection(db, 'attendance_logs'), {
        userId: user.uid,
        subject: args.subject,
        status: args.status,
        date: attendanceDate,
        notes: args.notes || null,
        createdAt: Date.now(),
      });
      logApi('POST', '/api/v1/attendance', { subject: args.subject, status: args.status, date: attendanceDate }, 'success');
      return { success: true, data: {}, message: `✅ Attendance logged: ${args.subject} — ${args.status} on ${attendanceDate}` };
    }

    default:
      return null; // Tool not handled by this executor
  }
};
