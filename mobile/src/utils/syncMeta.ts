/**
 * syncMeta.ts — ZenTrack Mobile
 * Lightweight metadata sync tracker for 1-read delta synchronization.
 *
 * Checks a single document `user_sync_meta/{uid}` on app launch.
 * If lastModifiedAt matches local timestamp, skips heavy collection queries (1 read total).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';

const getSyncMetaKey = (uid?: string | null) =>
  uid ? `@zentrack_last_sync_meta_v1_${uid}` : '@zentrack_last_sync_meta_v1';

let _memorySyncTimestamps: Record<string, number> = {};
let _touchTimer: ReturnType<typeof setTimeout> | null = null;

export function clearSyncMeta(uid?: string): void {
  if (_touchTimer) {
    clearTimeout(_touchTimer);
    _touchTimer = null;
  }
  if (uid) {
    delete _memorySyncTimestamps[uid];
    AsyncStorage.removeItem(getSyncMetaKey(uid)).catch(() => {});
  } else {
    _memorySyncTimestamps = {};
  }
}

export async function getLocalSyncTimestamp(uid?: string): Promise<number> {
  const targetUid = uid || auth.currentUser?.uid;
  if (targetUid && _memorySyncTimestamps[targetUid] !== undefined) {
    return _memorySyncTimestamps[targetUid];
  }
  try {
    const raw = await AsyncStorage.getItem(getSyncMetaKey(targetUid));
    const val = raw ? parseInt(raw, 10) || 0 : 0;
    if (targetUid) {
      _memorySyncTimestamps[targetUid] = val;
    }
    return val;
  } catch {
    return 0;
  }
}

export async function setLocalSyncTimestamp(ts: number, uid?: string): Promise<void> {
  const targetUid = uid || auth.currentUser?.uid;
  if (targetUid) {
    _memorySyncTimestamps[targetUid] = ts;
  }
  try {
    await AsyncStorage.setItem(getSyncMetaKey(targetUid), String(ts));
  } catch {
    // ignore
  }
}

/**
 * Reads the single user_sync_meta/{uid} document from Firestore (1 read).
 */
export async function fetchServerSyncMeta(uid: string): Promise<{ lastModifiedAt: number } | null> {
  try {
    const docRef = doc(db, 'user_sync_meta', uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        lastModifiedAt: typeof data.lastModifiedAt === 'number' ? data.lastModifiedAt : 0,
      };
    }
    return null;
  } catch (err) {
    console.warn('[syncMeta] Error fetching server sync meta:', err);
    return null;
  }
}

/**
 * Updates the user_sync_meta/{uid} timestamp on Firestore (debounced to 1 write).
 */
export function touchServerSyncMeta(uid?: string): void {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return;

  if (_touchTimer) clearTimeout(_touchTimer);
  _touchTimer = setTimeout(async () => {
    try {
      // Guard against race condition: if user logged out or changed while timer was ticking
      const currentUid = auth.currentUser?.uid;
      if (!currentUid || currentUid !== targetUid) return;

      const now = Date.now();
      const docRef = doc(db, 'user_sync_meta', targetUid);
      await setDoc(docRef, { lastModifiedAt: now }, { merge: true });
      await setLocalSyncTimestamp(now, targetUid);
    } catch (err) {
      console.warn('[syncMeta] Error touching server sync meta:', err);
    } finally {
      _touchTimer = null;
    }
  }, 1000);
}
