/**
 * AcademicContext — ZenTrack Mobile
 *
 * Owns: attendance, assignments, semesters, semesterSubjects.
 *
 * Subscription strategy: DEMAND-BASED.
 * Opens subscriptions when ensureSubscribed() is called (from Attendance, 
 * Assignments, Grades screens). Never opens until the user visits an academic screen.
 */
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { AttendanceSubject, AttendanceLog, Assignment, Semester, SemesterSubject } from "../MobileDataContext";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface AcademicContextType {
  attendance: AttendanceSubject[];
  attendanceLogs: AttendanceLog[];
  assignments: Assignment[];
  semesters: Semester[];
  semesterSubjects: SemesterSubject[];
  ensureSubscribed: () => void;
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
  const [attendance, setAttendance]           = useState<AttendanceSubject[]>([]);
  const [attendanceLogs, setAttendanceLogs]   = useState<AttendanceLog[]>([]);
  const [assignments, setAssignments]         = useState<Assignment[]>([]);
  const [semesters, setSemesters]             = useState<Semester[]>([]);
  const [semesterSubjects, setSemesterSubjects] = useState<SemesterSubject[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE), where("userId", "==", uid)),
      snap => setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject))),
      err => console.error("[Academic] attendance", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ATTENDANCE_LOGS), where("userId", "==", uid)),
      snap => setAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog))),
      err => console.error("[Academic] attendanceLogs", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.ASSIGNMENTS), where("userId", "==", uid)),
      snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))),
      err => console.error("[Academic] assignments", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTERS), where("userId", "==", uid)),
      snap => setSemesters(snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester))),
      err => console.error("[Academic] semesters", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.SEMESTER_SUBJECTS), where("userId", "==", uid)),
      snap => setSemesterSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject))),
      err => console.error("[Academic] semesterSubjects", err)
    ));
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

  return (
    <AcademicContext.Provider value={{ attendance, attendanceLogs, assignments, semesters, semesterSubjects, ensureSubscribed }}>
      {children}
    </AcademicContext.Provider>
  );
}
