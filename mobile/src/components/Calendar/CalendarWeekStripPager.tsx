/**
 * CalendarWeekStripPager.tsx — ZenTrack Mobile
 *
 * Ultra-fluid, continuous 3-week sliding viewport for Calendar Day & Week Views.
 *
 * Key Architectural Guarantees:
 * - Continuous 3-Week Sliding Viewport: Previous, Current, and Next weeks rendered side-by-side
 *   in a GPU-composited track. 1:1 Pan gesture tracking with zero opacity drops and zero strobe flicker.
 * - Apple Critically Damped Spring: Snaps with native physics (`damping: 28, stiffness: 260, mass: 0.85`).
 * - Deterministic Active Week: derived directly from `selectedDate` (or `today`), ensuring
 *   instant 0ms display on boot, warm mounting, and tab switching.
 * - Multi-colored Event Dots: up to 5 categorized dot indicators for classes, tasks, gym, and events.
 * - iOS-grade sliding pill indicator: shared value drives translateX between day positions.
 * - Month label: cross-fade + vertical slide on month boundary crossing.
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Dimensions,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
  Easing as REasing,
} from 'react-native-reanimated';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import { formatLocalDateStr } from '../../utils/dateUtils';
import * as Haptics from 'expo-haptics';

const DAY_LETTERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const EMPTY_DOTS: Array<{ key: string; color: string }> = [];

interface Props {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (dateStr: string) => void;
  markedDates?: Record<string, { dots?: Array<{ key: string; color: string }> }>;
}

interface DayPillProps {
  dateStr: string;
  dateNum: number;
  dateDay: string;
  isToday: boolean;
  isSelected: boolean;
  dots: Array<{ key: string; color: string }>;
  onSelectDate: (dateStr: string) => void;
  colors: any;
  isDark: boolean;
  styles: any;
}

interface WeekDayItem {
  dateStr: string;
  dateNum: number;
  dateDay: string;
  isToday: boolean;
  isSelected: boolean;
}

function parseDateToMidnight(dateStr: string): Date {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
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
  const day = dt.getDay(); // 0 = Sunday
  dt.setDate(dt.getDate() - day);
  return dt;
}

function getMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  return dt.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function generateWeekDays(sundayDate: Date, selectedDate: string, todayStr: string): WeekDayItem[] {
  const baseMs = sundayDate.getTime();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseMs + i * 86400000);
    const dateStr = formatLocalDateStr(d);
    return {
      dateStr,
      dateNum: d.getDate(),
      dateDay: DAY_LETTERS[i],
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDate,
    };
  });
}

// ── Pure Memoized Day Pill ─────────────────────────────────────────────────────
const DayPill = React.memo(function DayPill({
  dateStr,
  dateNum,
  dateDay,
  isToday,
  isSelected,
  dots,
  onSelectDate,
  colors,
  isDark,
  styles,
}: DayPillProps) {
  const handlePress = useCallback(() => {
    onSelectDate(dateStr);
  }, [onSelectDate, dateStr]);

  return (
    <AnimatedPressable
      style={styles.dayCol}
      onPress={handlePress}
      variant="subtle"
    >
      <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
        {dateDay}
      </Text>

      <View
        style={[
          styles.dayPill,
          isToday && !isSelected && styles.dayPillToday,
        ]}
      >
        <Text
          style={[
            styles.dayNum,
            isSelected && styles.dayNumSelected,
            isToday && !isSelected && styles.dayNumToday,
          ]}
        >
          {dateNum}
        </Text>

        {/* Dot Indicators — up to 5 dots for schedule density */}
        {dots.length > 0 && (
          <View style={styles.dotsRow}>
            {dots.slice(0, 5).map((dot, idx) => (
              <View
                key={dot.key || idx}
                style={[
                  styles.dot,
                  {
                    backgroundColor: isSelected
                      ? (isDark ? '#000000' : '#FFFFFF')
                      : (dot.color || colors.accentPrimary),
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
});

// ── Sliding Active Pill (runs entirely on UI thread) ──────────────────────────
interface PillProps {
  activeIndex: number;
  tabWidth: number;
  colors: any;
}

function SlidingDayPill({ activeIndex, tabWidth, colors }: PillProps) {
  const pillX = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    pillX.value = withTiming(activeIndex * tabWidth, {
      duration: 160,
      easing: REasing.bezier(0.16, 1, 0.3, 1),
    });
  }, [activeIndex, tabWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles_pill.pillOuter,
        { width: tabWidth },
        pillStyle,
      ]}
    >
      <View
        style={[
          styles_pill.pillInner,
          { backgroundColor: colors.accentPrimary || '#a599ff' },
        ]}
      />
    </Reanimated.View>
  );
}

const styles_pill = StyleSheet.create({
  pillOuter: {
    position: 'absolute',
    top: 22,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInner: {
    width: 38,
    height: 42,
    borderRadius: 12,
  },
});

// ── Main CalendarWeekStripPager ───────────────────────────────────────────────
export function CalendarWeekStripPager({
  selectedDate,
  onSelectDate,
  markedDates = {},
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const todayStr = useMemo(() => formatLocalDateStr(new Date()), []);

  const initialWidth = Dimensions.get('window').width;
  const containerWidthRef = useRef(initialWidth);
  const [containerWidth, setContainerWidth] = useState(initialWidth);

  // Stably track selectedDate in ref for gesture callbacks
  const currentDateRef = useRef(selectedDate || todayStr);
  currentDateRef.current = selectedDate || todayStr;

  // Active anchor Sunday string
  const [anchorSundayStr, setAnchorSundayStr] = useState(() => {
    return formatLocalDateStr(getSundayOfDate(selectedDate || todayStr));
  });
  const anchorSundayRef = useRef(anchorSundayStr);
  anchorSundayRef.current = anchorSundayStr;

  // Sync anchor when selectedDate navigates outside current visible week
  useEffect(() => {
    const curSun = formatLocalDateStr(getSundayOfDate(selectedDate || todayStr));
    if (curSun !== anchorSundayRef.current) {
      setAnchorSundayStr(curSun);
    }
  }, [selectedDate, todayStr]);

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
    return generateWeekDays(prevSunday, selectedDate, todayStr);
  }, [prevSunday, selectedDate, todayStr]);

  const currentWeekDays = useMemo(() => {
    return generateWeekDays(activeSunday, selectedDate, todayStr);
  }, [activeSunday, selectedDate, todayStr]);

  const nextWeekDays = useMemo(() => {
    return generateWeekDays(nextSunday, selectedDate, todayStr);
  }, [nextSunday, selectedDate, todayStr]);

  // Active day index within the visible week (for sliding pill)
  const activeIndex = useMemo(() => {
    const idx = currentWeekDays.findIndex((d) => d.isSelected);
    return idx >= 0 ? idx : -1;
  }, [currentWeekDays]);

  const tabWidth = containerWidth > 0 ? containerWidth / 7 : 0;

  // Month label cross-fade + vertical slide on month boundary crossing
  const monthLabel = getMonthLabel(selectedDate || todayStr);
  const prevMonthRef = useRef(monthLabel);
  const monthOpacity = useSharedValue(1);
  const monthTransY = useSharedValue(0);

  useEffect(() => {
    if (prevMonthRef.current !== monthLabel) {
      const isForward = monthLabel > prevMonthRef.current;
      prevMonthRef.current = monthLabel;
      monthOpacity.value = withSequence(
        withTiming(0, { duration: 100 }),
        withTiming(1, { duration: 200, easing: REasing.out(REasing.quad) })
      );
      monthTransY.value = withSequence(
        withTiming(isForward ? -6 : 6, { duration: 100 }),
        withTiming(0, { duration: 200, easing: REasing.out(REasing.quad) })
      );
    }
  }, [monthLabel]);

  const monthAnimStyle = useAnimatedStyle(() => ({
    opacity: monthOpacity.value,
    transform: [{ translateY: monthTransY.value }],
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
    const nextDateStr = formatLocalDateStr(cur);
    const nextSunStr = formatLocalDateStr(getSundayOfDate(nextDateStr));
    setAnchorSundayStr(nextSunStr);
    onSelectDate(nextDateStr);
    translateX.value = -containerWidthRef.current;
    isAnimatingRef.current = false;
  }, [onSelectDate, translateX]);

  const commitPrevWeek = useCallback(() => {
    const cur = parseDateToMidnight(currentDateRef.current);
    cur.setDate(cur.getDate() - 7);
    const prevDateStr = formatLocalDateStr(cur);
    const prevSunStr = formatLocalDateStr(getSundayOfDate(prevDateStr));
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
            Math.abs(gestureState.dx) > 16 &&
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
            // Next week
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
            // Prev week
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
      {hasPill && activeIndex >= 0 && tabWidth > 0 && (
        <SlidingDayPill
          activeIndex={activeIndex}
          tabWidth={tabWidth}
          colors={colors}
        />
      )}
      {days.map((day) => {
        const dots = markedDates[day.dateStr]?.dots || EMPTY_DOTS;
        return (
          <DayPill
            key={day.dateStr}
            dateStr={day.dateStr}
            dateNum={day.dateNum}
            dateDay={day.dateDay}
            isToday={day.isToday}
            isSelected={day.isSelected}
            dots={dots}
            onSelectDate={onSelectDate}
            colors={colors}
            isDark={isDark}
            styles={styles}
          />
        );
      })}
    </View>
  );

  return (
    <View style={styles.container} onLayout={onContainerLayout} {...panResponder.panHandlers}>
      {/* Month label with cross-fade + vertical slide on month change */}
      <Reanimated.Text style={[styles.monthLabel, monthAnimStyle]}>
        {monthLabel}
      </Reanimated.Text>

      <View style={styles.trackWrapper}>
        <Reanimated.View style={[styles.pagerTrack, animatedPagerStyle]}>
          {renderWeekRow(prevWeekDays, 'prev', false)}
          {renderWeekRow(currentWeekDays, 'curr', true)}
          {renderWeekRow(nextWeekDays, 'next', false)}
        </Reanimated.View>
      </View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      minHeight: 80,
      paddingBottom: 8,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border || 'rgba(255,255,255,0.06)',
      overflow: 'hidden',
    },
    monthLabel: {
      fontSize: 11,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textTertiary || colors.textSecondary,
      letterSpacing: 0.5,
      textAlign: 'center',
      paddingTop: 6,
      paddingBottom: 2,
    },
    trackWrapper: {
      position: 'relative',
      overflow: 'hidden',
    },
    pagerTrack: {
      flexDirection: 'row',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 64,
      position: 'relative',
    },
    dayCol: {
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    dayLetter: {
      fontSize: 10.5,
      color: colors.textMuted || '#8e8e93',
      fontFamily: FONT_FAMILY.bold,
      letterSpacing: 0.5,
    },
    dayLetterActive: {
      color: colors.textPrimary,
    },
    dayPill: {
      width: 38,
      height: 42,
      borderRadius: 12,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    dayPillToday: {
      borderWidth: 1.5,
      borderColor: colors.accentPrimary ? `${colors.accentPrimary}80` : '#a599ff',
    },
    dayNum: {
      fontSize: 15,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
    },
    dayNumToday: {
      color: colors.accentPrimary || '#a599ff',
      fontFamily: FONT_FAMILY.bold,
    },
    dayNumSelected: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontFamily: FONT_FAMILY.bold,
    },
    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      position: 'absolute',
      bottom: 3,
    },
    dot: {
      width: 3.5,
      height: 3.5,
      borderRadius: 2,
    },
  });
