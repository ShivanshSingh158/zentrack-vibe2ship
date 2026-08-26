import { useEffect, useState, useRef } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { detectConflicts, DetectedConflict } from '../services/conflictDetector';

let _cachedProactiveEnabled: boolean | null = null;

export const useProactiveAgent = () => {
  const { user, loading, tasks } = useCoreData();
  const { gymLogs } = useWellnessData();
  const { attendance, assignments } = useAcademicData();
  const { customEvents } = usePlannerData();
  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || loading) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        if (_cachedProactiveEnabled === null) {
          const isProactiveEnabled = await AsyncStorage.getItem('zentrack_sara_proactive');
          _cachedProactiveEnabled = isProactiveEnabled !== 'false';
        }
        if (!_cachedProactiveEnabled) {
          setConflicts([]);
          return;
        }

        // Detect conflicts off the critical animation path
        const detected = detectConflicts({
          tasks,
          gymLogs,
          attendance,
          assignments,
          customEvents,
        });
        setConflicts(detected);
      });
    }, 1500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [user?.uid, loading, tasks, customEvents, gymLogs, attendance, assignments]); 

  return { conflicts };
};
