/**
 * orchestrationLock.ts — Global singleton mutex for agent orchestrations.
 *
 * PROBLEM (ISSUE-U7): HomeDashboard, ZenAgentPanel, and useProactiveAgent all call
 * orchestrateAgent() independently. Two full-fleet orchestrations running in parallel
 * burns API quota simultaneously and produces race conditions in tool side effects
 * (e.g., duplicate calendar events, duplicate task creations).
 *
 * SOLUTION: A lightweight in-memory lock. No Redux, no Zustand — just a module-level
 * singleton that is shared across all importers via JS module caching.
 *
 * PREEMPTION RULE (user always wins):
 *   - If a PROACTIVE loop holds the lock and the user sends a command:
 *     forceRelease() is called — the proactive run is aborted, user gets priority.
 *   - If a USER command holds the lock and a proactive loop tries to start:
 *     tryAcquire() returns false — the proactive run is silently skipped.
 *
 * Subscribers (e.g., UI loading spinners) receive notifications on lock state changes.
 */

type LockOwner = 'user' | 'proactive';

interface LockState {
  locked: boolean;
  owner: LockOwner | null;
  acquiredAt: number | null;
}

type Subscriber = () => void;

// ── Module-level singleton ─────────────────────────────────────────────────────
let _state: LockState = { locked: false, owner: null, acquiredAt: null };
const _subscribers = new Set<Subscriber>();

function _notify() {
  _subscribers.forEach(fn => fn());
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Try to acquire the orchestration lock.
 * Returns true if lock was successfully acquired, false if already held.
 * USER owner preempts a PROACTIVE holder — pass the abortController of the
 * proactive run so it can be cancelled immediately.
 */
export function tryAcquireLock(
  owner: LockOwner,
  proactiveAbortController?: AbortController
): boolean {
  // ✅ LOW-2 FIX: Detect and release stale locks (held > 5 minutes).
  // If an agent crashes mid-execution without calling releaseLock, the lock
  // would be held forever, silently blocking all future user commands until
  // page refresh. Now we forcibly reclaim locks older than 5 minutes.
  const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
  if (_state.locked && _state.acquiredAt !== null) {
    const age = Date.now() - _state.acquiredAt;
    if (age > LOCK_TTL_MS) {
      console.warn(`[OrchLock] Stale lock detected (held by "${_state.owner}" for ${Math.round(age / 1000)}s). Force-releasing.`);
      _state = { locked: false, owner: null, acquiredAt: null };
      _notify();
    }
  }

  if (!_state.locked) {
    _state = { locked: true, owner, acquiredAt: Date.now() };
    _notify();
    return true;
  }

  // User preempts proactive
  if (owner === 'user' && _state.owner === 'proactive') {
    console.warn('[OrchLock] User preempting proactive orchestration — aborting proactive run.');
    proactiveAbortController?.abort();
    _state = { locked: true, owner: 'user', acquiredAt: Date.now() };
    _notify();
    return true;
  }

  console.log(`[OrchLock] Lock already held by "${_state.owner}". Rejecting "${owner}" request.`);
  return false;
}

/**
 * Release the orchestration lock. Only the current owner should call this.
 * Calling with a different owner is a no-op (defensive).
 */
export function releaseLock(owner: LockOwner): void {
  if (_state.owner !== owner) {
    console.warn(`[OrchLock] releaseLock("${owner}") called but lock is held by "${_state.owner}". Ignored.`);
    return;
  }
  _state = { locked: false, owner: null, acquiredAt: null };
  _notify();
}

/**
 * Force-release the lock regardless of owner. Use ONLY in cleanup / error paths.
 */
export function forceReleaseLock(): void {
  _state = { locked: false, owner: null, acquiredAt: null };
  _notify();
}

export const isOrchestrationLocked = (): boolean => _state.locked;
export const getOrchestrationLockOwner = (): LockOwner | null => _state.owner;

/**
 * Subscribe to lock state changes. Returns an unsubscribe function.
 * Compatible with React's useSyncExternalStore.
 */
export function subscribeToLock(fn: Subscriber): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getLockSnapshot(): Readonly<LockState> {
  return _state;
}
