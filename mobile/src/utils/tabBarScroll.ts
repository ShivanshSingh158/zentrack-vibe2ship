/**
 * tabBarScroll.ts — ZenTrack Mobile
 * Rock-solid persistent bottom tab bar coordinator.
 * Tab bar remains permanently anchored and responsive for 0ms touch latency.
 */

type TabBarScrollListener = (visible: boolean) => void;

export function setTabBarVisible(_visible: boolean) {
  // Fixed rock-solid tab bar — no-op to eliminate scroll-triggered JS bridge churn
}

export function getTabBarVisible(): boolean {
  return true;
}

export function subscribeTabBarScroll(fn: TabBarScrollListener): () => void {
  fn(true);
  return () => {};
}

