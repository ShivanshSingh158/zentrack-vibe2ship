/**
 * useGymInsight.ts — ZenTrack Gym Module
 *
 * Workout insight generation — calls Gemini API once per day
 * when a workout is started. Fully deferred behind InteractionManager
 * so it never blocks the first frame.
 *
 * Extracted from GymHomeScreen.tsx triggerWorkoutInsight (was inline, ~40 lines).
 */
import { useState, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useGymProfile } from '../../../hooks/useGymProfile';
import {
  generateWorkoutInsight,
  hasInsightFiredToday,
  markInsightFiredToday,
  WorkoutInsight,
} from '../../../services/gymInsightEngine';

export function useGymInsight(gymLogs: any[]) {
  const { gymProfile } = useGymProfile();
  const [showInsightCard, setShowInsightCard] = useState(false);
  const [insightCardLoading, setInsightCardLoading] = useState(false);
  const [workoutInsight, setWorkoutInsight] = useState<WorkoutInsight | null>(null);
  const insightFiredRef = useRef(false);

  /**
   * Call this when a workout is started.
   * Deferred via InteractionManager — won't block render or animations.
   * Gated behind AsyncStorage 24h flag to prevent re-firing on every mount.
   */
  const triggerWorkoutInsight = (dateStr: string, exercises: any[]) => {
    if (insightFiredRef.current) return;

    InteractionManager.runAfterInteractions(async () => {
      try {
        const alreadyFired = await hasInsightFiredToday(dateStr);
        if (alreadyFired) return;
        insightFiredRef.current = true;
        setShowInsightCard(true);
        setInsightCardLoading(true);
        const insight = await generateWorkoutInsight(gymLogs ?? [], gymProfile, exercises, dateStr);
        setWorkoutInsight(insight);
        if (insight) { await markInsightFiredToday(dateStr); }
        else { insightFiredRef.current = false; }
      } catch {
        insightFiredRef.current = false;
      } finally {
        setInsightCardLoading(false);
      }
    });
  };

  return {
    showInsightCard, setShowInsightCard,
    insightCardLoading,
    workoutInsight,
    triggerWorkoutInsight,
  };
}
