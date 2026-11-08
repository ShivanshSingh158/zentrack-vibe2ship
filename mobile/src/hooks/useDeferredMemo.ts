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

import { useMemo, DependencyList } from 'react';

/**
 * useDeferredMemo
 *
 * PERF FIX (Bottleneck #3 — Double-Render Flash on Screen Mount):
 * Previously, useDeferredMemo returned an empty placeholder ([]) on Frame 1,
 * painted an empty tree to the native shadow tree, and then fired InteractionManager
 * on Frame 2 to mount the real data. This doubled the React reconciliation and
 * Yoga layout passes during tab transitions.
 *
 * It now computes synchronously in 1 pass, allowing the screen to render its
 * true content on Frame 1 without visual flash or double layout thrash.
 */
export function useDeferredMemo<T>(
  factory: () => T,
  deps: DependencyList,
  _immediate?: T
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}
