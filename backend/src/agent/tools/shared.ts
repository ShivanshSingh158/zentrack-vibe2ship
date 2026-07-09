/**
 * @file shared.ts
 * @module src/agent/tools/shared
 *
 * Shared types, auth helpers, and utilities used by all tool executor modules.
 *
 * ## What Lives Here
 * - `ToolResult` type — the standard return shape for every tool
 * - `requireGoogleAuth` — checks Google OAuth and attempts silent refresh
 * - `requestApproval` — human-in-the-loop gate (currently auto-approves)
 * - `ensureGoogleAuthSingleton` — OAuth refresh deduplication lock
 * - `safeToolResultString` — ARCH-002: structured, truncation-resilient serializer
 *
 * This module has NO domain logic — it is infrastructure only.
 * All domain tool implementations live in their own executor files.
 *
 * @see {@link ./task.executor.ts} for task tools
 * @see {@link ./gmail.executor.ts} for Gmail tools
 */
import { forceSilentRefresh, isSignedInToGoogle } from '../../services/googleCalendar';

// ── Public Types ──────────────────────────────────────────────────────────────

export type ToolResult = {
  success: boolean;
  data: unknown;
  message: string;
  /**
   * ARCH-002: Set to true when `data` was truncated to stay within the
   * 6000-char serialization cap. Downstream agents receive a notice that
   * additional data exists but was omitted for token efficiency.
   */
  truncated?: boolean;
};

// ── ARCH-002: Typed Tool Result Serializer ─────────────────────────────────
// Previously tool results were passed as raw JSON.stringify(toolResult) into the
// Gemini conversation. If the result was large, it could be truncated mid-JSON
// causing the agent to receive a broken string it couldn't parse.
//
// safeToolResultString() wraps the result in explicit TOOL_RESULT: ... END_TOOL_RESULT
// delimiters so the agent always sees a syntactically complete block regardless of
// truncation. Data is capped at DATA_CAP_CHARS and flagged with truncated:true if cut.
const DATA_CAP_CHARS = 6000;

export const safeToolResultString = (toolName: string, result: ToolResult): string => {
  let dataSerialized: string;
  let truncated = false;

  try {
    const raw = JSON.stringify(result.data ?? null);
    if (raw.length > DATA_CAP_CHARS) {
      dataSerialized = raw.substring(0, DATA_CAP_CHARS);
      truncated = true;
    } else {
      dataSerialized = raw;
    }
  } catch {
    dataSerialized = '"[non-serializable]"';
  }

  return [
    `TOOL_RESULT: ${toolName}`,
    `STATUS: ${result.success ? 'success' : 'failure'}`,
    `MESSAGE: ${result.message || '(no message)'}`,
    truncated ? `DATA_TRUNCATED: true (showing first ${DATA_CAP_CHARS} chars of ${DATA_CAP_CHARS}+ char response)` : '',
    `DATA: ${dataSerialized}`,
    `END_TOOL_RESULT`,
  ].filter(Boolean).join('\n');
};

// ── OAuth Singleton Refresh Lock ──────────────────────────────────────────────
// Prevents parallel agents from each triggering their own OAuth flow simultaneously.
// The first caller acquires the lock; all subsequent callers await the same promise.
let _oauthRefreshLock: Promise<void> | null = null;

const ensureGoogleAuthSingleton = async (): Promise<void> => {
  if (_oauthRefreshLock) return _oauthRefreshLock;
  _oauthRefreshLock = forceSilentRefresh().finally(() => { _oauthRefreshLock = null; });
  return _oauthRefreshLock;
};

/**
 * Checks that the user has an active Google OAuth token.
 * If not, attempts a silent refresh using the stored refresh token.
 * Returns a ToolResult error if auth cannot be established, or null if auth is OK.
 */
export const requireGoogleAuth = async (_signal?: AbortSignal): Promise<ToolResult | null> => {
  if (!isSignedInToGoogle()) {
    const hasRefreshFlag = localStorage.getItem('zen_gcal_has_refresh_token');
    if (hasRefreshFlag) {
      try {
        console.log('[ToolExecutor] Token expired mid-flight. Attempting silent refresh...');
        await ensureGoogleAuthSingleton();
        if (isSignedInToGoogle()) {
          console.log('[ToolExecutor] Silent refresh successful! Resuming tool execution.');
          return null;
        }
      } catch (e) {
        console.warn('[ToolExecutor] Mid-flight silent refresh failed:', e);
      }
    }
    return {
      success: false,
      data: null,
      message: '⚠️ Google Workspace is not connected. Please click the **"Connect Google"** button in the orange banner at the top of the app, then try again.'
    };
  }
  return null;
};

// ── Human-in-the-Loop Approval Gate ──────────────────────────────────────────
// MISSING-005 UPDATE: requestApproval now dispatches a CustomEvent so the
// AgentApprovalToastListener can display a 3-second "Cancel" undo window.
// The action still proceeds immediately (returns true) to preserve the
// no-friction auto-approve behavior — but the user gets visibility into
// what is being done and a brief cancel window.
export const requestApproval = (toolName: string, summary: string, _signal?: AbortSignal): Promise<boolean> => {
  // Generate a unique ID so the toast can wire the correct cancellation callback
  const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-approval-request', {
      detail: { toolName, summary, id: approvalId }
    }));
  }
  // Auto-approve: action executes immediately without blocking
  return Promise.resolve(true);
};
