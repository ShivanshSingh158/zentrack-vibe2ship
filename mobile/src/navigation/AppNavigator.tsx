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
import { auth } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { cacheAwareLazy, startPrefetching } from '../utils/ModulePrefetcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
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
};

// Full combined map (sync screens first for priority)
const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  ...SYNC_SCREEN_MAP,
  ...LAZY_COMPONENT_MAP,
};

// --- SplashLoader ------------------------------------------------------------
//
// Full-screen overlay shown while Firebase auth resolves (~800ms avg).
// Shows a random brutal quote for character — loaded DYNAMICALLY in an effect,
// never at module parse time, so it never delays startup.
//
// Architecture: native splash shows the app icon → JS hydrates → this overlay
// shows a quote for the auth wait time → fades out smoothly → home screen.
//
// CRITICAL: ALL hooks must be called BEFORE any conditional return (React rules).

export function SplashLoader({ ready = false }: { ready?: boolean }) {
  const overlayOpacity = useSharedValue(1);
  const textOpacity    = useSharedValue(0);
  const [hidden, setHidden] = useState(false);
  const [quote, setQuote]   = useState<{ text: string; author: string } | null>(null);

  // ALL hooks before any conditional return ─────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const textStyle    = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  // Load quote dynamically AFTER first render so it never blocks JS startup
  useEffect(() => {
    // Dynamic require — not a module-level import, so it's excluded from the
    // synchronous parse/eval cost of this file.
    const { BRUTAL_QUOTES, PERSONALITY_QUOTES } = require('../data/brutalQuotes') as any;
    const allQuotes = [...BRUTAL_QUOTES, ...PERSONALITY_QUOTES['consistent'], ...PERSONALITY_QUOTES['momentum-builder'], ...PERSONALITY_QUOTES['binge-worker']];
    const picked = allQuotes[Math.floor(Math.random() * allQuotes.length)];
    setQuote(picked);
    // Fade in the quote text once loaded
    textOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
  }, []);

  // Fade out the whole overlay once auth resolves
  useEffect(() => {
    if (!ready) return;
    overlayOpacity.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.ease) }, (finished) => {
      if (finished) runOnJS(setHidden)(true);
    });
  }, [ready]);

  if (hidden) return null;

  return (
    <Animated.View style={[splash.container, overlayStyle]} pointerEvents="none">
      {quote && (
        <Animated.View style={[splash.inner, textStyle]}>
          <Text style={splash.quote}>"{quote.text}"</Text>
          <Text style={splash.author}>— {quote.author}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const splash = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080510',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 36,
    zIndex:           9999,
  },
  inner: {
    alignItems: 'center',
    gap:        16,
  },
  quote: {
    fontFamily:  FONT_FAMILY.serif,
    fontSize:    20,
    lineHeight:  30,
    color:       '#f2f2f7',
    textAlign:   'center',
    fontStyle:   'italic',
  },
  author: {
    fontFamily:    FONT_FAMILY.regular,
    fontSize:      12,
    color:         'rgba(242,242,247,0.45)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

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

  const onTabFocus = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  // Background-prefetch lazy (non-sync-imported) screens after interactions settle.
  // Pinned screens that are sync-imported don't need prefetching.
  useEffect(() => { startPrefetching(pinnedModules); }, [pinnedModules]);

  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} />, []);

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
        sceneStyle:  { backgroundColor: '#080510' },
        lazy:        true,
        freezeOnBlur: false,
        animation:   'shift',
      }}
      backBehavior="history"
    >
      <Tab.Screen name="Home" component={SafeDashboard} options={{ lazy: false }} />
      {Object.keys(COMPONENT_MAP).map((modId) => {
        const isPinned     = pinnedModules.includes(modId);
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
        detachInactiveScreens={true}
        screenOptions={{
          header:            ({ route }) => <NestedHeader title={route.name} />,
          contentStyle:      { backgroundColor: colors.background },
          animation:         'slide_from_right',
          animationDuration: 180,
          customAnimationOnGesture: true,
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

  const [showSara, setShowSara] = useState(SARA_VISIBLE_ROUTES.has(initialTab));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('route_changed', (routeName: string) => {
      setShowSara(SARA_VISIBLE_ROUTES.has(routeName));
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#080510' }}>
      <Stack.Navigator screenOptions={{ headerShown: false }} detachInactiveScreens={true}>
        <Stack.Screen name="MainTabs" component={MainTabsScreen} />
        <Stack.Group screenOptions={{ presentation: 'card' }}>
          <Stack.Screen name="MoreStack" component={NestedScreens} />
        </Stack.Group>
      </Stack.Navigator>

      {showSara && (
        <AnimatedPressable
          style={styles.globalSaraBtn}
          onPress={() => { feedback.commit(); setSaraVisible(true); }}
          haptic="heavy"
        >
          <Ionicons name="planet" size={26} color={colors.accentPrimary} />
        </AnimatedPressable>
      )}

      <SaraScreen isGlobalModal={true} visible={saraVisible} onClose={() => setSaraVisible(false)} />
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

  useEffect(() => {
    const boot = async () => {
      try {
        const [[, savedTab], [, onboardedVal]] =
          await AsyncStorage.multiGet([NAV_ROUTE_KEY, ONBOARDING_KEY]);
        // Cold boot: always Home (WhatsApp/Instagram standard).
        setInitialTab('Home');
        if (onboardedVal) setOnboarded(onboardedVal === 'true');
      } catch {
        // Safe fallback: Home, onboarded=true
      }
    };

    const bootPromise = boot();

    // Firebase auth listener -- one subscription, lives forever
    const unsubAuth = onAuthStateChanged(auth, async (usr) => {
      if (!hasResolved.current) {
        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(usr);
        if (usr) {
          const val = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
          setOnboarded(val === 'true');
        }
        await bootPromise;
        setAppReady(true);
        return;
      }

      if (!usr) {
        // Null within 3s of first resolution = token refresh, NOT logout
        if (Date.now() - firstAuthAt.current < 3000) return;
        setUser(null);
      } else {
        setUser(usr);
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

  return (
    <View style={{ flex: 1, backgroundColor: '#080510' }}>
      <NavigationContainer
        ref={navigationRef}
        theme={ZEN_DARK_THEME}
        onStateChange={onNavStateChange}
      >
        {user ? (
          !onboarded ? (
            <ErrorBoundary screenName="Onboarding">
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }} detachInactiveScreens={false}>
                <Stack.Screen name="Onboarding">
                  {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
                </Stack.Screen>
              </Stack.Navigator>
            </ErrorBoundary>
          ) : (
            <RootNavigatorWithSara initialTab={initialTab} />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }} detachInactiveScreens={false}>
            <Stack.Screen name="Landing"        component={LandingScreen} />
            <Stack.Screen name="GuestDashboard" component={GuestDashboard} />
            <Stack.Screen name="Auth"           component={AuthScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>

      {/* Splash overlay -- sits ABOVE NavigationContainer.
          SplashLoader self-destructs after its 350ms fade-out completes.
          The native view beneath stays warm -- no grey flash ever. */}
      <SplashLoader ready={appReady} />
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
    borderWidth:      1,
    borderColor:      'rgba(165,153,255,0.4)',
    alignItems:       'center',
    justifyContent:   'center',
    overflow:         'hidden',
    backgroundColor:  'rgba(165,153,255,0.1)',
    shadowColor:      '#a599ff',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.3,
    shadowRadius:     8,
    elevation:        8,
  },
});
