import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { useMobileData } from '../contexts/MobileDataContext';
import { cacheAwareLazy, startPrefetching, preloadNow } from '../utils/ModulePrefetcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import { useTabBarBadges } from '../hooks/useTabBarBadges';
import { feedback } from '../utils/haptics';
import ErrorBoundary from '../components/ErrorBoundary';

// --- Critical screens (synchronous -- always ready, zero load time) ----------
import LandingScreen from '../screens/LandingScreen';
import GuestDashboard from '../screens/GuestDashboard';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
// Pinned candidate screens -- synchronous imports so any pinned tab mounts instantly
import TasksScreen from '../screens/TasksScreen';
import CalendarScreen from '../screens/CalendarScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GymStack from './GymStack';
import SaraScreen from '../screens/SaraScreen';
import NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';
import XPConstellationScreen from '../screens/XPConstellationScreen';

// --- Lazy screens (background-prefetched after login) ------------------------
// These are NOT pinned by default -- loaded lazily to keep startup fast.
const HabitsScreen             = cacheAwareLazy('HabitsScreen',             () => import('../screens/HabitsScreen'));
const NotesScreen              = cacheAwareLazy('NotesScreen',              () => import('../screens/NotesScreen'));
const WeeklyReviewScreen       = cacheAwareLazy('WeeklyReviewScreen',       () => import('../screens/WeeklyReviewScreen'));
const StudyRoomScreen          = cacheAwareLazy('StudyRoomScreen',          () => import('../screens/StudyRoomScreen'));
const AnalyticsScreen          = cacheAwareLazy('AnalyticsScreen',          () => import('../screens/AnalyticsScreen'));
const AssignmentsScreen        = cacheAwareLazy('AssignmentsScreen',        () => import('../screens/AssignmentsScreen'));
const GradesScreen             = cacheAwareLazy('GradesScreen',             () => import('../screens/GradesScreen'));
const LearningScreen           = cacheAwareLazy('LearningScreen',           () => import('../screens/LearningScreen'));
const StreakDetailScreen        = cacheAwareLazy('StreakDetailScreen',       () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen        = cacheAwareLazy('AgentHistoryScreen',      () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen  = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));
const ContentLibraryScreen      = cacheAwareLazy('ContentLibraryScreen',     () => import('../screens/ContentLibraryScreen'));

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
    background: '#080510',
    card:        'transparent',
    border:      'transparent',
    text:        '#f2f2f7',
  },
};

// --- AsyncStorage Keys -------------------------------------------------------
const NAV_ROUTE_KEY = '@zentrack_last_route';

// --- Synchronous Memory Cache ------------------------------------------------
// 0ms background/foreground tracking (no async needed)
let lastBackgroundTimestamp: number | null = null;

const ALLOWED_SAVE_ROUTES = new Set([
  'Home', 'Tasks', 'Gym', 'Calendar', 'Habits',
  'Attendance', 'Analytics', 'WeeklyReview',
  'StudyRoom', 'Notes', 'Assignments', 'Grades', 'Learning',
]);

// --- SARA FAB visibility -----------------------------------------------------
const SARA_VISIBLE_ROUTES = new Set(['Home', 'Tasks', 'Analytics']);

// --- Screens that are ALWAYS synchronously available -------------------------
// When these are in pinnedModules, they mount at launch with Home: 0ms tap cost.
// Using staggered delays so they silently render in the background one by one!
const SYNC_SCREEN_MAP: Record<string, React.ComponentType<any>> = {
  Tasks:      TasksScreen,
  Attendance: AttendanceScreen,
  Gym:        GymStack,
  Calendar:   CalendarScreen,
};

// --- Lazy screen map for non-sync screens ------------------------------------
const LAZY_COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  Habits:       HabitsScreen,
  Analytics:    AnalyticsScreen,
  WeeklyReview: WeeklyReviewScreen,
  StudyRoom:    StudyRoomScreen,
  Notes:        NotesScreen,
  Assignments:  AssignmentsScreen,
  Grades:       GradesScreen,
  Learning:     LearningScreen,
  ContentLibrary: ContentLibraryScreen,
};

// Full combined map (sync screens first for priority)
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  ...SYNC_SCREEN_MAP,
  ...LAZY_COMPONENT_MAP,
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
  const effectivePinned = (Array.isArray(pinnedModules) && pinnedModules.length > 0)
    ? pinnedModules
    : ['Tasks', 'Gym', 'Calendar', 'Attendance'];

  const onTabFocus = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  // Background-prefetch lazy screens once on mount (after first render).
  // We read pinnedModules via ref so the effect never re-fires on re-renders,
  // keeping startup ultra-lean. Pinned screens are prioritised in the queue.
  const pinnedModulesRef = useRef(effectivePinned);
  pinnedModulesRef.current = effectivePinned;
  useEffect(() => { startPrefetching(pinnedModulesRef.current); }, []);

  const badges = useTabBarBadges();

  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} badges={badges} />, [badges]);

  return (
    <Tab.Navigator
      initialRouteName={initialTab}
      tabBar={renderTabBar}
      screenListeners={({ route }) => ({
        focus: () => onTabFocus(route.name),
      })}
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        sceneStyle:  { backgroundColor: '#080510' },
        lazy:        true,
        freezeOnBlur: false,
        animation:   'fade',
      }}
      backBehavior="history"
    >
      <Tab.Screen name="Home" component={SafeDashboard} options={{ lazy: false }} />
      {Object.keys(COMPONENT_MAP).map((modId) => {
        const isPinned     = effectivePinned.includes(modId);
        const isSyncScreen = modId in SYNC_SCREEN_MAP;
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
              lazy: false,
            }}
          />
        );
      })}
      <Tab.Screen name="More" component={withErrorBoundary(MoreScreen, 'More')} options={{ lazy: false }} />
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
        <Stack.Screen name="ContentLibrary"        component={withErrorBoundary(ContentLibraryScreen,        'ContentLibrary')} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// --- Root authenticated navigator + global SARA FAB --------------------------
function RootNavigatorWithSara({ initialTab }: { initialTab: string }) {
  const { colors }        = useTheme();
  const [saraVisible, setSaraVisible] = useState(false);

  // Memoised -- prevents MainTabNavigator from remounting on any parent state change.
  const MainTabsScreen = useCallback(
    () => <MainTabNavigator initialTab={initialTab} />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
    <View style={{ flex: 1, backgroundColor: '#080510' }}>
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

  const [wasLoggedIn, setWasLoggedIn] = useState(false);

  useEffect(() => {
    const boot = async () => {
      try {
        const [[, savedTab], [, onboardedVal], [, optimisticUserStr]] =
          await AsyncStorage.multiGet([NAV_ROUTE_KEY, ONBOARDING_KEY, '@zentrack_optimistic_user']);
        
        // Cold boot: always Home (WhatsApp/Instagram standard).
        setInitialTab('Home');
        if (onboardedVal) setOnboarded(onboardedVal === 'true');
        
        // WhatsApp-style Optimistic Boot: If we have a cached user profile, boot instantly!
        if (optimisticUserStr) {
          try {
            const optimisticUser = JSON.parse(optimisticUserStr);
            setUser(optimisticUser as User);
            setAppReady(true);
            hasResolved.current = true; // Mark as resolved so Firebase background check doesn't double-boot
          } catch {}
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
        if (u) {
          AsyncStorage.setItem('@zentrack_optimistic_user', JSON.stringify({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
          })).catch(() => {});
        } else {
          AsyncStorage.removeItem('@zentrack_optimistic_user').catch(() => {});
        }
      };

      if (!hasResolved.current) {
        // We only hit this block if we did NOT have an optimistic user (i.e. fresh install or logged out)
        await auth.authStateReady();
        const realUser = auth.currentUser;

        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(realUser);
        setAppReady(true);
        saveOptimisticUser(realUser);
        return;
      }

      // Background Validation: We booted optimistically, now Firebase is checking the real token
      if (!usr) {
        // Null within 3s of first resolution = token refresh, NOT logout
        if (Date.now() - firstAuthAt.current < 3000) return;
        setUser(null);
        saveOptimisticUser(null);
      } else {
        setUser(usr);
        saveOptimisticUser(usr);
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
            Alert.alert(
              'Update Available',
              'A new version of ZenTrack is ready. Apply now?',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Update',
                  onPress: async () => {
                    try {
                      await Updates.fetchUpdateAsync();
                      await Updates.reloadAsync();
                    } catch {
                      Alert.alert('Error', 'Could not apply update. Try again later.');
                    }
                  },
                },
              ]
            );
          }
        } catch { /* offline -- skip silently */ }
      })();
    }

    // AppState heartbeat & Lifecycle
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
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
    };
  }, []);

  const onNavStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) DeviceEventEmitter.emit('route_changed', routeName);
  }, []);

  // CRITICAL: Do not mount the navigation tree until we know the user's auth state.
  // Otherwise, React Native renders the LandingScreen in the background, and if the 
  // native splash screen hides a millisecond too early, the user sees it flash.
  if (!appReady) {
    return <View style={{ flex: 1, backgroundColor: '#080510' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#080510' }}>
      <NavigationContainer
        ref={navigationRef}
        theme={ZEN_DARK_THEME}
        onStateChange={onNavStateChange}
        onReady={() => {
          // Hide splash ONLY after React Native has fully painted the final tree!
          SplashScreen.hideAsync();
        }}
      >
        {user ? (
          !onboarded ? (
            <ErrorBoundary screenName="Onboarding">
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }}>
                <Stack.Screen name="Onboarding">
                  {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
                </Stack.Screen>
              </Stack.Navigator>
            </ErrorBoundary>
          ) : (
            <RootNavigatorWithSara initialTab={initialTab} />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }}>
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
