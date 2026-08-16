/**
 * domainCache.ts — AsyncStorage helpers for ALL domain data in ZenTrack Mobile
 *
 * Implements stale-while-revalidate for every domain context:
 *   Wellness  : gymLogs, userGymPlan, waterLogs, sleepLogs, weightLogs
 *   Academic  : attendance, attendanceLogs, assignments, semesters, semesterSubjects
 *   Planner   : customEvents, goals, weeklyReviews
 *   Creative  : storageNodes, learningTopics, jobs
 *
 * Boot flow (same pattern as coreCache.ts):
 *   1. On boot: multiGet from AsyncStorage instantly (~5ms, no network)
 *   2. Seed context state immediately — screen is usable before Firestore responds
 *   3. After each Firestore snapshot: multiSet to update the cache
 *
 * This ensures ALL screens show real data even when offline.
 *
 * Cache clear: called on logout — stale data from a previous user never bleeds.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Cache Keys ───────────────────────────────────────────────────────────────
export const DOMAIN_CACHE_KEYS = {
  // Wellness
  GYM_LOGS:         '@zentrack_cache_gym_logs',
  USER_GYM_PLAN:    '@zentrack_cache_user_gym_plan',
  WATER_LOGS:       '@zentrack_cache_water_logs',
  SLEEP_LOGS:       '@zentrack_cache_sleep_logs',
  WEIGHT_LOGS:      '@zentrack_cache_weight_logs',
  // Academic
  ATTENDANCE:       '@zentrack_cache_attendance',
  ATTENDANCE_LOGS:  '@zentrack_cache_attendance_logs',
  ASSIGNMENTS:      '@zentrack_cache_assignments',
  SEMESTERS:        '@zentrack_cache_semesters',
  SEM_SUBJECTS:     '@zentrack_cache_sem_subjects',
  // Planner
  CUSTOM_EVENTS:    '@zentrack_cache_custom_events',
  GOALS:            '@zentrack_cache_goals',
  WEEKLY_REVIEWS:   '@zentrack_cache_weekly_reviews',
  // Creative
  STORAGE_NODES:    '@zentrack_cache_storage_nodes',
  LEARNING_TOPICS:  '@zentrack_cache_learning_topics',
  JOBS:             '@zentrack_cache_jobs',
  CONTENT_LOGS:     '@zentrack_cache_content_logs',
} as const;

type CacheKey = typeof DOMAIN_CACHE_KEYS[keyof typeof DOMAIN_CACHE_KEYS];

// ─── Generic read helper — reads multiple keys in one multiGet call ───────────
export async function readDomainCache<T extends Record<string, any>>(
  keyMap: Record<string, CacheKey>
): Promise<Partial<T>> {
  try {
    const keys = Object.values(keyMap) as string[];
    const pairs = await AsyncStorage.multiGet(keys);
    const result: any = {};
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      try {
        const fieldName = Object.keys(keyMap).find(k => keyMap[k] === key);
        if (fieldName) result[fieldName] = JSON.parse(raw);
      } catch { /* ignore individual parse errors */ }
    }
    return result as Partial<T>;
  } catch {
    return {}; // Cache miss is always safe
  }
}

// Debounce state to batch disk writes and avoid JS thread blocking
const _writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _pendingWrites = new Map<string, { data: Record<string, any>; keyMap: Record<string, CacheKey> }>();

export async function flushDomainCache(domainKey?: string): Promise<void> {
  const keysToFlush = domainKey ? [domainKey] : Array.from(_pendingWrites.keys());
  for (const key of keysToFlush) {
    const pending = _pendingWrites.get(key);
    if (!pending) continue;
    _pendingWrites.delete(key);
    const timer = _writeTimers.get(key);
    if (timer) clearTimeout(timer);
    _writeTimers.delete(key);

    try {
      const pairs: [string, string][] = [];
      for (const [field, cacheKey] of Object.entries(pending.keyMap)) {
        if (pending.data[field] !== undefined) {
          pairs.push([cacheKey, JSON.stringify(pending.data[field])]);
        }
      }
      if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
    } catch { /* silent — cache write failure never affects the user */ }
  }
}

// ─── Generic write helper — debounced by default to prevent thread blocking ───
export async function writeDomainCache(
  data: Partial<Record<string, any>>,
  keyMap: Record<string, CacheKey>,
  immediate = false
): Promise<void> {
  const domainKey = Object.values(keyMap).sort().join('|');

  const existing = _pendingWrites.get(domainKey);
  _pendingWrites.set(domainKey, {
    data: { ...(existing?.data || {}), ...data },
    keyMap: { ...(existing?.keyMap || {}), ...keyMap },
  });

  if (immediate) {
    return flushDomainCache(domainKey);
  }

  const existingTimer = _writeTimers.get(domainKey);
  if (existingTimer) clearTimeout(existingTimer);

  _writeTimers.set(domainKey, setTimeout(() => {
    flushDomainCache(domainKey);
  }, 400));
}

// ─── Domain-specific helpers — typed wrappers around the generic functions ────

// ── Wellness ─────────────────────────────────────────────────────────────────
const WELLNESS_KEY_MAP = {
  gymLogs:     DOMAIN_CACHE_KEYS.GYM_LOGS,
  userGymPlan: DOMAIN_CACHE_KEYS.USER_GYM_PLAN,
  waterLogs:   DOMAIN_CACHE_KEYS.WATER_LOGS,
  sleepLogs:   DOMAIN_CACHE_KEYS.SLEEP_LOGS,
  weightLogs:  DOMAIN_CACHE_KEYS.WEIGHT_LOGS,
} as const;

export interface WellnessCache {
  gymLogs: any[];
  userGymPlan: any | null;
  waterLogs: any[];
  sleepLogs: any[];
  weightLogs: any[];
}

export const readWellnessCache  = () => readDomainCache<WellnessCache>(WELLNESS_KEY_MAP);
export const writeWellnessCache = (data: Partial<WellnessCache>) => writeDomainCache(data, WELLNESS_KEY_MAP);

// ── Academic ─────────────────────────────────────────────────────────────────
const ACADEMIC_KEY_MAP = {
  attendance:      DOMAIN_CACHE_KEYS.ATTENDANCE,
  attendanceLogs:  DOMAIN_CACHE_KEYS.ATTENDANCE_LOGS,
  assignments:     DOMAIN_CACHE_KEYS.ASSIGNMENTS,
  semesters:       DOMAIN_CACHE_KEYS.SEMESTERS,
  semesterSubjects: DOMAIN_CACHE_KEYS.SEM_SUBJECTS,
} as const;

export interface AcademicCache {
  attendance: any[];
  attendanceLogs: any[];
  assignments: any[];
  semesters: any[];
  semesterSubjects: any[];
}

export const readAcademicCache  = () => readDomainCache<AcademicCache>(ACADEMIC_KEY_MAP);
export const writeAcademicCache = (data: Partial<AcademicCache>) => writeDomainCache(data, ACADEMIC_KEY_MAP);

// ── Planner ───────────────────────────────────────────────────────────────────
const PLANNER_KEY_MAP = {
  customEvents:  DOMAIN_CACHE_KEYS.CUSTOM_EVENTS,
  goals:         DOMAIN_CACHE_KEYS.GOALS,
  weeklyReviews: DOMAIN_CACHE_KEYS.WEEKLY_REVIEWS,
} as const;

export interface PlannerCache {
  customEvents: any[];
  goals: any[];
  weeklyReviews: any[];
}

export const readPlannerCache  = () => readDomainCache<PlannerCache>(PLANNER_KEY_MAP);
export const writePlannerCache = (data: Partial<PlannerCache>) => writeDomainCache(data, PLANNER_KEY_MAP);

// ── Creative ──────────────────────────────────────────────────────────────────
const CREATIVE_KEY_MAP = {
  storageNodes:   DOMAIN_CACHE_KEYS.STORAGE_NODES,
  learningTopics: DOMAIN_CACHE_KEYS.LEARNING_TOPICS,
  jobs:           DOMAIN_CACHE_KEYS.JOBS,
  contentLogs:    DOMAIN_CACHE_KEYS.CONTENT_LOGS,
} as const;

export interface CreativeCache {
  storageNodes: any[];
  learningTopics: any[];
  jobs: any[];
  contentLogs: any[];
}

export const readCreativeCache  = () => readDomainCache<CreativeCache>(CREATIVE_KEY_MAP);
export const writeCreativeCache = (data: Partial<CreativeCache>) => writeDomainCache(data, CREATIVE_KEY_MAP);

// ─── Clear ALL domain caches on logout ────────────────────────────────────────
export async function clearAllDomainCaches(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(DOMAIN_CACHE_KEYS));
  } catch { /* silent */ }
}
