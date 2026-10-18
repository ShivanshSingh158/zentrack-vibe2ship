import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import NetInfo from '@react-native-community/netinfo';
import { COLLECTION } from '../config/constants';

function restoreFirestoreSentinels(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clone: Record<string, any> = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    const val = clone[key];
    if (val && typeof val === 'object') {
      if (typeof val.__zentrackIncrement === 'number') {
        clone[key] = increment(val.__zentrackIncrement);
      } else if (val._methodName === 'increment' && typeof val._operand === 'number') {
        clone[key] = increment(val._operand);
      } else if (
        val._methodName === 'serverTimestamp' ||
        val.__zentrackServerTimestamp === true ||
        ((key === 'createdAt' || key === 'updatedAt' || key === 'timestamp' || key === 'startTime') &&
          Object.keys(val).length === 0)
      ) {
        clone[key] = serverTimestamp();
      } else {
        clone[key] = restoreFirestoreSentinels(val);
      }
    }
  }
  return clone;
}

const OFFLINE_QUEUE_KEY = '@zentrack_offline_write_queue';

// Synchronous In-Memory Write-Ahead Log (WAL) to prevent snapshot rollback
let _memoryQueue: OfflineQueueItem[] | null = null;

export async function initMemoryQueue(): Promise<OfflineQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    _memoryQueue = raw ? JSON.parse(raw) : [];
  } catch {
    _memoryQueue = [];
  }
  return _memoryQueue ?? [];
}

// Auto-seed memory queue on load
initMemoryQueue().catch(() => {});

export function getMemoryQueueSync(): OfflineQueueItem[] {
  return _memoryQueue || [];
}

/**
 * Synchronous snapshot overlay:
 * Merges pending in-flight offline writes over incoming server snapshots.
 * - 'set' / 'add': replaces or appends the item with local optimistic data
 * - 'update': merges local partial fields into the server doc
 * - 'delete': filters out the item so deleted docs never resurrect
 */
export function applyPendingQueueOverlay<T extends { id?: string }>(
  collectionName: string,
  serverDocs: T[]
): T[] {
  const queue = _memoryQueue;
  if (!queue || queue.length === 0) return serverDocs;

  const pendingItems = queue.filter(q => q.collection === collectionName);
  if (pendingItems.length === 0) return serverDocs;

  const result = [...serverDocs];

  const applyFieldsToDoc = (baseDoc: Record<string, any>, patch: Record<string, any>) => {
    const merged = { ...baseDoc };
    for (const [k, v] of Object.entries(patch || {})) {
      if (v && typeof v === 'object') {
        if (typeof v.__zentrackIncrement === 'number') {
          merged[k] = Math.max(0, (Number(merged[k]) || 0) + v.__zentrackIncrement);
          continue;
        }
        if (v._methodName === 'increment' && typeof v._operand === 'number') {
          merged[k] = Math.max(0, (Number(merged[k]) || 0) + v._operand);
          continue;
        }
      }
      merged[k] = v;
    }
    return merged;
  };

  for (const item of pendingItems) {
    if (!item.docId) continue;

    if (item.operation === 'delete') {
      const idx = result.findIndex(d => d.id === item.docId);
      if (idx !== -1) result.splice(idx, 1);
    } else if (item.operation === 'update') {
      const idx = result.findIndex(d => d.id === item.docId);
      if (idx !== -1) {
        result[idx] = applyFieldsToDoc(result[idx] as any, item.data) as T;
      }
    } else if (item.operation === 'set' || item.operation === 'add') {
      const idx = result.findIndex(d => d.id === item.docId);
      const itemData = { id: item.docId, ...(item.data || {}) };
      if (idx !== -1) {
        result[idx] = applyFieldsToDoc(result[idx] as any, itemData) as T;
      } else {
        result.unshift(applyFieldsToDoc({ id: item.docId }, itemData) as T);
      }
    }
  }

  return result;
}

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

    // ── Delete coalescing: cancel pending creations or replace pending updates ──
    if (docId && operation === 'delete') {
      const existingIndex = queue.findIndex(
        q => q.collection === collectionName && q.docId === docId
      );
      if (existingIndex !== -1) {
        const prev = queue[existingIndex];
        if (prev.operation === 'set' || prev.operation === 'add') {
          // Document was created offline and never synced; delete simply cancels it!
          queue.splice(existingIndex, 1);
          _memoryQueue = queue;
          await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
          console.log(`[OfflineSync] Coalesced and cancelled offline creation for ${collectionName}/${docId}. Queue size: ${queue.length}`);
          await notifyQueueChange();
          return;
        } else if (prev.operation === 'update') {
          // Replace obsolete update with delete
          queue[existingIndex] = {
            ...prev,
            operation: 'delete',
            data: null,
            createdAt: now,
            clientUpdatedAt: now,
            retryCount: 0,
          };
          _memoryQueue = queue;
          await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
          console.log(`[OfflineSync] Coalesced update -> delete for ${collectionName}/${docId}. Queue size: ${queue.length}`);
          await notifyQueueChange();
          if (auth.currentUser) syncOfflineQueue(true);
          return;
        } else if (prev.operation === 'delete') {
          return;
        }
      }
    }

    // ── Coalesce rapid updates to the same document (SUMMING increment sentinels!) ──
    if (docId && (operation === 'update' || operation === 'set')) {
      const existingIndex = queue.findIndex(
        q => q.collection === collectionName && q.docId === docId && (q.operation === 'update' || q.operation === 'set')
      );

      if (existingIndex !== -1) {
        const prev = queue[existingIndex];
        let mergedData = payload;

        if (typeof prev.data === 'object' && prev.data !== null && typeof payload === 'object' && payload !== null) {
          mergedData = { ...prev.data, ...payload, clientUpdatedAt: now, updatedAt: now };

          for (const key of Object.keys(payload)) {
            const prevVal = prev.data[key];
            const nextVal = payload[key];
            const prevInc = prevVal?.__zentrackIncrement ?? (prevVal?._methodName === 'increment' ? prevVal._operand : undefined);
            const nextInc = nextVal?.__zentrackIncrement ?? (nextVal?._methodName === 'increment' ? nextVal._operand : undefined);

            if (typeof prevInc === 'number' && typeof nextInc === 'number') {
              const totalInc = prevInc + nextInc;
              if (totalInc === 0) {
                delete mergedData[key];
              } else {
                mergedData[key] = { __zentrackIncrement: totalInc };
              }
            }
          }
        }

        queue[existingIndex] = {
          ...prev,
          data: mergedData,
          operation: operation === 'set' ? 'set' : prev.operation,
          createdAt: now,
          clientUpdatedAt: now,
          retryCount: 0,
        };

        _memoryQueue = queue;
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

    _memoryQueue = queue;
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

/**
 * Removes a fallback queue item if its in-flight online request succeeded in the background.
 * Prevents double execution of increment/mutation sentinels.
 */
export async function removeQueuedFallback(
  collectionName: string,
  operation: string,
  docId?: string
): Promise<boolean> {
  const queue = _memoryQueue;
  if (!queue || queue.length === 0) return false;

  const idx = queue.findIndex(
    q => q.collection === collectionName && q.operation === operation && (docId ? q.docId === docId : true)
  );

  if (idx !== -1) {
    queue.splice(idx, 1);
    _memoryQueue = queue;
    if (queue.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } else {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    }
    await notifyQueueChange();
    console.log(`[OfflineSync] In-flight online write succeeded; removed fallback queue item for ${collectionName}/${docId ?? 'new'}`);
    return true;
  }
  return false;
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

    // Auto-promote guest_* users to real Firebase anonymous credentials before draining
    if ((!auth.currentUser || (uid && uid.startsWith('guest_'))) && state.isConnected) {
      try {
        const { signInAnonymously } = await import('firebase/auth');
        const cred = await signInAnonymously(auth);
        const realUid = cred.user.uid;
        const oldGuestUid = uid;
        uid = realUid;

        const updatedOptimistic = {
          uid: realUid,
          isAnonymous: true,
          email: null,
          displayName: 'Guest User',
        };
        await AsyncStorage.setItem('@zentrack_optimistic_user', JSON.stringify(updatedOptimistic));
        const { updateL1Cache } = await import('../utils/bootManifest');
        updateL1Cache('optimisticUser', cred.user);

        if (oldGuestUid && oldGuestUid.startsWith('guest_')) {
          for (const qItem of queue) {
            if (qItem.data && typeof qItem.data === 'object' && qItem.data.userId === oldGuestUid) {
              qItem.data.userId = realUid;
            }
            if (qItem.docId && qItem.docId.includes(oldGuestUid)) {
              qItem.docId = qItem.docId.replace(oldGuestUid, realUid);
            }
          }
          await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        }
      } catch (promoErr) {
        console.warn('[OfflineSync] Could not promote guest user to Firebase session:', promoErr);
      }
    }

    console.log(`[OfflineSync] Draining ${queue.length} operations to Firestore for ${uid}…`);

    // High-Performance Fast Path: Chunk into batches of 400 and only remove the exact items that were synced
    const BATCH_LIMIT = 400;
    if (queue.length >= 1) {
      try {
        const syncedItemSignatures = new Set<string>();
        for (let i = 0; i < queue.length; i += BATCH_LIMIT) {
          const chunk = queue.slice(i, i + BATCH_LIMIT);
          const batch = writeBatch(db);
          for (const item of chunk) {
            let dataToWrite = item.data && typeof item.data === 'object' ? { ...item.data } : item.data;
            if (uid && dataToWrite && typeof dataToWrite === 'object' && !dataToWrite.userId && item.operation !== 'delete') {
              dataToWrite.userId = uid;
            }
            dataToWrite = restoreFirestoreSentinels(dataToWrite);

            if (item.operation === 'add') {
              const newDocRef = item.docId ? doc(db, item.collection, item.docId) : doc(collection(db, item.collection));
              batch.set(newDocRef, dataToWrite, { merge: true });
            } else if ((item.operation === 'set' || item.operation === 'update') && item.docId) {
              // Use set with merge: true so a missing doc doesn't abort the entire 400-op batch
              batch.set(doc(db, item.collection, item.docId), dataToWrite, { merge: true });
            } else if (item.operation === 'delete' && item.docId) {
              batch.delete(doc(db, item.collection, item.docId));
            }
            syncedItemSignatures.add(`${item.id}_${item.clientUpdatedAt}`);
          }
          await batch.commit();
          syncedCount += chunk.length;
        }

        // Preserve any items that were enqueued WHILE batch.commit() was in flight!
        const latestRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
        const latestQueue: OfflineQueueItem[] = latestRaw ? JSON.parse(latestRaw) : [];
        const remaining = latestQueue.filter(q => !syncedItemSignatures.has(`${q.id}_${q.clientUpdatedAt}`));

        _memoryQueue = remaining;
        if (remaining.length > 0) {
          await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        } else {
          await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
        }
        await notifyQueueChange();
        if (syncedCount > 0 && !silent) notifySyncComplete(syncedCount);
        return syncedCount;
      } catch (batchErr) {
        console.warn('[OfflineSync] Batch commit failed, falling back to sequential item drain:', batchErr);
      }
    }

    const failedQueue: OfflineQueueItem[] = [];
    const seqSyncedSignatures = new Set<string>();
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

        // Native Firestore Server Merge:
        // setDoc with { merge: true } and updateDoc natively perform field-level merges on the server without pre-flight getDoc reads.

        dataToWrite = restoreFirestoreSentinels(dataToWrite);

        if (item.operation === 'add') {
          if (item.docId) {
            await setDoc(doc(db, item.collection, item.docId), dataToWrite, { merge: true });
          } else {
            await addDoc(collection(db, item.collection), dataToWrite);
          }
        } else if (item.operation === 'set' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await setDoc(docRef, dataToWrite, { merge: true });
        } else if (item.operation === 'update' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          try {
            await updateDoc(docRef, dataToWrite);
          } catch (updateErr: any) {
            if (updateErr?.code === 'not-found' || updateErr?.message?.includes('No document to update')) {
              await setDoc(docRef, dataToWrite, { merge: true });
            } else {
              throw updateErr;
            }
          }
        } else if (item.operation === 'delete' && item.docId) {
          const docRef = doc(db, item.collection, item.docId);
          await deleteDoc(docRef);
        }
        syncedCount++;
        seqSyncedSignatures.add(`${item.id}_${item.clientUpdatedAt}`);
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

    const latestRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const latestQueue: OfflineQueueItem[] = latestRaw ? JSON.parse(latestRaw) : [];
    const remaining = [
      ...failedQueue,
      ...latestQueue.filter(q => !seqSyncedSignatures.has(`${q.id}_${q.clientUpdatedAt}`) && !failedQueue.some(f => f.id === q.id))
    ];

    _memoryQueue = remaining;
    if (remaining.length > 0) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
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
