import React, { ComponentType, lazy } from 'react';
import { InteractionManager, View } from 'react-native';

// In-memory cache registry
const moduleCache = new Map<string, { default: ComponentType<any> }>();

// Map of already created lazy components to avoid re-creating them
const lazyComponents = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

// Definition of a lazy importer
type Importer = () => Promise<{ default: ComponentType<any> }>;

// Queue of modules to prefetch
const prefetchQueue: { id: string; importer: Importer }[] = [];
let isPrefetching = false;

/**
 * Registers a module for background prefetching.
 * Does not start the prefetch process.
 */
const registerForPrefetch = (id: string, importer: Importer) => {
  if (!moduleCache.has(id) && !prefetchQueue.some(item => item.id === id)) {
    prefetchQueue.push({ id, importer });
  }
};

/**
 * Starts the background prefetch queue.
 * Should be called after critical startup tasks are complete.
 */
export const startPrefetching = (pinnedModules: string[] = []) => {
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;

  // Prioritize pinned modules: move them to the front of the queue
  prefetchQueue.sort((a, b) => {
    const aPinned = pinnedModules.includes(a.id);
    const bPinned = pinnedModules.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  InteractionManager.runAfterInteractions(() => {
    processNext();
  });
};

const processNext = () => {
  if (prefetchQueue.length === 0) {
    isPrefetching = false;
    return;
  }

  const nextModule = prefetchQueue.shift();
  if (!nextModule) return;

  // Small delay to ensure we don't block the UI thread during rapid module imports
  requestAnimationFrame(() => {
    // We only import if it hasn't been cached yet (it might have been loaded actively by the user)
    if (!moduleCache.has(nextModule.id)) {
      nextModule.importer().then((mod) => {
        moduleCache.set(nextModule.id, mod);
        // Process next module on next idle frame
        requestAnimationFrame(processNext);
      }).catch(err => {
        console.warn(`[ModulePrefetcher] Failed to prefetch module ${nextModule.id}`, err);
        // Continue even if one fails
        requestAnimationFrame(processNext);
      });
    } else {
      processNext();
    }
  });
};

/**
 * A cache-aware wrapper around React.lazy.
 * If the module is already in the cache, it renders a standard component synchronously.
 * Otherwise, it falls back to a state-based loading mechanism without triggering Suspense.
 */
export const cacheAwareLazy = (id: string, importer: Importer) => {
  // Register it for the background queue
  registerForPrefetch(id, importer);

  return (props: any) => {
    // Initialize state synchronously so if it's cached, it renders on frame 1
    const [Comp, setComp] = React.useState<ComponentType<any> | null>(() => {
      return moduleCache.has(id) ? moduleCache.get(id)!.default : null;
    });

    React.useEffect(() => {
      if (!Comp) {
        importer().then(mod => {
          moduleCache.set(id, mod);
          // Use a function callback to set state in case the component itself is a function
          setComp(() => mod.default);
        }).catch(err => {
          console.warn(`[cacheAwareLazy] Failed to load module ${id}`, err);
        });
      }
    }, [Comp]);

    if (!Comp) {
      return <View style={{ flex: 1, backgroundColor: '#0a090c' }} />;
    }

    return <Comp {...props} />;
  };
};
