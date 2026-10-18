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
import { queueWrite, removeQueuedFallback } from '../services/offlineSync';
import { deepSanitize } from './firebaseUtils';

export type FirestoreOperation = 'add' | 'update' | 'delete' | 'set';

/**
 * Executes a Firestore write safely:
 * - Online: calls firestoreFn() directly (fast path)
 * - Offline: enqueues via queueWrite() for reliable AsyncStorage-backed deferred sync
 *
 * @returns true if online write succeeded, false if queued offline
 */
export async function safeWrite(
  firestoreFn: (sanitizedPayload?: any) => Promise<any>,
  collectionName: string,
  operation: FirestoreOperation,
  data: any,
  docId?: string,
): Promise<boolean> {
  const now = Date.now();
  const rawPayload = data && typeof data === 'object' ? { ...data } : data;
  if (rawPayload && typeof rawPayload === 'object' && operation !== 'delete') {
    if (!rawPayload.updatedAt) rawPayload.updatedAt = now;
    rawPayload.clientUpdatedAt = now;
  }
  const payload = rawPayload && typeof rawPayload === 'object' ? deepSanitize(rawPayload) : rawPayload;

  try {
    const state = await NetInfo.fetch();
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;

    if (isOnline) {
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout>;

      const onlinePromise = Promise.resolve(firestoreFn(payload));

      // If it times out at 3.5s, we queue a fallback.
      // If onlinePromise later succeeds in the background, we cancel/remove the queued fallback!
      onlinePromise
        .then(async () => {
          if (timedOut) {
            await removeQueuedFallback(collectionName, operation, docId);
          }
        })
        .catch(() => {});

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error('Firestore write timed out (3500ms)'));
          }, 3500);
        });

        await Promise.race([
          onlinePromise.finally(() => clearTimeout(timer)),
          timeoutPromise,
        ]);
        return true;
      } catch (onlineErr: any) {
        // Transient network blip or socket hang even though NetInfo said online — queue as safety net
        console.warn(
          `[safeWrite] Online write failed or timed out for ${collectionName}/${docId ?? 'new'}, queueing fallback:`,
          onlineErr?.message,
        );
      }
    }

    // Offline path (or online write failed): enqueue to AsyncStorage
    await queueWrite(collectionName, operation, payload, docId);
    return false;
  } catch {
    try {
      await queueWrite(collectionName, operation, payload, docId);
    } catch {
      /* silent */
    }
    return false;
  }
}

/** Convenience: UPDATE */
export async function safeUpdate(
  docId: string,
  collectionName: string,
  data: Record<string, any>,
  firestoreFn: (sanitizedPayload?: any) => Promise<any>,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'update', data, docId);
}

/** Convenience: ADD (supports optional deterministic docId to prevent duplicate creation on drain) */
export async function safeAdd(
  collectionName: string,
  data: Record<string, any>,
  firestoreFn: (sanitizedPayload?: any) => Promise<any>,
  docId?: string,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'add', data, docId);
}

/** Convenience: DELETE */
export async function safeDelete(
  docId: string,
  collectionName: string,
  firestoreFn: () => Promise<any>,
): Promise<boolean> {
  return safeWrite(firestoreFn, collectionName, 'delete', null, docId);
}

