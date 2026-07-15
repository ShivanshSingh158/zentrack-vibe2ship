import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { collection, query, where, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { scheduleTaskReminders } from '../services/notifications';
import { UserGymPlanDoc, GymPlanDay } from '../types/gym.types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  priority: 'P1' | 'P2' | 'P3' | 'high' | 'medium' | 'low';
  date?: string;
  tags?: string[];
  userId: string;
  isRecurring?: boolean;
  timeSlot?: string;
  estimatedMinutes?: number;
  subject?: string;
  commitmentTo?: string;
  energyRequirement?: 'low' | 'medium' | 'high';
  order?: number;
  subtasks?: { id: string; title: string; completed: boolean }[];
  completedAt?: string | null;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  frequency: string;
  streak?: number;
  longestStreak?: number;
  color?: string;
  userId: string;
  archived?: boolean;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  date: string;
}

export interface StorageNode {
  id?: string;
  userId: string;
  type: 'folder' | 'file' | 'note';
  name: string;
  parentId: string | null;
  fileType?: 'pdf' | 'docx' | 'image' | 'other';
  size?: number;
  url?: string;
  content?: string;
  createdAt: any;
  updatedAt: any;
  pinned?: boolean;
  tags?: string[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt?: any;
  userId: string;
}

export interface GoalKeyResult {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  status: string; // 'active', 'completed', 'paused', 'cancelled'
  progress?: number;
  userId: string;
  description?: string;
  deadline?: string;
  firstStep?: string;
  successMetric?: string;
  keyResults?: GoalKeyResult[];
}

export interface CustomEvent {
  id: string;
  title: string;
  date: string;
  type: 'todo' | 'job' | 'goal' | 'exam' | 'assignment_due' | 'holiday' | 'viva' | 'submission' | 'gcal';
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  userId: string;
}

export interface WaterLog {
  id: string;
  userId: string;
  date: string;
  amountMl: number;
}

export interface SleepLog {
  id: string;
  userId: string;
  date: string;
  hours: number;
}

export interface GymLog {
  id: string;
  date: string;
  userId: string;
  exercises?: any[];
  cardio?: any[];
}

export interface AttendanceSubject {
  id: string;
  userId: string;
  name: string;
  classesAttended: number;
  classesTotal: number;
  labsAttended?: number;
  labsTotal?: number;
  targetPercentage: number;
  schedule?: any;
  schemaVersion?: number;
}

export interface Assignment {
  id?: string;
  userId: string;
  title: string;
  subjectName: string;
  description?: string;
  dueDate: string;
  weightage?: number;
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
  grade?: string;
  maxMarks?: number;
  obtainedMarks?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Semester {
  id?: string;
  userId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  sgpa?: number;
  totalCredits?: number;
  order: number;
  createdAt: number;
}

export interface SemesterSubject {
  id?: string;
  userId: string;
  semesterId: string;
  name: string;
  credits: number;
  gradePoints?: number;
  grade?: string;
  internalMarks?: number;
  externalMarks?: number;
  totalMarks?: number;
  maxMarks?: number;
}

export interface LearningSubTask {
  id: string;
  title: string;
  category?: string;
  url?: string;
  notes?: string;
  isCompleted: boolean;
  timeSpentMinutes?: number;
  timeSpentMs?: number;
  resources?: any[];
  masteryLevel?: 'not_started' | 'learning' | 'revising' | 'mastered';
  estimatedHours?: number;
  revisionCount?: number;
  lastRevisedAt?: number;
  pinned?: boolean;
  pinnedAt?: number;
}

export interface LearningTopic {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  notes?: string;
  lastStudiedAt?: number;
  subTasks: LearningSubTask[];
  createdAt: number;
  order?: number;
  timeSpentMinutes?: number;
  timeSpentMs?: number;
}

export interface JobApplication {
  id?: string;
  userId?: string;
  company: string;
  role: string;
  location?: string;
  source?: string;
  status: 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  dateApplied: string;
  expectedSalary?: string;
  offeredSalary?: string;
  salary?: string;
  notes?: string;
  url?: string;
  jobDescription?: string;
  coverLetter?: string;
  interviewDate?: string;
  learningTopicId?: string;
  attachedFileIds?: string[];
  followUpDate?: number;
  prepChecklist?: { id: string; title: string; done: boolean }[];
}

export interface WeeklyReview {
  id?: string;
  userId: string;
  weekStart: string;
  weekEnd: string;
  wentWell: string;
  toImprove: string;
  nextWeekPriorities: string;
  gratitude: string;
  aiChatHistory?: any[];
  stats?: any;
  createdAt: number;
  updatedAt: number;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  taskId?: string | null;
  taskTitle?: string | null;
  durationMinutes: number;
  date: string; // YYYY-MM-DD
  createdAt: any;
}

interface MobileDataContextType {
  user: User | null;
  tasks: Task[];
  habits: Habit[];
  allHabits: Habit[];
  habitLogs: HabitLog[];
  notes: Note[];
  storageNodes: StorageNode[];
  goals: Goal[];
  customEvents: CustomEvent[];
  gymLogs: GymLog[];
  attendance: AttendanceSubject[];
  assignments: Assignment[];
  semesters: Semester[];
  semesterSubjects: SemesterSubject[];
  learningTopics: LearningTopic[];
  jobs: JobApplication[];
  weeklyReviews: WeeklyReview[];
  pomodoroSessions: PomodoroSession[];
  waterLogs: WaterLog[];
  sleepLogs: SleepLog[];
  googleAccessToken: string | null;
  loading: boolean;
  pendingTaskCount: number;
  todayHabits: Habit[];
  pinnedModules: string[];
  setPinnedModules: (modules: string[]) => void;
  userGymPlan: UserGymPlanDoc | null;
  updateMasterPlan: (dayIndex: number, planDay: GymPlanDay) => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const MobileDataContext = createContext<MobileDataContextType | null>(null);

export function useMobileData() {
  const ctx = useContext(MobileDataContext);
  if (!ctx) throw new Error('useMobileData must be used inside MobileDataProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MobileDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitsLogs] = useState<HabitLog[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [storageNodes, setStorageNodes] = useState<StorageNode[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [gymLogs, setGymLogs] = useState<GymLog[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSubject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<SemesterSubject[]>([]);
  const [learningTopics, setLearningTopics] = useState<LearningTopic[]>([]);
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>([]);
  const [pomodoroSessions, setPomodoroSessions] = useState<PomodoroSession[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinnedModules, setPinnedModulesState] = useState<string[]>(['Tasks', 'Calendar']);
  const [userGymPlan, setUserGymPlan] = useState<UserGymPlanDoc | null>(null);

  const updateMasterPlan = async (dayIndex: number, planDay: GymPlanDay) => {
    if (!user) return;
    const docRef = doc(db, 'user_gym_plans', user.uid);
    const newCustomDays = { ...(userGymPlan?.customDays || {}), [dayIndex]: planDay };
    await setDoc(docRef, { userId: user.uid, customDays: newCustomDays, updatedAt: Date.now() }, { merge: true });
  };

  // Load pinned modules
  useEffect(() => {
    AsyncStorage.getItem('@zentrack_pinned_modules').then(val => {
      if (val) setPinnedModulesState(JSON.parse(val));
    }).catch(console.error);
  }, []);

  const setPinnedModules = (mods: string[]) => {
    setPinnedModulesState(mods);
    AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(mods)).catch(console.error);
  };

  // Listen for auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setTasks([]);
        setHabits([]);
        setHabitsLogs([]);
        setNotes([]);
        setStorageNodes([]);
        setGoals([]);
        setCustomEvents([]);
        setAssignments([]);
        setSemesters([]);
        setSemesterSubjects([]);
        setLearningTopics([]);
        setJobs([]);
        setWeeklyReviews([]);
        setWaterLogs([]);
        setSleepLogs([]);
      }
    });
    return unsub;
  }, []);

  // Actionable Notification background response listener (Zero-Click Logging)
  useEffect(() => {
    if (!user) return;
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionIdentifier = response.actionIdentifier;
      const data = response.notification.request.content.data;
      
      try {
        if (actionIdentifier === 'mark_present' && data?.subjectId) {
          const docRef = doc(db, 'attendance_subjects', data.subjectId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const currentAttended = snap.data().classesAttended || 0;
            await setDoc(docRef, { classesAttended: currentAttended + 1 }, { merge: true });
          }
        } else if (actionIdentifier === 'snooze_15m' && data?.type === 'gym') {
          const trigger = new Date(Date.now() + 15 * 60 * 1000);
          await Notifications.scheduleNotificationAsync({
            content: { title: 'Gym Snooze ⏳', body: '15 minutes are up. Time to workout.', data },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger, channelId: 'default' } as any
          });
        }
      } catch (err) {
        console.error('[Notification Action Error]', err);
      }
    });
    return () => subscription.remove();
  }, [user]);

  // Load Google Workspace token from secure storage
  useEffect(() => {
    AsyncStorage.getItem('google_workspace_token').then((token) => {
      if (token) setGoogleAccessToken(token);
    });
  }, []);

  // Subscribe to Firestore collections when user is authenticated
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const uid = user.uid;
    const unsubs: (() => void)[] = [];

    // Tasks
    const tasksQ = query(collection(db, 'todos'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(tasksQ, (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
        setLoading(false);
      }, (err) => { console.error('[MobileData] tasks error', err); setLoading(false); })
    );

    // Habits
    const habitsQ = query(collection(db, 'habits'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(habitsQ, (snap) => {
        setHabits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Habit)));
      }, (err) => console.error('[MobileData] habits error', err))
    );

    // Habit Logs
    const habitLogsQ = query(collection(db, 'habitLogs'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(habitLogsQ, (snap) => {
        setHabitsLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HabitLog)));
      }, (err) => console.error('[MobileData] habitLogs error', err))
    );

    // Notes
    const notesQ = query(collection(db, 'notes'), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(notesQ, (snap) => {
        // manually sort by createdAt descending since we removed orderBy to avoid index requirement
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Note));
        docs.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setNotes(docs);
      }, (err) => console.error('[MobileData] notes error', err))
    );

    // --- NON-CRITICAL COLLECTIONS (LAZY LOADED) ---
    const lazyTimer = setTimeout(() => {
      // Storage Nodes
      const storageQ = query(collection(db, 'storage_nodes'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(storageQ, (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StorageNode));
          setStorageNodes(docs);
        }, (err) => console.error('[MobileData] storage_nodes error', err))
      );

      // Goals
      const goalsQ = query(collection(db, 'goals'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(goalsQ, (snap) => {
          setGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Goal)));
        }, (err) => console.error('[MobileData] goals error', err))
      );

      // Custom Events
      const eventsQ = query(collection(db, 'calendar_events'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(eventsQ, (snap) => {
          setCustomEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomEvent)));
        }, (err) => console.error('[MobileData] events error', err))
      );

      // Gym Logs
      const gymQ = query(collection(db, 'gymLogs'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(gymQ, (snap) => {
          setGymLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GymLog)));
        }, (err) => console.error('[MobileData] gym error', err))
      );

      // Attendance
      const attendanceQ = query(collection(db, 'attendance_subjects'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(attendanceQ, (snap) => {
          setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceSubject)));
        }, (err) => console.error('[MobileData] attendance error', err))
      );

      // Assignments
      const assignmentsQ = query(collection(db, 'assignments'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(assignmentsQ, (snap) => {
          setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
        }, (err) => console.error('[MobileData] assignments error', err))
      );

      // Semesters
      const semestersQ = query(collection(db, 'semesters'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(semestersQ, (snap) => {
          setSemesters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Semester)));
        }, (err) => console.error('[MobileData] semesters error', err))
      );

      // Semester Subjects
      const semesterSubjectsQ = query(collection(db, 'semester_subjects'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(semesterSubjectsQ, (snap) => {
          setSemesterSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SemesterSubject)));
        }, (err) => console.error('[MobileData] semester_subjects error', err))
      );

      // Learning Topics
      const learningTopicsQ = query(collection(db, 'learning_topics'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(learningTopicsQ, (snap) => {
          setLearningTopics(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LearningTopic)));
        }, (err) => console.error('[MobileData] learning_topics error', err))
      );

      // Jobs
      const jobsQ = query(collection(db, 'job_applications'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(jobsQ, (snap) => {
          setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobApplication)));
        }, (err) => console.error('[MobileData] jobs error', err))
      );

      // Weekly Reviews
      const reviewsQ = query(collection(db, 'weekly_reviews'), where('userId', '==', uid));
      unsubs.push(
        onSnapshot(reviewsQ, (snap) => {
          setWeeklyReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WeeklyReview)));
        }, (err) => console.error('[MobileData] weekly_reviews error', err))
      );

      // Pomodoro Sessions (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);
      const pomodoroQ = query(
        collection(db, 'pomodoro_sessions'),
        where('userId', '==', uid),
        where('date', '>=', thirtyDaysStr)
      );
      unsubs.push(
        onSnapshot(pomodoroQ, (snap) => {
          setPomodoroSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PomodoroSession)));
        }, (err) => console.error('[MobileData] pomodoro_sessions error', err))
      );

      // User Gym Plan
      unsubs.push(
        onSnapshot(doc(db, 'user_gym_plans', uid), (docSnap) => {
          if (docSnap.exists()) {
            setUserGymPlan({ id: docSnap.id, ...docSnap.data() } as unknown as UserGymPlanDoc);
          } else {
            setUserGymPlan(null);
          }
        }, (err) => console.error('[MobileData] user_gym_plans error', err))
      );
    }, 2000); // 2-second delay

    return () => {
      clearTimeout(lazyTimer);
      unsubs.forEach((u) => u());
    };
  }, [user?.uid]);

  // Sync tasks and events to local notifications whenever they change
  useEffect(() => {
    const handler = setTimeout(() => {
      scheduleTaskReminders(tasks, customEvents, gymLogs, attendance).catch(console.error);
    }, 2000);
    return () => clearTimeout(handler);
  }, [tasks, customEvents, gymLogs, attendance]);

  const pendingTaskCount = tasks.filter((t) => t.status === 'pending').length;

  // Active habits only
  const activeHabits = habits.filter(h => !h.archived);
  const todayHabits = activeHabits.slice(0, 5);

  return (
    <MobileDataContext.Provider
      value={{
        user,
        tasks,
        habits: activeHabits,
        allHabits: habits,
        habitLogs,
        notes,
        storageNodes,
        goals,
        customEvents,
        gymLogs,
        attendance,
        assignments,
        semesters,
        semesterSubjects,
        learningTopics,
        jobs,
        weeklyReviews,
        pomodoroSessions,
        waterLogs,
        sleepLogs,
        googleAccessToken,
        loading,
        pendingTaskCount,
        todayHabits,
        pinnedModules,
        setPinnedModules,
        userGymPlan,
        updateMasterPlan
      }}
    >
      {children}
    </MobileDataContext.Provider>
  );
}
