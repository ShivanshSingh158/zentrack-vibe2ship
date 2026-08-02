import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, DeviceEventEmitter, Pressable } from 'react-native';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  DarkTheme,
  useNavigation,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { auth } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { setupNetworkListener } from '../services/offlineSync';
import { cacheAwareLazy, startPrefetching } from '../utils/ModulePrefetcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRUTAL_QUOTES } from '../data/brutalQuotes';
import { RADIUS, FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import { feedback } from '../utils/haptics';
import ErrorBoundary from '../components/ErrorBoundary';

// ─── Critical screens (synchronous imports — always ready) ────────────────────
import LandingScreen from '../screens/LandingScreen';
import GuestDashboard from '../screens/GuestDashboard';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GymStack from './GymStack';
import SaraScreen from '../screens/SaraScreen';
import NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';

// ─── Lazy screens (prefetched after login) ────────────────────────────────────
const HabitsScreen          = cacheAwareLazy('HabitsScreen',          () => import('../screens/HabitsScreen'));
const NotesScreen           = cacheAwareLazy('NotesScreen',           () => import('../screens/NotesScreen'));
const AttendanceScreen      = cacheAwareLazy('AttendanceScreen',      () => import('../screens/AttendanceScreen'));
const WeeklyReviewScreen    = cacheAwareLazy('WeeklyReviewScreen',    () => import('../screens/WeeklyReviewScreen'));
const StudyRoomScreen       = cacheAwareLazy('StudyRoomScreen',       () => import('../screens/StudyRoomScreen'));
const AnalyticsScreen       = cacheAwareLazy('AnalyticsScreen',       () => import('../screens/AnalyticsScreen'));
const AssignmentsScreen     = cacheAwareLazy('AssignmentsScreen',     () => import('../screens/AssignmentsScreen'));
const GradesScreen          = cacheAwareLazy('GradesScreen',          () => import('../screens/GradesScreen'));
const LearningScreen        = cacheAwareLazy('LearningScreen',        () => import('../screens/LearningScreen'));
const StreakDetailScreen     = cacheAwareLazy('StreakDetailScreen',    () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen     = cacheAwareLazy('AgentHistoryScreen',   () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));

// ─── Navigators ───────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Exported for imperative navigation from notification handlers in App.tsx
export const navigationRef = createNavigationContainerRef<any>();

// ─── Navigation Theme ─────────────────────────────────────────────────────────
const ZEN_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#080510',   // matches Android windowBackground in styles.xml
    card:        'transparent',
    border:      'transparent',
    text:        '#f2f2f7',
  },
};

// ─── Route persistence ────────────────────────────────────────────────────────
const NAV_ROUTE_KEY = '@zentrack_last_route';
const ALLOWED_SAVE_ROUTES = new Set([
  'Home', 'Tasks', 'Gym', 'Calendar', 'Habits',
  'Attendance', 'Analytics', 'WeeklyReview',
  'StudyRoom', 'Notes', 'Assignments', 'Grades', 'Learning',
]);

// ─── SARA FAB visibility ──────────────────────────────────────────────────────
const SARA_VISIBLE_ROUTES = new Set(['Home', 'Tasks', 'Analytics']);

// ─── SplashLoader ─────────────────────────────────────────────────────────────
// Shown as a full-screen OVERLAY on top of the NavigationContainer while the
// app is initialising. The NavigationContainer itself is always mounted.
export function SplashLoader() {
  const { colors } = useTheme();
  const pulseScale  = useSharedValue(0.9);
  const fadeOpacity = useSharedValue(0);

  const [quote] = useState(
    () => BRUTAL_QUOTES[Math.floor(Math.random() * BRUTAL_QUOTES.length)]
  );

  useEffect(() => {
    fadeOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
    pulseScale.value  = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.96, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true
    );
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(fadeOpacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   fadeOpacity.value,
  }));

  return (
    <View style={splash.container}>
      <Animated.View style={[splash.inner, animStyle]}>
        <Text style={[splash.quote, { color: colors.textPrimary }]}>
          "{quote.text}"
        </Text>
        <Text style={[splash.author, { color: colors.textSecondary }]}>
          — {quote.author}
        </Text>
      </Animated.View>
    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080510',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 9999,      // on top of NavigationContainer
  },
  inner: { alignItems: 'center', gap: 16 },
  quote: {
    fontFamily: FONT_FAMILY.serif,
    fontSize: 22,
    lineHeight: 32,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  author: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 2,
    marginTop: 8,
    textTransform: 'uppercase',
  },
});

// ─── Nested screen header ─────────────────────────────────────────────────────
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

// ─── Component map for tab screens ───────────────────────────────────────────
const COMPONENT_MAP: Record<string, any> = {
  Tasks:        TasksScreen,
  Sara:         SaraScreen,
  Calendar:     CalendarScreen,
  Habits:       HabitsScreen,
  Gym:          GymStack,
  Attendance:   AttendanceScreen,
  Analytics:    AnalyticsScreen,
  WeeklyReview: WeeklyReviewScreen,
  StudyRoom:    StudyRoomScreen,
  Notes:        NotesScreen,
  Assignments:  AssignmentsScreen,
  Grades:       GradesScreen,
  Learning:     LearningScreen,
};

// ─── Main Tab Navigator ───────────────────────────────────────────────────────
// initialTab is a STABLE PROP passed at mount time from AsyncStorage.
// It never changes after mount — this is the WhatsApp pattern.
function MainTabNavigator({ initialTab }: { initialTab: string }) {
  const { colors }       = useTheme();
  const { pinnedModules } = useMobileData();

  // Save current route to AsyncStorage on every tab focus
  const onTabFocus = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  // Prefetch lazy screens after initial render
  useEffect(() => { startPrefetching(pinnedModules); }, [pinnedModules]);

  return (
    <ErrorBoundary screenName="Tab Navigator">
      <Tab.Navigator
        initialRouteName={initialTab}
        screenListeners={({ route }) => ({
          focus: () => onTabFocus(route.name),
        })}
        screenOptions={({ route }) => ({
          headerShown: false,
          // sceneStyle ensures every tab screen background is dark — no white flash
          sceneStyle: { backgroundColor: '#080510' },
          tabBarShowLabel:        true,
          tabBarActiveTintColor:  colors.accentPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize:    10,
            fontFamily:  FONT_FAMILY.body,
            marginTop:   4,
            marginBottom: 0,
          },
          tabBarItemStyle:  { paddingVertical: 10 },
          tabBarStyle:      styles.tabBar,
          tabBarBackground: () => (
            <View style={[styles.tabBarBackground, { backgroundColor: 'rgba(10, 10, 10, 0.95)' }]} />
          ),
          tabBarIcon: ({ color, size, focused }) => {
            const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
              Home:         { active: 'home',            inactive: 'home-outline' },
              Tasks:        { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
              Sara:         { active: 'planet',           inactive: 'planet-outline' },
              Calendar:     { active: 'calendar',         inactive: 'calendar-outline' },
              Habits:       { active: 'flame',            inactive: 'flame-outline' },
              Gym:          { active: 'barbell',          inactive: 'barbell-outline' },
              Attendance:   { active: 'clipboard',        inactive: 'clipboard-outline' },
              Analytics:    { active: 'bar-chart',        inactive: 'bar-chart-outline' },
              Notes:        { active: 'document-text',    inactive: 'document-text-outline' },
              Assignments:  { active: 'book',             inactive: 'book-outline' },
              Grades:       { active: 'calculator',       inactive: 'calculator-outline' },
              Learning:     { active: 'library',          inactive: 'library-outline' },
              More:         { active: 'grid',             inactive: 'grid-outline' },
            };
            const iconSet  = icons[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
            const iconName = focused ? iconSet.active : iconSet.inactive;

            if (route.name === 'Sara') {
              return (
                <View style={[styles.saraTab, {
                  borderColor:     focused ? colors.textPrimary : 'transparent',
                  backgroundColor: focused ? colors.surface2    : 'transparent',
                }]}>
                  <Ionicons name={iconName} size={size + 4} color={focused ? colors.textPrimary : colors.textMuted} />
                </View>
              );
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
        backBehavior="history"
      >
        <Tab.Screen name="Home" component={DashboardScreen} />
        {Object.keys(COMPONENT_MAP).map((modId) => {
          const isPinned = pinnedModules.includes(modId);
          return (
            <Tab.Screen
              key={modId}
              name={modId}
              component={COMPONENT_MAP[modId]}
              options={{ tabBarItemStyle: !isPinned ? { display: 'none' } : { paddingVertical: 10 } }}
            />
          );
        })}
        <Tab.Screen name="More" component={MoreScreen} />
      </Tab.Navigator>
    </ErrorBoundary>
  );
}

// ─── Nested screens stack ─────────────────────────────────────────────────────
function NestedScreens() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary screenName="Screen">
      <Stack.Navigator
        screenOptions={{
          header:          ({ route }) => <NestedHeader title={route.name} />,
          contentStyle:    { backgroundColor: colors.background },
          animation:       'slide_from_right',
          animationDuration: 180,
        }}
      >
        <Stack.Screen name="Settings"              component={SettingsScreen} />
        <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Sara"                  component={SaraScreen}     options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StreakDetail"          component={StreakDetailScreen} />
        <Stack.Screen name="SaraModal"             component={SaraScreen}     options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="AgentHistory"          component={AgentHistoryScreen} />
        <Stack.Screen name="WellbeingDashboard"    component={WellbeingDashboardScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ─── Root authenticated navigator + global SARA FAB ──────────────────────────
// initialTab is frozen at mount via useCallback — never triggers re-render.
function RootNavigatorWithSara({ initialTab }: { initialTab: string }) {
  const { colors }       = useTheme();
  const [saraVisible, setSaraVisible] = useState(false);

  // Memoised component — prevents MainTabNavigator from re-mounting on any parent state change
  const MainTabsScreen = useCallback(
    () => <MainTabNavigator initialTab={initialTab} />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally stable — initialTab must never cause a re-mount
  );

  // SARA FAB visibility driven by route changes from NavigationContainer.onStateChange
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

      {/* Global SARA FAB — only on Home, Tasks, Analytics */}
      {showSara && (
        <AnimatedPressable
          style={styles.globalSaraBtn}
          onPress={() => { feedback.commit(); setSaraVisible(true); }}
          haptic="heavy"
        >
          <Ionicons name="planet" size={26} color={colors.accentPrimary} />
        </AnimatedPressable>
      )}

      {/* Global SARA Modal */}
      <SaraScreen isGlobalModal={true} visible={saraVisible} onClose={() => setSaraVisible(false)} />
    </View>
  );
}

// ─── AppNavigator — Root ──────────────────────────────────────────────────────
//
// WHATSAPP-GRADE ARCHITECTURE:
//
// KEY INSIGHT: The NavigationContainer ALWAYS renders, even during the splash.
// The splash is shown as a full-screen OVERLAY (absolute, zIndex: 9999) on top
// of the container — NOT as an early return that unmounts the container.
//
// This means:
// 1. Android's native window always has React content — no grey flash on resume.
// 2. The container's native view tree persists across auth state changes.
// 3. Screens keep their state when you switch away — just like WhatsApp.
//
// AUTH GUARD:
// Firebase fires onAuthStateChanged(null) during token refresh (every ~1h).
// We ignore nulls for 3 seconds after the first auth resolution to avoid
// flashing the login screen during a routine token refresh.
// Intentional logout (user.signOut()) sets a flag BEFORE the null fires.

export default function AppNavigator() {
  // ── Startup state (never changes after boot) ────────────────────────────────
  const [appReady,    setAppReady]    = useState(false);    // both auth + AsyncStorage resolved
  const [user,        setUser]        = useState<User | null>(null);
  const [onboarded,   setOnboarded]   = useState(true);
  const [initialTab,  setInitialTab]  = useState('Home');   // stable after first read

  // ── Auth guards ─────────────────────────────────────────────────────────────
  const firstAuthAt    = useRef<number>(0);                 // timestamp of first auth resolution
  const hasResolved    = useRef(false);                     // true after first auth callback

  useEffect(() => {
    // Read saved tab + onboarding flag from AsyncStorage BEFORE rendering anything.
    // This is the ONLY read — it never changes after boot.
    const bootRead = AsyncStorage.multiGet([NAV_ROUTE_KEY, ONBOARDING_KEY])
      .then(([[, savedTab], [, onboardedVal]]) => {
        if (savedTab && ALLOWED_SAVE_ROUTES.has(savedTab)) setInitialTab(savedTab);
        setOnboarded(onboardedVal === 'true');
      })
      .catch(() => {}); // safe fallback to defaults

    // Firebase auth listener — one subscription, lives forever
    const unsubAuth = onAuthStateChanged(auth, async (usr) => {
      if (!hasResolved.current) {
        // FIRST resolution — could be logged in or cold boot with no session
        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(usr);
        if (usr) {
          // Re-read onboarding in case it changed during this session
          const val = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
          setOnboarded(val === 'true');
        }
        // Mark app as ready ONLY after BOTH async reads are done
        await bootRead;
        setAppReady(true);
        return;
      }

      // Subsequent auth callbacks (token refresh OR real logout)
      if (!usr) {
        // null callback within 3 seconds of first resolution = token refresh, NOT logout
        // null callback after 3 seconds = real logout (user tapped sign out)
        const msSinceFirst = Date.now() - firstAuthAt.current;
        if (msSinceFirst < 3000) return; // ignore token-refresh null
        setUser(null);
      } else {
        // Token refresh restored the user — update silently
        setUser(usr);
      }
    });

    // Backend warmup (prevents 60-second cold start on Render free tier)
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://zentrack-vibe2ship.onrender.com';
    fetch(`${backendUrl}/health`).catch(() => {});

    // OTA update check (rate-limited to once per hour to avoid network hits on every launch)
    if (!__DEV__) {
      (async () => {
        try {
          const HOUR_MS  = 60 * 60 * 1000;
          const lastCheck = await AsyncStorage.getItem('@zentrack_last_update_check').catch(() => null);
          if (lastCheck && Date.now() - parseInt(lastCheck, 10) < HOUR_MS) return;
          await AsyncStorage.setItem('@zentrack_last_update_check', String(Date.now()));
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            Alert.alert(
              'Update Available',
              'A new version of ZenTrack is available. Download now?',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Update Now',
                  onPress: async () => {
                    try {
                      await Updates.fetchUpdateAsync();
                      await Updates.reloadAsync();
                    } catch {
                      Alert.alert('Error', 'Failed to apply update.');
                    }
                  },
                },
              ]
            );
          }
        } catch { /* offline — silently skip */ }
      })();
    }

    const unsubNetwork = setupNetworkListener();

    return () => {
      unsubAuth();
      unsubNetwork();
    };
  }, []);

  // ── Route tracking ──────────────────────────────────────────────────────────
  const onNavStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) DeviceEventEmitter.emit('route_changed', routeName);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  // CRITICAL: NavigationContainer ALWAYS renders. The splash is an overlay on top,
  // never an early return. This is what prevents the grey screen on resume.
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
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }}>
                <Stack.Screen name="Onboarding">
                  {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
                </Stack.Screen>
              </Stack.Navigator>
            </ErrorBoundary>
          ) : (
            // No key prop — this must NEVER remount
            <RootNavigatorWithSara initialTab={initialTab} />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#080510' } }}>
            <Stack.Screen name="Landing"       component={LandingScreen} />
            <Stack.Screen name="GuestDashboard" component={GuestDashboard} />
            <Stack.Screen name="Auth"           component={AuthScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>

      {/* Splash overlay — sits ABOVE the NavigationContainer until app is ready.
          Fades out instead of unmounting, so the native view beneath stays warm. */}
      {!appReady && <SplashLoader />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    position:    'absolute',
    bottom:       20,
    left:         20,
    right:        20,
    borderRadius: RADIUS.xxl,
    borderWidth:  1,
    borderColor:  'rgba(255,255,255,0.08)',
    elevation:    20,
    height:       70,
    overflow:     'hidden',
    backgroundColor: 'transparent',
    paddingBottom: 0,
  },
  tabBarBackground: {
    flex:          1,
    borderRadius:  RADIUS.xxl,
    overflow:      'hidden',
  },
  saraTab: {
    width:          42,
    height:         42,
    borderRadius:   21,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACE.xl,
    paddingBottom:   SPACE.md,
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
