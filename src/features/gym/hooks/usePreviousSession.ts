import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { GymDayLog, PreviousSessionData, GymPersonalRecord } from '../../../types/gym.types';

interface UsePreviousSessionResult {
  previousSessionData: PreviousSessionData;
  allTimePRs: Record<string, GymPersonalRecord>;
  loading: boolean;
  setAllTimePRs: React.Dispatch<React.SetStateAction<Record<string, GymPersonalRecord>>>;
}

/**
 * Fetches the most recent prior gym log (before selectedDate) for the user,
 * and builds a map of previousSessionData keyed by exerciseId.
 * Also returns all-time PRs computed from the last 90 days of logs.
 */
export function usePreviousSession(
  userId: string | null,
  selectedDate: string,
): UsePreviousSessionResult {
  const [previousSessionData, setPreviousSessionData] = useState<PreviousSessionData>({});
  const [allTimePRs, setAllTimePRs] = useState<Record<string, GymPersonalRecord>>({});
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) {
      setPreviousSessionData({});
      setAllTimePRs({});
      return;
    }
    setLoading(true);
    try {
      // Fetch all user logs and filter client-side (avoids composite index requirement)
      const q = query(collection(db, 'gymLogs'), where('userId', '==', userId));
      const snap = await getDocs(q);

      const allLogs: GymDayLog[] = [];
      snap.forEach(doc => allLogs.push(doc.data() as GymDayLog));

      // Sort descending by date
      allLogs.sort((a, b) => b.date.localeCompare(a.date));

      // Find the most recent log strictly before selectedDate
      const previousLog = allLogs.find(l => l.date < selectedDate && (l.exercises?.length ?? 0) > 0);

      // Build previous session data map
      const prevData: PreviousSessionData = {};
      if (previousLog) {
        for (const ex of previousLog.exercises) {
          const completedSets = ex.setsLog.filter(s => s.completed);
          const maxWeight = completedSets.reduce((max, s) => Math.max(max, s.weight ?? 0), 0);
          const allDone = ex.setsLog.length > 0 && ex.setsLog.every(s => s.completed);
          prevData[ex.exerciseId] = {
            date: previousLog.date,
            sets: ex.setsLog,
            maxWeight,
            allRepsCompleted: allDone,
            totalReps: completedSets.reduce((sum, s) => sum + (s.reps ?? 0), 0),
          };
          // Also try by name for exercises with dynamic IDs
          if (!prevData[ex.name]) {
            prevData[ex.name] = prevData[ex.exerciseId];
          }
        }
      }
      setPreviousSessionData(prevData);

      // Compute all-time PRs from all logs
      const ninetDaysAgo = new Date();
      ninetDaysAgo.setDate(ninetDaysAgo.getDate() - 90);
      const cutoff = ninetDaysAgo.toISOString().split('T')[0];
      const recentLogs = allLogs.filter(l => l.date >= cutoff);

      const prMap: Record<string, GymPersonalRecord> = {};
      for (const log of recentLogs) {
        for (const ex of log.exercises ?? []) {
          for (const s of ex.setsLog) {
            if (!s.completed || !s.weight || s.weight <= 0) continue;
            const key = ex.exerciseId;
            if (!prMap[key] || s.weight > prMap[key].weightKg) {
              prMap[key] = {
                exerciseName: ex.name,
                exerciseId: ex.exerciseId,
                weightKg: s.weight,
                reps: s.reps ?? 0,
                date: log.date,
                achievedAt: log.createdAt,
              };
            }
          }
        }
      }
      setAllTimePRs(prMap);
    } catch (e) {
      console.warn('[usePreviousSession] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDate]);

  useEffect(() => { fetch(); }, [fetch]);

  return { previousSessionData, allTimePRs, loading, setAllTimePRs };
}
