/**
 * src/config/constants.ts — ZenTrack Web App
 *
 * Central location for all app-wide constants.
 * Import from here instead of hardcoding values in components.
 */

// ── App Metadata ──────────────────────────────────────────────────────────────
export const APP_NAME = 'ZenTrack';
export const APP_VERSION = '1.0.0';
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://myzentrack.vercel.app';

// ── API Endpoints ─────────────────────────────────────────────────────────────
export const GEMINI_PROXY_URL = `${APP_URL}/api/gemini-proxy`;
export const SEARCH_API_URL = `${APP_URL}/api/search`;
export const TRANSCRIPT_API_URL = `${APP_URL}/api/edge-transcript`;
export const VOICE_PROXY_URL = `${APP_URL}/api/gemini-proxy?action=tts`;
export const SEND_NOTIFICATION_URL = `${APP_URL}/api/send-notification`;

// ── Gemini Models ─────────────────────────────────────────────────────────────
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';
export const GEMINI_MODEL_VOICE = 'gemini-2.5-flash';
export const GEMINI_MODEL_RESEARCH = 'gemini-2.5-flash';

// ── Agent System ──────────────────────────────────────────────────────────────
/** Maximum concurrent Gemini API calls across all agents */
export const MAX_CONCURRENT_API_CALLS = 8;
/** Route to personal key when fewer than this many agents are active */
export const PERSONAL_KEY_THRESHOLD = 3;
/** Maximum agent loop iterations per task */
export const MAX_AGENT_ITERATIONS = 10;
/** Mission cache TTL in milliseconds (30 seconds) */
export const MISSION_CACHE_TTL_MS = 30_000;
/** Maximum cached mission results (LRU) */
export const MISSION_CACHE_MAX_ENTRIES = 10;

// ── Voice & TTS ───────────────────────────────────────────────────────────────
/** Maximum characters per Sarvam TTS call (API hard limit) */
export const SARVAM_MAX_CHARS = 500;
/** Silence duration after short responses (≤4 words) before mic restarts */
export const VOICE_SILENCE_SHORT_MS = 800;
/** Silence duration after longer responses before mic restarts */
export const VOICE_SILENCE_LONG_MS = 1200;
/** Voice orb idle timeout before auto-stop (30 seconds) */
export const VOICE_IDLE_TIMEOUT_MS = 30_000;

// ── Firestore Collections ─────────────────────────────────────────────────────
export const COLLECTION = {
  TASKS: 'todos',
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  GOALS: 'goals',
  NOTES: 'notes',
  GYM_LOGS: 'gymLogs',
  JOBS: 'job_applications',
  LEARNING_TOPICS: 'learning_topics',
  ATTENDANCE: 'attendance_subjects',
  ATTENDANCE_LOGS: 'attendance_logs',
  ATTENDANCE_HOLIDAYS: 'attendance_holidays',
  ASSIGNMENTS: 'assignments',
  POMODORO: 'pomodoro_sessions',
  CALENDAR_EVENTS: 'calendar_events',
  USER_PROFILES: 'user_profiles',
  AGENT_MEMORY: 'agent_memory',
  RATE_LIMITS: 'rate_limits',
} as const;

// ── Rate Limiting ─────────────────────────────────────────────────────────────
/** Max Gemini API requests per user per minute (enforced in gemini-proxy.js) */
export const RATE_LIMIT_PER_MIN = 100;

// ── Pagination / Data Limits ──────────────────────────────────────────────────
export const MAX_EMAILS_PER_FETCH = 15;
export const MAX_CALENDAR_EVENTS = 50;
export const MAX_DRIVE_FILES = 20;
export const AGENT_MEMORY_MAX_MESSAGES = 50;
export const AGENT_MEMORY_RETENTION_DAYS = 14;
