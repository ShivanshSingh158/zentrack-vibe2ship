import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';

export interface TimetableSubject {
  id: string;
  name: string;
}

/**
 * useSubjects — reads attendance_subjects once per user session.
 * Returns the list of subjects configured in the Attendance / Timetable module.
 * Use this everywhere you need a subject list so it stays in sync with the timetable.
 */
export const useSubjects = (): { subjects: TimetableSubject[]; isLoading: boolean } => {
  const [subjects, setSubjects] = useState<TimetableSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'attendance_subjects'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, name: (d.data().name as string) || '' }))
        .filter(s => s.name.trim() !== '')
        .sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(data);
      setIsLoading(false);
    });
    return () => unsub();
  }, [uid]);

  return { subjects, isLoading };
};
