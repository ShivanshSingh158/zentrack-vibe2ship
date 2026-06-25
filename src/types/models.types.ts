export interface UserProfile {
  name: string;
  email: string;
  timezone: string;
  workHours: { start: string; end: string };
  energyProfile: 'morning_person' | 'evening_person' | 'consistent';
  dndSchedule: Array<{ start: string; end: string }>;
}

export interface UserPreferences {
  defaultPermissionLevel: number;
  notificationChannels: string[];
  accountabilityPartnerId: string | null;
  warRoomThreshold: number;
  calendarSyncEnabled: boolean;
  ghostDetectorEnabled: boolean;
}

export interface UserStats {
  lifetimeTasksCompleted: number;
  currentStreak: number;
  avgCompletionRate: number;
  productivityScore: number;
}

export interface UserIntegrations {
  googleCalendarConnected: boolean;
  gmailConnected: boolean;
  googleTasksConnected: boolean;
}

export interface UserSchema {
  id: string;
  profile: UserProfile;
  preferences: UserPreferences;
  stats: UserStats;
  integrations: UserIntegrations;
}

export interface DeadlineDNA {
  score: number;
  urgency: number;
  importance: number;
  dependencyImpact: number;
  energyMatch: number;
  procrastinationRisk: number;
}

export interface ExecutorAction {
  type: string;
  timestamp: string;
  eventId?: string;
  emailId?: string;
}

export interface TaskSchema {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string; // ISO String
  estimatedMinutes: number;
  actualMinutes: number | null;
  category: 'coding' | 'writing' | 'design' | 'admin' | 'meeting' | 'personal' | 'finance';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'delegated';
  deadlineDNA: DeadlineDNA;
  dependencies: string[];
  parentGoalId: string | null;
  calendarEventId: string | null;
  snoozeCount: number;
  source: 'manual' | 'ghost_detected' | 'gmail' | 'calendar' | 'voice';
  autoDetectedFrom: string | null;
  executorActions: ExecutorAction[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  
  // Legacy mappings for quick transition
  timeSlot?: string | null;
  isRecurring?: boolean;
}

export interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  linkedTaskIds: string[];
}

export interface GoalSchema {
  id: string;
  userId: string;
  title: string;
  lifeArea: 'career' | 'health' | 'relationships' | 'finance' | 'learning' | 'personal';
  targetDate: string; // ISO Date String
  keyResults: KeyResult[];
  status: 'active' | 'completed' | 'abandoned';
  createdAt: number;
}

export interface HabitSchema {
  id: string;
  userId: string;
  title: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  customDays: string[];
  reminderTime: string;
  streakCurrent: number;
  streakLongest: number;
  completionLog: Record<string, boolean>; // '2025-06-01': true
  linkedGoalId: string | null;
}

export interface AgentLogSchema {
  id?: string;
  agentName: 'executor' | 'scheduler' | 'ghost_detector' | 'planner' | 'prioritizer' | 'monitor' | 'coach';
  actionType: string;
  userId: string;
  relatedTaskId: string | null;
  details: Record<string, any>;
  outcome: 'success' | 'failed' | 'pending_approval';
  timestamp: number;
  userNotified: boolean;
}
