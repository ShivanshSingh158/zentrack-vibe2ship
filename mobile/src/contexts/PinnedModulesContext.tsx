import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { getBootManifestSync, updateL1Cache } from '../utils/bootManifest';
import { safeWrite } from '../utils/safeWrite';

const DEFAULT_PINNED_MODULES = ['Tasks', 'Calendar', 'Attendance', 'Notes'];
const PRUNED_MODULES = new Set(['Gym', 'Habits', 'Analytics', 'Assignments']);

export function sanitizePinnedModules(mods: string[]): string[] {
  if (!Array.isArray(mods)) return DEFAULT_PINNED_MODULES;
  const filtered = mods.filter(m => typeof m === 'string' && m.trim().length > 0 && !PRUNED_MODULES.has(m));
  return filtered.length > 0 ? filtered.slice(0, 4) : DEFAULT_PINNED_MODULES;
}

export interface PinnedModulesContextType {
  pinnedModules: string[];
  setPinnedModules: (mods: string[]) => void;
  hydratePinnedModulesFromRemote: (mods: string[]) => void;
}

const PinnedModulesContext = createContext<PinnedModulesContextType>({
  pinnedModules: DEFAULT_PINNED_MODULES,
  setPinnedModules: () => {},
  hydratePinnedModulesFromRemote: () => {},
});

export function PinnedModulesProvider({ children }: { children: React.ReactNode }) {
  const initialManifest = getBootManifestSync();
  const [pinnedModules, setPinnedModulesState] = useState<string[]>(
    initialManifest?.pinnedModules && initialManifest.pinnedModules.length > 0
      ? sanitizePinnedModules(initialManifest.pinnedModules)
      : DEFAULT_PINNED_MODULES
  );
  const pinnedModulesRef = React.useRef(pinnedModules);
  pinnedModulesRef.current = pinnedModules;

  // Hydration & external event listener
  useEffect(() => {
    let cancelled = false;

    // 1. AsyncStorage fallback if manifest was empty on frame 0
    if (!initialManifest?.pinnedModules || initialManifest.pinnedModules.length === 0) {
      AsyncStorage.getItem('@zentrack_pinned_modules')
        .then((raw) => {
          if (cancelled || !raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const clamped = sanitizePinnedModules(parsed);
              setPinnedModulesState(clamped);
              updateL1Cache('pinnedModules', clamped);
            }
          } catch {}
        })
        .catch(() => {});
    }

    // 2. Global cross-component event listener (e.g. from Firestore sync or external setters)
    const sub = DeviceEventEmitter.addListener('pinned_modules_changed', (newMods: string[]) => {
      if (!cancelled && Array.isArray(newMods) && newMods.length > 0) {
        const clamped = sanitizePinnedModules(newMods);
        setPinnedModulesState(clamped);
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Hydrates pinned modules from remote Firestore without writing back (breaks infinite ping-pong)
  const hydratePinnedModulesFromRemote = useCallback((mods: string[]) => {
    const clamped = sanitizePinnedModules(mods);
    if (clamped.join(',') === pinnedModulesRef.current.join(',')) return;
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(clamped)).catch(() => {});
    DeviceEventEmitter.emit('pinned_modules_changed', clamped);
  }, []);

  // User manually edits pinned modules in Settings -> writes to local and cloud
  const setPinnedModules = useCallback((mods: string[]) => {
    const clamped = sanitizePinnedModules(mods);
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(clamped)).catch(console.warn);
    DeviceEventEmitter.emit('pinned_modules_changed', clamped);

    if (auth.currentUser?.uid) {
      const uid = auth.currentUser.uid;
      const payload = { pinnedModules: clamped, updatedAt: Date.now() };
      safeWrite(
        () => setDoc(doc(db, COLLECTION.USER_PROFILES, uid), payload, { merge: true }),
        COLLECTION.USER_PROFILES,
        'set',
        payload,
        uid
      ).catch(() => {});
    }
  }, []);

  const value = useMemo(
    () => ({
      pinnedModules,
      setPinnedModules,
      hydratePinnedModulesFromRemote,
    }),
    [pinnedModules, setPinnedModules, hydratePinnedModulesFromRemote]
  );

  return (
    <PinnedModulesContext.Provider value={value}>
      {children}
    </PinnedModulesContext.Provider>
  );
}

/**
 * Fine-grained hook for components that only care about bottom navigation pinned tabs.
 * Subscribing to this hook guarantees that task, habit, or other domain changes
 * will NEVER cause the component to re-render.
 */
export function usePinnedModules() {
  return useContext(PinnedModulesContext);
}
