/**
 * @file system.executor.ts
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
  setGmailVacationResponder,
  clearGmailVacationResponder,
} from '../../services/googleWorkspace';
import { requireGoogleAuth, requestApproval } from './shared';
import type { ToolResult } from './shared';
// BUG-004 FIX: isSignedInToGoogle and forceSilentRefresh were used in connect_google_workspace
// but never imported — caused ReferenceError on first invocation, breaking all Google auth flows.
import { isSignedInToGoogle, forceSilentRefresh } from '../../services/googleCalendar';


export const executeSystemTools = async (
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

case 'delete_internal_app_data': {
      if (!args.moduleName || !args.itemId) {
        return { success: false, data: null, message: 'moduleName and itemId are required.' };
      }
      const moduleToCollection: Record<string, string> = {
        tasks: 'todos',
        habits: 'habits',
        habitLogs: 'habit_logs',
        goals: 'goals',
        dailyLogs: 'daily_logs',
        learningTopics: 'learning_topics',
        gymLogs: 'gymLogs',
        notes: 'storage_nodes',
        pomodoroSessions: 'pomodoro_sessions',
        jobs: 'job_applications',
        assignments: 'assignments'
      };
      
      const collName = moduleToCollection[args.moduleName];
      if (!collName) {
        return { success: false, data: null, message: `Module '${args.moduleName}' is not valid or cannot be deleted.` };
      }
      
      const approved = await requestApproval('delete_internal_app_data', `Delete item from ${args.moduleName} permanently?`, signal);
      if (!approved) return { success: false, data: null, message: `🚫 Cancelled by user — item from ${args.moduleName} was NOT deleted.` };
      
      logApi('DELETE', `/api/v1/internal/${args.moduleName}/${args.itemId}`, {}, 'success');
      await deleteDoc(doc(db, collName, args.itemId));
      
      // Attempt to broadcast standard event for immediate UI updates
      if (args.moduleName === 'tasks') logWebSocket('task.deleted', { id: args.itemId });
      else logWebSocket('data.deleted', { module: args.moduleName, id: args.itemId });
      
      return { success: true, data: {}, message: `✅ Item successfully deleted from ${args.moduleName}` };
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

case 'panic_mode': {
      // This tool fires a UI event to trigger the full Panic Button war room
      // AND returns a structured action list for the agent to execute
      // BUG-008 FIX: window.dispatchEvent called without SSR/worker guard.
      // Every other dispatch in the codebase uses this guard. Added here for consistency.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zen-panic-mode', { detail: { triggered: true, triggeredAt: Date.now() } }));
      }
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
        const { addEventToGoogleCalendar } = await import('../../services/googleCalendar');
        await addEventToGoogleCalendar({
          title: `🔒 FOCUS LOCK: ${taskName}`,
          date: today,
          startDateTime: lockStart.toISOString(),
          endDateTime:   lockEnd.toISOString(),
          description:   'Auto-locked by ZenTrack Focus Mode. Auto-reply active.',
        }, signal);
      } catch (calErr) { console.warn('[FocusLock] Calendar block failed:', calErr); }

      // MISSING-009: Set REAL Gmail auto-reply via Gmail API.
      // Previously this only claimed auto-reply was active but never set it.
      // Now we call users.settings.updateVacationSettings to activate a real responder.
      let autoReplySet = false;
      try {
        await setGmailVacationResponder({
          enabled: true,
          responseSubject: `🔒 In Focus Mode until ${lockEndStr}`,
          responseBodyPlainText: `I'm in a deep focus session working on "${taskName}" and will be unavailable until ${lockEndStr}. I'll respond to your message as soon as my focus session ends.\n\n— Sent automatically by ZenTrack Focus Mode`,
          startTimeMs: lockStart.getTime(),
          endTimeMs: lockEnd.getTime(),
        }, signal);
        autoReplySet = true;

        // Schedule auto-clear when focus lock expires
        const clearDelayMs = lockEnd.getTime() - Date.now();
        if (clearDelayMs > 0) {
          setTimeout(async () => {
            try {
              await clearGmailVacationResponder();
              console.log('[FocusLock] Auto-reply cleared after focus lock expired.');
            } catch (e) { console.warn('[FocusLock] Failed to clear auto-reply:', e); }
          }, clearDelayMs);
        }
      } catch (autoReplyErr) {
        console.warn('[FocusLock] Auto-reply setup failed (calendar block still active):', autoReplyErr);
      }

      // Dispatch focus lock event to UI
      // BUG-008 FIX: window.dispatchEvent called without SSR/worker guard. Fixed.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zen-focus-lock', { detail: { active: true, until: lockEnd.toISOString(), taskName } }));
      }
      return {
        success: true,
        data: { lockedUntil: lockEnd.toISOString(), taskName, durationHours, autoReplySet },
        message: `🔒 **Focus Lock Active — ${durationHours}h**\n⏰ Until: ${lockEndStr}\n📅 Calendar blocked: "FOCUS LOCK: ${taskName}"\n📧 Auto-reply ${autoReplySet ? 'activated in Gmail' : 'could not be set — check Gmail permissions'}: "In deep focus until ${lockEndStr}. Will respond then."\n\n🧠 Tip: Close all tabs except your work. You've got this.`
      };
    }

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

      // MISSING-010: Actually schedule the top tasks in Google Calendar.
      // Previously rebuild_day just reordered tasks and suggested calling schedule_task_in_calendar.
      // If the agent didn't follow up, nothing was scheduled. Now we do it atomically here.
      let scheduledCount = 0;
      try {
        const { addEventToGoogleCalendar } = await import('../../services/googleCalendar');
        // Get today's existing calendar events to find free windows (listCalendarEventsOnDate is statically imported from googleWorkspace)
        const existingEvents: any[] = await listCalendarEventsOnDate(today, signal).catch(() => []);
        const busySlots = existingEvents.map((e: any) => ({
          start: new Date(e.start?.dateTime || e.start?.date || '').getTime(),
          end: new Date(e.end?.dateTime || e.end?.date || '').getTime(),
        })).filter(s => !isNaN(s.start) && !isNaN(s.end));

        // Build free windows from now until midnight
        const nowMs = Date.now();
        const midnightMs = new Date(today).setHours(23, 0, 0, 0);
        const SLOT_DURATION_MS = 60 * 60 * 1000; // 1 hour per task block
        const MIN_GAP_MS = 15 * 60 * 1000; // 15-min gap between blocks

        const isFree = (startMs: number, endMs: number): boolean =>
          busySlots.every(s => endMs <= s.start || startMs >= s.end);

        let cursor = Math.max(nowMs + 15 * 60 * 1000, new Date().setMinutes(0, 0, 0) + 60 * 60 * 1000); // round to next hour
        const slots: Array<{ start: Date; end: Date }> = [];

        while (cursor + SLOT_DURATION_MS <= midnightMs && slots.length < Math.min(topTasks.length, 4)) {
          if (isFree(cursor, cursor + SLOT_DURATION_MS)) {
            slots.push({ start: new Date(cursor), end: new Date(cursor + SLOT_DURATION_MS) });
            cursor += SLOT_DURATION_MS + MIN_GAP_MS;
          } else {
            cursor += 30 * 60 * 1000; // advance 30 min and try again
          }
          if (cursor > midnightMs) break;
        }

        // Schedule each top task in a found slot
        for (let s = 0; s < slots.length && s < topTasks.length; s++) {
          const t = topTasks[s];
          const slot = slots[s];
          try {
            await addEventToGoogleCalendar({
              title: `🎯 ${t.title || t.text}`,
              date: today,
              startDateTime: slot.start.toISOString(),
              endDateTime: slot.end.toISOString(),
              description: `Scheduled by ZenTrack rebuild_day. Priority: ${t.priority || 'medium'}`,
            }, signal);
            scheduledCount++;
          } catch (e) { console.warn('[RebuildDay] Failed to schedule task:', t.title, e); }
        }
      } catch (e) { console.warn('[RebuildDay] Calendar scheduling failed (non-blocking):', e); }

      const scheduleNote = scheduledCount > 0
        ? `\n📅 Scheduled ${scheduledCount} task block(s) in Google Calendar automatically.`
        : '';

      return {
        success: true,
        data: { rebuiltOrder: topTasks.map((t: any) => ({ id: t.id, title: t.title || t.text, score: t._score })), deferred, scheduledCount },
        message: `🗃️ **Day Rebuilt!**\n\n🎯 Your optimized order for today (by urgency + impact):\n${topTasks.map((t: any, i: number) => `${i+1}. ${t._isOverdue ? '🔴' : '📋'} "${t.title || t.text}" (${t.priority || 'medium'} priority)`).join('\n')}\n\n➡️ Deferred ${deferred} low-priority tasks to tomorrow.${scheduleNote}`
      };
    }

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

case 'execute_system_task': {
      // BUG-001 FIX: The original code unconditionally fetched http://localhost:8000/chat,
      // which always fails in Vercel production (no local server). Now:
      // - In production (import.meta.env.PROD): return a clear user-facing message unless
      //   VITE_JARVIS_URL is explicitly set to a reachable URL.
      // - In development: defaults to localhost:8000 unless VITE_JARVIS_URL overrides it.
      const jarvisUrl = (import.meta.env.VITE_JARVIS_URL as string | undefined)?.trim();
      if (!jarvisUrl && import.meta.env.PROD) {
        return {
          success: false,
          data: null,
          message: 'JARVIS local server is not available in this deployment. To enable system task execution, set the VITE_JARVIS_URL environment variable to your JARVIS server URL and redeploy.',
        };
      }
      const endpoint = jarvisUrl || 'http://localhost:8000';
      try {
        const response = await fetch(`${endpoint}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: args.prompt }] }),
        });
        if (!response.ok) throw new Error('JARVIS server returned ' + response.status);
        const result = await response.json();
        return {
          success: true,
          data: result,
          message: `JARVIS executed system task: "${args.prompt}". Response: ${result.reply || 'Success'}`,
        };
      } catch (err: any) {
        return {
          success: false,
          data: null,
          message: `Failed to contact JARVIS server at ${endpoint}. Ensure JARVIS is running. Error: ${err.message}`,
        };
      }
    }


    default:
      return null; // Tool not handled by this executor
  }
};
