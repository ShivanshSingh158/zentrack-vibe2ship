import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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

// ── DatePillItem ──────────────────────────────────────────────────────────────
// All props are primitives so React.memo shallow-compare actually prevents
// re-renders. The active highlight is drawn by the parent WeekRow pill — this
// component never changes its own background, eliminating the flicker entirely.
const DatePillItem = React.memo(function DatePillItem({
  dateStr,
  dateNum,
  dayShort,
  isActive,
  isToday,
  hasDot,
  onSelectDate,
  colors,
  isDark,
}: {
  dateStr: string;
  dateNum: string;
  dayShort: string;
  isActive: boolean;
  isToday: boolean;
  hasDot: boolean;
  onSelectDate: (dateStr: string) => void;
  colors: any;
  isDark: boolean;
}) {
  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onSelectDate(dateStr);
  }, [onSelectDate, dateStr]);

  const activeTextColor = isDark ? '#000000' : '#FFFFFF';
  const dayColor  = isActive ? activeTextColor : isToday ? colors.accentPrimary : colors.textTertiary;
  const numColor  = isActive ? activeTextColor : isToday ? colors.accentPrimary : colors.textPrimary;
  const dotColor  = isActive ? activeTextColor : isToday ? colors.accentPrimary : colors.textTertiary;

  return (
    <AnimatedPressable
      style={styles_dateItem}
      scaleTo={0.95}
      onPress={handlePress}
    >
      <Text style={[styles_dateDay, { color: dayColor }]}>
        {dayShort}
      </Text>
      <Text
        style={[
          styles_dateNum,
          { color: numColor, fontFamily: isActive ? 'Inter_700Bold' : 'Inter_600SemiBold' },
        ]}
      >
        {dateNum}
      </Text>
      {hasDot
        ? <View style={[styles_dot, { backgroundColor: dotColor }]} />
        : <View style={styles_dotPlaceholder} />
      }
    </AnimatedPressable>
  );
}, (prev, next) => (
  prev.dateStr    === next.dateStr    &&
  prev.dateNum    === next.dateNum    &&
  prev.dayShort   === next.dayShort   &&
  prev.isActive   === next.isActive   &&
  prev.isToday    === next.isToday    &&
  prev.hasDot     === next.hasDot     &&
  prev.onSelectDate === next.onSelectDate &&
  prev.colors     === next.colors     &&
  prev.isDark     === next.isDark
));

// Module-level static styles for DatePillItem (never rebuilt)
const styles_dateItem = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: 56,
  borderRadius: 14,
};
const styles_dateDay = {
  fontFamily: 'Inter_500Medium',
  fontSize: 11,
  marginBottom: 4,
};
const styles_dateNum = {
  fontSize: 15,
};
const styles_dot = {
  width: 3.5,
  height: 3.5,
  borderRadius: 2,
  marginTop: 4,
};
const styles_dotPlaceholder = {
  width: 3.5,
  height: 3.5,
  marginTop: 4,
};

// ── WeekRow ───────────────────────────────────────────────────────────────────
// Renders a 7-day row with a SINGLE native-thread sliding pill indicator.
// Only the pill's translateX animates — no per-cell background changes.
const WeekRow = React.memo(function WeekRow({
  dates,
  taskDates,
  onSelectDate,
  colors,
  isDark,
  containerWidth,
  pillActiveStyle,
  hasPill,
}: {
  dates: DateObj[];
  taskDates?: Set<string>;
  onSelectDate: (d: string) => void;
  colors: any;
  isDark: boolean;
  containerWidth: number;
  pillActiveStyle: any;
  hasPill: boolean;
}) {
  const activeIndex = dates.findIndex(d => d.active);

  // Exact flex layout math: 8px padding on each side (16px total) + 6 gaps of 6px (36px total)
  const itemWidth = Math.max(0, (containerWidth - 52) / 7);
  const step = itemWidth + 6;

  // Pill starts at exact item position (never -999 which leaks on wide displays)
  const pillX = useSharedValue(activeIndex >= 0 ? activeIndex * step : 0);

  useEffect(() => {
    if (activeIndex >= 0) {
      pillX.value = withSpring(activeIndex * step, {
        damping: 26,
        stiffness: 280,
        mass: 0.75,
      });
    }
  }, [activeIndex, step]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View style={[styles_weekPage, { width: containerWidth }]}>
      {hasPill && activeIndex >= 0 && itemWidth > 0 && (
        <Animated.View
          style={[pillActiveStyle, { width: itemWidth }, pillStyle]}
          pointerEvents="none"
        />
      )}
      {dates.map((d) => (
        <DatePillItem
          key={d.dateStr}
          dateStr={d.dateStr}
          dateNum={d.dateNum}
          dayShort={d.dayShort}
          isActive={d.active}
          isToday={d.isToday}
          hasDot={!!(taskDates?.has(d.dateStr))}
          onSelectDate={onSelectDate}
          colors={colors}
          isDark={isDark}
        />
      ))}
    </View>
  );
});

const styles_weekPage = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  gap: 6,
  paddingHorizontal: 8,
  position: 'relative' as const,
};

// ── TaskDateStrip ─────────────────────────────────────────────────────────────
export const TaskDateStrip = React.memo(function TaskDateStrip({
  selectedDate,
  onSelectDate,
  taskDates,
  style,
}: TaskDateStripProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const initialWidth = Dimensions.get('window').width;
  const containerWidthRef = useRef(initialWidth);
  const [containerWidth, setContainerWidth] = useState(initialWidth);

  const [anchorDate, setAnchorDate] = useState(selectedDate);
  const anchorDateRef = useRef(anchorDate);
  anchorDateRef.current = anchorDate;

  const currentDateRef = useRef(selectedDate);
  currentDateRef.current = selectedDate;

  const onSelectDateRef = useRef(onSelectDate);
  onSelectDateRef.current = onSelectDate;

  // Keep anchor in sync if selectedDate moves outside the current 7-day window
  useEffect(() => {
    if (!anchorDateRef.current) return;
    const base = parseLocalDate(anchorDateRef.current);
    const minD = new Date(base); minD.setDate(base.getDate() - 3);
    const maxD = new Date(base); maxD.setDate(base.getDate() + 3);
    const cur = parseLocalDate(selectedDate);
    if (cur < minD || cur > maxD) setAnchorDate(selectedDate);
  }, [selectedDate]);

  // Prev and next weeks do NOT depend on selectedDate — eliminates 14 date recalculations per tap
  const prevWeekDates = useMemo(() => {
    return generateDatesForAnchor(offsetDateStr(anchorDate, -7), '');
  }, [anchorDate]);

  const currentWeekDates = useMemo(() => {
    return generateDatesForAnchor(anchorDate, selectedDate);
  }, [anchorDate, selectedDate]);

  const nextWeekDates = useMemo(() => {
    return generateDatesForAnchor(offsetDateStr(anchorDate, 7), '');
  }, [anchorDate]);

  const activeDateObj = useMemo(() => {
    const found = currentWeekDates.find((d) => d.active);
    if (found) return found;
    const base = parseLocalDate(selectedDate);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayFullNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
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

  const translateX = useSharedValue(-initialWidth);
  const [needResetTranslate, setNeedResetTranslate] = useState(false);

  useEffect(() => {
    translateX.value = -containerWidth;
  }, [containerWidth, translateX]);

  // Reset translateX after anchorDate has committed render to eliminate 1-2 frame visual flash
  useEffect(() => {
    if (needResetTranslate) {
      translateX.value = -containerWidthRef.current;
      setNeedResetTranslate(false);
    }
  }, [anchorDate, needResetTranslate, translateX]);

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
    Haptics.selectionAsync();
    const nextAnchor = offsetDateStr(anchorDateRef.current, 7);
    const nextSelected = offsetDateStr(currentDateRef.current, 7);
    setAnchorDate(nextAnchor);
    onSelectDateRef.current(nextSelected);
    setNeedResetTranslate(true);
  }, []);

  const commitPrevWeek = useCallback(() => {
    Haptics.selectionAsync();
    const prevAnchor = offsetDateStr(anchorDateRef.current, -7);
    const prevSelected = offsetDateStr(currentDateRef.current, -7);
    setAnchorDate(prevAnchor);
    onSelectDateRef.current(prevSelected);
    setNeedResetTranslate(true);
  }, []);

  const handleJumpToToday = useCallback(() => {
    Haptics.selectionAsync();
    const todayStr = formatLocalDateStr(new Date());
    setAnchorDate(todayStr);
    onSelectDateRef.current(todayStr);
    translateX.value = -containerWidthRef.current;
  }, [translateX]);

  // Native UI thread 60/120fps gesture with zero bridge latency
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onUpdate((event) => {
        'worklet';
        const w = containerWidth;
        translateX.value = -w + event.translationX;
      })
      .onEnd((event) => {
        'worklet';
        const w = containerWidth;
        const threshold = Math.min(w * 0.18, 50);

        if (event.translationX < -threshold || event.velocityX < -350) {
          // Slide to next week
          translateX.value = withTiming(
            -2 * w,
            { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
            () => {
              'worklet';
              runOnJS(commitNextWeek)();
            }
          );
        } else if (event.translationX > threshold || event.velocityX > 350) {
          // Slide to prev week
          translateX.value = withTiming(
            0,
            { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
            () => {
              'worklet';
              runOnJS(commitPrevWeek)();
            }
          );
        } else {
          // Snap back
          translateX.value = withTiming(-w, { duration: 160 });
        }
      });
  }, [containerWidth, commitNextWeek, commitPrevWeek, translateX]);

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.container, style]} onLayout={onContainerLayout}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeftCol}>
          <Text style={styles.dayFullText}>{activeDateObj.dayFull}</Text>
          <Text style={styles.monthYearText}>{activeDateObj.month} {activeDateObj.year}</Text>
        </View>
        <View style={styles.headerNavRow}>
          {!activeDateObj.isToday && (
            <TouchableOpacity
              onPress={handleJumpToToday}
              style={[styles.todayPill, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.12)' }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text style={[styles.todayPillText, { color: isDark ? '#C4B5FD' : colors.accentPrimary }]}>Today</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

        <Animated.View style={[styles.pagerRow, animatedPagerStyle]}>
          <WeekRow dates={prevWeekDates}    taskDates={taskDates} onSelectDate={onSelectDate} colors={colors} isDark={isDark} containerWidth={containerWidth} pillActiveStyle={styles.activePill} hasPill={false} />
          <WeekRow dates={currentWeekDates} taskDates={taskDates} onSelectDate={onSelectDate} colors={colors} isDark={isDark} containerWidth={containerWidth} pillActiveStyle={styles.activePill} hasPill={true} />
          <WeekRow dates={nextWeekDates}    taskDates={taskDates} onSelectDate={onSelectDate} colors={colors} isDark={isDark} containerWidth={containerWidth} pillActiveStyle={styles.activePill} hasPill={false} />
        </Animated.View>
      </View>
    </GestureDetector>
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
    // Single native-thread sliding pill — all 3 WeekRows share this style
    activePill: {
      position: 'absolute',
      top: 0,
      left: 8,    // matches weekPage paddingHorizontal
      height: 56,
      borderRadius: 14,
      backgroundColor: colors.accentPrimary,
      shadowColor: colors.accentPrimary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.35 : 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
  });
