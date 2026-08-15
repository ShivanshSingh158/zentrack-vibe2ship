import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, LayoutAnimation, UIManager, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { AddEventModal } from '../components/Calendar/AddEventModal';
import { useNavigation } from '@react-navigation/native';
import { callGeminiProxy } from '../services/geminiProxy';
import { useTheme } from "../contexts/ThemeContext";
import AnimatedPressable from '../components/AnimatedPressable';

import * as Haptics from 'expo-haptics';
import { useCalendarData } from './calendar/useCalendarData';
import { CalendarDayView } from './calendar/CalendarDayView';
import { CalendarWeekView } from './calendar/CalendarWeekView';
import CalendarAgendaView from './calendar/CalendarAgendaView';
import { CalendarGymModal } from './calendar/CalendarGymModal';
import { EventDetailSheet } from './calendar/EventDetailSheet';
import { makeStyles } from './calendar/calendarStyles';
import { getEventColors, format12Hour, parseTimeTo24h, HOUR_HEIGHT } from './calendar/calendarUtils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const [findingSlots, setFindingSlots] = useState(false);

  const data = useCalendarData();
  const {
    now, selectedDate, setSelectedDate,
    showEventModal, setShowEventModal,
    showAddModal, setShowAddModal,
    showGymModal, setShowGymModal,
    selectedEvent, setSelectedEvent,
    selectedGymLog, setSelectedGymLog,
    gymStartTimeInput, setGymStartTimeInput,
    gymEndTimeInput, setGymEndTimeInput,
    isMonthDropdownOpen, setIsMonthDropdownOpen,
    initialTime, setInitialTime,
    scrollViewRef, agendaScrollRef,
    currentTime, currentView, setCurrentView,
    timedDayEvents, unscheduledDayEvents, dayEvents, processedEvents, weekEvents,
    minHour, maxHour, DYNAMIC_HOURS,
    handleSaveGymTime,
    tasks, attendance, customEvents, gymLogs, userGymPlan
  } = data;

  const currentMonthIdx = new Date(selectedDate).getMonth();
  const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const monthName = new Date(selectedDate).toLocaleString('default', { month: 'long' });
  const dayNameShort = new Date(selectedDate).toLocaleString('default', { weekday: 'short' });
  const dateNum = new Date(selectedDate).getDate();

  const toggleMonthDropdown = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMonthDropdownOpen(!isMonthDropdownOpen);
  };

  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const indicatorTop = (currentHour * HOUR_HEIGHT) + ((currentMinutes / 60) * HOUR_HEIGHT);
  const isToday = selectedDate === now.toISOString().slice(0, 10);

const markedDates = useMemo(() => {
    const marks: any = {};
    const MAX_DOTS = 3;

    const addDot = (dateStr: string, color: string, key: string) => {
      if (!marks[dateStr]) marks[dateStr] = { dots: [] };
      if (!marks[dateStr].dots.find((d: any) => d.color === color) && marks[dateStr].dots.length < MAX_DOTS) {
        marks[dateStr].dots.push({ key, color });
      }
    };

    customEvents.forEach(e => addDot(e.date, getEventColors(colors)[e.type]?.bg || '#a599ff', e.id));
    tasks.forEach(t => t.date && addDot(t.date, '#f59e0b', t.id)); // Orange for tasks/assignments
    if (gymLogs) {
      gymLogs.forEach((g: any) => g.date && addDot(g.date, '#10b981', g.id)); // Green for gym
    }

    // Classes & Labs
    if (attendance) {
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      attendance.forEach(subj => {
        // We must calculate dates for the current visible month ideally, but we can't iterate all dates easily here without a bounds.
        // As a shortcut, we mark classes just for the selected month to avoid huge loops.
        const currentM = new Date(selectedDate);
        const y = currentM.getFullYear();
        const m = currentM.getMonth();
        for (let d = 1; d <= 31; d++) {
          const testD = new Date(y, m, d);
          if (testD.getMonth() !== m) break;
          const dayIdx = testD.getDay();
          const dStr = testD.toISOString().slice(0, 10);
          const sch = subj.schedule?.[dayIdx.toString()] || subj.schedule?.[dayIdx] || subj.schedule?.[DAY_NAMES[dayIdx]] || subj.schedule?.[DAY_NAMES[dayIdx].toLowerCase()];
          if (sch && ((sch.classes && sch.classes.length > 0) || (sch.labs && sch.labs.length > 0) || sch.classCount > 0 || sch.labCount > 0)) {
            addDot(dStr, '#3390ec', subj.id + '-class-' + dStr); // Blue for classes
          }
        }
      });
    }

    if (marks[selectedDate]) {
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: colors.accentPrimary, selectedTextColor: '#000000' };
    } else {
      marks[selectedDate] = { selected: true, selectedColor: colors.accentPrimary, selectedTextColor: '#000000' };
    }
    return marks;
  }, [customEvents, tasks, selectedDate, attendance, gymLogs]);

const handleFindFreeSlots = async () => {
    setFindingSlots(true);
    try {
      const prompt = `Here are my events for today: ${JSON.stringify(dayEvents.map(e => ({title: e.title, start: e.startTime, end: e.endTime})))}\nFind the best 1-2 hour continuous free slot during working hours (9 AM - 6 PM). Output a brief, energetic message with the time slot.`;
      const text = await callGeminiProxy(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { maxOutputTokens: 200, temperature: 0.5 }
      );
      alert('AI Scheduler: ' + text);
    } catch(e) {
      alert('Error finding slots');
    }
    setFindingSlots(false);
  };

  return (
    <SafeAreaView style={styles.root}>

      {/* 1.5. SUB HEADER (Month + View Selector) */}
      <View style={styles.subHeader}>
        {currentView === 'Month' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <TouchableOpacity 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const d = new Date(selectedDate);
                d.setMonth(d.getMonth() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }} 
              style={{ paddingVertical: 4, paddingHorizontal: 6 }}
              activeOpacity={0.6}
            >
              <Ionicons name="caret-back" size={16} color={colors.accentPrimary} />
            </TouchableOpacity>
            <Text style={[styles.monthText, { fontSize: 18, marginHorizontal: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
              {new Date(selectedDate).toLocaleString('default', { month: 'short' })} {new Date(selectedDate).getFullYear()}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const d = new Date(selectedDate);
                d.setMonth(d.getMonth() + 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }} 
              style={{ paddingVertical: 4, paddingHorizontal: 6 }}
              activeOpacity={0.6}
            >
              <Ionicons name="caret-forward" size={16} color={colors.accentPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.monthSelector} 
            onPress={toggleMonthDropdown}
            activeOpacity={0.7}
          >
            <Text style={styles.monthText}>{monthName}</Text>
            <Ionicons name={isMonthDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} style={{ marginLeft: 4, marginTop: 4 }} />
          </TouchableOpacity>
        )}

        <View style={styles.viewSelector}>
          {(['Day', 'Week', 'Month'] as const).map(view => (
            <TouchableOpacity 
              key={view}
              style={[styles.viewSelectorBtn, currentView === view && styles.viewSelectorBtnActive]}
              onPress={() => setCurrentView(view)}
            >
              <Text style={[styles.viewSelectorText, currentView === view && styles.viewSelectorTextActive]}>{view}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* MONTH DROPDOWN */}
      {isMonthDropdownOpen && (
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
            renderHeader={() => null} // Google Calendar hides the month header in the dropdown
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: '#8e8e93',
              selectedDayBackgroundColor: '#ff3b30',
              selectedDayTextColor: '#ffffff',
              todayTextColor: '#ff3b30',
              dayTextColor: colors.textPrimary,
              textDisabledColor: '#3a3a3c',
              dotColor: '#ff3b30',
              selectedDotColor: '#ffffff',
              arrowColor: 'transparent',
              monthTextColor: 'transparent',
              textDayFontFamily: FONT_FAMILY.body,
              textDayHeaderFontFamily: FONT_FAMILY.body,
              textDayFontSize: 16,
              textDayHeaderFontSize: 13,
              'stylesheet.calendar.header': {
                header: { height: 0, opacity: 0 },
                week: { marginTop: 0, flexDirection: 'row', justifyContent: 'space-around' }
              }
            } as any}
          />
          {/* Month Chips row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChipsContainer}>
            {ALL_MONTHS.map((m, idx) => (
               <TouchableOpacity 
                 key={m} 
                 style={[styles.monthChip, currentMonthIdx === idx && styles.monthChipActive]}
                 onPress={() => {
                   const d = new Date(selectedDate);
                   d.setMonth(idx);
                   setSelectedDate(d.toISOString().slice(0, 10));
                 }}
               >
                 <Text style={[styles.monthChipText, currentMonthIdx === idx && styles.monthChipTextActive]}>{m}</Text>
               </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 2. DATE SELECTOR (Week Strip) */}
      <View style={[styles.weekStrip, { display: (!isMonthDropdownOpen && currentView !== 'Month') ? 'flex' : 'none' }]}>
          {Array.from({length: 7}).map((_, i) => {
            const dateObj = new Date(now);
            // Quick hack to show current week: start from Sunday of current week
            const currentDay = now.getDay();
            dateObj.setDate(now.getDate() - currentDay + i);
            const yyyy = dateObj.getFullYear();
            const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const dd = dateObj.getDate().toString().padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const isSelected = dateStr === selectedDate;
            const dateNum = dateObj.getDate();
            const dateDay = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            
            return (
              <TouchableOpacity key={dateStr} style={styles.dayCol} onPress={() => setSelectedDate(dateStr)}>
                <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>{dateDay}</Text>
                <View style={[styles.dayPill, isSelected && styles.dayPillActive]}>
                  <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>{dateNum}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

      
      {/* 3. TIMELINE GRID (DAY VIEW) */}
      <View style={{ flex: 1, display: currentView === 'Day' ? 'flex' : 'none' }}>
        <CalendarDayView 
          styles={styles} colors={colors} 
          unscheduledDayEvents={unscheduledDayEvents} processedEvents={processedEvents} 
          DYNAMIC_HOURS={DYNAMIC_HOURS} minHour={minHour} maxHour={maxHour} 
          isToday={isToday} indicatorTop={indicatorTop} scrollViewRef={scrollViewRef} 
          setInitialTime={setInitialTime} setSelectedEvent={setSelectedEvent} 
          setShowAddModal={setShowAddModal} setSelectedGymLog={setSelectedGymLog} 
          setGymStartTimeInput={setGymStartTimeInput} setGymEndTimeInput={setGymEndTimeInput} 
          setShowGymModal={setShowGymModal} setShowEventModal={setShowEventModal} gymLogs={gymLogs} 
        />
      </View>

      {/* 4. WEEK VIEW GRID */}
      <View style={{ flex: 1, display: currentView === 'Week' ? 'flex' : 'none' }}>
        <CalendarWeekView 
          styles={styles} colors={colors} weekEvents={weekEvents} 
          DYNAMIC_HOURS={DYNAMIC_HOURS} minHour={minHour} maxHour={maxHour} 
          indicatorTop={indicatorTop} selectedDate={selectedDate} nowDateStr={now.toISOString().slice(0, 10)} 
          setSelectedDate={setSelectedDate} setCurrentView={setCurrentView} 
        />
      </View>

      {/* 5. MONTH VIEW */}
      {currentView === 'Month' && (
        <View style={styles.monthViewContainer}>
          <CalendarAgendaView 
            styles={styles} colors={colors} selectedDate={selectedDate} 
            currentView={currentView}
            setSelectedDate={setSelectedDate} markedDates={markedDates} 
            dayEvents={dayEvents} setSelectedGymLog={setSelectedGymLog} 
            setGymStartTimeInput={setGymStartTimeInput} setGymEndTimeInput={setGymEndTimeInput} 
            setShowGymModal={setShowGymModal} setSelectedEvent={setSelectedEvent} 
            setShowEventModal={setShowEventModal} gymLogs={gymLogs} 
          />
        </View>
      )}

      {/* Event Details Sheet */}
      {showEventModal && (
        <EventDetailSheet 
          selectedEvent={selectedEvent} 
          setShowEventModal={setShowEventModal} 
          navigation={navigation} 
        />
      )}

      {/* Add Event Modal */}
      <AddEventModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        selectedDate={selectedDate}
        initialTime={initialTime}
      />

      {/* Gym Modal */}
      {showGymModal && (
        <CalendarGymModal 
          selectedGymLog={selectedGymLog} 
          setShowGymModal={setShowGymModal} 
          gymStartTimeInput={gymStartTimeInput} 
          setGymStartTimeInput={setGymStartTimeInput} 
          gymEndTimeInput={gymEndTimeInput} 
          setGymEndTimeInput={setGymEndTimeInput} 
          handleSaveGymTime={handleSaveGymTime} 
          colors={colors} 
        />
      )}

      {/* Floating Add Event Button */}
      <AnimatedPressable
        style={{
          position: 'absolute',
          bottom: 110,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accentPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.accentPrimary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
          zIndex: 100,
        }}
        onPress={() => {
          setInitialTime(null);
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={32} color="#ffffff" />
      </AnimatedPressable>
    </SafeAreaView>
  );
}
