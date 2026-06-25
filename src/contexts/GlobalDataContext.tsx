import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, getDocs, writeBatch, doc } from 'firebase/firestore';
import type { Query, DocumentData } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { initGoogleCalendar, isSignedInToGoogle, signInWithGoogle, signOutGoogle, getTokenTimeRemaining } from '../services/googleCalendar';
import { loadUserGeminiKey } from '../services/userGeminiAuth';

interface GlobalDataContextType {
  tasks: any[];
  calendarEvents: any[];
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
  userPreferences: {
    peakEnergyTime: 'morning' | 'midday' | 'evening';
    isGymDay?: boolean;
    gymLogged?: boolean;
  };
  isLoading: boolean;
  isGoogleConnected: boolean;
  connectGoogle: () => Promise<void>;
  disconnectGoogle: () => void;
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
  const [tasks, setTasks] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
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
  const [userPreferences, setUserPreferences] = useState<GlobalDataContextType['userPreferences']>({ peakEnergyTime: 'morning' });
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  useEffect(() => {
    initGoogleCalendar().then(() => setIsGoogleConnected(isSignedInToGoogle()));
  }, []);

  const connectGoogle = async () => {
    await signInWithGoogle();
    setIsGoogleConnected(isSignedInToGoogle());
  };

  // ── Auto-Login Health Monitor ──────────────────────────────────────────────
  // Every 5 minutes, check if the Google token is near expiry.
  // If token expires within 10 minutes AND user was previously connected,
  // silently refresh it WITHOUT requiring any user interaction.
  useEffect(() => {
    const healthCheck = setInterval(async () => {
      const timeLeft = getTokenTimeRemaining();
      const wasConnected = !!localStorage.getItem('zen_gcal_access_token');

      if (wasConnected && timeLeft < 10 * 60 * 1000 && timeLeft > 0) {
        // Token is about to expire — silently refresh
        console.log('[AutoLogin] Token expires in', Math.round(timeLeft / 60000), 'mins. Silently refreshing...');
        try {
          await signInWithGoogle();
          setIsGoogleConnected(true);
          console.log('[AutoLogin] ✅ Google token silently refreshed.');
        } catch (err) {
          console.warn('[AutoLogin] Silent refresh failed. Will retry or prompt on next agent call.', err);
        }
      } else if (wasConnected && timeLeft === 0) {
        // Token has expired — update UI state
        setIsGoogleConnected(false);
      }
    }, 5 * 60 * 1000); // check every 5 minutes

    // Also listen for the google-token-refreshed event from the proactive refresh timer
    const handleRefreshed = () => setIsGoogleConnected(true);
    window.addEventListener('google-token-refreshed', handleRefreshed);

    return () => {
      clearInterval(healthCheck);
      window.removeEventListener('google-token-refreshed', handleRefreshed);
    };
  }, []);

  const disconnectGoogle = () => {
    signOutGoogle();
    setIsGoogleConnected(false);
  };

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
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      cleanupDataListeners();

      if (!user) {
        setTasks([]); setDailyLogs([]); setHabitLogs([]); setHabits([]);
        setJobs([]); setGoals([]); setLearningTopics([]); setGymLogs([]);
        setNotes([]); setAttendanceSubjects([]); setAssignments([]); setPomodoroSessions([]);
        setIsLoading(false);
        return;
      }

      const uid = user.uid;
      setIsLoading(true);

      // ── Load personal Gemini key so ALL AI calls use it immediately ──
      loadUserGeminiKey().then(key => {
        if (key) console.log('[ZenAI] ✅ Personal Gemini key loaded for user.');
      });

      const TOTAL = 14;
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
        safeSnapshot(query(collection(db, 'todos'), where('userId', '==', uid)), makeHandler(setTasks), 'todos'),
        safeSnapshot(query(collection(db, 'calendar_events'), where('userId', '==', uid)), makeHandler(setCalendarEvents), 'calendar_events'),
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
        onSnapshot(doc(db, 'users', uid), (snap) => {
          if (snap.exists() && snap.data().preferences) {
            setUserPreferences(snap.data().preferences);
          }
          onFirstFire();
        })
      ];

      dataUnsubsRef.current = unsubs;
      failsafeRef.current = setTimeout(() => setIsLoading(false), 3000);
    });

    return () => {
      unsubAuth();
      cleanupDataListeners();
    };
  }, []);

  return (
    <GlobalDataContext.Provider value={{
      tasks, calendarEvents, dailyLogs, habitLogs, habits, jobs, goals,
      learningTopics, gymLogs, notes, attendanceSubjects, assignments,
      pomodoroSessions, userPreferences,
      isLoading, isGoogleConnected, connectGoogle, disconnectGoogle
    } as any}>
      {children}
    </GlobalDataContext.Provider>
  );
};
