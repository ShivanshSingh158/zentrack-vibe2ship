import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import NetInfo from '@react-native-community/netinfo';
import { GymDayLog } from '../types/gym.types';

const GYM_QUEUE_KEY = '@zentrack_offline_gym_queue';

let isSyncing = false;

/**
 * Queues a GymDayLog to be saved when the network reconnects.
 * Ensures we only keep the latest version of a log for a given day.
 */
export async function queueGymLogOffline(log: GymDayLog) {
  try {
    const existingStr = await AsyncStorage.getItem(GYM_QUEUE_KEY);
    const queue: GymDayLog[] = existingStr ? JSON.parse(existingStr) : [];
    
    // Check if we already have this log queued, if so replace it
    const existingIndex = queue.findIndex(q => q.id === log.id || (q.userId === log.userId && q.date === log.date));
    
    if (existingIndex >= 0) {
      queue[existingIndex] = log;
    } else {
      queue.push(log);
    }

    await AsyncStorage.setItem(GYM_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Queued gym log for ${log.date}. Queue size: ${queue.length}`);
  } catch (e) {
    console.error('[OfflineSync] Failed to queue gym log', e);
  }
}

/**
 * Drains the queue and attempts to save to Firestore.
 */
export async function syncOfflineLogs() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      isSyncing = false;
      return;
    }

    const existingStr = await AsyncStorage.getItem(GYM_QUEUE_KEY);
    if (!existingStr) {
      isSyncing = false;
      return;
    }

    const queue: GymDayLog[] = JSON.parse(existingStr);
    if (queue.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[OfflineSync] Attempting to sync ${queue.length} gym logs to Firestore...`);

    const failedQueue: GymDayLog[] = [];

    for (const log of queue) {
      try {
        const logId = log.id || `${log.userId}_${log.date}`;
        const docRef = doc(db, 'gymLogs', logId);
        
        // Use setDoc merge to safely write over
        await setDoc(docRef, log, { merge: true });
        console.log(`[OfflineSync] Synced log ${logId}`);
      } catch (e) {
        console.error(`[OfflineSync] Failed to sync log ${log.id}, keeping in queue`, e);
        failedQueue.push(log);
      }
    }

    if (failedQueue.length > 0) {
      await AsyncStorage.setItem(GYM_QUEUE_KEY, JSON.stringify(failedQueue));
    } else {
      await AsyncStorage.removeItem(GYM_QUEUE_KEY);
      console.log('[OfflineSync] Queue cleared successfully.');
    }
  } catch (e) {
    console.error('[OfflineSync] Error during sync process', e);
  } finally {
    isSyncing = false;
  }
}

/**
 * Call this once when the app mounts to listen for reconnection events.
 */
export function setupNetworkListener() {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected) {
      syncOfflineLogs();
    }
  });
  
  // Also do an initial check
  syncOfflineLogs();

  return unsubscribe;
}
