/**
 * useXPLevel.ts — ZenTrack Dashboard Module
 *
 * XP_LEVELS thresholds and getLevel() pure function.
 * Extracted from DashboardScreen.tsx (was lines 28–52).
 */

export const XP_LEVELS = [
  { min: 0,     label: 'Seeker'     },
  { min: 500,   label: 'Guardian'   },
  { min: 1500,  label: 'Sentinel'   },
  { min: 3500,  label: 'Warden'     },
  { min: 7000,  label: 'Vanguard'   },
  { min: 13000, label: 'Architect'  },
  { min: 22000, label: 'Luminary'   },
  { min: 35000, label: 'Ascendant'  },
];

export interface XPLevelResult {
  label: string;
  nextLabel: string;
  progress: number;
  xp: number;
  nextXP: number;
}

export function getLevel(xp: number): XPLevelResult {
  let level = XP_LEVELS[0];
  let next = XP_LEVELS[1];
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].min) {
      level = XP_LEVELS[i];
      next = XP_LEVELS[i + 1] || XP_LEVELS[i];
    }
  }
  const progress = next.min !== level.min
    ? (xp - level.min) / (next.min - level.min)
    : 1;
  return { label: level.label, nextLabel: next.label, progress: Math.min(progress, 1), xp, nextXP: next.min };
}
