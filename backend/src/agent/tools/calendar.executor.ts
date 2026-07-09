/**
 * @file calendar.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from '../../services/firebase';
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


export const executeCalendarTools = async (
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
        const now = new Date();
        const isToday = targetDate === today;

        for (let hour = 8; hour < 22; hour++) {
          // If scheduling for today, skip hours that are already in the past or currently happening
          if (isToday && hour <= now.getHours()) continue;

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

    default:
      return null; // Tool not handled by this executor
  }
};
