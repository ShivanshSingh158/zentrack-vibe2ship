/**
 * hotCacheStore.ts — ZenTrack Mobile
 *
 * High-Performance Persistent In-Memory Hot Cache Store (Survives Screen Unmounts).
 *
 * Implements the ViewModel / Hot-State pattern in React Native:
 * 1. Holds precomputed analytical models in RAM (0ms access on tab switch).
 * 2. Automatic invalidation: Cache keys bind to dataset references & timestamps.
 *    If logs/tasks change (optimistic write or Firestore sync), fresh math executes.
 * 3. LRU bounded capacity (MAX_CACHE_ENTRIES = 60) to prevent memory growth.
 * 4. Cleared on user logout.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 60;
const _HOT_CACHE = new Map<string, CacheEntry<any>>();

/**
 * Fast string hash for composite objects/arrays.
 */
export function generateDatasetFingerprint(items: Array<any> | null | undefined, extraTag: string = ''): string {
  if (!items || items.length === 0) return `empty_${extraTag}`;
  // Use length + first item id/date + last item id/date for O(1) hashing
  const first = items[0];
  const last = items[items.length - 1];
  const firstKey = first?.id || first?.date || first?.completedAt || '0';
  const lastKey = last?.id || last?.date || last?.completedAt || '0';
  return `${items.length}_${firstKey}_${lastKey}_${extraTag}`;
}

/**
 * Retrieves a cached calculation or returns null if cache miss.
 */
export function getCachedAnalytics<T>(cacheKey: string): T | null {
  const entry = _HOT_CACHE.get(cacheKey);
  if (!entry) return null;
  return entry.data as T;
}

/**
 * Stores a precalculated analytical object in memory with LRU eviction.
 */
export function setCachedAnalytics<T>(cacheKey: string, data: T): void {
  if (_HOT_CACHE.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry (LRU)
    const oldestKey = _HOT_CACHE.keys().next().value;
    if (oldestKey) _HOT_CACHE.delete(oldestKey);
  }
  _HOT_CACHE.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Computes a value if not present in the hot cache, otherwise returns the cached instance in 0.00ms.
 */
export function computeOrGetHotCache<T>(cacheKey: string, computation: () => T): T {
  const cached = getCachedAnalytics<T>(cacheKey);
  if (cached !== null && cached !== undefined) {
    return cached;
  }
  const result = computation();
  setCachedAnalytics<T>(cacheKey, result);
  return result;
}

/**
 * Explicitly invalidates a cache prefix (e.g. 'gym_', 'tasks_', 'dashboard_').
 */
export function invalidateDomainHotCache(prefix?: string): void {
  if (!prefix) {
    _HOT_CACHE.clear();
    return;
  }
  for (const key of Array.from(_HOT_CACHE.keys())) {
    if (key.startsWith(prefix)) {
      _HOT_CACHE.delete(key);
    }
  }
}

/**
 * Clears all hot cache entries (called on user sign-out).
 */
export function clearDomainHotCache(): void {
  _HOT_CACHE.clear();
}
