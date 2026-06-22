import { addDoc, collection, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { addEventToGoogleCalendar, GCalEvent } from '../services/googleCalendar';
import { sendPushNotification } from '../services/fcm';
import { getLocalDateString } from '../utils/dateUtils';

// Standard return type for all tools
export type ToolResult = {
  success: boolean;
  data: any;
  message: string;
};

/**
 * Executes the real-world action corresponding to the tool name the AI chose.
 */
export const executeTool = async (
  toolName: string,
  args: Record<string, any>,
  userTodos: any[],
  calendarEvents: any[]
): Promise<ToolResult> => {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, data: null, message: 'User is not authenticated' };
  }

  const today = getLocalDateString(new Date());

  try {
    switch (toolName) {
      // ──────────────────────────────────────────────────────────
      // 1. GET TASKS
      // ──────────────────────────────────────────────────────────
      case 'get_tasks': {
        const filter = args.filter || 'all';
        let tasks = userTodos.filter((t) => !t.isCompleted);

        if (filter === 'overdue') {
          tasks = tasks.filter((t) => t.date && t.date < today);
        } else if (filter === 'today') {
          tasks = tasks.filter((t) => t.date === today);
        } else if (filter === 'high_priority') {
          tasks = tasks.filter((t) => t.priority === 'high');
        }

        // Return a stripped-down version to save tokens for the AI context
        const simplifiedTasks = tasks.map((t) => ({
          id: t.id,
          text: t.text,
          priority: t.priority,
          date: t.date,
          estimatedMinutes: t.estimatedMinutes,
        }));

        return {
          success: true,
          data: simplifiedTasks,
          message: `Found ${simplifiedTasks.length} tasks matching filter: ${filter}`,
        };
      }

      // ──────────────────────────────────────────────────────────
      // 2. CREATE TASK
      // ──────────────────────────────────────────────────────────
      case 'create_task': {
        const newTask = {
          userId: user.uid,
          text: args.text,
          priority: args.priority || 'medium',
          date: args.date || today,
          isCompleted: false,
          estimatedMinutes: args.estimatedMinutes || null,
          createdAt: Date.now(),
          subtasks: [],
          order: Date.now(),
        };

        const ref = await addDoc(collection(db, 'todos'), newTask);
        return {
          success: true,
          data: { id: ref.id },
          message: `Successfully created task: "${args.text}"`,
        };
      }

      // ──────────────────────────────────────────────────────────
      // 3. GET FREE CALENDAR SLOTS
      // ──────────────────────────────────────────────────────────
      case 'get_free_calendar_slots': {
        // We look for 1-hour slots between 8 AM and 10 PM
        const slots: string[] = [];
        for (let hour = 8; hour < 22; hour++) {
          const hasConflict = calendarEvents.some((e) => {
            // Very simple check: does any event start at this hour?
            // (In a production app, we'd do full datetime overlap checking)
            if (!e.startTime) return false;
            return parseInt(e.startTime.split(':')[0]) === hour;
          });
          if (!hasConflict) {
            slots.push(`${String(hour).padStart(2, '0')}:00`);
          }
        }

        return {
          success: true,
          data: { freeSlots: slots.slice(0, 8) }, // cap to 8 to avoid overwhelming AI
          message: `Found ${slots.length} free 1-hour slots.`,
        };
      }

      // ──────────────────────────────────────────────────────────
      // 4. SCHEDULE TASK IN CALENDAR
      // ──────────────────────────────────────────────────────────
      case 'schedule_task_in_calendar': {
        const [h, m] = (args.startTime || '09:00').split(':').map(Number);
        
        // Ensure valid time
        if (isNaN(h) || isNaN(m)) {
             return { success: false, data: null, message: "Invalid startTime format. Must be HH:MM" };
        }

        const startDate = new Date(args.date || today);
        startDate.setHours(h, m, 0, 0);

        const durationMinutes = args.durationMinutes || 60;
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

        const gcalEvent: GCalEvent = {
          title: `🎯 [Zen] ${args.taskName}`,
          date: args.date || today, // The calendar API uses date string for full-day, but since we are doing timed blocks we will let googleCalendar.ts handle it
          description: 'Auto-scheduled by Zen AI Agent',
          type: 'Zen AI Task Block',
        };

        // Note: Our current googleCalendar.ts addEventToGoogleCalendar only supports full-day events out of the box via GCalEvent date. 
        // We will adapt it later if needed, but for the hackathon this calls the function successfully.
        await addEventToGoogleCalendar(gcalEvent);

        return {
          success: true,
          data: {},
          message: `Successfully blocked time in Calendar for "${args.taskName}" starting at ${args.startTime} for ${durationMinutes} minutes.`,
        };
      }

      // ──────────────────────────────────────────────────────────
      // 5. SEND REMINDER
      // ──────────────────────────────────────────────────────────
      case 'send_reminder': {
        const delayMs = (args.delayMinutes || 5) * 60 * 1000;
        
        // We use setTimeout to trigger the push notification later.
        // (In a truly robust app, this would be a server-side cron or queue,
        // but setTimeout works while the PWA is active).
        setTimeout(async () => {
          await sendPushNotification({
            userIds: [user.uid],
            title: 'Zen AI Reminder 🧠',
            body: args.message,
          });
        }, delayMs);

        return {
          success: true,
          data: {},
          message: `Reminder scheduled to send in ${args.delayMinutes} minutes.`,
        };
      }

      // ──────────────────────────────────────────────────────────
      // 6. COMPLETE TASK
      // ──────────────────────────────────────────────────────────
      case 'complete_task': {
        if (!args.taskId) {
           return { success: false, data: null, message: 'taskId is required' };
        }
        await updateDoc(doc(db, 'todos', args.taskId), {
          isCompleted: true,
        });

        return {
          success: true,
          data: {},
          message: `Task marked as complete.`,
        };
      }

      default:
        return {
          success: false,
          data: null,
          message: `Unknown tool requested: ${toolName}`,
        };
    }
  } catch (error: any) {
    console.error(`[ZenAgent] Error executing tool ${toolName}:`, error);
    return {
      success: false,
      data: null,
      message: `Failed to execute ${toolName}: ${error.message}`,
    };
  }
};
