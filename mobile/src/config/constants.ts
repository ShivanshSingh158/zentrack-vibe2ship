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
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';
export const GEMINI_MODEL_TRANSCRIPTION = 'gemini-2.5-flash';

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
  USER_PROFILES: 'user_profiles',
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
  WEEKLY_REVIEW: 'WeeklyReview',
  SETTINGS: 'Settings',
  SOCIAL: 'Social',
  STUDY_ROOM: 'StudyRoom',
  ASSIGNMENTS: 'Assignments',
  GRADES: 'Grades',
  LEARNING: 'Learning',
  JOBS: 'Jobs',
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

// ── XP System ─────────────────────────────────────────────────────────────────
export const XP_LEVELS = [
  { xp: 0,     label: 'Initiate' },
  { xp: 500,   label: 'Operator' },
  { xp: 1500,  label: 'Commander' },
  { xp: 3500,  label: 'Strategist' },
  { xp: 7000,  label: 'Vanguard' },
  { xp: 13000, label: 'Architect' },
  { xp: 22000, label: 'Legend' },
  { xp: 35000, label: 'Mythic' },
] as const;

// ── Default Tab Modules ───────────────────────────────────────────────────────
export const DEFAULT_PINNED_MODULES = ['Tasks', 'Sara', 'Calendar'];
