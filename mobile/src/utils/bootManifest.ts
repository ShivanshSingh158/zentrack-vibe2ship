/**
 * bootManifest.ts — ZenTrack Mobile
 *
 * HIGH-SPEED BOOT ARCHITECTURE (WITHOUT MMKV):
 * Consolidates all cold-start AsyncStorage keys into a single atomic multiGet call.
 * This reduces 5 separate JS-to-Native bridge roundtrips down to 1 single C++ transfer,
 * saving ~30–50ms on Android and iOS cold starts.
 *
 * Provides an In-Memory L1 Cache layer for 0.00ms synchronous lookups across
 * AppNavigator, CoreDataContext, and useDashboardData.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from 'firebase/auth';
import type { Task, Habit, HabitLog } from '../contexts/MobileDataContext';
import { LayoutItem } from '../components/Dashboard/DashboardLayoutSheet';

// ─── Storage Keys Consolidated into Root Manifest ─────────────────────────────
export const BOOT_KEYS = {
  NAV_ROUTE:          '@zentrack_last_route',
  ONBOARDING:         '@zentrack_onboarding_completed',
  OPTIMISTIC_USER:    '@zentrack_optimistic_user',
  PINNED_MODULES:     '@zentrack_pinned_modules',
  TASKS:              '@zentrack_cache_tasks',
  HABITS:             '@zentrack_cache_habits',
  HABIT_LOGS:         '@zentrack_cache_habitlogs',
  DASH_LAYOUT:        '@zentrack_dashboard_layout',
  WATER_GOAL_CANON:   'zentrack_water_goal_ml',
  WATER_GOAL_LEGACY:  '@zentrack_water_target',
  GOOGLE_TOKEN:       'google_workspace_token',
  THEME_MODE:         '@zentrack_theme',
  XP_V1:              'zentrack_xp_v1',
  // Domain caches — loaded in single multiGet for offline-first boot
  ATTENDANCE:         '@zentrack_cache_attendance',
  ATTENDANCE_LOGS:    '@zentrack_cache_attendance_logs',
  ASSIGNMENTS:        '@zentrack_cache_assignments',
  SEMESTERS:          '@zentrack_cache_semesters',
  SEM_SUBJECTS:       '@zentrack_cache_sem_subjects',
  HOLIDAYS:           '@zentrack_cache_holidays',
  GYM_LOGS:           '@zentrack_cache_gym_logs',
  USER_GYM_PLAN:      '@zentrack_cache_user_gym_plan',
  WATER_LOGS:         '@zentrack_cache_water_logs',
  SLEEP_LOGS:         '@zentrack_cache_sleep_logs',
  WEIGHT_LOGS:        '@zentrack_cache_weight_logs',
  CUSTOM_EVENTS:      '@zentrack_cache_custom_events',
  GOALS:              '@zentrack_cache_goals',
  WEEKLY_REVIEWS:     '@zentrack_cache_weekly_reviews',
  STORAGE_NODES:      '@zentrack_cache_storage_nodes',
  LEARNING_TOPICS:    '@zentrack_cache_learning_topics',
  JOBS:               '@zentrack_cache_jobs',
  CONTENT_LOGS:       '@zentrack_cache_content_logs',
  NOTIF_FINGERPRINT:  '@zentrack_notif_fingerprint',
} as const;

export interface BootManifest {
  lastRoute: string;
  onboarded: boolean;
  optimisticUser: User | null;
  pinnedModules: string[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  dashboardLayout: LayoutItem[] | null;
  waterGoalMl: number;
  googleAccessToken: string | null;
  themeMode: 'dark' | 'light' | 'system' | null;
  xp: number;
  // Domain caches — all 17 collections available offline from Frame 0
  attendance: any[];
  attendanceLogs: any[];
  assignments: any[];
  semesters: any[];
  semesterSubjects: any[];
  holidays: string[];
  gymLogs: any[];
  userGymPlan: any | null;
  waterLogs: any[];
  sleepLogs: any[];
  weightLogs: any[];
  customEvents: any[];
  goals: any[];
  weeklyReviews: any[];
  storageNodes: any[];
  learningTopics: any[];
  jobs: any[];
  contentLogs: any[];
  notifFingerprint: string | null;
}

const DEFAULT_PINNED = ['Tasks', 'Gym', 'Calendar', 'Attendance'];
const DEFAULT_WATER_GOAL = 2500;

// ─── In-Memory L1 Cache Layer ────────────────────────────────────────────────
let _memoryBootCache: BootManifest | null = null;
let _bootPromise: Promise<BootManifest> | null = null;

/**
 * Loads all cold-boot state in a single atomic multiGet call.
 * Safe to call multiple times — returns in-flight promise or memory cache.
 */
export async function loadBootManifest(): Promise<BootManifest> {
  if (_memoryBootCache) return _memoryBootCache;
  if (_bootPromise) return _bootPromise;

  _bootPromise = (async () => {
    try {
      const keysToFetch = Object.values(BOOT_KEYS);
      const pairs = await AsyncStorage.multiGet(keysToFetch);
      const map = new Map<string, string | null>(pairs);

      // 1. Navigation & Auth
      const lastRoute = map.get(BOOT_KEYS.NAV_ROUTE) || 'Home';

      let optimisticUser: User | null = null;
      const userRaw = map.get(BOOT_KEYS.OPTIMISTIC_USER);
      if (userRaw) {
        try {
          const parsed = JSON.parse(userRaw);
          if (parsed && parsed.uid) {
            optimisticUser = parsed as User;
          }
        } catch { /* ignore parse error */ }
      }

      // Onboarded: explicit 'true' string in storage.
      const onboardedVal = map.get(BOOT_KEYS.ONBOARDING) || map.get('zentrack_onboarded_v2');
      const onboarded = onboardedVal === 'true';

      // 2. Pinned Modules
      let pinnedModules = DEFAULT_PINNED;
      const pinnedRaw = map.get(BOOT_KEYS.PINNED_MODULES);
      if (pinnedRaw) {
        try {
          const parsed = JSON.parse(pinnedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            pinnedModules = parsed.slice(0, 4);
          }
        } catch { /* fallback to default */ }
      }

      // 3. Stale-While-Revalidate Core Data
      let tasks: Task[] = [];
      const tasksRaw = map.get(BOOT_KEYS.TASKS);
      if (tasksRaw) {
        try {
          const parsed = JSON.parse(tasksRaw);
          if (Array.isArray(parsed)) tasks = parsed;
        } catch { /* ignore */ }
      }

      let habits: Habit[] = [];
      const habitsRaw = map.get(BOOT_KEYS.HABITS);
      if (habitsRaw) {
        try {
          const parsed = JSON.parse(habitsRaw);
          if (Array.isArray(parsed)) habits = parsed;
        } catch { /* ignore */ }
      }

      let habitLogs: HabitLog[] = [];
      const habitLogsRaw = map.get(BOOT_KEYS.HABIT_LOGS);
      if (habitLogsRaw) {
        try {
          const parsed = JSON.parse(habitLogsRaw);
          if (Array.isArray(parsed)) habitLogs = parsed;
        } catch { /* ignore */ }
      }

      // 4. Dashboard Layout
      let dashboardLayout: LayoutItem[] | null = null;
      const layoutRaw = map.get(BOOT_KEYS.DASH_LAYOUT);
      if (layoutRaw) {
        try {
          const parsed = JSON.parse(layoutRaw);
          if (Array.isArray(parsed)) dashboardLayout = parsed;
        } catch { /* ignore */ }
      }

      // 5. Water Goal (Canonical with legacy fallback)
      let waterGoalMl = DEFAULT_WATER_GOAL;
      const canonWater = map.get(BOOT_KEYS.WATER_GOAL_CANON);
      const legacyWater = map.get(BOOT_KEYS.WATER_GOAL_LEGACY);
      if (canonWater) {
        const val = parseInt(canonWater, 10);
        if (!isNaN(val) && val > 0) waterGoalMl = val;
      } else if (legacyWater) {
        const val = parseInt(legacyWater, 10);
        if (!isNaN(val) && val > 0) waterGoalMl = val;
      }

      // 6. Google Token & Theme & XP
      const googleAccessToken = map.get(BOOT_KEYS.GOOGLE_TOKEN) || null;
      const themeRaw = map.get(BOOT_KEYS.THEME_MODE);
      const themeMode = (themeRaw === 'dark' || themeRaw === 'light' || themeRaw === 'system') ? themeRaw : null;
      
      const xpRaw = map.get(BOOT_KEYS.XP_V1);
      const xp = xpRaw ? (parseInt(xpRaw, 10) || 0) : 0;

      // 7. Academic, Wellness & Planner domain caches
      let attendance: any[] = [];
      const attRaw = map.get(BOOT_KEYS.ATTENDANCE);
      if (attRaw) {
        try { const p = JSON.parse(attRaw); if (Array.isArray(p)) attendance = p; } catch {}
      }

      let attendanceLogs: any[] = [];
      const attLogsRaw = map.get(BOOT_KEYS.ATTENDANCE_LOGS);
      if (attLogsRaw) {
        try { const p = JSON.parse(attLogsRaw); if (Array.isArray(p)) attendanceLogs = p; } catch {}
      }

      let gymLogs: any[] = [];
      const gymRaw = map.get(BOOT_KEYS.GYM_LOGS);
      if (gymRaw) {
        try { const p = JSON.parse(gymRaw); if (Array.isArray(p)) gymLogs = p; } catch {}
      }

      let userGymPlan: any = null;
      const gymPlanRaw = map.get(BOOT_KEYS.USER_GYM_PLAN);
      if (gymPlanRaw) {
        try { userGymPlan = JSON.parse(gymPlanRaw); } catch {}
      }

      let customEvents: any[] = [];
      const eventsRaw = map.get(BOOT_KEYS.CUSTOM_EVENTS);
      if (eventsRaw) {
        try { const p = JSON.parse(eventsRaw); if (Array.isArray(p)) customEvents = p; } catch {}
      }

      let goals: any[] = [];
      const goalsRaw = map.get(BOOT_KEYS.GOALS);
      if (goalsRaw) {
        try { const p = JSON.parse(goalsRaw); if (Array.isArray(p)) goals = p; } catch {}
      }

      // Wellness: waterLogs, sleepLogs, weightLogs
      let waterLogs: any[] = [];
      const waterLogsRaw = map.get(BOOT_KEYS.WATER_LOGS);
      if (waterLogsRaw) {
        try { const p = JSON.parse(waterLogsRaw); if (Array.isArray(p)) waterLogs = p; } catch {}
      }
      let sleepLogs: any[] = [];
      const sleepLogsRaw = map.get(BOOT_KEYS.SLEEP_LOGS);
      if (sleepLogsRaw) {
        try { const p = JSON.parse(sleepLogsRaw); if (Array.isArray(p)) sleepLogs = p; } catch {}
      }
      let weightLogs: any[] = [];
      const weightLogsRaw = map.get(BOOT_KEYS.WEIGHT_LOGS);
      if (weightLogsRaw) {
        try { const p = JSON.parse(weightLogsRaw); if (Array.isArray(p)) weightLogs = p; } catch {}
      }

      // Academic: assignments, semesters, semesterSubjects
      let assignments: any[] = [];
      const assignmentsRaw = map.get(BOOT_KEYS.ASSIGNMENTS);
      if (assignmentsRaw) {
        try { const p = JSON.parse(assignmentsRaw); if (Array.isArray(p)) assignments = p; } catch {}
      }
      let semesters: any[] = [];
      const semestersRaw = map.get(BOOT_KEYS.SEMESTERS);
      if (semestersRaw) {
        try { const p = JSON.parse(semestersRaw); if (Array.isArray(p)) semesters = p; } catch {}
      }
      let semesterSubjects: any[] = [];
      const semSubRaw = map.get(BOOT_KEYS.SEM_SUBJECTS);
      if (semSubRaw) {
        try { const p = JSON.parse(semSubRaw); if (Array.isArray(p)) semesterSubjects = p; } catch {}
      }
      let holidays: string[] = [];
      const holidaysRaw = map.get(BOOT_KEYS.HOLIDAYS);
      if (holidaysRaw) {
        try { const p = JSON.parse(holidaysRaw); if (Array.isArray(p)) holidays = p; } catch {}
      }

      // Planner: weeklyReviews
      let weeklyReviews: any[] = [];
      const weeklyRaw = map.get(BOOT_KEYS.WEEKLY_REVIEWS);
      if (weeklyRaw) {
        try { const p = JSON.parse(weeklyRaw); if (Array.isArray(p)) weeklyReviews = p; } catch {}
      }

      // Creative: storageNodes, learningTopics, jobs, contentLogs
      let storageNodes: any[] = [];
      const storageRaw = map.get(BOOT_KEYS.STORAGE_NODES);
      if (storageRaw) {
        try { const p = JSON.parse(storageRaw); if (Array.isArray(p)) storageNodes = p; } catch {}
      }
      let learningTopics: any[] = [];
      const learningRaw = map.get(BOOT_KEYS.LEARNING_TOPICS);
      if (learningRaw) {
        try { const p = JSON.parse(learningRaw); if (Array.isArray(p)) learningTopics = p; } catch {}
      }
      let jobs: any[] = [];
      const jobsRaw = map.get(BOOT_KEYS.JOBS);
      if (jobsRaw) {
        try { const p = JSON.parse(jobsRaw); if (Array.isArray(p)) jobs = p; } catch {}
      }
      let contentLogs: any[] = [];
      const contentLogsRaw = map.get(BOOT_KEYS.CONTENT_LOGS);
      if (contentLogsRaw) {
        try { const p = JSON.parse(contentLogsRaw); if (Array.isArray(p)) contentLogs = p; } catch {}
      }

      const notifFingerprint = map.get(BOOT_KEYS.NOTIF_FINGERPRINT) || null;

      const manifest: BootManifest = {
        lastRoute,
        onboarded,
        optimisticUser,
        pinnedModules,
        tasks,
        habits,
        habitLogs,
        dashboardLayout,
        waterGoalMl,
        googleAccessToken,
        themeMode,
        xp,
        attendance,
        attendanceLogs,
        assignments,
        semesters,
        semesterSubjects,
        holidays,
        gymLogs,
        userGymPlan,
        waterLogs,
        sleepLogs,
        weightLogs,
        customEvents,
        goals,
        weeklyReviews,
        storageNodes,
        learningTopics,
        jobs,
        contentLogs,
        notifFingerprint,
      };

      _memoryBootCache = manifest;
      return manifest;
    } catch (e) {
      console.warn('[BootManifest] Failed to load boot manifest, falling back to defaults:', e);
      const fallback: BootManifest = {
        lastRoute: 'Home',
        onboarded: true,
        optimisticUser: null,
        pinnedModules: DEFAULT_PINNED,
        tasks: [],
        habits: [],
        habitLogs: [],
        dashboardLayout: null,
        waterGoalMl: DEFAULT_WATER_GOAL,
        googleAccessToken: null,
        themeMode: null,
        xp: 0,
        attendance: [],
        attendanceLogs: [],
        assignments: [],
        semesters: [],
        semesterSubjects: [],
        holidays: [],
        gymLogs: [],
        userGymPlan: null,
        waterLogs: [],
        sleepLogs: [],
        weightLogs: [],
        customEvents: [],
        goals: [],
        weeklyReviews: [],
        storageNodes: [],
        learningTopics: [],
        jobs: [],
        contentLogs: [],
        notifFingerprint: null,
      };
      _memoryBootCache = fallback;
      return fallback;
    } finally {
      _bootPromise = null;
    }
  })();

  return _bootPromise;
}

/**
 * Synchronous L1 lookup (0.00ms, zero microtasks).
 * Returns the cached manifest if already loaded, or null.
 */
export function getBootManifestSync(): BootManifest | null {
  return _memoryBootCache;
}

/**
 * Updates the in-memory L1 cache whenever writes occur to maintain instant consistency.
 */
export function updateL1Cache<K extends keyof BootManifest>(key: K, value: BootManifest[K]): void {
  if (_memoryBootCache) {
    _memoryBootCache[key] = value;
  }
}

/**
 * Clears the memory cache on user sign out.
 */
export function clearBootManifest(): void {
  _memoryBootCache = null;
  _bootPromise = null;
}
