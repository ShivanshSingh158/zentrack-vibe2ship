/**
 * backgroundProactiveAgent.ts — ZenTrack Mobile
 * 
 * DEPRECATED & DEACTIVATED
 * Background AI Nudge has been disabled to keep the app lightweight,
 * battery-friendly, and to eliminate unnecessary background Gemini API calls.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

export const BACKGROUND_AI_NUDGE = 'BACKGROUND_AI_NUDGE';

/**
 * Unregisters the background proactive task if previously registered with the OS.
 */
export async function unregisterBackgroundProactiveAgent() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_AI_NUDGE);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_AI_NUDGE).catch(() => {});
      console.log('[ProactiveAgent] Deprecated background task cleanly unregistered.');
    }
  } catch (_) {}
}
