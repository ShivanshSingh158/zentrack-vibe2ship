import { SchemaType } from '@google/generative-ai';
import type { FunctionDeclaration } from '@google/generative-ai';

// Define every tool the AI can call — JSON Schema format
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_tasks',
    description: 'Get the user incomplete tasks and deadlines.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filter: { 
          type: SchemaType.STRING, 
          description: 'Optional: "overdue", "today", "high_priority", or "all"' 
        }
      },
      required: []
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task for the user.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        text: { type: SchemaType.STRING, description: 'The task description' },
        priority: { type: SchemaType.STRING, description: '"high", "medium", or "low"' },
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format' },
        estimatedMinutes: { type: SchemaType.NUMBER, description: 'How long the task will take' }
      },
      required: ['text', 'priority', 'date']
    }
  },
  {
    name: 'schedule_task_in_calendar',
    description: 'Block time in Google Calendar for a task.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskName: { type: SchemaType.STRING, description: 'The task title' },
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format' },
        startTime: { type: SchemaType.STRING, description: 'Start time HH:MM 24hr format' },
        durationMinutes: { type: SchemaType.NUMBER, description: 'Minutes to block' }
      },
      required: ['taskName', 'date', 'startTime', 'durationMinutes']
    }
  },
  {
    name: 'get_free_calendar_slots',
    description: 'Get free 1-hour time slots today avoiding existing calendar events.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD. Default today.' }
      },
      required: []
    }
  },
  {
    name: 'send_reminder',
    description: 'Send a push notification reminder at a specific delay.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: { type: SchemaType.STRING, description: 'The reminder message' },
        delayMinutes: { type: SchemaType.NUMBER, description: 'Minutes from now to send' }
      },
      required: ['message', 'delayMinutes']
    }
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to mark complete' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'send_notification',
    description: 'Send a push notification or toast message to the user instantly.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Notification title' },
        message: { type: SchemaType.STRING, description: 'Notification body' },
      },
      required: ['title', 'message'],
    },
  },
  {
    name: 'auto_reschedule',
    description: 'Automatically reschedules all non-critical or low-priority tasks from today to tomorrow to make room for an emergency.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: { type: SchemaType.STRING, description: 'The reason for rescheduling, which will be logged to the user.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'block_calendar',
    description: 'Blocks a chunk of time on the user\'s calendar today for deep work on a critical task.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskName: { type: SchemaType.STRING, description: 'Name of the critical task to block time for.' },
        durationHours: { type: SchemaType.NUMBER, description: 'Number of hours to block (e.g., 2).' },
      },
      required: ['taskName', 'durationHours'],
    },
  },
  {
    name: 'delete_calendar_events',
    description: 'Deletes all existing calendar events today to clear the user\'s schedule.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: { type: SchemaType.STRING, description: 'Reason for clearing the schedule' },
      },
      required: ['reason'],
    },
  }
];
