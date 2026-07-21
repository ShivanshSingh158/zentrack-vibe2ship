import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text, Image, AppState, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme, useNavigation } from '@react-navigation/native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { auth } from '../services/firebase';
import { MobileDataProvider, useMobileData } from '../contexts/MobileDataContext';
import { setupNetworkListener } from '../services/offlineSync';
import { cacheAwareLazy, startPrefetching } from '../utils/ModulePrefetcher';

// ─── Critical screens (always loaded at startup) ─────────────────────────────
import LandingScreen from '../screens/LandingScreen';
import GuestDashboard from '../screens/GuestDashboard';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRUTAL_QUOTES } from '../data/brutalQuotes';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MoreScreen from '../screens/MoreScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GymStack from './GymStack';
import SaraScreen from '../screens/SaraScreen';
import NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import { feedback } from '../utils/haptics';

// ─── Secondary screens — lazy loaded on first navigation ─────────────────────
// These are NOT needed at startup. Using React.lazy() means their JS is only
// parsed when the user actually navigates to them for the first time, cutting
// cold-start parse time by ~40%.
const HabitsScreen = cacheAwareLazy('HabitsScreen', () => import('../screens/HabitsScreen'));
const NotesScreen = cacheAwareLazy('NotesScreen', () => import('../screens/NotesScreen'));
const AttendanceScreen = cacheAwareLazy('AttendanceScreen', () => import('../screens/AttendanceScreen'));
const WeeklyReviewScreen = cacheAwareLazy('WeeklyReviewScreen', () => import('../screens/WeeklyReviewScreen'));
const StudyRoomScreen = cacheAwareLazy('StudyRoomScreen', () => import('../screens/StudyRoomScreen'));
const AnalyticsScreen = cacheAwareLazy('AnalyticsScreen', () => import('../screens/AnalyticsScreen'));
const SocialScreen = cacheAwareLazy('SocialScreen', () => import('../screens/SocialScreen'));
const AssignmentsScreen = cacheAwareLazy('AssignmentsScreen', () => import('../screens/AssignmentsScreen'));
const GradesScreen = cacheAwareLazy('GradesScreen', () => import('../screens/GradesScreen'));
const LearningScreen = cacheAwareLazy('LearningScreen', () => import('../screens/LearningScreen'));
const GoalsScreen = cacheAwareLazy('GoalsScreen', () => import('../screens/GoalsScreen'));
const GoalDetailScreen = cacheAwareLazy('GoalDetailScreen', () => import('../screens/GoalDetailScreen'));
const JobsScreen = cacheAwareLazy('JobsScreen', () => import('../screens/JobsScreen'));
const StreakDetailScreen = cacheAwareLazy('StreakDetailScreen', () => import('../screens/StreakDetailScreen'));

// Theme
import { RADIUS, FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from "../contexts/ThemeContext";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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


// ─── Splash Loader — shown during Firebase auth check AND font loading ────────
export function SplashLoader() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const pulseScale = useSharedValue(0.85);
  const fadeOpacity = useSharedValue(0);
  const [quote, setQuote] = useState(BRUTAL_QUOTES[0]);

  useEffect(() => {
    setQuote(BRUTAL_QUOTES[Math.floor(Math.random() * BRUTAL_QUOTES.length)]);

    // Fade in — runs on UI thread
    fadeOpacity.value = withTiming(1, { duration: 800 });

    // Slow cinematic pulse — runs on UI thread
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(fadeOpacity);
    };
  }, []);

  const splashAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: fadeOpacity.value,
  }));

  return (
    <View style={[styles.splashRoot, { paddingHorizontal: 32 }]}>
      <Animated.View style={[{
        alignItems: 'center',
        gap: 16
      }, splashAnimStyle]}>
        <Text style={{
          fontFamily: FONT_FAMILY.serif,
          color: colors.textPrimary,
          fontSize: 22,
          lineHeight: 32,
          textAlign: 'center',
          fontStyle: 'italic',
        }}>
          "{quote.text}"
        </Text>
        <Text style={{
          fontFamily: FONT_FAMILY.mono,
          color: colors.textSecondary,
          fontSize: 12,
          textAlign: 'center',
          letterSpacing: 2,
          marginTop: 8,
          textTransform: 'uppercase'
        }}>
          — {quote.author}
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Header component for nested screens ───────────────────────────────────────

function NestedHeader({ title }: { title: string }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.md, backgroundColor: colors.surface }]}>
      <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn} haptic="light">
        <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
      </AnimatedPressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

// ─── Authenticated Tab Navigator ─────────────────────────────────────────────

const COMPONENT_MAP: Record<string, any> = {
  Tasks: TasksScreen,
  Calendar: CalendarScreen,
  Habits: HabitsScreen,
  Gym: GymStack,
  Attendance: AttendanceScreen,
  Analytics: AnalyticsScreen,
  WeeklyReview: WeeklyReviewScreen,
  StudyRoom: StudyRoomScreen,
  Notes: NotesScreen,
  Social: SocialScreen,
  Assignments: AssignmentsScreen,
  Grades: GradesScreen,
  Learning: LearningScreen,
  Goals: GoalsScreen,
  GoalDetail: GoalDetailScreen,
  Jobs: JobsScreen,
};

function MainTabNavigator() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { pinnedModules } = useMobileData();

  useEffect(() => {
    startPrefetching(pinnedModules);
  }, [pinnedModules]);

  return (
    <ErrorBoundary screenName="Tab Navigator">
      <Tab.Navigator
        screenListeners={({ navigation, route }) => ({
          tabPress: (e) => {
            // Intercept More tab press BEFORE focus changes to prevent the flicker.
            // If More is already focused, prevent default (which would re-render it)
            // and navigate to the previous screen instead.
            if (route.name === 'More' && navigation.isFocused()) {
              e.preventDefault();
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Home');
              }
            }
          },
        })}
        screenOptions={({ route }) => ({
          headerShown: false,
          detachInactiveScreens: false,
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
          tabBarItemStyle: {
            paddingVertical: 10,
          },
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <View
              style={[styles.tabBarBackground, { backgroundColor: 'rgba(10, 10, 10, 0.95)' }]}
            />
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
              Goals: { active: 'trophy', inactive: 'trophy-outline' },
              Notes: { active: 'document-text', inactive: 'document-text-outline' },
              Social: { active: 'people', inactive: 'people-outline' },
              Assignments: { active: 'book', inactive: 'book-outline' },
              Grades: { active: 'calculator', inactive: 'calculator-outline' },
              Learning: { active: 'library', inactive: 'library-outline' },
              More: { active: 'grid', inactive: 'grid-outline' },
            };
            const iconSet = icons[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
            const iconName = focused ? iconSet.active : iconSet.inactive;

            // Special Sara orb tab
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
        {Object.keys(COMPONENT_MAP).map((modId: string) => {
          const isPinned = pinnedModules.includes(modId);
          return (
            <Tab.Screen
              key={modId}
              name={modId}
              component={COMPONENT_MAP[modId]}
              options={{
                tabBarShowLabel: true,
                tabBarItemStyle: [
                  { paddingVertical: 10 },
                  !isPinned && { display: 'none' }
                ]
              }}
            />
          );
        })}
        <Tab.Screen name="More" component={MoreScreen} />
      </Tab.Navigator>
    </ErrorBoundary>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export default function AppNavigator() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const [currentRoute, setCurrentRoute] = useState<string>('Home');

  const [onboarded, setOnboarded] = useState<boolean>(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const val = await AsyncStorage.getItem(ONBOARDING_KEY);
        setOnboarded(val === 'true');
      } catch (e) {
        setOnboarded(false);
      }
    };
    checkOnboarding();

    // Prevent the 60-second Render cold start delay
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://zentrack-vibe2ship.onrender.com';
    fetch(`${backendUrl}/health`).catch(() => { });

    // Check for OTA Updates automatically
    const checkForUpdates = async () => {
      try {
        if (__DEV__) return; // Skip in local development
        // Rate-limit: only check once per hour to avoid a network hit on every launch
        const HOUR_MS = 60 * 60 * 1000;
        const lastCheck = await AsyncStorage.getItem('@zentrack_last_update_check');
        if (lastCheck && Date.now() - parseInt(lastCheck, 10) < HOUR_MS) return;
        await AsyncStorage.setItem('@zentrack_last_update_check', String(Date.now()));

        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          Alert.alert(
            'Update Available',
            'A new version of ZenTrack is available! Do you want to download it now?',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Update Now',
                onPress: async () => {
                  try {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } catch (e) {
                    Alert.alert('Error', 'Failed to apply the update.');
                  }
                }
              }
            ]
          );
        }
      } catch (e) {
        // Silently fail if offline or update check fails so it doesn't bother the user
        console.log('Update check failed', e);
      }
    };
    checkForUpdates();

    const unsubscribe = onAuthStateChanged(auth, async (usr) => {
      if (usr) {
        await checkOnboarding();
      }
      setUser(usr);
      setLoading(false);
    });

    const unsubscribeNetwork = setupNetworkListener();

    return () => {
      unsubscribe();
      unsubscribeNetwork();
    };
  }, []);

  if (loading) {
    return <SplashLoader />;
  }

  return (
    <NavigationContainer
      theme={ZEN_DARK_THEME}
      onStateChange={(state) => {
        if (!state) return;
        let current = state;
        while (current.routes[current.index].state) {
          current = current.routes[current.index].state as any;
        }
        setCurrentRoute(current.routes[current.index].name);
      }}
    >
      {user ? (
        !onboarded ? (
          // FIX #5: Wrap in ErrorBoundary — OnboardingScreen is outside all Stack.Navigators.
          // Any useNavigation() call inside it would throw without this guard.
          <ErrorBoundary screenName="Onboarding">
            <OnboardingScreen onComplete={() => setOnboarded(true)} />
          </ErrorBoundary>
        ) : (
          <MobileDataProvider>
            <RootNavigatorWithSara currentRoute={currentRoute} />
          </MobileDataProvider>
        )
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="Landing" component={LandingScreen} />
          <Stack.Screen name="GuestDashboard" component={GuestDashboard} />
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

// ─── Root Navigator with Global Sara Button ───────────────────────────────────

function RootNavigatorWithSara({ currentRoute }: { currentRoute: string }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<any>();
  const [saraVisible, setSaraVisible] = useState(false);

  const visibleRoutes = ['Home', 'Tasks'];
  const hideSaraBtn = !visibleRoutes.includes(currentRoute);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Group screenOptions={{ presentation: 'card' }}>
          <Stack.Screen name="MoreStack" component={NestedScreens} />
        </Stack.Group>
      </Stack.Navigator>

      {/* Global SARA Floating Orb - Positioned above tabs */}
      {!hideSaraBtn && (
        <AnimatedPressable
          style={styles.globalSaraBtn}
          onPress={() => {
            feedback.commit();
            setSaraVisible(true);
          }}
          haptic="heavy"
        >

          <Ionicons name="planet" size={26} color={colors.accentPrimary} style={{ opacity: 1 }} />
        </AnimatedPressable>
      )}

      {/* Global SARA Modal */}
      <SaraScreen
        isGlobalModal={true}
        visible={saraVisible}
        onClose={() => setSaraVisible(false)}
      />
    </View>
  );
}

// Wrapper for nested screens so they share the common back button header
function NestedScreens() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  return (
    <ErrorBoundary screenName="Screen">
      <Stack.Navigator screenOptions={{
        header: ({ route }) => <NestedHeader title={route.name} />,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        animationDuration: 180,           // Was 250 — matches Instagram's native feel
        // detachInactiveScreens: false,     // Keep visited screens in memory: no remount on back
      }}>
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Sara" component={SaraScreen} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StreakDetail" component={StreakDetailScreen} />
        {/* SaraModal alias — allows navigation.navigate('MoreStack', { screen: 'SaraModal' }) */}
        <Stack.Screen name="SaraModal" component={SaraScreen} options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
    </ErrorBoundary>
  );
}



// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: any) => StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: colors.borderHover,
    elevation: 20,
    height: 70,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingBottom: 0,
  },
  tabBarBackground: {
    flex: 1,
    backgroundColor: 'rgba(10, 8, 15, 0.35)', // Slightly darker base for the blur
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
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary },
  splashRoot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: colors.textMuted,
    letterSpacing: 6,
  },
  globalSaraBtn: {
    position: 'absolute',
    bottom: 110, // Adjusted to match other FABs above bottom nav
    right: 24, // Pulled slightly more inwards to avoid edge clipping
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
  }
});
