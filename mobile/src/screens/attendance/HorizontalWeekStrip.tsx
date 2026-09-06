import React, { useRef, useMemo, useCallback } from 'react';
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

export const HorizontalWeekStrip = React.memo(function HorizontalWeekStrip({
  selectedDate,
  onSelectDate,
  holidays = [],
  today,
}: HorizontalWeekStripProps) {
  const { colors, isDark } = useTheme();

  // Animations for week slide transition
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

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

  // Navigation handlers with smooth directional animation
  const animateTransition = useCallback(
    (direction: 'left' | 'right', commitAction: () => void) => {
      const exitValue = direction === 'left' ? -24 : 24;
      const enterValue = direction === 'left' ? 24 : -24;

      Animated.parallel([
        Animated.timing(translateXAnim, {
          toValue: exitValue,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.2,
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
            tension: 70,
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
      const cur = parseDateToMidnight(currentDateRef.current);
      cur.setDate(cur.getDate() + 7);
      onSelectDate(getLocalDateString(cur));
    });
  }, [onSelectDate, animateTransition]);

  const goToPrevWeek = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      <Animated.View
        style={[
          styles.weekRow,
          {
            transform: [{ translateX: translateXAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {weekDays.map((item) => (
          <TouchableOpacity
            key={item.dateStr}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelectDate(item.dateStr);
            }}
            style={[
              styles.dayCol,
              item.isSel && [
                styles.dayColSelected,
                { backgroundColor: colors.accentPrimary || '#5046E5' },
              ],
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dayNameText,
                { color: colors.textSecondary || '#8E8E93' },
                item.isSel && styles.dayNameTextSelected,
              ]}
            >
              {item.dayName}
            </Text>
            <Text
              style={[
                styles.dayNumText,
                { color: colors.textPrimary || (isDark ? '#FFFFFF' : '#111827') },
                item.isSel && styles.dayNumTextSelected,
                item.isToday && !item.isSel && { color: colors.accentPrimary || '#5046E5' },
              ]}
            >
              {item.isHol ? '🌴' : item.dayNum}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
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
  },
  dayColSelected: {
    backgroundColor: '#5046E5',
    shadowColor: '#5046E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  dayNameText: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '500',
  },
  dayNameTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayNumText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dayNumTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
