/**
 * userLearningStore.ts — The Unified Learning Brain
 *
 * Singleton service that:
 *   1. Loads UserBehaviorProfile from Firestore on app start (once, cached in memory)
 *   2. Exposes getAgentContext(role) → per-role behavioral directive string
 *   3. Accepts micro-learning events from toolExecutor to update the profile in real-time
 *   4. Persists updates back to Firestore (debounced, non-blocking)
 *
 * Storage:
 *   - Firestore user_profiles/{uid}/behaviorProfile  — cross-device truth
 *   - localStorage zen_behavior_profile              — instant read cache
 *   - In-memory _cachedProfile                       — zero-latency during session
 *
 * Usage:
 *   import { userLearningStore } from './userLearningStore';
 *   userLearningStore.initialize(appContext);               // call once on app load
 *   const ctx = userLearningStore.getAgentContext('CHRONOS'); // call before each agent
 *   userLearningStore.recordCompletion(task);               // call after task completion
 */

import {
  deriveUserBehaviorProfile,
  loadBehaviorProfile,
  saveBehaviorProfile,
  getBehavioralDirective,
  formatProfileForAgent,
  type UserBehaviorProfile,
} from './patternEngine';

// ── Types (internal) ─────────────────────────────────────────────────────────

interface LearningEvent {
  type:
    | 'task_completed'
    | 'task_rescheduled'
    | 'task_created'
    | 'habit_logged'
    | 'calendar_slot_chosen'
    | 'email_sent'
    | 'email_replied';
  timestamp: number;
  payload: Record<string, any>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

class UserLearningStore {
  private _profile: UserBehaviorProfile | null = null;
  private _initialized = false;
  private _pendingEvents: LearningEvent[] = [];
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _appContext: any = null;

  // ── Initialization ───────────────────────────────────────────────────────

  /** Call once on app load. Non-blocking — loads in background. */
  async initialize(appContext: any): Promise<void> {
    this._appContext = appContext;
    if (this._initialized) {
      // Re-derive with fresh appContext on every call
      this._profile = deriveUserBehaviorProfile(appContext);
      return;
    }
    this._initialized = true;

    try {
      // Start with whatever we can derive immediately from local data
      this._profile = deriveUserBehaviorProfile(appContext);

      // Then merge with Firestore profile if it exists (may have more history)
      const stored = await loadBehaviorProfile();
      if (stored.derivedAt !== this._profile.derivedAt) {
        // Firestore has a different (potentially richer) profile
        // Prefer stored for streak/accuracy data, prefer local for persona detection
        this._profile = {
          ...stored,
          userPersona: this._profile.userPersona, // always re-detect from fresh data
          actualPeakHours: this._profile.actualPeakHours.length >= stored.actualPeakHours.length
            ? this._profile.actualPeakHours
            : stored.actualPeakHours,
        };
      }
    } catch (err) {
      console.warn('[LearningStore] Init failed, using derived profile:', err);
    }
  }

  /** Returns the currently loaded profile or the default. Never null. */
  getProfile(): UserBehaviorProfile {
    return this._profile || {
      actualPeakHours: [9, 14],
      morningStartTime: 9,
      eveningCutoffTime: 22,
      preferredTaskBatchSize: 3,
      lowActivityDays: [],
      avgCompletionRatio: 1.0,
      taskEstimationAccuracy: {},
      rescheduleRate: 0.2,
      snoozePatternTopics: [],
      avoidanceCategories: [],
      habitStreakPatterns: [],
      emailResponseTimeMinutes: 60,
      userPersona: 'general',
      avgDailyCompletedCount: 5,
      derivedAt: new Date().toISOString(),
    };
  }

  // ── Per-role Context ─────────────────────────────────────────────────────

  /**
   * Returns a compact, role-specific Behavioral Directive string.
   * Safe to call synchronously — always uses the cached profile.
   */
  getAgentContext(role: string): string {
    return getBehavioralDirective(this.getProfile(), role);
  }

  /** Full profile formatted as a human-readable summary. */
  getFullProfileContext(): string {
    return formatProfileForAgent(this.getProfile());
  }

  // ── Real-Time Learning Hooks ─────────────────────────────────────────────

  /** Call when the user completes a task */
  recordCompletion(task: any): void {
    const now = Date.now();
    const hr = new Date(now).getHours();
    const profile = this.getProfile();

    // Update peak hours in real-time
    const newPeaks = [...profile.actualPeakHours];
    if (!newPeaks.includes(hr) && newPeaks.length < 6) {
      newPeaks.push(hr);
      this._patchProfile({ actualPeakHours: newPeaks.sort((a, b) => a - b) });
    }

    // Update estimation accuracy if we have both estimated and actual time
    if (task.estimatedMinutes && task.actualMinutes) {
      const cat = (task.category || 'general').toLowerCase();
      const ratio = parseFloat((task.actualMinutes / task.estimatedMinutes).toFixed(2));
      const existing = profile.taskEstimationAccuracy[cat] ?? 1.0;
      // Exponential moving average — new readings weighted more heavily
      const updated = parseFloat(((existing * 0.7) + (ratio * 0.3)).toFixed(2));
      this._patchProfile({
        taskEstimationAccuracy: { ...profile.taskEstimationAccuracy, [cat]: updated }
      });
    }

    // Update avg daily completed count
    const newAvg = parseFloat(((profile.avgDailyCompletedCount * 0.9) + (1 * 0.1)).toFixed(1));
    this._patchProfile({ avgDailyCompletedCount: newAvg });

    this._queueSave();
  }

  /** Call when a task gets rescheduled/snoozed */
  recordReschedule(task: any): void {
    const profile = this.getProfile();
    // Incrementally update reschedule rate
    const newRate = parseFloat(Math.min(1, (profile.rescheduleRate * 0.85) + (0.15)).toFixed(2));
    this._patchProfile({ rescheduleRate: newRate });

    // Update snooze topics
    const words = (task?.title || task?.text || '').toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !['task', 'todo', 'this', 'that', 'with'].includes(w));
    if (words.length > 0) {
      const existing = profile.snoozePatternTopics;
      const merged = [...new Set([...words.slice(0, 2), ...existing])].slice(0, 8);
      this._patchProfile({ snoozePatternTopics: merged });
    }
    this._queueSave();
  }

  /** Call when agent books a calendar slot */
  recordSlotChosen(hour: number): void {
    const profile = this.getProfile();
    // Bump the chosen hour in peak hours ranking
    const peaks = [...profile.actualPeakHours];
    if (!peaks.includes(hour)) {
      // Replace the least frequently used peak with this new one
      if (peaks.length >= 4) peaks.pop();
      peaks.unshift(hour);
    }
    this._patchProfile({ actualPeakHours: peaks });
    this._queueSave();
  }

  /** Call when an email is sent/replied — updates response time estimate */
  recordEmailAction(responseTimeMinutes?: number): void {
    if (!responseTimeMinutes || responseTimeMinutes <= 0 || responseTimeMinutes > 1440) return;
    const profile = this.getProfile();
    const newAvg = parseFloat(((profile.emailResponseTimeMinutes * 0.8) + (responseTimeMinutes * 0.2)).toFixed(0));
    this._patchProfile({ emailResponseTimeMinutes: newAvg });
    this._queueSave();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _patchProfile(patch: Partial<UserBehaviorProfile>): void {
    if (!this._profile) return;
    this._profile = { ...this._profile, ...patch, derivedAt: new Date().toISOString() };
  }

  /** Debounced save — batches rapid events into one Firestore write (30s window) */
  private _queueSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      if (this._profile) {
        await saveBehaviorProfile(this._profile).catch(() => {/* non-blocking */});
      }
    }, 30_000);
  }

  /** Force an immediate save (call on page unload) */
  async flush(): Promise<void> {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._profile) await saveBehaviorProfile(this._profile).catch(() => {});
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const userLearningStore = new UserLearningStore();
