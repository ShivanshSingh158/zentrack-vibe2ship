/**
 * mobile/src/config/constants.ts — ZenTrack Mobile
 *
 * Central location for all app-wide constants.
 * Import from here instead of hardcoding values in components or services.
 */

// ── App Metadata ──────────────────────────────────────────────────────────────
export const APP_NAME = 'ZenTrack';
export const APP_VERSION = '1.0.0';

// ── API Endpoints ─────────────────────────────────────────────────────────────
/** Vercel Gemini proxy — used for all AI inference on mobile */
export const GEMINI_PROXY_BASE = 'https://myzentrack.vercel.app';
export const GEMINI_PROXY_URL = `${GEMINI_PROXY_BASE}/api/gemini-proxy`;
export const VOICE_PROXY_URL = `${GEMINI_PROXY_BASE}/api/voice-proxy`;

/** Direct Gemini API base — used by geminiProxy.ts with key rotation */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── Gemini Models ─────────────────────────────────────────────────────────────
export const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', tag: 'Hybrid Thinking', icon: '👑' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tag: 'Fast & Balanced', icon: '⚡' },
] as const;
export type GeminiModelId = typeof AVAILABLE_GEMINI_MODELS[number]['id'];

export const GEMINI_MODEL_DEFAULT = 'gemini-3.7-flash';
export const GEMINI_MODEL_TRANSCRIPTION = 'gemini-3.7-flash';

// ── Voice & TTS ───────────────────────────────────────────────────────────────
/** Maximum characters per Sarvam TTS chunk (API hard limit) */
export const SARVAM_MAX_CHARS = 500;
/** Voice orb idle timeout before auto-close (30 seconds) */
export const VOICE_IDLE_TIMEOUT_MS = 30_000;
/** Minimum audio recording duration for valid transcription (ms) */
export const MIN_RECORDING_MS = 500;

// ── Notifications ─────────────────────────────────────────────────────────────
/** Default daily briefing notification time */
export const DEFAULT_NOTIF_TIME = '08:00';
/** Gym reminder default time */
export const GYM_REMINDER_TIME = '18:00';
/** Early warning minutes before task */
export const TASK_REMINDER_EARLY_MIN = 60;
/** Final warning minutes before task */
export const TASK_REMINDER_FINAL_MIN = 15;

// ── AsyncStorage Keys ─────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  PINNED_MODULES: '@zentrack_pinned_modules',
  DEFAULT_NOTIF_TIME: 'zentrack_default_notif_time',
  GYM_NOTIF_TIME: 'zentrack_gym_notif_time',
  XP_DATA: 'zentrack_xp_v1',
  XP_STREAK: 'zentrack_xp_streak',
  ONBOARDED: 'zentrack_onboarded_v2',
  GOOGLE_TOKEN: 'google_workspace_token',
  THEME: '@zentrack_theme',              // 'dark' | 'light' — user's theme preference
  // ── SARA Engine v2 ────────────────────────────────────────────────────────
  SARA_CMG: '@sara_cmg_v1',             // Contextual Memory Graph JSON
  SARA_FINGERPRINT: '@sara_fingerprint_v1', // Behavioral Fingerprint JSON
  SARA_SURFACE_LAST: '@sara_surface_last_v1',      // Last PSI injection timestamp per screen (JSON)
  SARA_SURFACE_DISMISSED: '@sara_surface_dismissed_v1', // Dismissed PSI banners (JSON array)
  SARA_ACTION_HISTORY: '@sara_action_history_v1',  // [4.15] Committed action log (last 50, JSON)
  DASHBOARD_LAYOUT: '@zentrack_dashboard_layout', // Custom dashboard widget order
} as const;

// ── Firestore Collections ─────────────────────────────────────────────────────
export const COLLECTION = {
  TASKS: 'todos',
  HABITS: 'habits',
  HABIT_LOGS: 'habitLogs',
  GOALS: 'goals',
  STORAGE_NODES: 'storage_nodes',
  GYM_LOGS: 'gym_logs',
  USER_GYM_PLANS: 'user_gym_plans',
  JOBS: 'job_applications',
  LEARNING_TOPICS: 'learning_topics',
  FLASHCARDS: 'flashcards',
  ATTENDANCE: 'attendance_subjects',
  ATTENDANCE_LOGS: 'attendance_logs',
  ATTENDANCE_HOLIDAYS: 'attendance_holidays',
  ASSIGNMENTS: 'assignments',
  CALENDAR_EVENTS: 'calendar_events',
  SEMESTERS: 'semesters',
  SEMESTER_SUBJECTS: 'semester_subjects',
  STUDY_ROOMS: 'study_rooms',
  POMODORO_SESSIONS: 'pomodoro_sessions',
  WEEKLY_REVIEWS: 'weekly_reviews',
  WATER_LOGS: 'water_logs',
  SLEEP_LOGS: 'sleep_logs',
  WEIGHT_LOGS: 'weight_logs',
  CONTENT_LOGS: 'content_logs',
  USER_PROFILES: 'user_profiles',
  // Placement Hub
  DSA_LOGS: 'dsa_logs',
  FOCUS_SESSIONS: 'focus_sessions',
  SKILL_RATINGS: 'skill_ratings',
  PROJECT_MILESTONES: 'project_milestones',
  PLACEMENT_CONFIG: 'placement_config',
} as const;

// ── Navigation Screen Names ───────────────────────────────────────────────────
export const SCREENS = {
  // Auth stack
  LANDING: 'Landing',
  AUTH: 'Auth',
  GUEST_DASHBOARD: 'GuestDashboard',
  // Main tabs
  HOME: 'Home',
  SARA_MODAL: 'SaraModal',
  MORE: 'More',
  // More stack screens
  TASKS: 'Tasks',
  SARA: 'Sara',
  CALENDAR: 'Calendar',
  HABITS: 'Habits',
  STREAK_DETAIL: 'StreakDetail',
  GYM: 'Gym',
  GOALS: 'Goals',
  NOTES: 'Notes',
  ANALYTICS: 'Analytics',
  ATTENDANCE: 'Attendance',
  SETTINGS: 'Settings',
  GRADES: 'Grades',
  ASSIGNMENTS: 'Assignments',
  LEARNING: 'Learning',
  JOBS: 'Jobs',
  WELLBEING_DASHBOARD: 'WellbeingDashboard',
  // Gym sub-stack
  GYM_HOME: 'GymHome',
  ACTIVE_LOGGING: 'ActiveLogging',
  WORKOUT_SUMMARY: 'WorkoutSummary',
  GYM_PROGRESS: 'GymProgress',
  GYM_HISTORY: 'GymHistory',
  EXERCISE_DETAIL: 'ExerciseDetail',
  EXERCISE_SWAP: 'ExerciseSwap',
  CARDIO_LOG: 'CardioLog',
} as const;


// ── Data Limits ───────────────────────────────────────────────────────────────
/** Max tasks passed to agent context (keeps payload small) */
export const AGENT_MAX_TASKS = 50;
/** Max habits passed to agent context */
export const AGENT_MAX_HABITS = 30;
/** Max notes passed to agent context */
export const AGENT_MAX_NOTES = 20;
/** Max goals passed to agent context */
export const AGENT_MAX_GOALS = 20;
/** Max gym logs passed to agent context */
export const AGENT_MAX_GYM_LOGS = 30;
/** Max conversation history turns passed to Sara */
export const SARA_MAX_HISTORY_TURNS = 12;
/** Max committed actions kept in Sara action history log */
export const AGENT_HISTORY_MAX_ENTRIES = 50;

export const XP_LEVELS = [
  { xp: 0,       label: 'Seeker' },
  { xp: 1000,    label: 'Warden' },
  { xp: 3000,    label: 'Sentinel' },
  { xp: 7000,    label: 'Guardian' },
  { xp: 14000,   label: 'Vanguard' },
  { xp: 27000,   label: 'Luminary' },
  { xp: 59500,   label: 'Legend' },
  { xp: 110000,  label: 'Mythic' },
  { xp: 180000,  label: 'Paragon' },
  { xp: 270000,  label: 'Titan' },
  { xp: 390000,  label: 'Ascendant' },
  { xp: 550000,  label: 'Exalted' },
  { xp: 760000,  label: 'Sovereign' },
  { xp: 1030000, label: 'Archon' },
  { xp: 1380000, label: 'Celestial' },
  { xp: 1820000, label: 'Ethereal' },
  { xp: 2380000, label: 'Empyrean' },
  { xp: 3080000, label: 'Astral' },
  { xp: 3950000, label: 'Zenith' },
  { xp: 5000000, label: 'Apex' },
] as const;

// ── Default Tab Modules ───────────────────────────────────────────────────────
export const DEFAULT_PINNED_MODULES = ['Tasks', 'Sara', 'Calendar'];
