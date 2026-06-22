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
  }
];
