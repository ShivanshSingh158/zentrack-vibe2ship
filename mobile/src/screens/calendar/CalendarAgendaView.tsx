/**
 * CalendarAgendaView.tsx
 * Renders the Month Dropdown (when tapping month header) AND the Month/Agenda View.
 * We isolate this file so `react-native-calendars` (which is heavy) is lazy-loaded!
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { Calendar, CalendarProvider, ExpandableCalendar } from 'react-native-calendars';
import { getEventColors, format12Hour } from './calendarUtils';
import { formatDateFull } from '../../utils/dateUtils';
import { FONT_FAMILY } from '../../theme/tokens';

interface CalendarAgendaViewProps {
  styles: any;
  colors: any;
  currentView: 'Day' | 'Week' | 'Month';
  isMonthDropdownOpen?: boolean;
  selectedDate: string;
  markedDates: any;
  dayEvents: any[];
  ALL_MONTHS?: string[];
  currentMonthIdx?: number;
  setSelectedDate: (date: string) => void;
  setIsMonthDropdownOpen?: (open: boolean) => void;
  agendaScrollRef?: any;
  setSelectedEvent: (evt: any) => void;
  setShowEventModal: (show: boolean) => void;
  setSelectedGymLog: (log: any) => void;
  setGymStartTimeInput: (time: string) => void;
  setGymEndTimeInput: (time: string) => void;
  setShowGymModal: (show: boolean) => void;
  gymLogs: any[];
}

const CalendarAgendaView = React.memo(function CalendarAgendaView({
  styles, colors, selectedDate, currentView,
  setSelectedDate, markedDates, dayEvents, setSelectedGymLog,
  setGymStartTimeInput, setGymEndTimeInput, setShowGymModal,
  setShowEventModal, setSelectedEvent, gymLogs
}: CalendarAgendaViewProps) {

  const renderMonthEventItem = ({ item }: { item: any }) => {
    const typeColor = getEventColors(colors)[item.type]?.bg || '#a599ff';
    return (
      <TouchableOpacity 
        style={[styles.monthEventRow, { borderLeftColor: typeColor }]} 
        activeOpacity={0.7}
        onPress={() => {
          if (item.type === 'gym') {
            const log = gymLogs?.find(g => g.id === item.id);
            if (log) {
              setSelectedGymLog(log);
              setGymStartTimeInput(item.startTime || '10:00');
              setGymEndTimeInput(item.endTime || '11:00');
              setShowGymModal(true);
            }
          } else {
            setSelectedEvent(item); setShowEventModal(true);
          }
        }}
      >
        <Text style={[styles.monthEventTitle, { color: typeColor }]} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.monthEventTime}>{format12Hour(item.startTime)} - {format12Hour(item.endTime)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <CalendarProvider
        date={selectedDate}
        onDateChanged={(date: string) => setSelectedDate(date)}
        showTodayButton
        todayBottomMargin={110}
        theme={{ todayButtonTextColor: colors.accentPrimary }}
      >
        <ExpandableCalendar
          initialPosition={ExpandableCalendar.positions.OPEN}
          allowShadow={false}
          firstDay={1}
          markingType={'custom'}
          markedDates={Object.keys(markedDates).reduce((acc: any, date) => {
            const hasEvents = markedDates[date].dots && markedDates[date].dots.length > 0;
            acc[date] = {
              customStyles: {
                container: { backgroundColor: date === selectedDate ? colors.accentPrimary : 'transparent', borderRadius: 16 },
                text: { color: date === selectedDate ? '#000' : colors.textPrimary, fontWeight: date === selectedDate ? 'bold' : 'normal' }
              }
            };
            if (hasEvents) {
              acc[date].marked = true;
              acc[date].dotColor = date === selectedDate ? '#000' : colors.accentPrimary;
            }
            return acc;
          }, {})}
          theme={{
            backgroundColor: colors.background,
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textMuted,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.border,
            monthTextColor: colors.textPrimary,
            arrowColor: colors.accentPrimary,
            textDayFontFamily: FONT_FAMILY.body,
            textDayHeaderFontFamily: FONT_FAMILY.medium,
            textDayFontSize: 16,
            textDayHeaderFontSize: 12,
            'stylesheet.calendar.header': {
              header: { height: 0, opacity: 0 },
              week: { marginTop: 0, flexDirection: 'row', justifyContent: 'space-around' }
            }
          } as any}
        />
      <View style={styles.monthEventListContainer}>
        <Text style={styles.monthEventListHeader}>{formatDateFull(selectedDate).toUpperCase()}</Text>
        <FlatList
          data={dayEvents}
          keyExtractor={item => item.id}
          renderItem={renderMonthEventItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No events on this day.</Text>}
        />
      </View>
      </CalendarProvider>
      </View>
  );
});

export default CalendarAgendaView;
