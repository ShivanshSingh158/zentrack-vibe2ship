/**
 * AcademicContext — ZenTrack Mobile
 *
 * Owns: attendance, assignments, semesters, semesterSubjects.
 *
 * Subscription strategy: DEMAND-BASED + OFFLINE-FIRST.
 * On mount: reads all academic data from AsyncStorage instantly (~5ms).
 * Academic screens show real data immediately, even when offline.
 * Firestore snapshots silently update the cache when online.
 */
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { AttendanceSubject, AttendanceLog, Assignment, Semester, SemesterSubject } from "../MobileDataContext";
import { readAcademicCache, writeAcademicCache } from "../../utils/domainCache";
import { parseAttendanceSubject, parseAttendanceLog, parseAssignment } from "../../utils/schemaGuards";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface AcademicContextType {
  attendance: AttendanceSubject[];
  attendanceLogs: AttendanceLog[];
  assignments: Assignment[];
  semesters: Semester[];
  semesterSubjects: SemesterSubject[];
  holidays: string[];
  ensureSubscribed: () => void;
  // Optimistic write helpers — WhatsApp pattern: show instantly, Firestore syncs in background.
  optimisticAddSubject: (subject: AttendanceSubject) => void;
  optimisticDeleteSubject: (subjectId: string) => void;
  optimisticUpdateAttendance: (subjectId: string, partial: Partial<AttendanceSubject>) => void;
  optimisticAddAssignment: (assignment: Assignment) => void;
  optimisticUpdateAssignment: (assignmentId: string, partial: Partial<Assignment>) => void;
  optimisticDeleteAssignment: (assignmentId: string) => void;
  optimisticAddAttendanceLog: (log: AttendanceLog) => void;
  optimisticRemoveAttendanceLog: (logId: string) => void;
}

const DEFAULT_ACADEMIC_DATA: AcademicContextType = {
  attendance: [],
  attendanceLogs: [],
  assignments: [],
  semesters: [],
  semesterSubjects: [],
  holidays: [],
  ensureSubscribed: () => {},
  optimisticAddSubject: () => {},
  optimisticDeleteSubject: () => {},
  optimisticUpdateAttendance: () => {},
  optimisticAddAssignment: () => {},
  optimisticUpdateAssignment: () => {},
  optimisticDeleteAssignment: () => {},
  optimisticAddAttendanceLog: () => {},
  optimisticRemoveAttendanceLog: () => {},
};

const AcademicContext = createContext<AcademicContextType | null>(null);

export function useAcademicData(): AcademicContextType {
  const ctx = useContext(AcademicContext);
  if (!ctx) {
    return DEFAULT_ACADEMIC_DATA;
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function AcademicProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { uid: string } | null;
}) {
  const [attendance, setAttendance]           = useState<AttendanceSubject[]>([]);
  const [attendanceLogs, setAttendanceLogs]   = useState<AttendanceLog[]>([]);
  const [assignments, setAssignments]         = useState<Assignment[]>([]);
  const [semesters, setSemesters]             = useState<Semester[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<SemesterSubject[]>([]);
  const [holidays, setHolidays]               = useState<string[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  // ── Listener auto-restart on error ───────────────────────────────────────
  // Firebase ID tokens expire every 60 min. A network blip at expiry silently
  // kills onSnapshot listeners. This counter triggers a clean restart.
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[Academic] ${context} listener error — restarting in 5s`, err.message);
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

  // ── Foreground reconnect: restart listeners after long background ─────────
  // AppNavigator emits 'firestore_force_reconnect' on every AppState: active.
  // Resets subscribedRef and bumps subscriptionVersion to force a clean
  // listener teardown and reopen after the app returns from 6+ hours background.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[Academic] foreground reconnect — restarting Firestore listeners');
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user]);

  // ── Offline-first boot: seed from AsyncStorage when user uid is available ──
  // Re-runs on uid change so screens show cached data immediately on user restore.
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (!userUid) return;
    let cancelled = false;
    readAcademicCache().then(cached => {
      if (cancelled) return;
      if (Array.isArray(cached.attendance))       setAttendance(cached.attendance);
      if (Array.isArray(cached.attendanceLogs))   setAttendanceLogs(cached.attendanceLogs);
      if (Array.isArray(cached.assignments))      setAssignments(cached.assignments);
      if (Array.isArray(cached.semesters))        setSemesters(cached.semesters);
      if (Array.isArray(cached.semesterSubjects)) setSemesterSubjects(cached.semesterSubjects);
    });
    return () => { cancelled = true; };
  }, [userUid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseAttendanceSubject(d.data(), d.id)); setAttendance(fresh); writeAcademicCache({ attendance: fresh }); },
      scheduleListenerRestart("attendance")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseAttendanceLog(d.data(), d.id)); setAttendanceLogs(fresh); writeAcademicCache({ attendanceLogs: fresh }); },
      scheduleListenerRestart("attendanceLogs")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseAssignment(d.data(), d.id)); setAssignments(fresh); writeAcademicCache({ assignments: fresh }); },
      scheduleListenerRestart("assignments")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTERS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester)); setSemesters(fresh); writeAcademicCache({ semesters: fresh }); },
      scheduleListenerRestart("semesters")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTER_SUBJECTS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject)); setSemesterSubjects(fresh); writeAcademicCache({ semesterSubjects: fresh }); },
      scheduleListenerRestart("semesterSubjects")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => (d.data() as any).date).filter(Boolean); setHolidays(fresh); },
      scheduleListenerRestart("holidays")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
    // BUG FIX: missing cleanup return — without this, subscriptionVersion bumps
    // cause new listeners to open WITHOUT tearing down the old (dead) ones first,
    // resulting in duplicate listener registrations.
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user, subscriptionVersion, openSubscriptions]);

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user, openSubscriptions]);

  // Optimistic write helpers
  const optimisticAddSubject = (subject: AttendanceSubject) => {
    setAttendance(prev => {
      const next = [subject, ...prev];
      writeAcademicCache({ attendance: next });
      return next;
    });
  };

  const optimisticDeleteSubject = (subjectId: string) => {
    setAttendance(prev => {
      const next = prev.filter(s => s.id !== subjectId);
      writeAcademicCache({ attendance: next });
      return next;
    });
  };

  const optimisticUpdateAttendance = (subjectId: string, partial: Partial<AttendanceSubject>) => {
    setAttendance(prev => {
      const next = prev.map(s => s.id === subjectId ? { ...s, ...partial } : s);
      writeAcademicCache({ attendance: next });
      return next;
    });
  };

  const optimisticAddAssignment = (assignment: Assignment) => {
    setAssignments(prev => {
      const next = [assignment, ...prev];
      writeAcademicCache({ assignments: next });
      return next;
    });
  };

  const optimisticUpdateAssignment = (assignmentId: string, partial: Partial<Assignment>) => {
    setAssignments(prev => {
      const next = prev.map(a => a.id === assignmentId ? { ...a, ...partial } : a);
      writeAcademicCache({ assignments: next });
      return next;
    });
  };

  const optimisticDeleteAssignment = (assignmentId: string) => {
    setAssignments(prev => {
      const next = prev.filter(a => a.id !== assignmentId);
      writeAcademicCache({ assignments: next });
      return next;
    });
  };

  const optimisticAddAttendanceLog = (log: AttendanceLog) => {
    setAttendanceLogs(prev => {
      const next = [log, ...prev];
      writeAcademicCache({ attendanceLogs: next });
      return next;
    });
  };

  const optimisticRemoveAttendanceLog = (logId: string) => {
    setAttendanceLogs(prev => {
      const next = prev.filter(l => l.id !== logId);
      writeAcademicCache({ attendanceLogs: next });
      return next;
    });
  };

  const value = useMemo(() => ({
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    ensureSubscribed, optimisticAddSubject, optimisticDeleteSubject,
    optimisticUpdateAttendance, optimisticAddAssignment,
    optimisticUpdateAssignment, optimisticDeleteAssignment, optimisticAddAttendanceLog, optimisticRemoveAttendanceLog
  }), [
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays, ensureSubscribed
  ]);

  return (
    <AcademicContext.Provider value={value}>
      {children}
    </AcademicContext.Provider>
  );
}
