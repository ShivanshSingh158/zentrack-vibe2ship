import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Dimensions, Image, Platform,
  DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleAuthProvider, signInWithCredential, signInAnonymously } from 'firebase/auth';
import { auth } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  { icon: 'shield-checkmark', title: '100% Local-First', desc: 'Encrypted device database' },
  { icon: 'eye-off', title: 'Zero Telemetry', desc: 'No tracking or data sales' },
  { icon: 'cloud-done', title: 'Seamless Sync', desc: 'Instant multi-device bridge' },
];

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [loading, setLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSkip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkipLoading(true);
    try {
      await AsyncStorage.multiRemove([
        '@zentrack_onboarding_completed',
        'zentrack_onboarded_v2',
        '@zentrack_onboarded_v2',
        '@zentrack_optimistic_user',
      ]);
      updateL1Cache('onboarded', false);
      DeviceEventEmitter.emit('reset_onboarding');
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (e) {
      setSkipLoading(false);
    }
  };

  const handleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!GoogleSignin) {
      alert('Google Sign-In requires a standalone APK or Dev Client. It does not work in Expo Go. Please use "Skip for now" instead.');
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

  const pressIn = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
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
            Sara's ready whenever you are. Connect your account to enable encrypted cross-device continuity.
          </Text>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Subtle Security & Privacy Card */}
          <View style={[styles.specCard, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)' }]}>
            {GUARANTEES.map((item, index) => (
              <View key={item.title}>
                <View style={styles.specRow}>
                  <Ionicons name={item.icon as any} size={14} color={colors.accentPrimary} style={{ marginRight: 10 }} />
                  <Text style={[styles.specLabel, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.specValue, { color: colors.textMuted }]}>{item.desc}</Text>
                </View>
                {index < GUARANTEES.length - 1 && (
                  <View style={[styles.specDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} />
                )}
              </View>
            ))}
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
              cornerRadius={RADIUS.lg}
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

          {/* Terms & Privacy Footnote */}
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.linkText, { color: colors.textPrimary }]} onPress={() => setShowTerms(true)}>
              Terms of Service & Privacy Policy
            </Text>
          </Text>

          {/* Skip for now */}
          <TouchableOpacity onPress={handleSkip} disabled={skipLoading} style={styles.skipBtn} activeOpacity={0.7}>
            {skipLoading ? (
              <ActivityIndicator color={colors.textMuted} size="small" />
            ) : (
              <Text style={[styles.skipText, { color: colors.textMuted }]}>
                Skip for now  →
              </Text>
            )}
          </TouchableOpacity>

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
    paddingHorizontal: 5,
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 20,
  },
  topHeader: {
    marginTop: 8,
    paddingHorizontal: 6,
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
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 16,
  },
  heroTextContainer: {
    marginBottom: 12,
  },
  heroTitleItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 46,
    lineHeight: 52,
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 2,
  },
  heroTitleBold: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.5,
    paddingLeft: 4,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 4,
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
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: '100%',
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  specLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    flex: 1,
  },
  specValue: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
  },
  specDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  bottomBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  btnContainer: {
    width: '100%',
    marginBottom: 10,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
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
    height: 52,
    marginBottom: 10,
  },
  legalText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    opacity: 0.7,
  },
  linkText: {
    fontFamily: FONT_FAMILY.bold,
    textDecorationLine: 'underline',
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    letterSpacing: 0.3,
    opacity: 0.7,
  },
});
