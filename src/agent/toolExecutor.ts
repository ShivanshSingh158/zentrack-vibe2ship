import { addDoc, collection, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../services/googleCalendar';
import { sendPushNotification } from '../services/fcm';
import { getLocalDateString } from '../utils/dateUtils';

export type ToolResult = { success: boolean; data: any; message: string };

export const executeTool = async (
  toolName: string,
  args: Record<string, any>,
  userTodos: any[],
  calendarEvents: any[]
): Promise<ToolResult> => {
  const user = auth.currentUser;
  if (!user) return { success: false, data: null, message: 'Not authenticated' };
  const today = getLocalDateString(new Date());

  switch (toolName) {
    case 'get_tasks': {
      const filter = args.filter || 'all';
      let tasks = userTodos.filter(t => !t.isCompleted);
      if (filter === 'overdue') tasks = tasks.filter(t => t.date && t.date < today);
      if (filter === 'today') tasks = tasks.filter(t => t.date === today);
      if (filter === 'high_priority') tasks = tasks.filter(t => t.priority === 'high');
      return {
        success: true,
        data: tasks.map(t => ({ 
          id: t.id, text: t.text, priority: t.priority, 
          date: t.date, estimatedMinutes: t.estimatedMinutes 
        })),
        message: `Found ${tasks.length} tasks`
      };
    }

    case 'create_task': {
      const ref = await addDoc(collection(db, 'todos'), {
        userId: user.uid,
        text: args.text,
        priority: args.priority || 'medium',
        date: args.date || today,
        isCompleted: false,
        estimatedMinutes: args.estimatedMinutes || null,
        createdAt: Date.now(),
        subtasks: [],
        order: Date.now()
      });
      return { success: true, data: { id: ref.id }, message: `Created: "${args.text}"` };
    }

    case 'schedule_task_in_calendar': {
      const [h, m] = (args.startTime || '09:00').split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(h, m, 0, 0);
      const endDate = new Date(startDate.getTime() + (args.durationMinutes || 60) * 60000);
      try {
        await addEventToGoogleCalendar({
          title: `🎯 ${args.taskName}`,
          date: startDate.toISOString().split('T')[0],
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          description: 'Auto-scheduled by Zen AI Agent'
        });
        return { success: true, data: {}, message: `Blocked ${args.startTime}–${args.durationMinutes}min for "${args.taskName}"` };
      } catch (err: any) {
        return { success: false, data: null, message: `Calendar API Error: ${err.message}` };
      }
    }

    case 'get_free_calendar_slots': {
      const slots: string[] = [];
      for (let hour = 8; hour < 22; hour++) {
        const hasConflict = calendarEvents.some(e => {
          if (!e.startTime) return false;
          return parseInt(e.startTime.split(':')[0]) === hour;
        });
        if (!hasConflict) slots.push(`${String(hour).padStart(2,'0')}:00`);
      }
      return { success: true, data: { freeSlots: slots.slice(0, 8) }, message: `Found ${slots.length} free slots` };
    }

    case 'send_reminder': {
      setTimeout(async () => {
        try {
          await sendPushNotification({
            userIds: [user.uid],
            title: 'Zen AI Reminder 🧠',
            body: args.message
          });
      } catch {
          console.warn("Could not send push notification:", e);
        }
      }, (args.delayMinutes || 5) * 60 * 1000);
      return { success: true, data: {}, message: `Reminder set for ${args.delayMinutes}min from now` };
    }

    case 'complete_task': {
      await updateDoc(doc(db, 'todos', args.taskId), { isCompleted: true });
      return { success: true, data: {}, message: `Task marked complete` };
    }

    case 'send_notification': {
      try {
        await sendPushNotification({
          userIds: [user.uid],
          title: args.title,
          body: args.message
        });
        return { success: true, data: {}, message: `Notification sent: "${args.title}"` };
      } catch {
        return { success: false, data: null, message: `Failed to send notification` };
      }
    }

    case 'auto_reschedule': {
      let rescheduledCount = 0;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      
      for (const t of userTodos) {
        if (!t.isCompleted && t.date === today && t.priority !== 'high') {
          await updateDoc(doc(db, 'todos', t.id), { date: tomorrowStr });
          rescheduledCount++;
        }
      }
      return { success: true, data: { rescheduledCount, reason: args.reason }, message: `Rescheduled ${rescheduledCount} low-priority tasks to tomorrow` };
    }

    case 'block_calendar': {
      const startDate = new Date();
      // start 15 mins from now
      startDate.setMinutes(startDate.getMinutes() + 15);
      const endDate = new Date(startDate.getTime() + (args.durationHours || 2) * 3600000);
      try {
        await addEventToGoogleCalendar({
          title: `🚨 DEEP WORK: ${args.taskName}`,
          date: startDate.toISOString().split('T')[0],
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          description: 'Auto-blocked by Zen AI Emergency Protocol'
        });
        return { success: true, data: {}, message: `Blocked ${args.durationHours}h for "${args.taskName}" starting at ${startDate.toLocaleTimeString()}` };
      } catch (err: any) {
        return { success: false, data: null, message: `Calendar API Error: ${err.message}` };
      }
    }

    case 'delete_calendar_events': {
      let deletedCount = 0;
      try {
        for (const ev of calendarEvents) {
          if (ev.id && ev.start && ev.start.dateTime) {
            const evDate = new Date(ev.start.dateTime).toISOString().split('T')[0];
            if (evDate === today) {
              await deleteGoogleCalendarEvent(ev.id);
              deletedCount++;
            }
          }
        }
        return { success: true, data: { deletedCount }, message: `Cleared ${deletedCount} events from today's schedule.` };
      } catch (err: any) {
        return { success: false, data: null, message: `Calendar API Error: ${err.message}` };
      }
    }

    default:
      return { success: false, data: null, message: `Unknown tool: ${toolName}` };
  }
};
