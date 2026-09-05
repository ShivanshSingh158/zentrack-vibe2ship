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
 * - Accessible Haptics: tactile feedback on date taps and week transitions.
 */

import React, { useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
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
    Haptics.selectionAsync();
    onSelectDate(dateStr);
  }, [onSelectDate, dateStr]);

  return (
    <TouchableOpacity
      style={styles.dayCol}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
        {dateDay}
      </Text>

      <View
        style={[
          styles.dayPill,
          isSelected && styles.dayPillSelected,
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
    </TouchableOpacity>
  );
});

export function CalendarWeekStripPager({
  selectedDate,
  onSelectDate,
  markedDates = {},
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const todayStr = useMemo(() => formatLocalDateStr(new Date()), []);

  // Animations for horizontal week slide transition
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

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
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
      };
    });
  }, [activeSunday, selectedDate, todayStr]);

  // Spring transition for week changes
  const animateTransition = useCallback(
    (direction: 'left' | 'right', commitAction: () => void) => {
      const exitValue = direction === 'left' ? -26 : 26;
      const enterValue = direction === 'left' ? 26 : -26;

      Animated.parallel([
        Animated.timing(translateXAnim, {
          toValue: exitValue,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 90,
          useNativeDriver: true,
        }),
      ]).start(() => {
        commitAction();
        translateXAnim.setValue(enterValue);
        Animated.parallel([
          Animated.spring(translateXAnim, {
            toValue: 0,
            friction: 8,
            tension: 75,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition('left', () => {
      const cur = parseDateToMidnight(selectedDate || todayStr);
      cur.setDate(cur.getDate() + 7);
      onSelectDate(formatLocalDateStr(cur));
    });
  }, [selectedDate, todayStr, onSelectDate, animateTransition]);

  const goToPrevWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition('right', () => {
      const cur = parseDateToMidnight(selectedDate || todayStr);
      cur.setDate(cur.getDate() - 7);
      onSelectDate(formatLocalDateStr(cur));
    });
  }, [selectedDate, todayStr, onSelectDate, animateTransition]);

  // PanResponder for smooth horizontal week swiping without blocking vertical timeline scroll
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
      <Animated.View
        style={[
          styles.weekRow,
          {
            transform: [{ translateX: translateXAnim }],
            opacity: opacityAnim,
          },
        ]}
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
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      minHeight: 74,
      paddingBottom: 8,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border || 'rgba(255,255,255,0.06)',
      justifyContent: 'center',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 64,
      paddingHorizontal: 8,
      width: '100%',
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
    dayPillSelected: {
      backgroundColor: colors.accentPrimary || '#a599ff',
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
