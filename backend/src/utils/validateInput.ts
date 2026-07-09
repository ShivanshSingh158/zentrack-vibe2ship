/**
 * src/utils/validateInput.ts
 *
 * ZenTrack — Input Sanitization & Validation
 *
 * Prevents:
 *  - Overly long strings (DoS via Firestore storage costs)
 *  - Unexpected fields (prototype pollution, data injection)
 *  - Malformed array payloads
 *
 * Use `sanitizeTaskInput` before every Firestore write from the frontend.
 */

// ── Field length limits ────────────────────────────────────────────────────────
export const MAX_TITLE_LENGTH       = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAG_LENGTH         = 50;
export const MAX_TAGS_COUNT         = 20;
export const MAX_ARRAY_ITEMS        = 100;
export const MAX_FIELDS_PER_DOC     = 50;

// ── Allowed fields per collection type ────────────────────────────────────────
const TASK_FIELDS = new Set([
  'title', 'text', 'description', 'date', 'dueDate', 'priority', 'status',
  'userId', 'createdAt', 'updatedAt', 'tags', 'notes', 'completed',
  'category', 'estimatedTime', 'actualTime', 'recurring', 'recurrenceRule',
  'parentId', 'order', 'color', 'icon', 'source', 'externalId',
]);

const HABIT_FIELDS = new Set([
  'title', 'description', 'frequency', 'userId', 'createdAt', 'updatedAt',
  'color', 'icon', 'category', 'targetCount', 'streak', 'tags', 'active',
]);

const NOTE_FIELDS = new Set([
  'title', 'content', 'tags', 'userId', 'createdAt', 'updatedAt',
  'color', 'pinned', 'category', 'attachments',
]);

/**
 * Sanitize a string field — trims whitespace and truncates to max length.
 */
export function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

/**
 * Generic document sanitizer — strips unknown fields and clamps string lengths.
 * Pass `allowedFields` to restrict which keys survive.
 */
export function sanitizeDocument(
  data: Record<string, unknown>,
  allowedFields?: Set<string>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  const entries = Object.entries(data);
  if (entries.length > MAX_FIELDS_PER_DOC) {
    console.warn(`[validateInput] Document has ${entries.length} fields — clamping to ${MAX_FIELDS_PER_DOC}`);
  }

  let fieldCount = 0;
  for (const [key, val] of entries) {
    if (fieldCount >= MAX_FIELDS_PER_DOC) break;
    if (allowedFields && !allowedFields.has(key)) continue; // drop unexpected fields

    if (typeof val === 'string') {
      // Clamp string length based on field name heuristic
      const maxLen = ['title', 'text', 'name'].includes(key)
        ? MAX_TITLE_LENGTH
        : MAX_DESCRIPTION_LENGTH;
      clean[key] = val.trim().slice(0, maxLen);

    } else if (typeof val === 'boolean' || typeof val === 'number') {
      clean[key] = val;

    } else if (val === null) {
      clean[key] = null;

    } else if (Array.isArray(val)) {
      // Clamp arrays and sanitize string items
      clean[key] = (val as unknown[])
        .slice(0, MAX_ARRAY_ITEMS)
        .map(item => (typeof item === 'string' ? item.trim().slice(0, MAX_TAG_LENGTH) : item));

    } else if (val && typeof val === 'object') {
      // Allow plain objects (Firestore Timestamps, nested config objects)
      // but do not recurse deeply to prevent DoS
      clean[key] = val;
    }

    fieldCount++;
  }

  return clean;
}

/**
 * Sanitize a task/todo document before Firestore write.
 */
export function sanitizeTaskInput(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDocument(data, TASK_FIELDS);
}

/**
 * Sanitize a habit document before Firestore write.
 */
export function sanitizeHabitInput(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDocument(data, HABIT_FIELDS);
}

/**
 * Sanitize a note document before Firestore write.
 */
export function sanitizeNoteInput(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDocument(data, NOTE_FIELDS);
}

/**
 * Validate a priority value — returns 'medium' as safe default.
 */
export function sanitizePriority(val: unknown): 'high' | 'medium' | 'low' {
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return 'medium';
}

/**
 * Validate a date string — must be YYYY-MM-DD format.
 */
export function sanitizeDateString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : val;
}
