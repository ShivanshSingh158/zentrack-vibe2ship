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


// ── Gemini Models ─────────────────────────────────────────────────────────────


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
/** Early warning minutes before task */
export const TASK_REMINDER_EARLY_MIN = 60;
/** Final warning minutes before task */
export const TASK_REMINDER_FINAL_MIN = 15;

// ── AsyncStorage Keys ─────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  PINNED_MODULES: '@zentrack_pinned_modules',
  DEFAULT_NOTIF_TIME: 'zentrack_default_notif_time',
    XP_DATA: 'zentrack_xp_v1',
  XP_STREAK: 'zentrack_xp_streak',
  ONBOARDED: 'zentrack_onboarded_v2',
  GOOGLE_TOKEN: 'google_workspace_token',
  THEME: '@zentrack_theme',              // 'dark' | 'light' — user's theme preference
  DASHBOARD_LAYOUT: '@zentrack_dashboard_layout', // Custom dashboard widget order
  SAVED_PLACES: '@zentrack_saved_places',         // User frequent places array
    // Gym geofence trigger configuration
} as const;

// ── Firestore Collections ─────────────────────────────────────────────────────
export const COLLECTION = {
  TASKS: 'todos',
  HABITS: 'habits',
  HABIT_LOGS: 'habitLogs',
  GOALS: 'goals',
  STORAGE_NODES: 'storage_nodes',
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
  // Main tabs
  HOME: 'Home',
  MORE: 'More',
  // More stack screens
  TASKS: 'Tasks',
  CALENDAR: 'Calendar',
  HABITS: 'Habits',
  STREAK_DETAIL: 'StreakDetail',
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
  } as const;


// ── Data Limits ───────────────────────────────────────────────────────────────
/** Max tasks passed to agent context (keeps payload small) */
/** Max habits passed to agent context */
/** Max notes passed to agent context */
/** Max goals passed to agent context */
/** Max gym logs passed to agent context */
/** Max conversation history turns passed to Sara */
/** Max committed actions kept in Sara action history log */

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
export const DEFAULT_PINNED_MODULES = ['Tasks', 'Calendar', 'Attendance', 'Habits'];
