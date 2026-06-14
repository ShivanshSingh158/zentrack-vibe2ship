import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { Query, DocumentData } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';

interface GlobalDataContextType {
  todos: any[];
  dailyLogs: any[];
  habitLogs: any[];
  habits: any[];
  jobs: any[];
  goals: any[];
  learningTopics: any[];
  gymLogs: any[];
  notes: any[];
  attendanceSubjects: any[];
  assignments: any[];
  pomodoroSessions: any[];
  isLoading: boolean;
}

const GlobalDataContext = createContext<GlobalDataContextType | null>(null);

export const useGlobalData = () => {
  const context = useContext(GlobalDataContext);
  if (!context) throw new Error('useGlobalData must be used within GlobalDataProvider');
  return context;
};

// Safely attach an onSnapshot listener, returning its unsubscribe fn.
// If attachment fails, returns a no-op unsub so one bad collection can't block others.
function safeSnapshot(
  q: Query<DocumentData>,
  setter: (docs: any[]) => void,
  label: string
): () => void {
  try {
    return onSnapshot(
      q,
      (snap) => {
        try {
          setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error(`[GlobalData] Error processing ${label}:`, e);
        }
      },
      (err) => console.warn(`[GlobalData] ${label} listener error:`, err)
    );
  } catch (e) {
    console.error(`[GlobalData] Failed to attach ${label} listener:`, e);
    return () => {};
  }
}

export const GlobalDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todos, setTodos] = useState<any[]>([]);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [habitLogs, setHabitLogs] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [learningTopics, setLearningTopics] = useState<any[]>([]);
  const [gymLogs, setGymLogs] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [attendanceSubjects, setAttendanceSubjects] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [pomodoroSessions, setPomodoroSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Ref to hold current data listener cleanup functions
  // so we can tear them down when auth state changes
  const dataUnsubsRef = useRef<(() => void)[]>([]);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupDataListeners = () => {
    dataUnsubsRef.current.forEach(u => u());
    dataUnsubsRef.current = [];
    if (failsafeRef.current) {
      clearTimeout(failsafeRef.current);
      failsafeRef.current = null;
    }
  };

  useEffect(() => {
    // ── Watch auth state; re-attach data listeners on login, clean up on logout ──
    // Fixes the timing race where reading auth.currentUser at mount could be null.
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Always clean up previous listeners before attaching new ones
      cleanupDataListeners();

      if (!user) {
        setTodos([]); setDailyLogs([]); setHabitLogs([]); setHabits([]);
        setJobs([]); setGoals([]); setLearningTopics([]); setGymLogs([]);
        setNotes([]); setAttendanceSubjects([]); setAssignments([]); setPomodoroSessions([]);
        setIsLoading(false);
        return;
      }

      const uid = user.uid;
      setIsLoading(true);

      // Track first-fire per listener to know when initial load is done
      const TOTAL = 12;
      let firedCount = 0;
      const onFirstFire = () => {
        firedCount++;
        if (firedCount >= TOTAL) setIsLoading(false);
      };

      const makeHandler = (setter: (d: any[]) => void) => {
        let firstFired = false;
        return (docs: any[]) => {
          setter(docs);
          if (!firstFired) { firstFired = true; onFirstFire(); }
        };
      };

      const unsubs: (() => void)[] = [
        safeSnapshot(query(collection(db, 'todos'), where('userId', '==', uid)), makeHandler(setTodos), 'todos'),
        safeSnapshot(query(collection(db, 'daily_logs'), where('userId', '==', uid)), makeHandler(setDailyLogs), 'daily_logs'),
        safeSnapshot(query(collection(db, 'habits'), where('userId', '==', uid)), makeHandler(setHabits), 'habits'),
        safeSnapshot(query(collection(db, 'habit_logs'), where('userId', '==', uid)), makeHandler(setHabitLogs), 'habit_logs'),
        safeSnapshot(query(collection(db, 'job_applications'), where('userId', '==', uid)), makeHandler(setJobs), 'jobs'),
        safeSnapshot(query(collection(db, 'goals'), where('userId', '==', uid)), makeHandler(setGoals), 'goals'),
        safeSnapshot(query(collection(db, 'learning_topics'), where('userId', '==', uid)), makeHandler(setLearningTopics), 'learning_topics'),
        safeSnapshot(query(collection(db, 'gymLogs'), where('userId', '==', uid)), makeHandler(setGymLogs), 'gymLogs'),
        safeSnapshot(query(collection(db, 'notes'), where('userId', '==', uid)), makeHandler(setNotes), 'notes'),
        safeSnapshot(query(collection(db, 'attendance_subjects'), where('userId', '==', uid)), makeHandler(setAttendanceSubjects), 'attendance_subjects'),
        safeSnapshot(query(collection(db, 'assignments'), where('userId', '==', uid)), makeHandler(setAssignments), 'assignments'),
        safeSnapshot(query(collection(db, 'pomodoro_sessions'), where('userId', '==', uid)), makeHandler(setPomodoroSessions), 'pomodoro_sessions'),
      ];

      dataUnsubsRef.current = unsubs;

      // Failsafe: if some empty collections never fire their first snapshot,
      // still clear the loading state after 3 seconds
      failsafeRef.current = setTimeout(() => setIsLoading(false), 3000);
    });

    return () => {
      unsubAuth();
      cleanupDataListeners();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GlobalDataContext.Provider value={{
      todos, dailyLogs, habitLogs, habits, jobs, goals,
      learningTopics, gymLogs, notes, attendanceSubjects, assignments,
      pomodoroSessions,
      isLoading
    }}>
      {children}
    </GlobalDataContext.Provider>
  );
};
