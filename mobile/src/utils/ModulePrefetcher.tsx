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

import React, { ComponentType, useState, useEffect } from 'react';
import { InteractionManager, View } from 'react-native';

// ΓöÇΓöÇΓöÇ Module Registry ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// In-memory cache: module id ΓåÆ resolved module object.
// Never cleared ΓÇö once loaded, always ready.
const moduleCache = new Map<string, { default: ComponentType<any> }>();

// Stable map of lazy component wrappers ΓÇö created once per id, reused forever.
// Prevents React from re-mounting screen components on parent re-renders.
const wrapperCache = new Map<string, ComponentType<any>>();

type Importer = () => Promise<{ default: ComponentType<any> }>;

// ─── Background Prefetch Queue ────────────────────────────────────────────────
const registeredImporters = new Map<string, Importer>();
const prefetchQueue: { id: string; importer: Importer }[] = [];
let isPrefetching = false;
let pinnedOnlyMode = false;
let pinnedModulesList: string[] = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let stepTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Registers a module in the background prefetch queue.
 * Called at module declaration time (top of AppNavigator).
 * Does NOT start loading — only enqueues.
 */
const registerForPrefetch = (id: string, importer: Importer): void => {
  registeredImporters.set(id, importer);
  if (!moduleCache.has(id) && !prefetchQueue.some(item => item.id === id)) {
    prefetchQueue.push({ id, importer });
  }
};

const scheduleNextStep = (delayMs: number): void => {
  if (stepTimer) clearTimeout(stepTimer);
  stepTimer = setTimeout(() => {
    stepTimer = null;
    InteractionManager.runAfterInteractions(processNext);
  }, delayMs);
};


const processNext = (): void => {
  while (prefetchQueue.length > 0 && moduleCache.has(prefetchQueue[0].id)) {
    prefetchQueue.shift();
  }

  if (prefetchQueue.length === 0) {
    isPrefetching = false;
    return;
  }

  if (pinnedOnlyMode) {
    const nextId = prefetchQueue[0].id;
    if (!pinnedModulesList.includes(nextId)) {
      isPrefetching = false;
      return;
    }
  }

  const next = prefetchQueue.shift();
  if (!next) {
    isPrefetching = false;
    return;
  }

  next.importer()
    .then(mod => {
      moduleCache.set(next.id, mod);
      scheduleNextStep(250);
    })
    .catch(err => {
      console.warn(`[ModulePrefetcher] Failed to prefetch ${next.id}:`, err);
      // Re-enqueue at the tail so prefetchRemainingModules / preloadNow can still resolve it
      if (!moduleCache.has(next.id) && !prefetchQueue.some(item => item.id === next.id)) {
        prefetchQueue.push(next);
      }
      scheduleNextStep(300);
    });
};

export const startPrefetching = (pinnedModules: string[] = [], pinnedOnly = true): void => {
  pinnedModulesList = pinnedModules;
  pinnedOnlyMode = pinnedOnly;

  // Ensure any registered but unloaded modules are in the queue
  for (const [id, importer] of registeredImporters.entries()) {
    if (!moduleCache.has(id) && !prefetchQueue.some(item => item.id === id)) {
      prefetchQueue.push({ id, importer });
    }
  }

  if (prefetchQueue.length === 0) return;

  prefetchQueue.sort((a, b) => {
    const aPinned = pinnedModules.includes(a.id);
    const bPinned = pinnedModules.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  if (!isPrefetching) {
    isPrefetching = true;
    scheduleNextStep(120);
  }

  if (pinnedOnly) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      prefetchRemainingModules();
    }, 10000);
  }
};

export const prefetchRemainingModules = (): void => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  pinnedOnlyMode = false;
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;
  scheduleNextStep(100);
};

export const preloadNow = (id: string): void => {
  if (moduleCache.has(id)) return;
  const importer = registeredImporters.get(id);
  if (!importer) return;
  importer().then(mod => {
    moduleCache.set(id, mod);
  }).catch(err => {
    console.warn(`[ModulePrefetcher] preloadNow failed for ${id}:`, err);
  });
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
 * - If not cached → renders FallbackComponent (e.g. pixel-matched shimmer skeleton)
 *   while importing, then renders the component immediately on load.
 * - If no fallback provided, falls back to a transparent View (inherits screen bg).
 */
export const cacheAwareLazy = (
  id: string,
  importer: Importer,
  FallbackComponent?: ComponentType<any>
): ComponentType<any> => {
  // Register for background loading
  registerForPrefetch(id, importer);

  // Return a stable wrapper — created once, then returned from cache
  if (wrapperCache.has(id)) {
    return wrapperCache.get(id)!;
  }

  const Wrapper = (props: any) => {
    // If already in moduleCache (pre-fetched in background), initialize synchronously.
    // This is the key fix: the component renders on frame 1, zero blank screen.
    const [Comp, setComp] = useState<ComponentType<any> | null>(
      () => moduleCache.get(id)?.default ?? null
    );

    useEffect(() => {
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
      if (FallbackComponent) {
        return <FallbackComponent />;
      }
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
