/**
 * ModulePrefetcher ΓÇö ZenTrack Mobile
 *
 * WhatsApp-grade lazy module loading:
 * 1. `cacheAwareLazy(id, importer)` ΓÇö creates a lazy component backed by a
 *    module registry. If already cached, renders synchronously on frame 1 (no
 *    loading spinner, no blank flash).
 * 2. `startPrefetching(pinnedModules)` ΓÇö background-loads all registered
 *    modules in priority order (pinned first) after interactions settle.
 *
 * KEY FIX: The loading stub (`null` Comp case) renders a transparent View,
 * NOT one with a hardcoded background colour. This means it correctly inherits
 * the dark screen background set by `sceneStyle` in the Tab.Navigator ΓÇö no
 * grey or wrong-colour flash when returning from background.
 */

import React, { ComponentType } from 'react';
import { InteractionManager, View } from 'react-native';

// ΓöÇΓöÇΓöÇ Module Registry ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// In-memory cache: module id ΓåÆ resolved module object.
// Never cleared ΓÇö once loaded, always ready.
const moduleCache = new Map<string, { default: ComponentType<any> }>();

// Stable map of lazy component wrappers ΓÇö created once per id, reused forever.
// Prevents React from re-mounting screen components on parent re-renders.
const wrapperCache = new Map<string, ComponentType<any>>();

type Importer = () => Promise<{ default: ComponentType<any> }>;

// ΓöÇΓöÇΓöÇ Background Prefetch Queue ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const prefetchQueue: { id: string; importer: Importer }[] = [];
let isPrefetching = false;

/**
 * Registers a module in the background prefetch queue.
 * Called at module declaration time (top of AppNavigator).
 * Does NOT start loading ΓÇö only enqueues.
 */
const registerForPrefetch = (id: string, importer: Importer): void => {
  if (!moduleCache.has(id) && !prefetchQueue.some(item => item.id === id)) {
    prefetchQueue.push({ id, importer });
  }
};

const processNext = (): void => {
  if (prefetchQueue.length === 0) {
    isPrefetching = false;
    return;
  }
  const next = prefetchQueue.shift();
  if (!next) return;

  if (moduleCache.has(next.id)) {
    // Already loaded by user navigation — skip to next after idle delay
    setTimeout(() => {
      InteractionManager.runAfterInteractions(processNext);
    }, 600);
    return;
  }

  next.importer()
    .then(mod => {
      moduleCache.set(next.id, mod);
      // Wait 800ms between modules so UI thread stays 100% responsive
      setTimeout(() => {
        InteractionManager.runAfterInteractions(processNext);
      }, 800);
    })
    .catch(err => {
      console.warn(`[ModulePrefetcher] Failed to prefetch ${next.id}:`, err);
      setTimeout(() => {
        InteractionManager.runAfterInteractions(processNext);
      }, 800);
    });
};

/**
 * Starts background prefetching of all registered modules.
 * Call this once after the initial tab renders (in a useEffect).
 * Pinned modules are prioritised and loaded first.
 */
export const startPrefetching = (pinnedModules: string[] = []): void => {
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;

  // Pinned modules go to the front of the queue
  prefetchQueue.sort((a, b) => {
    const aPinned = pinnedModules.includes(a.id);
    const bPinned = pinnedModules.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  // Defer 3.5s so initial Home paint, fonts, and animations complete in <1.5s
  setTimeout(() => {
    InteractionManager.runAfterInteractions(processNext);
  }, 3500);
};

/**
 * preloadNow — immediately loads a single module into the cache.
 * Use this for high-priority screens (e.g. Sara) that should be warm
 * a few seconds after login without waiting for the full queue.
 * Safe to call multiple times — no-ops if already cached.
 */
export const preloadNow = (id: string): void => {
  if (moduleCache.has(id)) return; // already loaded — nothing to do
  const entry = prefetchQueue.find(item => item.id === id);
  if (!entry) return;
  entry.importer().then(mod => {
    moduleCache.set(id, mod);
  }).catch(err => {
    console.warn(`[ModulePrefetcher] preloadNow failed for ${id}:`, err);
  });
};

/**
 * cacheAwareLazy ΓÇö The core primitive.
 *
 * Creates a stable wrapper component for a lazy-loaded screen.
 * The wrapper is created ONCE per id and reused ΓÇö this is critical:
 * recreating it would cause React to unmount/remount the screen component.
 *
 * Loading state:
 * - If the module is already cached ΓåÆ renders synchronously, frame 1.
 * - If not cached ΓåÆ shows a TRANSPARENT blank View (inherits screen bg)
 *   while importing, then renders the component immediately on load.
 *
 * The transparent View (not a coloured one) is the fix for the grey flash:
 * the Tab.Navigator's `sceneStyle: { backgroundColor: '#080510' }` already
 * paints the correct dark background. Our stub must not paint over it.
 */
export const cacheAwareLazy = (id: string, importer: Importer): ComponentType<any> => {
  // Register for background loading
  registerForPrefetch(id, importer);

  // Return a stable wrapper — created once, then returned from cache
  if (wrapperCache.has(id)) {
    return wrapperCache.get(id)!;
  }

  const Wrapper = (props: any) => {
    // If already in moduleCache (pre-fetched in background), initialize synchronously.
    // This is the key fix: the component renders on frame 1, zero blank screen.
    const [Comp, setComp] = React.useState<ComponentType<any> | null>(
      () => moduleCache.get(id)?.default ?? null
    );

    React.useEffect(() => {
      // Already resolved synchronously above — nothing to do.
      if (Comp) return;

      let isMounted = true;
      // Not in cache yet — start loading immediately, no artificial delay.
      importer().then(mod => {
        moduleCache.set(id, mod);
        if (isMounted) setComp(() => mod.default);
      }).catch(err => {
        console.warn(`[ModulePrefetcher] Failed to load ${id}:`, err);
      });

      return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!Comp) {
      // TRANSPARENT — inherits the dark background from Tab.Navigator sceneStyle.
      // A hardcoded backgroundColor here would cause a flash on background resume.
      return <View style={{ flex: 1 }} />;
    }

    return <Comp {...props} />;
  };

  Wrapper.displayName = `LazyScreen(${id})`;
  wrapperCache.set(id, Wrapper);
  return Wrapper;
};
