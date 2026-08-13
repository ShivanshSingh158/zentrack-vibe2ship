/**
 * useXPLevel.ts — ZenTrack Dashboard Module
 *
 * XP_LEVELS thresholds and getLevel() pure function.
 * Extracted from DashboardScreen.tsx (was lines 28–52).
 */

import { LEVEL_THRESHOLDS, LEVEL_TITLES } from '../../services/xpSystem';

export interface XPLevelResult {
  label: string;
  nextLabel: string;
  progress: number;
  xp: number;
  nextXP: number;
}

export function getLevel(xp: number): XPLevelResult {
  let currentIndex = 0;
  
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      currentIndex = i;
    }
  }
  
  const currentLevelLabel = LEVEL_TITLES[currentIndex];
  
  const nextIndex = Math.min(currentIndex + 1, LEVEL_THRESHOLDS.length - 1);
  const nextLevelLabel = LEVEL_TITLES[nextIndex];
  const nextXP = LEVEL_THRESHOLDS[nextIndex];
  const currentThreshold = LEVEL_THRESHOLDS[currentIndex];
  
  let progress = 1;
  if (nextXP > currentThreshold) {
    progress = (xp - currentThreshold) / (nextXP - currentThreshold);
  } else if (nextXP === currentThreshold && nextIndex === LEVEL_THRESHOLDS.length - 1) {
    // Max level achieved
    progress = 1;
  }
  
  return { 
    label: currentLevelLabel, 
    nextLabel: nextLevelLabel, 
    progress: Math.min(Math.max(progress, 0), 1), 
    xp, 
    nextXP 
  };
}
