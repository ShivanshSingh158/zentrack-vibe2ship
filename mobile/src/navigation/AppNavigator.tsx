import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, AppState, Alert, DeviceEventEmitter } from 'react-native';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
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

// ─── Critical screens ─────────────────────────────────────────────────────────
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

// ─── Lazy screens ─────────────────────────────────────────────────────────────
const HabitsScreen = cacheAwareLazy('HabitsScreen', () => import('../screens/HabitsScreen'));
const NotesScreen = cacheAwareLazy('NotesScreen', () => import('../screens/NotesScreen'));
const AttendanceScreen = cacheAwareLazy('AttendanceScreen', () => import('../screens/AttendanceScreen'));
const WeeklyReviewScreen = cacheAwareLazy('WeeklyReviewScreen', () => import('../screens/WeeklyReviewScreen'));
const StudyRoomScreen = cacheAwareLazy('StudyRoomScreen', () => import('../screens/StudyRoomScreen'));
const AnalyticsScreen = cacheAwareLazy('AnalyticsScreen', () => import('../screens/AnalyticsScreen'));
const AssignmentsScreen = cacheAwareLazy('AssignmentsScreen', () => import('../screens/AssignmentsScreen'));
const GradesScreen = cacheAwareLazy('GradesScreen', () => import('../screens/GradesScreen'));
const LearningScreen = cacheAwareLazy('LearningScreen', () => import('../screens/LearningScreen'));
const StreakDetailScreen = cacheAwareLazy('StreakDetailScreen', () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen = cacheAwareLazy('AgentHistoryScreen', () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));

// ─── Navigators ───────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Exported for imperative navigation from notification handlers in App.tsx
export const navigationRef = createNavigationContainerRef<any>();

const ZEN_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0a090c',
    card: 'transparent',
    border: 'transparent',
    text: '#f2f2f7',
  },
};

// ─── AsyncStorage key for saved route ────────────────────────────────────────
const NAV_ROUTE_KEY = '@zentrack_last_route';
const ALLOWED_SAVE_ROUTES = new Set([
  'Home', 'Tasks', 'Gym', 'Calendar', 'Habits',
  'Attendance', 'Analytics', 'WeeklyReview',
  'StudyRoom', 'Notes', 'Assignments', 'Grades', 'Learning',
]);

// ─── SplashLoader ─────────────────────────────────────────────────────────────
export function SplashLoader() {
  const { colors } = useTheme();
  const pulseScale = useSharedValue(0.9);
  const fadeOpacity = useSharedValue(0);
  const [quote] = useState(
    () => BRUTAL_QUOTES[Math.floor(Math.random() * BRUTAL_QUOTES.length)]
  );

  useEffect(() => {
    fadeOpacity.value = withTiming(1, { duration: 600 });
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(fadeOpacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: fadeOpacity.value,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#080510', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Animated.View style={[{ alignItems: 'center', gap: 16 }, animStyle]}>
        <Text style={{ fontFamily: FONT_FAMILY.serif, color: colors.textPrimary, fontSize: 22, lineHeight: 32, textAlign: 'center', fontStyle: 'italic' }}>
          "{quote.text}"
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.mono, color: colors.textSecondary, fontSize: 12, textAlign: 'center', letterSpacing: 2, marginTop: 8, textTransform: 'uppercase' }}>
          — {quote.author}
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Nested screen header ─────────────────────────────────────────────────────
function NestedHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
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
  Tasks: TasksScreen,
  Sara: SaraScreen,
  Calendar: CalendarScreen,
  Habits: HabitsScreen,
  Gym: GymStack,
  Attendance: AttendanceScreen,
  Analytics: AnalyticsScreen,
  WeeklyReview: WeeklyReviewScreen,
  StudyRoom: StudyRoomScreen,
  Notes: NotesScreen,
  Assignments: AssignmentsScreen,
  Grades: GradesScreen,
  Learning: LearningScreen,
};

// ─── Main Tab Navigator ───────────────────────────────────────────────────────
// Props: initialTab is passed directly at render time after we've read AsyncStorage.
// This is the ONLY safe way to restore a tab — via initialRouteName at mount time.
function MainTabNavigator({ initialTab }: { initialTab: string }) {
  const { colors } = useTheme();
  const { pinnedModules } = useMobileData();

  // Save current route on tab change
  const handleTabPress = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  useEffect(() => {
    startPrefetching(pinnedModules);
  }, [pinnedModules]);

  return (
    <ErrorBoundary screenName="Tab Navigator">
      <Tab.Navigator
        initialRouteName={initialTab}
        screenListeners={({ route }) => ({
          focus: () => {
            handleTabPress(route.name);
          },
        })}
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.accentPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: FONT_FAMILY.body,
            marginTop: 4,
            marginBottom: 0,
          },
          tabBarItemStyle: { paddingVertical: 10 },
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <View style={[styles.tabBarBackground, { backgroundColor: 'rgba(10, 10, 10, 0.95)' }]} />
          ),
          tabBarIcon: ({ color, size, focused }) => {
            const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
              Home: { active: 'home', inactive: 'home-outline' },
              Tasks: { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
              Sara: { active: 'planet', inactive: 'planet-outline' },
              Calendar: { active: 'calendar', inactive: 'calendar-outline' },
              Habits: { active: 'flame', inactive: 'flame-outline' },
              Gym: { active: 'barbell', inactive: 'barbell-outline' },
              Attendance: { active: 'clipboard', inactive: 'clipboard-outline' },
              Analytics: { active: 'bar-chart', inactive: 'bar-chart-outline' },
              Notes: { active: 'document-text', inactive: 'document-text-outline' },
              Assignments: { active: 'book', inactive: 'book-outline' },
              Grades: { active: 'calculator', inactive: 'calculator-outline' },
              Learning: { active: 'library', inactive: 'library-outline' },
              More: { active: 'grid', inactive: 'grid-outline' },
            };
            const iconSet = icons[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
            const iconName = focused ? iconSet.active : iconSet.inactive;
            if (route.name === 'Sara') {
              return (
                <View style={[styles.saraTab, { borderColor: focused ? colors.textPrimary : 'transparent', backgroundColor: focused ? colors.surface2 : 'transparent' }]}>
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
              options={{
                tabBarItemStyle: !isPinned ? { display: 'none' } : { paddingVertical: 10 },
              }}
            />
          );
        })}
        <Tab.Screen name="More" component={MoreScreen} />
      </Tab.Navigator>
    </ErrorBoundary>
  );
}

// ─── Nested screens stack (Settings, Sara modal, etc.) ────────────────────────
function NestedScreens() {
  const { colors } = useTheme();
  return (
    <ErrorBoundary screenName="Screen">
      <Stack.Navigator
        screenOptions={{
          header: ({ route }) => <NestedHeader title={route.name} />,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          animationDuration: 180,
        }}
      >
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Sara" component={SaraScreen} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StreakDetail" component={StreakDetailScreen} />
        <Stack.Screen name="SaraModal" component={SaraScreen} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="AgentHistory" component={AgentHistoryScreen} />
        <Stack.Screen name="WellbeingDashboard" component={WellbeingDashboardScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ─── Root authenticated navigator with SARA FAB ───────────────────────────────
function RootNavigatorWithSara({ initialTab }: { initialTab: string }) {
  const { colors } = useTheme();
  const [saraVisible, setSaraVisible] = useState(false);

  // Pass initialTab down as a prop — stable, no hooks needed for route tracking here
  const MainTabsScreen = useCallback(
    () => <MainTabNavigator initialTab={initialTab} />,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally empty — initialTab must never change after mount
  );

  // Read active route to only show SARA on Home, Tasks, and Analytics
  const ALLOWED_SARA_ROUTES = ['Home', 'Tasks', 'Analytics'];
  const [hideSara, setHideSara] = useState(!ALLOWED_SARA_ROUTES.includes(initialTab));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('route_changed', (routeName: string) => {
      setHideSara(!ALLOWED_SARA_ROUTES.includes(routeName));
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabsScreen} />
        <Stack.Group screenOptions={{ presentation: 'card' }}>
          <Stack.Screen name="MoreStack" component={NestedScreens} />
        </Stack.Group>
      </Stack.Navigator>

      {/* Global SARA FAB */}
      {!hideSara && (
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

// ─── Root AppNavigator ────────────────────────────────────────────────────────
//
// ARCHITECTURE — how this works like WhatsApp:
//
// 1. On cold start, we read the saved tab from AsyncStorage BEFORE mounting the
//    NavigationContainer. This means the Tab.Navigator boots with the correct
//    initialRouteName natively — no navigation after mount, no race conditions.
//
// 2. The NavigationContainer is NEVER unmounted after mount. Auth state changes
//    swap the children inside, but the container itself lives forever. This is
//    what prevents the grey screen — the native window never goes blank.
//
// 3. Firebase's onAuthStateChanged(null) during token refresh is ignored after
//    the first auth resolution. The user is never flashed to the login screen.
//
// 4. The AppState listener only exists to save the route on background — it never
//    triggers any state changes that could cause a remount.

export default function AppNavigator() {
  const { colors } = useTheme();

  // Phase 1: startup — read AsyncStorage and wait for Firebase auth.
  // Both must resolve before we show anything.
  const [authResolved, setAuthResolved] = useState(false);
  const [startupResolved, setStartupResolved] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [initialTab, setInitialTab] = useState('Home');

  // Never set authResolved back to false after first resolution
  const hasResolvedOnce = useRef(false);

  useEffect(() => {
    // Load saved tab + onboarding status in parallel
    const loadStartup = async () => {
      const [savedTab, onboardedVal] = await Promise.all([
        AsyncStorage.getItem(NAV_ROUTE_KEY).catch(() => null),
        AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
      ]);
      if (savedTab && ALLOWED_SAVE_ROUTES.has(savedTab)) {
        setInitialTab(savedTab);
      }
      setOnboarded(onboardedVal === 'true');
      setStartupResolved(true);
    };
    loadStartup();

    // Firebase auth — resolves once, then ignores null (token refresh)
    const unsubscribeAuth = onAuthStateChanged(auth, async (usr) => {
      if (hasResolvedOnce.current) {
        // Only update user if they log in/out explicitly — NOT on token refresh nulls
        if (usr) setUser(usr);
        return;
      }
      hasResolvedOnce.current = true;
      setUser(usr || null);
      // Re-read onboarding after auth in case it was set during this session
      if (usr) {
        const val = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
        setOnboarded(val === 'true');
      }
      setAuthResolved(true);
    });

    // Backend warmup (prevents 60s cold start on Render free tier)
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://zentrack-vibe2ship.onrender.com';
    fetch(`${backendUrl}/health`).catch(() => {});

    // OTA update check (rate-limited to once per hour)
    if (!__DEV__) {
      (async () => {
        try {
          const HOUR_MS = 60 * 60 * 1000;
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
        } catch { /* offline — ignore */ }
      })();
    }

    const unsubscribeNetwork = setupNetworkListener();

    return () => {
      unsubscribeAuth();
      unsubscribeNetwork();
    };
  }, []);

  // Show splash until both Firebase auth AND AsyncStorage setup resolves
  if (!authResolved || !startupResolved) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080510' }}>
        <SplashLoader />
      </View>
    );
  }

  return (
    // Permanent dark background. If any React layer briefly unmounts, user
    // sees this #080510 instead of Android's grey window background.
    <View style={{ flex: 1, backgroundColor: '#080510' }}>
      <NavigationContainer 
        ref={navigationRef} 
        theme={ZEN_DARK_THEME}
        onStateChange={() => {
          const currentRouteName = navigationRef.getCurrentRoute()?.name;
          if (currentRouteName) {
            DeviceEventEmitter.emit('route_changed', currentRouteName);
          }
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
            // Key is intentionally NOT set here — we never want this to remount
            <RootNavigatorWithSara initialTab={initialTab} />
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="Landing" component={LandingScreen} />
            <Stack.Screen name="GuestDashboard" component={GuestDashboard} />
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 20,
    height: 70,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingBottom: 0,
  },
  tabBarBackground: {
    flex: 1,
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
  },
  saraTab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: SPACE.xs },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  globalSaraBtn: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(165,153,255,0.1)',
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
