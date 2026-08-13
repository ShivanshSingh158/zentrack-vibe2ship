/**
 * useGymProfile.ts — ZenTrack Mobile
 *
 * Reads/writes the user's gym athlete profile from AsyncStorage.
 * Key: 'gym_profile_v1'
 *
 * Profile is passed into GYM-GPT to personalise every coaching response:
 * warm-up, cool-down, load advice, exercise swaps, fatigue calculation.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'gym_profile_v1';

export interface GymProfile {
  /** Height in cm */
  heightCm: number | null;
  /** Bodyweight in kg */
  weightKg: number | null;
  /** Age in years */
  age: number | null;
  /** 'male' | 'female' | 'other' */
  gender: 'male' | 'female' | 'other' | null;
  /** Primary training goal */
  goal: 'hypertrophy' | 'strength' | 'fat_loss' | 'athletic' | null;
  /** Training experience */
  experience: 'beginner' | 'intermediate' | 'advanced' | null;
  /** Equipment available */
  equipment: 'full_gym' | 'home_gym' | 'bodyweight' | null;
  /** Preferred training days per week */
  daysPerWeek: number | null;
  /** Free-text injuries / limitations */
  limitations: string;
  /** Comma-separated exercises to avoid */
  exercisesToAvoid: string;
  /** Major muscles user wants to focus on */
  focusMuscles: string;
  /** Any other preferences or notes */
  notes: string;
}

export const DEFAULT_PROFILE: GymProfile = {
  heightCm: null,
  weightKg: null,
  age: null,
  gender: null,
  goal: null,
  experience: null,
  equipment: null,
  daysPerWeek: null,
  limitations: '',
  exercisesToAvoid: '',
  focusMuscles: '',
  notes: '',
};

export function useGymProfile() {
  const [gymProfile, setGymProfile] = useState<GymProfile>(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then(raw => {
        if (raw) {
          try {
            setGymProfile({ ...DEFAULT_PROFILE, ...JSON.parse(raw) });
          } catch (_) {}
        }
      })
      .finally(() => setProfileLoaded(true));
  }, []);

  const saveGymProfile = useCallback(async (profile: Partial<GymProfile>) => {
    setGymProfile(prev => ({ ...prev, ...profile }));
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ ...gymProfile, ...profile }));
  }, [gymProfile]);

  /**
   * Returns a compact string description of the profile for injection into
   * the GYM-GPT system prompt.
   */
  const profileSummary = useCallback((profile?: GymProfile): string => {
    const p = profile || gymProfile;
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
  }, [gymProfile]);

  return { gymProfile, profileLoaded, saveGymProfile, profileSummary };
}
