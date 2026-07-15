/**
 * haptics.ts — ZenTrack Mobile
 *
 * Semantic haptic feedback wrapper. All screens call these functions,
 * never raw Haptics.impactAsync() calls, so the feel is consistent.
 *
 * Reference table:
 *  feedback.tap           — tapping a day chip, a tab, any icon
 *  feedback.commit        — logging a set, completing a task, confirming Sara's action
 *  feedback.success       — finishing a workout, hitting a PR, closing a streak
 *  feedback.warning       — streak at risk, deadline nudge
 *  feedback.selectionChange — scrolling a picker, swiping between week days
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const guard = (fn: () => void) => () => {
  if (Platform.OS === 'web') return;
  fn();
};

export const feedback = {
  /** Light — happens constantly, must never feel heavy */
  tap: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Medium — a real state change just happened */
  commit: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Distinct two-pulse pattern — reserve for genuine wins */
  success: guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** Different enough from success that it doesn't feel like praise */
  warning: guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  /** Continuous light ticks, like a physical dial */
  selectionChange: guard(() => Haptics.selectionAsync()),
};

// ─── Back-compat shims (existing call sites won't break) ─────────────────────
export const hapticLight   = feedback.tap;
export const hapticMedium  = feedback.commit;
export const hapticSuccess = feedback.success;
export const hapticError   = feedback.warning;
export const hapticSelection = feedback.selectionChange;
