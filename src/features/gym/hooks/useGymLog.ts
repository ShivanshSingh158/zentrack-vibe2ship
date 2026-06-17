import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { toast } from 'sonner';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../../data/gymPlan';
import { syncGymHabit } from '../utils/habitSync';
import type {
  GymDayLog, GymExerciseLog, GymCardioLog, GymProfile,
} from '../../../types/gym.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateStrOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabelFromDate(dateS: string): string {
  const d = new Date(dateS + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function planDayIndexForDate(dateS: string): number {
  const d = new Date(dateS + 'T00:00:00');
  return WEEKDAY_TO_PLAN[d.getDay()];
}

function makeDocId(userId: string, date: string) { return `${userId}_${date}`; }

export function makeTreadmillEntry(): GymCardioLog {
  return {
    id: 'permanent_treadmill', type: 'Treadmill',
    durationMinutes: null, distanceKm: null, speedKmh: null, calories: null,
    completed: false, isPermanent: true,
  };
}

export function buildDefaultLog(userId: string, date: string, planDayIdx: number): GymDayLog {
  const plan = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isRestDay = plan?.isRest === true;
  const exercises: GymExerciseLog[] = isRestDay ? [] : (plan?.exercises || []).map(ex => ({
    exerciseId: ex.id, name: ex.name, targetSets: ex.targetSets, targetReps: ex.targetReps,
    muscle: ex.muscle, videoId: ex.videoId, isCustom: false,
    setsLog: Array.from({ length: ex.targetSets }, (_, i) => ({
      setNumber: i + 1, reps: null, weight: null, completed: false,
    })),
  }));
  return {
    userId, date, dayPlanIndex: planDayIdx, exercises,
    cardio: isRestDay ? [] : [makeTreadmillEntry()],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function ensureTreadmill(log: GymDayLog, isRestDay: boolean): GymDayLog {
  if (isRestDay) return log;
  const cardio = log.cardio || [];
  if (cardio.some(c => c.id === 'permanent_treadmill')) return log;
  return { ...log, cardio: [makeTreadmillEntry(), ...cardio] };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseGymLogResult {
  userId: string | null;
  log: GymDayLog;
  syncing: boolean;
  saving: boolean;
  profile: GymProfile | null;
  loadLog: () => Promise<void>;
  updateExercise: (idx: number, ex: GymExerciseLog) => void;
  deleteExercise: (idx: number) => void;
  addExercise: (ex: GymExerciseLog, savePermanently: boolean) => Promise<void>;
  moveExerciseToDate: (idx: number, targetDate: string) => Promise<void>;
  updateCardio: (idx: number, c: GymCardioLog) => void;
  deleteCardio: (idx: number) => void;
  addCardio: (c: GymCardioLog) => void;
  startWorkout: () => void;
  endWorkout: () => void;
  clearDay: () => void;
  importPlan: () => void;
  wipeAllTemplates: () => Promise<void>;
  saveProfile: (p: GymProfile) => Promise<void>;
}

export function useGymLog(selectedDate: string): UseGymLogResult {
  const [userId, setUserId] = useState<string | null>(null);
  const [log, setLog] = useState<GymDayLog>(() => {
    const pidx = planDayIndexForDate(todayStr());
    return buildDefaultLog('', todayStr(), pidx);
  });
  const [syncing, setSyncing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const saveTimer = useRef<number | null>(null);
  const logRef = useRef(log);
  logRef.current = log;

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUserId(u?.uid || null));
    return () => unsub();
  }, []);

  // Load gym profile
  useEffect(() => {
    if (!userId) return;
    getDoc(doc(db, 'gymProfiles', userId)).then(snap => {
      if (snap.exists()) setProfile(snap.data() as GymProfile);
    }).catch(console.warn);
  }, [userId]);

  const planDayIdx = planDayIndexForDate(selectedDate);
  const planDay = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isRestDay = planDay?.isRest === true;

  // Save
  const saveLog = useCallback(async (data: GymDayLog) => {
    if (!userId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'gymLogs', makeDocId(userId, selectedDate)), {
        ...data, updatedAt: Date.now(),
      });
    } catch (e) {
      console.error('GymModule save error:', e);
      toast.error('Failed to save — check connection');
    } finally {
      setSaving(false);
    }
  }, [userId, selectedDate]);

  const scheduleAutosave = useCallback((data: GymDayLog) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveLog(data), 1200);
  }, [saveLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // Load log
  const loadLog = useCallback(async () => {
    if (!userId) return;
    // Immediately show plan structure (no Firestore latency perceived)
    const defaultLog = buildDefaultLog(userId, selectedDate, planDayIdx);
    setLog(defaultLog);
    setSyncing(true);
    try {
      const logRef2 = doc(db, 'gymLogs', makeDocId(userId, selectedDate));
      const logSnap = await getDoc(logRef2);
      if (logSnap.exists()) {
        const loaded = logSnap.data() as GymDayLog;
        setLog(ensureTreadmill(loaded, isRestDay));
      } else {
        // Merge in any permanently saved custom exercises for this day
        const customRef = doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`);
        const customSnap = await getDoc(customRef);
        if (customSnap.exists()) {
          const customData = customSnap.data();
          if (customData.customExercises?.length > 0) {
            const customLogExercises: GymExerciseLog[] = customData.customExercises.map((cx: any) => ({
              exerciseId: cx.id, name: cx.name, targetSets: cx.targetSets,
              targetReps: cx.targetReps, muscle: cx.muscle, isCustom: true,
              setsLog: Array.from({ length: cx.targetSets }, (_, i) => ({
                setNumber: i + 1, reps: null, weight: null, completed: false,
              })),
            }));
            setLog(prev => ({ ...prev, exercises: [...prev.exercises, ...customLogExercises] }));
          }
        }
      }
    } catch (e) {
      console.error('GymModule load error:', e);
    } finally {
      setSyncing(false);
    }
  }, [userId, selectedDate, planDayIdx, isRestDay]);

  useEffect(() => { loadLog(); }, [loadLog]);

  // Listen for external updates (e.g. from ZenGymAI)
  useEffect(() => {
    const handler = () => loadLog();
    window.addEventListener('gym-log-updated', handler);
    return () => window.removeEventListener('gym-log-updated', handler);
  }, [loadLog]);

  // Exercise CRUD
  const updateExercise = useCallback((idx: number, ex: GymExerciseLog) => {
    setLog(prev => {
      const exs = [...prev.exercises];
      exs[idx] = ex;
      const updated = { ...prev, exercises: exs, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
  }, [scheduleAutosave]);

  const deleteExercise = useCallback((idx: number) => {
    setLog(prev => {
      const exs = prev.exercises.filter((_, i) => i !== idx);
      const updated = { ...prev, exercises: exs, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Exercise removed');
  }, [scheduleAutosave]);

  const addExercise = useCallback(async (ex: GymExerciseLog, savePermanently: boolean) => {
    setLog(prev => {
      const updated = { ...prev, exercises: [...prev.exercises, ex], updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    if (savePermanently && userId) {
      try {
        const customRef = doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`);
        await setDoc(customRef, {
          userId,
          customExercises: arrayUnion({
            id: ex.exerciseId, name: ex.name, targetSets: ex.targetSets,
            targetReps: ex.targetReps, muscle: ex.muscle || null,
          }),
        }, { merge: true });
        toast.success('Saved permanently to your split!');
      } catch (err) {
        console.error(err);
        toast.error('Failed to save permanently');
      }
    } else {
      toast.success('Exercise added!');
    }
  }, [userId, planDayIdx, scheduleAutosave]);

  const moveExerciseToDate = useCallback(async (idx: number, targetDate: string) => {
    if (!userId) return;
    
    // 1. Get the exercise from current log
    const exToMove = logRef.current.exercises[idx];
    if (!exToMove) return;

    // 2. Remove it from current log and save
    setLog(prev => {
      const exs = prev.exercises.filter((_, i) => i !== idx);
      const updated = { ...prev, exercises: exs, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });

    // 3. Fetch target date's log
    const targetDocId = makeDocId(userId, targetDate);
    const targetRef = doc(db, 'gymLogs', targetDocId);
    try {
      const snap = await getDoc(targetRef);
      if (snap.exists()) {
        const targetLog = snap.data() as GymDayLog;
        targetLog.exercises = [...(targetLog.exercises || []), exToMove];
        targetLog.updatedAt = Date.now();
        await setDoc(targetRef, targetLog);
      } else {
        // Target log doesn't exist, create it from default plan
        const pidx = planDayIndexForDate(targetDate);
        const targetLog = buildDefaultLog(userId, targetDate, pidx);
        targetLog.exercises = [...targetLog.exercises, exToMove];
        await setDoc(targetRef, targetLog);
      }
      toast.success(`Exercise moved to ${targetDate}`);
    } catch (err) {
      console.error('Failed to move exercise:', err);
      toast.error('Failed to move exercise to ' + targetDate);
    }
  }, [userId, scheduleAutosave]);

  // Cardio CRUD
  const updateCardio = useCallback((idx: number, c: GymCardioLog) => {
    setLog(prev => {
      const cArr = [...(prev.cardio || [])];
      cArr[idx] = c;
      const updated = { ...prev, cardio: cArr, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
  }, [scheduleAutosave]);

  const deleteCardio = useCallback((idx: number) => {
    setLog(prev => {
      const item = (prev.cardio || [])[idx];
      if (item?.isPermanent) { toast.error('Treadmill is always tracked'); return prev; }
      const cArr = (prev.cardio || []).filter((_, i) => i !== idx);
      const updated = { ...prev, cardio: cArr, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Cardio removed');
  }, [scheduleAutosave]);

  const addCardio = useCallback((c: GymCardioLog) => {
    setLog(prev => {
      const cArr = [...(prev.cardio || []), c];
      const updated = { ...prev, cardio: cArr, updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Cardio added!');
  }, [scheduleAutosave]);

  // Day-level operations
  const clearDay = useCallback(() => {
    if (!userId) return;
    const updated = { ...logRef.current, exercises: [], cardio: [makeTreadmillEntry()], updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    toast.success('Day cleared');
  }, [userId, scheduleAutosave]);

  // Stopwatch
  const startWorkout = useCallback(() => {
    setLog(prev => {
      const updated = { ...prev, workoutStartTime: Date.now(), updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Workout Started! 🚀');
  }, [scheduleAutosave]);

  const endWorkout = useCallback(() => {
    setLog(prev => {
      if (!prev.workoutStartTime) return prev;
      const durationMs = Date.now() - prev.workoutStartTime;
      const durationMins = Math.max(1, Math.round(durationMs / 60000));
      const totalDuration = (prev.workoutDurationMinutes || 0) + durationMins;

      const updated = { 
        ...prev, 
        workoutStartTime: undefined, 
        workoutDurationMinutes: totalDuration, 
        updatedAt: Date.now() 
      };
      scheduleAutosave(updated);
      
      // Auto-sync Habit
      if (userId) syncGymHabit(userId);

      toast.success(`Workout Ended! Time: ${totalDuration} mins 💪`);
      return updated;
    });
  }, [scheduleAutosave, userId]);

  const importPlan = useCallback(() => {
    if (!userId || !planDay?.exercises?.length) {
      toast.error('No plan available for this day.');
      return;
    }
    setLog(prev => {
      // Deduplicate by exerciseId — don't add if already present
      const existingIds = new Set(prev.exercises.map(e => e.exerciseId));
      const toAdd: GymExerciseLog[] = planDay.exercises
        .filter(ex => !existingIds.has(ex.id))
        .map(ex => ({
          exerciseId: ex.id, name: ex.name, targetSets: ex.targetSets,
          targetReps: ex.targetReps, muscle: ex.muscle, isCustom: false,
          setsLog: Array.from({ length: ex.targetSets }, (_, i) => ({
            setNumber: i + 1, reps: null, weight: null, completed: false,
          })),
        }));
      if (toAdd.length === 0) { toast.info('Plan already imported'); return prev; }
      const updated = { ...prev, exercises: [...prev.exercises, ...toAdd], updatedAt: Date.now() };
      scheduleAutosave(updated);
      return updated;
    });
    toast.success('Plan imported!');
  }, [userId, planDay, scheduleAutosave]);

  const wipeAllTemplates = useCallback(async () => {
    if (!userId) return;
    try {
      for (let i = 1; i <= 7; i++) {
        await deleteDoc(doc(db, 'gymCustomPlans', `${userId}_day${i}`));
      }
      toast.success('All custom templates wiped');
    } catch (err) {
      console.error(err);
      toast.error('Failed to wipe templates');
    }
  }, [userId]);

  const saveProfile = useCallback(async (p: GymProfile) => {
    if (!userId) return;
    try {
      await setDoc(doc(db, 'gymProfiles', userId), { ...p, userId, updatedAt: Date.now() });
      setProfile({ ...p, userId, updatedAt: Date.now() });
      toast.success('Profile saved!');
    } catch (e) {
      toast.error('Failed to save profile');
    }
  }, [userId]);

  return {
    userId, log, syncing, saving, profile,
    loadLog, updateExercise, deleteExercise, addExercise, moveExerciseToDate,
    updateCardio, deleteCardio, addCardio, startWorkout, endWorkout,
    clearDay, importPlan, wipeAllTemplates, saveProfile,
  };
}
