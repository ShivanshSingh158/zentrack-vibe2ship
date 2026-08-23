import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Dimensions, Image, Platform
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleAuthProvider, signInWithCredential, signInAnonymously } from 'firebase/auth';
import { auth } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RADIUS, FONT_FAMILY, FONT_SIZE, SHADOW, SPACE } from '../theme/tokens';
import { useTheme } from "../contexts/ThemeContext";
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

export default function AuthScreen() {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [loading, setLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);

  const handleSkip = async () => {
    setSkipLoading(true);
    try {
      await AsyncStorage.multiRemove(['@zentrack_onboarding_completed', 'zentrack_onboarded_v2']);
      await signInAnonymously(auth);
    } catch (e) {
      setSkipLoading(false);
    }
  };

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const orbScale = useRef(new Animated.Value(0.8)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  // Animations

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      Animated.spring(orbScale, { toValue: 1, tension: 40, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // Pulse animation for orb
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleSignIn = async () => {
    if (!GoogleSignin) {
      alert('Google Sign-In requires a standalone APK or Dev Client. It does not work in Expo Go. Please use "Try Demo Mode" instead.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      // Handle v12+ and older response structures
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken; 
      
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        // Will unmount automatically via onAuthStateChanged
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

  const pressIn = () => Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* Top Header */}
        <View style={styles.topHeader}>
          <Text style={styles.brand}>ZENTRACK</Text>
          <Text style={styles.step}>02 / sign in</Text>
        </View>

        {/* Main Content */}
        <View style={styles.mainBlock}>
          <Text style={styles.headline}>Let's get you{'\n'}set up.</Text>
          <Text style={styles.sub}>
            Sara's ready whenever you are, she'll help{'\n'}you organize things as you go.
          </Text>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {/* Google Sign In Button */}
          <TouchableOpacity
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.9}
            style={styles.btnContainer}
          >
            <Animated.View style={[styles.googleBtn, { transform: [{ scale: btnScale }] }, loading && { opacity: 0.5 }]}>
              {loading ? (
                <ActivityIndicator color="#1a1a1a" />
              ) : (
                <>
                  <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg' }} style={styles.googleLogo} />
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </Animated.View>
          </TouchableOpacity>

          {/* Apple Sign In Button */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={RADIUS.full}
              style={{ width: '100%', height: 50, marginTop: SPACE.xs }}
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

          <Text style={styles.legalText}>
            By continuing, you agree to our <Text style={styles.linkText} onPress={() => setShowTerms(true)}>Terms of Service</Text>. Your data is secured and strictly private.
          </Text>
        </View>

        {/* Bottom Skip */}
        <View style={styles.bottomBlock}>
          <TouchableOpacity onPress={handleSkip} disabled={skipLoading} style={styles.skipBtn}>
            {skipLoading
              ? <ActivityIndicator color={colors.textMuted} size="small" />
              : <Text style={styles.skipText}>Skip for now  →</Text>
            }
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
        backgroundColor: colors.background,
      },
      content: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'space-between',
        paddingTop: 12,
        paddingBottom: 48,
      },
      topHeader: {
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      brand: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 12,
        color: colors.textPrimary,
        letterSpacing: 2,
      },
      step: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 11,
        color: colors.textMuted,
        letterSpacing: 1,
      },
      mainBlock: {
        justifyContent: 'center',
        marginBottom: 32,
      },
      headline: {
        fontFamily: FONT_FAMILY.title,
        fontSize: 38,
        color: colors.textPrimary,
        lineHeight: 44,
        marginBottom: 12,
      },
      sub: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 15,
        color: colors.textSecondary,
        lineHeight: 22,
        marginBottom: 36,
      },
      errorBox: {
        backgroundColor: isDark ? 'rgba(255,105,97,0.12)' : 'rgba(220,38,38,0.10)',
        borderRadius: RADIUS.md,
        padding: 12,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,105,97,0.3)' : 'rgba(220,38,38,0.25)',
        marginBottom: 20,
      },
      errorText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.sm,
        color: colors.error,
      },
      btnContainer: {
        width: '100%',
        marginBottom: 16,
      },
      googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        borderRadius: RADIUS.lg,
        paddingVertical: 16,
        width: '100%',
        gap: 12,
        borderWidth: 1,
        borderColor: isDark ? '#ffffff' : colors.border,
        ...SHADOW.sm,
      },
      googleLogo: {
        width: 20,
        height: 20,
        resizeMode: 'contain',
      },
      googleBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 15,
        color: '#1a1a1a',
      },
      legalText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.xs,
        color: colors.textMuted,
        lineHeight: 18,
        opacity: 0.6,
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 16,
      },
      linkText: {
        color: colors.accentPrimary || '#007AFF',
        fontFamily: FONT_FAMILY.medium,
      },
      bottomBlock: {
        alignItems: 'flex-start',
      },
      skipBtn: {
        paddingVertical: 12,
      },
      skipText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.sm,
        color: colors.textMuted,
        opacity: 0.7,
      },
    });
