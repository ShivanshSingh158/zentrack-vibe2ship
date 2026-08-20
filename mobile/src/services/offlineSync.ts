import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
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
  clientUpdatedAt: number; // LWW Vector Clock timestamp
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
/**
 * Last-Write-Wins (LWW) Vector Clock Reconciler
 *
 * Compares offline local mutation timestamp with remote server timestamp.
 * - If local edit is newer (localClientUpdatedAt >= remoteUpdatedAt): writes localData.
 * - If remote edit is newer (remoteUpdatedAt > localClientUpdatedAt): performs field-level
 *   3-way merge to preserve newer remote values while applying non-conflicting local fields.
 */
async function reconcileLWW(
  collectionName: string,
  docId: string,
  localData: any,
  localClientUpdatedAt: number,
  operation: 'update' | 'set'
): Promise<{ shouldWrite: boolean; resolvedData: any }> {
  try {
    if (!docId || typeof localData !== 'object' || localData === null) {
      return { shouldWrite: true, resolvedData: localData };
    }

    const docRef = doc(db, collectionName, docId);
    const remoteSnap = await getDoc(docRef);

    if (!remoteSnap.exists()) {
      return { shouldWrite: true, resolvedData: localData };
    }

    const remoteData = remoteSnap.data() || {};
    let remoteUpdatedAt = remoteData.updatedAt || remoteData.clientUpdatedAt || remoteData.lastUpdated || 0;

    // Convert Firestore Timestamp object if present
    if (remoteUpdatedAt && typeof remoteUpdatedAt === 'object' && typeof remoteUpdatedAt.toMillis === 'function') {
      remoteUpdatedAt = remoteUpdatedAt.toMillis();
    } else if (typeof remoteUpdatedAt === 'string') {
      remoteUpdatedAt = new Date(remoteUpdatedAt).getTime() || 0;
    } else if (typeof remoteUpdatedAt !== 'number' || isNaN(remoteUpdatedAt)) {
      remoteUpdatedAt = 0;
    }

    // Fast path: Local mutation is newer or equal -> Local wins
    if (localClientUpdatedAt >= remoteUpdatedAt) {
      return {
        shouldWrite: true,
        resolvedData: {
          ...localData,
          updatedAt: localClientUpdatedAt,
          clientUpdatedAt: localClientUpdatedAt,
        },
      };
    }

    // MULTI-MASTER CONFLICT: Remote document was edited on another device AFTER this offline mutation
    console.log(
      `[OfflineSync/LWW] Conflict on ${collectionName}/${docId}! Remote (${remoteUpdatedAt}) > Local (${localClientUpdatedAt}). Performing field-level 3-way merge.`
    );

    // 3-Way Field-Level Merge:
    // Base is remoteData (since it is newer), overlay only fields that remote did NOT touch
    const resolvedData = { ...remoteData };

    for (const key of Object.keys(localData)) {
      if (key === 'id' || key === 'userId' || key === 'createdAt') continue;

      // If remote doesn't have this field or it was empty, take local
      if (remoteData[key] === undefined || remoteData[key] === null) {
        resolvedData[key] = localData[key];
      }
    }

    resolvedData.updatedAt = Date.now();
    resolvedData.clientUpdatedAt = Date.now();

    return { shouldWrite: true, resolvedData };
  } catch (err) {
    console.warn(`[OfflineSync/LWW] Reconcile error for ${collectionName}/${docId}, defaulting to local:`, err);
    return { shouldWrite: true, resolvedData: localData };
  }
}

export async function queueWrite(
  collectionName: string,
  operation: 'add' | 'update' | 'delete' | 'set',
  data: any,
  docId?: string
) {
  try {
    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue: OfflineQueueItem[] = existingStr ? JSON.parse(existingStr) : [];

    const now = Date.now();
    const currentUser = auth.currentUser;
    const payload = data && typeof data === 'object' ? { ...data } : data;
    if (currentUser && payload && typeof payload === 'object' && !payload.userId && operation !== 'delete') {
      payload.userId = currentUser.uid;
    }
    if (payload && typeof payload === 'object' && operation !== 'delete') {
      payload.clientUpdatedAt = now;
      payload.updatedAt = now;
    }

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
            ? { ...prev.data, ...payload, clientUpdatedAt: now, updatedAt: now }
            : payload;

        queue[existingIndex] = {
          ...prev,
          data: mergedData,
          operation: operation === 'set' ? 'set' : prev.operation,
          createdAt: now,
          clientUpdatedAt: now,
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
      clientUpdatedAt: now,
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

        let dataToWrite = item.data && typeof item.data === 'object' ? { ...item.data } : item.data;
        if (uid && dataToWrite && typeof dataToWrite === 'object' && !dataToWrite.userId && item.operation !== 'delete') {
          dataToWrite.userId = uid;
        }

        // LWW Multi-Master Conflict Reconciler:
        // If document was modified remotely, merge field-by-field without overwriting newer server data
        if ((item.operation === 'update' || item.operation === 'set') && item.docId) {
          const lwwResult = await reconcileLWW(
            item.collection,
            item.docId,
            dataToWrite,
            item.clientUpdatedAt || item.createdAt || Date.now(),
            item.operation
          );
          dataToWrite = lwwResult.resolvedData;
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
