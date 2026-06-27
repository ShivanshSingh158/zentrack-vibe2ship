import { addDoc, collection, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent, signInWithGoogle, isSignedInToGoogle } from '../services/googleCalendar';
import { sendPushNotification } from '../services/fcm';
import { getLocalDateString } from '../utils/dateUtils';
import { logApi, logWebSocket } from '../utils/networkLogger';
import {
  fetchUnreadEmails,
  sendEmail,
  replyToEmail,
  archiveEmail,
  trashEmail,
  createGoogleDoc,
  writeToGoogleDoc,
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

const requireGoogleAuth = async (signal?: AbortSignal): Promise<ToolResult | null> => {
  if (!isSignedInToGoogle()) {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem('zen_gcal_refresh_token')) {
        console.log('[ToolExecutor] Token expired mid-flight. Attempting silent auto-refresh...');
        await signInWithGoogle();
        if (isSignedInToGoogle()) {
          console.log('[ToolExecutor] Silent auto-refresh successful! Resuming tool execution.');
          return null;
        }
      }
    } catch (e) {
      console.warn('[ToolExecutor] Mid-flight silent auto-refresh failed:', e);
    }

    return {
      success: false,
      data: null,
      message: 'Google Workspace is not connected. Call connect_google_workspace first to authenticate.'
    };
  }
  return null;
};

// ── Human-in-the-Loop Approval Gate ──────────────────────────────────────────
// Fires a CustomEvent to the UI to request approval before destructive actions.
// The UI renders an approval card; the user's click resolves this promise.
export const requestApproval = (toolName: string, summary: string, signal?: AbortSignal): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(true); // SSR: always approve
  return new Promise((resolve) => {
    const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cleanup = () => window.removeEventListener(id, handler as EventListener);
    const handler = (e: Event) => {
      cleanup();
      resolve((e as CustomEvent).detail?.approved === true);
    };
    window.addEventListener(id, handler as EventListener, { once: true });
    window.dispatchEvent(new CustomEvent('zen-approval-request', {
      detail: { id, toolName, summary }
    }));
    // Auto-reject after 120s so agents don't hang forever
    const timer = setTimeout(() => { cleanup(); resolve(false); }, 120_000);
    signal?.addEventListener('abort', () => { clearTimeout(timer); cleanup(); resolve(false); }, { once: true });
  });
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
      logApi('POST', '/api/v1/google/oauth/connect', {}, 'pending');
      if (isSignedInToGoogle()) {
        logApi('POST', '/api/v1/google/oauth/connect', {}, 'success');
        return { success: true, data: {}, message: 'Google Workspace is already fully connected! Gmail, Calendar, Drive, Docs, Sheets, and Google Meet are all active.' };
      }
      try {
        await signInWithGoogle();
        logApi('POST', '/api/v1/google/oauth/connect', {}, 'success');
        return { success: true, data: {}, message: 'Successfully connected to Google Workspace! Gmail, Calendar, Drive, Docs, and Meet are now active.' };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Failed to connect Google Workspace: ${(err as { message?: string }).message}` };
      }
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
      if (filter === 'today') tasks = tasks.filter((t: any) => t.date === today);
      if (filter === 'high_priority') tasks = tasks.filter((t: any) => t.priority === 'high');
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
      const ref = await addDoc(collection(db, 'todos'), {
        userId: user.uid,
        title: args.title,  // Matches TodoListModule field name
        text: args.title,   // Legacy field for backward compat with old data
        priority: args.priority || 'medium',
        date: args.date || today,
        status: 'pending',
        estimatedMinutes: args.estimatedMinutes || null,
        createdAt: Date.now(),
        subtasks: [],
        order: Date.now()
      });
      logApi('POST', '/api/v1/tasks', args, 'success');
      logWebSocket('task.created', { id: ref.id, title: args.title });
      return { success: true, data: { id: ref.id }, message: `✅ Created task: "${args.title}"` };
    }

    case 'complete_task': {
      logApi('POST', `/api/v1/tasks/${args.taskId}/complete`, {}, 'success');
      logWebSocket('task.updated', { id: args.taskId, status: 'completed' });
      await updateDoc(doc(db, 'todos', args.taskId), { status: 'completed' });
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
      logApi('DELETE', `/api/v1/drive/files/${args.fileId}/trash`, {}, 'success');
      try {
        await trashDriveFile(args.fileId, signal);
        return { success: true, data: {}, message: `✅ Drive file successfully moved to trash` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to trash file: ${e.message}` };
      }
    }

    case 'auto_reschedule': {
      let rescheduledCount = 0;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);

      for (const t of appContext.tasks) {
        if (t.status !== 'completed' && t.date === today && t.priority !== 'high') {
          await updateDoc(doc(db, 'todos', t.id), { date: tomorrowStr });
          rescheduledCount++;
        }
      }
      logApi('POST', '/api/v1/tasks/snooze', { reason: args.reason }, 'success');
      return { success: true, data: { rescheduledCount, reason: args.reason }, message: `Rescheduled ${rescheduledCount} low-priority tasks to tomorrow. Reason: ${args.reason}` };
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
      const startDate = new Date();
      startDate.setMinutes(startDate.getMinutes() + 15);
      const endDate = new Date(startDate.getTime() + (args.durationHours || 2) * 3600000);
      try {
        await addEventToGoogleCalendar({
          title: `🚨 DEEP WORK: ${args.taskName}`,
          date: startDate.toISOString().split('T')[0],
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          description: 'Auto-blocked by Zen AI Emergency Protocol'
        }, signal);
        return { success: true, data: {}, message: `✅ Blocked ${args.durationHours}h for "${args.taskName}" starting at ${startDate.toLocaleTimeString()}` };
      } catch (err: unknown) {
        return { success: false, data: null, message: `Calendar API Error: ${(err as { message?: string }).message}` };
      }
    }

    case 'delete_calendar_events': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      let deletedCount = 0;
      const targetDate = args.date || today;
      try {
        const liveEvents = await listCalendarEventsOnDate(targetDate, signal);
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
      const sendApproved = await requestApproval('send_gmail', `Send email to ${args.to} — Subject: "${args.subject}"?`, signal);
      if (!sendApproved) return { success: false, data: null, message: '🚫 Cancelled by user — email was NOT sent.' };
      logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'pending');
      try {
        await sendEmail(args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'success');
        return { success: true, data: {}, message: `✅ Email sent successfully to ${args.to}` };
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
        const result = await writeToGoogleDoc(args.docId, args.content);
        return { success: true, data: result, message: `✅ Content written to Google Doc. View: ${result.url}` };
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

        return { success: true, data: {}, message: `✅ Notification sent: "${args.title}"` };
      } catch {
        return { success: false, data: null, message: 'Failed to send notification' };
      }
    }

    // ─── AGENT SYSTEM ────────────────────────────────────────────────────────────

    case 'snooze_task': {
      // Used by ARGUS agent to adaptively snooze at-risk tasks
      if (!args.taskId) return { success: false, data: null, message: 'taskId is required for snooze_task' };
      const snoozeDate = args.snoozeUntilDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return getLocalDateString(d);
      })();
      await updateDoc(doc(db, 'todos', args.taskId), {
        date: snoozeDate,
        snoozeCount: (args.currentSnoozeCount || 0) + 1,
        lastSnoozedAt: Date.now()
      });
      logApi('POST', `/api/v1/tasks/${args.taskId}/snooze`, { snoozeDate }, 'success');
      return { success: true, data: { taskId: args.taskId, newDate: snoozeDate }, message: `✅ Task snoozed until ${snoozeDate}. Snooze #${(args.currentSnoozeCount || 0) + 1}.` };
    }

    case 'update_task_priority': {
      // Used by ARGUS/ENIGMA agents to escalate task priority based on risk
      if (!args.taskId || !args.priority) return { success: false, data: null, message: 'taskId and priority are required' };
      await updateDoc(doc(db, 'todos', args.taskId), { priority: args.priority });
      logApi('PATCH', `/api/v1/tasks/${args.taskId}`, { priority: args.priority }, 'success');
      return { success: true, data: { taskId: args.taskId, priority: args.priority }, message: `✅ Task priority updated to ${args.priority}` };
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
        const instructionWithDepth = `${args.instruction}`;
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

    case 'generate_script': {
      logApi('POST', '/api/v1/agent/script', { language: args.language }, 'success');
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: {
          type: 'script',
          title: `Generated ${args.language} Script: ${args.explanation}`,
          code: args.code
        }
      }));
      return { success: true, data: { status: 'presented_to_user' }, message: 'Script presented to user. Awaiting their review and execution.' };
    }

    // ─── IN-APP NAVIGATION ────────────────────────────────────────────────────
    case 'navigate_to_module': {
      const route = args.route as string;
      if (!route) return { success: false, data: null, message: 'route is required for navigate_to_module' };

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

    default:
      return { success: false, data: null, message: `Unknown tool: "${toolName}". Available tools: connect_google_workspace, get_tasks, query_internal_app_data, create_task, complete_task, auto_reschedule, snooze_task, update_task_priority, schedule_task_in_calendar, get_free_calendar_slots, list_calendar_events, update_calendar_event, block_calendar, delete_calendar_events, create_google_meet, read_gmail, send_gmail, draft_email, reply_gmail, archive_gmail, notify_accountability_partner, search_google_drive, list_drive_files, open_drive_file, create_google_doc, write_google_doc, send_reminder, send_notification, delegate_task, generate_script, navigate_to_module, open_gym_workout` };
  }
};
