/**
 * safeWrite.ts — ZenTrack Mobile
 *
 * The WhatsApp Offline Write Pattern:
 *
 *   ONLINE  → call Firestore directly (fast path, instant confirmation via onSnapshot).
 *   OFFLINE → call queueWrite() to AsyncStorage + apply optimistic UI update immediately.
 *             On reconnect, offlineSync drains the queue in a single atomic batch.
 *
 * WHY NOT rely on Firebase built-in persistentLocalCache alone?
 *   Firebase internal queue is invisible to our OfflineIndicator, does NOT survive a
 *   force-kill (process termination clears in-memory queue before it can flush), and
 *   has no retry/backoff visibility. Our AsyncStorage queue solves all three.
 *
 * USAGE:
 *   await safeWrite(
 *     () => updateDoc(doc(db, 'tasks', id), { status: 'completed' }),
 *     COLLECTION.TASKS, 'update', { status: 'completed' }, id
 *   );
 */

import NetInfo from '@react-native-community/netinfo';
import { queueWrite } from '../services/offlineSync';
import { touchServerSyncMeta } from './syncMeta';

type FirestoreOperation = 'add' | 'update' | 'delete' | 'set';

/**
 * Executes a Firestore write safely:
 * - Online: calls firestoreFn() directly (fast path)
 * - Offline: enqueues via queueWrite() for reliable AsyncStorage-backed deferred sync
 *
 * @returns true if online write succeeded, false if queued offline
 */
export async function safeWrite(
  firestoreFn: () => Promise<any>,
  collectionName: string,
  operation: FirestoreOperation,
  data: any,
  docId?: string,
): Promise<boolean> {
  try {
    const now = Date.now();
    const payload = data && typeof data === 'object' ? { ...data } : data;
    if (payload && typeof payload === 'object' && operation !== 'delete') {
      if (!payload.updatedAt) payload.updatedAt = now;
      payload.clientUpdatedAt = now;
    }

    const state = await NetInfo.fetch();
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;

    if (isOnline) {
      try {
        await firestoreFn();
        touchServerSyncMeta();
        return true;
      } catch (onlineErr: any) {
        // Transient network blip even though NetInfo said online — queue as safety net
        console.warn(`[safeWrite] Online write failed for ${collectionName}/${docId}, queueing fallback:`, onlineErr?.message);
      }
    }

    // Offline path (or online write failed): enqueue to AsyncStorage
    await queueWrite(collectionName, operation, payload, docId);
    touchServerSyncMeta();
    return false;
  } catch (err) {
    try { await queueWrite(collectionName, operation, data, docId); touchServerSyncMeta(); } catch { /* silent */ }
    return false;
  }
}

/** Convenience: UPDATE */
export async function safeUpdate(
  docId: string,
  collectionName: string,
  data: Record<string, any>,
  firestoreFn: () => Promise<any>,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'update', data, docId);
}

/** Convenience: ADD (offline-queued adds get Firestore ID on drain, replacing optimistic entry) */
export async function safeAdd(
  collectionName: string,
  data: Record<string, any>,
  firestoreFn: () => Promise<any>,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'add', data, undefined);
}

/** Convenience: DELETE */
export async function safeDelete(
  docId: string,
  collectionName: string,
  firestoreFn: () => Promise<any>,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'delete', null, docId);
}
