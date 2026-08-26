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

const SYNC_META_KEY = '@zentrack_last_sync_meta_v1';
let _memorySyncTimestamp: number | null = null;
let _touchTimer: ReturnType<typeof setTimeout> | null = null;

export async function getLocalSyncTimestamp(): Promise<number> {
  if (_memorySyncTimestamp !== null) return _memorySyncTimestamp;
  try {
    const raw = await AsyncStorage.getItem(SYNC_META_KEY);
    _memorySyncTimestamp = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    _memorySyncTimestamp = 0;
  }
  return _memorySyncTimestamp;
}

export async function setLocalSyncTimestamp(ts: number): Promise<void> {
  _memorySyncTimestamp = ts;
  try {
    await AsyncStorage.setItem(SYNC_META_KEY, String(ts));
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
      const now = Date.now();
      const docRef = doc(db, 'user_sync_meta', targetUid);
      await setDoc(docRef, { lastModifiedAt: now }, { merge: true });
      await setLocalSyncTimestamp(now);
    } catch (err) {
      console.warn('[syncMeta] Error touching server sync meta:', err);
    }
  }, 1000);
}
