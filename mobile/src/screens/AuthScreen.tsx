import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Dimensions, Image, Platform, DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleAuthProvider, signInWithCredential, signInAnonymously } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import * as Haptics from 'expo-haptics';
import { RADIUS, FONT_FAMILY, FONT_SIZE, SHADOW, SPACE } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { updateL1Cache } from '../utils/bootManifest';
import TermsScreen from './TermsScreen';

// Web client ID from Google Cloud Console
const WEB_CLIENT_ID = '336719988763-a8l7noum7dapki5st6uoqvscnnlkid7e.apps.googleusercontent.com';

let GoogleSignin: any = null;
let statusCodes: any = {};
let isErrorWithCode: any = () => false;

try {
  const GSI = require('@react-native-google-signin/google-signin');
  GoogleSignin = GSI.GoogleSignin;
  statusCodes = GSI.statusCodes;
  isErrorWithCode = GSI.isErrorWithCode;

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
  });
} catch (e) {
  console.warn('Google Sign-In native module not found. It will not work in Expo Go.');
}

const GUARANTEES = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: '100% Local-First',
    desc: 'Encrypted on-device SQLite & LWW cache',
    colorDark: '#5EDA9E',
    colorLight: '#059669',
    bgDark: 'rgba(94,218,158,0.12)',
    bgLight: 'rgba(5,150,105,0.08)',
    borderDark: 'rgba(94,218,158,0.22)',
    borderLight: 'rgba(5,150,105,0.16)',
  },
  {
    icon: 'eye-off-outline' as const,
    title: 'Zero Telemetry',
    desc: 'Strict privacy with zero tracking or profiling',
    colorDark: '#A599FF',
    colorLight: '#6C5CE7',
    bgDark: 'rgba(165,153,255,0.12)',
    bgLight: 'rgba(108,92,231,0.08)',
    borderDark: 'rgba(165,153,255,0.22)',
    borderLight: 'rgba(108,92,231,0.16)',
  },
  {
    icon: 'cloud-done-outline' as const,
    title: 'Seamless Sync',
    desc: 'Instant cross-device cloud continuity',
    colorDark: '#38BDF8',
    colorLight: '#0284C7',
    bgDark: 'rgba(56,189,248,0.12)',
    bgLight: 'rgba(2,132,199,0.08)',
    borderDark: 'rgba(56,189,248,0.22)',
    borderLight: 'rgba(2,132,199,0.16)',
  },
];

const HORIZONTAL_MARGIN = 20;

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const skipBtnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!GoogleSignin) {
      alert('Google Sign-In requires a standalone APK or Dev Client. It does not work in Expo Go.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken; 
      
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        setError('No ID Token received. Check Google Cloud OAuth settings.');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('[AuthScreen] Google sign-in error:', error);
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          // User cancelled
        } else if (error.code === statusCodes.IN_PROGRESS) {
          setError('Sign in is already in progress.');
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services are missing or outdated.');
        } else {
          setError('Google sign-in was blocked or misconfigured.');
        }
      } else {
        setError('An unexpected error occurred during sign-in.');
      }
      setLoading(false);
    }
  };

  const lastSyncTapRef = useRef<number>(0);

  const handleSkipNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError('');
    setLoading(true);

    try {
      // Clear any prior onboarding completion flags so user always enters OnboardingScreen
      await AsyncStorage.multiRemove(['@zentrack_onboarding_completed', 'zentrack_onboarded_v2']);
      updateL1Cache('onboarded', false);
      DeviceEventEmitter.emit('reset_onboarding');

      // 1. Standard Firebase anonymous authentication
      await signInAnonymously(auth);
    } catch (e: any) {
      console.warn('[AuthScreen] Anonymous auth fallback:', e?.message);
      // 2. Failsafe: if Firebase anonymous auth is disabled or offline, create guest user
      try {
        const guestUid = `guest_${Date.now()}`;
        const guestUser = {
          uid: guestUid,
          isAnonymous: true,
          email: null,
          displayName: 'Guest User',
          getIdToken: async () => 'guest_token',
        } as any;

        updateL1Cache('optimisticUser', guestUser);
        updateL1Cache('onboarded', false);
        await AsyncStorage.setItem(
          '@zentrack_optimistic_user',
          JSON.stringify({
            uid: guestUid,
            email: null,
            displayName: 'Guest User',
          })
        );
        DeviceEventEmitter.emit('reset_onboarding');
        DeviceEventEmitter.emit('guest_sign_in', guestUser);
      } catch (fallbackErr: any) {
        console.error('[AuthScreen] Fallback guest sign-in error:', fallbackErr);
        setError('Could not skip sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeamlessSyncPress = () => {
    const now = Date.now();
    const DOUBLE_TAP_WINDOW = 500;
    if (now - lastSyncTapRef.current < DOUBLE_TAP_WINDOW) {
      // Double tap on Seamless Sync detected!
      lastSyncTapRef.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleSkipNow();
    } else {
      lastSyncTapRef.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const pressIn = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, tension: 100, friction: 8 }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();

  const skipPressIn = () => Animated.spring(skipBtnScale, { toValue: 0.97, useNativeDriver: true, tension: 100, friction: 8 }).start();
  const skipPressOut = () => Animated.spring(skipBtnScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Subtle Ambient Cosmic Violet Aura */}
      <LinearGradient
        colors={isDark ? ['rgba(165,153,255,0.07)', 'rgba(0,0,0,0)'] : ['rgba(108,92,231,0.05)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFillObject}
        locations={[0, 0.45]}
        pointerEvents="none"
      />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* ── Top Header (Matching Step 01 in LandingScreen) ─────────── */}
        <View style={styles.topHeader}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>ZENTRACK</Text>
          <Text style={[styles.step, { color: colors.textMuted }]}>02 / sign in</Text>
        </View>

        {/* ── Main Editorial Hero Block ───────────────────────────────── */}
        <View style={styles.mainBlock}>
          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>Let's get you</Text>
            <Text style={[styles.heroTitleBold, { color: colors.textPrimary }]}>set up.</Text>
          </View>

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Connect your account to enable encrypted cross-device continuity, offline persistence, and seamless sync.
          </Text>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.error} style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Clean Apple-Style Feature Highlight Card */}
          <View
            style={[
              styles.specCard,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                backgroundColor: isDark ? '#10121A' : '#FFFFFF',
              },
            ]}
          >
            {GUARANTEES.map((item, index) => {
              const iconColor = isDark ? item.colorDark : item.colorLight;
              const iconBg = isDark ? item.bgDark : item.bgLight;
              const isSeamlessSync = item.title === 'Seamless Sync';

              return (
                <View key={item.title}>
                  <TouchableOpacity
                    activeOpacity={isSeamlessSync ? 0.7 : 1}
                    onPress={isSeamlessSync ? handleSeamlessSyncPress : undefined}
                    disabled={!isSeamlessSync || loading}
                    style={styles.specRow}
                  >
                    <View style={[styles.specIconBox, { backgroundColor: iconBg, borderColor: isDark ? item.borderDark : item.borderLight }]}>
                      <Ionicons name={item.icon} size={18} color={iconColor} />
                    </View>
                    <View style={styles.specTextCol}>
                      <Text style={[styles.specLabel, { color: colors.textPrimary }]}>{item.title}</Text>
                      <Text style={[styles.specValue, { color: colors.textSecondary }]}>{item.desc}</Text>
                    </View>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={iconColor}
                      style={styles.checkIcon}
                    />
                  </TouchableOpacity>
                  {index < GUARANTEES.length - 1 && (
                    <View
                      style={[
                        styles.specDivider,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Bottom Actions (Matching LandingScreen Primary Layout) ──── */}
        <View style={styles.bottomBlock}>
          
          {/* Primary Google Auth Button */}
          <TouchableOpacity
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.9}
            style={styles.btnContainer}
          >
            <Animated.View style={[
              styles.googleBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
                borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
                transform: [{ scale: btnScale }]
              },
              loading && { opacity: 0.6 }
            ]}>
              {loading ? (
                <ActivityIndicator color={isDark ? '#0A0A0E' : '#FFFFFF'} />
              ) : (
                <View style={styles.btnInnerRow}>
                  <Ionicons name="logo-google" size={17} color={isDark ? '#0A0A0E' : '#FFFFFF'} style={{ marginRight: 8 }} />
                  <Text style={[styles.googleBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>Continue with Google</Text>
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>

          {/* Apple Sign-In (iOS only) */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={22}
              style={styles.appleBtn}
              onPress={async () => {
                try {
                  const credential = await AppleAuthentication.signInAsync({
                    requestedScopes: [
                      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                      AppleAuthentication.AppleAuthenticationScope.EMAIL,
                    ],
                  });
                  console.log('Apple Sign In success', credential.user);
                } catch (e: any) {
                  if (e.code !== 'ERR_REQUEST_CANCELED') setError('Apple sign-in failed.');
                }
              }}
            />
          )}

          {/* Skip for Now Button */}
          <TouchableOpacity
            onPressIn={skipPressIn}
            onPressOut={skipPressOut}
            style={styles.skipBtnContainer}
            onPress={handleSkipNow}
            disabled={loading}
            activeOpacity={0.88}
          >
            <Animated.View
              style={[
                styles.skipBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)',
                  transform: [{ scale: skipBtnScale }],
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <View style={styles.skipBtnInner}>
                  <Text style={[styles.skipBtnText, { color: colors.textPrimary }]}>
                    Skip for now
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={colors.textSecondary}
                    style={{ marginLeft: 6 }}
                  />
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>

          {/* Terms & Privacy Footnote */}
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.linkText, { color: colors.textPrimary }]} onPress={() => setShowTerms(true)}>
              Terms of Service & Privacy Policy
            </Text>
          </Text>

        </View>

      </Animated.View>

      <TermsScreen visible={showTerms} onClose={() => setShowTerms(false)} />
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_MARGIN,
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 20,
  },
  topHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    letterSpacing: 2,
  },
  step: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    letterSpacing: 1,
  },
  mainBlock: {
    justifyContent: 'center',
    marginVertical: 4,
  },
  heroTextContainer: {
    marginBottom: 6,
    overflow: 'visible',
  },
  heroTitleItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 44,
    lineHeight: 52,
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 4,
    marginLeft: -16,
  },
  heroTitleBold: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 20,
    opacity: 0.85,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,105,97,0.12)' : 'rgba(220,38,38,0.10)',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,105,97,0.3)' : 'rgba(220,38,38,0.25)',
    marginBottom: 16,
  },
  errorText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.error,
    flex: 1,
  },
  specCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  specIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
  },
  specTextCol: {
    flex: 1,
    marginRight: 10,
  },
  specLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  specValue: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
    opacity: 0.8,
  },
  checkIcon: {
    opacity: 0.85,
  },
  specDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  bottomBlock: {
    width: '100%',
    alignItems: 'center',
  },
  btnContainer: {
    width: '100%',
    marginBottom: 10,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    height: 54,
    width: '100%',
    borderWidth: 1,
    ...SHADOW.sm,
  },
  btnInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },
  appleBtn: {
    width: '100%',
    height: 54,
    marginBottom: 10,
  },
  skipBtnContainer: {
    width: '100%',
    marginBottom: 12,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    height: 50,
    width: '100%',
    borderWidth: 1,
  },
  skipBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
    letterSpacing: 0.2,
  },
  legalText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    opacity: 0.65,
  },
  linkText: {
    fontFamily: FONT_FAMILY.bold,
    textDecorationLine: 'underline',
  },
});

