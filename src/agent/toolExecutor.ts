import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent, forceSilentRefresh, isSignedInToGoogle } from '../services/googleCalendar';
import { sendPushNotification } from '../services/fcm';
import { getLocalDateString } from '../utils/dateUtils';
import { logApi, logWebSocket } from '../utils/networkLogger';
import { recordApprovalRejection, recordApprovalTimeout, recordApprovalGrant, recordEmailSent, recordGhostTaskCreated } from '../services/agentMemoryPersistence';
import { userLearningStore } from '../services/userLearningStore';
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
  updateCalendarEvent,
  listCalendarEventsOnDate,
  createDraftEmail,
} from '../services/googleWorkspace';
import type { Task, CalendarEvent } from '../types/domain';

export type ToolResult = { success: boolean; data: unknown; message: string };

// ✅ INEFFICIENCY-5 FIX: Module-level singleton OAuth refresh lock.
// Previously each agent called forceSilentRefresh() independently on 401 errors.
// In a parallel mission, 3 agents could all start their own OAuth flows simultaneously.
// Now the first caller acquires the lock and all subsequent callers await the same promise.
let _oauthRefreshLock: Promise<void> | null = null;
const ensureGoogleAuthSingleton = async (): Promise<void> => {
  if (_oauthRefreshLock) return _oauthRefreshLock; // deduplicate concurrent refresh attempts
  _oauthRefreshLock = forceSilentRefresh().finally(() => { _oauthRefreshLock = null; });
  return _oauthRefreshLock;
};

const requireGoogleAuth = async (_signal?: AbortSignal): Promise<ToolResult | null> => {
  if (!isSignedInToGoogle()) {
    // Try a completely silent, user-gesture-free token refresh
    const refreshToken = localStorage.getItem('zen_gcal_refresh_token');
    if (refreshToken) {
      try {
        console.log('[ToolExecutor] Token expired mid-flight. Attempting silent refresh...');
        await ensureGoogleAuthSingleton(); // ✅ INEFFICIENCY-5: use singleton, not direct call
        if (isSignedInToGoogle()) {
          console.log('[ToolExecutor] Silent refresh successful! Resuming tool execution.');
          return null;
        }
      } catch (e) {
        console.warn('[ToolExecutor] Mid-flight silent refresh failed:', e);
      }
    }

    return {
      success: false,
      data: null,
      message: '⚠️ Google Workspace is not connected. Please click the **"Connect Google"** button in the orange banner at the top of the app, then try again.'
    };
  }
  return null;
};

// ── Human-in-the-Loop Approval Gate ──────────────────────────────────────────
// Fires a CustomEvent to the UI to request approval before destructive actions.
// The UI renders an approval card; the user's click resolves this promise.
// GAP-1 FIX: Records rejections/grants to Firestore so the agent learns over time
// which tools the user consistently approves vs. rejects.
//
// ✅ BUG-C5 FIX: Approval Serialization Queue.
// Previously, parallel agents (e.g. TITAN + CHRONOS both needing approval in the
// same DAG mission) could fire zen-approval-request simultaneously. The UI can
// only show ONE approval card at a time, so the second one was silently lost and
// auto-rejected after 120s with no user awareness.
// Fix: a promise chain ensures only one approval dialog is active at any time.
// Subsequent callers wait for the current one to resolve before displaying theirs.
let _approvalQueue: Promise<void> = Promise.resolve();

export const requestApproval = (toolName: string, summary: string, signal?: AbortSignal): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(true); // SSR: always approve

  // Enqueue this request — it will execute only after all previous approvals finish
  const resultPromise = _approvalQueue.then(() => {
    return new Promise<boolean>((resolve) => {
      const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const cleanup = () => window.removeEventListener(id, handler as EventListener);
      const handler = (e: Event) => {
        cleanup();
        const approved = (e as CustomEvent).detail?.approved === true;
        // Record decision to persistent memory — non-blocking
        if (approved) {
          recordApprovalGrant(toolName);
        } else {
          recordApprovalRejection(toolName);
        }
        resolve(approved);
      };
      window.addEventListener(id, handler as EventListener, { once: true });
      window.dispatchEvent(new CustomEvent('zen-approval-request', {
        detail: { id, toolName, summary }
      }));
      // ✅ SEC-5 FIX: Auto-reject after 120s records as 'approval_timeout', NOT 'approval_rejected'.
      // This prevents AFK timeouts from accumulating as deliberate user preference signal in memory.
      const timer = setTimeout(() => { cleanup(); recordApprovalTimeout(toolName); resolve(false); }, 120_000);
      signal?.addEventListener('abort', () => { clearTimeout(timer); cleanup(); resolve(false); }, { once: true });
    });
  });

  // Advance the queue (errors in one approval don't block the next)
  _approvalQueue = resultPromise.then(() => {}, () => {});
  return resultPromise;
};

export const executeTool = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult> => {

  const user = auth.currentUser;
  if (!user) return { success: false, data: null, message: 'Not authenticated. User is not logged in.' };
  const today = getLocalDateString(new Date());

  switch (toolName) {

    // ─── GOOGLE WORKSPACE CONNECTION ─────────────────────────────────────────
    case 'connect_google_workspace': {
      // The agent CANNOT open an OAuth popup — browsers require a real user gesture.
      // Instead, instruct the user to click the Connect button in the UI.
      if (isSignedInToGoogle()) {
        logApi('POST', '/api/v1/google/oauth/connect', {}, 'success');
        return { success: true, data: {}, message: '✅ Google Workspace is already fully connected! Gmail, Calendar, Drive, Docs, Sheets, and Google Meet are all active.' };
      }

      // Try a silent token refresh first (doesn't need user gesture)
      const refreshToken = localStorage.getItem('zen_gcal_refresh_token');
      if (refreshToken) {
        try {
          await forceSilentRefresh();
          if (isSignedInToGoogle()) {
            logApi('POST', '/api/v1/google/oauth/connect', {}, 'success');
            return { success: true, data: {}, message: '✅ Google Workspace silently reconnected! All services are active.' };
          }
        } catch { /* fall through */ }
      }

      // Cannot open a popup from agent code — guide the user
      logApi('POST', '/api/v1/google/oauth/connect', {}, 'error');
      return {
        success: false,
        data: null,
        message: '🔗 **Action Required:** Google Workspace needs to be connected. Please click the **"Connect Google"** button in the orange banner at the top of the app. Once you click it, a secure Google login popup will appear. After you approve, all Google features (Calendar, Gmail, Drive, Docs, Meet) will activate automatically.'
      };
    }

    // ─── TASKS ───────────────────────────────────────────────────────────────
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

    case 'query_internal_app_data': {
      logApi('GET', `/api/v1/internal/${args.moduleName}`, { query: args.query }, 'success');

      // ── Special module: todayGym ─────────────────────────────────────────
      // Returns today's workout plan + recent gym logs for today
      if (args.moduleName === 'todayGym') {
        const gymSchedule = appContext.gymSchedule;
        const gymLogs = appContext.gymLogs || [];
        const todayGymLogs = gymLogs.filter((log: any) => log.date === today);
        return {
          success: true,
          data: { todayPlan: gymSchedule, todayLogs: todayGymLogs },
          message: gymSchedule?.isRest
            ? `Today is a rest day. ${todayGymLogs.length} gym logs found for today.`
            : `Today is ${gymSchedule?.name || 'a workout day'}. Exercises: ${(gymSchedule?.exercises || []).map((e: any) => e.name).join(', ')}. ${todayGymLogs.length} gym logs recorded today.`
        };
      }

      // ── Special module: lectureSearch ────────────────────────────────────
      // Searches across all learning topics + subtasks/lectures by title
      if (args.moduleName === 'lectureSearch') {
        const learningTopics = appContext.learningTopics || [];
        const lowerQuery = (args.query || '').toLowerCase();
        const results: any[] = [];
        for (const topic of learningTopics) {
          const topicMatch = topic.title?.toLowerCase().includes(lowerQuery);
          for (const sub of (topic.subTasks || [])) {
            const lectureMatch = (sub.text || sub.title || '').toLowerCase().includes(lowerQuery);
            if (topicMatch || lectureMatch || !lowerQuery) {
              results.push({
                topicId: topic.id,
                topicTitle: topic.title,
                lectureId: sub.id,
                lectureTitle: sub.text || sub.title,
                videoUrl: sub.url || sub.resources?.[0]?.url,
                status: sub.status,
              });
            }
          }
        }
        return {
          success: true,
          data: results.slice(0, 20),
          message: `Found ${results.length} lectures matching '${args.query || 'all'}' across ${learningTopics.length} topics.`
        };
      }

      // ── Standard module lookup ───────────────────────────────────────────
      const moduleData = appContext[args.moduleName];
      if (!moduleData) {
        return { success: false, data: null, message: `Module '${args.moduleName}' not found. Available: gymSchedule, gymLogs, todayGym, notes, habits, habitLogs, goals, learningTopics, lectureSearch, jobs, dailyLogs, pomodoroSessions, tasks, calendarEvents, attendanceSubjects, assignments.` };
      }

      let filteredData = moduleData;
      if (args.query && Array.isArray(moduleData)) {
        const lowerQuery = args.query.toLowerCase();
        filteredData = moduleData.filter((item: any) => JSON.stringify(item).toLowerCase().includes(lowerQuery));
      }

      // Smart: for habits, enrich with today's completion status
      if (args.moduleName === 'habits' && Array.isArray(filteredData)) {
        const habitLogs = appContext.habitLogs || [];
        const todayLogs = habitLogs.filter((log: any) => log.date === today);
        filteredData = filteredData.map((habit: any) => ({
          ...habit,
          completedToday: todayLogs.some((log: any) => log.habitId === habit.id),
        }));
      }

      const count = Array.isArray(filteredData) ? filteredData.length : 'N/A';
      return {
        success: true,
        data: filteredData,
        message: `Fetched ${count} records from ${args.moduleName}${args.query ? ` matching '${args.query}'` : ''}`
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

    case 'delete_task': {
      if (!args.taskId) return { success: false, data: null, message: 'taskId is required to delete a task' };
      const taskApproved = await requestApproval('delete_task', `Delete task permanently?`, signal);
      if (!taskApproved) return { success: false, data: null, message: '🚫 Cancelled by user — task was NOT deleted.' };
      logApi('DELETE', `/api/v1/tasks/${args.taskId}`, {}, 'success');
      logWebSocket('task.deleted', { id: args.taskId });
      await deleteDoc(doc(db, 'todos', args.taskId));
      return { success: true, data: {}, message: `✅ Task successfully deleted` };
    }

    // ✅ NEW TOOL: update_task — patch any field without delete+recreate
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

    // ✅ NEW TOOL: complete_habit
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

    // ✅ NEW TOOL: mark_attendance
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

    // ✅ NEW TOOL: search_tasks — keyword search without loading all tasks
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

    // ✅ NEW TOOL: start_pomodoro — triggers focus session via window event
    case 'start_pomodoro': {
      if (!args.taskTitle) return { success: false, data: null, message: 'taskTitle is required for start_pomodoro' };
      const duration = args.durationMinutes || 25;
      window.dispatchEvent(new CustomEvent('start-pomodoro', {
        detail: { taskId: args.taskId, taskTitle: args.taskTitle, durationMinutes: duration }
      }));
      logApi('POST', '/api/v1/pomodoro/start', { taskId: args.taskId, taskTitle: args.taskTitle, durationMinutes: duration }, 'success');
      return { success: true, data: {}, message: `✅ Started ${duration}-minute Pomodoro focus session for "${args.taskTitle}". Timer is now running!` };
    }

    // ✅ NEW TOOL: create_assignment — adds academic assignment to Firestore
    case 'create_assignment': {
      if (!args.title || !args.subject || !args.dueDate) return { success: false, data: null, message: 'title, subject, and dueDate are required for create_assignment' };
      const assignmentRef = await addDoc(collection(db, 'assignments'), {
        userId: user.uid,
        title: args.title,
        subject: args.subject,
        dueDate: args.dueDate,
        priority: args.priority || 'medium',
        notes: args.notes || null,
        completed: false,
        createdAt: Date.now(),
      });
      logApi('POST', '/api/v1/assignments', { title: args.title, subject: args.subject, dueDate: args.dueDate }, 'success');

      // ✅ PART-4 STUDENT FIX: Assignment Reminder Chain.
      // Schedule T-1day, T-0 morning, T-2h push notifications via localStorage.
      // The watchdog in useProactiveAgent reads these and fires at the right moment.
      try {
        const dueMs = new Date(args.dueDate + 'T23:59:00').getTime();
        const reminders = [
          { fireAt: dueMs - 24 * 60 * 60 * 1000, message: `📚 Assignment due tomorrow: "${args.title}" for ${args.subject}` },
          { fireAt: dueMs - 8 * 60 * 60 * 1000,  message: `⏰ 8 hours left — "${args.title}" for ${args.subject}. Have you started?` },
          { fireAt: dueMs - 2 * 60 * 60 * 1000,  message: `🚨 2 HOURS LEFT — Submit "${args.title}" for ${args.subject} NOW!` },
        ];
        const existingRaw = localStorage.getItem('zen_assignment_reminders') || '[]';
        const existing = JSON.parse(existingRaw);
        const updated = [...existing, ...reminders.map(r => ({ ...r, assignmentId: assignmentRef.id, title: args.title }))];
        localStorage.setItem('zen_assignment_reminders', JSON.stringify(updated));
      } catch (reminderErr) {
        console.warn('[ToolExecutor] Reminder scheduling failed (non-blocking):', reminderErr);
      }

      return { success: true, data: { id: assignmentRef.id }, message: `✅ Assignment added: "${args.title}" for ${args.subject} due ${args.dueDate}. ⏰ 3 reminder notifications scheduled (T-1day, T-8h, T-2h).` };
    }

    case 'delete_calendar_event': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.eventId) return { success: false, data: null, message: 'eventId is required' };
      const calApproved = await requestApproval('delete_calendar_event', `Delete calendar event permanently?`, signal);
      if (!calApproved) return { success: false, data: null, message: '🚫 Cancelled by user — event was NOT deleted.' };
      logApi('DELETE', `/api/v1/calendar/events/${args.eventId}`, {}, 'success');
      try {
        await deleteGoogleCalendarEvent(args.eventId, signal);
        return { success: true, data: {}, message: `✅ Calendar event successfully deleted` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to delete calendar event: ${e.message}` };
      }
    }

    case 'trash_email': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.messageId) return { success: false, data: null, message: 'messageId is required' };
      const trashApproved = await requestApproval('trash_email', `Move this email to trash?`, signal);
      if (!trashApproved) return { success: false, data: null, message: '🚫 Cancelled by user — email was NOT trashed.' };
      logApi('DELETE', `/api/v1/gmail/messages/${args.messageId}/trash`, {}, 'success');
      try {
        await trashEmail(args.messageId, signal);
        return { success: true, data: {}, message: `✅ Email successfully moved to trash` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to trash email: ${e.message}` };
      }
    }

    case 'trash_drive_file': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.fileId) return { success: false, data: null, message: 'fileId is required' };
      // ✅ BUG FIX: Added approval gate — was missing unlike all other destructive tools
      const driveApproved = await requestApproval('trash_drive_file', `Move Drive file to trash permanently?`, signal);
      if (!driveApproved) return { success: false, data: null, message: '🚫 Cancelled by user — Drive file was NOT trashed.' };
      logApi('DELETE', `/api/v1/drive/files/${args.fileId}/trash`, {}, 'success');
      try {
        await trashDriveFile(args.fileId, signal);
        return { success: true, data: {}, message: `✅ Drive file successfully moved to trash` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to trash file: ${e.message}` };
      }
    }

    case 'auto_reschedule': {
      // ✅ MED-1 FIX: Respect pinned tasks and user low-activity days.
      // Previously, ALL non-high-priority tasks were moved regardless of
      // whether they were pinned or whether tomorrow is a rest/low-activity day.
      const userPrefs = appContext.userPreferences || {};
      const lowActivityDays: number[] = userPrefs.lowActivityDays || []; // 0=Sun, 6=Sat

      // Find next working day (skip low-activity days up to 7 ahead)
      const getNextWorkingDay = (): string => {
        const d = new Date();
        for (let i = 1; i <= 7; i++) {
          d.setDate(d.getDate() + 1);
          if (!lowActivityDays.includes(d.getDay())) break;
        }
        return getLocalDateString(d);
      };

      // ✅ BUG FIX: Added approval gate — was silently bulk-rescheduling without asking
      const tasksToReschedule = appContext.tasks.filter(
        (t: any) => t.status !== 'completed'
          && t.date === today
          && t.priority !== 'high'
          && !t.pinned  // ✅ MED-1: Skip pinned tasks
      );
      if (tasksToReschedule.length === 0) {
        return { success: true, data: { rescheduledCount: 0 }, message: 'No reschedulable tasks today (pinned and high-priority tasks were preserved).' };
      }
      // ✅ ISSUE-T3 FIX: Show ALL task names in approval dialog, not just the first 3.
      // Previously user would approve "3 tasks + N more" without knowing what the N tasks were.
      // This is a consent UX failure — the user must see everything they're approving.
      const ALL_TASK_NAMES = tasksToReschedule.map((t: any) => `"${t.title || t.text}"`).join(', ');
      const nextWorkDay = getNextWorkingDay();
      const rescheduleApproved = await requestApproval(
        'auto_reschedule',
        `Reschedule these ${tasksToReschedule.length} low-priority task(s) to ${nextWorkDay}?\n${ALL_TASK_NAMES}`,
        signal
      );
      if (!rescheduleApproved) return { success: false, data: null, message: '🚫 Cancelled by user — tasks were NOT rescheduled.' };
      let rescheduledCount = 0;

      for (const t of tasksToReschedule) {
        await updateDoc(doc(db, 'todos', t.id), { date: nextWorkDay });
        rescheduledCount++;
      }
      logApi('POST', '/api/v1/tasks/snooze', { reason: args.reason }, 'success');
      // ⚡ Real-time learning hook: increment reschedule rate
      tasksToReschedule.forEach((t: any) => userLearningStore.recordReschedule(t));
      return { success: true, data: { rescheduledCount, reason: args.reason }, message: `✅ Rescheduled ${rescheduledCount} low-priority tasks to ${nextWorkDay}. Reason: ${args.reason}` };
    }

    // ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────
    case 'schedule_task_in_calendar': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/schedule/auto-block', args, 'pending');
      const targetDate = args.date || today;
      const [h, m] = (args.startTime || '09:00').split(':').map(Number);
      const startDate = new Date(targetDate + 'T00:00:00');
      startDate.setHours(h, m, 0, 0);
      const endDate = new Date(startDate.getTime() + (args.durationMinutes || 60) * 60000);
      try {
        await addEventToGoogleCalendar({
          title: `🎯 ${args.taskName}`,
          date: startDate.toISOString().split('T')[0],
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          description: 'Auto-scheduled by Zen AI Agent'
        }, signal);
        logApi('POST', '/api/v1/schedule/auto-block', args, 'success');
        // ⚡ Real-time learning hook: record which hour slot was chosen
        userLearningStore.recordSlotChosen(h);
        return { success: true, data: {}, message: `✅ Blocked ${args.startTime}–${args.durationMinutes}min for "${args.taskName}" on ${targetDate}` };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(err as { message?: string }).message}` };
      }
    }

    case 'get_free_calendar_slots': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;

      const targetDate = args.date || today;
      try {
        const liveEvents = await listCalendarEventsOnDate(targetDate, signal);
        const slots: string[] = [];

        // Determine if an event overlaps with an hour slot
        const slotStart = new Date(targetDate + 'T00:00:00');
        const slotEnd = new Date(targetDate + 'T00:00:00');

        for (let hour = 8; hour < 22; hour++) {
          slotStart.setHours(hour, 0, 0, 0);
          slotEnd.setHours(hour + 1, 0, 0, 0);

          const hasConflict = liveEvents.some((e: { start?: { date?: string; dateTime?: string }; end?: { dateTime?: string } }) => {
            if (e.start?.date) {
              // All-day event blocks the entire day
              return true;
            }
            const eventStart = e.start?.dateTime ? new Date(e.start.dateTime) : null;
            const eventEnd = e.end?.dateTime ? new Date(e.end.dateTime) : null;
            if (eventStart && eventEnd) {
              return eventStart < slotEnd && eventEnd > slotStart;
            }
            return false;
          });

          if (!hasConflict) {
            slots.push(`${String(hour).padStart(2, '0')}:00`);
          }
        }

        return { 
          success: true, 
          data: { date: targetDate, freeSlots: slots.slice(0, 8) }, 
          message: `Found ${slots.length} free slots on ${targetDate}` 
        };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(err as { message?: string }).message}` };
      }
    }

    case 'list_calendar_events': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const targetDate = args.date || today;
      try {
        const events = await listCalendarEventsOnDate(targetDate, signal);
        return {
          success: true,
          data: { events },
          message: `Found ${events.length} calendar events on ${targetDate}`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'update_calendar_event': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        const attendeesList = args.attendees
          ? args.attendees.split(',').map((e: string) => e.trim())
          : undefined;
        const result = await updateCalendarEvent(args.eventId, {
          title: args.title,
          startDateTime: args.startDateTime,
          endDateTime: args.endDateTime,
          description: args.description,
          location: args.location,
          attendees: attendeesList,
        }, signal);
        return { success: true, data: result, message: `✅ Calendar event updated successfully. Link: ${result.htmlLink}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Calendar Update Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'block_calendar': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;

      // ✅ BUG-R9 FIX: block_calendar was always creating an event 15 minutes from NOW,
      // ignoring any startTime or date argument. If it was 9am and CHRONOS asked to block
      // 3pm, the calendar block landed at 9:15am. Now we honour startTime when provided.
      let startDate: Date;
      if (args.startTime) {
        // startTime can be "HH:MM" (today) or a full ISO datetime string
        if (args.startTime.includes('T') || args.startTime.length > 5) {
          startDate = new Date(args.startTime);
        } else {
          startDate = new Date(today + 'T' + args.startTime + ':00');
        }
      } else if (args.date) {
        // date provided but no time — use start of that day at 09:00
        const [h2, m2] = ((args.startTime as string | undefined) || '09:00').split(':').map(Number);
        startDate = new Date(args.date + 'T00:00:00');
        startDate.setHours(h2, m2, 0, 0);
      } else {
        // No time specified — default to 15 minutes from now (emergency focus block)
        startDate = new Date();
        startDate.setMinutes(startDate.getMinutes() + 15);
      }
      const endDate = new Date(startDate.getTime() + (args.durationHours || 2) * 3600000);
      try {
        await addEventToGoogleCalendar({
          title: `🚨 DEEP WORK: ${args.taskName}`,
          date: startDate.toISOString().split('T')[0],
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          description: 'Auto-blocked by Zen AI Emergency Protocol'
        }, signal);
        return { success: true, data: {}, message: `✅ Blocked ${args.durationHours || 2}h for "${args.taskName}" starting at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(err as { message?: string }).message}` };
      }
    }

    case 'delete_calendar_events': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const targetDate = args.date || today;
      let deletedCount = 0;
      try {
        const liveEvents = await listCalendarEventsOnDate(targetDate, signal);
        // ✅ BUG FIX: Added approval gate — this was the only destructive tool without one
        const bulkCalApproved = await requestApproval(
          'delete_calendar_events',
          `Delete ALL ${liveEvents.length} event(s) on ${targetDate}? This cannot be undone.`,
          signal
        );
        if (!bulkCalApproved) return { success: false, data: null, message: '🚫 Cancelled by user — calendar was NOT cleared.' };
        for (const ev of liveEvents) {
          if (ev.id) {
            await deleteGoogleCalendarEvent(ev.id, signal);
            deletedCount++;
          }
        }
        return { success: true, data: { deletedCount }, message: `✅ Cleared ${deletedCount} events from ${targetDate}'s schedule.` };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(err as { message?: string }).message}` };
      }
    }

    // ─── GOOGLE MEET ─────────────────────────────────────────────────────────
    case 'create_google_meet': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/meet/create', { title: args.title }, 'pending');
      try {
        const startDT = new Date(args.startDateTime);
        const durationMs = (args.durationMinutes || 60) * 60 * 1000;
        const endDT = new Date(startDT.getTime() + durationMs);
        const attendeesList = args.attendees
          ? args.attendees.split(',').map((e: string) => e.trim())
          : [];

        const result = await createGoogleMeet({
          title: args.title,
          startDateTime: startDT.toISOString(),
          endDateTime: endDT.toISOString(),
          description: args.description,
          attendees: attendeesList,
        }, signal);
        logApi('POST', '/api/v1/google/meet/create', { title: args.title }, 'success');
        return {
          success: true,
          data: result,
          message: `✅ Google Meet created: "${args.title}"\n🔗 Meet Link: ${result.meetLink}\n📅 Calendar: ${result.calendarLink}${attendeesList.length > 0 ? `\n👥 Invited: ${attendeesList.join(', ')}` : ''}`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Google Meet API Error: ${(e as { message?: string }).message}` };
      }
    }

    // ─── GMAIL ───────────────────────────────────────────────────────────────
    case 'read_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/google/gmail/read', { query: args.query }, 'pending');
      try {
        const result = await fetchUnreadEmails(args.query, signal);
        logApi('GET', '/api/v1/google/gmail/read', { query: args.query }, 'success');
        const count = result.emails ? result.emails.length : 0;
        return { 
          success: true, 
          data: result, 
          message: `Fetched ${count} emails matching '${args.query || 'is:unread'}' (Account: ${result.emailAddress})` 
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'send_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      // ✅ LOW-4 FIX: Detect probable-reply subjects before sending.
      // If the subject starts with 'Re:' or the body contains quoted text ('\n>'),
      // the agent should almost certainly be using reply_gmail (which threads the message).
      // We warn but do not block — the user may intentionally start a new thread.
      const looksLikeReply = /^re:/i.test(String(args.subject || '').trim())
        || (String(args.bodyText || '')).includes('\n>');
      const sendApproved = await requestApproval(
        'send_gmail',
        `Send email to ${args.to} — Subject: "${args.subject}"?${looksLikeReply ? '\n\n⚠️ Note: This looks like a reply (subject starts with "Re:" or contains quoted text). If replying to an existing thread, use reply_gmail(threadId, ...) instead to properly thread the message.' : ''}`,
        signal
      );
      if (!sendApproved) return { success: false, data: null, message: '🚫 Cancelled by user — email was NOT sent.' };
      logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'pending');
      try {
        await sendEmail(args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'success');

        // ✅ ISSUE-T2 FIX: Deduplicate follow-up tasks before creating.
        // Previously every sent email created a follow-up task unconditionally.
        // 5 emails in one L3 mission = 5 phantom tasks. Same recipient on two missions = duplicates.
        // Now we check if a follow-up task for this recipient already exists before creating one.
        try {
          const followUpTitle = `Follow up with ${args.to} re: ${args.subject}`;
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 3);
          const followUpDateStr = getLocalDateString(followUpDate);

          // Check for existing follow-up task to this recipient (created in last 7 days)
          const sevenDaysAgo = getLocalDateString(new Date(Date.now() - 7 * 86400000));
          const existingQ = query(
            collection(db, 'todos'),
            where('userId', '==', user.uid),
            where('tags', 'array-contains', 'follow-up'),
          );
          const existingSnap = await getDocs(existingQ);
          const alreadyExists = existingSnap.docs.some(d => {
            const data = d.data();
            const recipientMatch = (data.linkedEmail?.to === args.to);
            const recentEnough = data.date >= sevenDaysAgo;
            return recipientMatch && recentEnough;
          });

          if (!alreadyExists) {
            await addDoc(collection(db, 'todos'), {
              userId: user.uid,
              title: followUpTitle,
              text: followUpTitle,
              priority: 'medium',
              date: followUpDateStr,
              status: 'pending',
              tags: ['follow-up', 'email'],
              linkedEmail: { to: args.to, subject: args.subject, sentAt: Date.now() },
              source: 'agent:HERMES',
              createdAt: Date.now(),
              order: Date.now(),
            });
          }
        } catch (followUpErr) {
          console.warn('[ToolExecutor] Follow-up task creation failed (non-blocking):', followUpErr);
        }

        // ✅ GAP-1: Record to persistent memory so agent won't re-send same email tomorrow
        recordEmailSent(args.to as string, args.subject as string);
        userLearningStore.recordEmailAction(60);
        return { success: true, data: {}, message: `✅ Email sent to ${args.to}. 📌 Follow-up task auto-created for 3 days from now (deduplicated — skipped if one already exists).` };


      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'draft_email': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/gmail/draft', { to: args.to }, 'pending');
      try {
        await createDraftEmail(args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/draft', { to: args.to }, 'success');
        return { success: true, data: {}, message: `✅ Draft email saved successfully for ${args.to}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'schedule_google_meet': {
      // Alias for create_google_meet
      return executeTool('create_google_meet', args, appContext, signal);
    }

    case 'notify_accountability_partner': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      // ✅ BUG FIX: Added approval gate — was sending emails to third parties without any confirmation
      const partnerApproved = await requestApproval(
        'notify_accountability_partner',
        `Send accountability alert email to ${args.partnerEmail}?`,
        signal
      );
      if (!partnerApproved) return { success: false, data: null, message: '🚫 Cancelled by user — accountability partner was NOT notified.' };
      logApi('POST', '/api/v1/google/gmail/send', { to: args.partnerEmail }, 'pending');
      try {
        const subject = `[URGENT] Accountability Alert: ZenTrack Notification`;
        const bodyText = `Hello,\n\nYou are receiving this automated alert because you are listed as an accountability partner.\n\nMessage:\n${args.message}\n\nPlease check in with them.\n\n- ZenTrack AI`;
        await sendEmail(args.partnerEmail, subject, bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/send', { to: args.partnerEmail }, 'success');
        return { success: true, data: {}, message: `✅ Accountability partner (${args.partnerEmail}) notified successfully.` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'reply_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/gmail/reply', { to: args.to }, 'pending');
      try {
        await replyToEmail(args.threadId, args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/reply', { to: args.to }, 'success');
        return { success: true, data: {}, message: `✅ Reply sent to ${args.to} in thread` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Reply Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'archive_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        await archiveEmail(args.messageId, signal);
        return { success: true, data: {}, message: `✅ Email archived successfully` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Archive Error: ${(e as { message?: string }).message}` };
      }
    }

    // ─── GOOGLE ARCHIVE ─────────────────────────────────────────────────────────
    case 'search_google_drive': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/google/drive/search', { query: args.query }, 'pending');
      try {
        const files = await searchGoogleDrive(args.query, signal);
        logApi('GET', '/api/v1/google/drive/search', { query: args.query }, 'success');
        return {
          success: true,
          data: { files },
          message: `Found ${files.length} files in Drive matching '${args.query}'`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'list_drive_files': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        const files = await listDriveFiles(args.limit || 15);
        return { success: true, data: { files }, message: `Listed ${files.length} recent Drive files` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'open_drive_file': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        if (args.openAsPdf === 'true') {
          const pdfUrl = await getFilePdfLink(args.fileId);
          if (typeof window !== 'undefined') window.open(pdfUrl, '_blank');
          return { success: true, data: { url: pdfUrl }, message: `✅ File opened as PDF in new browser tab: ${pdfUrl}` };
        }
        const result = await openDriveFile(args.fileId);
        return { success: true, data: result, message: `✅ Opened "${result.name}" in browser. URL: ${result.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive Open Error: ${(e as { message?: string }).message}` };
      }
    }

    // ─── GOOGLE SCRIBE ─────────────────────────────────────────────────────────
    case 'create_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/docs/create', { title: args.title }, 'pending');
      try {
        const docInfo = await createGoogleDoc(args.title);
        logApi('POST', '/api/v1/google/docs/create', { title: args.title }, 'success');
        return { success: true, data: docInfo, message: `✅ Created Google Document: "${args.title}" → ${docInfo.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Docs API Error: ${(e as { message?: string }).message}` };
      }
    }

    case 'write_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        // ✅ FIX: Convert Markdown to HTML before writing (DEDUCTION 4.2)
        // The old writeToGoogleDoc called Docs API insertText with raw Markdown.
        // Google Docs does NOT render ##, **, or - as formatting — it shows literal symbols.
        // Fix: convert to basic HTML and upload via Drive API with MIME type conversion
        // so Google automatically converts it to a properly-formatted Google Doc.
        const markdownContent = args.content as string || '';
        const htmlContent = markdownContent
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/^- (.+)$/gm, '<li>$1</li>')
          .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
          .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>');
        const fullHtml = `<!DOCTYPE html><html><body><p>${htmlContent}</p></body></html>`;

        const result = await writeToGoogleDoc(args.docId, fullHtml, { isHtml: true });
        return { success: true, data: result, message: `✅ Content written to Google Doc (formatted). View: ${result.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Docs Write Error: ${(e as { message?: string }).message}` };
      }
    }

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────
    case 'send_reminder': {
      try {
        const delayMs = (args.delayMinutes || 5) * 60 * 1000;
        const fireAt = new Date(Date.now() + delayMs);

        // ✅ FIXED: Also store in Firestore for persistence (Cloud Function can pick it up),
        // AND fire a client-side setTimeout that calls FCM directly as a reliable fallback.
        // The old code only wrote to Firestore which had no worker consuming it.
        await addDoc(collection(db, 'scheduledReminders'), {
          userId: user.uid,
          message: args.message,
          fireAt: fireAt.toISOString(),
          status: 'pending',
          createdAt: Date.now()
        });

        // Client-side fallback: fire push notification after delay
        // This works as long as the browser tab stays open during the delay.
        if (delayMs <= 30 * 60 * 1000) { // Only for reminders <= 30 minutes
          setTimeout(async () => {
            try {
              await sendPushNotification({
                userIds: [user.uid],
                title: '⏰ Reminder',
                body: args.message
              });
            } catch (e) {
              console.warn('[send_reminder] Client-side FCM fallback failed:', e);
            }
          }, delayMs);
        }

        return { success: true, data: {}, message: `✅ Reminder scheduled for ${fireAt.toLocaleTimeString()}: "${args.message}"` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Failed to schedule reminder: ${(e as { message?: string }).message}` };
      }
    }

    case 'send_notification': {
      try {
        await sendPushNotification({
          userIds: [user.uid],
          title: args.title,
          body: args.message
        });

        // ✅ FEAT-7 FIX: Persist notification to Firestore history so users can
        // review past agent notifications in a notification history modal.
        // Silently non-blocking — notification delivery is unaffected by this.
        addDoc(collection(db, 'notifications', user.uid, 'history'), {
          title: args.title,
          message: args.message,
          sentAt: Date.now(),
          source: 'agent',
          read: false,
        }).catch(() => {}); // fire-and-forget

        // ── Twilio SMS for CRITICAL/HIGH-priority alerts ───────────────────────
        // If the agent marks something as high priority or the title contains
        // emergency keywords, also send an SMS so the user gets it even if their
        // browser notifications are off.
        const isUrgent = args.priority === 'high'
          || /critical|overdue|urgent|panic|emergency|missed deadline/i.test(args.title || '')
          || /critical|overdue|urgent|panic|emergency/i.test(args.message || '');

        if (isUrgent) {
          try {
            // Get user's phone from Firestore profile
            const { getDoc, doc: fsDoc } = await import('firebase/firestore');
            const profileSnap = await getDoc(fsDoc(db, 'user_profiles', user.uid));
            const phone = profileSnap.data()?.phoneNumber || profileSnap.data()?.phone;

            if (phone) {
              // Call the Vercel SMS endpoint (works even in browser — it's our own API)
              const VERCEL_BASE = import.meta.env.VITE_APP_URL || 'https://myzentrack.vercel.app';
              const smsBody = [
                args.title,
                '',
                args.message,
                '',
                `ZenTrack: myzentrack.vercel.app`,
              ].join('\n');

              await fetch(`${VERCEL_BASE}/api/send-sms`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-Secret': import.meta.env.VITE_INTERNAL_SECRET || '',
                },
                body: JSON.stringify({ message: smsBody }),
              }).then(r => {
                if (r.ok) console.log('[send_notification] Twilio SMS sent for urgent alert');
                else console.warn('[send_notification] Twilio SMS failed:', r.status);
              });
            }
          } catch (smsErr) {
            console.warn('[send_notification] SMS fire-and-forget failed (non-blocking):', smsErr);
          }
        }

        return { success: true, data: {}, message: `✅ Notification sent: "${args.title}"${isUrgent ? ' + SMS alert fired' : ''}` };
      } catch {
        return { success: false, data: null, message: 'Failed to send notification' };
      }
    }


    // ─── AGENT SYSTEM ────────────────────────────────────────────────────────────

    // ✅ FEAT-5: get_habit_stats — computes streak/completion rate server-side
    // Previously ENIGMA had to load raw habit docs and do arithmetic in the LLM,
    // wasting tokens and sometimes getting counts wrong.
    case 'get_habit_stats': {
      const habits = (appContext.habits || []) as any[];
      const habitLogs = (appContext.habitLogs || []) as any[];
      const today30 = getLocalDateString(new Date());
      const thirtyDaysAgo30 = getLocalDateString(new Date(Date.now() - 30 * 86400_000));

      const stats = habits.map((h: any) => {
        const logs = habitLogs.filter((l: any) => l.habitId === h.id && l.date >= thirtyDaysAgo30);
        const completionRate = Math.round((logs.length / 30) * 100);

        // Compute current streak
        let streak = 0;
        const checkDate = new Date();
        while (streak < 365) {
          const dateStr = getLocalDateString(checkDate);
          const logged = habitLogs.some((l: any) => l.habitId === h.id && l.date === dateStr && l.completed);
          if (!logged) break;
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        }

        const completedToday = habitLogs.some((l: any) =>
          l.habitId === h.id && l.date === today30 && l.completed
        );

        return {
          id: h.id,
          name: h.name || h.title,
          frequency: h.frequency || 'daily',
          currentStreak: streak,
          longestStreak: h.longestStreak || streak,
          completionRate30d: completionRate,
          logsLast30Days: logs.length,
          completedToday,
          icon: h.icon || '✅',
        };
      });

      const avgRate = stats.length > 0
        ? Math.round(stats.reduce((s: number, h: any) => s + h.completionRate30d, 0) / stats.length)
        : 0;
      const topHabit = stats.sort((a: any, b: any) => b.currentStreak - a.currentStreak)[0];

      logApi('GET', '/api/v1/habits/stats', {}, 'success');
      return {
        success: true,
        data: { habits: stats, avgCompletionRate30d: avgRate, topHabit: topHabit?.name || 'N/A', totalHabits: habits.length },
        message: `📊 Habit stats: ${habits.length} habits tracked. Avg 30-day completion: ${avgRate}%. Top streak: ${topHabit?.name || 'N/A'} (${topHabit?.currentStreak || 0} days).`
      };
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

    // ✅ HEPHAESTUS FIX (ISSUE-4.3): implement generate_script so HEPHAESTUS is fully functional.
    // Previously no case existed — every generate_script call fell through to "Unknown tool",
    // making HEPHAESTUS a complete ghost agent with zero real functionality.
    // Now: dispatches 'zen-script' CustomEvent → ZenAgentPanel renders a Script Card
    // with syntax highlighting + copy button. Also persists to Firestore for later retrieval.
    case 'generate_script': {
      if (!args.language || !args.code) {
        return { success: false, data: null, message: 'language and code are required for generate_script' };
      }
      const scriptLang = (args.language as string).toLowerCase();
      const scriptCode = args.code as string;
      const scriptExplanation = (args.explanation as string) || 'Script generated by HEPHAESTUS.';
      const lineCount = scriptCode.split('\n').length;

      // Dispatch to ZenAgentPanel UI to render a Script Card with syntax highlighting
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zen-script', {
          detail: { language: scriptLang, code: scriptCode, explanation: scriptExplanation, generatedAt: Date.now() }
        }));
      }

      // Persist to Firestore so user can retrieve scripts later
      try {
        await addDoc(collection(db, 'generated_scripts'), {
          userId: user.uid,
          language: scriptLang,
          code: scriptCode,
          explanation: scriptExplanation,
          createdAt: Date.now(),
          source: 'agent:HEPHAESTUS',
        });
      } catch (persistErr) {
        console.warn('[generate_script] Firestore persist failed (non-blocking):', persistErr);
      }

      logApi('POST', '/api/v1/agent/scripts', { language: scriptLang, lines: lineCount }, 'success');
      return {
        success: true,
        data: { language: scriptLang, lines: lineCount, explanation: scriptExplanation },
        message: `🔧 **Script Card generated** (${scriptLang.toUpperCase()}, ${lineCount} lines)\n\n${scriptExplanation}\n\n✅ The code card has appeared above in the chat. Click **Copy** to grab the code, then run it in your terminal.`
      };
    }

    case 'delegate_task': {

      try {
        // ✅ Delegation depth guard: prevents recursive agent death spirals.
        // TITAN → HERMES → CHRONOS is depth 2 (max). Depth 3+ is always a hallucination loop.
        const currentDepth = depth;
        if (currentDepth >= 2) {
          console.warn(`[delegate_task] Max delegation depth (2) reached for role ${args.agentRole}. Returning context to parent.`);
          return {
            success: false, data: null,
            message: `Max delegation depth reached. Cannot spawn ${args.agentRole} further. Use the data already in context to complete the task.`
          };
        }

        // Dynamically import to avoid circular dependency
        const { runAgentLoop } = await import('./runAgentLoop');
        const { getAgentPromptByRole } = await import('./orchestrator');
        const subAgentSystem = getAgentPromptByRole(args.agentRole);
        if (!subAgentSystem) {
          return { success: false, data: null, message: `Unknown agent role: "${args.agentRole}". Valid roles: ORACLE, ENIGMA, HERMES, CHRONOS, MEET, ARCHIVE, SCRIBE, HEPHAESTUS, ATLAS, ARGUS, SPECTRE, TITAN, AEGIS` };
        }
        const apiKey = (import.meta as { env?: { VITE_GEMINI_API_KEY?: string } }).env?.VITE_GEMINI_API_KEY || '';
        logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, { instruction: args.instruction, depth: currentDepth + 1 }, 'pending');
        // ✅ FIX: Inject accumulated fleet context so sub-agents don't re-do prior agents' work (PROBLEM 4)
        const fleetCtx = (appContext as any)?._completedAgentResults
          ? `\n\n[FLEET CONTEXT: Prior agents have already fetched this data. Use it directly:\n${JSON.stringify((appContext as any)._completedAgentResults).substring(0, 2000)}]`
          : '';
        const instructionWithDepth = `${args.instruction}${fleetCtx}`;
        const result = await runAgentLoop(
          instructionWithDepth,
          appContext,
          apiKey,
          () => {}, // silent onStep — sub-agent runs in background
          subAgentSystem,
          undefined,
          undefined,
          true, // ✅ isSubAgent: true -> bypasses semaphore to prevent deadlock
          currentDepth + 1,
          args.agentRole !== 'AEGIS'
        );
        
        if (result.startsWith('Agent Loop Failed:')) {
          logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, { error: result }, 'error');
          return {
            success: false,
            data: null,
            message: `❌ Delegation to ${args.agentRole} failed: ${result}`
          };
        }

        logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, {}, 'success');
        logWebSocket('agent.delegated', { role: args.agentRole, result: result.substring(0, 100) });
        return {
          success: true,
          data: { agentRole: args.agentRole, result: result.substring(0, 500) },
          message: `✅ [${args.agentRole}] sub-agent completed: ${result.substring(0, 200)}`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Delegation to ${args.agentRole} failed: ${(e as { message?: string }).message}` };
      }
    }


    // ─── IN-APP NAVIGATION ────────────────────────────────────────────────────

    case 'navigate_to_module': {
      const route = args.route as string;
      if (!route) return { success: false, data: null, message: 'route is required for navigate_to_module' };

      // ✅ FEAT-6 FIX: Detect external-intent routes and open them in a new tab.
      // Previously NAVIGATOR would dispatch agent-navigate for routes like "gmail" or "drive"
      // which the React Router ignored, leaving the user confused with no visual feedback.
      const EXTERNAL_ROUTES: Record<string, string> = {
        'gmail': 'https://mail.google.com',
        'drive': 'https://drive.google.com',
        'calendar-web': 'https://calendar.google.com',
        'docs': 'https://docs.google.com',
        'sheets': 'https://sheets.google.com',
        'meet': 'https://meet.google.com',
        'youtube': 'https://youtube.com',
      };
      const externalUrl = EXTERNAL_ROUTES[route.replace('/', '').toLowerCase()];
      if (externalUrl) {
        if (typeof window !== 'undefined') window.open(externalUrl, '_blank', 'noopener,noreferrer');
        return { success: true, data: { url: externalUrl }, message: `✅ Opened ${route} in a new browser tab: ${externalUrl}` };
      }

      // Dispatch event for React Router to pick up
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-navigate', {
          detail: {
            route,
            subView: args.subView,
            lectureTopicTitle: args.lectureTopicTitle,
            lectureTitle: args.lectureTitle,
          }
        }));
      }

      logApi('POST', `/api/v1/navigate${route}`, {}, 'success');
      const moduleName = route.replace('/', '').charAt(0).toUpperCase() + route.slice(2);
      return {
        success: true,
        data: { route, lectureTopicTitle: args.lectureTopicTitle, lectureTitle: args.lectureTitle },
        message: `✅ Navigated to ${moduleName} module.${args.lectureTitle ? ` Opening lecture: "${args.lectureTitle}"` : ''}${args.reason ? ` Reason: ${args.reason}` : ''}`
      };
    }


    case 'open_gym_workout': {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-navigate', {
          detail: {
            route: '/gym',
            subView: args.showLogs ? 'logs' : 'plan',
            day: args.day || 'today',
          }
        }));
      }
      logApi('POST', '/api/v1/navigate/gym', { day: args.day }, 'success');
      const gymSchedule = appContext.gymSchedule;
      const workoutName = gymSchedule?.isRest ? 'Rest Day' : (gymSchedule?.name || 'Workout');
      return {
        success: true,
        data: { route: '/gym', day: args.day || 'today', workout: workoutName },
        message: `✅ Opened Gym module. Today's workout: ${workoutName}.`
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── PART 4: STUDENT REAL-WORLD FEATURES ────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    // 🎓 Bunk Calculator — #1 most-requested student feature
    case 'calculate_bunk_capacity': {
      if (!args.subject) return { success: false, data: null, message: 'subject is required' };
      const targetPct = (args.targetPercentage as number) || 75;
      const subjects: any[] = appContext.attendanceSubjects || [];
      const subj = subjects.find((s: any) => (s.name || s.subject || '').toLowerCase().includes((args.subject as string).toLowerCase()));
      if (!subj) {
        const available = subjects.map((s: any) => s.name || s.subject).join(', ');
        return { success: false, data: null, message: `Subject "${args.subject}" not found. Available: ${available || 'No subjects tracked yet — add attendance data first.'}` };
      }
      const attended = subj.attended || subj.present || 0;
      const total    = subj.total   || subj.conducted || 0;
      if (total === 0) return { success: false, data: null, message: `No attendance data found for ${subj.name}` };
      const currentPct = ((attended / total) * 100).toFixed(1);
      const target = targetPct / 100;
      // Formula: attended - target*(total+x) >= 0 where x = classes to miss
      // Solving: safeToMiss = floor((attended - target*total) / target)
      const safeToMiss = Math.floor((attended - target * total) / target);
      const canMiss = Math.max(0, safeToMiss);
      // Classes needed to recover if already below target
      const classesNeededToRecover = attended / total < target
        ? Math.ceil((target * total - attended) / (1 - target))
        : 0;
      return {
        success: true,
        data: { subject: subj.name, attended, total, currentPct: parseFloat(currentPct), targetPct, canMiss, classesNeededToRecover },
        message: canMiss > 0
          ? `📊 ${subj.name}: ${currentPct}% attendance (${attended}/${total}). You can safely miss **${canMiss} more class${canMiss > 1 ? 'es' : ''}** before falling below ${targetPct}%.`
          : `🚨 ${subj.name}: ${currentPct}% attendance — already below ${targetPct}%! You need to attend **${classesNeededToRecover} consecutive class${classesNeededToRecover > 1 ? 'es' : ''}** to recover.`
      };
    }

    // 📅 Exam Auto-Scheduler — creates study sessions + calendar blocks
    case 'plan_study_schedule': {
      if (!args.subject || !args.examDate) return { success: false, data: null, message: 'subject and examDate are required' };
      const dailyHours = (args.dailyHours as number) || 2;
      const examDate = new Date(args.examDate as string);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1); // start tomorrow
      const daysUntilExam = Math.floor((examDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExam <= 0) return { success: false, data: null, message: `Exam date ${args.examDate} is today or in the past. Cannot schedule study sessions.` };
      const topics = args.syllabusTopics ? (args.syllabusTopics as string).split(',').map(t => t.trim()) : [];
      const studyDays = Math.min(daysUntilExam, 14); // cap at 2 weeks
      const sessionsPerDay = topics.length > 0 ? Math.ceil(topics.length / studyDays) : 1;
      const createdTasks: string[] = [];
      // Create high-priority exam task first
      const examRef = await addDoc(collection(db, 'todos'), {
        userId: user.uid, title: `📝 EXAM: ${args.subject}`, text: `📝 EXAM: ${args.subject}`,
        priority: 'high', date: args.examDate, status: 'pending',
        estimatedMinutes: 180, createdAt: Date.now(), order: Date.now(),
      });
      createdTasks.push(`Exam task: ${args.subject} on ${args.examDate}`);
      // Create daily study session tasks
      for (let day = 0; day < studyDays; day++) {
        const sessionDate = new Date(startDate);
        sessionDate.setDate(startDate.getDate() + day);
        const dateStr = getLocalDateString(sessionDate);
        const topicStart = day * sessionsPerDay;
        const dayTopics = topics.slice(topicStart, topicStart + sessionsPerDay);
        const sessionTitle = dayTopics.length > 0
          ? `Study: ${args.subject} — ${dayTopics.join(' + ')}`
          : `Study: ${args.subject} — Session ${day + 1}`;
        await addDoc(collection(db, 'todos'), {
          userId: user.uid, title: sessionTitle, text: sessionTitle,
          priority: day < 3 ? 'high' : 'medium',
          date: dateStr, status: 'pending',
          estimatedMinutes: dailyHours * 60,
          createdAt: Date.now(), order: Date.now() + day,
          linkedExamId: examRef.id,
        });
        createdTasks.push(`${dateStr}: ${sessionTitle}`);
      }
      logApi('POST', '/api/v1/tasks/bulk', { subject: args.subject, count: createdTasks.length }, 'success');

      // ✅ ISSUE-T4 FIX: Auto-block calendar slots internally instead of instructing the agent
      // to make additional get_free_calendar_slots + schedule_task_in_calendar calls.
      // The old approach hit the 6-iteration max — only the first 6 of 14 sessions got calendar
      // blocks, and the rest were silently skipped. Now we do up to 5 blocks in-line.
      const calendarBlockResults: string[] = [];
      try {
        if (isSignedInToGoogle()) {
          const studyStartDate = new Date();
          studyStartDate.setDate(studyStartDate.getDate() + 1);
          const slotsToBlock = Math.min(studyDays, 5); // block first 5 days' sessions in-line
          for (let day = 0; day < slotsToBlock; day++) {
            const sessionDate = new Date(studyStartDate);
            sessionDate.setDate(studyStartDate.getDate() + day);
            const dateStr = getLocalDateString(sessionDate);
            const liveEvents = await listCalendarEventsOnDate(dateStr, signal);
            // Find first free 2-hour slot between 8am-10pm
            let blocked = false;
            for (let hour = 8; hour <= 20; hour++) {
              const slotStart = new Date(dateStr + 'T00:00:00');
              slotStart.setHours(hour, 0, 0, 0);
              const slotEnd = new Date(slotStart.getTime() + dailyHours * 3600000);
              const hasConflict = liveEvents.some((e: any) => {
                const es = e.start?.dateTime ? new Date(e.start.dateTime) : null;
                const ee = e.end?.dateTime ? new Date(e.end.dateTime) : null;
                return es && ee && es < slotEnd && ee > slotStart;
              });
              if (!hasConflict) {
                await addEventToGoogleCalendar({
                  title: `📚 Study: ${args.subject}`,
                  date: dateStr,
                  startDateTime: slotStart.toISOString(),
                  endDateTime: slotEnd.toISOString(),
                  description: `Auto-scheduled study session for ${args.subject} exam on ${args.examDate}`,
                }, signal);
                calendarBlockResults.push(`${dateStr} @ ${String(hour).padStart(2,'0')}:00`);
                blocked = true;
                break;
              }
            }
            if (!blocked) calendarBlockResults.push(`${dateStr} (no free slot found)`);
          }
        }
      } catch (calErr) {
        console.warn('[plan_study_schedule] Calendar auto-block failed (non-blocking):', calErr);
      }

      const calMsg = calendarBlockResults.length > 0
        ? `\n📅 Auto-blocked calendar slots: ${calendarBlockResults.join(' | ')}${studyDays > 5 ? ` (+ ${studyDays - 5} more — connect Google Calendar for full blocking)` : ''}`
        : `\n💡 Connect Google Calendar to auto-block daily study windows.`;

      return {
        success: true,
        data: { examId: examRef.id, sessionsCreated: studyDays, daysUntilExam, dailyHours, calendarBlockResults },
        message: `✅ Study schedule created for **${args.subject}** exam on ${args.examDate}!\n📅 ${studyDays} study sessions (${dailyHours}h/day) scheduled from tomorrow.\n📋 Sessions: ${createdTasks.slice(1, 4).join(' | ')}${studyDays > 3 ? ` + ${studyDays - 3} more` : ''}${calMsg}`
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── PART 4: ENTREPRENEUR / PROFESSIONAL FEATURES ───────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    // 📧 Full Email Thread Summarization
    case 'get_email_thread': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const queryOrId = (args.threadId || args.query) as string;
      if (!queryOrId) return { success: false, data: null, message: 'Provide either threadId or a query (e.g. "from:rahul@company.com")' };
      logApi('GET', '/api/v1/google/gmail/thread', { query: queryOrId }, 'pending');
      try {
        const thread = await fetchEmailThread(queryOrId, signal);
        if (!thread.messages.length) return { success: false, data: null, message: `No emails found for: ${queryOrId}` };
        logApi('GET', '/api/v1/google/gmail/thread', { query: queryOrId }, 'success');
        return {
          success: true,
          data: thread,
          message: `📬 Thread found: ${thread.messageCount} message${thread.messageCount !== 1 ? 's' : ''}. Latest: "${thread.messages[thread.messages.length-1]?.subject}" from ${thread.messages[thread.messages.length-1]?.from}. Full conversation loaded for analysis.`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Thread API Error: ${(e as { message?: string }).message}` };
      }
    }

    // 🤝 Meeting Prep Brief — context for professionals 30 min before meetings
    case 'get_meeting_prep_brief': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const meetingDate = today;
      const events = await listCalendarEventsOnDate(meetingDate, signal);
      const targetEvent = args.eventTitle
        ? events.find((e: any) => (e.summary || '').toLowerCase().includes((args.eventTitle as string).toLowerCase()))
        : events[0];
      if (!targetEvent && !args.attendeeEmails) return { success: false, data: null, message: 'No meeting found today. Provide eventTitle or attendeeEmails to generate a brief.' };
      const attendees: string[] = args.attendeeEmails
        ? (args.attendeeEmails as string).split(',').map(e => e.trim())
        : (targetEvent?.attendees || []).map((a: any) => a.email).filter(Boolean);
      // Pull tasks tagged to attendees
      const relatedTasks = (appContext.tasks || []).filter((t: any) => {
        const title = (t.title || t.text || '').toLowerCase();
        return attendees.some(email => {
          const name = email.split('@')[0].toLowerCase();
          return title.includes(name);
        });
      }).slice(0, 5);
      return {
        success: true,
        data: { event: targetEvent?.summary, attendees, relatedTasks, date: meetingDate },
        message: `📋 **Meeting Prep Brief: ${targetEvent?.summary || 'Upcoming Meeting'}**\n👥 Attendees: ${attendees.join(', ') || 'Unknown'}\n📌 Open action items: ${relatedTasks.length > 0 ? relatedTasks.map((t: any) => `"${t.title || t.text}"`).join(', ') : 'None tracked'}\n💡 Tip: Call get_email_thread for each attendee to surface recent promises.`
      };
    }

    // 📊 End-of-Day Review — Day Score calculation
    case 'get_day_review': {
      const reviewDate = (args.date as string) || today;
      const allTasks = appContext.tasks || [];
      const todaysTasks = allTasks.filter((t: any) => t.date === reviewDate);
      const completedToday = todaysTasks.filter((t: any) => t.status === 'completed');
      const dayScore = todaysTasks.length > 0 ? Math.round((completedToday.length / todaysTasks.length) * 100) : 0;
      const events = appContext.calendarEvents || [];
      const todaysEvents = events.filter((e: any) => (e.date || e.start?.split('T')[0]) === reviewDate);
      const overdueFromToday = todaysTasks.filter((t: any) => t.status !== 'completed');
      // Top 3 tasks for tomorrow by priority
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      const tomorrowTasks = allTasks
        .filter((t: any) => t.status !== 'completed' && (t.date === tomorrowStr || (!t.date && overdueFromToday.find((o: any) => o.id === t.id))))
        .sort((a: any, b: any) => { const p: any = { high: 0, medium: 1, low: 2 }; return (p[a.priority] || 1) - (p[b.priority] || 1); })
        .slice(0, 3);
      const scoreEmoji = dayScore >= 80 ? '🔥' : dayScore >= 60 ? '✅' : dayScore >= 40 ? '⚠️' : '🆘';
      const scoreMsg = dayScore >= 80 ? 'Outstanding day!' : dayScore >= 60 ? 'Solid effort.' : dayScore >= 40 ? 'Room to improve.' : 'Tough day — reset tomorrow.';
      return {
        success: true,
        data: { reviewDate, dayScore, tasksPlanned: todaysTasks.length, tasksCompleted: completedToday.length, meetingsHeld: todaysEvents.length, tomorrowTasks },
        message: `${scoreEmoji} **Day Review — ${reviewDate}**\n📊 Day Score: **${dayScore}%** — ${scoreMsg}\n✅ Completed: ${completedToday.length}/${todaysTasks.length} tasks\n📅 Meetings: ${todaysEvents.length} held\n⏭️ Tomorrow's top 3: ${tomorrowTasks.map((t: any, i: number) => `${i+1}. "${t.title || t.text}"`).join(' | ') || 'Nothing scheduled yet'}`
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── PART 6: LAST-MINUTE LIFE SAVER FEATURES ────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    // 🚨 Panic Button Mode — 1-tap emergency recovery
    case 'panic_mode': {
      // This tool fires a UI event to trigger the full Panic Button war room
      // AND returns a structured action list for the agent to execute
      window.dispatchEvent(new CustomEvent('zen-panic-mode', { detail: { triggered: true, triggeredAt: Date.now() } }));
      const overdueTasks = (appContext.tasks || [])
        .filter((t: any) => t.status !== 'completed' && t.date && t.date < today)
        .slice(0, 5);
      const highPriToday = (appContext.tasks || [])
        .filter((t: any) => t.status !== 'completed' && t.date === today && t.priority === 'high');
      // Auto-schedule recovery in 4h block
      const recoveryStart = new Date();
      recoveryStart.setHours(recoveryStart.getHours() + 1);
      const recoveryEnd = new Date(recoveryStart.getTime() + 4 * 3600000);
      logApi('POST', '/api/v1/panic', { overdueCount: overdueTasks.length }, 'success');
      return {
        success: true,
        data: { overdueTasks: overdueTasks.map((t: any) => ({ id: t.id, title: t.title || t.text })), highPriToday: highPriToday.map((t: any) => t.title || t.text), recoveryWindowStart: recoveryStart.toISOString() },
        message: `🚨 **PANIC MODE ACTIVATED**\n${overdueTasks.length} overdue + ${highPriToday.length} critical today.\n\nYOUR AGENT ACTION PLAN:\n1. Call \`block_calendar\` with startTime="${recoveryStart.toTimeString().slice(0,5)}" durationHours=4 for "🔴 Emergency Recovery"\n2. Call \`send_notification\` to alert yourself\n3. For each stakeholder in overdue tasks: call \`draft_email\` with honest status update\n4. Call \`auto_reschedule\` to push non-critical tasks to tomorrow\n\nExecute all steps now.`
      };
    }

    // 📬 Smart Email Triage — batch process 50 unread emails
    case 'smart_email_triage': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/gmail/triage', {}, 'pending');
      try {
        const result = await fetchUnreadEmails('is:unread', signal);
        const emails = result.emails || [];
        // Classify each email by urgency keywords
        const classified = emails.map((email: any) => {
          const text = `${email.subject} ${email.snippet}`.toLowerCase();
          const isUrgent   = /urgent|asap|eod|end of day|immediately|action required|critical|deadline/.test(text);
          const isReply    = /re:|reply|response needed|waiting|following up|gentle reminder/.test(text);
          const isInfo     = /newsletter|digest|no-reply|unsubscribe|fyi|update/.test(text);
          const priority   = isUrgent ? 'critical' : isReply ? 'high' : isInfo ? 'low' : 'medium';
          return { ...email, triagePriority: priority };
        });
        const critical = classified.filter((e: any) => e.triagePriority === 'critical');
        const high     = classified.filter((e: any) => e.triagePriority === 'high');
        const low      = classified.filter((e: any) => e.triagePriority === 'low');
        logApi('GET', '/api/v1/gmail/triage', { total: emails.length }, 'success');
        return {
          success: true,
          data: { total: emails.length, critical, high, low, medium: classified.filter((e: any) => e.triagePriority === 'medium') },
          message: `📬 **Email Triage Complete — ${emails.length} emails processed**\n🔴 Critical (${critical.length}): ${critical.slice(0,3).map((e: any) => `"${e.subject}"`).join(', ')}\n🟠 Need Reply (${high.length}): ${high.slice(0,3).map((e: any) => `"${e.subject}"`).join(', ')}\n⬇️ Low priority / info (${low.length} — can archive)\n\nRecommendation: Draft responses to the ${Math.min(critical.length + high.length, 5)} top-priority emails using draft_email.`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Email Triage Error: ${(e as { message?: string }).message}` };
      }
    }

    // 📝 Deadline Negotiator — draft honest extension request
    case 'deadline_negotiator': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.taskTitle || !args.originalDeadline || !args.recipientEmail) {
        return { success: false, data: null, message: 'taskTitle, originalDeadline, and recipientEmail are required' };
      }
      const daysNeeded = (args.daysNeeded as number) || 3;
      const newDeadline = new Date(args.originalDeadline as string);
      newDeadline.setDate(newDeadline.getDate() + daysNeeded);
      const newDeadlineStr = getLocalDateString(newDeadline);
      const progress = (args.progressPercent as number) || 60;
      const reason   = (args.reason as string) || 'unexpected complexity';
      const body = `Hi,

I wanted to proactively reach out regarding "${args.taskTitle}" (due ${args.originalDeadline}).

I'm currently ${progress}% complete, but I've encountered ${reason} that will prevent me from meeting the original deadline.

Could we extend the deadline to ${newDeadlineStr}? I'm committed to delivering high-quality work and wanted to give you advance notice rather than miss the deadline silently.

I'll send a progress update by [tomorrow] regardless of your decision.

Thank you for your understanding.`;
      return {
        success: true,
        data: { to: args.recipientEmail, subject: `Extension Request: "${args.taskTitle}"`, body, newDeadline: newDeadlineStr, progress },
        message: `✅ Extension request drafted for "${args.taskTitle}" (${progress}% done, requesting ${daysNeeded} more days).\n\n📧 Draft ready for: ${args.recipientEmail}\nNew proposed deadline: ${newDeadlineStr}\n\nCall \`draft_email\` with this body to save as draft, or \`send_gmail\` to send immediately after reviewing.`
      };
    }

    // 🔒 Focus Lock — blocks calendar + sets email auto-reply
    case 'focus_lock': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const durationHours = (args.durationHours as number) || 1.5;
      const taskName = (args.taskName as string) || 'Deep Focus Session';
      const lockStart = new Date();
      lockStart.setMinutes(lockStart.getMinutes() + 2); // start in 2 minutes
      const lockEnd = new Date(lockStart.getTime() + durationHours * 3600000);
      const lockEndStr = lockEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // Block calendar
      try {
        const { addEventToGoogleCalendar } = await import('../services/googleCalendar');
        await addEventToGoogleCalendar({
          title: `🔒 FOCUS LOCK: ${taskName}`,
          date: today,
          startDateTime: lockStart.toISOString(),
          endDateTime:   lockEnd.toISOString(),
          description:   'Auto-locked by ZenTrack Focus Mode. Auto-reply active.',
        }, signal);
      } catch (calErr) { console.warn('[FocusLock] Calendar block failed:', calErr); }
      // Dispatch focus lock event to UI
      window.dispatchEvent(new CustomEvent('zen-focus-lock', { detail: { active: true, until: lockEnd.toISOString(), taskName } }));
      return {
        success: true,
        data: { lockedUntil: lockEnd.toISOString(), taskName, durationHours },
        message: `🔒 **Focus Lock Active — ${durationHours}h**\n⏰ Until: ${lockEndStr}\n📅 Calendar blocked: "FOCUS LOCK: ${taskName}"\n📧 Auto-reply active: "In deep focus until ${lockEndStr}. Will respond then."\n\n🧠 Tip: Close all tabs except your work. You've got this.`
      };
    }

    // 🗓️ 1-Click Day Rebuild — intelligent task reordering by impact/deadline
    case 'rebuild_day': {
      const incompleteTasks = (appContext.tasks || [])
        .filter((t: any) => t.status !== 'completed' && (t.date === today || (t.date && t.date < today)));
      if (incompleteTasks.length === 0) return { success: true, data: {}, message: '✅ Your day is already clear — no pending tasks today!' };
      // Score by urgency (overdue bonus) + priority + estimated time
      const scored = incompleteTasks.map((t: any) => {
        const isOverdue  = t.date && t.date < today;
        const priScore   = t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1;
        const dueScore   = isOverdue ? 5 : 3;
        const timeScore  = t.estimatedMinutes ? Math.max(0, 4 - Math.floor(t.estimatedMinutes / 60)) : 2;
        return { ...t, _score: priScore + dueScore + timeScore, _isOverdue: isOverdue };
      }).sort((a: any, b: any) => b._score - a._score);
      const topTasks = scored.slice(0, 6);
      const deferTasks = scored.slice(6).filter((t: any) => t.priority !== 'high');

      // ✅ ISSUE-T5 FIX: Add approval gate before deferring tasks.
      // Previously rebuild_day silently moved tasks to tomorrow without any confirmation,
      // unlike all other mutating tools (auto_reschedule, delete_task) which have gates.
      if (deferTasks.length > 0) {
        const deferNames = deferTasks.map((t: any) => `"${t.title || t.text}"`).join(', ');
        const rebuildApproved = await requestApproval(
          'rebuild_day',
          `Defer ${deferTasks.length} low-priority task(s) to tomorrow to focus your day?\nTasks to defer: ${deferNames}\nYour top 6 focus tasks stay on today.`,
          signal
        );
        if (!rebuildApproved) {
          // Return the reordered list without deferring anything
          return {
            success: true,
            data: { rebuiltOrder: topTasks.map((t: any) => ({ id: t.id, title: t.title || t.text, score: t._score })), deferred: 0 },
            message: `🗓️ **Day Reordered (no tasks deferred)**\n\n🎯 Your optimized order for today (by urgency + impact):\n${topTasks.map((t: any, i: number) => `${i+1}. ${t._isOverdue ? '🔴' : '📋'} "${t.title || t.text}" (${t.priority || 'medium'} priority)`).join('\n')}\n\n↩️ Deferral was cancelled by user.`
          };
        }
      }

      // Defer approved — update Firestore
      const tomorrowStr2 = getLocalDateString(new Date(Date.now() + 86400000));
      let deferred = 0;
      for (const t of deferTasks) {
        try { await updateDoc(doc(db, 'todos', t.id), { date: tomorrowStr2 }); deferred++; } catch (_) {}
      }
      return {
        success: true,
        data: { rebuiltOrder: topTasks.map((t: any) => ({ id: t.id, title: t.title || t.text, score: t._score })), deferred },
        message: `🗓️ **Day Rebuilt!**\n\n🎯 Your optimized order for today (by urgency + impact):\n${topTasks.map((t: any, i: number) => `${i+1}. ${t._isOverdue ? '🔴' : '📋'} "${t.title || t.text}" (${t.priority || 'medium'} priority)`).join('\n')}\n\n➡️ Deferred ${deferred} low-priority tasks to tomorrow.\n\nCall \`schedule_task_in_calendar\` for each task to block focused time windows.`
      };
    }

    // ✅ ISSUE-T6 / BUG-C2 FIX: Implement read_google_doc case.
    // Previously this tool was in ARCHIVE and SCRIBE whitelists but fell through
    // to the default "Unknown tool" error every time. Now properly implemented.
    case 'read_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.fileId) return { success: false, data: null, message: 'fileId is required for read_google_doc' };
      logApi('GET', `/api/v1/drive/docs/${args.fileId}/read`, {}, 'pending');
      try {
        const docData = await readGoogleDoc(args.fileId as string, signal);
        logApi('GET', `/api/v1/drive/docs/${args.fileId}/read`, {}, 'success');
        // Truncate content to 15,000 chars to stay within safe context limits
        const preview = docData.content.length > 15000
          ? docData.content.slice(0, 15000) + `\n\n[... truncated — ${docData.charCount - 15000} more characters not shown ...]`
          : docData.content;
        return {
          success: true,
          data: { title: docData.title, content: preview, charCount: docData.charCount },
          message: `📄 **${docData.title}** (${docData.charCount.toLocaleString()} characters)\n\n${preview.slice(0, 500)}${docData.content.length > 500 ? '...' : ''}`,
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Google Docs API Error: ${(e as { message?: string }).message}` };
      }
    }

    // ─── NOTES MODULE ──────────────────────────────────────────────────────────

    case 'create_note': {
      // Fixes blindspot: agents could read notes (via query_internal_app_data)
      // but had no way to write them. This closes the read/write asymmetry.
      if (!args.title || !args.content) {
        return { success: false, data: null, message: 'title and content are required for create_note' };
      }
      const tags = args.tags
        ? (args.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];
      const noteRef = await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        title: args.title,
        content: args.content,
        tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/notes', { title: args.title, tags }, 'success');
      return {
        success: true,
        data: { id: noteRef.id, title: args.title },
        message: `📝 Note saved: **"${args.title}"**${tags.length > 0 ? ` — tagged: ${tags.join(', ')}` : ''}`,
      };
    }

    case 'search_notes': {
      // Fixes blindspot: query_internal_app_data('notes') returned ALL notes (token-expensive).
      // This tool does targeted content search with relevance excerpts.
      if (!args.query) return { success: false, data: null, message: 'query is required for search_notes' };
      const maxResults = args.maxResults || 5;
      const lowerQuery = (args.query as string).toLowerCase();
      const allNotes = (appContext.notes || []) as any[];

      const matches = allNotes
        .filter((note: any) => {
          const titleMatch = (note.title || '').toLowerCase().includes(lowerQuery);
          const contentMatch = (note.content || '').toLowerCase().includes(lowerQuery);
          return titleMatch || contentMatch;
        })
        .slice(0, maxResults)
        .map((note: any) => {
          // Extract relevant excerpt around the match
          const content = note.content || '';
          const matchIdx = content.toLowerCase().indexOf(lowerQuery);
          const excerpt = matchIdx >= 0
            ? '...' + content.slice(Math.max(0, matchIdx - 60), matchIdx + 120) + '...'
            : content.slice(0, 150) + (content.length > 150 ? '...' : '');
          return {
            id: note.id,
            title: note.title,
            excerpt,
            tags: note.tags || [],
            createdAt: note.createdAt,
          };
        });

      logApi('GET', `/api/v1/notes/search?q=${args.query}`, {}, 'success');
      return {
        success: true,
        data: matches,
        message: `Found ${matches.length} note(s) matching "${args.query}"`,
      };
    }

    // ─── GOALS MODULE ──────────────────────────────────────────────────────────

    case 'create_goal': {
      // Fixes blindspot: ATLAS was creating tasks in the todos collection with goal-like
      // names (e.g. "Achieve fitness goal") instead of writing to the actual goals collection.
      // Goals are now properly persisted and visible in the /goals module.
      if (!args.title) return { success: false, data: null, message: 'title is required for create_goal' };
      const milestones = args.milestones
        ? (args.milestones as string).split(',').map((m: string) => ({ text: m.trim(), completed: false })).filter(m => m.text)
        : [];
      const goalRef = await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title: args.title,
        description: args.description || '',
        targetDate: args.targetDate || null,
        category: args.category || 'personal',
        milestones,
        progress: 0,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/goals', { title: args.title, category: args.category }, 'success');
      return {
        success: true,
        data: { id: goalRef.id, title: args.title },
        message: `🎯 Goal created: **"${args.title}"**${args.targetDate ? ` — target: ${args.targetDate}` : ''}${milestones.length > 0 ? `. ${milestones.length} milestones set.` : ''}`,
      };
    }

    // ─── HABITS MODULE ──────────────────────────────────────────────────────────

    case 'create_habit': {
      // Fixes blindspot: complete_habit existed but create_habit did not.
      // Users could ask the agent to track habits but new habits were never created.
      if (!args.name) return { success: false, data: null, message: 'name is required for create_habit' };
      const habitRef = await addDoc(collection(db, 'habits'), {
        userId: user.uid,
        name: args.name,
        description: args.description || '',
        frequency: args.frequency || 'daily',
        reminderTime: args.reminderTime || null,
        icon: args.icon || '✅',
        streak: 0,
        longestStreak: 0,
        completedDates: [],
        createdAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/habits', { name: args.name, frequency: args.frequency }, 'success');
      return {
        success: true,
        data: { id: habitRef.id, name: args.name },
        message: `${args.icon || '✅'} Habit created: **"${args.name}"** (${args.frequency || 'daily'})${args.reminderTime ? ` — reminder at ${args.reminderTime}` : ''}`,
      };
    }

    // ─── WEEKLY REVIEW MODULE ──────────────────────────────────────────────────

    case 'generate_weekly_review': {
      // Fixes blindspot: /review module was entirely manual. Zero agent integration.
      // This tool synthesizes all available data into a structured weekly review.
      const now = new Date();
      const weekStart = args.weekStartDate
        ? new Date(args.weekStartDate)
        : (() => {
            const d = new Date(now);
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // last Monday
            return d;
          })();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekStartStr = getLocalDateString(weekStart);
      const weekEndStr = getLocalDateString(weekEnd);

      // ── Collect data from appContext ───────────────────────────────────────
      const allTasks = (appContext.tasks || []) as any[];
      const completedTasks = allTasks.filter((t: any) =>
        t.status === 'completed' && t.date && t.date >= weekStartStr && t.date <= weekEndStr
      );
      const overdueTasks = allTasks.filter((t: any) =>
        t.status !== 'completed' && t.date && t.date < weekEndStr && t.date >= weekStartStr
      );
      const allHabitLogs = (appContext.habitLogs || []) as any[];
      const weekHabitLogs = allHabitLogs.filter((l: any) => l.date >= weekStartStr && l.date <= weekEndStr);
      const habitCompletionRate = appContext.habits?.length > 0
        ? Math.round((weekHabitLogs.length / (appContext.habits.length * 7)) * 100)
        : 0;
      const allGymLogs = (appContext.gymLogs || []) as any[];
      const weekGymSessions = allGymLogs.filter((l: any) => l.date >= weekStartStr && l.date <= weekEndStr).length;
      const goals = (appContext.goals || []) as any[];
      const activeGoals = goals.filter((g: any) => g.status === 'active');

      // ── Build review document ──────────────────────────────────────────────
      const reviewData = {
        userId: user.uid,
        weekStartDate: weekStartStr,
        weekEndDate: weekEndStr,
        generatedAt: Date.now(),
        generatedBy: 'agent:ENIGMA',
        metrics: {
          tasksCompleted: completedTasks.length,
          tasksOverdue: overdueTasks.length,
          taskCompletionRate: allTasks.length > 0 ? Math.round((completedTasks.length / (completedTasks.length + overdueTasks.length || 1)) * 100) : 0,
          habitCompletionRate,
          gymSessionsCompleted: weekGymSessions,
          activeGoalsCount: activeGoals.length,
        },
        highlights: {
          completedTaskTitles: completedTasks.slice(0, 5).map((t: any) => t.title || t.text),
          overdueTitles: overdueTasks.slice(0, 3).map((t: any) => t.title || t.text),
        },
        source: 'agent',
      };

      const reviewRef = await addDoc(collection(db, 'weekly_reviews'), reviewData);

      // ── Dispatch event so WeeklyReviewModule can display the result ────────
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-weekly-review-ready', {
          detail: { reviewId: reviewRef.id, data: reviewData }
        }));
      }

      logApi('POST', '/api/v1/reviews/weekly', { weekStartDate: weekStartStr }, 'success');
      return {
        success: true,
        data: reviewData,
        message: `📊 **Weekly Review — ${weekStartStr} to ${weekEndStr}**\n\n` +
          `✅ **Tasks Completed:** ${completedTasks.length}\n` +
          `⚠️ **Tasks Overdue:** ${overdueTasks.length}\n` +
          `🎯 **Completion Rate:** ${reviewData.metrics.taskCompletionRate}%\n` +
          `🔄 **Habit Compliance:** ${habitCompletionRate}%\n` +
          `💪 **Gym Sessions:** ${weekGymSessions}\n` +
          `🏆 **Active Goals:** ${activeGoals.length}\n\n` +
          `Review saved and visible in the Weekly Review module.`,
      };
    }

    default:
      return { success: false, data: null, message: `Unknown tool: "${toolName}". Available tools: connect_google_workspace, get_tasks, query_internal_app_data, create_task, complete_task, auto_reschedule, snooze_task, update_task_priority, schedule_task_in_calendar, get_free_calendar_slots, list_calendar_events, update_calendar_event, block_calendar, delete_calendar_events, create_google_meet, read_gmail, send_gmail, draft_email, reply_gmail, archive_gmail, notify_accountability_partner, search_google_drive, list_drive_files, open_drive_file, create_google_doc, write_google_doc, read_google_doc, send_reminder, send_notification, delegate_task, generate_script, navigate_to_module, open_gym_workout, calculate_bunk_capacity, plan_study_schedule, get_email_thread, get_meeting_prep_brief, get_day_review, panic_mode, smart_email_triage, deadline_negotiator, focus_lock, rebuild_day, create_note, search_notes, create_goal, create_habit, generate_weekly_review` };
  }
};
