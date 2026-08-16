/**
 * tabBarScroll.ts — ZenTrack Mobile
 * Lightweight scroll direction coordinator for auto-hiding and showing the bottom tab bar.
 */

type TabBarScrollListener = (visible: boolean) => void;
const listeners = new Set<TabBarScrollListener>();

let currentVisibility = true;

/**
 * Explicitly show or hide the floating bottom tab bar.
 */
export function setTabBarVisible(visible: boolean) {
  if (currentVisibility === visible) return;
  currentVisibility = visible;
  listeners.forEach((fn) => fn(visible));
}

/**
 * Get current tab bar visibility state.
 */
export function getTabBarVisible(): boolean {
  return currentVisibility;
}

/**
 * Subscribe to tab bar visibility changes.
 */
export function subscribeTabBarScroll(fn: TabBarScrollListener): () => void {
  listeners.add(fn);
  fn(currentVisibility);
  return () => {
    listeners.delete(fn);
  };
}
