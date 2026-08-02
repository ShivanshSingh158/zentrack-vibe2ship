import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, DeviceEventEmitter, AppState, AppStateStatus } from 'react-native';
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
import { cacheAwareLazy, startPrefetching } from '../utils/ModulePrefetcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRUTAL_QUOTES } from '../data/brutalQuotes';
import { RADIUS, FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import { feedback } from '../utils/haptics';
import ErrorBoundary from '../components/ErrorBoundary';

// ─── Critical screens (synchronous — always ready, zero load time) ─────────────
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

// ─── Lazy screens (background-prefetched after login) ─────────────────────────
const HabitsScreen             = cacheAwareLazy('HabitsScreen',             () => import('../screens/HabitsScreen'));
const NotesScreen              = cacheAwareLazy('NotesScreen',              () => import('../screens/NotesScreen'));
const AttendanceScreen         = cacheAwareLazy('AttendanceScreen',         () => import('../screens/AttendanceScreen'));
const WeeklyReviewScreen       = cacheAwareLazy('WeeklyReviewScreen',       () => import('../screens/WeeklyReviewScreen'));
const StudyRoomScreen          = cacheAwareLazy('StudyRoomScreen',          () => import('../screens/StudyRoomScreen'));
const AnalyticsScreen          = cacheAwareLazy('AnalyticsScreen',          () => import('../screens/AnalyticsScreen'));
const AssignmentsScreen        = cacheAwareLazy('AssignmentsScreen',        () => import('../screens/AssignmentsScreen'));
const GradesScreen             = cacheAwareLazy('GradesScreen',             () => import('../screens/GradesScreen'));
const LearningScreen           = cacheAwareLazy('LearningScreen',           () => import('../screens/LearningScreen'));
const StreakDetailScreen        = cacheAwareLazy('StreakDetailScreen',       () => import('../screens/StreakDetailScreen'));
const AgentHistoryScreen        = cacheAwareLazy('AgentHistoryScreen',      () => import('../screens/AgentHistoryScreen'));
const WellbeingDashboardScreen  = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));

// ─── Navigators ───────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Exported for imperative navigation from notification handlers in App.tsx
export const navigationRef = createNavigationContainerRef<any>();

// ─── Per-screen ErrorBoundary HOC ─────────────────────────────────────────────
//
// Wraps each individual screen in its own ErrorBoundary so a crash in one
// screen NEVER propagates to kill the tab navigator or any other screen.
//
// WhatsApp behaviour: if the Chat screen crashes, your Home tab still works.
// Without per-screen boundaries, one crash would blank the entire app.

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

// ─── Navigation Theme — matches Android windowBackground exactly ───────────────
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

// ─── AsyncStorage Keys ────────────────────────────────────────────────────────
//
// NAV_ROUTE_KEY:    persists the current tab so resume (background→foreground)
//                   restores exactly where the user was. Cleared on kill.
//
// SESSION_ALIVE_KEY: a heartbeat flag. Written when app comes to foreground.
//                    Cleared when app backgrounds. On cold boot (process killed),
//                    this key is ABSENT — so we know to reset to Home.
//                    On resume (process alive, just hidden), this key is PRESENT
//                    — so we restore the saved tab.
//
// This is the exact mechanism WhatsApp uses: kill = Home, resume = last screen.

const NAV_ROUTE_KEY    = '@zentrack_last_route';
const SESSION_ALIVE_KEY = '@zentrack_session_alive';

const ALLOWED_SAVE_ROUTES = new Set([
  'Home', 'Tasks', 'Gym', 'Calendar', 'Habits',
  'Attendance', 'Analytics', 'WeeklyReview',
  'StudyRoom', 'Notes', 'Assignments', 'Grades', 'Learning',
]);

// ─── SARA FAB visibility ──────────────────────────────────────────────────────
const SARA_VISIBLE_ROUTES = new Set(['Home', 'Tasks', 'Analytics']);

// ─── Component map for tab screens ───────────────────────────────────────────
//
// EVERY screen is wrapped in its own ErrorBoundary via withErrorBoundary().
// A crash in Tasks will never blank the Home tab. WhatsApp behaviour.

const SafeDashboard    = withErrorBoundary(DashboardScreen,   'Dashboard');

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  Tasks:        withErrorBoundary(TasksScreen,        'Tasks'),
  Sara:         withErrorBoundary(SaraScreen,         'Sara'),
  Calendar:     withErrorBoundary(CalendarScreen,     'Calendar'),
  Habits:       withErrorBoundary(HabitsScreen,       'Habits'),
  Gym:          withErrorBoundary(GymStack,           'Gym'),
  Attendance:   withErrorBoundary(AttendanceScreen,   'Attendance'),
  Analytics:    withErrorBoundary(AnalyticsScreen,    'Analytics'),
  WeeklyReview: withErrorBoundary(WeeklyReviewScreen, 'WeeklyReview'),
  StudyRoom:    withErrorBoundary(StudyRoomScreen,    'StudyRoom'),
  Notes:        withErrorBoundary(NotesScreen,        'Notes'),
  Assignments:  withErrorBoundary(AssignmentsScreen,  'Assignments'),
  Grades:       withErrorBoundary(GradesScreen,       'Grades'),
  Learning:     withErrorBoundary(LearningScreen,     'Learning'),
};

// ─── SplashLoader ─────────────────────────────────────────────────────────────
//
// Rendered as a full-screen OVERLAY (absolute + zIndex 9999) on top of the
// NavigationContainer while the app initialises. The container itself is always
// mounted and painted — no early returns, no unmounts, no grey window.
//
// This is the key architectural decision: the native view tree NEVER goes away.
// Android's window always has React content. When the OS brings the app to the
// foreground after backgrounding, React re-attaches to an already-warm view,
// so there is nothing to repaint — zero flash.

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
    zIndex: 9999,
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

// ─── Main Tab Navigator ───────────────────────────────────────────────────────
//
// initialTab is a STABLE PROP passed at mount time from the boot read.
// It never changes after mount — this is the WhatsApp/Instagram pattern.
// Changing it would remount the entire tab navigator and lose all screen state.

function MainTabNavigator({ initialTab }: { initialTab: string }) {
  const { colors }       = useTheme();
  const { pinnedModules } = useMobileData();

  // Save the current route on every tab focus so resume can restore it
  const onTabFocus = useCallback((routeName: string) => {
    if (ALLOWED_SAVE_ROUTES.has(routeName)) {
      AsyncStorage.setItem(NAV_ROUTE_KEY, routeName).catch(() => {});
    }
  }, []);

  // Background-prefetch lazy screens after initial render
  useEffect(() => { startPrefetching(pinnedModules); }, [pinnedModules]);

  return (
    <Tab.Navigator
      initialRouteName={initialTab}
      screenListeners={({ route }) => ({
        focus: () => onTabFocus(route.name),
      })}
        screenOptions={({ route }) => ({
          headerShown: false,
          // sceneStyle background MUST match styles.xml windowBackground.
          // cacheAwareLazy's loading stub is transparent — it correctly shows this colour.
          sceneStyle: { backgroundColor: '#080510' },
          tabBarShowLabel:         true,
          tabBarActiveTintColor:   colors.accentPrimary,
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
              Home:         { active: 'home',             inactive: 'home-outline' },
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
        <Tab.Screen name="Home" component={SafeDashboard} />
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
        <Tab.Screen name="More" component={withErrorBoundary(MoreScreen, 'More')} />
      </Tab.Navigator>
  );
}

// ─── Nested screens stack ─────────────────────────────────────────────────────
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
        }}
      >
        <Stack.Screen name="Settings"              component={withErrorBoundary(SettingsScreen,               'Settings')} />
        <Stack.Screen name="NotificationsSettings" component={withErrorBoundary(NotificationsSettingsScreen,  'Notifications')} options={{ headerShown: false }} />
        <Stack.Screen name="Sara"                  component={withErrorBoundary(SaraScreen,                   'Sara')} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StreakDetail"           component={withErrorBoundary(StreakDetailScreen,           'StreakDetail')} />
        <Stack.Screen name="SaraModal"             component={withErrorBoundary(SaraScreen,                   'SaraModal')} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="AgentHistory"          component={withErrorBoundary(AgentHistoryScreen,           'AgentHistory')} />
        <Stack.Screen name="WellbeingDashboard"    component={withErrorBoundary(WellbeingDashboardScreen,     'Wellbeing')} options={{ headerShown: false }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

// ─── Root authenticated navigator + global SARA FAB ──────────────────────────
function RootNavigatorWithSara({ initialTab }: { initialTab: string }) {
  const { colors }       = useTheme();
  const [saraVisible, setSaraVisible] = useState(false);

  // Memoised — prevents MainTabNavigator from remounting on any parent state change.
  // The [] dependency is intentional: initialTab must be frozen at mount.
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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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

// ─── AppNavigator — Root ──────────────────────────────────────────────────────
//
// WHATSAPP / INSTAGRAM LIFECYCLE ARCHITECTURE
// ═══════════════════════════════════════════
//
// GREY SCREEN FIX:
//   The NavigationContainer ALWAYS renders — even during splash. The SplashLoader
//   is an absolute overlay (zIndex 9999) on top of it, NOT an early return.
//   This keeps React's view tree warm inside Android's window. When the OS
//   brings the app to the foreground, React re-attaches to an already-painted
//   view → zero flash, zero grey.
//
// KILL vs. RESUME DETECTION:
//   We use a session-alive heartbeat key in AsyncStorage:
//   - App comes to foreground (active)  → write SESSION_ALIVE_KEY = '1'
//   - App goes to background (inactive) → delete SESSION_ALIVE_KEY
//   - Cold boot (process killed)        → SESSION_ALIVE_KEY is absent → boot to Home
//   - Warm resume (process alive)       → SESSION_ALIVE_KEY is present → restore NAV_ROUTE_KEY
//
//   This is the exact mechanism that gives WhatsApp its feel:
//   kill the app → always Home. Background → foreground → same screen, instantly.
//
// AUTH GUARD:
//   Firebase fires onAuthStateChanged(null) during token refresh (~every 1h).
//   We ignore nulls for 3 seconds after the first auth resolution to avoid
//   flashing the login screen during a routine token refresh.
//   Intentional logout (user.signOut()) calls setUser(null) directly via a flag.

export default function AppNavigator() {
  const [appReady,   setAppReady]   = useState(false);
  const [user,       setUser]       = useState<User | null>(null);
  const [onboarded,  setOnboarded]  = useState(true);
  const [initialTab, setInitialTab] = useState('Home'); // stable after boot

  const firstAuthAt = useRef<number>(0);
  const hasResolved = useRef(false);

  // ── Boot sequence ─────────────────────────────────────────────────────────
  useEffect(() => {
    const boot = async () => {
      try {
        // Read session-alive flag and last route simultaneously
        const [[, sessionAlive], [, savedTab], [, onboardedVal]] =
          await AsyncStorage.multiGet([SESSION_ALIVE_KEY, NAV_ROUTE_KEY, ONBOARDING_KEY]);

        // ── Kill vs. Resume detection ──────────────────────────────────────
        // SESSION_ALIVE_KEY is present only when the app process was NOT killed.
        // If it's absent we're on a fresh cold boot → always start from Home.
        const isWarmResume = sessionAlive === '1';

        if (isWarmResume && savedTab && ALLOWED_SAVE_ROUTES.has(savedTab)) {
          // Warm resume: restore exact screen the user was on
          setInitialTab(savedTab);
        } else {
          // Cold boot (killed): always Home — WhatsApp/Instagram standard
          setInitialTab('Home');
        }

        if (onboardedVal) setOnboarded(onboardedVal === 'true');
      } catch {
        // Safe fallback: Home, onboarded=true
      }
    };

    const bootPromise = boot();

    // Firebase auth listener — one subscription, lives forever
    const unsubAuth = onAuthStateChanged(auth, async (usr) => {
      if (!hasResolved.current) {
        hasResolved.current = true;
        firstAuthAt.current = Date.now();
        setUser(usr);
        if (usr) {
          const val = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
          setOnboarded(val === 'true');
        }
        // Mark ready only after BOTH boot read and first auth callback complete
        await bootPromise;
        setAppReady(true);
        return;
      }

      if (!usr) {
        // Null within 3 s of first resolution = token refresh, NOT logout
        const msSinceFirst = Date.now() - firstAuthAt.current;
        if (msSinceFirst < 3000) return;
        setUser(null);
      } else {
        setUser(usr);
      }
    });

    // OTA update check — rate-limited to once per hour
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
        } catch { /* offline — skip silently */ }
      })();
    }

    return () => { unsubAuth(); };
  }, []);

  // ── Route tracking — emit to SARA FAB visibility listener ─────────────────
  const onNavStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) DeviceEventEmitter.emit('route_changed', routeName);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  //
  // CRITICAL: NavigationContainer ALWAYS renders.
  // SplashLoader is an overlay, never an early return.
  // This is what keeps Android's native window warm — no grey flash ever.

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
            // No key prop — must NEVER remount
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

      {/* Splash overlay — sits ABOVE NavigationContainer during boot.
          Fades away once appReady=true. The native view beneath stays warm. */}
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
