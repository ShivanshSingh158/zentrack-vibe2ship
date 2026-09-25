import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated as RNAnimated,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { DAY_SHORT, getLocalDateString } from './attendanceConstants';

interface HorizontalWeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  holidays?: string[];
  today: string;
}

function parseDateToMidnight(dateStr: string): Date {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  } catch {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    return dt;
  }
}

function getSundayOfDate(dateStr: string): Date {
  const dt = parseDateToMidnight(dateStr);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day);
  return dt;
}

const WeekDayCol = React.memo(function WeekDayCol({
  item,
  today,
  colors,
  isDark,
  styles,
  onPress,
}: {
  item: any;
  today: string;
  colors: any;
  isDark: boolean;
  styles: any;
  onPress: () => void;
}) {
  const numScale = useSharedValue(1);

  useEffect(() => {
    if (item.isSel) {
      numScale.value = withSequence(
        withTiming(1.06, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1.0, { damping: 28, stiffness: 280, mass: 0.85 })
      );
    } else {
      numScale.value = withTiming(1, { duration: 120 });
    }
  }, [item.isSel]);

  const animNumStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numScale.value }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.dayCol,
        item.dateStr > today && { opacity: 0.4 },
      ]}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.dayNameText,
          { color: item.isSel ? '#FFFFFF' : (colors.textSecondary || '#8E8E93') },
          item.isSel && styles.dayNameTextSelected,
        ]}
      >
        {item.dayName}
      </Text>
      <Reanimated.Text
        style={[
          styles.dayNumText,
          { color: item.isSel ? '#FFFFFF' : (colors.textPrimary || (isDark ? '#FFFFFF' : '#111827')) },
          item.isSel && styles.dayNumTextSelected,
          item.isToday && !item.isSel && { color: colors.accentPrimary || '#5046E5' },
          animNumStyle,
        ]}
      >
        {item.isHol ? '🌴' : item.dayNum}
      </Reanimated.Text>
    </TouchableOpacity>
  );
});

export const HorizontalWeekStrip = React.memo(function HorizontalWeekStrip({
  selectedDate,
  onSelectDate,
  holidays = [],
  today,
}: HorizontalWeekStripProps) {
  const { colors, isDark } = useTheme();

  // Animations for week slide transition
  const translateXAnim = useRef(new RNAnimated.Value(0)).current;
  const opacityAnim = useRef(new RNAnimated.Value(1)).current;

  // Stably keep current active date in ref to prevent recreating PanResponder on every day selection
  const currentDateRef = useRef(selectedDate || today);
  currentDateRef.current = selectedDate || today;

  // Derive the active week's Sunday directly from selectedDate (or today)
  const activeSunday = useMemo(() => {
    return getSundayOfDate(selectedDate || today);
  }, [selectedDate, today]);

  // Compute the 7 days for the active week
  const weekDays = useMemo(() => {
    const baseMs = activeSunday.getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseMs + i * 86400000);
      const dateStr = getLocalDateString(d);
      const dayNum = d.getDate();
      const isSel = selectedDate === dateStr;
      const isToday = today === dateStr;
      const isHol = holidays.includes(dateStr);

      return {
        dateStr,
        dayNum,
        dayName: DAY_SHORT[i],
        isSel,
        isToday,
        isHol,
      };
    });
  }, [activeSunday, selectedDate, today, holidays]);

  // Magnetic Sliding Pill Worklet
  const selectedIndex = useMemo(() => {
    const idx = weekDays.findIndex((d) => d.isSel);
    return idx >= 0 ? idx : 0;
  }, [weekDays]);

  const pillPosition = useSharedValue(selectedIndex);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      pillPosition.value = selectedIndex;
      return;
    }
    // Apple iOS Critically Damped Spring: zero wobble, zero overshoot, silky-smooth glide
    pillPosition.value = withSpring(selectedIndex, {
      damping: 30,
      stiffness: 260,
      mass: 0.85,
    });
  }, [selectedIndex]);

  const [rowWidth, setRowWidth] = useState(0);
  const colWidth = rowWidth > 0 ? rowWidth / 7 : 0;

  const animPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillPosition.value * colWidth + 1.5 }],
    width: Math.max(0, colWidth - 3),
    opacity: colWidth > 0 ? 1 : 0,
  }));

  // Navigation handlers with smooth directional animation
  const animateTransition = useCallback(
    (direction: 'left' | 'right', commitAction: () => void) => {
      const exitValue = direction === 'left' ? -24 : 24;
      const enterValue = direction === 'left' ? 24 : -24;

      RNAnimated.parallel([
        RNAnimated.timing(translateXAnim, {
          toValue: exitValue,
          duration: 90,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacityAnim, {
          toValue: 0.2,
          duration: 90,
          useNativeDriver: true,
        }),
      ]).start(() => {
        commitAction();
        translateXAnim.setValue(enterValue);
        RNAnimated.parallel([
          RNAnimated.spring(translateXAnim, {
            toValue: 0,
            friction: 12,
            tension: 80,
            useNativeDriver: true,
          }),
          RNAnimated.timing(opacityAnim, {
            toValue: 1,
            duration: 120,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [translateXAnim, opacityAnim]
  );

  const goToNextWeek = useCallback(() => {
    Haptics.selectionAsync();
    animateTransition('left', () => {
      const cur = parseDateToMidnight(currentDateRef.current);
      cur.setDate(cur.getDate() + 7);
      onSelectDate(getLocalDateString(cur));
    });
  }, [onSelectDate, animateTransition]);

  const goToPrevWeek = useCallback(() => {
    Haptics.selectionAsync();
    animateTransition('right', () => {
      const cur = parseDateToMidnight(currentDateRef.current);
      cur.setDate(cur.getDate() - 7);
      onSelectDate(getLocalDateString(cur));
    });
  }, [onSelectDate, animateTransition]);

  // PanResponder to allow horizontal week swiping without blocking vertical scrolling (stable instance)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 18 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -35) {
            goToNextWeek();
          } else if (gestureState.dx > 35) {
            goToPrevWeek();
          }
        },
      }),
    [goToNextWeek, goToPrevWeek]
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <RNAnimated.View
        style={[
          styles.weekRow,
          {
            transform: [{ translateX: translateXAnim }],
            opacity: opacityAnim,
          },
        ]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && w !== rowWidth) {
            setRowWidth(w);
          }
        }}
      >
        {/* WhatsApp Magnetic Sliding Pill Indicator */}
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.slidingActivePill,
            {
              backgroundColor: colors.accentPrimary || '#5046E5',
              shadowColor: colors.accentPrimary || '#5046E5',
            },
            animPillStyle,
          ]}
        />

        {weekDays.map((item) => (
          <WeekDayCol
            key={item.dateStr}
            item={item}
            today={today}
            colors={colors}
            isDark={isDark}
            styles={styles}
            onPress={() => {
              Haptics.selectionAsync();
              onSelectDate(item.dateStr);
            }}
          />
        ))}
      </RNAnimated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 58,
    marginTop: 0,
    marginBottom: 8,
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    width: '100%',
    position: 'relative',
  },
  slidingActivePill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 12,
    shadowColor: '#5046E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 0,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 12,
    marginHorizontal: 1.5,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  dayNameText: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '500',
  },
  dayNameTextSelected: {
    fontWeight: '700',
  },
  dayNumText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dayNumTextSelected: {
    fontWeight: '700',
  },
});
