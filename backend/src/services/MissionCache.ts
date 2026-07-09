/**
 * @file MissionCache.ts
 * @module src/services/MissionCache
 *
 * LRU Mission Result Cache — OPT-6
 *
 * Caches the last 10 completed agent mission results with a 30-second TTL.
 * Cache key = normalized query + a hash of the user's current data version
 * (task count + calendar event count) to invalidate when data changes.
 *
 * Why 30 seconds?
 * - A user typically won't ask the EXACT same question twice in 30s
 * - But if they do (voice repeat, clarification), we serve instantly
 * - Data versions ensure stale results aren't served after a task was created
 *
 * Usage:
 *   missionCache.get(query, dataVersion) → result | null
 *   missionCache.set(query, dataVersion, result)
 *   missionCache.invalidate() // call after any write tool completes
 */

const CACHE_MAX = 10;
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  key: string;
  result: string;
  storedAt: number;
  dataVersion: string;
}

class MissionCache {
  private entries: CacheEntry[] = [];

  private makeKey(query: string, dataVersion: string): string {
    // Normalize: lowercase, strip punctuation, collapse whitespace
    const normalized = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    return `${normalized}::${dataVersion}`;
  }

  get(query: string, dataVersion: string): string | null {
    const key = this.makeKey(query, dataVersion);
    const now = Date.now();
    const idx = this.entries.findIndex(e => e.key === key);
    if (idx === -1) return null;

    const entry = this.entries[idx];
    if (now - entry.storedAt > CACHE_TTL_MS) {
      // Expired — remove it
      this.entries.splice(idx, 1);
      return null;
    }

    // LRU: move to end (most recently used)
    this.entries.splice(idx, 1);
    this.entries.push(entry);
    console.log(`[MissionCache] ⚡ Cache HIT: "${query.slice(0, 40)}"  (${Math.round((now - entry.storedAt) / 1000)}s old)`);
    return entry.result;
  }

  set(query: string, dataVersion: string, result: string): void {
    const key = this.makeKey(query, dataVersion);

    // Remove existing entry for this key if present
    const existing = this.entries.findIndex(e => e.key === key);
    if (existing !== -1) this.entries.splice(existing, 1);

    // Evict oldest entry if at capacity
    if (this.entries.length >= CACHE_MAX) {
      this.entries.shift();
    }

    this.entries.push({ key, result, storedAt: Date.now(), dataVersion });
    console.log(`[MissionCache] 📦 Cached: "${query.slice(0, 40)}"`);
  }

  /** Call after any write tool completes — write operations change data. */
  invalidate(): void {
    this.entries = [];
    console.log('[MissionCache] 🗑️ Invalidated (data changed)');
  }

  get size(): number {
    return this.entries.length;
  }
}

export const missionCache = new MissionCache();

/**
 * Compute a lightweight data version string from appContext.
 * Changes whenever task count, calendar events, or notes change.
 */
export function computeDataVersion(appContext: any): string {
  const tasks = appContext?.tasks?.length ?? 0;
  const events = appContext?.calendarEvents?.length ?? 0;
  const notes = appContext?.notes?.length ?? 0;
  const habits = appContext?.habits?.length ?? 0;
  const goals = appContext?.goals?.length ?? 0;
  // BUG-005 FIX: Previous version only used item COUNTS, not content.
  // Completing a task doesn't change the count — it just changes task.status.
  // We now also hash a quick status fingerprint: count of completed tasks.
  // This invalidates the cache whenever any task changes state (complete/incomplete).
  const completedTasks = Array.isArray(appContext?.tasks)
    ? appContext.tasks.filter((t: any) => t.status === 'completed').length
    : 0;
  // Also fold in the most recent task's updatedAt if available (catches single-item edits)
  const lastTaskUpdate = Array.isArray(appContext?.tasks) && appContext.tasks.length > 0
    ? (appContext.tasks[appContext.tasks.length - 1]?.updatedAt?.seconds ?? 0)
    : 0;
  return `t${tasks}x${completedTasks}u${lastTaskUpdate}c${events}n${notes}h${habits}g${goals}`;
}
