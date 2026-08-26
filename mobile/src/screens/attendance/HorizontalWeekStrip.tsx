import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { DAY_SHORT, getLocalDateString } from './attendanceConstants';

const TOTAL_WEEKS = 21;
const INITIAL_PAGE = 10; // offset = 0

interface HorizontalWeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  holidays?: string[];
  today: string;
  logs?: any[];
}

export const HorizontalWeekStrip = React.memo(function HorizontalWeekStrip({
  selectedDate,
  onSelectDate,
  holidays = [],
  today,
}: HorizontalWeekStripProps) {
  const { colors, isDark } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const { width: windowWidth } = useWindowDimensions();
  // AttendanceScreen has paddingHorizontal: 5 on both sides (total 10px)
  const initialWidth = windowWidth - 10;
  const [pageWidth, setPageWidth] = useState(initialWidth);
  const [currentPage, setCurrentPage] = useState(INITIAL_PAGE);
  const isInternalScroll = useRef(false);

  // Stabilized anchor Sunday representing INITIAL_PAGE (offset 0)
  const anchorSunday = useMemo(() => {
    try {
      const [y, m, d] = (today || selectedDate).split('-').map(Number);
      const target = new Date(y, m - 1, d);
      target.setHours(0, 0, 0, 0);
      const day = target.getDay();
      const sun = new Date(target.getFullYear(), target.getMonth(), target.getDate() - day);
      sun.setHours(0, 0, 0, 0);
      return sun;
    } catch {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
  }, []); // Anchored once on mount

  // Sync pager when selectedDate is changed externally (e.g. from Date picker)
  useEffect(() => {
    if (!selectedDate || isInternalScroll.current) return;
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const sel = new Date(y, m - 1, d);
      sel.setHours(0, 0, 0, 0);
      const selSunday = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() - sel.getDay());
      selSunday.setHours(0, 0, 0, 0);

      const diffWeeks = Math.round((selSunday.getTime() - anchorSunday.getTime()) / (7 * 86400000));
      const targetPage = INITIAL_PAGE + diffWeeks;

      if (targetPage >= 0 && targetPage < TOTAL_WEEKS && targetPage !== currentPage) {
        setCurrentPage(targetPage);
        flatListRef.current?.scrollToIndex({ index: targetPage, animated: true });
      }
    } catch (_) {}
  }, [selectedDate, anchorSunday, currentPage]);

  // Frame 0 alignment guarantee
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({
        offset: currentPage * pageWidth,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(t);
  }, [pageWidth, currentPage]);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / pageWidth);

      if (pageIndex !== currentPage && pageIndex >= 0 && pageIndex < TOTAL_WEEKS) {
        setCurrentPage(pageIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Compute date in target week matching the currently selected day of week
        isInternalScroll.current = true;
        const weekOffset = pageIndex - INITIAL_PAGE;
        const baseMs = anchorSunday.getTime() + weekOffset * 7 * 86400000;
        const curDayOfWeek = selectedDate ? new Date(selectedDate + 'T00:00:00').getDay() : 0;
        const targetDate = new Date(baseMs + curDayOfWeek * 86400000);
        onSelectDate(getLocalDateString(targetDate));

        setTimeout(() => {
          isInternalScroll.current = false;
        }, 150);
      }
    },
    [currentPage, pageWidth, anchorSunday, selectedDate, onSelectDate]
  );

  const pages = useMemo(() => Array.from({ length: TOTAL_WEEKS }, (_, i) => i - INITIAL_PAGE), []);

  const renderWeek = useCallback(
    ({ item: offset }: { item: number }) => {
      const baseMs = anchorSunday.getTime() + offset * 7 * 86400000;
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(baseMs + i * 86400000);
        return getLocalDateString(d);
      });

      return (
        <View style={[styles.weekRow, { width: pageWidth }]}>
          {dates.map((date, i) => {
            const isHol = holidays.includes(date);
            const isSel = date === selectedDate;
            const isToday = date === today;
            const dayNum = date.split('-')[2];

            return (
              <TouchableOpacity
                key={date}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelectDate(date);
                }}
                style={[
                  styles.dayCol,
                  isSel && [styles.dayColSelected, { backgroundColor: colors.accentPrimary || '#5046E5' }],
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayNameText,
                    isSel && styles.dayNameTextSelected,
                  ]}
                >
                  {DAY_SHORT[i]}
                </Text>
                <Text
                  style={[
                    styles.dayNumText,
                    isSel && styles.dayNumTextSelected,
                    isToday && !isSel && { color: colors.accentPrimary },
                  ]}
                >
                  {isHol ? '🌴' : dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    },
    [anchorSunday, pageWidth, holidays, selectedDate, today, colors.accentPrimary, onSelectDate]
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - pageWidth) > 0.5) {
          setPageWidth(w);
          flatListRef.current?.scrollToOffset({
            offset: currentPage * w,
            animated: false,
          });
        }
      }}
    >
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={(item) => `week-${item}`}
        renderItem={renderWeek}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={INITIAL_PAGE}
        initialNumToRender={TOTAL_WEEKS}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        decelerationRate="fast"
        bounces={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 0,
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
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
    color: '#8E8E93',
    marginBottom: 4,
    fontWeight: '500',
  },
  dayNameTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayNumText: {
    fontSize: 15,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  dayNumTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
