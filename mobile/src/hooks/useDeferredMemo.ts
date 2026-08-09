/**
 * useDeferredMemo.ts — ZenTrack Mobile
 *
 * A drop-in replacement for React.useMemo that defers heavy computations
 * behind InteractionManager on first mount, returning a cheap placeholder
 * until the computation completes.
 *
 * USE CASE: Heavy memos that run on screen mount (event grouping, overlap
 * detection, stats derivation). These block the first paint frame if run
 * synchronously. With this hook, the screen paints instantly with empty/
 * placeholder data, then updates ~1 frame later with real data.
 *
 * IMPORTANT: Only use for memos where a brief "empty" first render is
 * acceptable (e.g. list items, timeline events). Never use for data that
 * drives layout height calculations or error-prone conditional renders.
 */

import { useState, useEffect, useRef, DependencyList } from 'react';
import { InteractionManager } from 'react-native';

/**
 * useDeferredMemo
 *
 * @param factory   — The expensive computation function
 * @param deps      — Dependency array (same as useMemo)
 * @param immediate — Initial value rendered synchronously before the memo fires.
 *                    Defaults to empty array ([]) for list-type data.
 *
 * Behaviour:
 *   1. Returns `immediate` synchronously on first render (frame 1 — fast)
 *   2. After InteractionManager settles (all animations done), runs `factory`
 *   3. Returns factory result from frame 2 onward
 *   4. On subsequent dep changes: runs factory synchronously (same as useMemo)
 *      because the "first paint" has already happened.
 */
export function useDeferredMemo<T>(
  factory: () => T,
  deps: DependencyList,
  immediate: T
): T {
  const [value, setValue] = useState<T>(immediate);
  const mountedRef = useRef(false);
  const depsRef = useRef(deps);

  useEffect(() => {
    // After first mount, if deps change, run synchronously (instant update)
    if (mountedRef.current) {
      setValue(factory());
      depsRef.current = deps;
      return;
    }

    // First mount: defer behind interactions so first paint is unblocked
    mountedRef.current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      setValue(factory());
    });

    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
