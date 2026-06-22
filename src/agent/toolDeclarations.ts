export const TOOL_DECLARATIONS = [
  {
    name: 'get_tasks',
    description:
      'Get the user\'s incomplete tasks and deadlines from the database. Use this first whenever the user asks about scheduling, their workload, what to do, or anything related to their pending items.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filter: {
          type: 'STRING',
          description:
            'Optional filter: "overdue" (missed deadlines), "today" (due today), "high_priority" (high priority only), or "all" (everything incomplete). Default: "all".',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new task for the user. Use this when the user asks to add, log, or create a task, reminder, or to-do item.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The task description / title.' },
        priority: {
          type: 'STRING',
          description: '"high", "medium", or "low". Default: "medium".',
        },
        date: {
          type: 'STRING',
          description:
            'Due date in YYYY-MM-DD format. Use today\'s date if not specified.',
        },
        estimatedMinutes: {
          type: 'NUMBER',
          description: 'Optional: estimated time to complete in minutes.',
        },
      },
      required: ['text', 'priority', 'date'],
    },
  },
  {
    name: 'schedule_task_in_calendar',
    description:
      'Block dedicated focus time in the user\'s Google Calendar for a specific task. Use this after get_free_calendar_slots to find a suitable slot, then call this to actually block it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskName: {
          type: 'STRING',
          description: 'The task title to show in the calendar event.',
        },
        date: {
          type: 'STRING',
          description: 'Date to schedule in YYYY-MM-DD format.',
        },
        startTime: {
          type: 'STRING',
          description:
            'Start time in HH:MM 24-hour format (e.g., "14:00" for 2 PM).',
        },
        durationMinutes: {
          type: 'NUMBER',
          description:
            'How many minutes to block. Default 60 if not specified.',
        },
      },
      required: ['taskName', 'date', 'startTime', 'durationMinutes'],
    },
  },
  {
    name: 'get_free_calendar_slots',
    description:
      'Find free 1-hour time slots today or tomorrow that don\'t conflict with existing calendar events. Always call this before schedule_task_in_calendar to find valid times.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: {
          type: 'STRING',
          description:
            'Date to check in YYYY-MM-DD format. Defaults to today if not specified.',
        },
      },
      required: [],
    },
  },
  {
    name: 'send_reminder',
    description:
      'Schedule a push notification reminder for the user at a future time. Use this when the user asks to be reminded about something later.',
    parameters: {
      type: 'OBJECT',
      properties: {
        message: {
          type: 'STRING',
          description:
            'The reminder notification text. Keep it short and clear.',
        },
        delayMinutes: {
          type: 'NUMBER',
          description:
            'How many minutes from now to send the reminder. E.g., 60 for 1 hour from now.',
        },
      },
      required: ['message', 'delayMinutes'],
    },
  },
  {
    name: 'complete_task',
    description:
      'Mark an existing task as completed. Use this when the user says they finished, completed, or are done with a task.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskId: {
          type: 'STRING',
          description:
            'The task ID (from get_tasks results) to mark as complete.',
        },
        taskText: {
          type: 'STRING',
          description:
            'The task text, for confirmation in the response.',
        },
      },
      required: ['taskId'],
    },
  },
];
