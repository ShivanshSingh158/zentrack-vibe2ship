import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { offsetDateStr, formatLocalDateStr, parseLocalDate } from '../../utils/dateUtils';

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

const generateDatesForAnchor = (anchorDateStr: string, selectedDateStr: string) => {
  const dates: DateObj[] = [];
  const base = parseLocalDate(anchorDateStr);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayShortNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayStr = formatLocalDateStr(new Date());

  // Centered sequence of 7 days around the anchor date (-3 to +3)
  for (let i = -3; i <= 3; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = formatLocalDateStr(d);

    dates.push({
      dateStr,
      month: months[d.getMonth()],
      year: d.getFullYear().toString(),
      dateNum: d.getDate().toString(),
      dayFull: dayFullNames[d.getDay()],
      dayShort: dayShortNames[d.getDay()],
      active: dateStr === selectedDateStr,
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

  useEffect(() => {
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

  // Window geometry
  const initialWidth = Dimensions.get('window').width;
  const containerWidthRef = useRef(initialWidth);
  const [containerWidth, setContainerWidth] = useState(initialWidth);

  // Anchor date represents the center (index 3) of the currently visible 7-day strip.
  const [anchorDate, setAnchorDate] = useState(selectedDate);
  const anchorDateRef = useRef(anchorDate);
  anchorDateRef.current = anchorDate;

  const currentDateRef = useRef(selectedDate);
  currentDateRef.current = selectedDate;

  // Keep anchor in sync if selectedDate moves outside the current 7-day window
  useEffect(() => {
    if (!anchorDateRef.current) return;
    const base = parseLocalDate(anchorDateRef.current);
    const minD = new Date(base);
    minD.setDate(base.getDate() - 3);
    const maxD = new Date(base);
    maxD.setDate(base.getDate() + 3);
    const cur = parseLocalDate(selectedDate);
    if (cur < minD || cur > maxD) {
      setAnchorDate(selectedDate);
    }
  }, [selectedDate]);

  // 3-Week Data: Prev Week (-7 days), Current Week (anchor), Next Week (+7 days)
  const prevWeekDates = useMemo(() => {
    const prevAnchor = offsetDateStr(anchorDate, -7);
    return generateDatesForAnchor(prevAnchor, selectedDate);
  }, [anchorDate, selectedDate]);

  const currentWeekDates = useMemo(() => {
    return generateDatesForAnchor(anchorDate, selectedDate);
  }, [anchorDate, selectedDate]);

  const nextWeekDates = useMemo(() => {
    const nextAnchor = offsetDateStr(anchorDate, 7);
    return generateDatesForAnchor(nextAnchor, selectedDate);
  }, [anchorDate, selectedDate]);

  // Active date object for the header display (DayFull, Month, Year)
  const activeDateObj = useMemo(() => {
    const found = currentWeekDates.find((d) => d.active);
    if (found) return found;
    const base = parseLocalDate(selectedDate);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayStr = formatLocalDateStr(new Date());
    return {
      dateStr: selectedDate,
      month: months[base.getMonth()],
      year: base.getFullYear().toString(),
      dateNum: base.getDate().toString(),
      dayFull: dayFullNames[base.getDay()],
      dayShort: 'S',
      active: true,
      isToday: selectedDate === todayStr,
    };
  }, [currentWeekDates, selectedDate]);

  // Continuous Worklet Translation: starts centered at -containerWidth
  const translateX = useSharedValue(-initialWidth);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    translateX.value = -containerWidth;
  }, [containerWidth, translateX]);

  const animatedPagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: containerWidth * 3,
  }));

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidthRef.current) > 2) {
      containerWidthRef.current = w;
      setContainerWidth(w);
      translateX.value = -w;
    }
  }, [translateX]);

  const commitNextWeek = useCallback(() => {
    const nextAnchor = offsetDateStr(anchorDateRef.current, 7);
    const nextSelected = offsetDateStr(currentDateRef.current, 7);
    setAnchorDate(nextAnchor);
    onSelectDate(nextSelected);
    translateX.value = -containerWidthRef.current;
    isAnimatingRef.current = false;
  }, [onSelectDate, translateX]);

  const commitPrevWeek = useCallback(() => {
    const prevAnchor = offsetDateStr(anchorDateRef.current, -7);
    const prevSelected = offsetDateStr(currentDateRef.current, -7);
    setAnchorDate(prevAnchor);
    onSelectDate(prevSelected);
    translateX.value = -containerWidthRef.current;
    isAnimatingRef.current = false;
  }, [onSelectDate, translateX]);

  const handleJumpToToday = useCallback(() => {
    Haptics.selectionAsync();
    const todayStr = formatLocalDateStr(new Date());
    setAnchorDate(todayStr);
    onSelectDate(todayStr);
    translateX.value = -containerWidthRef.current;
  }, [onSelectDate, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (isAnimatingRef.current) return false;
          return (
            Math.abs(gestureState.dx) > 12 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderGrant: () => {
          // Ready to track gesture
        },
        onPanResponderMove: (_, gestureState) => {
          if (isAnimatingRef.current) return;
          const w = containerWidthRef.current;
          translateX.value = -w + gestureState.dx;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isAnimatingRef.current) return;
          const w = containerWidthRef.current;
          const dx = gestureState.dx;
          const vx = gestureState.vx;

          if (dx < -32 || vx < -0.35) {
            // Swiped left -> Go to Next Week (+7 days)
            isAnimatingRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            translateX.value = withTiming(-2 * w, {
              duration: 200,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }, (finished) => {
              if (finished) {
                runOnJS(commitNextWeek)();
              }
            });
          } else if (dx > 32 || vx > 0.35) {
            // Swiped right -> Go to Last Week (-7 days)
            isAnimatingRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            translateX.value = withTiming(0, {
              duration: 200,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }, (finished) => {
              if (finished) {
                runOnJS(commitPrevWeek)();
              }
            });
          } else {
            // Did not cross threshold -> spring snap back to center
            translateX.value = withSpring(-w, {
              damping: 28,
              stiffness: 300,
              mass: 0.8,
            });
          }
        },
        onPanResponderTerminate: () => {
          if (isAnimatingRef.current) return;
          translateX.value = withSpring(-containerWidthRef.current, {
            damping: 28,
            stiffness: 300,
            mass: 0.8,
          });
        },
      }),
    [commitNextWeek, commitPrevWeek, translateX]
  );

  return (
    <View style={[styles.container, style]} onLayout={onContainerLayout} {...panResponder.panHandlers}>
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

      {/* 3-Week Continuous Sliding Viewport (Zero Flicker, 120fps Native Thread) */}
      <Animated.View style={[styles.pagerRow, animatedPagerStyle]}>
        {/* Page -1: Last Week */}
        <View style={[styles.weekPage, { width: containerWidth }]}>
          {prevWeekDates.map((d) => (
            <DatePillItem
              key={d.dateStr}
              dateObj={d}
              taskDates={taskDates}
              onSelectDate={onSelectDate}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>

        {/* Page 0: Current Week */}
        <View style={[styles.weekPage, { width: containerWidth }]}>
          {currentWeekDates.map((d) => (
            <DatePillItem
              key={d.dateStr}
              dateObj={d}
              taskDates={taskDates}
              onSelectDate={onSelectDate}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>

        {/* Page +1: Next Week */}
        <View style={[styles.weekPage, { width: containerWidth }]}>
          {nextWeekDates.map((d) => (
            <DatePillItem
              key={d.dateStr}
              dateObj={d}
              taskDates={taskDates}
              onSelectDate={onSelectDate}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
});

export default TaskDateStrip;

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    container: {
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: 'transparent',
      width: '100%',
      overflow: 'hidden',
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
    pagerRow: {
      flexDirection: 'row',
    },
    weekPage: {
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
