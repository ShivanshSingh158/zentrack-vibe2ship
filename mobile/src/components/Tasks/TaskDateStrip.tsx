import React, { useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated as RNAnimated } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { offsetDateStr, formatLocalDateStr } from '../../utils/dateUtils';

export interface DateObj {
  dateStr: string;
  month: string;
  year: string;
  dateNum: string;
  dayFull: string;
  dayShort: string;
  active: boolean;
  isToday: boolean;
}

interface TaskDateStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  taskDates?: Set<string>;
  style?: any;
}

const generateDates = (baseDateStr: string) => {
  const dates: DateObj[] = [];
  const base = new Date(baseDateStr + 'T00:00:00');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayShortNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayStr = formatLocalDateStr(new Date());

  // Centered sequence of 7 days around the active date (-3 to +3)
  for (let i = -3; i <= 3; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    dates.push({
      dateStr,
      month: months[d.getMonth()],
      year: d.getFullYear().toString(),
      dateNum: d.getDate().toString(),
      dayFull: dayFullNames[d.getDay()],
      dayShort: dayShortNames[d.getDay()],
      active: i === 0,
      isToday: dateStr === todayStr,
    });
  }
  return dates;
};

const DatePillItem = React.memo(function DatePillItem({
  dateObj,
  taskDates,
  onSelectDate,
  colors,
  styles,
}: {
  dateObj: DateObj;
  taskDates?: Set<string>;
  onSelectDate: (dateStr: string) => void;
  colors: any;
  styles: any;
}) {
  const isActive = dateObj.active;
  const numScale = useSharedValue(isActive ? 1.08 : 1);

  React.useEffect(() => {
    if (isActive) {
      numScale.value = withSequence(
        withTiming(1.08, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withSpring(1.0, { damping: 26, stiffness: 260 })
      );
    } else {
      numScale.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    }
  }, [isActive]);

  const animNumStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numScale.value }],
  }));

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onSelectDate(dateObj.dateStr);
  }, [onSelectDate, dateObj.dateStr]);

  return (
    <AnimatedPressable
      style={[styles.dateItem, isActive && styles.dateItemActive]}
      scaleTo={0.95}
      onPress={handlePress}
    >
      <Text style={[styles.dateDay, isActive && styles.dateDayActive, dateObj.isToday && !isActive && { color: colors.accentPrimary }]}>
        {dateObj.dayShort}
      </Text>
      <Animated.Text
        style={[
          styles.dateNum,
          isActive && styles.dateNumActive,
          dateObj.isToday && !isActive && { color: colors.accentPrimary },
          animNumStyle,
        ]}
      >
        {dateObj.dateNum}
      </Animated.Text>
      {/* Dot indicator */}
      <View
        style={[
          styles.dot,
          isActive ? styles.dotActive : null,
          taskDates?.has(dateObj.dateStr) ? styles.dotVisible : null,
          dateObj.isToday && !isActive && { backgroundColor: colors.accentPrimary },
        ]}
      />
    </AnimatedPressable>
  );
});

export const TaskDateStrip = React.memo(function TaskDateStrip({
  selectedDate,
  onSelectDate,
  taskDates,
  style,
}: TaskDateStripProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const dates = useMemo(() => generateDates(selectedDate), [selectedDate]);

  // Extract month and year from the active date (at index 3 in our -3 to +3 array)
  const activeDateObj = dates[3];

  const currentDateRef = useRef(selectedDate);
  currentDateRef.current = selectedDate;

  // Slide animation for swipe transition
  const translateXAnim = useRef(new RNAnimated.Value(0)).current;
  const opacityAnim = useRef(new RNAnimated.Value(1)).current;

  const animateSlide = useCallback((direction: 'left' | 'right', commitAction: () => void) => {
    const exitVal = direction === 'left' ? -18 : 18;
    const enterVal = direction === 'left' ? 18 : -18;

    RNAnimated.parallel([
      RNAnimated.timing(translateXAnim, {
        toValue: exitVal,
        duration: 75,
        useNativeDriver: true,
      }),
      RNAnimated.timing(opacityAnim, {
        toValue: 0.35,
        duration: 75,
        useNativeDriver: true,
      }),
    ]).start(() => {
      commitAction();
      translateXAnim.setValue(enterVal);
      RNAnimated.parallel([
        RNAnimated.spring(translateXAnim, {
          toValue: 0,
          friction: 12,
          tension: 90,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacityAnim, {
          toValue: 1,
          duration: 110,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [translateXAnim, opacityAnim]);

  const handleNextDay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateSlide('left', () => {
      const nextDate = offsetDateStr(currentDateRef.current, 1);
      onSelectDate(nextDate);
    });
  }, [animateSlide, onSelectDate]);

  const handlePrevDay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateSlide('right', () => {
      const prevDate = offsetDateStr(currentDateRef.current, -1);
      onSelectDate(prevDate);
    });
  }, [animateSlide, onSelectDate]);

  const handleJumpToToday = useCallback(() => {
    Haptics.selectionAsync();
    const todayStr = formatLocalDateStr(new Date());
    onSelectDate(todayStr);
  }, [onSelectDate]);

  // PanResponder to allow horizontal day swiping across the date strip
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 16 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -28) {
            handleNextDay();
          } else if (gestureState.dx > 28) {
            handlePrevDay();
          }
        },
      }),
    [handleNextDay, handlePrevDay]
  );

  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}>
      {/* Header Row: Day • Month Year + Navigation Actions */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeftCol}>
          <Text style={styles.dayFullText}>{activeDateObj.dayFull}</Text>
          <Text style={styles.monthYearText}>
            {activeDateObj.month} {activeDateObj.year}
          </Text>
        </View>

        <View style={styles.headerNavRow}>
          {!activeDateObj.isToday && (
            <TouchableOpacity
              onPress={handleJumpToToday}
              style={[
                styles.todayPill,
                { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.12)' },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text
                style={[
                  styles.todayPillText,
                  { color: isDark ? '#C4B5FD' : colors.accentPrimary },
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Dates Row with slide animation */}
      <RNAnimated.View
        style={[
          styles.dateRow,
          {
            transform: [{ translateX: translateXAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {dates.map((d) => (
          <DatePillItem
            key={d.dateStr}
            dateObj={d}
            taskDates={taskDates}
            onSelectDate={onSelectDate}
            colors={colors}
            styles={styles}
          />
        ))}
      </RNAnimated.View>
    </View>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    container: {
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: 'transparent',
      width: '100%',
    },
    headerRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 8,
    },
    headerLeftCol: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    dayFullText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    monthYearText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: colors.textTertiary,
    },
    headerNavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    todayPill: {
      paddingHorizontal: 9,
      paddingVertical: 3.5,
      borderRadius: 999,
      marginRight: 2,
    },
    todayPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 0.1,
    },
    chevronBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
    },
    dateRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
      paddingHorizontal: 8,
    },
    dateItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: 56,
      borderRadius: 14,
      backgroundColor: isDark ? '#141416' : colors.surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : colors.border,
    },
    dateItemActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
      shadowColor: colors.accentPrimary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.35 : 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    dateDay: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textTertiary,
      marginBottom: 4,
    },
    dateDayActive: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontWeight: '700',
    },
    dateNum: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    dateNumActive: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontWeight: '700',
    },
    dot: {
      width: 3.5,
      height: 3.5,
      borderRadius: 2,
      backgroundColor: colors.textTertiary,
      marginTop: 4,
      opacity: 0,
    },
    dotVisible: {
      opacity: 1,
    },
    dotActive: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
    },
  });
