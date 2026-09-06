import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { getBootManifestSync, updateL1Cache } from '../utils/bootManifest';

const DEFAULT_PINNED_MODULES = ['Tasks', 'Gym', 'Calendar', 'Attendance'];

export interface PinnedModulesContextType {
  pinnedModules: string[];
  setPinnedModules: (mods: string[]) => void;
}

const PinnedModulesContext = createContext<PinnedModulesContextType>({
  pinnedModules: DEFAULT_PINNED_MODULES,
  setPinnedModules: () => {},
});

export function PinnedModulesProvider({ children }: { children: React.ReactNode }) {
  const initialManifest = getBootManifestSync();
  const [pinnedModules, setPinnedModulesState] = useState<string[]>(
    initialManifest?.pinnedModules && initialManifest.pinnedModules.length > 0
      ? initialManifest.pinnedModules
      : DEFAULT_PINNED_MODULES
  );

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
              const clamped = parsed.slice(0, 4);
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
        setPinnedModulesState(newMods.slice(0, 4));
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const setPinnedModules = useCallback((mods: string[]) => {
    const clamped = mods.length > 0 ? mods.slice(0, 4) : DEFAULT_PINNED_MODULES;
    setPinnedModulesState(clamped);
    updateL1Cache('pinnedModules', clamped);
    AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(clamped)).catch(console.warn);
    DeviceEventEmitter.emit('pinned_modules_changed', clamped);

    if (auth.currentUser?.uid) {
      setDoc(
        doc(db, COLLECTION.USER_PROFILES, auth.currentUser.uid),
        { pinnedModules: clamped },
        { merge: true }
      ).catch(() => {});
    }
  }, []);

  const value = useMemo(
    () => ({
      pinnedModules,
      setPinnedModules,
    }),
    [pinnedModules, setPinnedModules]
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
