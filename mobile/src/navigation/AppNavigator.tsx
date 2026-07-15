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

// Screens
import LandingScreen from '../screens/LandingScreen';
import GuestDashboard from '../screens/GuestDashboard';
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen, { ONBOARDING_KEY } from '../screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRUTAL_QUOTES } from '../data/brutalQuotes';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import CalendarScreen from '../screens/CalendarScreen';
import FocusScreen from '../screens/FocusScreen';
import MoreScreen from '../screens/MoreScreen';
import HabitsScreen from '../screens/HabitsScreen';
import NotesScreen from '../screens/NotesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GymStack from './GymStack';
import AttendanceScreen from '../screens/AttendanceScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import SocialScreen from '../screens/SocialScreen';
import AssignmentsScreen from '../screens/AssignmentsScreen';
import GradesScreen from '../screens/GradesScreen';
import LearningScreen from '../screens/LearningScreen';
import GoalsScreen from '../screens/GoalsScreen';
import JobsScreen from '../screens/JobsScreen';
import SaraScreen from '../screens/SaraScreen';
import NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import { feedback } from '../utils/haptics';

// Theme
import { COLORS, RADIUS, FONT_FAMILY, SPACE, FONT_SIZE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ZEN_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.background,
    card: 'transparent',
    border: 'transparent',
    text: COLORS.textPrimary,
  },
};

// ─── Splash Loader — shown during Firebase auth check ─────────────────────────
function SplashLoader() {
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
          color: COLORS.textPrimary,
          fontSize: 22,
          lineHeight: 32,
          textAlign: 'center',
          fontStyle: 'italic',
        }}>
          "{quote.text}"
        </Text>
        <Text style={{
          fontFamily: FONT_FAMILY.mono,
          color: COLORS.textSecondary,
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
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.md, backgroundColor: COLORS.surface }]}>
      <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn} haptic="light">
        <Ionicons name="chevron-back" size={24} color={COLORS.accentPrimary} />
      </AnimatedPressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

// ─── Authenticated Tab Navigator ─────────────────────────────────────────────

function MainTabNavigator() {
  const { pinnedModules } = useMobileData();

  const COMPONENT_MAP: Record<string, any> = {
    Tasks: TasksScreen,
    Calendar: CalendarScreen,
    Habits: HabitsScreen,
    Gym: GymStack,
    Attendance: AttendanceScreen,
    Analytics: AnalyticsScreen,
    Notes: NotesScreen,
    Social: SocialScreen,
    Assignments: AssignmentsScreen,
    Grades: GradesScreen,
    Learning: LearningScreen,
    Goals: GoalsScreen,
    Jobs: JobsScreen,
  };

  return (
    <ErrorBoundary screenName="Tab Navigator">
      <Tab.Navigator
        screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'shift', // Telegram-style smooth crossfade and shift
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.accentPrimary, // Purple theme active
        tabBarInactiveTintColor: COLORS.textMuted,
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
          <View style={styles.tabBarBackground}>
            
          </View>
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
              <View style={[styles.saraTab, { borderColor: focused ? COLORS.textPrimary : 'transparent', backgroundColor: focused ? COLORS.surface2 : 'transparent' }]}>
                <Ionicons name={iconName} size={size + 4} color={focused ? COLORS.textPrimary : COLORS.textMuted} />
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const [currentRoute, setCurrentRoute] = useState<string>('');

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
    fetch(`${backendUrl}/health`).catch(() => {});

    // Check for OTA Updates automatically
    const checkForUpdates = async () => {
      try {
        if (__DEV__) return; // Skip in local development
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
          <OnboardingScreen onComplete={() => setOnboarded(true)} />
        ) : (
            <MobileDataProvider>
              <RootNavigatorWithSara currentRoute={currentRoute} />
            </MobileDataProvider>
        )
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: COLORS.background } }}>
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
          
          <Ionicons name="planet" size={26} color={COLORS.accentPrimary} style={{ opacity: 1 }} />
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
  return (
    <ErrorBoundary screenName="Screen">
      <Stack.Navigator screenOptions={{
      header: ({ route }) => <NestedHeader title={route.name} />,
      contentStyle: { backgroundColor: COLORS.background },
      animation: 'slide_from_right',
      animationDuration: 250
    }}>
      {/* Utility / Nested Screens */}
      <Stack.Screen name="Settings"     component={SettingsScreen}  />
      <Stack.Screen name="Focus"        component={FocusScreen}     options={{ headerShown: false }} />
      <Stack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Sara"       component={SaraScreen}     options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
      {/* SaraModal alias — allows navigation.navigate('MoreStack', { screen: 'SaraModal' }) */}
      <Stack.Screen name="SaraModal"  component={SaraScreen}     options={{ headerShown: false, presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
    </ErrorBoundary>
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
    borderColor: COLORS.borderHover,
    elevation: 20,
    height: 70,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingBottom: 0,
  },
  tabBarBackground: {
    flex: 1,
    backgroundColor: 'rgba(16, 12, 26, 0.4)',
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
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: COLORS.textPrimary },
  splashRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBrand: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
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
