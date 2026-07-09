/**
 * @file errorClassifier.ts
 * @module src/utils/errorClassifier
 *
 * MISSING-003: Classifies raw agent errors into user-facing actionable categories.
 *
 * Previously all errors surfaced as raw err.message strings. A 429 rate limit,
 * an OAuth failure, and a network error all looked identical to the user.
 * This module maps error strings to clear, friendly, actionable messages.
 */

export type ErrorCategory =
  | 'rate_limit'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'tool_failure'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /** User-facing headline message */
  userMessage: string;
  /** Optional call-to-action label (shown as a toast action button) */
  actionLabel?: string;
  /** Optional event name dispatched if the user clicks the action */
  actionEvent?: string;
  /** Emoji prefix for the toast */
  icon: string;
}

const lower = (err: unknown): string =>
  String((err as any)?.message || err || '').toLowerCase();

/**
 * Classifies an error thrown by orchestrateAgent or executeDag into a
 * structured object with a user-friendly message and optional action.
 */
export function classifyAgentError(err: unknown): ClassifiedError {
  const msg = lower(err);

  // ── Rate limit / quota ─────────────────────────────────────────────────────
  if (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('auto-recover') ||
    msg.includes('key(s) rate-limited') ||
    msg.includes('cooling')
  ) {
    return {
      category: 'rate_limit',
      icon: '⏳',
      userMessage: "Sara is handling heavy traffic right now. She'll automatically retry in ~60 seconds.",
    };
  }

  // ── Auth / session / OAuth ─────────────────────────────────────────────────
  if (
    msg.includes('session has expired') ||
    msg.includes('oauth session') ||
    msg.includes('please reconnect') ||
    msg.includes('authentication credentials') ||
    msg.includes('invalid authentication') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission denied') ||
    msg.includes('api key invalid') ||
    msg.includes('gemini api key')
  ) {
    // Distinguish Google Workspace auth from Gemini API key auth
    const isGoogleWorkspace =
      msg.includes('google') || msg.includes('workspace') || msg.includes('oauth');
    return {
      category: 'auth',
      icon: '🔑',
      userMessage: isGoogleWorkspace
        ? 'Your Google Workspace session expired. Please reconnect to continue.'
        : 'Your Gemini API key or session is invalid. Check Settings → AI Key.',
      actionLabel: isGoogleWorkspace ? 'Reconnect Google' : 'Open Settings',
      actionEvent: isGoogleWorkspace ? 'zen-open-google-connect' : 'zen-open-settings',
    };
  }

  // ── Network / connectivity ─────────────────────────────────────────────────
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('err_network') ||
    msg.includes('err_internet') ||
    msg.includes('no internet') ||
    msg.includes('connection refused') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound')
  ) {
    return {
      category: 'network',
      icon: '📡',
      userMessage: "Can't reach the internet. Check your connection and try again.",
    };
  }

  // ── Timeout ────────────────────────────────────────────────────────────────
  if (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('mission timed out') ||
    msg.includes('aborted') ||
    msg.includes('signal is aborted')
  ) {
    // Distinguish user-cancel from auto-timeout
    const isUserCancel = msg.includes('user cancel') || msg.includes('user abort');
    return {
      category: 'timeout',
      icon: isUserCancel ? '🛑' : '⏱️',
      userMessage: isUserCancel
        ? 'Mission cancelled.'
        : 'The mission took too long and was automatically stopped. Try a simpler or shorter request.',
    };
  }

  // ── Tool / execution failure ───────────────────────────────────────────────
  if (
    msg.includes('tool') ||
    msg.includes('execution blocked') ||
    msg.includes('agent completed without') ||
    msg.includes('google workspace api error')
  ) {
    return {
      category: 'tool_failure',
      icon: '⚠️',
      userMessage: `A tool couldn't complete its action. ${(err as any)?.message?.slice(0, 120) || 'Check the terminal feed for details.'}`,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return {
    category: 'unknown',
    icon: '❌',
    userMessage: `Something went wrong: ${(err as any)?.message?.slice(0, 200) || 'Unknown error. Check the console for details.'}`,
  };
}
