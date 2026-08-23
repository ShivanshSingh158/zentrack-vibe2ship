import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, DeviceEventEmitter, AppState, AppStateStatus, InteractionManager } from 'react-native';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  useNavigation,
  createNavigationContainerRef,
  useIsFocused,
} from '@react-navigation/native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import * as SplashScreen from 'expo-splash-screen';
import { Image } from 'react-native';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { performSignOut } from '../contexts/domains/CoreDataContext';
import { useMobileData } from '../contexts/MobileDataContext';
import { cacheAwareLazy, startPrefetching, preloadNow } from '../utils/ModulePrefetcher';
import { loadBootManifest, updateL1Cache, clearBootManifest } from '../utils/bootManifest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import { useTabBarBadges } from '../hooks/useTabBarBadges';
import { feedback } from '../utils/haptics';
import ErrorBoundary from '../components/ErrorBoundary';

// --- Critical screens (synchronous -- always ready on Frame 0) ----------
import LandingScreen from '../screens/LandingScreen';
import GuestDashboard from '../screens/GuestDashboard';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';

// --- Progressive Lazy Screens (pre-warmed in background via ModulePrefetcher) ---
const TasksScreen                 = cacheAwareLazy('TasksScreen',                 () => import('../screens/TasksScreen'));
const CalendarScreen              = cacheAwareLazy('CalendarScreen',              () => import('../screens/CalendarScreen'));
const AttendanceScreen            = cacheAwareLazy('AttendanceScreen',            () => import('../screens/AttendanceScreen'));
const GymStack                    = cacheAwareLazy('GymStack',                    () => import('./GymStack'));
const MoreScreen                  = cacheAwareLazy('MoreScreen',                  () => import('../screens/MoreScreen'));
const SettingsScreen              = cacheAwareLazy('SettingsScreen',              () => import('../screens/SettingsScreen'));
const NotificationsSettingsScreen = cacheAwareLazy('NotificationsSettingsScreen', () => import('../screens/NotificationsSettingsScreen'));
const XPConstellationScreen       = cacheAwareLazy('XPConstellationScreen',       () => import('../screens/XPConstellationScreen'));
const SaraScreen                  = cacheAwareLazy('SaraScreen',                  () => import('../screens/SaraScreen'));

const HabitsScreen                = cacheAwareLazy('HabitsScreen',                () => import('../screens/HabitsScreen'));
const NotesScreen                 = cacheAwareLazy('NotesScreen',                 () => import('../screens/NotesScreen'));

const AnalyticsScreen             = cacheAwareLazy('AnalyticsScreen',             () => import('../screens/AnalyticsScreen'));
const GradesScreen                = cacheAwareLazy('GradesScreen',             () => import('../screens/GradesScreen'));
const LearningScreen              = cacheAwareLazy('LearningScreen',           () => import('../screens/LearningScreen'));
const StreakDetailScreen           = cacheAwareLazy('StreakDetailScreen',          () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen           = cacheAwareLazy('AgentHistoryScreen',          () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen     = cacheAwareLazy('WellbeingDashboardScreen',    () => import('../screens/WellbeingDashboardScreen'));

// --- Navigators --------------------------------------------------------------
const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Exported for imperative navigation from notification handlers in App.tsx
export const navigationRef = createNavigationContainerRef<any>();

// --- Per-screen ErrorBoundary HOC --------------------------------------------
function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  screenName: string
): React.ComponentType<T> {
  const Wrapped = (props: T) => (
    <ErrorBoundary screenName={screenName}>
      <Component {...(props as any)} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `Protected(${screenName})`;
  return Wrapped;
}

// --- Removed withTransitionDeferrer ---

// --- Navigation Theme --------------------------------------------------------
const ZEN_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card:        'transparent',
    border:      'transparent',
    text:        '#f2f2f7',
  },
};

const ZEN_LIGHT_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F4F3F8',
    card:        'transparent',
    border:      'transparent',
    text:        '#1c1c1e',
  },
};

// --- AsyncStorage Keys -------------------------------------------------------
const NAV_ROUTE_KEY = '@zentrack_last_route';

// --- Synchronous Memory Cache ------------------------------------------------
// 0ms background/foreground tracking (no async needed)
let lastBackgroundTimestamp: number | null = null;

// --- Fatal auth error codes (session dead, cannot recover without login) -----
// These are permanent failures — NOT transient network errors.
// When getIdToken(forceRefresh: true) throws one of these, the session is gone.
const FATAL_AUTH_CODES = new Set([
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/invalid-user-token',
  'auth/user-token-expired',
  'auth/invalid-credential',
  'auth/requires-recent-login',
  'auth/token-expired',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/session-cookie-expired',
]);

function isAuthFatalError(error: any): boolean {
  const code: string = error?.code ?? '';
  if (FATAL_AUTH_CODES.has(code)) return true;
  // Also catch generic 'invalid_grant' from Google OAuth token revocation
  const msg: string = (error?.message ?? '').toLowerCase();
  return msg.includes('invalid_grant') || msg.includes('token has been revoked');
}

const ALLOWED_SAVE_ROUTES = new Set([
  'Home', 'Tasks', 'Gym', 'Calendar', 'Habits',
  'Attendance', 'Analytics', 'Notes', 'Grades', 'Learning',
]);

// --- SARA FAB visibility -----------------------------------------------------
const SARA_VISIBLE_ROUTES = new Set(['Home', 'Tasks', 'Analytics']);

// --- Full Component Map for Bottom Tabs --------------------------------------
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  Tasks:          TasksScreen,
  Attendance:     AttendanceScreen,
  Gym:            GymStack,
  Calendar:       CalendarScreen,
  Habits:         HabitsScreen,
  Analytics:      AnalyticsScreen,
  Notes:          NotesScreen,
  Grades:         GradesScreen,
  Learning:       LearningScreen,
};

// --- Nested screen header ----------------------------------------------------
function NestedHeader({ title }: { title: string }) {
  const { colors }  = useTheme();
  const navigation  = useNavigation<any>();
  const insets      = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.md, backgroundColor: colors.surface }]}>
      <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn} haptic="light">
        <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
      </AnimatedPressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

import { TelegramTabBar } from '../components/Navigation/TelegramTabBar';

// --- SafeDashboard (defined before MainTabNavigator that uses it) -------------
const SafeDashboard = withErrorBoundary(DashboardScreen, 'Dashboard');

const TabBarNullButton = () => null;

// --- Main Tab Navigator ------------------------------------------------------
//
// initialTab is a STABLE PROP passed at mount time from the boot read.
// Never changes after mount -- WhatsApp/Instagram pattern.

function MainTabNavigator({ initialTab }: { initialTab: string }) {
  const { pinnedModules } = useMobileData();
  const { colors } = useTheme();
  const effectivePinned = (Array.isArray(pinnedModules) && pinnedModules.length > 0)
    ? pinnedModules
    : ['Tasks', 'Gym', 'Calendar', 'Attendance'];

  const onTabFocus = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  // Background-prefetch lazy screens once on mount (after first render).
  // Map route names ('Gym', 'Tasks') to prefetch IDs ('GymStack', 'TasksScreen').
  const prefetchIds = useMemo(() => 
    effectivePinned.map(p => (p === 'Gym' ? 'GymStack' : p.endsWith('Screen') || p.endsWith('Stack') ? p : `${p}Screen`)),
    [effectivePinned]
  );
  const prefetchIdsRef = useRef(prefetchIds);
  prefetchIdsRef.current = prefetchIds;

  useEffect(() => { 
    startPrefetching(prefetchIdsRef.current);
    // Staggered pre-warm for core tabs so switching is 100% immediate (< 5ms) while keeping 60/120fps fluid
    InteractionManager.runAfterInteractions(() => {
      const coreScreens = ['GymStack', 'TasksScreen', 'CalendarScreen', 'AttendanceScreen'];
      let delay = 0;
      coreScreens.forEach(id => {
        setTimeout(() => {
          requestAnimationFrame(() => preloadNow(id));
        }, delay);
        delay += 35; // 35ms stagger ensures zero frame drops during animation
      });
    });
  }, []);

  const badges = useTabBarBadges();

  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} badges={badges} />, [badges]);

  return (
    <Tab.Navigator
      initialRouteName={initialTab}
      tabBar={renderTabBar}
      screenListeners={({ route }) => ({
        focus: () => onTabFocus(route.name),
      })}
      detachInactiveScreens={true}
      screenOptions={{
        headerShown: false,
        sceneStyle:  { backgroundColor: colors.background },
        lazy:        true,
        freezeOnBlur: true,
        animation:   'fade',
      }}
      backBehavior="history"
    >
      <Tab.Screen name="Home" component={SafeDashboard} options={{ lazy: false }} />
      {Object.keys(COMPONENT_MAP).map((modId) => {
        const isPinned = effectivePinned.includes(modId);
        return (
          <Tab.Screen
            key={modId}
            name={modId}
            component={COMPONENT_MAP[modId]}
            options={!isPinned ? {
              tabBarItemStyle: { display: 'none' },
              tabBarButton:    TabBarNullButton,
            } : {
              tabBarItemStyle: { paddingVertical: 10 },
              lazy: true, // Progressive boot: background pre-warmed via startPrefetching
            }}
          />
        );
      })}
      <Tab.Screen name="More" component={withErrorBoundary(MoreScreen, 'More')} options={{ lazy: true }} />
    </Tab.Navigator>
  );
}

// --- Nested screens stack ----------------------------------------------------
function NestedScreens() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary screenName="Nested Screens">
      <Stack.Navigator
        screenOptions={{
          header:            ({ route }) => <NestedHeader title={route.name} />,
          contentStyle:      { backgroundColor: colors.background },
          animation:         'slide_from_right',
          animationDuration: 180,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="Settings"              component={withErrorBoundary(SettingsScreen,              'Settings')} />
        <Stack.Screen name="NotificationsSettings" component={withErrorBoundary(NotificationsSettingsScreen, 'Notifications')} options={{ headerShown: false }} />
        <Stack.Screen name="Sara"                  component={withErrorBoundary(SaraScreen,                  'Sara')}          options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StreakDetail"           component={withErrorBoundary(StreakDetailScreen,          'StreakDetail')}   options={{ headerShown: false }} />
        <Stack.Screen name="SaraModal"             component={withErrorBoundary(SaraScreen,                  'SaraModal')}     options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="AgentHistory"          component={withErrorBoundary(AgentHistoryScreen,          'AgentHistory')} />
        <Stack.Screen name="WellbeingDashboard"    component={withErrorBoundary(WellbeingDashboardScreen,    'Wellbeing')}     options={{ headerShown: false }} />
        <Stack.Screen name="XPConstellation"       component={withErrorBoundary(XPConstellationScreen,       'XPConstellation')} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// --- Root authenticated navigator + global SARA FAB --------------------------
function RootNavigatorWithSara({ initialTab }: { initialTab: string }) {
  const { colors, isDark } = useTheme();
  const [saraVisible, setSaraVisible] = useState(false);

  const MainTabsScreen = useCallback(
    () => <MainTabNavigator initialTab={initialTab} />,
    [initialTab, colors, isDark]
  );

  // Pre-warm SaraScreen 2.5s after login so first tap opens instantly.
  // Not at startup (keeps cold start fast) — loaded silently in background.
  useEffect(() => {
    const timer = setTimeout(() => preloadNow('SaraScreen'), 2500);
    return () => clearTimeout(timer);
  }, []);

  const [showSara, setShowSara] = useState(SARA_VISIBLE_ROUTES.has(initialTab));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('route_changed', (routeName: string) => {
      setShowSara(SARA_VISIBLE_ROUTES.has(routeName));
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabsScreen} />
        <Stack.Group screenOptions={{ presentation: 'card' }}>
          <Stack.Screen name="MoreStack" component={NestedScreens} />
        </Stack.Group>
      </Stack.Navigator>

      {showSara && (
        <AnimatedPressable
          style={styles.globalSaraBtn}
          onPress={() => setSaraVisible(true)}
          haptic="none"
        >
          <Image source={require('../../assets/images/sara-idle.png')} style={{ width: 40, height: 40, opacity: 1 }} resizeMode="contain" />
        </AnimatedPressable>
      )}

      {/* Only mount SaraScreen when actually opened — prevents 63KB of hooks running at startup */}
      {saraVisible && (
        <SaraScreen isGlobalModal={true} visible={saraVisible} onClose={() => setSaraVisible(false)} />
      )}
    </View>
  );
}

// --- AppNavigator -- Root ----------------------------------------------------
//
// WHATSAPP / INSTAGRAM LIFECYCLE ARCHITECTURE
//
// GREY SCREEN FIX:
//   NavigationContainer ALWAYS renders. SplashLoader is an absolute overlay
//   (zIndex 9999), NOT an early return. Keeps React view tree warm inside
//   Android's window. Foreground resume = zero grey flash.
//
// SPLASH PERFORMANCE:
//   SplashLoader has ZERO external data imports. No quotes file, no 26KB parse.
//   Renders on first JS frame. Fades out with 350ms opacity animation once
//   appReady=true (Firebase auth resolved).
//
// PINNED TAB PERFORMANCE:
//   Tasks, Calendar, Gym, Attendance are synchronous imports at file top.
//   When pinned, they mount eagerly with Home (lazy: false = 0ms tap cost).
//
// AUTH GUARD:
//   Firebase fires onAuthStateChanged(null) during token refresh (~every 1h).
//   We ignore nulls for 3 seconds after first auth resolution to avoid flashing
//   the login screen during a routine token refresh.

export default function AppNavigator() {
  const [appReady,   setAppReady]   = useState(false);
  const [user,       setUser]       = useState<User | null>(null);
  const [onboarded,  setOnboarded]  = useState(true);
  const [initialTab, setInitialTab] = useState('Home');

  const firstAuthAt = useRef<number>(0);
  const hasResolved = useRef(false);
  // Tracks whether the user was logged in at any point in this session.
  // Used to discriminate onAuthStateChanged(null) as "session died" vs "never logged in".
  const wasLoggedInRef = useRef(false);
  // Abort controller for the 8-second dead-session recovery window.
  const deadSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const manifest = await loadBootManifest();
        
        // Cold boot: always Home (WhatsApp/Instagram standard).
        setInitialTab('Home');
        setOnboarded(manifest.onboarded);
        
        // WhatsApp-style Optimistic Boot: If we have a cached user profile, boot instantly!
        if (manifest.optimisticUser) {
          setUser(manifest.optimisticUser);
          setAppReady(true);
          wasLoggedInRef.current = true;
          hasResolved.current = true; // Mark as resolved so Firebase background check doesn't double-boot
          firstAuthAt.current = Date.now();
        }
      } catch {
        // Safe fallback: Home, onboarded=true
      }
    };

    const bootPromise = boot();

    // Firebase auth listener -- one subscription, lives forever
    const unsubAuth = onAuthStateChanged(auth, async (usr) => {
      await bootPromise;

      const saveOptimisticUser = (u: User | null) => {
        updateL1Cache('optimisticUser', u);
        if (u) {
          AsyncStorage.setItem('@zentrack_optimistic_user', JSON.stringify({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
          })).catch(() => {});
        } else {
          AsyncStorage.removeItem('@zentrack_optimistic_user').catch(() => {});
          clearBootManifest();
        }
      };

      const checkOnboardingStatus = async (uid: string): Promise<boolean> => {
        try {
          const localVal = await AsyncStorage.getItem(ONBOARDING_KEY);
          const legacyVal = await AsyncStorage.getItem('@zentrack_onboarding_completed');
          if (localVal === 'true' || legacyVal === 'true') {
            setOnboarded(true);
            return true;
          }
          // Check remote Firestore profile/identity for existing accounts
          const identitySnap = await getDoc(doc(db, 'users', uid, 'profile', 'identity'));
          if (identitySnap.exists() && identitySnap.data()?.onboardedAt) {
            await AsyncStorage.multiSet([
              ['@zentrack_onboarding_completed', 'true'],
              [ONBOARDING_KEY, 'true'],
            ]);
            setOnboarded(true);
            return true;
          }
          // First-time user! Needs full onboarding
          setOnboarded(false);
          return false;
        } catch {
          const localVal = await AsyncStorage.getItem(ONBOARDING_KEY);
          const isDone = localVal === 'true';
          setOnboarded(isDone);
          return isDone;
        }
      };

      if (!hasResolved.current) {
        // We only hit this block if we did NOT have an optimistic user (i.e. fresh install or logged out).
        // OFFLINE-FIRST FIX: Race authStateReady() against a SHORT 300ms timeout.
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>(resolve => setTimeout(resolve, 300)),
        ]);
        const realUser = auth.currentUser;

        if (realUser) {
          await checkOnboardingStatus(realUser.uid);
        }

        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(realUser);
        setAppReady(true);
        saveOptimisticUser(realUser);
        return;
      }

      // Background Validation: We booted optimistically, now Firebase is checking the real token
      if (usr) {
        // Session confirmed alive — update state, check onboarding and persist
        wasLoggedInRef.current = true;
        if (deadSessionTimerRef.current) {
          clearTimeout(deadSessionTimerRef.current);
          deadSessionTimerRef.current = null;
        }
        await checkOnboardingStatus(usr.uid);
        setUser(usr);
        saveOptimisticUser(usr);
      } else {
        // Firebase fired null. Three possible causes:
        // A) User explicitly signed out (performSignOut cleared @zentrack_optimistic_user)
        // B) Transient blip during routine 60-min token refresh → Firebase will fire user again
        // C) Session permanently dead (token revoked, Google account deactivated, etc.)
        //
        // STRATEGY: Give Firebase an 8-second recovery window.
        // If a non-null user event arrives within 8s → it was a transient blip (case B) → cancel timer.
        // If 8s pass with no recovery AND we had a cached optimistic user → session is dead → force logout.
        // If no cached optimistic user → user explicitly signed out → log out immediately.
        const raw = await AsyncStorage.getItem('@zentrack_optimistic_user').catch(() => null);
        if (!raw) {
          // Case A: explicit logout — clear immediately
          setUser(null);
          return;
        }

        if (!wasLoggedInRef.current) {
          // Firebase fired null before we ever authenticated — transient cold-boot null, ignore
          return;
        }

        // Cases B or C: we had a valid session but Firebase now says null.
        // Start an 8-second dead-session detection window.
        // The `if (usr)` branch above will cancel this timer if Firebase recovers.
        if (deadSessionTimerRef.current) clearTimeout(deadSessionTimerRef.current);
        deadSessionTimerRef.current = setTimeout(async () => {
          deadSessionTimerRef.current = null;
          // After 8s, check if Firebase has recovered.
          if (auth.currentUser) {
            // Recovered — Firebase auto-refreshed the token, all good
            setUser(auth.currentUser);
            saveOptimisticUser(auth.currentUser);
            return;
          }
          // Session confirmed dead. auth.currentUser is still null after 8s.
          // Force logout and return user to the login screen.
          console.warn('[Auth] Dead session confirmed after 8s — forcing logout');
          try { await performSignOut(); } catch {}
          setUser(null);
          clearBootManifest();
        }, 8000);
      }
    });

    // OTA update check -- rate-limited to once per hour
    if (!__DEV__) {
      (async () => {
        try {
          const HOUR_MS   = 60 * 60 * 1000;
          const lastCheck = await AsyncStorage.getItem('@zentrack_last_update_check').catch(() => null);
          if (lastCheck && Date.now() - parseInt(lastCheck, 10) < HOUR_MS) return;
          await AsyncStorage.setItem('@zentrack_last_update_check', String(Date.now()));
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            // Silently fetch the update bundle in background.
            // When user opens the app next time, the new version launches automatically in 0ms!
            await Updates.fetchUpdateAsync();
            console.log('[Updates] New bundle silently downloaded. Will apply automatically on next launch.');
          }
        } catch { /* offline -- skip silently */ }
      })();
    }

    // AppState heartbeat & Lifecycle
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // STEP 1: Force-refresh the Firebase ID token.
        // Firebase Auth tokens expire every 60 min. getIdToken(true) updates the
        // Auth module's internal token — necessary for new requests to Firestore.
        try {
          if (auth.currentUser) {
            await auth.currentUser.getIdToken(/* forceRefresh */ true);
          }
          // STEP 2: Token refresh succeeded → force-restart all Firestore listeners.
          // Refreshing the auth token is NOT sufficient to reconnect Firestore's internal
          // gRPC/WebSocket channel. Emitting this event causes all 5 domain contexts to
          // bump subscriptionVersion, tearing down dead listeners and reopening fresh ones.
          // The Firestore SDK resumes from the last known resume token — no full re-download.
          DeviceEventEmitter.emit('firestore_force_reconnect');
        } catch (error: any) {
          // Discriminate: network errors are transient → stay logged in.
          // Fatal auth errors (revoked token, user disabled, etc.) → force logout.
          if (isAuthFatalError(error)) {
            console.warn('[Auth] Fatal token refresh error on foreground —', error?.code, '— forcing logout');
            try { await performSignOut(); } catch {}
            setUser(null);
            clearBootManifest();
          }
          // Network error or unknown → skip reconnect, stay logged in
        }

        if (lastBackgroundTimestamp) {
          if (Date.now() - lastBackgroundTimestamp > 30 * 60 * 1000) {
            if (navigationRef.isReady()) {
              // @ts-ignore
              navigationRef.navigate('MainTabs', { screen: 'Home' });
            }
          }
        }
        lastBackgroundTimestamp = null;
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundTimestamp = Date.now();
        AsyncStorage.multiRemove([
          'sara_chat_history',
          'sara_memory_summary',
          'gym_chat_history',
          'gym_memory_summary',
        ]).catch(() => {});
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubAuth();
      appStateSub.remove();
      // Cancel any pending dead-session logout timer on unmount
      if (deadSessionTimerRef.current) {
        clearTimeout(deadSessionTimerRef.current);
        deadSessionTimerRef.current = null;
      }
    };
  }, []);

  const onNavStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) DeviceEventEmitter.emit('route_changed', routeName);
  }, []);

  const { isDark, colors } = useTheme();

  // CRITICAL: Do not mount the navigation tree until we know the user's auth state.
  // Otherwise, React Native renders the LandingScreen in the background, and if the 
  // native splash screen hides a millisecond too early, the user sees it flash.
  if (!appReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer
        ref={navigationRef}
        theme={isDark ? ZEN_DARK_THEME : ZEN_LIGHT_THEME}
        onStateChange={onNavStateChange}
        onReady={() => {
          // Hide splash ONLY after React Native has fully painted the final tree!
          SplashScreen.hideAsync();
        }}
      >
        {user ? (
          !onboarded ? (
            <ErrorBoundary screenName="Onboarding">
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
                <Stack.Screen name="Onboarding">
                  {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
                </Stack.Screen>
              </Stack.Navigator>
            </ErrorBoundary>
          ) : (
            <RootNavigatorWithSara initialTab={initialTab} />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="Landing"        component={LandingScreen} />
            <Stack.Screen name="GuestDashboard" component={GuestDashboard} />
            <Stack.Screen name="Auth"           component={AuthScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </View>
  );
}

// --- Styles ------------------------------------------------------------------
const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACE.xl,
    paddingBottom:     SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn:     { padding: SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  globalSaraBtn: {
    position:        'absolute',
    bottom:           110,
    right:            24,
    width:            48,
    height:           48,
    borderRadius:     24,
    alignItems:       'center',
    justifyContent:   'center',
    overflow:         'hidden',
    shadowColor:      '#a599ff',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.3,
    shadowRadius:     8,
    elevation:        5,
  },
});
