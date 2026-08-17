import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import NetInfo from '@react-native-community/netinfo';
import { COLLECTION } from '../config/constants';

const OFFLINE_QUEUE_KEY = '@zentrack_offline_write_queue';

let isSyncing = false;
// Tracks whether the device has actually been offline in the current session.
// The sync-complete toast should ONLY show when this flips offline → online,
// not on every cold boot (which also calls syncOfflineQueue once).
let wasOfflineInSession = false;

export interface OfflineQueueItem {
  id: string;
  collection: string;
  operation: 'add' | 'update' | 'delete' | 'set';
  data: any;
  docId?: string;
  createdAt: number;
  retryCount: number;
  lastAttemptAt?: number;
}

// Backward-compatible alias
export type QueueItem = OfflineQueueItem;

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
    const queue: OfflineQueueItem[] = JSON.parse(raw);
    return queue.length;
  } catch {
    return 0;
  }
}

// ── Write Queueing & Coalescing ──────────────────────────────────────────────

/**
 * Queues ANY Firestore write operation to be executed when the network reconnects.
 *
 * Implements idempotent deterministic IDs and rapid-mutation coalescing:
 *   - If the same document has a pending 'update' or 'set', merges data in-place
 *     to prevent redundant network round-trips and race conditions.
 */
export async function queueWrite(
  collectionName: string,
  operation: 'add' | 'update' | 'delete' | 'set',
  data: any,
  docId?: string
) {
  try {
    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue: OfflineQueueItem[] = existingStr ? JSON.parse(existingStr) : [];

    const currentUser = auth.currentUser;
    const payload = data && typeof data === 'object' ? { ...data } : data;
    if (currentUser && payload && typeof payload === 'object' && !payload.userId && operation !== 'delete') {
      payload.userId = currentUser.uid;
    }

    const now = Date.now();
    const deterministicId = docId
      ? `${collectionName}_${docId}_${operation}`
      : `${collectionName}_auto_${now}_${Math.random().toString(36).substring(7)}`;

    // ── Coalesce rapid updates to the same document ──
    if (docId && (operation === 'update' || operation === 'set')) {
      const existingIndex = queue.findIndex(
        q => q.collection === collectionName && q.docId === docId && (q.operation === 'update' || q.operation === 'set')
      );

      if (existingIndex !== -1) {
        const prev = queue[existingIndex];
        const mergedData =
          typeof prev.data === 'object' && typeof payload === 'object'
            ? { ...prev.data, ...payload }
            : payload;

        queue[existingIndex] = {
          ...prev,
          data: mergedData,
          operation: operation === 'set' ? 'set' : prev.operation,
          createdAt: now,
          retryCount: 0,
        };

        await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        console.log(`[OfflineSync] Coalesced update for ${collectionName}/${docId}. Queue size: ${queue.length}`);
        await notifyQueueChange();
        if (auth.currentUser) syncOfflineQueue(true);
        return;
      }
    }

    queue.push({
      id: deterministicId,
      collection: collectionName,
      operation,
      data: payload,
      docId,
      createdAt: now,
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Queued ${operation} in ${collectionName}. Queue size: ${queue.length}`);

    // Notify all subscribers (e.g. OfflineIndicator) that the count changed
    await notifyQueueChange();

    // Attempt to sync immediately if online & authenticated (no-op if offline/guest)
    if (auth.currentUser) {
      syncOfflineQueue(true);
    }
  } catch (e) {
    console.warn('[OfflineSync] Failed to queue operation', e);
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
export async function syncOfflineQueue(silent = false): Promise<number> {
  if (isSyncing) return 0;
  isSyncing = true;

  let syncedCount = 0;

  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      isSyncing = false;
      return 0;
    }

    let uid = auth.currentUser?.uid;
    if (!uid) {
      try {
        const rawUser = await AsyncStorage.getItem('@zentrack_optimistic_user');
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          if (parsed?.uid) uid = parsed.uid;
        }
      } catch {}
    }

    if (!uid) {
      // Defer drain until user authentication is fully hydrated
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

    console.log(`[OfflineSync] Draining ${queue.length} operations to Firestore for ${uid}…`);

    // High-Performance Fast Path: Batch non-conflicting mutations into single round-trip
    if (queue.length > 1 && queue.length <= 500) {
      try {
        const batch = writeBatch(db);
        for (const item of queue) {
          const dataToWrite = item.data && typeof item.data === 'object' ? { ...item.data } : item.data;
          if (uid && dataToWrite && typeof dataToWrite === 'object' && !dataToWrite.userId && item.operation !== 'delete') {
            dataToWrite.userId = uid;
          }
          if (dataToWrite && typeof dataToWrite === 'object') {
            if (dataToWrite.createdAt && typeof dataToWrite.createdAt === 'object' && Object.keys(dataToWrite.createdAt).length === 0) {
              dataToWrite.createdAt = serverTimestamp();
            }
            if (dataToWrite.updatedAt && typeof dataToWrite.updatedAt === 'object' && Object.keys(dataToWrite.updatedAt).length === 0) {
              dataToWrite.updatedAt = serverTimestamp();
            }
          }

          if (item.operation === 'add') {
            const newDocRef = doc(collection(db, item.collection));
            batch.set(newDocRef, dataToWrite);
          } else if (item.operation === 'set' && item.docId) {
            const docRef = doc(db, item.collection, item.docId);
            batch.set(docRef, dataToWrite, { merge: true });
          } else if (item.operation === 'update' && item.docId) {
            const docRef = doc(db, item.collection, item.docId);
            batch.update(docRef, dataToWrite);
          } else if (item.operation === 'delete' && item.docId) {
            const docRef = doc(db, item.collection, item.docId);
            batch.delete(docRef);
          }
        }
        await batch.commit();
        syncedCount = queue.length;
        await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
        console.log(`[OfflineSync] ✓ Atomic batch synced ${syncedCount} operations in single round-trip.`);
        await notifyQueueChange();
        if (syncedCount > 0 && !silent) {
          notifySyncComplete(syncedCount);
        }
        return syncedCount;
      } catch (batchErr) {
        console.warn('[OfflineSync] Batch commit failed, falling back to sequential item drain:', batchErr);
      }
    }

    const failedQueue: OfflineQueueItem[] = [];
    const now = Date.now();

    // Process sequentially to maintain causality (add before update, etc.)
    for (const item of queue) {
      try {
        // Exponential backoff check: delay retries by 1.5s, 3s, 6s...
        if (item.retryCount > 0 && item.lastAttemptAt) {
          const backoffDelay = Math.min(30000, 1500 * Math.pow(2, item.retryCount - 1));
          if (now - item.lastAttemptAt < backoffDelay) {
            failedQueue.push(item);
            continue;
          }
        }

        const dataToWrite = item.data && typeof item.data === 'object' ? { ...item.data } : item.data;
        if (uid && dataToWrite && typeof dataToWrite === 'object' && !dataToWrite.userId && item.operation !== 'delete') {
          dataToWrite.userId = uid;
        }

        // Restore serialized sentinel timestamps if parsed as empty object
        if (dataToWrite && typeof dataToWrite === 'object') {
          if (dataToWrite.createdAt && typeof dataToWrite.createdAt === 'object' && Object.keys(dataToWrite.createdAt).length === 0) {
            dataToWrite.createdAt = serverTimestamp();
          }
          if (dataToWrite.updatedAt && typeof dataToWrite.updatedAt === 'object' && Object.keys(dataToWrite.updatedAt).length === 0) {
            dataToWrite.updatedAt = serverTimestamp();
          }
        }

        if (item.operation === 'add') {
          await addDoc(collection(db, item.collection), dataToWrite);
        } else if (item.operation === 'set' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await setDoc(docRef, dataToWrite, { merge: true });
        } else if (item.operation === 'update' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await updateDoc(docRef, dataToWrite);
        } else if (item.operation === 'delete' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await deleteDoc(docRef);
        }
        syncedCount++;
        console.log(`[OfflineSync] ✓ Synced ${item.operation} on ${item.collection} (id: ${item.id})`);
      } catch (e: any) {
        console.warn(`[OfflineSync] ✗ Write failed for item ${item.id} in ${item.collection}:`, e?.message || e);
        const isPermissionError = e?.message?.includes('permission') || e?.code?.includes('permission');
        const retryCount = (item.retryCount || 0) + 1;
        // Keep in queue for transient network drops; discard persistent authorization errors or corrupted items (>3 retries)
        if (!isPermissionError && retryCount < 4) {
          failedQueue.push({ ...item, retryCount, lastAttemptAt: Date.now() });
        } else {
          console.warn(`[OfflineSync] Discarding un-syncable queue item ${item.id} (${item.collection}) to prevent queue lock.`);
        }
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
    if (syncedCount > 0 && !silent) {
      notifySyncComplete(syncedCount);
    }
  } catch (e) {
    console.warn('[OfflineSync] Error during sync drain', e);
  } finally {
    isSyncing = false;
  }

  return syncedCount;
}

// ── Network & Auth Listener ─────────────────────────────────────────────────

/**
 * Call this once in AppNavigator to automatically drain the queue when
 * the network reconnects or user authenticates. Returns an unsubscribe function.
 */
export function setupNetworkListener(): () => void {
  const netUnsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected === false) {
      // Device just went offline — remember this for the current session
      wasOfflineInSession = true;
    } else if (state.isConnected === true && state.isInternetReachable !== false && wasOfflineInSession) {
      // Came back online after being offline — drain and show toast
      syncOfflineQueue();
    }
  });

  // When auth token restores or user logs in, trigger automatic background drain
  const authUnsubscribe = onAuthStateChanged(auth, user => {
    if (user) {
      syncOfflineQueue(true);
    }
  });

  // On boot: drain silently if already online and authenticated
  const bootDrain = async () => {
    const state = await NetInfo.fetch();
    if (state.isConnected && auth.currentUser) {
      await syncOfflineQueue(true);
    }
  };
  bootDrain();

  return () => {
    netUnsubscribe();
    authUnsubscribe();
  };
}
