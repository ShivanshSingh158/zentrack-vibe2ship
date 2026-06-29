import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import type { Query, DocumentData } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { initGoogleCalendar, isSignedInToGoogle, signInWithGoogle, signOutGoogle, getTokenTimeRemaining, forceSilentRefresh, pollGoogleCalendarChanges } from '../services/googleCalendar';
import { loadUserGeminiKey } from '../services/userGeminiAuth';
import type { Task, CalendarEvent } from '../types/domain';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';

interface GlobalDataContextType {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  dailyLogs: any[];
  habitLogs: any[];
  habits: any[];
  jobs: any[];
  goals: any[];
  learningTopics: any[];
  gymLogs: any[];
  gymSchedule: any;
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
  googleStatus: 'checking' | 'connected' | 'disconnected';
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

  // ── Google Connection Status ────────────────────────────────────────────────
  // 'checking'    = we are in the middle of a silent token refresh attempt
  // 'connected'   = Google Workspace is authorized and tokens are valid
  // 'disconnected'= no valid token and silent refresh failed / no refresh token
  //
  // RULE: This system NEVER opens an OAuth popup automatically.
  // Popups must only fire when the user explicitly clicks a "Connect" button.
  const [googleStatus, setGoogleStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  // Attempt a silent refresh and update status accordingly.
  // Safe to call at any time — never opens a popup.
  const attemptSilentRefresh = async (): Promise<boolean> => {
    if (isSignedInToGoogle()) {
      setIsGoogleConnected(true);
      setGoogleStatus('connected');
      return true;
    }

    const refreshToken = localStorage.getItem('zen_gcal_refresh_token');
    if (!refreshToken) {
      setIsGoogleConnected(false);
      setGoogleStatus('disconnected');
      return false;
    }

    try {
      await forceSilentRefresh();
      const connected = isSignedInToGoogle();
      setIsGoogleConnected(connected);
      setGoogleStatus(connected ? 'connected' : 'disconnected');
      return connected;
    } catch (err) {
      console.warn('[GoogleWorkspace] Silent refresh failed:', err);
      // Clear stale tokens so we accurately report disconnected state
      localStorage.removeItem('zen_gcal_access_token');
      localStorage.removeItem('zen_gcal_token_expiry');
      localStorage.removeItem('zen_gcal_refresh_token');
      setIsGoogleConnected(false);
      setGoogleStatus('disconnected');
      return false;
    }
  };

  // On mount: initialize GIS script + attempt silent restore
  useEffect(() => {
    initGoogleCalendar().then(() => attemptSilentRefresh());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Periodic Health Monitor ─────────────────────────────────────────────────
  // Every 5 minutes AND every time the page becomes visible (user returns to tab):
  // check if the token is still valid and refresh silently if needed.
  // This handles the Google 60-minute session timeout gracefully.
  useEffect(() => {
    const healthCheckFn = async () => {
      const timeLeft = getTokenTimeRemaining();
      const hasRefreshToken = !!localStorage.getItem('zen_gcal_refresh_token');

      if (!hasRefreshToken) return; // Never was connected — nothing to do

      if (timeLeft === 0) {
        // Token fully expired — attempt silent refresh
        console.log('[GoogleWorkspace] Token expired. Attempting silent refresh...');
        await attemptSilentRefresh();
      } else if (timeLeft < 10 * 60 * 1000) {
        // Token expiring within 10 min — proactively refresh
        console.log('[GoogleWorkspace] Token near expiry, proactively refreshing...');
        await attemptSilentRefresh();
      }
      // else: token is fine, do nothing
    };

    // Check every 5 minutes
    const intervalId = setInterval(healthCheckFn, 5 * 60 * 1000);

    // Also re-check whenever the user switches back to this tab
    // This catches the case where the app was in the background for >60 min
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        healthCheckFn();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Listen for external token events (e.g., from signInWithGoogle success)
    const handleRefreshed = () => { setIsGoogleConnected(true); setGoogleStatus('connected'); };
    const handleDisconnected = () => { setIsGoogleConnected(false); setGoogleStatus('disconnected'); };
    window.addEventListener('google-token-refreshed', handleRefreshed);
    window.addEventListener('google-token-disconnected', handleDisconnected);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('google-token-refreshed', handleRefreshed);
      window.removeEventListener('google-token-disconnected', handleDisconnected);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Initiates a user-interactive Google OAuth popup.
   * MUST only be called from a user-gesture handler (button click).
   * Never call this from useEffect, setInterval, or agent code.
   */
  const connectGoogle = async (): Promise<void> => {
    await signInWithGoogle();
    const connected = isSignedInToGoogle();
    setIsGoogleConnected(connected);
    setGoogleStatus(connected ? 'connected' : 'disconnected');
    // ✅ FIX: After connecting, immediately poll calendar so agents see live events
    if (connected) {
      try {
        const events = await pollGoogleCalendarChanges();
        if (events && events.length > 0) setCalendarEvents(events);
      } catch (err) {
        console.warn('[GlobalData] Calendar poll after connect failed:', err);
      }
    }
  };

  // ── Calendar Poll (every 15 min while Google is connected) ─────────────────
  // ✅ FIX: calendarEvents was always [] — agents always saw "0 events today"
  // Now we poll Google Calendar and populate calendarEvents state
  useEffect(() => {
    if (!isGoogleConnected) return;
    const doPoll = async () => {
      try {
        const events = await pollGoogleCalendarChanges();
        if (events && events.length > 0) setCalendarEvents(events);
      } catch (err) {
        console.warn('[GlobalData] Calendar poll failed:', err);
      }
    };
    doPoll(); // immediate poll on connect
    const intervalId = setInterval(doPoll, 15 * 60 * 1000); // re-poll every 15 min
    return () => clearInterval(intervalId);
  }, [isGoogleConnected]);


  const disconnectGoogle = () => {
    signOutGoogle();
    setIsGoogleConnected(false);
    setGoogleStatus('disconnected');
    window.dispatchEvent(new CustomEvent('google-token-disconnected'));
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
      pomodoroSessions, userPreferences, isLoading,
      isGoogleConnected, googleStatus, connectGoogle, disconnectGoogle,
      gymSchedule: GYM_PLAN.find(p => p.dayIndex === WEEKDAY_TO_PLAN[new Date().getDay()]) || { isRest: true, name: 'Rest Day' }
    } as any}>
      {children}
    </GlobalDataContext.Provider>
  );
};
