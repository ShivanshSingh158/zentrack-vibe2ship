/**
 * otaUpdateService.ts — ZenTrack Mobile
 *
 * Tier-1 Background OTA Update Synchronization (WhatsApp / Discord Pattern):
 * 1. Does NOT block startup (0ms cold boot from local flash storage).
 * 2. Silently checks for and downloads new EAS OTA updates in the background.
 * 3. Prepares the latest update so it seamlessly boots on the next app restart.
 */

import * as Updates from 'expo-updates';
import { InteractionManager } from 'react-native';

let isChecking = false;

/**
 * Checks for and downloads any newly published EAS updates in the background.
 * Runs strictly off-interaction to ensure 0% CPU competition with active UI animations.
 */
export async function syncOtaUpdateInBackground(silent = true): Promise<boolean> {
  // OTA updates only operate in standalone release builds (not Expo Go / __DEV__)
  if (__DEV__ || !Updates.isEnabled) {
    return false;
  }

  if (isChecking) return false;
  isChecking = true;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      if (!silent) console.log('[OTA] New update found on EAS cloud. Downloading in background... 📡');
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        console.log('[OTA] Update successfully downloaded and cached in local flash! Will apply on next launch. ⚡');
        return true;
      }
    }
  } catch (err) {
    // Network timeouts or offline mode are gracefully handled with zero UI disruption
    if (!silent) console.log('[OTA] Background update check skipped (offline or network timeout).');
  } finally {
    isChecking = false;
  }

  return false;
}

/**
 * Registers deferred background OTA sync on launch and app resume.
 */
export function registerDeferredOtaSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handle = InteractionManager.runAfterInteractions(() => {
    // Check for updates 7 seconds after boot once all screens and widgets have settled
    timer = setTimeout(() => {
      syncOtaUpdateInBackground().catch(() => {});
    }, 7000);
  });

  return () => {
    if (timer) clearTimeout(timer);
    handle.cancel();
  };
}
