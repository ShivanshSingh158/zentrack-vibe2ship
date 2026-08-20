import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
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
  const [pageWidth, setPageWidth] = useState(Dimensions.get('window').width - 16);
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

  const PURPLE_ACCENT = colors.accentPrimary || '#a599ff';

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
                  isSel && { backgroundColor: PURPLE_ACCENT },
                  isToday && !isSel && {
                    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.16)' : 'rgba(108, 92, 231, 0.12)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(165, 153, 255, 0.45)' : 'rgba(108, 92, 231, 0.35)',
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: isSel ? (isDark ? '#000000' : '#FFFFFF') : (isToday ? PURPLE_ACCENT : colors.textMuted),
                    marginBottom: 2,
                    fontWeight: isSel ? '700' : (isToday ? '600' : '400'),
                  }}
                >
                  {DAY_SHORT[i]}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: isSel ? (isDark ? '#000000' : '#FFFFFF') : (isToday ? PURPLE_ACCENT : colors.textPrimary),
                    fontWeight: isSel ? '700' : (isToday ? '600' : '400'),
                  }}
                >
                  {isHol ? '🌴' : dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    },
    [anchorSunday, pageWidth, holidays, selectedDate, today, PURPLE_ACCENT, colors.textMuted, colors.textPrimary, isDark, onSelectDate]
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - pageWidth) > 1) {
          setPageWidth(w);
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
    marginTop: 2,
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dayCol: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 10,
    minWidth: 38,
  },
});
