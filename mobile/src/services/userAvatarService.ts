/**
 * userAvatarService.ts — ZenTrack Mobile
 *
 * Permanent, offline-first on-device disk caching for user profile avatars (Google/Gmail photoURL).
 * - Saves user avatar to ${FileSystem.documentDirectory}zentrack_avatar_cache/avatar_${uid}.jpg
 * - Survives app force-quits, device reboots, and cache cleans.
 * - Provides synchronous in-memory lookup for 0ms Frame 0 rendering.
 * - Auto-detects URL updates and downloads in background without UI blocking.
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AVATAR_DIR_NAME = 'zentrack_avatar_cache/';
const ASYNC_STORAGE_PREFIX = '@zentrack_avatar_disk_path_';
const ASYNC_STORAGE_SOURCE_URL_PREFIX = '@zentrack_avatar_source_url_';

// In-memory cache for 0ms synchronous access
const MEMORY_AVATAR_CACHE = new Map<string, string>();

// Subscribed listeners for cache updates (e.g., when a background download finishes)
type AvatarChangeListener = (uid: string, localUri: string) => void;
const listeners = new Set<AvatarChangeListener>();

export function subscribeAvatarChanges(listener: AvatarChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAvatarChange(uid: string, localUri: string) {
  listeners.forEach(fn => {
    try {
      fn(uid, localUri);
    } catch (e) {
      console.warn('[UserAvatarService] Listener error:', e);
    }
  });
}

function getAvatarCacheDirPath(): string {
  try {
    const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    if (!base) return '';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}${AVATAR_DIR_NAME}`;
  } catch {
    return '';
  }
}

export async function ensureAvatarCacheDir(): Promise<string | null> {
  try {
    const dir = getAvatarCacheDirPath();
    if (!dir) return null;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch (err) {
    console.warn('[UserAvatarService] Failed to ensure avatar cache dir:', err);
    return null;
  }
}

function getCleanUid(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getAvatarFilePath(uid: string): string {
  const dir = getAvatarCacheDirPath();
  if (!dir) return '';
  return `${dir}avatar_${getCleanUid(uid)}.jpg`;
}

/**
 * Returns synchronous local avatar URI if already resolved in-memory.
 */
export function getLocalAvatarUriSync(uid?: string | null): string | null {
  if (!uid) return null;
  return MEMORY_AVATAR_CACHE.get(uid) || null;
}

/**
 * Resolves cached disk avatar path asynchronously (checks memory -> disk -> AsyncStorage).
 */
export async function getCachedAvatarUri(uid: string): Promise<string | null> {
  if (!uid) return null;

  // 1. Check in-memory
  const mem = MEMORY_AVATAR_CACHE.get(uid);
  if (mem) return mem;

  const localPath = getAvatarFilePath(uid);
  if (!localPath) return null;

  // 2. Check expected disk path directly
  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info.size ?? 0) > 100) {
      MEMORY_AVATAR_CACHE.set(uid, localPath);
      AsyncStorage.setItem(`${ASYNC_STORAGE_PREFIX}${uid}`, localPath).catch(() => {});
      return localPath;
    }
  } catch {}

  // 3. Check AsyncStorage for known file path if different
  try {
    const storedPath = await AsyncStorage.getItem(`${ASYNC_STORAGE_PREFIX}${uid}`);
    if (storedPath && storedPath !== localPath) {
      const info = await FileSystem.getInfoAsync(storedPath);
      if (info.exists && (info.size ?? 0) > 100) {
        MEMORY_AVATAR_CACHE.set(uid, storedPath);
        return storedPath;
      }
    }
  } catch {}

  return null;
}

// In-flight download promises to coalesce simultaneous requests for same UID
const inFlightDownloads = new Map<string, Promise<string | null>>();

/**
 * Downloads and caches the user avatar to persistent local disk.
 * If already cached and remoteUrl hasn't changed, returns existing file immediately.
 */
export async function cacheUserAvatar(uid: string, remoteUrl: string): Promise<string | null> {
  if (!uid || !remoteUrl) return null;

  // Coalesce duplicate in-flight requests
  const existingPromise = inFlightDownloads.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const downloadPromise = (async () => {
    try {
      const dir = await ensureAvatarCacheDir();
      if (!dir) return null;

      const localPath = getAvatarFilePath(uid);
      if (!localPath) return null;

      // Check if local file already exists and remote URL is identical
      const cachedSourceUrl = await AsyncStorage.getItem(`${ASYNC_STORAGE_SOURCE_URL_PREFIX}${uid}`);
      try {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists && (fileInfo.size ?? 0) > 100 && cachedSourceUrl === remoteUrl) {
          MEMORY_AVATAR_CACHE.set(uid, localPath);
          return localPath;
        }
      } catch {
        // Continue to download if check failed
      }

      // Download to a temporary file first, then atomic move to prevent partial writes
      const tempPath = `${dir}temp_avatar_${getCleanUid(uid)}_${Date.now()}.jpg`;
      const downloadRes = await FileSystem.downloadAsync(remoteUrl, tempPath);

      if (downloadRes && downloadRes.status >= 200 && downloadRes.status < 300) {
        try {
          const existingInfo = await FileSystem.getInfoAsync(localPath);
          if (existingInfo.exists) {
            await FileSystem.deleteAsync(localPath, { idempotent: true });
          }
          await FileSystem.moveAsync({ from: tempPath, to: localPath });

          MEMORY_AVATAR_CACHE.set(uid, localPath);
          await Promise.all([
            AsyncStorage.setItem(`${ASYNC_STORAGE_PREFIX}${uid}`, localPath),
            AsyncStorage.setItem(`${ASYNC_STORAGE_SOURCE_URL_PREFIX}${uid}`, remoteUrl),
          ]);
          notifyAvatarChange(uid, localPath);
          return localPath;
        } catch (moveErr) {
          console.warn('[UserAvatarService] Error moving temp avatar file:', moveErr);
          FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        }
      } else {
        FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
      }
    } catch (err) {
      console.warn('[UserAvatarService] Failed to cache user avatar:', err);
    } finally {
      inFlightDownloads.delete(uid);
    }

    return null;
  })();

  inFlightDownloads.set(uid, downloadPromise);
  return downloadPromise;
}

/**
 * Pre-hydrates avatar cache on boot for the given user.
 */
export async function initAvatarCacheOnBoot(uid?: string | null): Promise<string | null> {
  if (!uid) return null;
  return getCachedAvatarUri(uid);
}

/**
 * Clears cached avatar files on sign-out or account wipe.
 */
export async function clearAvatarCache(uid?: string | null): Promise<void> {
  if (!uid) return;
  try {
    MEMORY_AVATAR_CACHE.delete(uid);
    const localPath = getAvatarFilePath(uid);
    if (localPath) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
    await Promise.all([
      AsyncStorage.removeItem(`${ASYNC_STORAGE_PREFIX}${uid}`),
      AsyncStorage.removeItem(`${ASYNC_STORAGE_SOURCE_URL_PREFIX}${uid}`),
    ]);
  } catch (err) {
    console.warn('[UserAvatarService] Error clearing avatar cache:', err);
  }
}
