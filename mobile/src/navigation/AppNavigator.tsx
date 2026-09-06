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
import { auth } from '../services/firebase';
import { performSignOut } from '../contexts/domains/CoreDataContext';
import { cacheAwareLazy, startPrefetching, prefetchRemainingModules } from '../utils/ModulePrefetcher';
import { loadBootManifest, getBootManifestSync, updateL1Cache, clearBootManifest } from '../utils/bootManifest';
import { registerActiveWorkoutNotificationListeners } from '../services/activeWorkoutNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';


// ─── PRE-WARM BOOT MANIFEST ────────────────────────────────────────────────
// Kick off the single AsyncStorage.multiGet() call the moment this JS module
// is evaluated — BEFORE React renders a single frame. By the time AppNavigator
// mounts and calls useState(), the L1 cache is already warm.
// This is identical to what Chrome does with resource preloading.
loadBootManifest().catch(() => {});

import { FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';

// --- Lightweight Shimmer Skeletons (Instant 0ms Fallbacks for Frame 1 Tab Switches) ---
import TasksSkeleton from '../components/Tasks/TasksSkeleton';
import GymHomeSkeleton from '../components/Gym/GymHomeSkeleton';
import AttendanceSkeleton from '../components/Academic/AttendanceSkeleton';
import HabitsSkeleton from '../components/Habits/HabitsSkeleton';
import AnalyticsSkeleton from '../components/Analytics/AnalyticsSkeleton';

// --- Core App Screens (Synchronous for 0ms Instant Tab Switching) ----------
import LandingScreen from '../screens/LandingScreen';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';

// --- Lazy Loaded Screens with Pixel-Matched Shimmer Fallbacks ------------------
const TasksScreen = cacheAwareLazy('Tasks', () => import('../screens/TasksScreen'), TasksSkeleton);
const CalendarScreen = cacheAwareLazy('Calendar', () => import('../screens/CalendarScreen'));
const AttendanceScreen = cacheAwareLazy('Attendance', () => import('../screens/AttendanceScreen'), AttendanceSkeleton);
const GymStack = cacheAwareLazy('Gym', () => import('./GymStack'), GymHomeSkeleton);
const MoreScreen = cacheAwareLazy('More', () => import('../screens/MoreScreen'));
const HabitsScreen = cacheAwareLazy('Habits', () => import('../screens/HabitsScreen'), HabitsSkeleton);
const NotesScreen = cacheAwareLazy('Notes', () => import('../screens/NotesScreen'));
const AnalyticsScreen = cacheAwareLazy('Analytics', () => import('../screens/AnalyticsScreen'), AnalyticsSkeleton);
const GradesScreen = cacheAwareLazy('Grades', () => import('../screens/GradesScreen'));
const AssignmentsScreen = cacheAwareLazy('Assignments', () => import('../screens/AssignmentsScreen'));
const LearningScreen = cacheAwareLazy('Learning', () => import('../screens/LearningScreen'));
const SettingsScreen = cacheAwareLazy('Settings', () => import('../screens/SettingsScreen'));
const NotificationsSettingsScreen = cacheAwareLazy('NotificationsSettings', () => import('../screens/NotificationsSettingsScreen'));
const XPConstellationScreen = cacheAwareLazy('XPConstellation', () => import('../screens/XPConstellationScreen'));
const StreakDetailScreen = cacheAwareLazy('StreakDetail', () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen = cacheAwareLazy('AgentHistory', () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen = cacheAwareLazy('WellbeingDashboard', () => import('../screens/WellbeingDashboardScreen'));
// SARA screen hidden & completely deactivated per user directive
const NullScreen = () => null;
import { usePomodoro } from '../contexts/PomodoroContext';
import PomodoroFloatingPill from '../components/Tasks/PomodoroFloatingPill';
import PomodoroSheet from '../components/Tasks/PomodoroSheet';
import { useQuickActions } from '../hooks/useQuickActions';

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
  'Attendance', 'Analytics', 'Notes', 'Grades', 'Assignments', 'Learning',
]);



// --- Full Component Map for Bottom Tabs --------------------------------------
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  Tasks:          withErrorBoundary(TasksScreen, 'Tasks'),
  Attendance:     withErrorBoundary(AttendanceScreen, 'Attendance'),
  Gym:            withErrorBoundary(GymStack, 'Gym'),
  Calendar:       withErrorBoundary(CalendarScreen, 'Calendar'),
  Habits:         withErrorBoundary(HabitsScreen, 'Habits'),
  Analytics:      withErrorBoundary(AnalyticsScreen, 'Analytics'),
  Notes:          withErrorBoundary(NotesScreen, 'Notes'),
  Grades:         withErrorBoundary(GradesScreen, 'Grades'),
  Assignments:    withErrorBoundary(AssignmentsScreen, 'Assignments'),
  Learning:       withErrorBoundary(LearningScreen, 'Learning'),
};

const ALL_NAV_MODULE_IDS = Object.keys(COMPONENT_MAP);

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

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { TelegramTabBar } from '../components/Navigation/TelegramTabBar';

// --- SafeDashboard & SafeMore (defined before MainTabNavigator that uses them) -------------
const SafeDashboard = withErrorBoundary(DashboardScreen, 'Dashboard');
const SafeMore = withErrorBoundary(MoreScreen, 'More');

const TabBarNullButton = () => null;

// --- Main Tab Navigator ------------------------------------------------------
//
// WHATSAPP / INSTAGRAM ARCHITECTURE:
// Uses useCoreData() for pinnedModules so background domain streaming (wellness/academic/planner)
function MainTabNavigator() {
  const { pinnedModules } = useCoreData();
  const { colors } = useTheme();

  const pinnedKey = (Array.isArray(pinnedModules) && pinnedModules.length > 0)
    ? pinnedModules.join(',')
    : 'Tasks,Gym,Calendar,Attendance';

  const effectivePinned = useMemo(() => pinnedKey.split(','), [pinnedKey]);

  // State to trigger background warm-mounting of pinned tabs AFTER Home settles
  const [warmPinnedTabs, setWarmPinnedTabs] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      // Warm ONLY the 4 pinned tabs on boot (drops prefetch time from 7.5s down to 1.8s)
      startPrefetching(effectivePinned, true);
      // Wait for Home first paint and user gestures to settle (350ms), then warm-mount pinned tabs
      const timer = setTimeout(() => {
        setWarmPinnedTabs(true);
      }, 350);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, [pinnedKey]);

  // PERF FIX: Throttle AsyncStorage saves
  const lastTabSaveRef = useRef<number>(0);
  const onTabFocus = useCallback((routeName: string) => {
    // When user taps or focuses More, warm the remaining 13 modules immediately
    if (routeName === 'More') {
      prefetchRemainingModules();
    }
    if (!ALLOWED_SAVE_ROUTES.has(routeName)) return;
    const now = Date.now();
    if (now - lastTabSaveRef.current < 10000) return; // max once per 10s
    lastTabSaveRef.current = now;
    AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
  }, []);

  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} />, []);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={renderTabBar}
      screenListeners={({ route }) => ({
        focus: () => onTabFocus(route.name),
      })}
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle:  { backgroundColor: colors.background },
        lazy: true,
        freezeOnBlur: false,
      }}
      backBehavior="history"
    >
      <Tab.Screen name="Home" component={SafeDashboard} options={{ lazy: false }} />
      {ALL_NAV_MODULE_IDS.map((modId) => {
        const isPinned = effectivePinned.includes(modId);
        return (
          <Tab.Screen
            key={modId}
            name={modId}
            component={COMPONENT_MAP[modId]}
            options={{
              lazy: isPinned ? !warmPinnedTabs : true,
              ...(!isPinned ? {
                tabBarItemStyle: { display: 'none' },
                tabBarButton:    TabBarNullButton,
              } : {
                tabBarItemStyle: { paddingVertical: 10 },
              }),
            }}
          />
        );
      })}
      <Tab.Screen name="More" component={SafeMore} />
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
        <Stack.Screen name="Sara"                  component={NullScreen}                                                       options={{ headerShown: false }} />
        <Stack.Screen name="StreakDetail"           component={withErrorBoundary(StreakDetailScreen,          'StreakDetail')}   options={{ headerShown: false }} />
        <Stack.Screen name="SaraModal"             component={NullScreen}                                                       options={{ headerShown: false }} />
        <Stack.Screen name="AgentHistory"          component={withErrorBoundary(AgentHistoryScreen,          'AgentHistory')} />
        <Stack.Screen name="Assignments"           component={withErrorBoundary(AssignmentsScreen,           'Assignments')}   options={{ headerShown: false }} />
        <Stack.Screen name="WellbeingDashboard"    component={withErrorBoundary(WellbeingDashboardScreen,    'Wellbeing')}     options={{ headerShown: false }} />
        <Stack.Screen name="XPConstellation"       component={withErrorBoundary(XPConstellationScreen,       'XPConstellation')} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// --- Root authenticated navigator + Pomodoro ---------------------------------
function RootNavigatorWithSara() {
  const { colors } = useTheme();
  const { isSheetOpen, setIsSheetOpen } = usePomodoro();

  useEffect(() => {
    const unsub = registerActiveWorkoutNotificationListeners();
    return () => unsub();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Group screenOptions={{ presentation: 'card' }}>
          <Stack.Screen name="MoreStack" component={NestedScreens} />
        </Stack.Group>
      </Stack.Navigator>

      {/* Global Pomodoro Floating Pill (Active countdown when sheet minimized) */}
      <PomodoroFloatingPill />

      {/* Global Pomodoro Sheet (Auto-surfaces on boot when running, or on user tap) */}
      {isSheetOpen && (
        <PomodoroSheet visible={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
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
  // ── Synchronous Frame 0 seed from L1 cache ──────────────────────────────
  // getBootManifestSync() returns the in-memory cache populated by the
  // module-level loadBootManifest() call above. For returning users this is
  // already populated before React renders — so appReady=true and
  // user=cachedUser on the very first frame. NavigationContainer NEVER
  // mounts from a blank state, eliminating the 2-3s cold-mount freeze.
  const _sync = getBootManifestSync();
  const [appReady,   setAppReady]   = useState(_sync?.optimisticUser != null);
  const [user,       setUser]       = useState<User | null>(_sync?.optimisticUser ?? null);
  const [onboarded,  setOnboarded]  = useState(_sync?.onboarded ?? true);
  const [initialTab, setInitialTab] = useState('Home');

  // Register and handle App Icon Quick Shortcuts (New Task, Attendance, Workout, Vault)
  useQuickActions();

  const firstAuthAt = useRef<number>(_sync?.optimisticUser ? Date.now() : 0);
  // If we already have a cached user, mark as resolved immediately so the Firebase
  // background validation handler doesn't trigger a redundant double-boot.
  const hasResolved = useRef(_sync?.optimisticUser != null);
  // Tracks whether the user was logged in at any point in this session.
  // Used to discriminate onAuthStateChanged(null) as "session died" vs "never logged in".
  const wasLoggedInRef = useRef(_sync?.optimisticUser != null);
  // Abort controller for the 8-second dead-session recovery window.
  const deadSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FAILSAFE: If NavigationContainer.onReady() never fires (e.g. a lazy import hangs),
  // force-hide the splash after 3 seconds so the app never permanently freezes.
  useEffect(() => {
    const failsafe = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(failsafe);
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const manifest = await loadBootManifest();
        
        // Cold boot: always Home (WhatsApp/Instagram standard).
        setInitialTab('Home');
        setOnboarded(manifest.onboarded);
        
        // WhatsApp-style Optimistic Boot: If we have a cached user profile, boot instantly!
        // NOTE: If _sync already had optimisticUser, appReady=true was set synchronously
        // on Frame 0 (useState initializer above). We skip redundant state sets to avoid
        // a no-op re-render, but still update the refs for the Firebase guard logic.
        if (manifest.optimisticUser) {
          if (!hasResolved.current) {
            setUser(manifest.optimisticUser);
            setAppReady(true);
          }
          wasLoggedInRef.current = true;
          hasResolved.current = true;
          if (!firstAuthAt.current) firstAuthAt.current = Date.now();
        } else if (!hasResolved.current) {
          // No cached user — fresh install path. appReady will be set by Firebase listener.
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

      if (!hasResolved.current) {
        // We only hit this block if we did NOT have an optimistic user (i.e. fresh install or logged out).
        // OFFLINE-FIRST FIX: Race authStateReady() against a SHORT 300ms timeout.
        // The old 2-second timeout caused the nav bar to be frozen for 2s on every
        // cold boot (no optimistic user). 300ms is enough for Firebase to check its
        // token cache; if it needs more time it will fire onAuthStateChanged again
        // and the background validation block below will handle it gracefully.
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>(resolve => setTimeout(resolve, 300)),
        ]);
        const realUser = auth.currentUser;

        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(realUser);
        setAppReady(true);
        saveOptimisticUser(realUser);
        const ob = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
        setOnboarded(ob === 'true');
        return;
      }

      // Background Validation: We booted optimistically, now Firebase is checking the real token
      if (usr) {
        // Session confirmed alive — update state and persist
        wasLoggedInRef.current = true;
        if (deadSessionTimerRef.current) {
          clearTimeout(deadSessionTimerRef.current);
          deadSessionTimerRef.current = null;
        }
        // UID Guard: Only trigger root state update if the UID changed (prevents re-rendering entire navigation tree on routine token check)
        setUser(prev => (prev?.uid === usr.uid ? prev : usr));
        saveOptimisticUser(usr);
        const [ob1, ob2] = await AsyncStorage.multiGet(['@zentrack_onboarding_completed', 'zentrack_onboarded_v2']).catch(() => []);
        const isOnboarded = ob1?.[1] === 'true' || ob2?.[1] === 'true';
        setOnboarded(isOnboarded);
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
    //
    // INSTAGRAM/WHATSAPP FOREGROUND ARCHITECTURE:
    // When the app comes to foreground from a short background switch (< 15 min),
    // the Firebase Auth token is completely valid (1h lifespan) and Firestore socket
    // connections are already warm/reconnecting at the engine level.
    // Tearing down all 18 Firestore listeners and forcing a token refresh on every
    // app resume saturates the single-threaded JS runtime and locks navigation for ~1s.
    //
    // FIX:
    // 1. Short resume (< 15 min): Return immediately (0ms overhead, zero I/O, zero re-renders).
    // 2. Long resume (> 30 min): Navigate Home, and defer non-blocking health check by 2.5s.
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const bgTimestamp = lastBackgroundTimestamp;
        lastBackgroundTimestamp = null;

        // SHORT RESUME FAST-PATH (< 15 min):
        // Instant 0ms resume — no I/O, no listener restart, no nav freeze.
        if (!bgTimestamp || Date.now() - bgTimestamp < 15 * 60 * 1000) {
          return;
        }

        const wasLongBackground = Date.now() - bgTimestamp > 30 * 60 * 1000;

        // STEP 1: If the user was gone for >30 min, navigate Home.
        if (wasLongBackground && navigationRef.isReady()) {
          // @ts-ignore
          navigationRef.navigate('MainTabs', { screen: 'Home' });
        }

        // STEP 2: Defer background health-check by 2.5s so initial UI paint & tab touches are 100% fluid.
        setTimeout(() => {
          InteractionManager.runAfterInteractions(async () => {
            try {
              if (auth.currentUser) {
                // getIdToken(false) uses cached token if valid, refreshing ONLY if expired (>60 min)
                await auth.currentUser.getIdToken(false);
              }
              // Only restart listeners after long dormancy (>30 min)
              if (wasLongBackground) {
                DeviceEventEmitter.emit('firestore_force_reconnect');
              }
            } catch (error: any) {
              if (isAuthFatalError(error)) {
                console.warn('[Auth] Fatal token refresh error on foreground —', error?.code, '— forcing logout');
                try { await performSignOut(); } catch {}
                setUser(null);
                clearBootManifest();
              }
            }
          });
        }, 2500);
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundTimestamp = Date.now();
        // Defer cleanup to avoid competing with background transition animation
        setTimeout(() => {
          AsyncStorage.multiRemove([
            'sara_chat_history',
            'sara_memory_summary',
            'gym_chat_history',
            'gym_memory_summary',
          ]).catch(() => {});
        }, 500);
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);
    const resetOnboardingSub = DeviceEventEmitter.addListener('reset_onboarding', () => {
      setOnboarded(false);
    });

    return () => {
      unsubAuth();
      appStateSub.remove();
      resetOnboardingSub.remove();
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

  // INSTAGRAM/WHATSAPP/TELEGRAM ARCHITECTURE — OVERLAY SPLASH PATTERN:
  //
  // The old pattern was: if (!appReady) return <blank View>;
  // This caused NavigationContainer to UNMOUNT when appReady=false, and REMOUNT
  // when appReady=true — cold-mounting the entire navigation tree from scratch.
  // On Android/Hermes this is a 200-800ms synchronous JS reconciliation burst.
  // THIS WAS THE FREEZE.
  //
  // The fix: NavigationContainer ALWAYS mounts. When auth state is unknown,
  // an opaque overlay View sits on top (zIndex: 9999) covering everything.
  // When appReady becomes true, the overlay simply stops rendering.
  // The navigation tree was already warm and ready — tap response is instant.
  //
  // The native splash screen remains visible (via SplashScreen.preventAutoHideAsync()
  // at module level in App.tsx) until NavigationContainer.onReady() fires, so there
  // is no visible flash of unmounted/remounted content.

const LINKING_CONFIG = {
  prefixes: ['zentrack://', 'exp://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: 'dashboard',
          Tasks: 'tasks',
          Attendance: 'attendance',
          Habits: 'habits',
          Gym: 'gym',
          Calendar: 'calendar',
          Notes: 'notes',
          Analytics: 'analytics',
        },
      },
      MoreStack: {
        screens: {
          Settings: 'settings',
          NotificationsSettings: 'notifications-settings',
          Sara: 'sara',
          StreakDetail: 'streak',
          AgentHistory: 'agent-history',
          Assignments: 'assignments',
          WellbeingDashboard: 'wellbeing',
          XPConstellation: 'xp',
        },
      },
    },
  },
};

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer
        ref={navigationRef}
        linking={LINKING_CONFIG}
        theme={isDark ? ZEN_DARK_THEME : ZEN_LIGHT_THEME}
        onStateChange={onNavStateChange}
        onReady={() => {
          SplashScreen.hideAsync().catch(() => {});
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
            <RootNavigatorWithSara />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="Landing"        component={LandingScreen} />
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
});
