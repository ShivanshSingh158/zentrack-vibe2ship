import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import NetInfo from '@react-native-community/netinfo';
import { COLLECTION } from '../config/constants';

const OFFLINE_QUEUE_KEY = '@zentrack_offline_write_queue';

let isSyncing = false;
// Tracks whether the device has actually been offline in the current session.
// The sync-complete toast should ONLY show when this flips offline → online,
// not on every cold boot (which also calls syncOfflineQueue once).
let wasOfflineInSession = false;

interface QueueItem {
  id: string;
  collection: string;
  operation: 'add' | 'update' | 'delete' | 'set';
  data: any;
  docId?: string;
  timestamp: number;
}

// ── Listener Registry ───────────────────────────────────────────────────────
// OfflineIndicator subscribes here so it gets live queue-count updates and
// sync-complete events without any polling or prop-drilling.

type QueueChangeListener = (count: number) => void;
type SyncCompleteListener = (syncedCount: number) => void;

const queueChangeListeners = new Set<QueueChangeListener>();
const syncCompleteListeners = new Set<SyncCompleteListener>();

/** Subscribe to queue-size changes. Returns an unsubscribe function. */
export function subscribeToQueueChanges(cb: QueueChangeListener): () => void {
  queueChangeListeners.add(cb);
  // Immediately fire with current count so subscriber has the initial state
  getQueueCount().then(cb);
  return () => queueChangeListeners.delete(cb);
}

/** Subscribe to successful sync completions. Returns an unsubscribe function. */
export function subscribeToSyncComplete(cb: SyncCompleteListener): () => void {
  syncCompleteListeners.add(cb);
  return () => syncCompleteListeners.delete(cb);
}

async function notifyQueueChange() {
  const count = await getQueueCount();
  queueChangeListeners.forEach(cb => cb(count));
}

function notifySyncComplete(syncedCount: number) {
  syncCompleteListeners.forEach(cb => cb(syncedCount));
}

/** Returns the current number of pending offline write operations. */
export async function getQueueCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const queue: QueueItem[] = JSON.parse(raw);
    return queue.length;
  } catch {
    return 0;
  }
}

// ── Write Queueing ──────────────────────────────────────────────────────────

/**
 * Queues ANY Firestore write operation to be executed when the network reconnects.
 *
 * Use this for ALL write operations so offline users never lose data:
 *   - Tasks (CRUD)
 *   - Habit logs
 *   - Note saves
 *   - Goal updates
 *   - Gym logs (via queueGymLogOffline wrapper below)
 *   - Any other Firestore collection
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
      timestamp: Date.now(),
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Queued ${operation} in ${collectionName}. Queue size: ${queue.length}`);

    // Notify all subscribers (e.g. OfflineIndicator) that the count changed
    await notifyQueueChange();

    // Attempt to sync immediately if already online (no-op if offline)
    syncOfflineQueue();
  } catch (e) {
    console.error('[OfflineSync] Failed to queue operation', e);
  }
}

/**
 * Legacy wrapper for Gym logs — maintains compatibility with existing gym code.
 * Translates to the generic queueWrite.
 */
export async function queueGymLogOffline(log: any) {
  await queueWrite(COLLECTION.GYM_LOGS, 'set', log, log.id || `${log.userId}_${log.date}`);
}

// ── Queue Drain ─────────────────────────────────────────────────────────────

/**
 * Drains the offline queue sequentially to Firestore.
 * Returns the number of items successfully synced (used by UI toast).
 * Failed items remain in the queue for the next attempt.
 */
export async function syncOfflineQueue(): Promise<number> {
  if (isSyncing) return 0;
  isSyncing = true;

  let syncedCount = 0;

  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      isSyncing = false;
      return 0;
    }

    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existingStr) {
      isSyncing = false;
      return 0;
    }

    const queue: QueueItem[] = JSON.parse(existingStr);
    if (queue.length === 0) {
      isSyncing = false;
      return 0;
    }

    console.log(`[OfflineSync] Draining ${queue.length} operations to Firestore…`);

    const failedQueue: QueueItem[] = [];

    // Process sequentially to maintain causality (add before update, etc.)
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
        syncedCount++;
        console.log(`[OfflineSync] ✓ Synced ${item.operation} on ${item.collection}`);
      } catch (e) {
        console.error(`[OfflineSync] ✗ Failed to sync ${item.id}, retaining in queue`, e);
        failedQueue.push(item);
      }
    }

    if (failedQueue.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedQueue));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
      console.log('[OfflineSync] Queue cleared. All writes synced.');
    }

    // Notify listeners: queue count dropped + sync completed
    await notifyQueueChange();
    if (syncedCount > 0) {
      notifySyncComplete(syncedCount);
    }
  } catch (e) {
    console.error('[OfflineSync] Error during sync drain', e);
  } finally {
    isSyncing = false;
  }

  return syncedCount;
}

// ── Network Listener ────────────────────────────────────────────────────────

/**
 * Call this once in AppNavigator to automatically drain the queue when
 * the network reconnects. Returns an unsubscribe function.
 *
 * Only shows the "Synced N offline changes" toast when the device
 * actually went offline→online within this session, preventing the
 * false positive toast that appeared on every cold boot.
 */
export function setupNetworkListener(): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected === false) {
      // Device just went offline — remember this for the current session
      wasOfflineInSession = true;
    } else if (state.isConnected === true && wasOfflineInSession) {
      // Came back online after being offline — drain and show toast
      syncOfflineQueue();
    }
  });

  // On boot: drain silently without showing the sync toast.
  // We don't set wasOfflineInSession here, so notifySyncComplete
  // won't fire even if items drain successfully on startup.
  const bootDrain = async () => {
    const state = await NetInfo.fetch();
    if (state.isConnected) {
      // Drain without toast: temporarily suppress sync events
      const savedListeners = new Set(syncCompleteListeners);
      syncCompleteListeners.clear();
      await syncOfflineQueue();
      savedListeners.forEach(l => syncCompleteListeners.add(l));
    }
  };
  bootDrain();

  return unsubscribe;
}
