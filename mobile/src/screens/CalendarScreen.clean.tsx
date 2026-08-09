import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import AnimatedPressable from '../components/AnimatedPressable';

import { useCalendarData } from './calendar/useCalendarData';
import { makeStyles } from './calendar/calendarStyles';
import { HOUR_HEIGHT } from './calendar/calendarUtils';

import CalendarAgendaView from './calendar/CalendarAgendaView';
import CalendarDayView from './calendar/CalendarDayView';
import CalendarWeekView from './calendar/CalendarWeekView';
import CalendarGymModal from './calendar/CalendarGymModal';
import EventDetailSheet from './calendar/EventDetailSheet';
import NewEventModal from '../components/Calendar/NewEventModal';

export default function CalendarScreen() {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const navigation = useNavigation<any>();
  const data = useCalendarData();

  const isToday = data.selectedDate === data.now.toISOString().slice(0, 10);
  const currentHour = data.currentTime.getHours() + data.currentTime.getMinutes() / 60;
  const indicatorTop = Math.max(0, (currentHour - data.minHour) * HOUR_HEIGHT);

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr);
    const todayStr = data.now.toISOString().slice(0,10);
    const tmrw = new Date(data.now);
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = tmrw.toISOString().slice(0,10);
    if (dateStr === todayStr) return 'Today';
    if (dateStr === tmrwStr) return 'Tomorrow';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  };

  const getMonthName = (dateStr: string) => {
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date(dateStr).getMonth()];
  };

  const handleDateChange = (days: number) => {
    const d = new Date(data.selectedDate);
    d.setDate(d.getDate() + days);
    data.setSelectedDate(d.toISOString().slice(0, 10));
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity style={s.iconBtn} onPress={() => data.setIsMonthDropdownOpen(!data.isMonthDropdownOpen)}>
            <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => { data.setSelectedDate(data.now.toISOString().slice(0, 10)); }}
        >
          <Text style={s.headerTitle}>{getMonthName(data.selectedDate)} {new Date(data.selectedDate).getDate()}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 6 }}>{getDayName(data.selectedDate)}</Text>
        </TouchableOpacity>

        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => data.setShowAddModal(true)}>
            <Ionicons name="add" size={24} color={colors.accentPrimary} />
          </TouchableOpacity>
          <AnimatedPressable style={s.profileBtn} onPress={() => navigation.navigate('MoreStack', { screen: 'Settings' })}>
            <View style={s.profileCircle}>
              <Text style={s.profileInitial}>A</Text>
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {/* Date Navigator */}
      <View style={s.dateNavigator}>
        <TouchableOpacity style={s.navBtn} onPress={() => handleDateChange(-1)}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        
        <View style={s.viewToggle}>
          {(['Day', 'Week'] as const).map(view => (
            <TouchableOpacity 
              key={view} 
              style={[s.toggleBtn, data.currentView === view && s.toggleBtnActive]}
              onPress={() => data.setCurrentView(view)}
            >
              <Text style={[s.toggleBtnText, data.currentView === view && s.toggleBtnTextActive]}>{view}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.navBtn} onPress={() => handleDateChange(1)}>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={{ flex: 1 }}>
        {data.currentView === 'Day' && (
          <CalendarDayView 
            styles={s}
            colors={colors}
            unscheduledDayEvents={data.unscheduledDayEvents}
            processedEvents={data.processedEvents}
            DYNAMIC_HOURS={data.DYNAMIC_HOURS}
            minHour={data.minHour}
            maxHour={data.maxHour}
            isToday={isToday}
            indicatorTop={indicatorTop}
            scrollViewRef={data.scrollViewRef}
            setInitialTime={data.setInitialTime}
            setSelectedEvent={data.setSelectedEvent}
            setShowAddModal={data.setShowAddModal}
            setSelectedGymLog={data.setSelectedGymLog}
            setGymStartTimeInput={data.setGymStartTimeInput}
            setGymEndTimeInput={data.setGymEndTimeInput}
            setShowGymModal={data.setShowGymModal}
          />
        )}
        
        {data.currentView === 'Week' && (
          <CalendarWeekView 
            styles={s}
            colors={colors}
            weekEvents={data.weekEvents}
            DYNAMIC_HOURS={data.DYNAMIC_HOURS}
            minHour={data.minHour}
            maxHour={data.maxHour}
            selectedDate={data.selectedDate}
            setSelectedDate={data.setSelectedDate}
            setSelectedEvent={data.setSelectedEvent}
            setInitialTime={data.setInitialTime}
            setShowAddModal={data.setShowAddModal}
          />
        )}
      </View>

      {/* Modals */}
      <NewEventModal 
        visible={data.showAddModal} 
        onClose={() => data.setShowAddModal(false)} 
        defaultDate={data.selectedDate} 
        initialTime={data.initialTime} 
      />
      
      <EventDetailSheet 
        event={data.selectedEvent}
        visible={!!data.selectedEvent}
        onClose={() => data.setSelectedEvent(null)}
        onEdit={(evt) => { data.setSelectedEvent(null); /* Handle edit */ }}
      />
      
      <CalendarGymModal 
        visible={data.showGymModal}
        onClose={() => data.setShowGymModal(false)}
        selectedGymLog={data.selectedGymLog}
        gymStartTimeInput={data.gymStartTimeInput}
        setGymStartTimeInput={data.setGymStartTimeInput}
        gymEndTimeInput={data.gymEndTimeInput}
        setGymEndTimeInput={data.setGymEndTimeInput}
        onSave={data.handleSaveGymTime}
        colors={colors}
      />
    </SafeAreaView>
  );
}
