/**
 * CalendarAgendaView.tsx
 * Renders the Foldable / Expandable Month View.
 * Supports swiping/pulling between 1-week collapsed strip and full month view.
 */
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { CalendarProvider, ExpandableCalendar } from 'react-native-calendars';
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
        showTodayButton={false}
        theme={{ todayButtonTextColor: colors.accentPrimary }}
      >
        <ExpandableCalendar
          initialPosition={ExpandableCalendar.positions.OPEN}
          allowShadow={false}
          firstDay={1}
          horizontal={true}
          enableSwipeMonths={true}
          onMonthChange={(month: any) => {
            if (month?.dateString) setSelectedDate(month.dateString);
          }}
          markingType={'multi-dot'}
          markedDates={markedDates}
          hideKnob={false}
          renderHeader={() => null}
          theme={{
            backgroundColor: colors.background,
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textMuted,
            selectedDayBackgroundColor: colors.accentPrimary,
            selectedDayTextColor: '#000000',
            todayTextColor: colors.accentPrimary,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.border,
            dotColor: colors.accentPrimary,
            selectedDotColor: '#000000',
            arrowColor: colors.accentPrimary,
            monthTextColor: colors.textPrimary,
            textDayFontFamily: FONT_FAMILY.body,
            textDayHeaderFontFamily: FONT_FAMILY.medium,
            textDayFontSize: 15,
            textDayHeaderFontSize: 12,
            'stylesheet.expandable.main': {
              knob: {
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignSelf: 'center',
                marginVertical: 6,
              },
              knobContainer: {
                height: 20,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.background,
              },
            },
            'stylesheet.calendar.header': {
              header: { height: 0, opacity: 0, margin: 0, padding: 0 },
              week: { marginTop: 4, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-around' }
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
