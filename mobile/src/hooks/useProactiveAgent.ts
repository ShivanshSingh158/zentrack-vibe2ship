import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileData } from '../contexts/MobileDataContext';
import { detectConflicts, DetectedConflict } from '../services/conflictDetector';

export const useProactiveAgent = () => {
  const context = useMobileData();
  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);

  useEffect(() => {
    if (!context.user || context.loading) return;

    const runDetection = async () => {
      const isProactiveEnabled = await AsyncStorage.getItem('zentrack_sara_proactive');
      if (isProactiveEnabled === 'false') {
        setConflicts([]);
        return;
      }

      // Detect conflicts immediately locally
      const detected = detectConflicts(context);
      setConflicts(detected);
    };

    runDetection();
  }, [context.user, context.loading, context.tasks, context.customEvents]); 

  return { conflicts };
};
