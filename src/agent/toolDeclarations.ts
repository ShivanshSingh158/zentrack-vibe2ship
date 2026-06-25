import { SchemaType } from '@google/generative-ai';
import type { FunctionDeclaration } from '@google/generative-ai';

// Define every tool the AI can call — JSON Schema format
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  // ─── GOOGLE WORKSPACE CONNECTION ───────────────────────────────────────────
  {
    name: 'connect_google_workspace',
    description: 'Triggers the Google OAuth sign-in flow to connect the user\'s Gmail, Calendar, Drive, Docs, and Google Meet. Use this when the user asks to connect or sign in to Google, or when any Google Workspace tool returns an auth error.',
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
  },

  // ─── TASKS (ZENTRACK) ───────────────────────────────────────────────────────
  {
    name: 'get_tasks',
    description: 'Get the user\'s tasks and deadlines from ZenTrack. Returns id, title, priority, date, and status for each task.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filter: { type: SchemaType.STRING, description: 'Optional: "overdue", "today", "high_priority", or "all"' }
      },
      required: []
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task in ZenTrack for the user.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'The task description' },
        priority: { type: SchemaType.STRING, description: '"high", "medium", or "low"' },
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format' },
        estimatedMinutes: { type: SchemaType.NUMBER, description: 'How long the task will take in minutes' }
      },
      required: ['title', 'priority', 'date']
    }
  },
  {
    name: 'complete_task',
    description: 'Mark a ZenTrack task as completed.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to mark complete' }
      },
      required: ['taskId']
    }
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
    name: 'snooze_task',
    description: 'Snooze a specific task to a later date. Used by MONITOR agent when a task cannot be completed today. Increments snooze counter.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to snooze' },
        snoozeUntilDate: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format to snooze until. Defaults to tomorrow.' },
        currentSnoozeCount: { type: SchemaType.NUMBER, description: 'Current snooze count for this task (from get_tasks result). Used to increment the counter.' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'update_task_priority',
    description: 'Update the priority of a task. Used by MONITOR/DATA agents to escalate priority when risk is detected.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to update' },
        priority: { type: SchemaType.STRING, description: '"high", "medium", or "low"' }
      },
      required: ['taskId', 'priority']
    }
  },

  // ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────
  {
    name: 'schedule_task_in_calendar',
    description: 'Block time in Google Calendar for a specific task. Use this to protect time for deep work.',
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
    description: 'Get free 1-hour time slots on a given date, avoiding existing calendar events. Always call this BEFORE scheduling.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD. Defaults to today.' }
      },
      required: []
    }
  },
  {
    name: 'list_calendar_events',
    description: 'List all Google Calendar events for a specific date. Use this to see what\'s already scheduled.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format. Defaults to today.' }
      },
      required: []
    }
  },
  {
    name: 'update_calendar_event',
    description: 'Update/edit an existing Google Calendar event. Can change title, time, location, description, or add attendees.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        eventId: { type: SchemaType.STRING, description: 'The Google Calendar event ID (from list_calendar_events)' },
        title: { type: SchemaType.STRING, description: 'New title for the event (optional)' },
        startDateTime: { type: SchemaType.STRING, description: 'New start time in ISO 8601 format (optional)' },
        endDateTime: { type: SchemaType.STRING, description: 'New end time in ISO 8601 format (optional)' },
        description: { type: SchemaType.STRING, description: 'New description for the event (optional)' },
        location: { type: SchemaType.STRING, description: 'New location for the event (optional)' },
        attendees: { type: SchemaType.STRING, description: 'Comma-separated list of email addresses to invite (optional)' }
      },
      required: ['eventId']
    }
  },
  {
    name: 'block_calendar',
    description: 'Blocks a chunk of time on the user\'s calendar TODAY for deep work on a critical task. Use in emergency mode.',
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
    description: 'Deletes all existing Google Calendar events on a given date to clear the schedule.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: { type: SchemaType.STRING, description: 'Reason for clearing the schedule' },
        date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD. Defaults to today.' }
      },
      required: ['reason'],
    },
  },

  // ─── GOOGLE MEET ─────────────────────────────────────────────────────────────
  {
    name: 'create_google_meet',
    description: 'Create a Google Meet video conference meeting. This creates a Google Calendar event with a real Google Meet video link. Can optionally invite attendees. If the meeting is starting now or soon, the link will open automatically.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Title of the meeting' },
        startDateTime: { type: SchemaType.STRING, description: 'Start time in ISO 8601 format (e.g., 2025-01-15T14:00:00)' },
        durationMinutes: { type: SchemaType.NUMBER, description: 'Duration of meeting in minutes (default: 60)' },
        description: { type: SchemaType.STRING, description: 'Meeting description or agenda (optional)' },
        attendees: { type: SchemaType.STRING, description: 'Comma-separated list of email addresses to invite (optional)' }
      },
      required: ['title', 'startDateTime']
    }
  },

  {
    name: 'schedule_google_meet',
    description: 'Alias for create_google_meet. Create a Google Meet video conference meeting.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Title of the meeting' },
        startDateTime: { type: SchemaType.STRING, description: 'Start time in ISO 8601 format' },
        durationMinutes: { type: SchemaType.NUMBER, description: 'Duration of meeting in minutes (default: 60)' },
        description: { type: SchemaType.STRING, description: 'Meeting description or agenda (optional)' },
        attendees: { type: SchemaType.STRING, description: 'Comma-separated list of email addresses to invite (optional)' }
      },
      required: ['title', 'startDateTime']
    }
  },

  // ─── GMAIL ───────────────────────────────────────────────────────────────────
  {
    name: 'read_gmail',
    description: 'Read emails from Gmail. Can search by any Gmail query (unread, sender, subject, date, etc.).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Gmail search query (e.g. "is:unread", "from:boss@company.com", "subject:invoice")' },
      },
      required: [],
    },
  },
  {
    name: 'send_gmail',
    description: 'Send a new email via Gmail.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: { type: SchemaType.STRING, description: 'Recipient email address' },
        subject: { type: SchemaType.STRING, description: 'Email subject' },
        bodyText: { type: SchemaType.STRING, description: 'Plain text email body' },
      },
      required: ['to', 'subject', 'bodyText'],
    },
  },
  {
    name: 'draft_email',
    description: 'Create a new DRAFT email via Gmail without sending it.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: { type: SchemaType.STRING, description: 'Recipient email address' },
        subject: { type: SchemaType.STRING, description: 'Email subject' },
        bodyText: { type: SchemaType.STRING, description: 'Plain text email body' },
      },
      required: ['to', 'subject', 'bodyText'],
    },
  },
  {
    name: 'notify_accountability_partner',
    description: 'Send an urgent email notification to the user\'s accountability partner about a missed deadline or high risk task.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        partnerEmail: { type: SchemaType.STRING, description: 'Email address of the accountability partner' },
        message: { type: SchemaType.STRING, description: 'The urgent message to send' },
      },
      required: ['partnerEmail', 'message'],
    },
  },
  {
    name: 'reply_gmail',
    description: 'Reply to an existing Gmail thread by thread ID. Always use this instead of send_gmail when responding to an existing email.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        threadId: { type: SchemaType.STRING, description: 'The Gmail thread ID (from read_gmail result)' },
        to: { type: SchemaType.STRING, description: 'The email address to reply to' },
        subject: { type: SchemaType.STRING, description: 'The original subject line' },
        bodyText: { type: SchemaType.STRING, description: 'The reply body text' },
      },
      required: ['threadId', 'to', 'subject', 'bodyText'],
    },
  },
  {
    name: 'archive_gmail',
    description: 'Archive an email (remove from inbox without deleting) by message ID.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        messageId: { type: SchemaType.STRING, description: 'The Gmail message ID (from read_gmail result)' },
      },
      required: ['messageId'],
    },
  },

  // ─── GOOGLE DRIVE ─────────────────────────────────────────────────────────────
  {
    name: 'search_google_drive',
    description: 'Search for specific files in Google Drive by name, type, or content. Use this when you know what you\'re looking for.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Drive search query (e.g. "name contains \'report\'", "mimeType=\'application/pdf\'")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_drive_files',
    description: 'List the most recently modified files in Google Drive. Use this to browse recent files without a specific query.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: { type: SchemaType.NUMBER, description: 'Maximum number of files to return (default: 15)' }
      },
      required: []
    }
  },
  {
    name: 'open_drive_file',
    description: 'Open a specific Google Drive file directly in the browser by its file ID. Also returns the URL. Can open as PDF for Google Docs/Sheets.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fileId: { type: SchemaType.STRING, description: 'The Google Drive file ID (from search_google_drive or list_drive_files)' },
        openAsPdf: { type: SchemaType.STRING, description: 'Set to "true" to open as PDF (only works for Google Docs/Sheets)' }
      },
      required: ['fileId']
    }
  },

  // ─── GOOGLE DOCS ─────────────────────────────────────────────────────────────
  {
    name: 'create_google_doc',
    description: 'Create a new blank Google Document.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Title of the document' },
      },
      required: ['title'],
    },
  },
  {
    name: 'write_google_doc',
    description: 'Write or append text content into an existing Google Document by its document ID.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        docId: { type: SchemaType.STRING, description: 'The Google Doc ID (from create_google_doc result)' },
        content: { type: SchemaType.STRING, description: 'The text content to write into the document' }
      },
      required: ['docId', 'content']
    }
  },

  // ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
  {
    name: 'send_reminder',
    description: 'Schedule a push notification reminder at a specific delay in the future.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: { type: SchemaType.STRING, description: 'The reminder message' },
        delayMinutes: { type: SchemaType.NUMBER, description: 'Minutes from now to send the reminder' }
      },
      required: ['message', 'delayMinutes']
    }
  },
  {
    name: 'send_notification',
    description: 'Send an instant push notification or toast message to the user right now.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Notification title' },
        message: { type: SchemaType.STRING, description: 'Notification body' },
      },
      required: ['title', 'message'],
    },
  },

  // ─── AGENT SYSTEM ────────────────────────────────────────────────────────────
  {
    name: 'delegate_task',
    description: 'Spawn a real sub-agent to execute a specific task autonomously. The sub-agent runs the full runAgentLoop with access to all tools. Use when you need a specialist agent to handle a portion of a complex workflow.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        agentRole: { type: SchemaType.STRING, description: 'Role to delegate to: SEARCH, DOCS, DATA, COMMS, SCHEDULER, DRIVE, CODING, QA, MEET, PLANNER, MONITOR, GHOST_DETECTOR, EXECUTOR' },
        instruction: { type: SchemaType.STRING, description: 'The exact instruction for the delegated agent. Be specific and include all context the sub-agent needs.' },
      },
      required: ['agentRole', 'instruction'],
    },
  },
  {
    name: 'generate_script',
    description: 'Securely generate a code script and present it to the user for review. Do NOT use to execute code. Use this for automation scripts, data processing, or bulk operations.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        language: { type: SchemaType.STRING, description: 'Programming language (e.g. python, javascript)' },
        code: { type: SchemaType.STRING, description: 'The raw code to present' },
        explanation: { type: SchemaType.STRING, description: 'Explanation of what the code does' },
      },
      required: ['language', 'code'],
    },
  }
];
