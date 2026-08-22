/**
 * vaultCacheService.ts — ZenTrack Mobile
 *
 * Bulletproof, offline-first local file & document caching engine for Notes Vault.
 * Designed to NEVER throw unhandled exceptions or crash the app.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

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

/**
 * Generates a deterministic, filesystem-safe local filename from a remote URL.
 */
export async function getCacheFilenameForUrl(url: string, originalFilename?: string): Promise<string> {
  if (!url) return 'file_fallback.dat';
  try {
    let hash = '';
    try {
      hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
    } catch {
      // Fallback simple hash if Crypto fails
      let h = 0;
      for (let i = 0; i < url.length; i++) {
        h = ((h << 5) - h + url.charCodeAt(i)) | 0;
      }
      hash = Math.abs(h).toString(16);
    }

    const shortHash = (hash || 'hash').substring(0, 16);

    // Extract or preserve extension
    let ext = '';
    if (originalFilename && originalFilename.includes('.')) {
      const parts = originalFilename.split('.');
      ext = '.' + (parts.pop() || '').toLowerCase();
    } else {
      const urlExtMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/);
      if (urlExtMatch) {
        ext = '.' + urlExtMatch[1].toLowerCase();
      }
    }

    const cleanName = (originalFilename || 'doc')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 20);

    return `${cleanName}_${shortHash}${ext}`;
  } catch {
    const safeUrl = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
    return `vault_${safeUrl}.dat`;
  }
}

/**
 * Checks if a remote URL is already cached locally.
 * If cached and file has non-zero size, returns the local `file://` URI.
 * Otherwise returns `null`.
 */
export async function getCachedFilePath(url: string, originalFilename?: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;

  // If already a local file:// uri, return directly if exists
  if (url.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(url);
      if (info.exists && info.size && info.size > 0) return url;
    } catch {
      return null;
    }
  }

  try {
    const dir = await ensureVaultCacheDir();
    if (!dir) return null;

    const filename = await getCacheFilenameForUrl(url, originalFilename);
    const targetPath = `${dir}${filename}`;
    const fileInfo = await FileSystem.getInfoAsync(targetPath);

    if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
      return targetPath;
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

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      targetPath,
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
    if (result && result.uri) {
      onProgress?.(100);
      return { localUri: result.uri, fromCache: false };
    }
    return { localUri: targetPath, fromCache: false };
  } catch (err) {
    // Clean up partial file on failure
    try {
      const info = await FileSystem.getInfoAsync(targetPath);
      if (info.exists) {
        await FileSystem.deleteAsync(targetPath, { idempotent: true });
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
 */
export async function getVaultCacheStats(): Promise<{ totalBytes: number; count: number; readableSize: string }> {
  try {
    const dir = await ensureVaultCacheDir();
    if (!dir) return { totalBytes: 0, count: 0, readableSize: '0 MB' };

    const files = await FileSystem.readDirectoryAsync(dir);
    let totalBytes = 0;

    for (const f of files) {
      const info = await FileSystem.getInfoAsync(`${dir}${f}`);
      if (info.exists && info.size) {
        totalBytes += info.size;
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
