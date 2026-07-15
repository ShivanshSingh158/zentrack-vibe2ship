/**
 * motion.ts — ZenTrack Mobile
 *
 * Single source of truth for all spring configs and timing durations.
 * RULE: Every `withSpring` call in the app MUST import from here.
 * Never write one-off { damping: X, stiffness: Y } inline.
 */

import type { WithSpringConfig } from 'react-native-reanimated';

export const springs: Record<string, WithSpringConfig> = {
  /** Snappy — buttons, checkboxes, small toggles */
  snappy: { damping: 18, stiffness: 220, mass: 0.6 },

  /** Standard — card expand, sheet contents settling, tab switches */
  standard: { damping: 20, stiffness: 160, mass: 0.8 },

  /** Gentle — bottom sheets sliding up, page transitions */
  gentle: { damping: 22, stiffness: 120, mass: 1 },

  /** Bouncy — success states, streak celebrations, PR badges */
  bouncy: { damping: 10, stiffness: 180, mass: 0.7 },
};

export const durations = {
  /** Icon color change, button press-down */
  microTap: 100,
  /** Delay between list items animating in */
  stagger: 40,
  /** Bottom sheet slide-up */
  sheetOpen: 300,
  /** Tab content swap, week-strip day switch */
  crossFade: 200,
  /** Checkmark border fade-out */
  checkFade: 150,
  /** Checkmark path draw-in */
  checkDraw: 200,
  /** Poof dismiss (scale + opacity) */
  poof: 150,
};
