/**
 * MonthDropdownCalendar.tsx — ZenTrack Mobile
 *
 * Extracted Month Dropdown Calendar with react-native-calendars.
 * Lazy-loaded on demand when user opens month dropdown, saving cold-boot parsing.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { FONT_FAMILY } from '../../theme/tokens';
import { formatLocalDateStr } from '../../utils/dateUtils';

interface MonthDropdownCalendarProps {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setIsMonthDropdownOpen: (open: boolean) => void;
  agendaScrollRef: any;
  markedDates: any;
  colors: any;
  isDark: boolean;
  styles: any;
  ALL_MONTHS: string[];
  currentMonthIdx: number;
}

export default function MonthDropdownCalendar({
  selectedDate,
  setSelectedDate,
  setIsMonthDropdownOpen,
  agendaScrollRef,
  markedDates,
  colors,
  isDark,
  styles,
  ALL_MONTHS,
  currentMonthIdx,
}: MonthDropdownCalendarProps) {
  return (
    <View style={styles.monthDropdownContainer}>
      <Calendar
        current={selectedDate}
        onDayPress={(day: any) => {
          setSelectedDate(day.dateString);
          setIsMonthDropdownOpen(false);
          setTimeout(() => {
            agendaScrollRef.current?.scrollTo({ y: 0, animated: true });
          }, 100);
        }}
        markingType={'multi-dot'}
        markedDates={markedDates}
        hideExtraDays={true}
        renderHeader={() => null}
        theme={{
          backgroundColor: 'transparent',
          calendarBackground: 'transparent',
          textSectionTitleColor: colors.textMuted,
          selectedDayBackgroundColor: colors.accentPrimary,
          selectedDayTextColor: isDark ? '#000000' : '#FFFFFF',
          todayTextColor: colors.accentPrimary,
          dayTextColor: colors.textPrimary,
          textDisabledColor: colors.border,
          dotColor: colors.accentPrimary,
          selectedDotColor: isDark ? '#000000' : '#FFFFFF',
          arrowColor: 'transparent',
          monthTextColor: 'transparent',
          textDayFontFamily: FONT_FAMILY.body,
          textDayHeaderFontFamily: FONT_FAMILY.body,
          textDayFontSize: 16,
          textDayHeaderFontSize: 13,
          'stylesheet.calendar.header': {
            header: { height: 0, opacity: 0 },
            week: { marginTop: 0, flexDirection: 'row', justifyContent: 'space-around' },
          },
        } as any}
      />
      {/* Month Chips row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChipsContainer}>
        {ALL_MONTHS.map((m, idx) => (
          <TouchableOpacity
            key={m}
            style={[styles.monthChip, currentMonthIdx === idx && styles.monthChipActive]}
            onPress={() => {
              const [y, m, day] = selectedDate.split('-').map(Number);
              const d = new Date(y, idx, Math.min(day, new Date(y, idx + 1, 0).getDate()));
              setSelectedDate(formatLocalDateStr(d));
            }}
          >
            <Text style={[styles.monthChipText, currentMonthIdx === idx && styles.monthChipTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
