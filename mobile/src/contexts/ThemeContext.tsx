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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light';

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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start dark — light mode is locked for now
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      // FORCE DARK MODE for now
      setMode('dark');
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const applyMode = useCallback(async (next: ThemeMode) => {
    setMode(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* silent — preference lost but app keeps working */ }
  }, []);

  const toggleTheme = useCallback(() => {
    // No-op while light mode is locked
    console.log('Light mode is currently locked.');
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    applyMode(next);
  }, [applyMode]);

  const value: ThemeContextType = useMemo(() => ({
    isDark: mode === 'dark',
    mode,
    colors: mode === 'dark' ? DARK_COLORS : LIGHT_COLORS,
    toggleTheme,
    setTheme,
  }), [mode, toggleTheme, setTheme]);

  // Render nothing until preference is loaded — prevents a one-frame dark→light flash.
  // In practice this is <10ms (AsyncStorage is fast on device).
  if (!loaded) return null;

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
    // Graceful fallback — screens outside ThemeProvider get dark colors
    return {
      isDark: true,
      mode: 'dark',
      colors: DARK_COLORS,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
