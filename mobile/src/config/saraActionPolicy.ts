/**
 * saraActionPolicy.ts — ZenTrack Mobile SARA Engine v2
 *
 * Capability 3 — Confidence-Gated Autonomous Actions
 *
 * Defines the 3-tier action gateway:
 *   Tier 1 — SILENT AUTO-EXECUTE  (confidence > 0.95, reversible)
 *   Tier 2 — INLINE QUICK CONFIRM (confidence 0.70–0.95, or irreversible/low-impact)
 *   Tier 3 — FULL CONFIRMATION CARD (confidence < 0.70, or destructive)
 *
 * This entire file is the single source of truth for action policy.
 * Adjust thresholds here without touching any other code.
 */

// ─── Action metadata ──────────────────────────────────────────────────────────

export type ActionTier = 1 | 2 | 3;

interface ActionPolicy {
  tier1Threshold: number;   // Auto-execute if confidence >= this
  tier2Threshold: number;   // Quick-confirm if confidence >= this
  isReversible: boolean;    // Can this be undone easily?
  isDestructive: boolean;   // Causes data loss?
  tier1Eligible: boolean;   // Is silent execution allowed at all?
}

// ─── Action policy table ──────────────────────────────────────────────────────
// Edit this table to change behavior for any action type.

const ACTION_POLICIES: Record<string, ActionPolicy> = {
  // ── LOW RISK — reversible, Tier 1 eligible ─────────────────────────────
  logHabit: {
    tier1Threshold: 0.90,
    tier2Threshold: 0.70,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: true,
  },
  completeTask: {
    tier1Threshold: 0.92,
    tier2Threshold: 0.72,
    isReversible: true,  // can be marked incomplete again
    isDestructive: false,
    tier1Eligible: true,
  },
  markAttendance: {
    tier1Threshold: 0.93,
    tier2Threshold: 0.75,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: true,
  },

  // ── MEDIUM RISK — creates data, Tier 2 eligible ────────────────────────
  createTask: {
    tier1Threshold: 0.96,   // Very high threshold for auto-creating tasks
    tier2Threshold: 0.70,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,   // Always show at least Tier 2 for creates
  },
  createNote: {
    tier1Threshold: 0.96,
    tier2Threshold: 0.70,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,
  },
  createHabit: {
    tier1Threshold: 0.97,
    tier2Threshold: 0.72,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,
  },
  addCalendarEvent: {
    tier1Threshold: 0.97,
    tier2Threshold: 0.72,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,
  },
  createSubject: {
    tier1Threshold: 0.98,
    tier2Threshold: 0.75,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,
  },
  updateTask: {
    tier1Threshold: 0.95,
    tier2Threshold: 0.72,
    isReversible: true,
    isDestructive: false,
    tier1Eligible: false,
  },

  // ── HIGH RISK — destructive, always Tier 3 ────────────────────────────
  deleteTask: {
    tier1Threshold: 1.1,    // Impossible threshold — always Tier 3
    tier2Threshold: 1.1,    // Always Tier 3
    isReversible: false,
    isDestructive: true,
    tier1Eligible: false,
  },
  deleteCalendarEvent: {
    tier1Threshold: 1.1,
    tier2Threshold: 1.1,
    isReversible: false,
    isDestructive: true,
    tier1Eligible: false,
  },
};

// Default policy for unknown action types — conservative Tier 3
const DEFAULT_POLICY: ActionPolicy = {
  tier1Threshold: 1.1,
  tier2Threshold: 0.85,
  isReversible: true,
  isDestructive: false,
  tier1Eligible: false,
};

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Determine which action tier to use for a given action type + confidence score.
 *
 * Tier 1 — Silent auto-execute + HUD toast (no user interaction)
 * Tier 2 — Compact inline pill confirm (1 tap)
 * Tier 3 — Full ActionConfirmationCard (existing behavior)
 *
 * @param actionType - The Sara action type string (e.g. 'logHabit', 'deleteTask')
 * @param confidence - Confidence score 0-1 from the model's response parsing
 */
export function getActionTier(actionType: string, confidence: number): ActionTier {
  const policy = ACTION_POLICIES[actionType] ?? DEFAULT_POLICY;

  // Destructive actions ALWAYS go to Tier 3 — never auto-execute
  if (policy.isDestructive) return 3;

  // Tier 1: silent auto-execute
  if (policy.tier1Eligible && confidence >= policy.tier1Threshold) return 1;

  // Tier 2: inline quick-confirm pill
  if (confidence >= policy.tier2Threshold) return 2;

  // Tier 3: full confirmation card (default)
  return 3;
}

/**
 * Get a human-readable description for a Tier 1 auto-executed action.
 * Used in the SaraHUDToast ("✓ Habit logged").
 */
export function getAutoExecuteToastText(actionType: string, args: any): string {
  switch (actionType) {
    case 'logHabit':
      return `✓ ${args.habitName || 'Habit'} logged`;
    case 'completeTask':
      return `✓ "${args.taskTitle || 'Task'}" complete`;
    case 'markAttendance':
      return `✓ ${args.subjectName || 'Class'} marked ${args.status || 'present'}`;
    default:
      return `✓ Done`;
  }
}

/**
 * Get a compact description for a Tier 2 inline pill.
 * Used in InlineActionPill ("Add 'ML Exam' on Thursday? ✓")
 */
export function getInlinePillText(actionType: string, args: any): string {
  switch (actionType) {
    case 'createTask':
      return `Add task "${args.title}"?`;
    case 'createNote':
      return `Save note "${args.title}"?`;
    case 'addCalendarEvent':
      return `Add "${args.title}" on ${args.date}?`;
    case 'createHabit':
      return `Create habit "${args.name}"?`;
    case 'updateTask':
      return `Update "${args.taskTitle}"?`;
    case 'logHabit':
      return `Log "${args.habitName}" today?`;
    case 'completeTask':
      return `Complete "${args.taskTitle}"?`;
    case 'markAttendance':
      return `Mark ${args.subjectName} as ${args.status}?`;
    default:
      return `Confirm action?`;
  }
}

/**
 * Estimate confidence from a Sara action response.
 * Heuristic: if Sara used a specific ID → higher confidence.
 * If she guessed/inferred → lower confidence.
 */
export function estimateActionConfidence(action: any): number {
  if (!action) return 0.5;

  let score = 0.7; // baseline

  // Has a specific ID → Sara is certain about the target
  if (action.taskId || action.habitId || action.subjectId || action.eventId) {
    score += 0.20;
  }

  // Has all required fields filled
  const type = action.type || '';
  if (type === 'createTask' && action.title && action.dueDate) score += 0.08;
  if (type === 'logHabit' && action.habitId && action.habitName) score += 0.08;
  if (type === 'completeTask' && action.taskId) score += 0.08;
  if (type === 'markAttendance' && action.subjectId && action.status) score += 0.08;

  // Penalty: missing required info
  if (type === 'createTask' && !action.title) score -= 0.3;
  if (type === 'deleteTask' && !action.taskId) score -= 0.5;

  return Math.min(1.0, Math.max(0.0, score));
}
