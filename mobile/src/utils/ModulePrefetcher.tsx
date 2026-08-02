/**
 * ModulePrefetcher — ZenTrack Mobile
 *
 * WhatsApp-grade lazy module loading:
 * 1. `cacheAwareLazy(id, importer)` — creates a lazy component backed by a
 *    module registry. If already cached, renders synchronously on frame 1 (no
 *    loading spinner, no blank flash).
 * 2. `startPrefetching(pinnedModules)` — background-loads all registered
 *    modules in priority order (pinned first) after interactions settle.
 *
 * KEY FIX: The loading stub (`null` Comp case) renders a transparent View,
 * NOT one with a hardcoded background colour. This means it correctly inherits
 * the dark screen background set by `sceneStyle` in the Tab.Navigator — no
 * grey or wrong-colour flash when returning from background.
 */

import React, { ComponentType } from 'react';
import { InteractionManager, View } from 'react-native';

// ─── Module Registry ──────────────────────────────────────────────────────────
// In-memory cache: module id → resolved module object.
// Never cleared — once loaded, always ready.
const moduleCache = new Map<string, { default: ComponentType<any> }>();

// Stable map of lazy component wrappers — created once per id, reused forever.
// Prevents React from re-mounting screen components on parent re-renders.
const wrapperCache = new Map<string, ComponentType<any>>();

type Importer = () => Promise<{ default: ComponentType<any> }>;

// ─── Background Prefetch Queue ─────────────────────────────────────────────────
const prefetchQueue: { id: string; importer: Importer }[] = [];
let isPrefetching = false;

/**
 * Registers a module in the background prefetch queue.
 * Called at module declaration time (top of AppNavigator).
 * Does NOT start loading — only enqueues.
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

  // requestAnimationFrame keeps UI thread free during imports
  requestAnimationFrame(() => {
    if (moduleCache.has(next.id)) {
      // Already loaded by the user navigating to it — skip, do next
      processNext();
      return;
    }
    next.importer()
      .then(mod => {
        moduleCache.set(next.id, mod);
        requestAnimationFrame(processNext);
      })
      .catch(err => {
        console.warn(`[ModulePrefetcher] Failed to prefetch ${next.id}:`, err);
        requestAnimationFrame(processNext);
      });
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

  // Wait for interactions (navigation animations) to complete before loading
  InteractionManager.runAfterInteractions(processNext);
};

/**
 * cacheAwareLazy — The core primitive.
 *
 * Creates a stable wrapper component for a lazy-loaded screen.
 * The wrapper is created ONCE per id and reused — this is critical:
 * recreating it would cause React to unmount/remount the screen component.
 *
 * Loading state:
 * - If the module is already cached → renders synchronously, frame 1.
 * - If not cached → shows a TRANSPARENT blank View (inherits screen bg)
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
    const [Comp, setComp] = React.useState<ComponentType<any> | null>(() => {
      // Synchronous init: if already cached, render immediately
      return moduleCache.has(id) ? moduleCache.get(id)!.default : null;
    });

    React.useEffect(() => {
      if (Comp) return; // Already loaded
      let cancelled = false;
      importer()
        .then(mod => {
          if (cancelled) return;
          moduleCache.set(id, mod);
          setComp(() => mod.default);
        })
        .catch(err => {
          console.warn(`[cacheAwareLazy] Failed to load ${id}:`, err);
        });
      return () => { cancelled = true; };
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
