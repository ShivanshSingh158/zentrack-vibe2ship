/**
 * MobileDataContext ΓÇö ZenTrack Mobile (Backward-Compatible Facade)
 *
 * ARCHITECTURE:
 * This file is the public API. All 34+ consumers import { useMobileData, MobileDataProvider } here.
 * Internally, data lives in 5 isolated domain contexts (./domains/):
 *   CoreDataContext    ΓÇö tasks, habits, habitLogs, auth          [always open]
 *   WellnessContext    ΓÇö gymLogs, userGymPlan                    [demand-based]
 *   AcademicContext    ΓÇö attendance, assignments, semesters...   [demand-based]
 *   CreativeContext    ΓÇö storageNodes, notes, learningTopics...  [demand-based]
 *   PlannerContext     ΓÇö customEvents, goals, weeklyReviews...   [demand-based]
 *
 * DEMAND-BASED SUBSCRIPTIONS:
 * The 4 non-core providers open their Firestore listeners only once, the first time
 * MobileDataShimProvider mounts (which happens when AppNavigator renders).
 * By that point the user has logged in but has NOT yet navigated to gym/academic/creative
 * screens. However, since the shim aggregates all domains into one object for
 * backward compat, we eagerly call ensureSubscribed for all domains after a
 * short idle delay ΓÇö matching the previous 1500ms lazy strategy but now isolated
 * per domain, so a gym snapshot update ONLY re-renders WellnessContext consumers.
 */

import React from "react";
import { User } from "firebase/auth";
import { UserGymPlanDoc, GymPlanDay } from "../types/gym.types";

import { CoreDataProvider, useCoreData }     from "./domains/CoreDataContext";
import { WellnessProvider, useWellnessData } from "./domains/WellnessContext";
import { AcademicProvider, useAcademicData } from "./domains/AcademicContext";
import { CreativeProvider, useCreativeData } from "./domains/CreativeContext";
import { PlannerProvider, usePlannerData }   from "./domains/PlannerContext";
import { PinnedModulesProvider, usePinnedModules } from "./PinnedModulesContext";
import { BackgroundNotificationWatcher }     from "../components/BackgroundNotificationWatcher";
import { handleSyncError } from '../utils/errorUtils';

// Export domain hooks for fine-grained, zero-overhead subscriptions
export { useCoreData, useWellnessData, useAcademicData, useCreativeData, usePlannerData, usePinnedModules };


// ΓöÇΓöÇΓöÇ Type Exports (all preserved ΓÇö no consumer changes needed) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
  exceptions?: string[];
}

export interface Task {
  id: string; title: string; status: "pending" | "completed";
  priority: "P1" | "P2" | "P3" | "high" | "medium" | "low";
  date?: string; tags?: string[]; userId: string; isRecurring?: boolean;
  recurrenceRule?: RecurrenceRule; recurringSourceId?: string;
  timeSlot?: string; estimatedMinutes?: number; subject?: string;
  commitmentTo?: string; energyRequirement?: "low" | "medium" | "high";
  order?: number; subtasks?: { id: string; title: string; completed: boolean }[];
  completedAt?: string | null;
  /** Actual minutes the user worked on this task (logged on completion) */
  actualMinutes?: number;
  /** The time the user actually sat down to work (e.g. "6:30 AM") */
  actualStartTime?: string;
  /** Optional geofence location trigger */
  locationReminder?: any;
  /** Flag indicating high-priority scheduled reminder */
  isReminder?: boolean;
}

export interface TaskTemplate {
  id: string;
  userId: string;
  title: string;
  subtasks?: { id: string; title: string; completed: boolean }[];
  priority: "high" | "medium" | "low";
  timeSlot?: string;
  estimatedMinutes?: number;
  isRecurring?: boolean;
  recurringDays?: number[];
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  frequency: string;
  frequencyType?: 'daily' | 'weekly_target' | 'specific_days' | 'monthly_target';
  weeklyTargetCount?: number;
  specificDays?: number[];
  monthlyTargetCount?: number;
  timeOfDay?: 'anytime' | 'morning' | 'afternoon' | 'evening';
  streak?: number;
  longestStreak?: number;
  color?: string;
  userId: string;
  archived?: boolean;
  type?: 'positive' | 'negative';
  startDate?: string;
  costPerDay?: number;
  targetCount?: number;
  unit?: string;
  tileShape?: 'squircle' | 'circle' | 'square';
  gridDaysCount?: 35 | 56 | 70;
  totalCompletions?: number;
  createdAt?: any;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  count?: number;
  isFreeze?: boolean;
  note?: string;
}

export interface StorageNode {
  id?: string; userId: string; type: "folder" | "file" | "note"; name: string;
  parentId: string | null; fileType?: "pdf" | "docx" | "image" | "other";
  size?: number; url?: string; content?: string; createdAt: any; updatedAt: any;
  pinned?: boolean; tags?: string[];
}

export interface Note { id: string; title: string; content: string; tags?: string[]; createdAt?: any; userId: string; }

export interface GoalKeyResult { id: string; title: string; completed: boolean; }
export interface Goal {
  id: string; title: string; status: string; progress?: number; userId: string;
  description?: string; deadline?: string; firstStep?: string; successMetric?: string; keyResults?: GoalKeyResult[];
  updatedAt?: number;
}

export interface CustomEvent {
  id: string; title: string; date: string;
  type: "todo" | "job" | "goal" | "exam" | "assignment_due" | "holiday" | "viva" | "submission" | "gcal" | "gym";
  startTime?: string; endTime?: string; location?: string; description?: string; userId: string;
}

export interface WaterLog { id: string; userId: string; date: string; amountMl: number; timestamp?: number; createdAt?: any; }
export interface SleepLog {
  id?: string;
  userId: string;
  date: string;
  hours?: number;
  quality?: number; // 1-5
  notes?: string;
  bedTime?: string;
  wakeTime?: string;
  createdAt?: number;
}
export interface ContentLog {
  id?: string;
  userId: string;
  title: string;
  contentType: 'book' | 'podcast' | 'article' | 'video';
  status: 'to_read' | 'in_progress' | 'completed';
  url?: string;
  progressPercentage?: number; // 0-100
  notes?: string;
  dateAdded: string; // ISO
  dateCompleted?: string; // ISO
}
export interface WeightLog { id?: string; userId: string; date: string; weightKg: number; photoUrl?: string; createdAt: number; }

export interface GymLog {
  id: string; date: string; userId: string; exercises?: any[]; cardio?: any[];
  workoutStartTime?: number; workoutDurationMinutes?: number;
  completed?: boolean; dayPlanIndex?: number;
  startTime?: string; endTime?: string; updatedAt?: number;
  notes?: string;
  restTimerStartTime?: number | null;
  restTimerDurationSecs?: number | null;
  restTimerExerciseName?: string | null;
}

export interface AttendanceSubject {
  id: string; userId: string; name: string;
  classesAttended: number; classesTotal: number;
  labsAttended?: number; labsTotal?: number; targetPercentage: number; schedule?: any; schemaVersion?: number;
  lastUpdated?: number; color?: string; order?: number;
}

export interface AttendanceLog {
  id?: string; userId: string; subjectId: string; subjectName: string;
  type: 'class'|'lab'; action: 'attended'|'missed'|'cancelled';
  date: string; isExtra: boolean; timestamp: number;
  idx?: number; // Session index within the day (0 = first class, 1 = second class, etc.)
}

export interface Assignment {
  id?: string; userId: string; title: string; subjectName: string; description?: string;
  dueDate: string; weightage?: number; status: "not_started" | "in_progress" | "submitted" | "graded";
  grade?: string; maxMarks?: number; obtainedMarks?: number; notes?: string; createdAt: number; updatedAt: number;
}

export interface Semester {
  id?: string; userId: string; name: string; startDate?: string; endDate?: string;
  sgpa?: number; totalCredits?: number; order: number; createdAt: number;
}

export interface SemesterSubject {
  id?: string; userId: string; semesterId: string; name: string; credits: number;
  gradePoints?: number; grade?: string; internalMarks?: number; externalMarks?: number; totalMarks?: number; maxMarks?: number;
}

export interface LearningSubTask {
  id: string; title: string; category?: string; url?: string; notes?: string; isCompleted: boolean;
  timeSpentMinutes?: number; timeSpentMs?: number; resources?: any[];
  masteryLevel?: "not_started" | "learning" | "revising" | "mastered";
  estimatedHours?: number; revisionCount?: number; lastRevisedAt?: number; pinned?: boolean; pinnedAt?: number;
  completedDate?: string;
}

export interface LearningTopic {
  id?: string; userId: string; title: string; description?: string; notes?: string;
  lastStudiedAt?: number; subTasks: LearningSubTask[]; createdAt: number; order?: number;
  timeSpentMinutes?: number; timeSpentMs?: number;
}

export interface JobApplication {
  id?: string; userId?: string; company: string; role: string; location?: string;
  source?: string; status: "wishlist" | "applied" | "interviewing" | "offer" | "rejected";
  dateApplied: string; expectedSalary?: string; offeredSalary?: string; salary?: string;
  notes?: string; url?: string; jobDescription?: string; coverLetter?: string;
  interviewDate?: string; learningTopicId?: string; attachedFileIds?: string[];
  followUpDate?: number; prepChecklist?: { id: string; title: string; done: boolean }[];
}

export interface WeeklyReview {
  id?: string; userId: string; weekStart: string; weekEnd: string;
  wentWell: string; toImprove: string; nextWeekPriorities: string; gratitude: string;
  aiChatHistory?: any[]; stats?: any; createdAt: number; updatedAt: number;
}



// ΓöÇΓöÇΓöÇ Unified Context (backward-compatible shape) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface MobileDataContextType {
  user: User | null;
  tasks: Task[]; habits: Habit[]; allHabits: Habit[]; habitLogs: HabitLog[];
  notes: Note[]; userGymPlan: UserGymPlanDoc | null; storageNodes: StorageNode[];
  goals: Goal[]; customEvents: CustomEvent[]; gymLogs: GymLog[];
  /** true once the first Firestore gymLogs snapshot has resolved ΓÇö safe to read in useGymLog */
  gymLogsReady: boolean;
  /** Call to immediately open the Firestore gym subscriptions, bypassing the 1200ms idle delay */
  gymEnsureSubscribed: () => void;
  attendance: AttendanceSubject[]; attendanceLogs: AttendanceLog[]; assignments: Assignment[];
  semesters: Semester[]; semesterSubjects: SemesterSubject[];
  learningTopics: LearningTopic[]; jobs: JobApplication[];
  waterLogs: WaterLog[]; weightLogs: WeightLog[];
  sleepLogs: SleepLog[];
  contentLogs: ContentLog[];
  weeklyReviews: WeeklyReview[];
  googleAccessToken: string | null; loading: boolean;
  pendingTaskCount: number; todayHabits: Habit[];
  pinnedModules: string[]; setPinnedModules: (modules: string[]) => void;
  updateMasterPlan: (dayIndex: number, planDay: GymPlanDay) => Promise<void>;
  updateFullMasterPlan: (newCustomDays: Record<number, GymPlanDay>) => Promise<void>;
  applyMasterTemplate: (templateId: 'arnold' | 'ppl', schedulePattern?: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => Promise<Record<number, GymPlanDay> | undefined>;
  optimisticAddTask: (task: Task) => void;
  optimisticUpdateTask: (taskId: string, partial: Partial<Task>) => void;
  optimisticDeleteTask: (taskId: string) => void;
  optimisticUpdateHabit: (habitId: string, partial: Partial<Habit>) => void;
  optimisticAddHabitLog: (log: HabitLog) => void;
  optimisticUpdateHabitLog: (logId: string, partial: Partial<HabitLog>) => void;
  optimisticRemoveHabitLog: (habitId: string, date: string) => void;
  // Wellness
  optimisticAddGymLog: (log: GymLog) => void;
  optimisticUpdateGymLog: (logId: string, partial: Partial<GymLog>) => void;
  optimisticAddWaterLog: (log: WaterLog) => void;
  // Academic
  optimisticAddSubject: (subject: AttendanceSubject) => void;
  optimisticDeleteSubject: (subjectId: string) => void;
  optimisticUpdateAttendance: (subjectId: string, partial: Partial<AttendanceSubject>) => void;
  optimisticAddAttendanceLog: (log: any) => void;
  optimisticRemoveAttendanceLog: (logId: string) => void;
  optimisticAddAssignment: (assignment: Assignment) => void;
  optimisticUpdateAssignment: (assignmentId: string, partial: Partial<Assignment>) => void;
  optimisticDeleteAssignment: (assignmentId: string) => void;
  // Planner
  optimisticAddEvent: (event: CustomEvent) => void;
  optimisticUpdateEvent: (eventId: string, partial: Partial<CustomEvent>) => void;
  optimisticDeleteEvent: (eventId: string) => void;
  optimisticAddGoal: (goal: Goal) => void;
  optimisticUpdateGoal: (goalId: string, partial: Partial<Goal>) => void;
}

// ─── Legacy Fallback ─────────────────────────────────────────────────────────

const DEFAULT_FALLBACK_CTX: MobileDataContextType = {
  user: null,
  tasks: [],
  habits: [],
  allHabits: [],
  habitLogs: [],
  loading: false,
  pendingTaskCount: 0,
  todayHabits: [],
  pinnedModules: ["Tasks", "Gym", "Calendar", "Attendance"],
  setPinnedModules: () => {},
  googleAccessToken: null,
  optimisticAddTask: () => {},
  optimisticUpdateTask: () => {},
  optimisticDeleteTask: () => {},
  optimisticUpdateHabit: () => {},
  optimisticAddHabitLog: () => {},
  optimisticUpdateHabitLog: () => {},
  optimisticRemoveHabitLog: () => {},
  optimisticAddGymLog: () => {},
  optimisticUpdateGymLog: () => {},
  optimisticAddWaterLog: () => {},
  optimisticAddSubject: () => {},
  optimisticDeleteSubject: () => {},
  optimisticUpdateAttendance: () => {},
  optimisticAddAttendanceLog: () => {},
  optimisticRemoveAttendanceLog: () => {},
  optimisticAddAssignment: () => {},
  optimisticUpdateAssignment: () => {},
  optimisticDeleteAssignment: () => {},
  optimisticAddEvent: () => {},
  optimisticUpdateEvent: () => {},
  optimisticDeleteEvent: () => {},
  optimisticAddGoal: () => {},
  optimisticUpdateGoal: () => {},
  gymLogs: [],
  gymLogsReady: false,
  gymEnsureSubscribed: () => {},
  userGymPlan: null,
  updateMasterPlan: async () => {},
  updateFullMasterPlan: async () => {},
  applyMasterTemplate: async () => undefined,
  waterLogs: [],
  sleepLogs: [],
  weightLogs: [],
  attendance: [],
  attendanceLogs: [],
  assignments: [],
  semesters: [],
  semesterSubjects: [],
  storageNodes: [],
  notes: [],
  contentLogs: [],
  learningTopics: [],
  jobs: [],
  customEvents: [],
  goals: [],
  weeklyReviews: [],
};

/**
 * @deprecated All screens should import fine-grained domain hooks directly:
 * `useCoreData`, `useWellnessData`, `useAcademicData`, `useCreativeData`, `usePlannerData`.
 */
export function useMobileData(): MobileDataContextType {
  return DEFAULT_FALLBACK_CTX;
}

// Internal bridge: reads user from CoreDataContext, passes to demand-based providers.
function _DomainProviders({ children }: { children: React.ReactNode }) {
  const { user } = useCoreData();
  return (
    <WellnessProvider user={user}>
      <AcademicProvider user={user}>
        <CreativeProvider user={user}>
          <PlannerProvider user={user}>
            <BackgroundNotificationWatcher />
            {children}
          </PlannerProvider>
        </CreativeProvider>
      </AcademicProvider>
    </WellnessProvider>
  );
}

/**
 * MobileDataProvider — drop-in replacement for the old single-context provider.
 * Wraps all 5 isolated domain providers and background watchers without a monolithic shim.
 */
export function MobileDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <PinnedModulesProvider>
      <CoreDataProvider>
        <_DomainProviders>
          {children}
        </_DomainProviders>
      </CoreDataProvider>
    </PinnedModulesProvider>
  );
}
