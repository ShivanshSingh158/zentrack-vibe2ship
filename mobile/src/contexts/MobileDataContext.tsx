/**
 * MobileDataContext — ZenTrack Mobile (Backward-Compatible Facade)
 *
 * ARCHITECTURE:
 * This file is the public API. All 34+ consumers import { useMobileData, MobileDataProvider } here.
 * Internally, data lives in 5 isolated domain contexts (./domains/):
 *   CoreDataContext    — tasks, habits, habitLogs, auth          [always open]
 *   WellnessContext    — gymLogs, userGymPlan                    [demand-based]
 *   AcademicContext    — attendance, assignments, semesters...   [demand-based]
 *   CreativeContext    — storageNodes, notes, learningTopics...  [demand-based]
 *   PlannerContext     — customEvents, goals, weeklyReviews...   [demand-based]
 *
 * DEMAND-BASED SUBSCRIPTIONS:
 * The 4 non-core providers open their Firestore listeners only once, the first time
 * MobileDataShimProvider mounts (which happens when AppNavigator renders).
 * By that point the user has logged in but has NOT yet navigated to gym/academic/creative
 * screens. However, since the shim aggregates all domains into one object for
 * backward compat, we eagerly call ensureSubscribed for all domains after a
 * short idle delay — matching the previous 1500ms lazy strategy but now isolated
 * per domain, so a gym snapshot update ONLY re-renders WellnessContext consumers.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { User } from "firebase/auth";
import { UserGymPlanDoc, GymPlanDay } from "../types/gym.types";
import { scheduleAllNotifications } from "../services/notifications";

import { CoreDataProvider, useCoreData }     from "./domains/CoreDataContext";
import { WellnessProvider, useWellnessData } from "./domains/WellnessContext";
import { AcademicProvider, useAcademicData } from "./domains/AcademicContext";
import { CreativeProvider, useCreativeData } from "./domains/CreativeContext";
import { PlannerProvider, usePlannerData }   from "./domains/PlannerContext";

// ─── Type Exports (all preserved — no consumer changes needed) ─────────────────

export interface Task {
  id: string; title: string; status: "pending" | "completed";
  priority: "P1" | "P2" | "P3" | "high" | "medium" | "low";
  date?: string; tags?: string[]; userId: string; isRecurring?: boolean;
  timeSlot?: string; estimatedMinutes?: number; subject?: string;
  commitmentTo?: string; energyRequirement?: "low" | "medium" | "high";
  order?: number; subtasks?: { id: string; title: string; completed: boolean }[];
  completedAt?: string | null;
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
  id: string; name: string; emoji: string; frequency: string;
  streak?: number; longestStreak?: number; color?: string; userId: string; archived?: boolean;
}

export interface HabitLog { id: string; habitId: string; userId: string; date: string; }

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

export interface WaterLog { id: string; userId: string; date: string; amountMl: number; }
export interface SleepLog  { id: string; userId: string; date: string; hours: number; }
export interface WeightLog { id?: string; userId: string; date: string; weightKg: number; photoUrl?: string; createdAt: number; }

export interface GymLog {
  id: string; date: string; userId: string; exercises?: any[]; cardio?: any[];
  workoutStartTime?: number; workoutDurationMinutes?: number;
  startTime?: string; endTime?: string; updatedAt?: number;
}

export interface AttendanceSubject {
  id: string; userId: string; name: string;
  classesAttended: number; classesTotal: number;
  labsAttended?: number; labsTotal?: number; targetPercentage: number; schedule?: any; schemaVersion?: number;
  lastUpdated?: number; color?: string;
}

export interface AttendanceLog {
  id?: string; userId: string; subjectId: string; subjectName: string;
  type: 'class'|'lab'; action: 'attended'|'missed'|'cancelled';
  date: string; isExtra: boolean; timestamp: number;
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



// ─── Unified Context (backward-compatible shape) ───────────────────────────────

interface MobileDataContextType {
  user: User | null;
  tasks: Task[]; habits: Habit[]; allHabits: Habit[]; habitLogs: HabitLog[];
  notes: Note[]; userGymPlan: UserGymPlanDoc | null; storageNodes: StorageNode[];
  goals: Goal[]; customEvents: CustomEvent[]; gymLogs: GymLog[];
  /** true once the first Firestore gymLogs snapshot has resolved — safe to read in useGymLog */
  gymLogsReady: boolean;
  /** Call to immediately open the Firestore gym subscriptions, bypassing the 1200ms idle delay */
  gymEnsureSubscribed: () => void;
  attendance: AttendanceSubject[]; attendanceLogs: AttendanceLog[]; assignments: Assignment[];
  semesters: Semester[]; semesterSubjects: SemesterSubject[];
  learningTopics: LearningTopic[]; jobs: JobApplication[];
  waterLogs: WaterLog[]; sleepLogs: SleepLog[]; weightLogs: WeightLog[];
  weeklyReviews: WeeklyReview[];
  googleAccessToken: string | null; loading: boolean;
  pendingTaskCount: number; todayHabits: Habit[];
  pinnedModules: string[]; setPinnedModules: (modules: string[]) => void;
  updateMasterPlan: (dayIndex: number, planDay: GymPlanDay) => Promise<void>;
  optimisticUpdateTask: (taskId: string, partial: Partial<Task>) => void;
  optimisticUpdateHabit: (habitId: string, partial: Partial<Habit>) => void;
  optimisticAddHabitLog: (log: HabitLog) => void;
  optimisticRemoveHabitLog: (habitId: string, date: string) => void;
}

const MobileDataShimContext = createContext<MobileDataContextType | null>(null);

// ─── Shim Provider ─────────────────────────────────────────────────────────────
// Assembles all 5 domain contexts into one backward-compat value object.
// Also triggers demand-based subscriptions after a short idle delay
// (matches previous 1500ms lazy strategy, but now domain-isolated).
function MobileDataShimProvider({ children }: { children: React.ReactNode }) {
  const core     = useCoreData();
  const wellness = useWellnessData();
  const academic = useAcademicData();
  const creative = useCreativeData();
  const planner  = usePlannerData();

  // Open demand-based subscriptions after a short 250ms idle window.
  // Previously 1200ms — now 250ms: still doesn't block the initial Dashboard
  // render but means Gym/Academic/Creative data is ready 950ms sooner.
  // Each call is idempotent — already-subscribed domains ignore the call.
  useEffect(() => {
    if (!core.user) return;
    const timer = setTimeout(() => {
      wellness.ensureSubscribed();
      academic.ensureSubscribed();
      creative.ensureSubscribed();
      planner.ensureSubscribed();
    }, 250);
    return () => clearTimeout(timer);
  }, [core.user]);

  const value = useMemo<MobileDataContextType>(() => ({
    // Core domain
    user:              core.user,
    tasks:             core.tasks,
    habits:            core.habits,
    allHabits:         core.allHabits,
    habitLogs:         core.habitLogs,
    loading:           core.loading,
    pendingTaskCount:  core.pendingTaskCount,
    todayHabits:       core.todayHabits,
    pinnedModules:     core.pinnedModules,
    setPinnedModules:  core.setPinnedModules,
    googleAccessToken: core.googleAccessToken,
    // Wellness domain
    gymLogs:              wellness.gymLogs,
    gymLogsReady:         wellness.gymLogsReady,
    gymEnsureSubscribed:  wellness.ensureSubscribed,
    userGymPlan:          wellness.userGymPlan,
    updateMasterPlan:     wellness.updateMasterPlan,
    waterLogs:            wellness.waterLogs,
    sleepLogs:            wellness.sleepLogs,
    weightLogs:           wellness.weightLogs,
    // Academic domain
    attendance:        academic.attendance,
    attendanceLogs:    academic.attendanceLogs,
    assignments:       academic.assignments,
    semesters:         academic.semesters,
    semesterSubjects:  academic.semesterSubjects,
    // Creative domain
    storageNodes:      creative.storageNodes,
    notes:             creative.notes,
    learningTopics:    creative.learningTopics,
    jobs:              creative.jobs,
    // Planner domain
    customEvents:      planner.customEvents,
    goals:             planner.goals,
    weeklyReviews:     planner.weeklyReviews,

    // Optimistic functions
    optimisticUpdateTask: core.optimisticUpdateTask,
    optimisticUpdateHabit: core.optimisticUpdateHabit,
    optimisticAddHabitLog: core.optimisticAddHabitLog,
    optimisticRemoveHabitLog: core.optimisticRemoveHabitLog,
  }), [
    core.user, core.tasks, core.habits, core.allHabits, core.habitLogs,
    core.loading, core.pendingTaskCount, core.todayHabits,
    core.pinnedModules, core.setPinnedModules, core.googleAccessToken,
    core.optimisticUpdateTask, core.optimisticUpdateHabit, core.optimisticAddHabitLog, core.optimisticRemoveHabitLog,
    wellness.gymLogs, wellness.gymLogsReady, wellness.ensureSubscribed, wellness.userGymPlan, wellness.updateMasterPlan, wellness.waterLogs, wellness.sleepLogs, wellness.weightLogs,
    academic.attendance, academic.attendanceLogs, academic.assignments, academic.semesters, academic.semesterSubjects,
    creative.storageNodes, creative.notes, creative.learningTopics, creative.jobs,
    planner.customEvents, planner.goals, planner.weeklyReviews,
  ]);

  // Debounced notification scheduling — prevents burst reschedules
  // When Firestore fires 3 snapshots in 5s (common after writes), this ensures
  // scheduleTaskReminders is only called ONCE, after the burst settles.
  // Previously used a plain setTimeout which caused up to 3 overlapping
  // Notifications.cancelAllScheduledNotificationsAsync() calls per write.
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => {
      scheduleAllNotifications({
        tasks: core.tasks,
        customEvents: planner.customEvents,
        gymLogs: wellness.gymLogs,
        attendance: academic.attendance,
        habitLogs: core.habitLogs,
        allHabits: core.allHabits,
        assignments: academic.assignments
      }).catch(console.error);
    }, 3000); // 3s debounce window absorbs all burst snapshots
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, [
    core.tasks, planner.customEvents, wellness.gymLogs, academic.attendance,
    core.habitLogs, core.allHabits, academic.assignments
  ]);

  return <MobileDataShimContext.Provider value={value}>{children}</MobileDataShimContext.Provider>;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function useMobileData(): MobileDataContextType {
  const ctx = useContext(MobileDataShimContext);
  if (!ctx) throw new Error("useMobileData must be used inside MobileDataProvider");
  return ctx;
}

// Internal bridge: reads user from CoreDataContext, passes to demand-based providers
function _DomainProviders({ children }: { children: React.ReactNode }) {
  const { user } = useCoreData();
  return (
    <WellnessProvider user={user}>
      <AcademicProvider user={user}>
        <CreativeProvider user={user}>
          <PlannerProvider user={user}>
            <MobileDataShimProvider>
              {children}
            </MobileDataShimProvider>
          </PlannerProvider>
        </CreativeProvider>
      </AcademicProvider>
    </WellnessProvider>
  );
}

/**
 * MobileDataProvider — drop-in replacement for the old single-context provider.
 * Wraps all 5 domain providers. No call-site changes needed anywhere.
 */
export function MobileDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <CoreDataProvider>
      <_DomainProviders>
        {children}
      </_DomainProviders>
    </CoreDataProvider>
  );
}
