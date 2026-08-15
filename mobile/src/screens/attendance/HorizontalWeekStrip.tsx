import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { DAY_SHORT, getLocalDateString } from './attendanceConstants';

interface HorizontalWeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  holidays?: string[];
  today: string;
  logs?: any[];
}

export function HorizontalWeekStrip({
  selectedDate,
  onSelectDate,
  holidays = [],
  today,
}: HorizontalWeekStripProps) {
  const { colors } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const [containerWidth, setContainerWidth] = useState(
    Dimensions.get('window').width - 16
  );

  // Compute base Sunday for the active selectedDate
  const currentSunday = useMemo(() => {
    try {
      const [y, m, d] = (selectedDate || today).split('-').map(Number);
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
  }, [selectedDate, today]);

  // Generate 7-day array for a given week offset from currentSunday (-1: prev, 0: current, 1: next)
  const getWeekDates = useCallback(
    (offsetWeek: number): string[] => {
      const baseMs = currentSunday.getTime() + offsetWeek * 7 * 86400000;
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(baseMs + i * 86400000);
        return getLocalDateString(d);
      });
    },
    [currentSunday]
  );

  // Always maintain 3 virtual pages: [-1: Prev Week, 0: Active Week, 1: Next Week]
  const pages = useMemo(() => [-1, 0, 1], []);

  // Ensure scroll is centered on active week (index 1) whenever currentSunday changes
  useEffect(() => {
    flatListRef.current?.scrollToIndex({ index: 1, animated: false });
  }, [currentSunday]);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offset / containerWidth);

    if (pageIndex === 0) {
      // Swiped to Previous Week
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const [y, m, d] = selectedDate.split('-').map(Number);
      const prevDate = new Date(y, m - 1, d - 7);
      onSelectDate(getLocalDateString(prevDate));
    } else if (pageIndex === 2) {
      // Swiped to Next Week
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const [y, m, d] = selectedDate.split('-').map(Number);
      const nextDate = new Date(y, m - 1, d + 7);
      onSelectDate(getLocalDateString(nextDate));
    }
  };

  const PURPLE_ACCENT = colors.accentPrimary || '#a599ff';

  return (
    <View
      style={{
        width: '100%',
        minHeight: 46,
        marginBottom: 16,
        justifyContent: 'center',
      }}
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - containerWidth) > 2) {
          setContainerWidth(w);
        }
      }}
    >
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={item => `week-offset-${item}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={1}
        getItemLayout={(_, index) => ({
          length: containerWidth,
          offset: containerWidth * index,
          index,
        })}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item: offsetWeek }) => {
          const dates = getWeekDates(offsetWeek);
          return (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: 4,
                width: containerWidth,
              }}
            >
              {dates.map((date, i) => {
                const isHol = holidays.includes(date);
                const isSel = date === selectedDate;
                const isToday = date === today;
                const dayNum = date.split('-')[2];

                return (
                  <TouchableOpacity
                    key={date}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onSelectDate(date);
                    }}
                    style={[
                      {
                        alignItems: 'center',
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        minWidth: 38,
                      },
                      isSel && {
                        backgroundColor: PURPLE_ACCENT,
                      },
                      isToday && !isSel && {
                        backgroundColor: 'rgba(165, 153, 255, 0.16)',
                        borderWidth: 1,
                        borderColor: 'rgba(165, 153, 255, 0.45)',
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: isSel ? '#000000' : (isToday ? PURPLE_ACCENT : colors.textTertiary),
                        marginBottom: 2,
                        fontWeight: isSel ? '700' : (isToday ? '600' : '400'),
                      }}
                    >
                      {DAY_SHORT[i]}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: isSel ? '#000000' : (isToday ? PURPLE_ACCENT : colors.textTertiary),
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
        }}
      />
    </View>
  );
}
