import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';

export function TelegramTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();

  // Filter routes that are actually visible
  const visibleRoutes = state.routes.filter(route => {
    const { options } = descriptors[route.key];
    if (options.tabBarItemStyle && (options.tabBarItemStyle as any).display === 'none') {
      return false;
    }
    // Checking for our custom TabBarNullButton
    if (options.tabBarButton && (options.tabBarButton as any).name === 'TabBarNullButton') {
      return false;
    }
    return true;
  });

  const activeRouteIndex = visibleRoutes.findIndex(route => route.key === state.routes[state.index].key);
  const moreRouteIndex = visibleRoutes.findIndex(route => route.name === 'More');
  // If current route is not in visible routes (e.g. unpinned module), fallback to "More" tab instead of "Home"
  const activeIndex = activeRouteIndex >= 0 ? activeRouteIndex : (moreRouteIndex >= 0 ? moreRouteIndex : 0);

  const [containerWidth, setContainerWidth] = useState(0);
  // Account for borderWidth (1px left + 1px right = 2px) to get true inner width for flex items
  const innerWidth = Math.max(0, containerWidth - 2); 
  const tabWidth = innerWidth > 0 ? innerWidth / visibleRoutes.length : 0;


  
  // Calculate exact target position for a tiny minimalist dot (4px wide)
  const targetDotWidth = 4;
  const targetX = 1 + (activeIndex * tabWidth) + (tabWidth / 2) - (targetDotWidth / 2);

  const indicatorPosition = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    if (tabWidth > 0) {
      indicatorPosition.value = withTiming(targetX, {
        duration: 300,
        easing: Easing.out(Easing.exp), // Extra smooth, premium snap
      });
      indicatorWidth.value = withTiming(targetDotWidth, {
        duration: 300,
        easing: Easing.out(Easing.exp),
      });
    }
  }, [targetX, targetDotWidth, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: indicatorPosition.value }],
      width: indicatorWidth.value,
    };
  });

  // Check if the active screen wants to hide the tab bar (e.g. Learning Video Player)
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const isHidden = focusedOptions.tabBarStyle && (focusedOptions.tabBarStyle as any).display === 'none';

  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withTiming(isHidden ? 150 : 0, {
      duration: 350,
      easing: Easing.out(Easing.exp),
    });
  }, [isHidden]);

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          backgroundColor: 'rgba(25, 25, 28, 0.98)',
          left: visibleRoutes.length >= 6 ? 6 : 16,
          right: visibleRoutes.length >= 6 ? 6 : 16,
        }, 
        containerAnimatedStyle
      ]} 
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      
      {/* Sliding dynamic minimalist dot indicator */}
      {tabWidth > 0 && (
        <Animated.View style={[
          styles.indicatorDot,
          indicatorStyle,
          { 
            backgroundColor: colors.accentPrimary,
            shadowColor: colors.accentPrimary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 6,
            elevation: 4
          }
        ]} />
      )}

      {/* Tabs */}
      {visibleRoutes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isVisuallyFocused = activeIndex === index;
        const isActuallyFocused = state.routes[state.index].key === route.key;

        const onPress = () => {
          feedback.tap();
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          // Navigate if the screen isn't the actual current screen. 
          // This allows tapping 'More' to open the More screen even if we're on an unpinned module and 'More' is visually focused.
          if (!isActuallyFocused && !event.defaultPrevented) {
            navigation.navigate({ name: route.name, merge: true } as any);
          }
        };

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
        const iconName = isVisuallyFocused ? iconSet.active : iconSet.inactive;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isVisuallyFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={(options as any).tabBarTestID}
            onPress={onPress}
            style={styles.tabButton}
            android_ripple={null}
          >
            <View style={{ alignItems: 'center' }}>
              <Ionicons 
                name={iconName} 
                size={24} 
                color={isVisuallyFocused ? colors.accentPrimary : colors.textMuted} 
              />
              <Text style={[
                styles.tabLabel, 
                { color: isVisuallyFocused ? colors.accentPrimary : colors.textMuted }
              ]}>
                {route.name === 'Attendance' ? 'Attend' : route.name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    height: 64, // Slightly more compact to match Telegram's exact proportions
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  indicatorDot: {
    position: 'absolute',
    bottom: 6, // Rests subtly at the very bottom edge of the nav bar
    height: 4,
    borderRadius: 2, // Perfect tiny circle
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    flexBasis: 0, // CRITICAL: Forces all tabs to have strictly equal width, regardless of text length!
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
    marginTop: 2, 
  },
});
