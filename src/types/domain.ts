/**
 * ZenTrack Domain Types
 * Central source of truth for all entity shapes in the app.
 * Import from here instead of using `any[]` throughout agents and tools.
 */

// --- Task -----------------------------------------------------------------
export interface Task {
  id: string;
  title?: string;
  text?: string;         // legacy alias for title
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
  date?: string;         // YYYY-MM-DD
  dueDate?: string;
  estimatedMinutes?: number;
  isOverdue?: boolean;
  tags?: string[];
  category?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  goalId?: string;
}

// --- Calendar -------------------------------------------------------------
export interface CalendarEvent {
  id: string;
  summary?: string;
  title?: string;
  description?: string;
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  attendees?: { email: string; displayName?: string }[];
  htmlLink?: string;
  hangoutLink?: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

// --- Gmail ----------------------------------------------------------------
export interface GmailMessage {
  id: string;
  threadId: string;
  subject?: string;
  from?: string;
  to?: string;
  body?: string;
  snippet?: string;
  date?: string;
  isUnread?: boolean;
  labels?: string[];
}

// --- Agent Conversation ---------------------------------------------------
export interface ConversationTurn {
  role: 'user' | 'model';
  text: string;
}

// --- Tool Result ----------------------------------------------------------
export type ToolResult = { success: boolean; data: unknown; message: string };

// --- Risk Analysis -------------------------------------------------------
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DataAnalysis {
  risk: RiskLevel;
  topPriority: string;
  tasksOverdue: number;
  tasksDueToday: number;
  completionProbability: number;
}

// --- Google Drive ---------------------------------------------------------
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
}
