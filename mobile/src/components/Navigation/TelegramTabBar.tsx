import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  FadeIn,
  FadeOut,
  Easing,
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
  Home:        { name: 'Home',   activeIcon: 'home',             inactiveIcon: 'home-outline' },
  Tasks:       { name: 'Tasks',  activeIcon: 'checkmark-circle', inactiveIcon: 'checkmark-circle-outline' },
  Gym:         { name: 'Gym',    activeIcon: 'arm-flex',         inactiveIcon: 'arm-flex-outline', iconSet: 'mci' },
  Calendar:    { name: 'Cal',    activeIcon: 'calendar-number',  inactiveIcon: 'calendar-number-outline' },
  Habits:      { name: 'Habits', activeIcon: 'sync',             inactiveIcon: 'sync-outline' },
  Attendance:  { name: 'Attend', activeIcon: 'id-card',          inactiveIcon: 'id-card-outline' },
  Assignments: { name: 'Assign', activeIcon: 'clipboard',        inactiveIcon: 'clipboard-outline' },
  Grades:      { name: 'Grades', activeIcon: 'calculator',       inactiveIcon: 'calculator-outline' },
  Learning:    { name: 'Learn',  activeIcon: 'library',          inactiveIcon: 'library-outline' },
  Notes:       { name: 'Notes',  activeIcon: 'folder',           inactiveIcon: 'folder-outline' },
  Analytics:   { name: 'Stats',  activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline' },
  Sara:        { name: 'SARA',   activeIcon: 'planet',           inactiveIcon: 'planet-outline' },
  More:        { name: 'More',   activeIcon: 'apps',             inactiveIcon: 'apps-outline' },
};

const DEFAULT_TAB_CONFIG = {
  name: '',
  activeIcon: 'ellipse' as keyof typeof Ionicons.glyphMap,
  inactiveIcon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap,
};

// ─── Individual Tab Item ──────────────────────────────────────────────────────
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

  // ── Icon bounce: WhatsApp-grade overshoot sequence ────────────────────────
  const scale      = useSharedValue(isFocused ? 1.1 : 1);
  const iconTransY = useSharedValue(0);
  const labelOpacity = useSharedValue(isFocused ? 1 : 0.78);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      // On first render don't animate — just snap to final state
      isFirstRender.current = false;
      return;
    }

    if (isFocused) {
      // Overshoot → settle: 1.0 → 1.18 (80ms) → spring to 1.1
      scale.value = withSequence(
        withTiming(1.18, { duration: 80, easing: Easing.out(Easing.quad) }),
        withSpring(1.1, { damping: 14, stiffness: 320, mass: 0.6 }),
      );
      // Micro pop upward then spring back
      iconTransY.value = withSequence(
        withTiming(-4, { duration: 80, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 16, stiffness: 280, mass: 0.5 }),
      );
      labelOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
    } else {
      scale.value        = withSpring(1, { damping: 18, stiffness: 350, mass: 0.5 });
      iconTransY.value   = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      labelOpacity.value = withTiming(0.78, { duration: 120, easing: Easing.out(Easing.quad) });
    }
  }, [isFocused]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: iconTransY.value },
    ],
  }));

  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
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

  const activeColor   = colors.accentPrimary || '#a599ff';
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
        {/* Icon with bounce animation */}
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

          {/* Discrete notification badge — animated entrance */}
          {badge !== undefined && badge > 0 && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={[
                styles.badge,
                {
                  backgroundColor: colors.error || '#FF453A',
                  borderColor:     isDark ? '#000000' : '#FFFFFF',
                },
              ]}
            >
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* Label with opacity cross-fade */}
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            animatedLabelStyle,
            {
              color:      isFocused ? activeColor : inactiveColor,
              fontFamily: isFocused ? FONT_FAMILY.bold : FONT_FAMILY.medium,
            },
          ]}
        >
          {config.name}
        </Animated.Text>
      </View>
    </Pressable>
  );
});

// ─── Animated Glowing Pill Indicator ─────────────────────────────────────────
/**
 * Renders a gradient pill that slides horizontally between tab positions.
 * The pill's X position is driven by a shared value so it animates smoothly
 * between any two tabs — including non-adjacent jumps.
 */
interface PillIndicatorProps {
  activeIndex: number;
  tabCount:    number;
  tabWidth:    number;
  colors:      any;
}

function PillIndicator({ activeIndex, tabCount, tabWidth, colors }: PillIndicatorProps) {
  // Pill is 68% of each tab slot, centered within it
  const PILL_W_RATIO = 0.68;
  const pillWidth    = tabWidth * PILL_W_RATIO;
  // centerOffset shifts the pill right so it sits centered within the tab slot
  const centerOffset = (tabWidth - pillWidth) / 2;

  // Spring target already includes center offset — avoids stale-closure in worklet
  const pillX = useSharedValue(activeIndex * tabWidth + centerOffset);

  useEffect(() => {
    // Fixed-duration ease-out-expo: pill always arrives in 160ms regardless
    // of travel distance (Apple UITabBar behaviour). withSpring was
    // distance-dependent so long jumps (e.g. Home → Attend) lagged behind
    // the screen switch.
    pillX.value = withTiming(activeIndex * tabWidth + centerOffset, {
      duration: 160,
      easing: Easing.bezier(0.16, 1, 0.3, 1), // Apple ease-out-expo
    });
  }, [activeIndex, tabWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const accent = colors.accentPrimary || '#a599ff';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pillContainer,
        { width: pillWidth },
        pillStyle,
      ]}
    >
      <LinearGradient
        // Top-to-bottom: stronger tint at top, fading out at bottom
        colors={[accent + '40', accent + '18']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.pill}
      />
    </Animated.View>
  );
}

// ─── Main Navigation Bar ──────────────────────────────────────────────────────
type TelegramTabBarProps = BottomTabBarProps & { badges?: Record<string, number> };

export const TelegramTabBar = React.memo(function TelegramTabBar({
  state,
  descriptors,
  navigation,
  badges: passedBadges,
}: TelegramTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets             = useSafeAreaInsets();
  const { pinnedModules }  = usePinnedModules();
  const hookBadges         = useTabBarBadges();
  const badges = (passedBadges && Object.keys(passedBadges).length > 0) ? passedBadges : hookBadges;

  const pinnedKey = (Array.isArray(pinnedModules) && pinnedModules.length > 0)
    ? pinnedModules.join(',')
    : 'Tasks,Gym,Calendar,Attendance';

  const effectivePinned = useMemo(() => pinnedKey.split(','), [pinnedKey]);

  // Filter and order visible routes
  const visibleRoutes = useMemo(() => {
    const unhidden = state.routes.filter((route) => {
      const { options } = descriptors[route.key];
      if (
        options.tabBarItemStyle &&
        (options.tabBarItemStyle as any).display === 'none'
      ) return false;
      if (
        options.tabBarButton &&
        (options.tabBarButton as any).name === 'TabBarNullButton'
      ) return false;
      return true;
    });

    // Strict ordering: Home → pinned modules (user order) → More
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
    (route) => route.key === state.routes[state.index].key,
  );
  const moreRouteIndex = visibleRoutes.findIndex(
    (route) => route.name === 'More',
  );
  const activeIndex =
    activeRouteIndex >= 0
      ? activeRouteIndex
      : moreRouteIndex >= 0
      ? moreRouteIndex
      : 0;

  // Store raw row width; tabWidth is computed in render so it always uses
  // the CURRENT visibleRoutes.length — avoids stale-closure drift when
  // the route count changes after layout has already fired.
  const [tabsRowWidth, setTabsRowWidth] = useState(0);
  const onTabsRowLayout = useCallback((e: LayoutChangeEvent) => {
    setTabsRowWidth(e.nativeEvent.layout.width);
  }, []); // No dependency — raw width never goes stale

  // Derived in render: guaranteed to reflect current tab count
  const tabWidth = tabsRowWidth > 0
    ? tabsRowWidth / Math.max(visibleRoutes.length, 1)
    : 0;

  // Hide animation (slide down when a full-screen modal requests it)
  const focusedOptions = descriptors[state.routes[state.index].key]?.options || {};
  const isScreenOptionsHidden =
    focusedOptions.tabBarStyle &&
    (focusedOptions.tabBarStyle as any).display === 'none';

  const shouldHide   = Boolean(isScreenOptionsHidden);
  const translateY   = useSharedValue(shouldHide ? 110 : 0);
  const tabOpacity   = useSharedValue(shouldHide ? 0 : 1);

  useEffect(() => {
    translateY.value = withTiming(shouldHide ? 110 : 0, {
      duration: 220,
      easing:   Easing.out(Easing.cubic),
    });
    tabOpacity.value = withTiming(shouldHide ? 0 : 1, {
      duration: 200,
      easing:   Easing.out(Easing.quad),
    });
  }, [shouldHide]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity:   tabOpacity.value,
  }));

  const bottomPadding  = insets.bottom > 0 ? insets.bottom : 8;
  const tabBarHeight   = 48 + 6 + bottomPadding;
  const gradientHeight = tabBarHeight + 64;

  const gradientColors = isDark
    ? [
        'rgba(0,0,0,0)',
        'rgba(0,0,0,0.30)',
        'rgba(0,0,0,0.68)',
        'rgba(0,0,0,0.90)',
        'rgba(0,0,0,0.98)',
      ] as const
    : [
        'rgba(244,243,248,0)',
        'rgba(244,243,248,0.35)',
        'rgba(244,243,248,0.72)',
        'rgba(244,243,248,0.92)',
        'rgba(244,243,248,0.99)',
      ] as const;

  const currentRouteName = state.routes[state.index]?.name;
  const isMoreActive     = currentRouteName === 'More';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.outerWrapper,
        { height: isMoreActive ? tabBarHeight : gradientHeight },
        containerAnimatedStyle,
      ]}
    >
      {/* Spotify-style gradient fade (hidden on More screen) */}
      {!isMoreActive && (
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.38, 0.65, 0.84, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {/* Tab bar row */}
      <View style={[styles.dockedWrapper, { paddingBottom: bottomPadding }]}>
        {/* Sliding pill indicator — rendered behind icons */}
        {tabWidth > 0 && (
          <PillIndicator
            activeIndex={activeIndex}
            tabCount={visibleRoutes.length}
            tabWidth={tabWidth}
            colors={colors}
          />
        )}

        <View style={styles.tabsRow} onLayout={onTabsRowLayout}>
          {visibleRoutes.map((route, index) => {
            const isVisuallyFocused  = activeIndex === index;
            const isActuallyFocused  = state.routes[state.index].key === route.key;

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
  outerWrapper: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    zIndex:          99,
    backgroundColor: 'transparent',
  },
  dockedWrapper: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    paddingTop:      6,
    backgroundColor: 'transparent',
  },
  tabsRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    height:          48,
    backgroundColor: 'transparent',
    // No paddingHorizontal — removing it eliminates the coordinate-space
    // mismatch between the pill (absolute in dockedWrapper) and the tabs.
  },
  tabButton: {
    flex:            1,
    flexBasis:       0,
    alignItems:      'center',
    justifyContent:  'center',
    height:          '100%',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  tabContent: {
    width:          '100%',
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconBox: {
    width:          26,
    height:         26,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize:           10,
    marginTop:          2,
    letterSpacing:      0,
    textAlign:          'center',
    includeFontPadding: false,
  },
  badge: {
    position:         'absolute',
    top:              -3,
    right:            -8,
    minWidth:         15,
    height:           15,
    borderRadius:     7.5,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 3,
    borderWidth:      1.5,
  },
  badgeText: {
    color:      '#FFFFFF',
    fontSize:   8.5,
    fontFamily: FONT_FAMILY.bold,
  },
  // \u2500\u2500 Sliding pill indicator \u2500\u2500
  pillContainer: {
    position:     'absolute',
    // dockedWrapper paddingTop:6 + tabsRow height:48.
    // Tab content (icon 26px + gap 2px + label ~12px) centers in 48px
    // occupying ~px4-44 within tabsRow = px10-50 within dockedWrapper.
    // top:8 + height:44 = covers px8-52, giving 4px top inset and full label coverage.
    top:          8,
    left:         0,
    height:       44,
    zIndex:       0,
    overflow:     'hidden',
    borderRadius: 12,
  },
  pill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
});

