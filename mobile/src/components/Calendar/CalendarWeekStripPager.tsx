/**
 * CalendarWeekStripPager.tsx — ZenTrack Mobile
 *
 * Horizontal Paginated Week Strip for Calendar Day & Week Views.
 * Allows smooth left/right swiping across 7-day week chunks without
 * having to open the full month dropdown.
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS } from '../../theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_WIDTH = SCREEN_WIDTH;

interface Props {
  selectedDate: string; // "YYYY-MM-DD"
  onSelectDate: (dateStr: string) => void;
  markedDates?: Record<string, { dots?: Array<{ key: string; color: string }> }>;
}

// Generate the 7 days (Sun to Sat) for a given week offset from an anchor date
function getWeekDays(anchorDate: Date, weekOffset: number): Array<{
  dateStr: string;
  dateNum: number;
  dateDay: string;
  isToday: boolean;
}> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const base = new Date(anchorDate);
  const dayOfWeek = base.getDay(); // 0 (Sun) to 6 (Sat)
  
  // Go to Sunday of base week + (weekOffset * 7)
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - dayOfWeek + weekOffset * 7);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    days.push({
      dateStr,
      dateNum: d.getDate(),
      dateDay: d.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

const TOTAL_PAGES = 101; // 50 weeks back, current week, 50 weeks forward
const INITIAL_PAGE = 50;

export function CalendarWeekStripPager({ selectedDate, onSelectDate, markedDates = {} }: Props) {
  const { colors, isDark } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  
  // Anchor date is stabilized around today or initial mount
  const anchorDateRef = useRef(new Date());
  const [currentPage, setCurrentPage] = useState(INITIAL_PAGE);

  // Sync pager when selectedDate is changed from outside (e.g. Month dropdown)
  useEffect(() => {
    if (!selectedDate) return;
    const sel = new Date(selectedDate + 'T00:00:00');
    const anchor = anchorDateRef.current;
    
    // Calculate week difference
    const anchorSunday = new Date(anchor);
    anchorSunday.setDate(anchor.getDate() - anchor.getDay());
    anchorSunday.setHours(0, 0, 0, 0);

    const selSunday = new Date(sel);
    selSunday.setDate(sel.getDate() - sel.getDay());
    selSunday.setHours(0, 0, 0, 0);

    const diffDays = Math.round((selSunday.getTime() - anchorSunday.getTime()) / (1000 * 60 * 60 * 24));
    const weekDiff = Math.round(diffDays / 7);
    const targetPage = INITIAL_PAGE + weekDiff;

    if (targetPage >= 0 && targetPage < TOTAL_PAGES && targetPage !== currentPage) {
      setCurrentPage(targetPage);
      flatListRef.current?.scrollToIndex({ index: targetPage, animated: true });
    }
  }, [selectedDate]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / PAGE_WIDTH);
      if (pageIndex !== currentPage && pageIndex >= 0 && pageIndex < TOTAL_PAGES) {
        setCurrentPage(pageIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [currentPage]
  );

  const getItemLayout = (_: any, index: number) => ({
    length: PAGE_WIDTH,
    offset: PAGE_WIDTH * index,
    index,
  });

  const renderWeekPage = ({ item: pageIndex }: { item: number }) => {
    const weekOffset = pageIndex - INITIAL_PAGE;
    const weekDays = getWeekDays(anchorDateRef.current, weekOffset);

    return (
      <View style={[styles.weekPage, { width: PAGE_WIDTH }]}>
        {weekDays.map((day) => {
          const isSelected = day.dateStr === selectedDate;
          const dots = markedDates[day.dateStr]?.dots || [];

          return (
            <TouchableOpacity
              key={day.dateStr}
              style={styles.dayCol}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelectDate(day.dateStr);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
                {day.dateDay}
              </Text>
              
              <View
                style={[
                  styles.dayPill,
                  isSelected && { backgroundColor: colors.accentPrimary || '#a599ff' },
                  day.isToday && !isSelected && styles.dayPillToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    isSelected && styles.dayNumActive,
                    day.isToday && !isSelected && { color: colors.accentPrimary || '#a599ff' },
                  ]}
                >
                  {day.dateNum}
                </Text>

                {/* Dot Indicators */}
                <View style={styles.dotsRow}>
                  {dots.slice(0, 3).map((dot, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.dot,
                        { backgroundColor: isSelected ? '#000000' : dot.color || colors.accentPrimary },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const pages = useMemo(() => Array.from({ length: TOTAL_PAGES }, (_, i) => i), []);

  const styles = makeStyles(colors, isDark);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={(item) => item.toString()}
        renderItem={renderWeekPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={INITIAL_PAGE}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        windowSize={3}
        maxToRenderPerBatch={2}
        decelerationRate="fast"
      />
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    weekPage: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    dayCol: {
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    dayLetter: {
      fontSize: 11,
      color: colors.textMuted || '#8e8e93',
      fontFamily: FONT_FAMILY.body,
      fontWeight: '500',
    },
    dayLetterActive: {
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.bold,
    },
    dayPill: {
      width: 38,
      height: 44,
      borderRadius: 12,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    dayPillToday: {
      borderWidth: 1,
      borderColor: colors.accentPrimary ? `${colors.accentPrimary}60` : 'rgba(165,153,255,0.4)',
    },
    dayNum: {
      fontSize: 16,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
    },
    dayNumActive: {
      color: '#000000',
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
