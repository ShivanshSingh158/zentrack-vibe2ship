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
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { AttendanceSubject, AttendanceLog, Assignment, Semester, SemesterSubject } from "../MobileDataContext";
import { readAcademicCache, writeAcademicCache } from "../../utils/domainCache";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface AcademicContextType {
  attendance: AttendanceSubject[];
  attendanceLogs: AttendanceLog[];
  assignments: Assignment[];
  semesters: Semester[];
  semesterSubjects: SemesterSubject[];
  ensureSubscribed: () => void;
  // Optimistic write helpers — WhatsApp pattern: show instantly, Firestore syncs in background.
  optimisticUpdateAttendance: (subjectId: string, partial: Partial<AttendanceSubject>) => void;
  optimisticAddAssignment: (assignment: Assignment) => void;
  optimisticUpdateAssignment: (assignmentId: string, partial: Partial<Assignment>) => void;
  optimisticDeleteAssignment: (assignmentId: string) => void;
}

const AcademicContext = createContext<AcademicContextType | null>(null);

export function useAcademicData(): AcademicContextType {
  const ctx = useContext(AcademicContext);
  if (!ctx) throw new Error("useAcademicData must be inside AcademicProvider");
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
  // ── Offline-first boot: seed from MMKV SYNCHRONOUSLY ──
  // Reads happen in < 5ms before the first render!
  const cached = useRef(readAcademicCache());

  const [attendance, setAttendance]           = useState<AttendanceSubject[]>(cached.current.attendance || []);
  const [attendanceLogs, setAttendanceLogs]   = useState<AttendanceLog[]>(cached.current.attendanceLogs || []);
  const [assignments, setAssignments]         = useState<Assignment[]>(cached.current.assignments || []);
  const [semesters, setSemesters]             = useState<Semester[]>(cached.current.semesters || []);
  const [semesterSubjects, setSemesterSubjects] = useState<SemesterSubject[]>(cached.current.semesterSubjects || []);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
          snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject)); setAttendance(fresh); writeAcademicCache({ attendance: fresh }); },
          err => console.error("[Academic] attendance", err)
        ));
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid)),
          snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)); setAttendanceLogs(fresh); writeAcademicCache({ attendanceLogs: fresh }); },
          err => console.error("[Academic] attendanceLogs", err)
        ));
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
          snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)); setAssignments(fresh); writeAcademicCache({ assignments: fresh }); },
          err => console.error("[Academic] assignments", err)
        ));
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.SEMESTERS), where("userId", "==", uid)),
          snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester)); setSemesters(fresh); writeAcademicCache({ semesters: fresh }); },
          err => console.error("[Academic] semesters", err)
        ));
        unsubsRef.current.push(onSnapshot(
          query(collection(db, COLLECTION.SEMESTER_SUBJECTS), where("userId", "==", uid)),
          snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject)); setSemesterSubjects(fresh); writeAcademicCache({ semesterSubjects: fresh }); },
          err => console.error("[Academic] semesterSubjects", err)
        ));
      }, 450);
    });
  };

  useEffect(() => {
    if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      setAttendance([]); setAttendanceLogs([]); setAssignments([]); setSemesters([]); setSemesterSubjects([]);
    }
  }, [user]);

  useEffect(() => () => { unsubsRef.current.forEach(u => u()); }, []);

  const ensureSubscribed = () => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  };

  // Optimistic write helpers
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

  return (
    <AcademicContext.Provider value={{ attendance, attendanceLogs, assignments, semesters, semesterSubjects, ensureSubscribed, optimisticUpdateAttendance, optimisticAddAssignment, optimisticUpdateAssignment, optimisticDeleteAssignment }}>
      {children}
    </AcademicContext.Provider>
  );
}
