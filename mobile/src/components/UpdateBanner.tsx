/**
 * UpdateBanner — ZenTrack Mobile
 *
 * Checks for OTA (over-the-air) updates via expo-updates on every app open.
 * If a new update is available, shows a beautiful full-screen-ish modal with:
 *   - What changed (parsed from the update message)
 *   - A glowing "Update Now" button that reloads the app immediately
 *   - A "Later" option so the user isn't forced
 *
 * HOW IT WORKS:
 *   1. On mount, calls Updates.checkForUpdateAsync()
 *   2. If update found, calls Updates.fetchUpdateAsync() to download it silently
 *   3. Shows the banner with the update message
 *   4. "Update Now" calls Updates.reloadAsync() — app restarts with new code
 *
 * NOTE: expo-updates only works in production builds (EAS), not in Expo Go.
 *       In Expo Go / dev builds, this component silently does nothing.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';

const PURPLE = '#a599ff';
const PURPLE_DIM = 'rgba(165,153,255,0.12)';
const PURPLE_GLOW = 'rgba(165,153,255,0.3)';

// ─── Parse human-readable changelog from the EAS update message ───────────────
function parseChangelog(message: string): string[] {
  if (!message) return ['Improvements and bug fixes.'];

  // Split on common delimiters
  const raw = message
    .replace(/^(fix|feat|chore|update|add|improve):/gi, '')
    .split(/[,;\n|·•]+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);

  return raw.length > 0 ? raw.slice(0, 6) : [message.trim()];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [changelog, setChangelog] = useState<string[]>([]);
  const [isReloading, setIsReloading] = useState(false);

  // Animations
  const slideAnim = useRef(new Animated.Value(80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    // Only runs in production builds — silently skips in Expo Go / dev
    if (__DEV__) return;

    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;

      // Download silently in background while user uses the app
      await Updates.fetchUpdateAsync();

      // Read the --message string passed during `eas update --message "..."`
      // expo-updates v29: message lives at Updates.manifest.metadata.message
      const manifest = Updates.manifest as any;
      const message: string =
        manifest?.metadata?.message ||
        manifest?.extra?.expoClient?.description ||
        manifest?.description ||
        'Improvements and bug fixes.';

      setChangelog(parseChangelog(message));
      showBanner();
    } catch {
      // Never block the user — silently skip if any step fails
    }
  };

  const showBanner = () => {
    setVisible(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0, tension: 60, friction: 9,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow pulse on the icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Button pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  };

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 80, duration: 250, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  const applyUpdate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setIsReloading(false);
    }
  };

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] });

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Glow orb behind icon */}
          <Animated.View style={[styles.glowOrb, { opacity: glowOpacity }]} />

          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={28} color="#fff" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Ready ✨</Text>
          <Text style={styles.subtitle}>A new version of ZenTrack has been downloaded and is ready to install.</Text>

          {/* Changelog */}
          <View style={styles.changelogBox}>
            <Text style={styles.changelogTitle}>WHAT'S NEW</Text>
            {changelog.map((item, i) => (
              <View key={i} style={styles.changelogRow}>
                <Ionicons name="checkmark-circle" size={15} color={PURPLE} style={{ marginTop: 1 }} />
                <Text style={styles.changelogText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Buttons */}
          <Animated.View style={{ width: '100%', transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.updateBtn, isReloading && { opacity: 0.7 }]}
              onPress={applyUpdate}
              disabled={isReloading}
              activeOpacity={0.85}
            >
              {isReloading
                ? <Text style={styles.updateBtnText}>Restarting…</Text>
                : <>
                    <Ionicons name="refresh-circle" size={20} color="#fff" />
                    <Text style={styles.updateBtnText}>Update Now</Text>
                  </>
              }
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity onPress={dismiss} style={styles.laterBtn} activeOpacity={0.7}>
            <Text style={styles.laterText}>Remind me later</Text>
          </TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,5,9,0.85)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    backgroundColor: '#0f0d1a',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 20,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    top: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: PURPLE_GLOW,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  changelogBox: {
    width: '100%',
    backgroundColor: PURPLE_DIM,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.15)',
  },
  changelogTitle: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: PURPLE,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  changelogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  changelogText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 20,
  },
  updateBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  updateBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    letterSpacing: 0.2,
  },
  laterBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  laterText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },
});
