import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTabBarBadges } from '../../hooks/useTabBarBadges';
import { DynamicCalendarIcon } from '../ui/DynamicCalendarIcon';
import { usePinnedModules } from '../../contexts/PinnedModulesContext';

// ─── Module Icons Configuration ───────────────────────────────────────────────
export const SPOTIFY_TAB_CONFIG: Record<string, {
  name: string;
  activeIcon: any;
  inactiveIcon: any;
  iconSet?: 'ionicons' | 'mci';
}> = {
  Home:       { name: 'Home',       activeIcon: 'home',             inactiveIcon: 'home-outline' },
  Tasks:      { name: 'Tasks',      activeIcon: 'checkmark-circle', inactiveIcon: 'checkmark-circle-outline' },
  Gym:        { name: 'Gym',        activeIcon: 'arm-flex',         inactiveIcon: 'arm-flex-outline', iconSet: 'mci' },
  Calendar:   { name: 'Cal',        activeIcon: 'calendar-number',  inactiveIcon: 'calendar-number-outline' },
  Habits:     { name: 'Habits',     activeIcon: 'sync',             inactiveIcon: 'sync-outline' },
  Attendance:  { name: 'Attend',     activeIcon: 'id-card',          inactiveIcon: 'id-card-outline' },
  Assignments: { name: 'Assign',     activeIcon: 'clipboard',        inactiveIcon: 'clipboard-outline' },
  Grades:      { name: 'Grades',     activeIcon: 'calculator',       inactiveIcon: 'calculator-outline' },
  Learning:   { name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline' },
  Notes:      { name: 'Notes',      activeIcon: 'folder',           inactiveIcon: 'folder-outline' },
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
  navigation: any;
  badge?: number;
  isDark: boolean;
  colors: any;
  isActuallyFocused: boolean;
}

const TabItem = React.memo(function TabItem({
  route,
  isFocused,
  navigation,
  badge,
  isDark,
  colors,
  isActuallyFocused,
}: TabItemProps) {
  const config = SPOTIFY_TAB_CONFIG[route.name] || {
    ...DEFAULT_TAB_CONFIG,
    name: route.name,
  };

  const scale = useSharedValue(isFocused ? 1.05 : 1);

  useEffect(() => {
    scale.value = withSpring(isFocused ? 1.05 : 1, {
      damping: 22,
      stiffness: 480,
      mass: 0.5,
    });
  }, [isFocused]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isActuallyFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, { merge: true } as any);
    }
  }, [route.key, route.name, isActuallyFocused, navigation]);

  // Signature purple active / crisp white inactive (boosted for readability)
  const activeColor = colors.accentPrimary || '#a599ff';
  const inactiveColor = isDark ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.62)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={handlePress}
      unstable_pressDelay={0}
      style={styles.tabButton}
      android_ripple={null}
    >
      <View style={styles.tabContent}>
        {/* Perfectly proportioned 24px icon for 6-tab balance */}
        <Animated.View style={[styles.iconBox, animatedIconStyle]}>
          {route.name === 'Calendar' ? (
            <DynamicCalendarIcon
              size={24}
              color={isFocused ? activeColor : inactiveColor}
              isFilled={isFocused}
            />
          ) : config.iconSet === 'mci' ? (
            <MaterialCommunityIcons
              name={isFocused ? (config.activeIcon as any) : (config.inactiveIcon as any)}
              size={24}
              color={isFocused ? activeColor : inactiveColor}
            />
          ) : (
            <Ionicons
              name={isFocused ? config.activeIcon : config.inactiveIcon}
              size={24}
              color={isFocused ? activeColor : inactiveColor}
            />
          )}

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
});

// ─── Main Navigation Bar ──────────────────────────────────────────────────────
type TelegramTabBarProps = BottomTabBarProps & { badges?: Record<string, number> };

export const TelegramTabBar = React.memo(function TelegramTabBar({
  state,
  descriptors,
  navigation,
  badges: passedBadges,
}: TelegramTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { pinnedModules } = usePinnedModules();
  const hookBadges = useTabBarBadges();
  const badges = (passedBadges && Object.keys(passedBadges).length > 0) ? passedBadges : hookBadges;

  const pinnedKey = (Array.isArray(pinnedModules) && pinnedModules.length > 0)
    ? pinnedModules.join(',')
    : 'Tasks,Gym,Calendar,Attendance';

  const effectivePinned = useMemo(() => pinnedKey.split(','), [pinnedKey]);

  // Filter visible routes based on custom style and TabBarNullButton
  const visibleRoutes = useMemo(() => {
    const unhidden = state.routes.filter((route) => {
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

    // Guarantee strict ordering: Home -> pinned modules in user's exact order -> More
    return unhidden.sort((a, b) => {
      if (a.name === 'Home') return -1;
      if (b.name === 'Home') return 1;
      if (a.name === 'More') return 1;
      if (b.name === 'More') return -1;
      const indexA = effectivePinned.indexOf(a.name);
      const indexB = effectivePinned.indexOf(b.name);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });
  }, [state.routes, descriptors, effectivePinned]);

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

  // Screen options hide (only when a full-screen modal explicitly requests tabBarStyle: { display: 'none' })
  const focusedOptions = descriptors[state.routes[state.index].key]?.options || {};
  const isScreenOptionsHidden =
    focusedOptions.tabBarStyle &&
    (focusedOptions.tabBarStyle as any).display === 'none';

  const shouldHide = Boolean(isScreenOptionsHidden);
  const translateY = useSharedValue(shouldHide ? 110 : 0);
  const tabOpacity = useSharedValue(shouldHide ? 0 : 1);

  useEffect(() => {
    translateY.value = withTiming(shouldHide ? 110 : 0, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    });
    tabOpacity.value = withTiming(shouldHide ? 0 : 1, {
      duration: 150,
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

            return (
              <TabItem
                key={route.key}
                route={route}
                isFocused={isVisuallyFocused}
                isActuallyFocused={isActuallyFocused}
                navigation={navigation}
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
});

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
    justifyContent: 'space-between',
    height: 48,
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
  },
  tabButton: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  tabContent: {
    width: '100%',
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
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: false,
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
