import { useEffect, useState, useRef } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { detectConflicts, DetectedConflict } from '../services/conflictDetector';

export const useProactiveAgent = () => {
  const { user, loading, tasks } = useCoreData();
  const { gymLogs } = useWellnessData();
  const { attendance, assignments } = useAcademicData();
  const { customEvents } = usePlannerData();

  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || loading) return;

    let cancelled = false;
    let interactionHandle: { cancel: () => void } | null = null;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      interactionHandle = InteractionManager.runAfterInteractions(async () => {
        try {
          const isProactiveEnabled = await AsyncStorage.getItem('zentrack_sara_proactive');
          if (cancelled) return;
          if (isProactiveEnabled === 'false') {
            setConflicts([]);
            return;
          }

          const detected = detectConflicts({
            tasks,
            gymLogs,
            attendance,
            assignments,
            customEvents,
          });
          if (!cancelled) {
            setConflicts(detected);
          }
        } catch {}
      });
    }, 1500);

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      interactionHandle?.cancel();
    };
  }, [user?.uid, loading, tasks, customEvents, gymLogs, attendance, assignments]);

  return { conflicts };
};
