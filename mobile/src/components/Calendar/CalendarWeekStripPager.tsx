/**
 * CalendarWeekStripPager.tsx — ZenTrack Mobile
 *
 * Ultra-resilient, zero-virtualization 7-Day Week Strip for Calendar Day & Week Views.
 *
 * Key Architectural Guarantees:
 * - Zero-virtualization Flexbox: 100% immune to FlatList blanking, Android Hermes crashes,
 *   or initialScrollIndex unmount drops during background autofetches.
 * - Deterministic Active Week: derived directly from `selectedDate` (or `today`), ensuring
 *   instant 0ms display on boot, warm mounting, and tab switching.
 * - Smooth Week Gestures: PanResponder horizontal swiping (left for next week, right for prev week)
 *   with native-driven directional spring micro-animations.
 * - Multi-colored Event Dots: up to 5 categorized dot indicators for classes, tasks, gym, and events.
 *
 * ANIMATION UPGRADES (2026-09-25):
 * - iOS-grade sliding pill indicator: shared value drives translateX between day positions
 * - Month label: cross-fade + vertical slide on month boundary crossing during week swipe
 * - DayPill: Reanimated spring scale on press (replaces TouchableOpacity activeOpacity)
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Animated,       // React Native Animated — used for the week-row slide (nativeDriver)
  Easing,         // RN Easing, compatible with RN Animated.timing
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing as REasing,   // Reanimated Easing — used for Reanimated worklets only
} from 'react-native-reanimated';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY } from '../../theme/tokens';
import { formatLocalDateStr } from '../../utils/dateUtils';

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

// ── Pure Memoized Day Pill ─────────────────────────────────────────────────────
// NOTE: background pill is now transparent — the selected state is shown by the
// parent's sliding PillIndicator overlay, not per-pill styling.
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
// No padding offset: weekRow has no paddingHorizontal, so the 7 columns
// divide the full row width exactly. translateX = activeIndex * tabWidth
// lands the pillOuter (alignItems:'center') precisely on the column centre.
interface PillProps {
  activeIndex: number;
  tabWidth:    number; // rowWidth ÷ 7 — exact slot width
  colors:      any;
}

function SlidingDayPill({ activeIndex, tabWidth, colors }: PillProps) {
  const pillX = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    // Fixed 160ms Apple ease-out-expo: pill always arrives at the same time
    // regardless of travel distance — eliminates the spring lag on long jumps.
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
    position:       'absolute',
    top:            22,    // aligns with the day-number pill circle
    height:         42,
    alignItems:     'center',   // centres the 38px pillInner in the slot
    justifyContent: 'center',
  },
  pillInner: {
    width:        38,
    height:       42,
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

  // Week slide animation — using RN Animated (nativeDriver) for the whole row slide
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim    = useRef(new Animated.Value(1)).current;

  // Active week's Sunday derived deterministically from selectedDate (or today)
  const activeSunday = useMemo(() => {
    return getSundayOfDate(selectedDate || todayStr);
  }, [selectedDate, todayStr]);

  // Compute 7 days for the active week
  const weekDays = useMemo(() => {
    const baseMs = activeSunday.getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseMs + i * 86400000);
      const dateStr = formatLocalDateStr(d);
      return {
        dateStr,
        dateNum: d.getDate(),
        dateDay: DAY_LETTERS[i],
        isToday:    dateStr === todayStr,
        isSelected: dateStr === selectedDate,
      };
    });
  }, [activeSunday, selectedDate, todayStr]);

  // Active day index within the visible week (for sliding pill)
  const activeIndex = useMemo(() => {
    const idx = weekDays.findIndex(d => d.isSelected);
    return idx >= 0 ? idx : 0;
  }, [weekDays]);

  // tabWidth = full row width ÷ 7. weekRow has no paddingHorizontal so
  // column i occupies [i*tabWidth, (i+1)*tabWidth] from the row's left edge,
  // which is also the pill's coordinate origin (same parent View).
  const [tabWidth, setTabWidth] = useState(0);
  const onRowLayout = useCallback((e: LayoutChangeEvent) => {
    setTabWidth(e.nativeEvent.layout.width / 7);
  }, []);

  // Month label cross-fade + vertical slide on month boundary crossing
  const monthLabel  = getMonthLabel(selectedDate || todayStr);
  const prevMonthRef = useRef(monthLabel);
  const monthOpacity = useSharedValue(1);
  const monthTransY  = useSharedValue(0);

  useEffect(() => {
    if (prevMonthRef.current !== monthLabel) {
      const isForward = monthLabel > prevMonthRef.current;
      prevMonthRef.current = monthLabel;
      monthOpacity.value = withSequence(
        withTiming(0, { duration: 100 }),
        withTiming(1, { duration: 200, easing: REasing.out(REasing.quad) }),
      );
      monthTransY.value = withSequence(
        withTiming(isForward ? -6 : 6, { duration: 100 }),
        withTiming(0, { duration: 200, easing: REasing.out(REasing.quad) }),
      );
    }
  }, [monthLabel]);

  const monthAnimStyle = useAnimatedStyle(() => ({
    opacity:   monthOpacity.value,
    transform: [{ translateY: monthTransY.value }],
  }));

  // Spring transition for week changes (RN Animated.timing, nativeDriver)
  const animateTransition = useCallback(
    (direction: 'left' | 'right', commitAction: () => void) => {
      const exitValue  = direction === 'left'  ? -26 :  26;
      const enterValue = direction === 'left'  ?  26 : -26;

      Animated.parallel([
        Animated.timing(translateXAnim, { toValue: exitValue,  duration: 90,  easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacityAnim,    { toValue: 0.2,        duration: 90,  useNativeDriver: true }),
      ]).start(() => {
        commitAction();
        translateXAnim.setValue(enterValue);
        Animated.parallel([
          Animated.timing(translateXAnim, { toValue: 0, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacityAnim,    { toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      });
    },
    [translateXAnim, opacityAnim],
  );

  const goToNextWeek = useCallback(() => {
    animateTransition('left', () => {
      const cur = parseDateToMidnight(selectedDate || todayStr);
      cur.setDate(cur.getDate() + 7);
      onSelectDate(formatLocalDateStr(cur));
    });
  }, [selectedDate, todayStr, onSelectDate, animateTransition]);

  const goToPrevWeek = useCallback(() => {
    animateTransition('right', () => {
      const cur = parseDateToMidnight(selectedDate || todayStr);
      cur.setDate(cur.getDate() - 7);
      onSelectDate(formatLocalDateStr(cur));
    });
  }, [selectedDate, todayStr, onSelectDate, animateTransition]);

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
          if      (gestureState.dx < -35) goToNextWeek();
          else if (gestureState.dx >  35) goToPrevWeek();
        },
      }),
    [goToNextWeek, goToPrevWeek],
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Month label with cross-fade + vertical slide on month change */}
      <Reanimated.Text style={[styles.monthLabel, monthAnimStyle]}>
        {monthLabel}
      </Reanimated.Text>

      <View style={{ position: 'relative' }}>
        {/* Sliding active day pill — underneath the day numbers */}
        {tabWidth > 0 && (
          <SlidingDayPill
            activeIndex={activeIndex}
            tabWidth={tabWidth}
            colors={colors}
          />
        )}

        <Animated.View
          style={[
            styles.weekRow,
            {
              transform: [{ translateX: translateXAnim }],
              opacity:   opacityAnim,
            },
          ]}
          onLayout={onRowLayout}
        >
          {weekDays.map((day) => {
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
        </Animated.View>
      </View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      minHeight:       80,
      paddingBottom:   8,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border || 'rgba(255,255,255,0.06)',
    },
    monthLabel: {
      fontSize:       11,
      fontFamily:     FONT_FAMILY.bold,
      color:          colors.textTertiary || colors.textSecondary,
      letterSpacing:  0.5,
      textAlign:      'center',
      paddingTop:     6,
      paddingBottom:  2,
    },
    weekRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      minHeight:      64,
      // No paddingHorizontal — columns fill the full row width so the pill's
      // coordinate origin (parent View) perfectly matches column boundaries.
      width:          '100%',
    },
    dayCol: {
      alignItems:  'center',
      gap:         4,
      flex:        1,
    },
    dayLetter: {
      fontSize:   10.5,
      color:      colors.textMuted || '#8e8e93',
      fontFamily: FONT_FAMILY.bold,
      letterSpacing: 0.5,
    },
    dayLetterActive: {
      color: colors.textPrimary,
    },
    dayPill: {
      width:           38,
      height:          42,
      borderRadius:    12,
      backgroundColor: 'transparent',
      alignItems:      'center',
      justifyContent:  'center',
      position:        'relative',
    },
    dayPillToday: {
      borderWidth: 1.5,
      borderColor: colors.accentPrimary ? `${colors.accentPrimary}80` : '#a599ff',
    },
    dayNum: {
      fontSize:   15,
      color:      colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
    },
    dayNumToday: {
      color:      colors.accentPrimary || '#a599ff',
      fontFamily: FONT_FAMILY.bold,
    },
    dayNumSelected: {
      color:      isDark ? '#000000' : '#FFFFFF',
      fontFamily: FONT_FAMILY.bold,
    },
    dotsRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           2,
      position:      'absolute',
      bottom:        3,
    },
    dot: {
      width:        3.5,
      height:       3.5,
      borderRadius: 2,
    },
  });
