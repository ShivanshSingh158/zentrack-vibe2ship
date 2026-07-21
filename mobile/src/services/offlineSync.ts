import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import NetInfo from '@react-native-community/netinfo';
import { COLLECTION } from '../config/constants';

const OFFLINE_QUEUE_KEY = '@zentrack_offline_write_queue';

let isSyncing = false;

interface QueueItem {
  id: string;
  collection: string;
  operation: 'add' | 'update' | 'delete' | 'set';
  data: any;
  docId?: string;
  timestamp: number;
}

/**
 * Queues ANY Firestore write operation to be executed when the network reconnects.
 * This is the core of Toggl-like Offline-First capability.
 */
export async function queueWrite(
  collectionName: string,
  operation: 'add' | 'update' | 'delete' | 'set',
  data: any,
  docId?: string
) {
  try {
    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: QueueItem[] = existingStr ? JSON.parse(existingStr) : [];
    
    queue.push({
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      collection: collectionName,
      operation,
      data,
      docId,
      timestamp: Date.now()
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Queued ${operation} in ${collectionName}. Queue size: ${queue.length}`);
    
    // Attempt to sync immediately if online
    syncOfflineQueue();
  } catch (e) {
    console.error('[OfflineSync] Failed to queue operation', e);
  }
}

/**
 * Legacy wrapper for Gym logs to maintain compatibility with existing gym code
 * during refactor, translates to the new generic queueWrite.
 */
export async function queueGymLogOffline(log: any) {
  await queueWrite(COLLECTION.GYM_LOGS, 'set', log, log.id || `${log.userId}_${log.date}`);
}

/**
 * Drains the generic offline queue and attempts to save to Firestore sequentially.
 */
export async function syncOfflineQueue() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      isSyncing = false;
      return;
    }

    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existingStr) {
      isSyncing = false;
      return;
    }

    const queue: QueueItem[] = JSON.parse(existingStr);
    if (queue.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[OfflineSync] Attempting to sync ${queue.length} operations to Firestore...`);

    const failedQueue: QueueItem[] = [];

    // Process sequentially to maintain causality
    for (const item of queue) {
      try {
        if (item.operation === 'add') {
          await addDoc(collection(db, item.collection), item.data);
        } else if (item.operation === 'set' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await setDoc(docRef, item.data, { merge: true });
        } else if (item.operation === 'update' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await updateDoc(docRef, item.data);
        } else if (item.operation === 'delete' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await deleteDoc(docRef);
        }
        console.log(`[OfflineSync] Synced ${item.operation} on ${item.collection}`);
      } catch (e) {
        console.error(`[OfflineSync] Failed to sync ${item.id}, keeping in queue`, e);
        failedQueue.push(item);
      }
    }

    if (failedQueue.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedQueue));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
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
      syncOfflineQueue();
    }
  });
  
  syncOfflineQueue();

  return unsubscribe;
}
