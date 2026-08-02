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
  if (!message) return ['System performance and stability improvements.'];

  // Clean up prefix tags
  const cleaned = message
    .replace(/^(fix|feat|chore|update|add|improve|ZEN-GPT):\s*/gi, '')
    .trim();

  // Split on common delimiters (dashes, bullets, semicolons, or sentence periods)
  const items = cleaned
    .split(/(?:\s*[-•|;\n]+\s*|\.\s+)/)
    .map(s => s.trim().replace(/\.$/, ''))
    .filter(s => s.length > 3);

  if (items.length > 0) {
    return items.slice(0, 5).map(item => item.charAt(0).toUpperCase() + item.slice(1));
  }

  return [cleaned];
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
    if (__DEV__ || !Updates.isEnabled) {
      console.log('[Updates] Development mode or updates disabled. Skipping OTA check.');
      return;
    }

    try {
      console.log('[Updates] Checking for OTA updates...');
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        console.log('[Updates] App is already up to date.');
        return;
      }

      console.log('[Updates] New update found. Downloading...');
      const fetchedUpdate = await Updates.fetchUpdateAsync();

      // Read the --message string passed during `eas update --message "..."`
      const manifest = (fetchedUpdate as any)?.manifest || (Updates.manifest as any);
      const message: string =
        manifest?.metadata?.message ||
        manifest?.extra?.expoClient?.description ||
        manifest?.description ||
        'System performance and stability improvements.';

      console.log('[Updates] Downloaded update message:', message);
      setChangelog(parseChangelog(message));
      showBanner();
    } catch (err: any) {
      console.warn('[Updates] Failed to check/fetch update:', err?.message || err);
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

    // FIX: On Android, calling reloadAsync() while a <Modal> is open can cause a 
    // grey screen / crash because the native window manager fails to destroy the surface.
    // We must animate out and unmount the Modal FIRST.
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 80, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false); // Unmounts the Modal

      // Give React Native a moment to detach the Modal from the native hierarchy
      setTimeout(async () => {
        try {
          await Updates.reloadAsync();
        } catch {
          setIsReloading(false);
        }
      }, 200);
    });
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#121214',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#26262a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 15,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(165,153,255,0.15)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  changelogBox: {
    width: '100%',
    backgroundColor: '#1a1a1e',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#26262a',
  },
  changelogTitle: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#a599ff',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  changelogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  changelogText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#e5e5ea',
    lineHeight: 18,
  },
  updateBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#a599ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  updateBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#000000',
    letterSpacing: 0.1,
  },
  laterBtn: {
    marginTop: 14,
    paddingVertical: 6,
  },
  laterText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#8e8e93',
  },
});
