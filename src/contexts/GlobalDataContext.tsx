import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, limit, orderBy, setDoc } from 'firebase/firestore';

import type { Query, DocumentData } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { initGoogleCalendar, isSignedInToGoogle, signInWithGoogle, signOutGoogle, getTokenTimeRemaining, forceSilentRefresh, pollGoogleCalendarChanges } from '../services/googleCalendar';
import { loadUserGeminiKey } from '../services/userGeminiAuth';
import type { Task, CalendarEvent } from '../types/domain';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../features/gym/data/gymPlan';
import {
  syncXPWithFirestore,
  getLevel,
  awardXP,
  subscribeXPChanges,
  XP_SOURCES
} from '../services/xpSystem';
import type { XPResult, XPState } from '../services/xpSystem';

interface GlobalDataContextType {
  tasks: Task[];
  // ✅ D1 FIX: calendarEvents comes from Google Calendar API polling, not Firestore.
  // Stored in local state here so agents have immediate access after Google connect.
  calendarEvents: CalendarEvent[];
  dailyLogs: any[];
  habitLogs: any[];
  habits: any[];
  jobs: any[];
  goals: any[];
  learningTopics: any[];
  gymLogs: any[];
  waterLogs: any[];
  waterGoalMl: number;
  setWaterGoal: (targetMl: number) => Promise<void>;
  sleepLogs: any[];
  gymSchedule: any;
  notes: any[];
  attendanceSubjects: any[];
  attendanceLogs: any[];
  attendanceHolidays: string[];
  allHabits: any[];
  assignments: any[];
  pomodoroSessions: any[];
  userXP: number;
  xpState: XPState;
  awardXP: (source: keyof typeof XP_SOURCES) => Promise<XPResult>;
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
  // ✅ BUG-H1 + D1: calendarEvents from Google Calendar API (not Firestore)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  // ✅ D3: dailyLogs kept for type compat but subscription removed (no global consumers)
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [habitLogs, setHabitLogs] = useState<any[]>([]);

  const [habits, setHabits] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [learningTopics, setLearningTopics] = useState<any[]>([]);
  const [gymLogs, setGymLogs] = useState<any[]>([]);
  const [waterLogs, setWaterLogs] = useState<any[]>([]);
  const [waterGoalMl, setWaterGoalMl] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('zentrack_water_goal_ml') || localStorage.getItem('@zentrack_water_target');
      const val = parseInt(saved || '0', 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return 3800;
  });

  const setWaterGoal = async (targetMl: number) => {
    if (!targetMl || isNaN(targetMl)) return;
    setWaterGoalMl(targetMl);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zentrack_water_goal_ml', String(targetMl));
    }
    const user = auth.currentUser;
    if (user?.uid) {
      try {
        await setDoc(doc(db, 'user_profiles', user.uid), {
          waterGoalMl: targetMl,
          waterTarget: targetMl,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (e) {
        console.warn('[GlobalData] Failed to save water goal to user_profiles:', e);
      }
    }
  };

  const [sleepLogs, setSleepLogs] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [attendanceSubjects, setAttendanceSubjects] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [attendanceHolidays, setAttendanceHolidays] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [pomodoroSessions, setPomodoroSessions] = useState<any[]>([]);
  const [userPreferences, setUserPreferences] = useState<GlobalDataContextType['userPreferences']>({ peakEnergyTime: 'morning' });
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  // ── Universal Real-Time XP State ────────────────────────────────────────────
  const [userXP, setUserXP] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      return parseInt(localStorage.getItem('zentrack_xp_v1') || '0', 10);
    }
    return 0;
  });

  const xpState = useMemo(() => getLevel(userXP), [userXP]);

  useEffect(() => {
    const unsub = subscribeXPChanges((data) => {
      setUserXP(data.xp);
    });
    return () => unsub();
  }, []);

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

    const hasConnectedFlag = localStorage.getItem('zen_gcal_has_refresh_token');
    if (!hasConnectedFlag) {
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
      const hasRefreshToken = !!localStorage.getItem('zen_gcal_has_refresh_token');

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
  const connectGoogle = (): Promise<void> => {
    return signInWithGoogle().then(() => {
      const connected = isSignedInToGoogle();
      setIsGoogleConnected(connected);
      setGoogleStatus(connected ? 'connected' : 'disconnected');
      if (connected) {
        pollGoogleCalendarChanges()
          .then(events => {
            if (events && events.length > 0) setCalendarEvents(events);
          })
          .catch(err => {
            console.warn('[GlobalData] Calendar poll after connect failed:', err);
          });
      }
    });
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
  };

  // ✅ BUG-H1: Poll Google Calendar every 3 minutes if connected.
  // Polling runs entirely on the main thread via standard fetch.
  useEffect(() => {
    if (!isGoogleConnected) {
      setCalendarEvents([]);
      return;
    }
    const updateEvents = (events: CalendarEvent[]) => {
      setCalendarEvents(events);
    };
    const pollInterval = pollGoogleCalendarChanges(updateEvents, 180000);
    return () => clearInterval(pollInterval);
  }, [isGoogleConnected]);

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

  // Auth + Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      cleanupDataListeners();

      if (!currentUser) {
        setTasks([]);
        setHabitLogs([]);
        setHabits([]);
        setJobs([]);
        setGoals([]);
        setLearningTopics([]);
        setGymLogs([]);
        setWaterLogs([]);
        setSleepLogs([]);
        setNotes([]);
        setAttendanceSubjects([]);
        setAttendanceLogs([]);
        setAttendanceHolidays([]);
        setAssignments([]);
        setPomodoroSessions([]);
        setIsLoading(false);
        return;
      }

      const uid = currentUser.uid;
      loadUserGeminiKey(uid);
      setIsLoading(true);

      let firedCount = 0;
      const TOTAL = 14;
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

      let mobileWater: any[] = [];
      let legacyWater: any[] = [];
      const handleWaterMerge = () => {
        const seen = new Set<string>();
        const combined: any[] = [];
        for (const item of [...mobileWater, ...legacyWater]) {
          if (item.id && seen.has(item.id)) continue;
          if (item.id) seen.add(item.id);
          combined.push(item);
        }
        setWaterLogs(combined);
      };

      let mobileSleep: any[] = [];
      let legacySleep: any[] = [];
      const handleSleepMerge = () => {
        const seen = new Set<string>();
        const combined: any[] = [];
        for (const item of [...mobileSleep, ...legacySleep]) {
          if (item.id && seen.has(item.id)) continue;
          if (item.id) seen.add(item.id);
          combined.push(item);
        }
        setSleepLogs(combined);
      };

      const unsubs: (() => void)[] = [
        safeSnapshot(query(collection(db, 'todos'), where('userId', '==', uid)), makeHandler(setTasks), 'todos'),
        safeSnapshot(query(collection(db, 'habit_logs'), where('userId', '==', uid), limit(365)), makeHandler(setHabitLogs), 'habit_logs'),
        safeSnapshot(query(collection(db, 'habits'), where('userId', '==', uid)), makeHandler(setHabits), 'habits'),
        safeSnapshot(query(collection(db, 'job_applications'), where('userId', '==', uid)), makeHandler(setJobs), 'jobs'),
        safeSnapshot(query(collection(db, 'goals'), where('userId', '==', uid)), makeHandler(setGoals), 'goals'),
        safeSnapshot(query(collection(db, 'learning_topics'), where('userId', '==', uid)), makeHandler(setLearningTopics), 'learning_topics'),
        // ✅ D2: limit(365) — one year of gym history sufficient for fitness analytics
        safeSnapshot(query(collection(db, 'gymLogs'), where('userId', '==', uid), limit(365)), makeHandler(setGymLogs), 'gymLogs'),
        // ✅ Real-time Firestore sync with mobile app water & sleep logs (both mobile snake_case and web formats)
        safeSnapshot(query(collection(db, 'water_logs'), where('userId', '==', uid), limit(365)), (docs) => {
          mobileWater = docs;
          handleWaterMerge();
          onFirstFire();
        }, 'water_logs'),
        safeSnapshot(query(collection(db, 'waterLogs'), where('userId', '==', uid), limit(365)), (docs) => {
          legacyWater = docs;
          handleWaterMerge();
        }, 'waterLogs'),
        safeSnapshot(query(collection(db, 'sleep_logs'), where('userId', '==', uid), limit(365)), (docs) => {
          mobileSleep = docs;
          handleSleepMerge();
          onFirstFire();
        }, 'sleep_logs'),
        safeSnapshot(query(collection(db, 'sleepLogs'), where('userId', '==', uid), limit(365)), (docs) => {
          legacySleep = docs;
          handleSleepMerge();
        }, 'sleepLogs'),
        safeSnapshot(query(collection(db, 'notes'), where('userId', '==', uid)), makeHandler(setNotes), 'notes'),
        safeSnapshot(query(collection(db, 'attendance_subjects'), where('userId', '==', uid)), makeHandler(setAttendanceSubjects), 'attendance_subjects'),
        safeSnapshot(query(collection(db, 'attendance_logs'), where('userId', '==', uid), limit(365)), makeHandler(setAttendanceLogs), 'attendance_logs'),
        safeSnapshot(query(collection(db, 'attendance_holidays'), where('userId', '==', uid)), (docs) => setAttendanceHolidays(docs.map((d: any) => d.date).filter(Boolean)), 'attendance_holidays'),
        safeSnapshot(query(collection(db, 'assignments'), where('userId', '==', uid)), makeHandler(setAssignments), 'assignments'),
        safeSnapshot(query(collection(db, 'pomodoro_sessions'), where('userId', '==', uid)), makeHandler(setPomodoroSessions), 'pomodoro_sessions'),
        // users doc listener
        onSnapshot(doc(db, 'users', uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.preferences) {
              setUserPreferences(data.preferences);
            }
            const goal = data?.waterGoalMl || data?.waterTarget || data?.preferences?.waterTarget || data?.preferences?.waterGoalMl;
            if (typeof goal === 'number' && goal > 0) {
              setWaterGoalMl(goal);
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('zentrack_water_goal_ml', String(goal));
              }
            }
          }
          onFirstFire();
        }),
        // ✅ user_profiles doc listener — Real-time cross-platform XP & Water Target sync with mobile app
        onSnapshot(doc(db, 'user_profiles', uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data?.xp === 'number') {
              syncXPWithFirestore(data.xp);
            }
            const goal = data?.waterGoalMl || data?.waterTarget || data?.preferences?.waterTarget || data?.preferences?.waterGoalMl;
            if (typeof goal === 'number' && goal > 0) {
              setWaterGoalMl(goal);
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('zentrack_water_goal_ml', String(goal));
              }
            }
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

  // Memoize gymSchedule so it only recomputes once per day
  const gymSchedule = useMemo(
    () => GYM_PLAN.find(p => p.dayIndex === WEEKDAY_TO_PLAN[new Date().getDay()]) || { isRest: true, name: 'Rest Day' },
    []
  );

  return (
    <GlobalDataContext.Provider value={{
      tasks, calendarEvents, dailyLogs, habitLogs, habits, allHabits: habits, jobs, goals,
      learningTopics, gymLogs, waterLogs, waterGoalMl, setWaterGoal, sleepLogs, notes,
      attendanceSubjects, attendanceLogs, attendanceHolidays, assignments, pomodoroSessions,
      userXP, xpState, awardXP, userPreferences, isLoading, gymSchedule, isGoogleConnected,
      googleStatus, connectGoogle, disconnectGoogle,
    } as any}>
      {children}
    </GlobalDataContext.Provider>
  );
};
