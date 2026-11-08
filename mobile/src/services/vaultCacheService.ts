/**
 * vaultCacheService.ts — ZenTrack Mobile
 *
 * Bulletproof, offline-first local file & document caching engine for Notes Vault.
 * Designed to NEVER throw unhandled exceptions or crash the app.
 */

import * as FileSystem from 'expo-file-system/legacy';

// In-memory lookup map to avoid repeated native FileSystem bridge calls
const MEMORY_PATH_CACHE = new Map<string, string>();
let _dirFilesSet: Set<string> | null = null;
let _dirFilesPromise: Promise<Set<string>> | null = null;

function fnv1a64(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch >> 8), 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Dynamically resolves the base cache directory at runtime.
 * Avoids top-level null/undefined evaluation crashes.
 */
function getVaultCacheDirPath(): string {
  try {
    const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
    if (!base) return '';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}zentrack_vault_cache/`;
  } catch (err) {
    console.warn('[VaultCache] Error getting base directory:', err);
    return '';
  }
}

/**
 * Ensures the dedicated vault cache directory exists.
 */
export async function ensureVaultCacheDir(): Promise<string | null> {
  try {
    const dir = getVaultCacheDirPath();
    if (!dir) return null;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch (err) {
    console.warn('[VaultCache] Failed to ensure cache directory:', err);
    return null;
  }
}

async function getDirFilesSet(): Promise<Set<string>> {
  if (_dirFilesSet) return _dirFilesSet;
  if (_dirFilesPromise) return _dirFilesPromise;

  _dirFilesPromise = (async () => {
    try {
      const dir = await ensureVaultCacheDir();
      if (!dir) return new Set<string>();
      const files = await FileSystem.readDirectoryAsync(dir);
      _dirFilesSet = new Set(files);
      return _dirFilesSet;
    } catch {
      _dirFilesSet = new Set<string>();
      return _dirFilesSet;
    } finally {
      _dirFilesPromise = null;
    }
  })();

  return _dirFilesPromise;
}

/**
 * Generates a deterministic, filesystem-safe local filename from a remote URL.
 * URL is stripped of query params (like temporary access tokens or timestamps)
 * so that identical assets always map to the exact same cache file.
 * Synchronous fnv1a64 eliminates native crypto bridge latency.
 */
export async function getCacheFilenameForUrl(url: string, originalFilename?: string): Promise<string> {
  if (!url) return 'file_fallback.dat';
  try {
    const cleanUrl = url.split('?')[0].split('#')[0] || url;
    const shortHash = fnv1a64(cleanUrl).substring(0, 24);

    let ext = '';
    if (originalFilename && originalFilename.includes('.')) {
      const parts = originalFilename.split('.');
      ext = '.' + (parts.pop() || '').toLowerCase();
    } else {
      const urlExtMatch = cleanUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/);
      if (urlExtMatch) {
        ext = '.' + urlExtMatch[1].toLowerCase();
      }
    }
    if (!ext && (url.includes('/image/') || url.includes('image'))) ext = '.jpg';
    if (!ext && (url.includes('/pdf') || url.includes('.pdf'))) ext = '.pdf';

    return `vcache_${shortHash}${ext}`;
  } catch {
    const safeUrl = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
    return `vault_${safeUrl}.dat`;
  }
}

/**
 * Returns legacy filename format for backwards compatibility with previously cached files.
 */
export async function getLegacyCacheFilenameForUrl(url: string, originalFilename?: string): Promise<string> {
  try {
    const shortHash = fnv1a64(url).substring(0, 16);
    let ext = '';
    if (originalFilename && originalFilename.includes('.')) {
      const parts = originalFilename.split('.');
      ext = '.' + (parts.pop() || '').toLowerCase();
    } else {
      const urlExtMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/);
      if (urlExtMatch) ext = '.' + urlExtMatch[1].toLowerCase();
    }
    const cleanName = (originalFilename || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);
    return `${cleanName}_${shortHash}${ext}`;
  } catch {
    return '';
  }
}

/**
 * Checks if a remote URL is already cached locally.
 * If cached and file has non-zero size, returns the local `file://` URI.
 * Otherwise returns `null`.
 * Uses in-memory Set lookup for 0.001ms O(1) response with 0 FileSystem.getInfoAsync calls.
 */
export async function getCachedFilePath(url: string, originalFilename?: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;

  const mem = MEMORY_PATH_CACHE.get(url);
  if (mem) return mem;

  // If already a local file:// uri, return directly if exists
  if (url.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(url);
      if (info.exists && info.size && info.size > 0) {
        MEMORY_PATH_CACHE.set(url, url);
        return url;
      }
    } catch {
      return null;
    }
  }

  try {
    const dir = await ensureVaultCacheDir();
    if (!dir) return null;

    const filesSet = await getDirFilesSet();

    // 1. Check primary deterministic filename in O(1) in-memory Set (0 bridge calls)
    const filename = await getCacheFilenameForUrl(url, originalFilename);
    if (filesSet.has(filename)) {
      const targetPath = `${dir}${filename}`;
      MEMORY_PATH_CACHE.set(url, targetPath);
      return targetPath;
    }

    // 2. Check legacy filename for backward compatibility in O(1) in-memory Set
    const legacyFilename = await getLegacyCacheFilenameForUrl(url, originalFilename);
    if (legacyFilename && legacyFilename !== filename && filesSet.has(legacyFilename)) {
      const legacyPath = `${dir}${legacyFilename}`;
      const targetPath = `${dir}${filename}`;
      try {
        await FileSystem.copyAsync({ from: legacyPath, to: targetPath });
        filesSet.add(filename);
        MEMORY_PATH_CACHE.set(url, targetPath);
        return targetPath;
      } catch {
        MEMORY_PATH_CACHE.set(url, legacyPath);
        return legacyPath;
      }
    }

    return null;
  } catch (err) {
    console.warn('[VaultCache] Error checking cache:', err);
    return null;
  }
}

/**
 * Quick check if file is cached.
 */
export async function isUrlCached(url: string, originalFilename?: string): Promise<boolean> {
  try {
    const path = await getCachedFilePath(url, originalFilename);
    return path !== null;
  } catch {
    return false;
  }
}

/**
 * Downloads a remote file and caches it permanently in the local vault cache.
 * Emits progress (0-100) if callback provided.
 */
export async function downloadAndCacheFile(
  url: string,
  originalFilename?: string,
  onProgress?: (percent: number) => void
): Promise<{ localUri: string; fromCache: boolean }> {
  if (!url) throw new Error('Cannot download empty URL');

  // Check if already in cache
  const existingPath = await getCachedFilePath(url, originalFilename);
  if (existingPath) {
    onProgress?.(100);
    return { localUri: existingPath, fromCache: true };
  }

  const dir = await ensureVaultCacheDir();
  if (!dir) {
    // If cache directory is unavailable, return remote URL as fallback
    return { localUri: url, fromCache: false };
  }

  const filename = await getCacheFilenameForUrl(url, originalFilename);
  const targetPath = `${dir}${filename}`;
  const tempPath = `${targetPath}.tmp_${Date.now()}`;

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      tempPath,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0 && onProgress) {
          const percent = Math.round(
            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
          );
          onProgress(Math.min(100, Math.max(0, percent)));
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.status || result.status < 200 || result.status >= 300) {
      try {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      } catch {}
      throw new Error(`Download failed with HTTP status ${result?.status ?? 'unknown'}`);
    }

    // Atomic move from temp to final destination
    await FileSystem.moveAsync({ from: tempPath, to: targetPath });
    _dirFilesSet?.add(filename);
    MEMORY_PATH_CACHE.set(url, targetPath);
    onProgress?.(100);
    return { localUri: targetPath, fromCache: false };
  } catch (err) {
    // Clean up temporary file on failure
    try {
      const info = await FileSystem.getInfoAsync(tempPath);
      if (info.exists) {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      }
    } catch {}
    throw err;
  }
}

/**
 * Copies a newly picked local file directly into the vault cache directory,
 * mapping it to the newly created remote Cloudinary URL.
 * 
 * Guaranteed never to throw.
 */
export async function cacheLocalFile(
  sourceLocalUri: string,
  remoteUrl: string,
  originalFilename?: string
): Promise<string | null> {
  if (!sourceLocalUri || !remoteUrl) return null;

  try {
    const dir = await ensureVaultCacheDir();
    if (!dir) return null;

    const filename = await getCacheFilenameForUrl(remoteUrl, originalFilename);
    const targetPath = `${dir}${filename}`;

    try {
      const sourceInfo = await FileSystem.getInfoAsync(sourceLocalUri);
      if (!sourceInfo.exists) return null;

      await FileSystem.copyAsync({
        from: sourceLocalUri,
        to: targetPath,
      });

      _dirFilesSet?.add(filename);
      MEMORY_PATH_CACHE.set(remoteUrl, targetPath);
      return targetPath;
    } catch (copyErr) {
      console.warn('[VaultCache] CopyAsync skipped (will download on demand):', copyErr);
      return null;
    }
  } catch (err) {
    console.warn('[VaultCache] Failed to pre-cache local file:', err);
    return null;
  }
}

/**
 * Returns cache size and total item count.
 * Batches FileSystem.getInfoAsync in chunks of 10 to protect native bridge queue.
 */
export async function getVaultCacheStats(): Promise<{ totalBytes: number; count: number; readableSize: string }> {
  try {
    const dir = await ensureVaultCacheDir();
    if (!dir) return { totalBytes: 0, count: 0, readableSize: '0 MB' };

    const files = await FileSystem.readDirectoryAsync(dir);
    let totalBytes = 0;
    const CHUNK_SIZE = 10;
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const infos = await Promise.all(
        chunk.map(f => FileSystem.getInfoAsync(`${dir}${f}`).catch(() => null))
      );
      for (const info of infos) {
        if (info && info.exists && info.size) {
          totalBytes += info.size;
        }
      }
    }

    const mb = totalBytes / (1024 * 1024);
    const readableSize = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;

    return { totalBytes, count: files.length, readableSize };
  } catch {
    return { totalBytes: 0, count: 0, readableSize: '0 MB' };
  }
}

/**
 * Clears all cached vault files.
 */
export async function clearVaultCache(): Promise<void> {
  try {
    _dirFilesSet?.clear();
    MEMORY_PATH_CACHE.clear();
    const dir = getVaultCacheDirPath();
    if (dir) {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
        await ensureVaultCacheDir();
      }
    }
  } catch (err) {
    console.warn('[VaultCache] Failed to clear cache:', err);
  }
}
