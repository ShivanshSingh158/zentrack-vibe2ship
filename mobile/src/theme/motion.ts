/**
 * motion.ts — ZenTrack Mobile
 *
 * Single source of truth for all spring configs and timing durations.
 * RULE: Every `withSpring` call in the app MUST import from here.
 * Never write one-off { damping: X, stiffness: Y } inline.
 */

import { Easing } from 'react-native-reanimated';
import type { WithSpringConfig } from 'react-native-reanimated';

export const springs: Record<string, WithSpringConfig> = {
  /** iOS Snappy — buttons, checkboxes, small toggles (critically damped, zero oscillation) */
  snappy: { damping: 28, stiffness: 300, mass: 0.7 },

  /** iOS Standard — card expand, sheet contents settling, tab switches */
  standard: { damping: 30, stiffness: 240, mass: 0.8 },

  /** iOS Gentle — bottom sheets sliding up, page transitions */
  gentle: { damping: 34, stiffness: 220, mass: 0.9 },

  /** Subtle Tactile Pop — celebrations, achievements (controlled, zero rubber-banding) */
  bouncy: { damping: 22, stiffness: 200, mass: 0.8 },
};

/** Apple iOS Cubic-Bezier Easing Presets */
export const iosEasing = {
  /** Deceleration curve (Ease-out) — entering elements, modals, dropdowns */
  decel: Easing.bezier(0.16, 1, 0.3, 1),
  /** Standard iOS curve (Ease-in-out) — gestures, switches, transitions */
  standard: Easing.bezier(0.25, 0.1, 0.25, 1),
  /** Acceleration curve (Ease-in) — exiting elements, dismissals */
  accel: Easing.bezier(0.32, 0, 0.67, 0),
};

export const durations = {
  /** Instant touch feedback press-down */
  microTap: 70,
  /** Fast touch release recovery */
  microRelease: 140,
  /** Delay between list items animating in */
  stagger: 30,
  /** Bottom sheet slide-up */
  sheetOpen: 250,
  /** Bottom sheet slide-down */
  sheetClose: 200,
  /** Tab content swap, week-strip day switch */
  crossFade: 180,
  /** Checkmark border fade-out */
  checkFade: 120,
  /** Checkmark path draw-in */
  checkDraw: 160,
  /** Poof dismiss (scale + opacity) */
  poof: 140,
};
