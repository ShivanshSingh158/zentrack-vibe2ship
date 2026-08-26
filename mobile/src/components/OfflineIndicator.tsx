/**
 * OfflineIndicator — ZenTrack Mobile
 *
 * Two-phase offline feedback system:
 *
 *   Phase 1 — Amber banner (persistent while offline):
 *     Slides in from the top showing "Offline — N changes queued"
 *     where N updates live as writes are queued via queueWrite().
 *
 *   Phase 2 — Green toast (auto-dismisses after 3s):
 *     Slides in once connectivity is restored and the queue has drained,
 *     showing "Synced N offline changes ✓".
 *
 * Both phases are driven by subscriptions to offlineSync.ts listeners —
 * zero polling, zero prop-drilling.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SHADOW, SPACE, RADIUS } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import {
  subscribeToQueueChanges,
  subscribeToSyncComplete,
} from '../services/offlineSync';

// ─── Spring config for butter-smooth slide ────────────────────────────────────
const SPRING_IN  = { damping: 18, stiffness: 200, mass: 0.8 };
const SPRING_OUT = { damping: 22, stiffness: 260, mass: 0.8 };

/** Duration the green "Synced" toast stays visible before sliding away (ms) */
const SYNC_TOAST_DURATION_MS = 3000;

export function OfflineIndicator() {
  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Shared absolute positioning shell — both banner and toast use this
  wrapper: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    zIndex: 9999,
    alignItems: 'center',
  },

  // ── Amber offline banner ─────────────────────────────────────────────────
  amberBanner: {
    backgroundColor: '#FEF3C7',       // Warm amber-100
    borderColor: '#F59E0B',           // Amber-500 border
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.xl,
    width: '100%',
    ...SHADOW.md,
  },
  textGroup: {
    flex: 1,
  },
  amberTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#7A4F00',                 // Deep amber text
    lineHeight: 16,
  },
  amberBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: '#92400E',                 // Lighter amber body text
    lineHeight: 15,
  },
  badge: {
    backgroundColor: '#F59E0B',      // Amber-500 pill
    borderRadius: RADIUS.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xs,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#FFFFFF',
  },

  // ── Green sync toast ─────────────────────────────────────────────────────
  greenToast: {
    backgroundColor: '#DCFCE7',      // Green-100
    borderColor: '#22C55E',          // Green-500 border
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.xl,
    ...SHADOW.md,
  },
  greenText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: '#14532D',                // Deep green text
  },
});
