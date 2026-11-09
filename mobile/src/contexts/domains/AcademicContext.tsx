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
import { loadBootManifest, getBootManifestSync, updateL1Cache } from "../../utils/bootManifest";
import { parseAttendanceSubject, parseAttendanceLog, parseAssignment, areItemsEqual } from "../../utils/schemaGuards";
import { formatLocalDateStr, offsetDateStr } from "../../utils/dateUtils";
import { applyPendingQueueOverlay } from "../../services/offlineSync";

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
  optimisticClearAttendanceLogs: (subjectId?: string) => void;
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
  optimisticClearAttendanceLogs: () => {},
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
  const pendingCacheWriteRef = useRef<{ cancel: () => void } | null>(null);
  const attendanceLogsIndexFailedRef = useRef(false);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    const isBuilding = err.message.includes('currently building');
    const isIndexErr = err.message.includes('index') || err.message.includes('precondition');
    if (context === 'attendanceLogs' && isIndexErr) {
      attendanceLogsIndexFailedRef.current = true;
    }
    if (isBuilding) {
      console.info(`[Academic] ${context} index is currently building in Cloud Firestore. Auto-retrying in 15s...`);
    } else {
      console.warn(`[Academic] ${context} listener error — restarting in 5s`, err.message);
    }
    if (retryTimerRef.current) return;
    const delay = isBuilding ? 15000 : 5000;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, delay);
  }, []);


  // ── Offline-first boot: seed ALL academic collections using functional updaters ──
  useEffect(() => {
    let isCancelled = false;

    const applyManifest = (manifest: any) => {
      if (!manifest) return;
      unstable_batchedUpdates(() => {
        if ((manifest.attendance?.length ?? 0) > 0) {
          setAttendance(prev => prev.length === 0 ? manifest.attendance : prev);
          hasCachedDataRef.current = true;
        }
        if ((manifest.attendanceLogs?.length ?? 0) > 0) {
          setAttendanceLogs(prev => prev.length === 0 ? manifest.attendanceLogs : prev);
          hasCachedDataRef.current = true;
        }
        if ((manifest.assignments?.length ?? 0) > 0) {
          setAssignments(prev => prev.length === 0 ? manifest.assignments : prev);
          hasCachedDataRef.current = true;
        }
        if ((manifest.semesters?.length ?? 0) > 0) {
          setSemesters(prev => prev.length === 0 ? manifest.semesters : prev);
          hasCachedDataRef.current = true;
        }
        if ((manifest.semesterSubjects?.length ?? 0) > 0) {
          setSemesterSubjects(prev => prev.length === 0 ? manifest.semesterSubjects : prev);
        }
        if ((manifest.holidays?.length ?? 0) > 0) {
          setHolidays(prev => prev.length === 0 ? manifest.holidays : prev);
        }
      });
    };

    loadBootManifest().then(manifest => {
      if (isCancelled) return;
      applyManifest(manifest);
    }).catch(() => {});

    const tier1Sub = DeviceEventEmitter.addListener('tier1_manifest_hydrated', (manifest) => {
      if (isCancelled) return;
      applyManifest(manifest);
    });

    return () => {
      isCancelled = true;
      tier1Sub.remove();
    };
  }, [user?.uid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.ATTENDANCE, snap.docs.map(d => parseAttendanceSubject(d.data(), d.id)));
          updateL1Cache('attendance', fresh);
          setAttendance(prev => {
            const freshMap = new Map(fresh.map(s => [s.id!, s]));
            const merged = prev
              .filter(ps => freshMap.has(ps.id!))
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
            const mergedIds = new Set(merged.map(s => s.id));
            for (const fs of fresh) {
              if (!mergedIds.has(fs.id)) {
                merged.push(fs);
                mergedIds.add(fs.id);
              }
            }
            merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id ?? '').localeCompare(b.id ?? ''));
            return areItemsEqual(prev, merged) ? prev : merged;
          });
          setAttendanceSnapshotFired(true);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: fresh }, false));
        });
      },
      scheduleListenerRestart("attendance")
    ));

    // Attendance Logs Listener (Rolling 150-day semester window with client-side index fallback)
    const attendanceCutoffDateStr = offsetDateStr(formatLocalDateStr(new Date()), -150);
    const logsQuery = attendanceLogsIndexFailedRef.current
      ? query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid))
      : query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid), where("date", ">=", attendanceCutoffDateStr));

    unsubsRef.current.push(onSnapshot(
      logsQuery,
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const rawFresh = applyPendingQueueOverlay(
            COLLECTION.ATTENDANCE_LOGS,
            snap.docs
              .map(d => parseAttendanceLog(d.data(), d.id))
              .filter(l => !l.date || l.date >= attendanceCutoffDateStr)
          );
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
              const expectedDetId = `${uid}_${subjectId}_${date}_${type}_${idx}`;
              const isDet = (id: string) => id === expectedDetId;
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
          updateL1Cache('attendanceLogs', fresh);

          setAttendanceLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: fresh }, false));
        });
      },
      scheduleListenerRestart("attendanceLogs")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.ASSIGNMENTS, snap.docs.map(d => parseAssignment(d.data(), d.id)));
          updateL1Cache('assignments', fresh);
          setAssignments(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ assignments: fresh }, false));
        });
      },
      scheduleListenerRestart("assignments")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTERS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.SEMESTERS, snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester)));
          setSemesters(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ semesters: fresh }, false));
        });
      },
      scheduleListenerRestart("semesters")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTER_SUBJECTS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        unstable_batchedUpdates(() => {
          const fresh = applyPendingQueueOverlay(COLLECTION.SEMESTER_SUBJECTS, snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject)));
          setSemesterSubjects(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeAcademicCache({ semesterSubjects: fresh }, false));
        });
      },
      scheduleListenerRestart("semesterSubjects")
    ));

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && snap.metadata.fromCache && hasCachedDataRef.current) return;
        if (snap.docChanges().length === 0 && !snap.metadata.hasPendingWrites) return;
        const rawDocs = applyPendingQueueOverlay(COLLECTION.ATTENDANCE_HOLIDAYS, snap.docs.map(d => ({ id: d.id, ...d.data() })));
        const fresh = rawDocs.map(d => {
          const raw = (d as any).date;
          if (!raw) return '';
          if (typeof raw === 'string') return raw.trim().slice(0, 10);
          return String(raw).slice(0, 10);
        }).filter(Boolean);
        updateL1Cache('holidays', fresh);
        setHolidays(prev => areItemsEqual(prev, fresh) ? prev : fresh);
        InteractionManager.runAfterInteractions(() => writeAcademicCache({ holidays: fresh }, false));
      },
      scheduleListenerRestart("holidays")
    ));
  }, [scheduleListenerRestart]);

  const demandRequestedRef = useRef(false);
  const deferredSubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user) {
      if (demandRequestedRef.current) {
        subscribedRef.current = false;
        openSubscriptions(user.uid);
      } else {
        if (deferredSubTimerRef.current) clearTimeout(deferredSubTimerRef.current);
        const handle = InteractionManager.runAfterInteractions(() => {
          deferredSubTimerRef.current = setTimeout(() => {
            if (user && !subscribedRef.current) {
              openSubscriptions(user.uid);
            }
          }, 4500);
        });
        return () => {
          handle.cancel();
          if (deferredSubTimerRef.current) clearTimeout(deferredSubTimerRef.current);
        };
      }
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      demandRequestedRef.current = false;
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
    if (deferredSubTimerRef.current) clearTimeout(deferredSubTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    demandRequestedRef.current = true;
    if (deferredSubTimerRef.current) {
      clearTimeout(deferredSubTimerRef.current);
      deferredSubTimerRef.current = null;
    }
    if (user && !subscribedRef.current) {
      openSubscriptions(user.uid);
    }
  }, [user?.uid, openSubscriptions]);

  // Optimistic write helpers
  const optimisticAddSubject = useCallback((subject: AttendanceSubject) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendance(prev => {
      const next = [subject, ...prev];
      updateL1Cache('attendance', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: next }, false));
      return next;
    });
  }, []);

  const optimisticDeleteSubject = useCallback((subjectId: string) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendance(prev => {
      const next = prev.filter(s => s.id !== subjectId);
      updateL1Cache('attendance', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: next }, false));
      return next;
    });
  }, []);

  const optimisticUpdateAttendance = useCallback((subjectId: string, partial: Partial<AttendanceSubject>) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendance(prev => {
      const next = prev.map(s => s.id === subjectId ? { ...s, ...partial, lastUpdated: Date.now() } : s);
      updateL1Cache('attendance', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendance: next }, false));
      return next;
    });
  }, []);

  const optimisticAddAssignment = useCallback((assignment: Assignment) => {
    pendingCacheWriteRef.current?.cancel();
    setAssignments(prev => {
      const next = [assignment, ...prev];
      updateL1Cache('assignments', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ assignments: next }, false));
      return next;
    });
  }, []);

  const optimisticUpdateAssignment = useCallback((assignmentId: string, partial: Partial<Assignment>) => {
    pendingCacheWriteRef.current?.cancel();
    setAssignments(prev => {
      const next = prev.map(a => a.id === assignmentId ? { ...a, ...partial } : a);
      updateL1Cache('assignments', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ assignments: next }, false));
      return next;
    });
  }, []);

  const optimisticDeleteAssignment = useCallback((assignmentId: string) => {
    pendingCacheWriteRef.current?.cancel();
    setAssignments(prev => {
      const next = prev.filter(a => a.id !== assignmentId);
      updateL1Cache('assignments', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ assignments: next }, false));
      return next;
    });
  }, []);

  const optimisticAddAttendanceLog = useCallback((log: AttendanceLog) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendanceLogs(prev => {
      const cleanDate = (log.date || '').slice(0, 10);
      const filtered = prev.filter(l =>
        l.id !== log.id &&
        (log.isExtra || l.isExtra || !(
          (l.subjectId === log.subjectId || (log.subjectName && l.subjectName === log.subjectName)) &&
          (l.date || '').slice(0, 10) === cleanDate &&
          (l.type === log.type || (!l.type && log.type === 'class')) &&
          (l.idx === log.idx || (l.idx === undefined && (log.idx === 0 || log.idx === undefined)))
        ))
      );
      const next = [log, ...filtered];
      updateL1Cache('attendanceLogs', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: next }, false));
      return next;
    });
  }, []);

  const optimisticUpdateAttendanceLog = useCallback((logId: string, partial: Partial<AttendanceLog>) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendanceLogs(prev => {
      const next = prev.map(l => l.id === logId ? { ...l, ...partial, timestamp: Date.now() } : l);
      updateL1Cache('attendanceLogs', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: next }, false));
      return next;
    });
  }, []);

  const optimisticRemoveAttendanceLog = useCallback((logId: string) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendanceLogs(prev => {
      const next = prev.filter(l => l.id !== logId);
      updateL1Cache('attendanceLogs', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: next }, false));
      return next;
    });
  }, []);

  const optimisticClearAttendanceLogs = useCallback((subjectId?: string) => {
    pendingCacheWriteRef.current?.cancel();
    setAttendanceLogs(prev => {
      const next = subjectId
        ? prev.filter(l => l.subjectId !== subjectId && l.subjectName !== subjectId)
        : [];
      updateL1Cache('attendanceLogs', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ attendanceLogs: next }, false));
      return next;
    });
  }, []);

  const optimisticToggleHoliday = useCallback((dateStr: string, isHoliday: boolean) => {
    pendingCacheWriteRef.current?.cancel();
    setHolidays(prev => {
      const cleanDate = (dateStr || '').trim().slice(0, 10);
      const next = isHoliday
        ? (prev.some(d => d.slice(0, 10) === cleanDate) ? prev : [...prev, cleanDate])
        : prev.filter(d => d.slice(0, 10) !== cleanDate);
      updateL1Cache('holidays', next);
      pendingCacheWriteRef.current = InteractionManager.runAfterInteractions(() => writeAcademicCache({ holidays: next }, false));
      return next;
    });
  }, []);

  // ── Widget action listener: syncs live widget logs into React state immediately ──
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('attendance_logged_from_widget', (event: any) => {
      if (event?.log) {
        optimisticAddAttendanceLog(event.log);
      } else if (event?.deterministicId) {
        optimisticRemoveAttendanceLog(event.deterministicId);
      }
      if (event?.subjectId && event?.subjectUpdates) {
        optimisticUpdateAttendance(event.subjectId, event.subjectUpdates);
      }
    });
    return () => sub.remove();
  }, [optimisticAddAttendanceLog, optimisticRemoveAttendanceLog, optimisticUpdateAttendance]);

  // attendanceReady: true once the first Firestore snapshot has fired (even if user has no subjects).
  const attendanceReady = attendanceSnapshotFired;

  const value = useMemo(() => ({
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    attendanceReady,
    ensureSubscribed, optimisticAddSubject, optimisticDeleteSubject,
    optimisticUpdateAttendance, optimisticAddAssignment,
    optimisticUpdateAssignment, optimisticDeleteAssignment, optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog, optimisticClearAttendanceLogs,
    optimisticToggleHoliday
  }), [
    attendance, attendanceLogs, assignments, semesters, semesterSubjects, holidays,
    attendanceReady, ensureSubscribed, optimisticAddSubject, optimisticDeleteSubject,
    optimisticUpdateAttendance, optimisticAddAssignment,
    optimisticUpdateAssignment, optimisticDeleteAssignment, optimisticAddAttendanceLog,
    optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog, optimisticClearAttendanceLogs,
    optimisticToggleHoliday
  ]);

  return (
    <AcademicContext.Provider value={value}>
      {children}
    </AcademicContext.Provider>
  );
}
