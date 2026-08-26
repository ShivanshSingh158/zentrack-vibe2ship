/**
 * ThemeContext — ZenTrack Mobile
 *
 * Provides: isDark, colors (active palette), toggleTheme()
 *
 * Usage:
 *   import { useTheme } from '../contexts/ThemeContext';
 *   const { colors, isDark, toggleTheme } = useTheme();
 *
 * Theme is persisted to AsyncStorage key '@zentrack_theme'.
 * Defaults to 'dark' (Obsidian Cosmos).
 *
 * BACKWARDS COMPAT:
 *   Screens that still import COLORS from tokens.ts continue to get
 *   the dark palette — no breaking changes. Only theme-aware components
 *   call useTheme().colors to get the live active palette.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance, ColorSchemeName, Platform, StatusBar as RNStatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../theme/tokens';
import { getBootManifestSync } from '../utils/bootManifest';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light' | 'system';

// The active color palette type (same shape as DARK_COLORS / LIGHT_COLORS)
export type AppColors = typeof DARK_COLORS;

export interface ThemeContextType {
  isDark: boolean;
  mode: ThemeMode;
  colors: AppColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_STORAGE_KEY = '@zentrack_theme';
const THEME_INITIAL_LIGHT_APPLIED_KEY = '@zentrack_light_default_applied_v1';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // INSTAGRAM/WHATSAPP ARCHITECTURE — SYNCHRONOUS SEED:
  // AppNavigator.tsx fires loadBootManifest() at module-level (before React renders).
  // By the time ThemeProvider mounts, getBootManifestSync() returns the L1 cache.
  // If themeMode is cached, seed synchronously → loaded=true on Frame 0.
  // No null-return, no tree unmount, no 15-50ms freeze while AsyncStorage reads.
  const _sync = getBootManifestSync();
  const syncMode: ThemeMode | null = _sync?.themeMode ?? null;

  // Default to 'dark' (primary app theme) — avoids 'system' OS query on Frame 0.
  // When no cache is present (cold install), Frame 0 renders in dark mode.
  // The async effect below reads the persisted preference and corrects it if needed.
  const [mode, setMode] = useState<ThemeMode>(syncMode ?? 'dark');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() || 'dark');

  // Background correction: read AsyncStorage to sync the persisted preference.
  // This runs on Frame 1 (non-blocking). If the user chose light or system mode,
  // this corrects the 'dark' default without causing a tree unmount.
  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setMode(savedTheme as ThemeMode);
        }
      } catch { /* silent — default dark is fine */ }
    })();
  }, []);

  // Listen to OS system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const applyMode = useCallback(async (next: ThemeMode) => {
    setMode(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* silent — preference lost but app keeps working */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    applyMode(next);
  }, [applyMode]);

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return systemScheme === 'dark';
    }
    return mode === 'dark';
  }, [mode, systemScheme]);

  // Synchronize OS status bar text/icons (Black in Light Mode, White in Dark Mode)
  useEffect(() => {
    RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    if (Platform.OS === 'android') {
      RNStatusBar.setBackgroundColor(isDark ? DARK_COLORS.background : LIGHT_COLORS.background, true);
    }
  }, [isDark]);

  const value: ThemeContextType = useMemo(() => ({
    isDark,
    mode,
    colors: isDark ? DARK_COLORS : LIGHT_COLORS,
    toggleTheme,
    setTheme,
  }), [isDark, mode, toggleTheme, setTheme]);

  // NOTE: No null-return here. We default to 'dark' synchronously on Frame 0.
  // The async effect above corrects the mode if the user chose light/system.
  // A one-frame dark→light adjustment is far less disruptive than blocking the
  // entire tree (which caused a 15-50ms freeze and a NavigationContainer cold-mount).

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback — screens outside ThemeProvider get light colors by default
    return {
      isDark: false,
      mode: 'light',
      colors: LIGHT_COLORS,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
