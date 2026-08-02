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
  const { colors } = useTheme();
  const insets      = useSafeAreaInsets();

  // ── Connectivity state ───────────────────────────────────────────────────
  const [isOffline,   setIsOffline]   = useState(false);
  const [queueCount,  setQueueCount]  = useState(0);

  // ── Sync-toast state ─────────────────────────────────────────────────────
  const [syncedCount,    setSyncedCount]    = useState(0);
  const [showSyncToast,  setShowSyncToast]  = useState(false);
  const syncToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reanimated shared values ─────────────────────────────────────────────
  // Both banner and toast start off-screen above the status bar.
  const bannerY   = useSharedValue(-120);
  const toastY    = useSharedValue(-120);
  // Opacity for the toast so it can also fade out
  const toastOpacity = useSharedValue(0);

  // The Y position we animate TO when visible — just below the safe-area top
  const visibleY = Math.max(insets.top, 8) + 8;

  // ── Network subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false);
    });
    // Fetch current state immediately (NetInfo doesn't fire synchronously)
    NetInfo.fetch().then(state => setIsOffline(state.isConnected === false));
    return () => unsub();
  }, []);

  // ── Offline queue-count subscription ─────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToQueueChanges(count => {
      setQueueCount(count);
    });
    return unsub;
  }, []);

  // ── Sync-complete subscription ────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToSyncComplete(count => {
      if (count <= 0) return;
      setSyncedCount(count);
      setShowSyncToast(true);

      // Auto-dismiss after SYNC_TOAST_DURATION_MS
      if (syncToastTimer.current) clearTimeout(syncToastTimer.current);
      syncToastTimer.current = setTimeout(() => {
        setShowSyncToast(false);
      }, SYNC_TOAST_DURATION_MS);
    });
    return () => {
      unsub();
      if (syncToastTimer.current) clearTimeout(syncToastTimer.current);
    };
  }, []);

  // ── Amber banner animation ────────────────────────────────────────────────
  useEffect(() => {
    if (isOffline) {
      bannerY.value = withSpring(visibleY, SPRING_IN);
    } else {
      bannerY.value = withSpring(-120, SPRING_OUT);
    }
  }, [isOffline, visibleY]);

  // ── Green toast animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (showSyncToast) {
      toastY.value      = withSpring(visibleY, SPRING_IN);
      toastOpacity.value = withTiming(1, { duration: 200 });
    } else {
      toastOpacity.value = withTiming(0, { duration: 250 });
      toastY.value       = withSpring(-120, SPRING_OUT);
    }
  }, [showSyncToast, visibleY]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
  }));

  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toastY.value }],
    opacity: toastOpacity.value,
  }));

  // ── Queue label ───────────────────────────────────────────────────────────
  const queueLabel =
    queueCount === 0
      ? 'Offline — changes saved locally'
      : queueCount === 1
      ? 'Offline — 1 change queued'
      : `Offline — ${queueCount} changes queued`;

  const syncLabel =
    syncedCount === 1
      ? 'Synced 1 offline change ✓'
      : `Synced ${syncedCount} offline changes ✓`;

  return (
    <>
      {/* ── Phase 1: Persistent Amber Offline Banner ── */}
      <Animated.View
        style={[styles.wrapper, bannerStyle]}
        pointerEvents="none"
      >
        <View style={styles.amberBanner}>
          <Ionicons name="cloud-offline-outline" size={15} color="#7A4F00" />
          <View style={styles.textGroup}>
            <Text style={styles.amberTitle}>No Connection</Text>
            <Text style={styles.amberBody}>{queueLabel}</Text>
          </View>
          {queueCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{queueCount}</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Phase 2: Auto-dismissing Green Sync Toast ── */}
      <Animated.View
        style={[styles.wrapper, toastStyle]}
        pointerEvents="none"
      >
        <View style={styles.greenToast}>
          <Ionicons name="checkmark-circle" size={16} color="#1A5C38" />
          <Text style={styles.greenText}>{syncLabel}</Text>
        </View>
      </Animated.View>
    </>
  );
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
