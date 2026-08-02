/**
 * agentHistory.ts — ZenTrack Mobile
 *
 * Feature 4.15 — Sara Agent Action History Log
 *
 * Persists every committed Sara action to AsyncStorage so users can review
 * exactly what Sara did autonomously (Tier 1 silent) or with their approval
 * (Tier 2 pill confirm / Tier 3 card confirm).
 *
 * Storage key: STORAGE_KEYS.SARA_ACTION_HISTORY — JSON array, newest first.
 * Capped at AGENT_HISTORY_MAX_ENTRIES (50) to prevent unbounded growth.
 *
 * All functions are async and fire-and-forget safe — they catch internally
 * and never throw, so a storage failure can't break the Sara chat flow.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, AGENT_HISTORY_MAX_ENTRIES } from '../config/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Tier of Sara confidence-gated action that was committed. */
export type ActionTier = 1 | 2 | 3;

export interface AgentAction {
  /** ISO timestamp of when the action was committed */
  timestamp: string;
  /** Unix ms — for sorting/filtering */
  timestampMs: number;
  /** Sara action type string, e.g. 'logHabit', 'completeTask', 'createTask' */
  type: string;
  /** Human-readable one-line description surfaced to user */
  description: string;
  /** Which tier committed this action */
  tier: ActionTier;
  /** Optional: the entity affected (task title, habit name, etc.) */
  entityLabel?: string;
}

// ── Internal cache (avoids re-reads on rapid successive logs) ─────────────────

let _cache: AgentAction[] | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Log a committed Sara action.
 * Called from SaraScreen.tsx immediately after any Firestore write succeeds.
 *
 * @param entry  The action details to persist
 */
export async function logAgentAction(entry: Omit<AgentAction, 'timestamp' | 'timestampMs'>): Promise<void> {
  try {
    const now = new Date();
    const fullEntry: AgentAction = {
      ...entry,
      timestamp: now.toISOString(),
      timestampMs: now.getTime(),
    };

    // Load existing (use cache if available)
    const existing = _cache ?? await _load();
    const updated = [fullEntry, ...existing].slice(0, AGENT_HISTORY_MAX_ENTRIES);
    _cache = updated;

    await AsyncStorage.setItem(STORAGE_KEYS.SARA_ACTION_HISTORY, JSON.stringify(updated));
  } catch (e) {
    // Silent fail — history log is non-critical, must never break Sara flow
    console.warn('[AgentHistory] Failed to log action (non-critical):', e);
  }
}

/**
 * Read the full action history, newest first.
 * Returns an empty array if nothing is stored or read fails.
 */
export async function getAgentHistory(): Promise<AgentAction[]> {
  try {
    const data = await _load();
    _cache = data;
    return data;
  } catch {
    return [];
  }
}

/**
 * Clear all stored action history (user-initiated from Settings).
 */
export async function clearAgentHistory(): Promise<void> {
  try {
    _cache = [];
    await AsyncStorage.removeItem(STORAGE_KEYS.SARA_ACTION_HISTORY);
  } catch (e) {
    console.warn('[AgentHistory] Failed to clear history:', e);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _load(): Promise<AgentAction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.SARA_ACTION_HISTORY);
  if (!raw) return [];
  return JSON.parse(raw) as AgentAction[];
}
