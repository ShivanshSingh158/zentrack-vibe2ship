import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { User } from 'firebase/auth';
import type { Task, Habit, HabitLog } from '../contexts/MobileDataContext';
import { LayoutItem } from '../components/Dashboard/DashboardLayoutSheet';

export const BOOT_KEYS = {
  NAV_ROUTE:          '@zentrack_last_route',
  ONBOARDING:         '@zentrack_onboarding_completed',
  ONBOARDING_V2:      'zentrack_onboarded_v2',
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

// Tier-0 keys required for Frame-0 Auth, Theme, Navigation & Dashboard paint (<5ms)
const TIER_0_KEYS = [
  BOOT_KEYS.NAV_ROUTE,
  BOOT_KEYS.ONBOARDING,
  BOOT_KEYS.ONBOARDING_V2,
  BOOT_KEYS.OPTIMISTIC_USER,
  BOOT_KEYS.PINNED_MODULES,
  BOOT_KEYS.TASKS,
  BOOT_KEYS.HABITS,
  BOOT_KEYS.HABIT_LOGS,
  BOOT_KEYS.DASH_LAYOUT,
  BOOT_KEYS.WATER_GOAL_CANON,
  BOOT_KEYS.WATER_GOAL_LEGACY,
  BOOT_KEYS.GOOGLE_TOKEN,
  BOOT_KEYS.THEME_MODE,
  BOOT_KEYS.XP_V1,
  BOOT_KEYS.ATTENDANCE,
  BOOT_KEYS.ATTENDANCE_LOGS,
  BOOT_KEYS.HOLIDAYS,
  BOOT_KEYS.GYM_LOGS,
  BOOT_KEYS.USER_GYM_PLAN,
  BOOT_KEYS.WATER_LOGS,
  BOOT_KEYS.NOTIF_FINGERPRINT,
] as const;

// Tier-1 heavy secondary domain caches hydrated after Frame 0 settles
const TIER_1_KEYS = [
  BOOT_KEYS.ASSIGNMENTS,
  BOOT_KEYS.SEMESTERS,
  BOOT_KEYS.SEM_SUBJECTS,
  BOOT_KEYS.SLEEP_LOGS,
  BOOT_KEYS.WEIGHT_LOGS,
  BOOT_KEYS.CUSTOM_EVENTS,
  BOOT_KEYS.GOALS,
  BOOT_KEYS.WEEKLY_REVIEWS,
  BOOT_KEYS.STORAGE_NODES,
  BOOT_KEYS.LEARNING_TOPICS,
  BOOT_KEYS.JOBS,
  BOOT_KEYS.CONTENT_LOGS,
] as const;

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
const DEFAULT_WATER_GOAL = 3800;

let _memoryBootCache: BootManifest | null = null;
let _bootPromise: Promise<BootManifest> | null = null;

function parseJsonArray<T = any>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadBootManifest(): Promise<BootManifest> {
  if (_memoryBootCache) return _memoryBootCache;
  if (_bootPromise) return _bootPromise;

  _bootPromise = (async () => {
    try {
      const pairs = await AsyncStorage.multiGet([...TIER_0_KEYS]);
      const map = new Map<string, string | null>(pairs);

      const lastRoute = map.get(BOOT_KEYS.NAV_ROUTE) || 'Home';

      let optimisticUser: User | null = null;
      const userRaw = map.get(BOOT_KEYS.OPTIMISTIC_USER);
      if (userRaw) {
        try {
          const parsed = JSON.parse(userRaw);
          if (parsed && parsed.uid) optimisticUser = parsed as User;
        } catch {}
      }

      const onboardedVal = map.get(BOOT_KEYS.ONBOARDING) || map.get(BOOT_KEYS.ONBOARDING_V2);
      const onboarded = onboardedVal === 'true' || onboardedVal === '1';

      let pinnedModules = DEFAULT_PINNED;
      const pinnedRaw = map.get(BOOT_KEYS.PINNED_MODULES);
      if (pinnedRaw) {
        try {
          const parsed = JSON.parse(pinnedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) pinnedModules = parsed.slice(0, 4);
        } catch {}
      }

      const tasks = parseJsonArray<Task>(map.get(BOOT_KEYS.TASKS));
      const habits = parseJsonArray<Habit>(map.get(BOOT_KEYS.HABITS));
      const habitLogs = parseJsonArray<HabitLog>(map.get(BOOT_KEYS.HABIT_LOGS));

      let dashboardLayout: LayoutItem[] | null = null;
      const layoutRaw = map.get(BOOT_KEYS.DASH_LAYOUT);
      if (layoutRaw) {
        try {
          const parsed = JSON.parse(layoutRaw);
          if (Array.isArray(parsed)) dashboardLayout = parsed;
        } catch {}
      }

      let waterGoalMl = DEFAULT_WATER_GOAL;
      const canonWater = map.get(BOOT_KEYS.WATER_GOAL_CANON) || map.get(BOOT_KEYS.WATER_GOAL_LEGACY);
      if (canonWater) {
        const val = parseInt(canonWater, 10);
        if (!isNaN(val) && val > 0) waterGoalMl = val;
      }

      const googleAccessToken = map.get(BOOT_KEYS.GOOGLE_TOKEN) || null;
      const themeRaw = map.get(BOOT_KEYS.THEME_MODE);
      const themeMode = (themeRaw === 'dark' || themeRaw === 'light' || themeRaw === 'system') ? themeRaw : null;
      const xpRaw = map.get(BOOT_KEYS.XP_V1);
      const xp = xpRaw ? (parseInt(xpRaw, 10) || 0) : 0;

      const attendance = parseJsonArray(map.get(BOOT_KEYS.ATTENDANCE));
      const attendanceLogs = parseJsonArray(map.get(BOOT_KEYS.ATTENDANCE_LOGS));
      const holidays = parseJsonArray<string>(map.get(BOOT_KEYS.HOLIDAYS));
      const gymLogs = parseJsonArray(map.get(BOOT_KEYS.GYM_LOGS));
      const waterLogs = parseJsonArray(map.get(BOOT_KEYS.WATER_LOGS));

      let userGymPlan: any = null;
      const gymPlanRaw = map.get(BOOT_KEYS.USER_GYM_PLAN);
      if (gymPlanRaw) {
        try { userGymPlan = JSON.parse(gymPlanRaw); } catch {}
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
        assignments: [],
        semesters: [],
        semesterSubjects: [],
        holidays,
        gymLogs,
        userGymPlan,
        waterLogs,
        sleepLogs: [],
        weightLogs: [],
        customEvents: [],
        goals: [],
        weeklyReviews: [],
        storageNodes: [],
        learningTopics: [],
        jobs: [],
        contentLogs: [],
        notifFingerprint,
      };

      _memoryBootCache = manifest;

      // Hydrate Tier-1 secondary caches off the critical startup path
      InteractionManager.runAfterInteractions(() => {
        AsyncStorage.multiGet([...TIER_1_KEYS])
          .then(tier1Pairs => {
            if (!_memoryBootCache) return;
            const t1 = new Map<string, string | null>(tier1Pairs);
            _memoryBootCache = {
              ..._memoryBootCache,
              assignments: _memoryBootCache.assignments.length > 0 ? _memoryBootCache.assignments : parseJsonArray(t1.get(BOOT_KEYS.ASSIGNMENTS)),
              semesters: _memoryBootCache.semesters.length > 0 ? _memoryBootCache.semesters : parseJsonArray(t1.get(BOOT_KEYS.SEMESTERS)),
              semesterSubjects: _memoryBootCache.semesterSubjects.length > 0 ? _memoryBootCache.semesterSubjects : parseJsonArray(t1.get(BOOT_KEYS.SEM_SUBJECTS)),
              sleepLogs: _memoryBootCache.sleepLogs.length > 0 ? _memoryBootCache.sleepLogs : parseJsonArray(t1.get(BOOT_KEYS.SLEEP_LOGS)),
              weightLogs: _memoryBootCache.weightLogs.length > 0 ? _memoryBootCache.weightLogs : parseJsonArray(t1.get(BOOT_KEYS.WEIGHT_LOGS)),
              customEvents: _memoryBootCache.customEvents.length > 0 ? _memoryBootCache.customEvents : parseJsonArray(t1.get(BOOT_KEYS.CUSTOM_EVENTS)),
              goals: _memoryBootCache.goals.length > 0 ? _memoryBootCache.goals : parseJsonArray(t1.get(BOOT_KEYS.GOALS)),
              weeklyReviews: _memoryBootCache.weeklyReviews.length > 0 ? _memoryBootCache.weeklyReviews : parseJsonArray(t1.get(BOOT_KEYS.WEEKLY_REVIEWS)),
              storageNodes: _memoryBootCache.storageNodes.length > 0 ? _memoryBootCache.storageNodes : parseJsonArray(t1.get(BOOT_KEYS.STORAGE_NODES)),
              learningTopics: _memoryBootCache.learningTopics.length > 0 ? _memoryBootCache.learningTopics : parseJsonArray(t1.get(BOOT_KEYS.LEARNING_TOPICS)),
              jobs: _memoryBootCache.jobs.length > 0 ? _memoryBootCache.jobs : parseJsonArray(t1.get(BOOT_KEYS.JOBS)),
              contentLogs: _memoryBootCache.contentLogs.length > 0 ? _memoryBootCache.contentLogs : parseJsonArray(t1.get(BOOT_KEYS.CONTENT_LOGS)),
            };
          })
          .catch(() => {});
      });

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

export function getBootManifestSync(): BootManifest | null {
  return _memoryBootCache;
}

export function updateL1Cache<K extends keyof BootManifest>(key: K, value: BootManifest[K]): void {
  if (_memoryBootCache) {
    _memoryBootCache = {
      ..._memoryBootCache,
      [key]: value,
    };
  }
}

export function clearBootManifest(): void {
  _memoryBootCache = null;
  _bootPromise = null;
}
