/**
 * useGymProfile.ts — ZenTrack Mobile
 *
 * Reads/writes the user's gym athlete profile from AsyncStorage.
 * Key: 'gym_profile_v1'
 *
 * Profile is passed into GYM-GPT to personalise every coaching response:
 * warm-up, cool-down, load advice, exercise swaps, fatigue calculation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GymProfile } from '../types/gym.types';

export { GymProfile };

const PROFILE_KEY = 'gym_profile_v1';

let memoryProfile: GymProfile | null = null;

export const DEFAULT_PROFILE: GymProfile = {
  heightCm: null,
  weightKg: null,
  bodyweightKg: null,
  age: null,
  ageYears: null,
  gender: null,
  goal: null,
  primaryGoal: null,
  experience: null,
  trainingExperienceMonths: null,
  equipment: null,
  daysPerWeek: null,
  limitations: '',
  exercisesToAvoid: '',
  focusMuscles: '',
  notes: '',
};

export function useGymProfile() {
  const [gymProfile, setGymProfile] = useState<GymProfile>(memoryProfile || DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(!!memoryProfile);
  const profileRef = useRef<GymProfile>(memoryProfile || DEFAULT_PROFILE);

  useEffect(() => {
    let cancelled = false;
    if (memoryProfile) {
      setProfileLoaded(true);
      return;
    }
    AsyncStorage.getItem(PROFILE_KEY)
      .then(raw => {
        if (cancelled || !raw) return;
        try {
          const merged = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
          memoryProfile = merged;
          profileRef.current = merged;
          setGymProfile(merged);
        } catch (_) {}
      })
      .finally(() => {
        if (!cancelled) setProfileLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveGymProfile = useCallback(async (profile: Partial<GymProfile>) => {
    const next = { ...profileRef.current, ...profile };
    memoryProfile = next;
    profileRef.current = next;
    setGymProfile(next);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }, []);

  const profileSummary = useCallback((profile?: GymProfile): string => {
    const p = profile || profileRef.current;
    if (!p.goal && !p.weightKg && !p.experience) return '';

    const goalMap: Record<string, string> = {
      hypertrophy: 'Muscle Hypertrophy (size)',
      strength: 'Maximal Strength',
      fat_loss: 'Fat Loss + Muscle Retention',
      athletic: 'Athletic Performance',
    };
    const expMap: Record<string, string> = {
      beginner: 'Beginner (<1 year)',
      intermediate: 'Intermediate (1-3 years)',
      advanced: 'Advanced (3+ years)',
    };
    const eqMap: Record<string, string> = {
      full_gym: 'Full commercial gym',
      home_gym: 'Home gym (dumbbells/barbell)',
      bodyweight: 'Bodyweight only',
    };

    const lines: string[] = ['=== ATHLETE PROFILE ==='];
    if (p.heightCm) lines.push(`Height: ${p.heightCm} cm`);
    if (p.weightKg) lines.push(`Bodyweight: ${p.weightKg} kg`);
    if (p.age) lines.push(`Age: ${p.age} years`);
    if (p.gender) lines.push(`Gender: ${p.gender}`);
    if (p.goal) lines.push(`Primary Goal: ${goalMap[p.goal] || p.goal}`);
    if (p.experience) lines.push(`Experience: ${expMap[p.experience] || p.experience}`);
    if (p.equipment) lines.push(`Equipment: ${eqMap[p.equipment] || p.equipment}`);
    if (p.daysPerWeek) lines.push(`Training Days/Week: ${p.daysPerWeek}`);
    if (p.limitations) lines.push(`Injuries/Limitations: ${p.limitations}`);
    if (p.focusMuscles && typeof p.focusMuscles === 'string') lines.push(`Focus Muscles: ${p.focusMuscles}`);
    if (p.exercisesToAvoid) lines.push(`Exercises to AVOID: ${p.exercisesToAvoid}`);
    if (p.notes) lines.push(`Other Preferences: ${p.notes}`);
    lines.push('======================');
    return lines.join('\n');
  }, []);

  return { gymProfile, profileLoaded, saveGymProfile, profileSummary };
}
