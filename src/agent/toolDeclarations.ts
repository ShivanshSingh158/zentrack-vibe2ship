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

  // ─── TASKS & APP DATA (ZENTRACK) ───────────────────────────────────────────
  {
    name: 'query_internal_app_data',
    description: 'Fetch internal app data for the user. Available modules: gymLogs, notes, habits, goals, learningTopics, jobs, dailyLogs, pomodoroSessions. Use this when the user asks about something specific to the app (like their gym schedule, habits, or notes) that is not in Google Calendar or Tasks.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        moduleName: { type: SchemaType.STRING, description: 'The internal module to query (e.g. "gymLogs", "notes", "habits", "goals")' },
        query: { type: SchemaType.STRING, description: 'Optional text to filter the results by' }
      },
      required: ['moduleName']
    }
  },
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
    name: 'delete_task',
    description: 'Delete a specific task from ZenTrack. Use this to permanently remove a task when the user asks you to delete it.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to delete' }
      },
      required: ['taskId']
    }
  },
  // ✅ NEW TOOL: update_task — missing from the fleet, agents had to delete+recreate to update fields
  {
    name: 'update_task',
    description: 'Update the properties of an existing ZenTrack task. Use this to change the title, priority, date, or estimated time of a task. Prefer this over delete + create.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to update' },
        title: { type: SchemaType.STRING, description: 'Optional: new title for the task' },
        priority: { type: SchemaType.STRING, description: 'Optional: new priority — "high", "medium", or "low"' },
        date: { type: SchemaType.STRING, description: 'Optional: new date in YYYY-MM-DD format' },
        estimatedMinutes: { type: SchemaType.NUMBER, description: 'Optional: new estimated duration in minutes' },
        status: { type: SchemaType.STRING, description: 'Optional: new status — "pending" or "completed"' }
      },
      required: ['taskId']
    }
  },
  // ✅ NEW TOOL: complete_habit — agents couldn't mark habits without this
  {
    name: 'complete_habit',
    description: 'Mark a habit as completed for today. Use when the user says they did their habit, or when ARGUS wants to auto-log a completed habit.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        habitId: { type: SchemaType.STRING, description: 'The habit ID to mark as completed' },
        date: { type: SchemaType.STRING, description: 'Optional: date in YYYY-MM-DD format (defaults to today)' },
        notes: { type: SchemaType.STRING, description: 'Optional: brief notes about this habit completion' }
      },
      required: ['habitId']
    }
  },
  // ✅ FEAT-5: get_habit_stats — pre-computed habit analytics (no LLM arithmetic needed)
  {
    name: 'get_habit_stats',
    description: 'Get computed habit analytics: current streak, 30-day completion rate, and today\'s completion status for all habits. Use when user asks "how are my habits going?", "what is my habit streak?", or when ENIGMA needs habit performance data for analytics.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: []
    }
  },
  // ✅ NEW TOOL: mark_attendance — needed for attendance tracking from agent
  {
    name: 'mark_attendance',
    description: 'Log an attendance record for today. Use when the user says they attended a class, lecture, or event.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        subject: { type: SchemaType.STRING, description: 'The class/lecture/event name' },
        status: { type: SchemaType.STRING, description: '"present" or "absent"' },
        date: { type: SchemaType.STRING, description: 'Optional: date in YYYY-MM-DD (defaults to today)' },
        notes: { type: SchemaType.STRING, description: 'Optional: any notes about the attendance' }
      },
      required: ['subject', 'status']
    }
  },
  {
    name: 'delete_calendar_event',
    description: 'Permanently delete a Google Calendar event. Use this when the user asks you to delete a meeting or calendar event.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        eventId: { type: SchemaType.STRING, description: 'The Google Calendar event ID to delete' }
      },
      required: ['eventId']
    }
  },
  {
    name: 'trash_email',
    description: 'Move an email to the Trash folder in Gmail. Use this when the user asks to delete an email.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        messageId: { type: SchemaType.STRING, description: 'The Gmail message ID to trash' }
      },
      required: ['messageId']
    }
  },
  {
    name: 'trash_drive_file',
    description: 'Move a file to the Trash folder in Google Drive. Use this when the user asks to delete a file or document.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fileId: { type: SchemaType.STRING, description: 'The Google Drive file ID to trash' }
      },
      required: ['fileId']
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
    description: 'Snooze a specific task to a later date. Used by ARGUS agent when a task cannot be completed today. Increments snooze counter.',
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
    description: 'Update the priority of a task. Used by ARGUS/ENIGMA agents to escalate priority when risk is detected.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to update' },
        priority: { type: SchemaType.STRING, description: '"high", "medium", or "low"' }
      },
      required: ['taskId', 'priority']
    }
  },
  // ✅ NEW TOOL: search_tasks — prevents loading ALL tasks to find ONE
  {
    name: 'search_tasks',
    description: 'Search tasks by keyword. Use instead of get_tasks("all") when looking for a specific task. More efficient and less token waste.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Keyword to search for in task titles' },
        filter: { type: SchemaType.STRING, description: 'Optional status filter: "pending", "completed", "overdue"' }
      },
      required: ['query']
    }
  },
  // ✅ NEW TOOL: start_pomodoro — agent can now trigger focus sessions
  {
    name: 'start_pomodoro',
    description: 'Start a Pomodoro focus session for a specific task. Use when the user says "help me focus on X" or "start a timer for X".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: { type: SchemaType.STRING, description: 'The task ID to focus on' },
        taskTitle: { type: SchemaType.STRING, description: 'The task title (used for display)' },
        durationMinutes: { type: SchemaType.NUMBER, description: 'Session duration in minutes (default: 25)' }
      },
      required: ['taskTitle']
    }
  },
  // ✅ NEW TOOL: create_assignment — agent can now add academic assignments
  {
    name: 'create_assignment',
    description: 'Create an academic assignment with a subject, title, due date, and priority. Use for students saying "I have an assignment due X".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Assignment title' },
        subject: { type: SchemaType.STRING, description: 'Subject or course name' },
        dueDate: { type: SchemaType.STRING, description: 'Due date in YYYY-MM-DD format' },
        priority: { type: SchemaType.STRING, description: '"high", "medium", or "low"' },
        notes: { type: SchemaType.STRING, description: 'Optional additional notes' }
      },
      required: ['title', 'subject', 'dueDate']
    }
  },
  // ✅ NEW TOOL: generate_script — HEPHAESTUS uses this to write code snippets
  {
    name: 'generate_script',
    description: 'Generates a code script or snippet in a specified language, providing an explanation of how it works. Use this whenever the user asks for a script, code snippet, or automation code.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        language: { type: SchemaType.STRING, description: 'The programming language (e.g. python, javascript, bash)' },
        code: { type: SchemaType.STRING, description: 'The actual code to generate' },
        explanation: { type: SchemaType.STRING, description: 'Optional explanation of how the code works and how to run it' }
      },
      required: ['language', 'code']
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
    description: 'Blocks a chunk of time on the calendar for deep work. Can start immediately (emergency) or at a specific time if startTime is provided.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskName: { type: SchemaType.STRING, description: 'Name of the task to block time for.' },
        durationHours: { type: SchemaType.NUMBER, description: 'Number of hours to block (e.g., 2).' },
        startTime: { type: SchemaType.STRING, description: 'Optional. Start time in HH:MM format (e.g. "15:00" for 3pm today) or ISO datetime. If omitted, defaults to 15 minutes from now.' },
        date: { type: SchemaType.STRING, description: 'Optional. Date in YYYY-MM-DD. Only used when startTime is also provided. Defaults to today.' },
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

  // ─── GOOGLE ARCHIVE ─────────────────────────────────────────────────────────────
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

  // ─── GOOGLE SCRIBE ─────────────────────────────────────────────────────────────
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
  // ✅ BUG-C2 / ISSUE-T6 FIX: read_google_doc was referenced in ARCHIVE and SCRIBE whitelists
  // but never declared here, so it was stripped from the filtered tool list before the model
  // could ever call it. Added proper declaration so ARCHIVE/SCRIBE can now read Doc content.
  {
    name: 'read_google_doc',
    description: 'Read the full text content of a Google Document by its file ID or document URL. Use when ARCHIVE or SCRIBE needs to retrieve an existing document\'s content for analysis, summarization, or editing.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fileId: { type: SchemaType.STRING, description: 'The Google Drive file ID or document ID (from search_google_drive, list_drive_files, or extracted from the Doc URL)' },
      },
      required: ['fileId'],
    },
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
        agentRole: { type: SchemaType.STRING, description: 'Role to delegate to: ORACLE, SCRIBE, ENIGMA, HERMES, CHRONOS, ARCHIVE, HEPHAESTUS, AEGIS, MEET, ATLAS, ARGUS, SPECTRE, TITAN' },
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
  },

  // ─── IN-APP NAVIGATION ────────────────────────────────────────────────────────
  {
    name: 'navigate_to_module',
    description: 'Navigate the user directly to a specific module/page within the ZenTrack app. Use when user says "open", "go to", "show me", "take me to", or "open my [module]". Can also open a specific lecture, topic, or gym workout view. Available routes: /home, /tasks, /calendar, /notes, /goals, /analytics, /gym, /jobs, /habits, /learning, /tools, /integrations, /review, /attendance, /assignments, /grades.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        route: { type: SchemaType.STRING, description: 'The app route to navigate to (e.g. "/gym", "/learning", "/tasks", "/habits")' },
        subView: { type: SchemaType.STRING, description: 'Optional sub-view or tab to activate within the module (e.g. "workout", "logs", "stats")' },
        lectureTopicTitle: { type: SchemaType.STRING, description: 'For /learning: the topic title to expand and focus on (e.g. "Data Structures", "Calculus")' },
        lectureTitle: { type: SchemaType.STRING, description: 'For /learning: the specific lecture/video title to open and play (e.g. "Lecture 3 - Arrays", "Chapter 5")' },
        reason: { type: SchemaType.STRING, description: 'Brief explanation of why navigating here (shown to user)' },
      },
      required: ['route'],
    },
  },
  {
    name: 'open_gym_workout',
    description: 'Navigate to the Gym module and open today\'s or a specific day\'s workout plan. Use when user asks about gym workout, today\'s exercises, gym plan, what to train today, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        day: { type: SchemaType.STRING, description: 'Optional day override (e.g. "Monday", "today", "tomorrow"). Defaults to today.' },
        showLogs: { type: SchemaType.BOOLEAN, description: 'If true, show the workout logs tab. If false/omitted, show the plan tab.' },
      },
      required: [],
    },
  },
  // ─── STUDENT FEATURES ───────────────────────────────────────────────────────
  {
    name: 'calculate_bunk_capacity',
    description: 'Calculate how many more classes a student can miss in a subject before falling below their target attendance percentage (default 75%). The #1 most-requested student feature.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        subject: { type: SchemaType.STRING, description: 'Subject name (e.g. "Physics", "Data Structures", "Maths")' },
        targetPercentage: { type: SchemaType.NUMBER, description: 'Target attendance percentage to maintain (default 75).' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'plan_study_schedule',
    description: 'Auto-schedule study sessions for an upcoming exam. Creates daily study tasks and blocks calendar slots. Call when user says "my exam is on [date]" or "schedule my study plan for [subject]".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        subject: { type: SchemaType.STRING, description: 'Subject to study (e.g. "Operating Systems", "Calculus")' },
        examDate: { type: SchemaType.STRING, description: 'Exam date in YYYY-MM-DD format' },
        syllabusTopics: { type: SchemaType.STRING, description: 'Optional comma-separated list of syllabus topics' },
        dailyHours: { type: SchemaType.NUMBER, description: 'Hours available per day for studying (default 2).' },
      },
      required: ['subject', 'examDate'],
    },
  },
  // ─── ENTREPRENEUR / PROFESSIONAL FEATURES ───────────────────────────────────
  {
    name: 'get_email_thread',
    description: 'Fetch the full conversation thread of an email (all messages, not just latest). Use when user asks "what did I promise X?" or "summarize my conversation with Y". Returns thread messages for summarization.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        threadId: { type: SchemaType.STRING, description: 'Gmail thread ID to fetch (get from read_gmail response)' },
        query: { type: SchemaType.STRING, description: 'Alternative: search by sender or keyword if threadId unknown (e.g. "from:rahul@co.in")' },
      },
      required: [],
    },
  },
  {
    name: 'get_meeting_prep_brief',
    description: 'Generate a meeting prep brief: pulls attendees from a calendar event, finds recent email threads with them, and surfaces open action items. Use 30 minutes before any important meeting.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        eventId: { type: SchemaType.STRING, description: 'Google Calendar event ID (from list_calendar_events)' },
        eventTitle: { type: SchemaType.STRING, description: 'Meeting title for context (if eventId not available)' },
        attendeeEmails: { type: SchemaType.STRING, description: 'Comma-separated attendee emails (if known)' },
      },
      required: [],
    },
  },
  {
    name: 'get_day_review',
    description: 'Generate an end-of-day review: tasks completed vs planned (Day Score %), meetings kept, emails handled, and top 3 tasks for tomorrow. Call at 6pm or when user asks for daily review.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: { type: SchemaType.STRING, description: 'Date to review in YYYY-MM-DD format. Defaults to today.' },
      },
      required: [],
    },
  },
  // ─── PART 6: LAST-MINUTE LIFE SAVER FEATURES ────────────────────────────────
  {
    name: 'panic_mode',
    description: 'EMERGENCY: 1-tap panic mode for when everything is falling apart. Surfaces all overdue+critical tasks, schedules a 4h recovery calendar block, and gives the agent a structured action plan to email stakeholders and reschedule the day. Use when user says "I\'m in panic", "everything is on fire", "emergency", "help me".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: { type: SchemaType.STRING, description: 'Optional brief context for why panic mode was triggered' },
      },
      required: [],
    },
  },
  {
    name: 'smart_email_triage',
    description: 'Batch-process the full unread inbox: classifies all emails into critical/high/medium/low priority using keyword analysis. Use when user says "process my emails", "triage my inbox", "I have 50 unread emails".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'deadline_negotiator',
    description: 'Draft a professional, honest deadline extension request email. Calculates the new deadline, factors in current progress percentage, and writes a proactive communication. Use when user says "I can\'t finish X by Friday", "need more time", "how do I ask for extension".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskTitle: { type: SchemaType.STRING, description: 'The task or project that needs an extension' },
        originalDeadline: { type: SchemaType.STRING, description: 'Original deadline in YYYY-MM-DD format' },
        recipientEmail: { type: SchemaType.STRING, description: 'Email of the person to send the request to' },
        daysNeeded: { type: SchemaType.NUMBER, description: 'How many additional days needed (default 3)' },
        progressPercent: { type: SchemaType.NUMBER, description: 'Current completion percentage (e.g. 60 for 60%)' },
        reason: { type: SchemaType.STRING, description: 'Brief reason for the extension request' },
      },
      required: ['taskTitle', 'originalDeadline', 'recipientEmail'],
    },
  },
  {
    name: 'focus_lock',
    description: 'Activate Focus Lock: blocks a calendar event for the session and dispatches a UI focus lock event. Use when user says "focus 90 min", "lock my focus", "do not disturb", "handle everything while I focus".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskName: { type: SchemaType.STRING, description: 'What the user is focusing on' },
        durationHours: { type: SchemaType.NUMBER, description: 'Focus session length in hours (default 1.5)' },
      },
      required: [],
    },
  },
  {
    name: 'rebuild_day',
    description: 'Intelligent 1-click day rebuild: scores all today\'s + overdue tasks by urgency+priority+time, reorders them optimally, and defers low-impact tasks to tomorrow. Use when user says "my day is broken", "rebuild my schedule", "I\'m overwhelmed, fix my day", "reorder everything".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },

  // ─── NOTES MODULE ─────────────────────────────────────────────────────────
  {
    name: 'create_note',
    description: 'Create a new note in the ZenTrack Notes module. Use when user says "save this", "note that down", "remember this", "write a note about X", or after any research/summary the user wants to keep.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'Short title/heading for the note' },
        content: { type: SchemaType.STRING, description: 'The full text content of the note (markdown supported)' },
        tags: { type: SchemaType.STRING, description: 'Optional comma-separated tags (e.g. "work,important,follow-up")' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'search_notes',
    description: 'Search note content by keyword. Unlike query_internal_app_data which returns all notes, this performs targeted content search and returns only matching notes with relevance context. Use when user says "find my note about X", "what did I write about Y", "search notes for Z".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Search term to find in note title or content' },
        maxResults: { type: SchemaType.NUMBER, description: 'Maximum number of results to return (default 5)' },
      },
      required: ['query'],
    },
  },

  // ─── GOALS MODULE ─────────────────────────────────────────────────────────
  {
    name: 'create_goal',
    description: 'Create a new goal in the ZenTrack Goals module. Use when user says "add a goal", "I want to achieve X", "set a goal for Y", "help me track my goal to Z". Goals are different from tasks — they are high-level objectives with milestones.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: 'The goal title or objective' },
        description: { type: SchemaType.STRING, description: 'Detailed description of what achieving this goal looks like' },
        targetDate: { type: SchemaType.STRING, description: 'Target completion date in YYYY-MM-DD format' },
        category: { type: SchemaType.STRING, description: 'Category: "career", "health", "learning", "finance", "personal", or "other"' },
        milestones: { type: SchemaType.STRING, description: 'Optional comma-separated milestone descriptions' },
      },
      required: ['title'],
    },
  },

  // ─── HABITS MODULE ─────────────────────────────────────────────────────────
  {
    name: 'create_habit',
    description: 'Create a new habit in the ZenTrack Habits module. Use when user says "add a habit", "I want to track X daily", "help me build a habit of Y", "remind me to Z every day".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'The habit name (e.g. "Drink 8 glasses of water")' },
        description: { type: SchemaType.STRING, description: 'Why this habit matters or how to do it' },
        frequency: { type: SchemaType.STRING, description: '"daily", "weekdays", "weekends", or specific days like "Mon,Wed,Fri"' },
        reminderTime: { type: SchemaType.STRING, description: 'Optional reminder time in HH:MM format (24h)' },
        icon: { type: SchemaType.STRING, description: 'Optional emoji icon for the habit (e.g. "💧", "🏃", "📚")' },
      },
      required: ['name'],
    },
  },

  // ─── WEEKLY REVIEW MODULE ─────────────────────────────────────────────────
  {
    name: 'generate_weekly_review',
    description: 'Generate a comprehensive weekly review report by analyzing all available data: completed tasks, habit streaks, gym performance, assignment progress, and productivity patterns. Writes the structured review to Firestore. Use when user says "weekly review", "how was my week", "generate my review", "summarize my week".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        weekStartDate: { type: SchemaType.STRING, description: 'Monday of the review week in YYYY-MM-DD format. Defaults to last Monday.' },
        includeGym: { type: SchemaType.BOOLEAN, description: 'Include gym performance analysis (default true)' },
        includeHabits: { type: SchemaType.BOOLEAN, description: 'Include habit streak analysis (default true)' },
        includeGoals: { type: SchemaType.BOOLEAN, description: 'Include goal progress analysis (default true)' },
      },
      required: [],
    },
  },
];


// ── Authoritative tool name whitelist ─────────────────────────────────────────
// Derived directly from TOOL_DECLARATIONS so it can NEVER go out of sync.
// Used by runAgentLoop to configure toolConfig.functionCallingConfig.allowedFunctionNames,
// which mathematically prevents the LLM from hallucinating non-existent tool names.
export const TOOL_NAMES: string[] = TOOL_DECLARATIONS.map(t => t.name as string);
