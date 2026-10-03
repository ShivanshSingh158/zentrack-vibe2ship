import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
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

interface WeekDayItem {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isSel: boolean;
  isToday: boolean;
  isHol: boolean;
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

function generateWeekDays(sundayDate: Date, selectedDate: string, today: string, holidays: string[]): WeekDayItem[] {
  const baseMs = sundayDate.getTime();
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
}

const WeekDayCol = React.memo(function WeekDayCol({
  item,
  today,
  colors,
  isDark,
  styles,
  onPress,
}: {
  item: WeekDayItem;
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

  const initialWidth = Dimensions.get('window').width;
  const containerWidthRef = useRef(initialWidth);
  const [containerWidth, setContainerWidth] = useState(initialWidth);

  // Stably track current active date in ref for gesture callbacks
  const currentDateRef = useRef(selectedDate || today);
  currentDateRef.current = selectedDate || today;

  // Active anchor Sunday
  const [anchorSundayStr, setAnchorSundayStr] = useState(() => {
    return getLocalDateString(getSundayOfDate(selectedDate || today));
  });
  const anchorSundayRef = useRef(anchorSundayStr);
  anchorSundayRef.current = anchorSundayStr;

  // Sync anchor when selectedDate navigates outside current visible week
  useEffect(() => {
    const curSun = getLocalDateString(getSundayOfDate(selectedDate || today));
    if (curSun !== anchorSundayRef.current) {
      setAnchorSundayStr(curSun);
    }
  }, [selectedDate, today]);

  const activeSunday = useMemo(() => {
    return parseDateToMidnight(anchorSundayStr);
  }, [anchorSundayStr]);

  const prevSunday = useMemo(() => {
    return new Date(activeSunday.getTime() - 7 * 86400000);
  }, [activeSunday]);

  const nextSunday = useMemo(() => {
    return new Date(activeSunday.getTime() + 7 * 86400000);
  }, [activeSunday]);

  // Compute 3 weeks of items: Prev, Current, Next (continuous sliding viewport)
  const prevWeekDays = useMemo(() => {
    return generateWeekDays(prevSunday, selectedDate, today, holidays);
  }, [prevSunday, selectedDate, today, holidays]);

  const currentWeekDays = useMemo(() => {
    return generateWeekDays(activeSunday, selectedDate, today, holidays);
  }, [activeSunday, selectedDate, today, holidays]);

  const nextWeekDays = useMemo(() => {
    return generateWeekDays(nextSunday, selectedDate, today, holidays);
  }, [nextSunday, selectedDate, today, holidays]);

  // Magnetic active pill for current week
  const colWidth = containerWidth > 0 ? containerWidth / 7 : 0;
  const selectedIndex = useMemo(() => {
    const idx = currentWeekDays.findIndex((d) => d.isSel);
    return idx >= 0 ? idx : -1;
  }, [currentWeekDays]);

  const pillPosition = useSharedValue(selectedIndex >= 0 ? selectedIndex : 0);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (selectedIndex < 0) return;
    if (isFirstMount.current) {
      isFirstMount.current = false;
      pillPosition.value = selectedIndex;
      return;
    }
    pillPosition.value = withSpring(selectedIndex, {
      damping: 30,
      stiffness: 260,
      mass: 0.85,
    });
  }, [selectedIndex]);

  const animPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillPosition.value * colWidth + 1.5 }],
    width: Math.max(0, colWidth - 3),
    opacity: selectedIndex >= 0 && colWidth > 0 ? 1 : 0,
  }));

  // Reanimated continuous translation across the 3 weeks
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
    const cur = parseDateToMidnight(currentDateRef.current);
    cur.setDate(cur.getDate() + 7);
    const nextDateStr = getLocalDateString(cur);
    const nextSunStr = getLocalDateString(getSundayOfDate(nextDateStr));
    setAnchorSundayStr(nextSunStr);
    onSelectDate(nextDateStr);
    translateX.value = -containerWidthRef.current;
    isAnimatingRef.current = false;
  }, [onSelectDate, translateX]);

  const commitPrevWeek = useCallback(() => {
    const cur = parseDateToMidnight(currentDateRef.current);
    cur.setDate(cur.getDate() - 7);
    const prevDateStr = getLocalDateString(cur);
    const prevSunStr = getLocalDateString(getSundayOfDate(prevDateStr));
    setAnchorSundayStr(prevSunStr);
    onSelectDate(prevDateStr);
    translateX.value = -containerWidthRef.current;
    isAnimatingRef.current = false;
  }, [onSelectDate, translateX]);

  // PanResponder with 1:1 real-time finger tracking & zero strobe flicker
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 14 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4 &&
            !isAnimatingRef.current
          );
        },
        onPanResponderMove: (_, gestureState) => {
          if (isAnimatingRef.current) return;
          translateX.value = -containerWidthRef.current + gestureState.dx;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isAnimatingRef.current) return;
          const w = containerWidthRef.current;
          const threshold = Math.min(w * 0.22, 60);

          if (gestureState.dx < -threshold) {
            // Advance to next week
            isAnimatingRef.current = true;
            Haptics.selectionAsync();
            translateX.value = withSpring(
              -2 * w,
              { damping: 28, stiffness: 260, mass: 0.85 },
              (finished) => {
                if (finished) runOnJS(commitNextWeek)();
              }
            );
          } else if (gestureState.dx > threshold) {
            // Advance to prev week
            isAnimatingRef.current = true;
            Haptics.selectionAsync();
            translateX.value = withSpring(
              0,
              { damping: 28, stiffness: 260, mass: 0.85 },
              (finished) => {
                if (finished) runOnJS(commitPrevWeek)();
              }
            );
          } else {
            // Cancel and snap back to center
            translateX.value = withSpring(-w, {
              damping: 30,
              stiffness: 280,
              mass: 0.8,
            });
          }
        },
      }),
    [commitNextWeek, commitPrevWeek, translateX]
  );

  const renderWeekRow = (days: WeekDayItem[], keySuffix: string, hasPill: boolean) => (
    <View key={keySuffix} style={[styles.weekRow, { width: containerWidth }]}>
      {hasPill && (
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
      )}
      {days.map((item) => (
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
    </View>
  );

  return (
    <View style={styles.container} onLayout={onContainerLayout} {...panResponder.panHandlers}>
      <Reanimated.View style={[styles.pagerTrack, animatedPagerStyle]}>
        {renderWeekRow(prevWeekDays, 'prev', false)}
        {renderWeekRow(currentWeekDays, 'curr', true)}
        {renderWeekRow(nextWeekDays, 'next', false)}
      </Reanimated.View>
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
    overflow: 'hidden',
  },
  pagerTrack: {
    flexDirection: 'row',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
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
