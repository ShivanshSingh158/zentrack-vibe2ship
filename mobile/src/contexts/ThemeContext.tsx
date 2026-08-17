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
  const [mode, setMode] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() || 'light');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount — defaults to system default of the user's phone
  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setMode(savedTheme as ThemeMode);
        } else {
          setMode('system');
        }
      } catch {
        setMode('system');
      } finally {
        setLoaded(true);
      }
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

  // Render nothing until preference is loaded — prevents a one-frame dark→light flash.
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
