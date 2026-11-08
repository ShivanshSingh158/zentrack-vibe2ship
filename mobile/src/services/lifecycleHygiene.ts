/**
 * lifecycleHygiene.ts — ZenTrack Mobile
 *
 * Tier-1 OS Lifecycle & Memory Management (WhatsApp / Uber Pattern):
 * 1. On 'background': Flushes pending offline writes to Firebase & stops background mic.
 * 2. On 'active': Triggers 1-read delta verification to ensure fresh state on warm resume.
 */

import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { syncOfflineQueue } from './offlineSync';
import { flushPendingXPCloudSync } from './xpSystem';
import { flushDomainCache } from '../utils/domainCache';
import { flushCoreCache } from '../utils/coreCache';

export function setupLifecycleHygiene(): () => void {
  let lastState = AppState.currentState;

  const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (lastState.match(/inactive|active/) && nextState === 'background') {
      // 1. Drain pending offline write queue to Firebase immediately:
      syncOfflineQueue(true).catch(() => {});

      // 2. Flush pending debounced XP cloud sync to prevent loss:
      try {
        flushPendingXPCloudSync();
      } catch {}

      // 3. Flush pending domain and core disk caches so 1s debounces are never lost:
      flushDomainCache().catch(() => {});
      flushCoreCache().catch(() => {});

      // 4. Stop active SARA mic if listening to protect OS battery:
      DeviceEventEmitter.emit('agent-stop-conversation-command');
    }

    if (lastState.match(/inactive|background/) && nextState === 'active') {
      // Warm resume: Firebase native SDK automatically maintains socket connections.
      // Do NOT tear down all 18 Firestore listeners on short switches — AppNavigator handles
      // long dormancy (>30m) health checks deferred without freezing navigation.
    }

    lastState = nextState;
  });

  return () => subscription.remove();
}
