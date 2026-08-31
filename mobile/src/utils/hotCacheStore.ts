/**
 * hotCacheStore.ts — ZenTrack Mobile
 *
 * High-Performance Persistent In-Memory Hot Cache Store (Survives Screen Unmounts).
 *
 * Implements the ViewModel / Hot-State pattern in React Native:
 * 1. Holds precomputed analytical models in RAM (0ms access on tab switch).
 * 2. Automatic invalidation: Cache keys bind to dataset references & timestamps.
 *    If logs/tasks change (optimistic write or Firestore sync), fresh math executes.
 * 3. True LRU bounded capacity (MAX_CACHE_ENTRIES = 60) — accessed entries are
 *    promoted to MRU position so frequently-used analytics survive eviction.
 * 4. Order-stable fingerprinting — sorts item IDs before hashing so Firestore
 *    reordering on reconnect does not generate spurious cache misses.
 * 5. Cleared on user logout.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 60;
const _HOT_CACHE = new Map<string, CacheEntry<any>>();

/**
 * Fast, ORDER-STABLE string hash for composite objects/arrays.
 *
 * FIX (Bug #2): Items are sorted by their stable ID/date key BEFORE fingerprinting.
 * Firestore onSnapshot does NOT guarantee consistent ordering across snapshots.
 * Without sorting, the same 142 gym logs arriving in a different order after
 * a network reconnect would generate a different fingerprint → cache miss →
 * all hot analytics recalculate from scratch on every relaunch.
 */
export function generateDatasetFingerprint(items: Array<any> | null | undefined, extraTag: string = ''): string {
  if (!items || items.length === 0) return `empty_${extraTag}`;
  // Extract stable keys and sort so fingerprint is independent of Firestore delivery order
  const keys = items
    .map(i => i?.id || i?.date || i?.completedAt || '')
    .filter(Boolean)
    .sort();
  const first = keys[0] ?? '0';
  const mid   = keys[Math.floor(keys.length / 2)] ?? '0';
  const last  = keys[keys.length - 1] ?? '0';
  return `${items.length}_${first}_${mid}_${last}_${extraTag}`;
}

/**
 * Retrieves a cached calculation.
 *
 * FIX (Risk A — True LRU): Promotes the accessed entry to the END of the Map
 * (most-recently-used position). Map iterates in insertion order, so the FIRST key
 * is always the LRU entry eligible for eviction. Frequently accessed analytics
 * (e.g. 30d gym stats the user is actively viewing) survive eviction correctly.
 */
export function getCachedAnalytics<T>(cacheKey: string): T | null {
  const entry = _HOT_CACHE.get(cacheKey);
  if (!entry) return null;
  // Promote to MRU: delete + re-insert at end of Map
  _HOT_CACHE.delete(cacheKey);
  _HOT_CACHE.set(cacheKey, entry);
  return entry.data as T;
}

/**
 * Stores a precalculated analytical object in memory with true LRU eviction.
 * Evicts the Least Recently Used entry (first key = oldest accessed after MRU promotions).
 */
export function setCachedAnalytics<T>(cacheKey: string, data: T): void {
  // If key already exists, delete first to re-insert at MRU position
  if (_HOT_CACHE.has(cacheKey)) {
    _HOT_CACHE.delete(cacheKey);
  } else if (_HOT_CACHE.size >= MAX_CACHE_ENTRIES) {
    // Evict true LRU entry (first key in Map = least recently accessed)
    const lruKey = _HOT_CACHE.keys().next().value;
    if (lruKey) _HOT_CACHE.delete(lruKey);
  }
  _HOT_CACHE.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Computes a value if not present in the hot cache, otherwise returns the cached instance.
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
 * Explicitly invalidates all cache entries with a given prefix (e.g. 'gym_', 'dash_').
 * If no prefix is given, clears the entire cache.
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
