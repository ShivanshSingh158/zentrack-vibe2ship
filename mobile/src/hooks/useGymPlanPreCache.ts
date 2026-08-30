/**
 * useGymPlanPreCache.ts — ZenTrack Mobile
 *
 * Background Exercise Media Pre-Caching:
 * - Listens for changes to the active User Gym Plan.
 * - Extracts all scheduled exercises across all training days.
 * - Silently downloads their animated GIFs into local FileSystem cache.
 * - Guarantees 100% offline animated form demonstrations in gym basements.
 */
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { GYM_PLAN } from '../data/gymPlan';
import { preCacheExercises } from '../services/exerciseMediaService';

export function useGymPlanPreCache() {
  const { userGymPlan } = useWellnessData();
  const lastPlanHashRef = useRef<string>('');

  useEffect(() => {
    const names: string[] = [];

    // Collect from userGymPlan.customDays
    if (userGymPlan?.customDays) {
      Object.values(userGymPlan.customDays).forEach((day: any) => {
        if (day?.exercises && Array.isArray(day.exercises)) {
          day.exercises.forEach((ex: any) => {
            if (ex?.name && !names.includes(ex.name)) {
              names.push(ex.name);
            }
          });
        }
      });
    }

    // Include default GYM_PLAN exercises if customDays is empty
    if (names.length === 0) {
      GYM_PLAN.forEach(day => {
        if (day?.exercises && Array.isArray(day.exercises)) {
          day.exercises.forEach(ex => {
            if (ex?.name && !names.includes(ex.name)) {
              names.push(ex.name);
            }
          });
        }
      });
    }

    const planHash = names.sort().join('|');
    if (planHash === lastPlanHashRef.current || names.length === 0) return;
    lastPlanHashRef.current = planHash;

    const task = InteractionManager.runAfterInteractions(() => {
      preCacheExercises(names).then(count => {
        if (count > 0) {
          console.log(`[GymPlanPreCache] Pre-cached ${count} exercise GIFs for offline workouts.`);
        }
      }).catch(err => {
        console.warn('[GymPlanPreCache] Pre-cache error:', err);
      });
    });

    return () => task.cancel();
  }, [userGymPlan]);
}
