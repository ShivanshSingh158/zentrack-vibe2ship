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
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { AttendanceSubject, AttendanceLog, Assignment, Semester, SemesterSubject } from "../MobileDataContext";
import { readAcademicCache, writeAcademicCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync } from "../../utils/bootManifest";
import { parseAttendanceSubject, parseAttendanceLog, parseAssignment, areItemsEqual } from "../../utils/schemaGuards";

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
  optimisticUpdateAttendanceLog: (logId: string, partial: Partial<AttendanceLog>) => void;
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
  optimisticUpdateAttendanceLog: () => {},
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
  const initialManifest = getBootManifestSync();
  const [attendance, setAttendance]           = useState<AttendanceSubject[]>(initialManifest?.attendance ?? []);
  const [attendanceLogs, setAttendanceLogs]   = useState<AttendanceLog[]>(initialManifest?.attendanceLogs ?? []);
  const [assignments, setAssignments]         = useState<Assignment[]>(initialManifest?.assignments ?? []);
  const [semesters, setSemesters]             = useState<Semester[]>(initialManifest?.semesters ?? []);
  const [semesterSubjects, setSemesterSubjects] = useState<SemesterSubject[]>(initialManifest?.semesterSubjects ?? []);
  const [holidays, setHolidays]               = useState<string[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  // Fallback hydration: handles cold-start race conditions seamlessly
  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        setAttendance(prev => prev.length === 0 && (manifest.attendance?.length ?? 0) > 0 ? manifest.attendance : prev);
        setAttendanceLogs(prev => prev.length === 0 && (manifest.attendanceLogs?.length ?? 0) > 0 ? manifest.attendanceLogs : prev);
        setAssignments(prev => prev.length === 0 && (manifest.assignments?.length ?? 0) > 0 ? manifest.assignments : prev);
        setSemesters(prev => prev.length === 0 && (manifest.semesters?.length ?? 0) > 0 ? manifest.semesters : prev);
        setSemesterSubjects(prev => prev.length === 0 && (manifest.semesterSubjects?.length ?? 0) > 0 ? manifest.semesterSubjects : prev);
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, []);
  // OFFLINE-FIRST GUARD: if we seeded from cache, ignore empty memoryLocalCache snapshots.
  const hasCachedDataRef = useRef(
    (initialManifest?.attendance?.length ?? 0) > 0 ||
    (initialManifest?.assignments?.length ?? 0) > 0 ||
    (initialManifest?.semesters?.length ?? 0) > 0
  );

  // ── Listener auto-restart on error ───────────────────────────────────────
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
  }, [user?.uid]);

  // ── Offline-first boot: seed ALL academic collections from boot manifest ───
  // If getBootManifestSync() already populated state on Frame 0, this does 0 re-renders.
  useEffect(() => {
    let cancelled = false;
    loadBootManifest().then(manifest => {
      if (cancelled) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if (attendance.length === 0 && Array.isArray(manifest.attendance) && manifest.attendance.length > 0)             { setAttendance(manifest.attendance); seeded = true; }
        if (attendanceLogs.length === 0 && Array.isArray(manifest.attendanceLogs) && manifest.attendanceLogs.length > 0)     { setAttendanceLogs(manifest.attendanceLogs); seeded = true; }
        if (assignments.length === 0 && Array.isArray(manifest.assignments) && manifest.assignments.length > 0)           { setAssignments(manifest.assignments); seeded = true; }
        if (semesters.length === 0 && Array.isArray(manifest.semesters) && manifest.semesters.length > 0)               { setSemesters(manifest.semesters); seeded = true; }
        if (semesterSubjects.length === 0 && Array.isArray(manifest.semesterSubjects) && manifest.semesterSubjects.length > 0) { setSemesterSubjects(manifest.semesterSubjects); seeded = true; }
        if (seeded) hasCachedDataRef.current = true;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.uid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseAttendanceSubject(d.data(), d.id));
          setAttendance(prev => {
            if (areItemsEqual(prev, fresh)) return prev;
            // Merge: for subjects with in-flight optimistic writes (classesTotal differs),
            // prefer the higher count to prevent the percentage from flickering back
            const freshMap = new Map(fresh.map(s => [s.id!, s]));
            const merged = prev.map(ps => {
              const fs = freshMap.get(ps.id!);
              if (!fs) return ps; // Subject only in prev: keep it (deleted elsewhere, stale)
              // If our local counts are higher, we have an in-flight optimistic write — keep local
              const localTotal = (ps.classesTotal || 0) + (ps.labsTotal || 0);
              const freshTotal = (fs.classesTotal || 0) + (fs.labsTotal || 0);
              if (localTotal > freshTotal) return ps;
              return fs;
            });
            // Add any fresh subjects not yet in prev (new subjects added elsewhere)
            fresh.forEach(fs => { if (!prev.find(ps => ps.id === fs.id)) merged.push(fs); });
            return areItemsEqual(prev, merged) ? prev : merged;
          });
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: fresh }));
        });
      },
      scheduleListenerRestart("attendance")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseAttendanceLog(d.data(), d.id));
          setAttendanceLogs(prev => {
            if (areItemsEqual(prev, fresh)) return prev;
            // ── Merge strategy: NEVER wipe in-flight optimistic logs ────────────────────
            // Root cause of the "log disappears when tapping next subject" bug:
            //   batch_A.commit() resolves first → onSnapshot fires with [aLog]
            //   but React state already has [aLog, bLog_optimistic]
            //   areItemsEqual returns false → setAttendanceLogs([aLog]) → bLog wiped!
            //
            // Fix: keep any log that is in prev but NOT in fresh — these are in-flight
            // writes not yet confirmed by Firestore. They will be removed naturally on
            // the next snapshot once the server confirms (or on undo via optimisticRemove).
            const freshIds = new Set(fresh.map(l => l.id).filter(Boolean));
            const inFlight = prev.filter(l => l.id && !freshIds.has(l.id));
            if (inFlight.length === 0) return fresh; // No in-flight, safe to replace
            return [...fresh, ...inFlight]; // Keep in-flight logs until Firestore confirms them
          });
          // Note: cache always written with server-confirmed data (no optimistic inflation)
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: fresh }));
        });
      },
      scheduleListenerRestart("attendanceLogs")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseAssignment(d.data(), d.id));
          setAssignments(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ assignments: fresh }));
        });
      },
      scheduleListenerRestart("assignments")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTERS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester));
          setSemesters(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ semesters: fresh }));
        });
      },
      scheduleListenerRestart("semesters")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTER_SUBJECTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject));
          setSemesterSubjects(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ semesterSubjects: fresh }));
        });
      },
      scheduleListenerRestart("semesterSubjects")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), where("userId", "==", uid)),
      snap => {
        const fresh = snap.docs.map(d => (d.data() as any).date).filter(Boolean);
        setHolidays(prev => areItemsEqual(prev, fresh) ? prev : fresh);
      },
      scheduleListenerRestart("holidays")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user && subscribedRef.current) {
      openSubscriptions(user.uid);
    } else if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user?.uid, subscriptionVersion, openSubscriptions]);

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user?.uid, openSubscriptions]);

  // Optimistic write helpers
  const optimisticAddSubject = (subject: AttendanceSubject) => {
    setAttendance(prev => {
      const next = [subject, ...prev];
      writeAcademicCache({ attendance: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticDeleteSubject = (subjectId: string) => {
    setAttendance(prev => {
      const next = prev.filter(s => s.id !== subjectId);
      writeAcademicCache({ attendance: next }, true); // immediate: optimistic delete
      return next;
    });
  };

  const optimisticUpdateAttendance = (subjectId: string, partial: Partial<AttendanceSubject>) => {
    setAttendance(prev => {
      const next = prev.map(s => s.id === subjectId ? { ...s, ...partial } : s);
      writeAcademicCache({ attendance: next }, true); // immediate: optimistic update
      return next;
    });
  };

  const optimisticAddAssignment = (assignment: Assignment) => {
    setAssignments(prev => {
      const next = [assignment, ...prev];
      writeAcademicCache({ assignments: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticUpdateAssignment = (assignmentId: string, partial: Partial<Assignment>) => {
    setAssignments(prev => {
      const next = prev.map(a => a.id === assignmentId ? { ...a, ...partial } : a);
      writeAcademicCache({ assignments: next }, true); // immediate: optimistic update
      return next;
    });
  };

  const optimisticDeleteAssignment = (assignmentId: string) => {
    setAssignments(prev => {
      const next = prev.filter(a => a.id !== assignmentId);
      writeAcademicCache({ assignments: next }, true); // immediate: optimistic delete
      return next;
    });
  };

  const optimisticAddAttendanceLog = (log: AttendanceLog) => {
    setAttendanceLogs(prev => {
      const next = [log, ...prev];
      writeAcademicCache({ attendanceLogs: next }, true); // immediate: optimistic add
      return next;
    });
  };

  const optimisticUpdateAttendanceLog = (logId: string, partial: Partial<AttendanceLog>) => {
    setAttendanceLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial } : l);
      writeAcademicCache({ attendanceLogs: next }, true); // immediate: optimistic update
      return next;
    });
  };

  const optimisticRemoveAttendanceLog = (logId: string) => {
    setAttendanceLogs(prev => {
      const next = prev.filter(l => l.id !== logId);
      writeAcademicCache({ attendanceLogs: next }, true); // immediate: optimistic remove
      return next;
    });
  };

  const value = useMemo(() => ({
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    ensureSubscribed, optimisticAddSubject, optimisticDeleteSubject,
    optimisticUpdateAttendance, optimisticAddAssignment,
    optimisticUpdateAssignment, optimisticDeleteAssignment, optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog
  }), [
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays, ensureSubscribed
  ]);

  return (
    <AcademicContext.Provider value={value}>
      {children}
    </AcademicContext.Provider>
  );
}
