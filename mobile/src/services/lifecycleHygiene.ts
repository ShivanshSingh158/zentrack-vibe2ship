/**
 * lifecycleHygiene.ts — ZenTrack Mobile
 *
 * Tier-1 OS Lifecycle & Memory Management (WhatsApp / Uber Pattern):
 * 1. On 'background': Flushes pending offline writes to Firebase & stops background mic.
 * 2. On 'active': Triggers 1-read delta verification to ensure fresh state on warm resume.
 */

import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { syncOfflineQueue } from './offlineSync';

export function setupLifecycleHygiene(): () => void {
  let lastState = AppState.currentState;

  const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (lastState.match(/inactive|active/) && nextState === 'background') {
      // 1. Drain pending offline write queue to Firebase immediately:
      syncOfflineQueue(true).catch(() => {});

      // 2. Stop active SARA mic if listening to protect OS battery:
      DeviceEventEmitter.emit('agent-stop-conversation-command');
    }

    if (lastState.match(/inactive|background/) && nextState === 'active') {
      // 3. Trigger 1-read delta check on warm resume:
      DeviceEventEmitter.emit('firestore_force_reconnect');
    }

    lastState = nextState;
  });

  return () => subscription.remove();
}
