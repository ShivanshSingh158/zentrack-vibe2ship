import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring, 
  Easing 
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';
import { subscribeTabBarScroll, setTabBarVisible } from '../../utils/tabBarScroll';

// ─── Module Icons Configuration ───────────────────────────────────────────────
export const SPOTIFY_TAB_CONFIG: Record<string, {
  name: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}> = {
  Home:       { name: 'Home',       activeIcon: 'home',             inactiveIcon: 'home-outline' },
  Tasks:      { name: 'Tasks',      activeIcon: 'checkmark-circle', inactiveIcon: 'checkmark-circle-outline' },
  Gym:        { name: 'Gym',        activeIcon: 'barbell',          inactiveIcon: 'barbell-outline' },
  Calendar:   { name: 'Calendar',   activeIcon: 'calendar-clear',   inactiveIcon: 'calendar-clear-outline' },
  Habits:     { name: 'Habits',     activeIcon: 'flame',            inactiveIcon: 'flame-outline' },
  Attendance:  { name: 'Attend',     activeIcon: 'id-card',          inactiveIcon: 'id-card-outline' },
  Assignments: { name: 'Assign',     activeIcon: 'clipboard',        inactiveIcon: 'clipboard-outline' },
  Grades:      { name: 'Grades',     activeIcon: 'calculator',       inactiveIcon: 'calculator-outline' },
  Learning:   { name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline' },
  Notes:      { name: 'Notes',      activeIcon: 'document-text',    inactiveIcon: 'document-text-outline' },
  Analytics:  { name: 'Stats',      activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline' },
  Sara:       { name: 'SARA',       activeIcon: 'planet',           inactiveIcon: 'planet-outline' },
  More:       { name: 'More',       activeIcon: 'apps',             inactiveIcon: 'apps-outline' },
};

const DEFAULT_TAB_CONFIG = {
  name: '',
  activeIcon: 'ellipse' as keyof typeof Ionicons.glyphMap,
  inactiveIcon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap,
};

// ─── Individual Tab Item Component ────────────────────────────────────────────
interface TabItemProps {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  badge?: number;
  isDark: boolean;
  colors: any;
}

function TabItem({
  route,
  isFocused,
  onPress,
  badge,
  isDark,
  colors,
}: TabItemProps) {
  const config = SPOTIFY_TAB_CONFIG[route.name] || {
    ...DEFAULT_TAB_CONFIG,
    name: route.name,
  };

  const scale = useSharedValue(isFocused ? 1.04 : 1);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (isFocused) {
      scale.value = withSpring(0.92, { damping: 14, stiffness: 350 }, () => {
        scale.value = withSpring(1.04, { damping: 12, stiffness: 280 });
      });
    } else {
      scale.value = withSpring(1, { damping: 14, stiffness: 280 });
    }
  }, [isFocused]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pressScale.value }],
  }));

  // Signature purple active / crisp white inactive (boosted for readability)
  const activeColor = colors.accentPrimary || '#a599ff';
  const inactiveColor = isDark ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.62)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withTiming(0.92, { duration: 60 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 14, stiffness: 320 });
      }}
      style={styles.tabButton}
      android_ripple={null}
    >
      <View style={styles.tabContent}>
        {/* Perfectly proportioned 24px icon for 6-tab balance */}
        <Animated.View style={[styles.iconBox, animatedIconStyle]}>
          <Ionicons
            name={isFocused ? config.activeIcon : config.inactiveIcon}
            size={24}
            color={isFocused ? activeColor : inactiveColor}
          />

          {/* Discrete notification badge */}
          {badge !== undefined && badge > 0 && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.error || '#FF453A',
                  borderColor: isDark ? '#000000' : '#FFFFFF',
                },
              ]}
            >
              <Text style={styles.badgeText}>
                {badge > 99 ? '99+' : badge}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Clean, well-spaced 10.5px label */}
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color: isFocused ? activeColor : inactiveColor,
              fontFamily: isFocused ? FONT_FAMILY.bold : FONT_FAMILY.medium,
            },
          ]}
        >
          {config.name}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Main Navigation Bar ──────────────────────────────────────────────────────
type TelegramTabBarProps = BottomTabBarProps & { badges?: Record<string, number> };

export function TelegramTabBar({
  state,
  descriptors,
  navigation,
  badges = {},
}: TelegramTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Filter visible routes based on custom style and TabBarNullButton
  const visibleRoutes = useMemo(() => {
    return state.routes.filter((route) => {
      const { options } = descriptors[route.key];
      if (
        options.tabBarItemStyle &&
        (options.tabBarItemStyle as any).display === 'none'
      ) {
        return false;
      }
      if (
        options.tabBarButton &&
        (options.tabBarButton as any).name === 'TabBarNullButton'
      ) {
        return false;
      }
      return true;
    });
  }, [state.routes, descriptors]);

  const activeRouteIndex = visibleRoutes.findIndex(
    (route) => route.key === state.routes[state.index].key
  );
  const moreRouteIndex = visibleRoutes.findIndex(
    (route) => route.name === 'More'
  );
  const activeIndex =
    activeRouteIndex >= 0
      ? activeRouteIndex
      : moreRouteIndex >= 0
      ? moreRouteIndex
      : 0;

  // Scroll Hide / Reveal Behavior
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const isScreenOptionsHidden =
    focusedOptions.tabBarStyle &&
    (focusedOptions.tabBarStyle as any).display === 'none';

  const [isScrollHidden, setIsScrollHidden] = useState(false);

  useEffect(() => {
    return subscribeTabBarScroll((visible) => {
      setIsScrollHidden(!visible);
    });
  }, []);

  useEffect(() => {
    setIsScrollHidden(false);
    setTabBarVisible(true);
  }, [state.index]);

  const shouldHide = isScreenOptionsHidden || isScrollHidden;
  const translateY = useSharedValue(0);
  const tabOpacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withSpring(shouldHide ? 110 : 0, {
      damping: 24,
      stiffness: 350,
      mass: 0.6,
    });
    tabOpacity.value = withTiming(shouldHide ? 0 : 1, {
      duration: shouldHide ? 120 : 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldHide]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: tabOpacity.value,
  }));

  const bottomPadding = insets.bottom > 0 ? insets.bottom : 8;
  // Total height of tabs row + bottom safe area
  const tabBarHeight = 48 + 6 + bottomPadding; // paddingTop + tabsRow + bottomPadding
  // Gradient starts 64px above the tab bar for a gentle, Spotify-style fade
  const gradientHeight = tabBarHeight + 64;

  // Dark / light adaptive gradient stops — boosted for always-visible nav
  const gradientColors = isDark
    ? [
        'rgba(0,0,0,0)',         // fully transparent at top
        'rgba(0,0,0,0.30)',      // gentle start at 38%
        'rgba(0,0,0,0.68)',      // solid mid-fade at 65%
        'rgba(0,0,0,0.90)',      // very strong at 84%
        'rgba(0,0,0,0.98)',      // near-solid behind icons
      ] as const
    : [
        'rgba(244,243,248,0)',
        'rgba(244,243,248,0.35)',
        'rgba(244,243,248,0.72)',
        'rgba(244,243,248,0.92)',
        'rgba(244,243,248,0.99)',
      ] as const;

  const currentRouteName = state.routes[state.index]?.name;
  const isMoreActive = currentRouteName === 'More';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.outerWrapper,
        { height: isMoreActive ? tabBarHeight : gradientHeight },
        containerAnimatedStyle,
      ]}
    >
      {/* ── Spotify-style gradient fade (hidden on More screen) ── */}
      {!isMoreActive && (
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.38, 0.65, 0.84, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {/* ── Tab bar sits at the bottom of the gradient block ── */}
      <View
        style={[
          styles.dockedWrapper,
          { paddingBottom: bottomPadding },
        ]}
      >
        <View style={styles.tabsRow}>
          {visibleRoutes.map((route, index) => {
            const isVisuallyFocused = activeIndex === index;
            const isActuallyFocused = state.routes[state.index].key === route.key;

            const handlePress = () => {
              feedback.tap();
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isActuallyFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, { merge: true } as any);
              }
            };

            return (
              <TabItem
                key={route.key}
                route={route}
                isFocused={isVisuallyFocused}
                onPress={handlePress}
                badge={badges[route.name]}
                isDark={isDark}
                colors={colors}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Outer container — tall enough to include gradient bleed above the tab icons
  outerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    // No background — the LinearGradient handles it
    backgroundColor: 'transparent',
  },
  // Tab bar itself, pinned to the bottom of outerWrapper
  dockedWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 48,
    backgroundColor: 'transparent',
  },
  tabButton: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    backgroundColor: 'transparent',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontFamily: FONT_FAMILY.bold,
  },
});
