/**
 * UpdateBanner GÇö ZenTrack Mobile
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
 *   4. "Update Now" calls Updates.reloadAsync() GÇö app restarts with new code
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
import { BlurView } from 'expo-blur';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';

const PURPLE = '#a599ff';
const PURPLE_DIM = 'rgba(165,153,255,0.12)';
const PURPLE_GLOW = 'rgba(165,153,255,0.3)';

// GöÇGöÇGöÇ Parse human-readable changelog from the EAS update message GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
function parseChangelog(message: string): string[] {
  if (!message) return ['System performance and stability improvements.'];

  // Clean up prefix tags
  const cleaned = message
    .replace(/^(fix|feat|chore|update|add|improve|ZEN-GPT):\s*/gi, '')
    .trim();

  // Split on common delimiters (dashes, bullets, semicolons, or sentence periods)
  const items = cleaned
    .split(/(?:\s*[-GÇó|;\n]+\s*|\.\s+)/)
    .map(s => s.trim().replace(/\.$/, ''))
    .filter(s => s.length > 3);

  if (items.length > 0) {
    return items.slice(0, 5).map(item => item.charAt(0).toUpperCase() + item.slice(1));
  }

  return [cleaned];
}

// GöÇGöÇGöÇ Component GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ

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
    <Modal transparent animationType="fade" visible={visible} onRequestClose={dismiss}>
      <BlurView intensity={30} tint="dark" style={styles.backdrop}>
        <Animated.View style={[styles.card, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Premium Mesh Gradient Background Orbs */}
          <Animated.View style={[styles.glowOrb, { opacity: glowOpacity }]} />
          <View style={styles.glowOrbSecondary} />

          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={32} color="#fff" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Update Ready G£¿</Text>
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
                ? <Text style={styles.updateBtnText}>RestartingGÇª</Text>
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
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(18, 18, 22, 0.85)',
    borderRadius: 28,
    padding: 24,
    paddingTop: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    top: -80,
    left: -20,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(165,153,255,0.25)',
  },
  glowOrbSecondary: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(88, 204, 255, 0.15)',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(165,153,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  changelogBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  changelogTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#a599ff',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  changelogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  changelogText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  updateBtn: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: '#a599ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  updateBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#000000',
    letterSpacing: 0.2,
  },
  laterBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  laterText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.5)',
  },
});
