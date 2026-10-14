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
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates, AppState, AppStateStatus } from 'react-native';
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
  /** true once the first Firestore attendance snapshot has fired — skeleton gate */
  attendanceReady: boolean;
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
  optimisticToggleHoliday: (dateStr: string, isHoliday: boolean) => void;
}

const DEFAULT_ACADEMIC_DATA: AcademicContextType = {
  attendance: [],
  attendanceLogs: [],
  assignments: [],
  semesters: [],
  semesterSubjects: [],
  holidays: [],
  attendanceReady: false,
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
  optimisticToggleHoliday: () => {},
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
  const [holidays, setHolidays]               = useState<string[]>(initialManifest?.holidays ?? []);
  // FIX (Bug D): attendanceSnapshotFired = true once first Firestore attendance snapshot fires.
  // Used as skeleton gate. Previously AttendanceScreen used `!user` as the condition,
  // which is always false when an authenticated user visits the screen.
  const [attendanceSnapshotFired, setAttendanceSnapshotFired] = useState(
    (initialManifest?.attendance?.length ?? 0) > 0
  );
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
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

  // ── Widget action listener: syncs live widget logs into React state immediately ──
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('attendance_logged_from_widget', (event: any) => {
      if (event?.log) {
        optimisticAddAttendanceLog(event.log);
      } else if (event?.deterministicId) {
        // Fix #5: Widget undo sends log: null with a deterministicId.
        // Previously this branch was never taken, leaving the undone session
        // marked as "Present" in the React UI even though the widget deleted it.
        optimisticRemoveAttendanceLog(event.deterministicId);
      }
      if (event?.subjectId && event?.subjectUpdates) {
        optimisticUpdateAttendance(event.subjectId, event.subjectUpdates);
      }
    });
    return () => sub.remove();
  }, []);

  // ── AppState active: refresh academic state from local cache on app resume ────
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        try {
          const cache = await readAcademicCache();
          unstable_batchedUpdates(() => {
            if (cache.attendanceLogs && cache.attendanceLogs.length > 0) {
              setAttendanceLogs(prev => {
                const prevMap = new Map(prev.map(l => [l.id, l]));
                let hasChanges = false;
                cache.attendanceLogs!.forEach(cl => {
                  const existing = prevMap.get(cl.id);
                  if (!existing || existing.action !== cl.action) {
                    prevMap.set(cl.id, cl);
                    hasChanges = true;
                  }
                });
                if (!hasChanges) return prev;
                return Array.from(prevMap.values());
              });
            }
            if (cache.attendance && cache.attendance.length > 0) {
              setAttendance(prev => {
                const cacheMap = new Map(cache.attendance!.map(s => [s.id, s]));
                let changed = false;
                const merged = prev.map(p => {
                  const c = cacheMap.get(p.id);
                  if (c && (
                    c.classesAttended !== p.classesAttended ||
                    c.classesTotal !== p.classesTotal ||
                    c.labsAttended !== p.labsAttended ||
                    c.labsTotal !== p.labsTotal
                  )) {
                    changed = true;
                    return { ...p, ...c };
                  }
                  return p;
                });
                return changed ? merged : prev;
              });
            }
          });
        } catch {}
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // ── Offline-first boot: seed ALL academic collections in parallel ─────────
  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if (attendance.length === 0 && (manifest.attendance?.length ?? 0) > 0) {
          setAttendance(manifest.attendance);
          seeded = true;
        }
        if (attendanceLogs.length === 0 && (manifest.attendanceLogs?.length ?? 0) > 0) {
          setAttendanceLogs(manifest.attendanceLogs);
          seeded = true;
        }
        if (assignments.length === 0 && (manifest.assignments?.length ?? 0) > 0) {
          setAssignments(manifest.assignments);
          seeded = true;
        }
        if (semesters.length === 0 && (manifest.semesters?.length ?? 0) > 0) {
          setSemesters(manifest.semesters);
          seeded = true;
        }
        if (semesterSubjects.length === 0 && (manifest.semesterSubjects?.length ?? 0) > 0) {
          setSemesterSubjects(manifest.semesterSubjects);
          seeded = true;
        }
        if (holidays.length === 0 && (manifest.holidays?.length ?? 0) > 0) {
          setHolidays(manifest.holidays);
          seeded = true;
        }
        if (seeded) hasCachedDataRef.current = true;
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, [user?.uid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseAttendanceSubject(d.data(), d.id));
          setAttendance(prev => {
            if (areItemsEqual(prev, fresh)) return prev;
            const freshMap = new Map(fresh.map(s => [s.id!, s]));
            const merged = prev
              .filter(ps => freshMap.has(ps.id!) || (Date.now() - (ps.lastUpdated || 0) < 5000))
              .map(ps => {
                const fs = freshMap.get(ps.id!);
                if (!fs) return ps;
                const localTs = ps.lastUpdated || 0;
                const freshTs = fs.lastUpdated || 0;
                if (freshTs >= localTs) return fs;
                return {
                  ...ps,
                  name: fs.name,
                  schedule: fs.schedule,
                  color: fs.color,
                  targetPercentage: fs.targetPercentage,
                  order: fs.order,
                  schemaVersion: fs.schemaVersion,
                };
              });
            fresh.forEach(fs => { if (!merged.find(ps => ps.id === fs.id)) merged.push(fs); });
            return areItemsEqual(prev, merged) ? prev : merged;
          });
          setAttendanceSnapshotFired(true);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: fresh }));
        });
      },
      scheduleListenerRestart("attendance")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid), limit(300)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const rawFresh = snap.docs.map(d => parseAttendanceLog(d.data(), d.id));
          const seen = new Map<string, typeof rawFresh[0]>();
          rawFresh.forEach(l => {
            if (l.isExtra) return;
            const subjectId = (l.subjectId || l.subjectName || '').toString().trim();
            const date      = (l.date || '').toString().trim().slice(0, 10);
            const type      = l.type === 'lab' ? 'lab' : 'class';
            const idx       = typeof (l as any).idx === 'number' ? (l as any).idx : 0;
            const key       = `${subjectId}|${date}|${type}|${idx}`;
            const existing  = seen.get(key);
            if (!existing) {
              seen.set(key, l);
            } else {
              const isDet = (id: string) => /^[^_]+_[^_]+_\d{4}-\d{2}-\d{2}_(class|lab)_\d+$/.test(id ?? '');
              if (isDet(l.id ?? '') && !isDet(existing.id ?? '')) {
                seen.set(key, l);
              } else if (!isDet(l.id ?? '') && !isDet(existing.id ?? '')) {
                if (((l as any).timestamp ?? 0) > ((existing as any).timestamp ?? 0)) {
                  seen.set(key, l);
                }
              }
            }
          });
          const extraLogs = rawFresh.filter(l => l.isExtra);
          const fresh = [...Array.from(seen.values()), ...extraLogs];

          setAttendanceLogs(prev => {
            if (areItemsEqual(prev, fresh)) return prev;
            const now = Date.now();
            const freshIds = new Set(fresh.map(l => l.id).filter(Boolean));
            const inFlight = prev.filter(l => l.id && !freshIds.has(l.id) && (now - (l.timestamp || 0) < 5000));
            if (inFlight.length === 0) return fresh;
            return [...fresh, ...inFlight];
          });
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: fresh }));
        });
      },
      scheduleListenerRestart("attendanceLogs")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
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
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
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
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
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
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        const fresh = snap.docs.map(d => {
          const raw = (d.data() as any).date;
          if (!raw) return '';
          if (typeof raw === 'string') return raw.trim().slice(0, 10);
          return String(raw).slice(0, 10);
        }).filter(Boolean);
        setHolidays(prev => areItemsEqual(prev, fresh) ? prev : fresh);
        InteractionManager.runAfterInteractions(() => writeAcademicCache({ holidays: fresh }));
      },
      scheduleListenerRestart("holidays")
    ));
  }, [scheduleListenerRestart]);

  const wasSubscribedRef = useRef(false);

  useEffect(() => {
    if (user) {
      subscribedRef.current = false;
      openSubscriptions(user.uid);
      wasSubscribedRef.current = true;
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      wasSubscribedRef.current = false;
      hasCachedDataRef.current = false;
      unstable_batchedUpdates(() => {
        setAttendance([]);
        setAttendanceLogs([]);
        setAssignments([]);
        setSemesters([]);
        setSemesterSubjects([]);
        setHolidays([]);
        setAttendanceSnapshotFired(false);
      });
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
    if (user && !subscribedRef.current) {
      wasSubscribedRef.current = true;
      openSubscriptions(user.uid);
    }
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
      const next = prev.map(s => s.id === subjectId ? { ...s, ...partial, lastUpdated: Date.now() } : s);
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
      const cleanDate = (log.date || '').slice(0, 10);
      const filtered = prev.filter(l =>
        l.id !== log.id &&
        !(
          (l.subjectId === log.subjectId || (log.subjectName && l.subjectName === log.subjectName)) &&
          (l.date || '').slice(0, 10) === cleanDate &&
          (l.type === log.type || (!l.type && log.type === 'class')) &&
          (l.idx === log.idx || (l.idx === undefined && (log.idx === 0 || log.idx === undefined)))
        )
      );
      const next = [log, ...filtered];
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

  const optimisticToggleHoliday = (dateStr: string, isHoliday: boolean) => {
    const cleanDate = (dateStr || '').trim().slice(0, 10);
    setHolidays(prev => {
      const next = isHoliday
        ? (prev.some(d => d.slice(0, 10) === cleanDate) ? prev : [...prev, cleanDate])
        : prev.filter(d => d.slice(0, 10) !== cleanDate);
      writeAcademicCache({ holidays: next }, true); // immediate: optimistic holiday toggle
      return next;
    });
  };

  // attendanceReady: true once the first Firestore snapshot has fired (even if user has no subjects).
  const attendanceReady = attendanceSnapshotFired;

  const value = useMemo(() => ({
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    attendanceReady,
    ensureSubscribed, optimisticAddSubject, optimisticDeleteSubject,
    optimisticUpdateAttendance, optimisticAddAssignment,
    optimisticUpdateAssignment, optimisticDeleteAssignment, optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog, optimisticToggleHoliday
  }), [
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    attendanceReady, ensureSubscribed
  ]);

  return (
    <AcademicContext.Provider value={value}>
      {children}
    </AcademicContext.Provider>
  );
}
