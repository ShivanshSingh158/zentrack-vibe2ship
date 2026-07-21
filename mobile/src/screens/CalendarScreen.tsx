import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, Platform, Image, LayoutAnimation, UIManager, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useMobileData, CustomEvent } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { AddEventModal } from '../components/Calendar/AddEventModal';

import { useNavigation } from '@react-navigation/native';
import { callGeminiProxy } from '../services/geminiProxy';
import { BlurView } from 'expo-blur';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

// Google Calendar standard hours (24-hour format like the screenshot)
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // Pixels per hour

const getEventColors = (colors: any): Record<string, { bg: string, text: string }> => ({
  exam: { bg: '#F28B82', text: '#202124' },
  assignment_due: { bg: '#C39BD3', text: '#202124' },
  holiday: { bg: '#81C995', text: '#202124' },
  viva: { bg: '#FAD7A1', text: '#202124' },
  submission: { bg: colors.accentPrimary, text: '#202124' },
  todo: { bg: '#AECBFA', text: '#202124' },
  job: { bg: '#FDE293', text: '#202124' },
  goal: { bg: '#FF8BCB', text: '#202124' },
  gcal: { bg: colors.accentPrimary, text: '#202124' },
  class: { bg: '#C39BD3', text: '#202124' },
  lab: { bg: '#FAD7A1', text: '#202124' },
});

const format12Hour = (time24: string | undefined): string => {
  if (!time24) return '';
  const upper = time24.toUpperCase();
  if (upper.includes('AM') || upper.includes('PM')) {
    // Already formatted, ensure there's a space before AM/PM
    return upper.replace(/([0-9])([AP]M)/, '$1 $2');
  }
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0], 10);
  const m = parts[1].replace(/[^0-9]/g, '');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${m} ${ampm}`;
};

export default function CalendarScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { customEvents, tasks, attendance, user, googleAccessToken, gymLogs } = useMobileData();
  const navigation = useNavigation<any>();
  
  // Base date
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10));
  
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGymModal, setShowGymModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CustomEvent | null>(null);
  const [selectedGymLog, setSelectedGymLog] = useState<any>(null);
  const [gymStartTimeInput, setGymStartTimeInput] = useState('');
  const [gymEndTimeInput, setGymEndTimeInput] = useState('');
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [initialTime, setInitialTime] = useState<string>('');
  const [gcalEvents, setGcalEvents] = useState<CustomEvent[]>([]);
  const [findingSlots, setFindingSlots] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const agendaScrollRef = useRef<ScrollView>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentView, setCurrentView] = useState<'Day'|'Week'|'Month'>('Day');

  const handleSaveGymTime = async () => {
    if (!selectedGymLog || !user) return;
    try {
      const docRef = doc(db, COLLECTION.GYM_LOGS, selectedGymLog.id);
      await updateDoc(docRef, {
        startTime: gymStartTimeInput,
        endTime: gymEndTimeInput,
      });
      setShowGymModal(false);
    } catch (e) {
      console.warn('Failed to update gym time', e);
    }
  };

  // Update current time indicator every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Scroll to current time on mount if today
  useEffect(() => {
    if (selectedDate === now.toISOString().slice(0, 10) && scrollViewRef.current) {
      const currentHour = now.getHours();
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, (currentHour - 1) * HOUR_HEIGHT), animated: false });
      }, 100);
    }
  }, [selectedDate]);

  // Fetch Google Calendar events
  useEffect(() => {
    if (!googleAccessToken) return;
    const fetchGcal = async () => {
      try {
        const start = new Date(selectedDate);
        start.setHours(0,0,0,0);
        const end = new Date(selectedDate);
        end.setHours(23,59,59,999);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true`, {
          headers: { Authorization: `Bearer ${googleAccessToken}` }
        });
        const data = await res.json();
        if (data.items) {
          const mapped = data.items.map((item: any) => {
            const dtStart = new Date(item.start.dateTime || item.start.date);
            const dtEnd = new Date(item.end.dateTime || item.end.date);
            return {
              id: item.id,
              title: item.summary || 'Busy',
              date: selectedDate,
              type: 'gcal',
              startTime: dtStart.getHours().toString().padStart(2, '0') + ':' + dtStart.getMinutes().toString().padStart(2, '0'),
              endTime: dtEnd.getHours().toString().padStart(2, '0') + ':' + dtEnd.getMinutes().toString().padStart(2, '0'),
              location: item.location,
            } as CustomEvent;
          });
          setGcalEvents(mapped);
        }
      } catch (e) {
        console.warn('GCal fetch error', e);
      }
    };
    fetchGcal();
  }, [googleAccessToken, selectedDate]);

  // Combine custom events, tasks, and gcal events for the day
  const dayEvents = useMemo(() => {
    const events = customEvents.filter(e => e.date === selectedDate);
    
    const dayTasks = tasks.filter(t => t.date === selectedDate).map(t => {
      let startTime = '09:00';
      let endTime = '10:00';
      if (t.timeSlot) {
        if (t.timeSlot.includes('-')) {
          const parts = t.timeSlot.split('-');
          startTime = parts[0].trim();
          endTime = parts[1].trim();
        } else {
          startTime = t.timeSlot.trim();
          const parts = startTime.split(':');
          if (parts.length === 2) {
            endTime = `${(parseInt(parts[0], 10) + 1).toString().padStart(2, '0')}:${parts[1]}`;
          }
        }
      }
      return {
        id: t.id, 
        title: t.title, 
        type: 'todo' as const, 
        date: t.date, 
        startTime,
        endTime,
        isCompleted: t.status === 'completed'
      };
    });

    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const classEvents = attendance?.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)] || subj.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || subj.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      if (!sch) return [];
      
      const evtList: any[] = [];
      if (sch.classes && Array.isArray(sch.classes)) {
        sch.classes.forEach((c: any, i: number) => {
          if (c.time) {
            const parts = c.time.split(':');
            evtList.push({
              id: `${subj.id}-class-${i}`,
              title: `${subj.name} (Class)`,
              type: 'class',
              date: selectedDate,
              startTime: c.time,
              endTime: parts.length === 2 ? `${(parseInt(parts[0], 10)+1).toString().padStart(2, '0')}:${parts[1]}` : c.time,
              location: c.room || '',
            });
          }
        });
      }
      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (l.time) {
             const parts = l.time.split(':');
             evtList.push({
              id: `${subj.id}-lab-${i}`,
              title: `${subj.name} (Lab)`,
              type: 'lab', 
              date: selectedDate,
              startTime: l.time,
              endTime: parts.length === 2 ? `${(parseInt(parts[0], 10)+2).toString().padStart(2, '0')}:${parts[1]}` : l.time,
              location: l.room || '',
            });
          }
        });
      }
      return evtList;
    }) || [];

    const gymEvts = (gymLogs || []).filter(g => g.date === selectedDate).map(g => ({
        id: g.id, 
        title: 'Gym Workout', 
        type: 'gym', 
        date: g.date, 
        startTime: g.startTime || '10:00', 
        endTime: g.endTime || '11:00', 
        location: 'Gym'
      }));
      return [...events, ...dayTasks, ...classEvents, ...gymEvts, ...gcalEvents] as CustomEvent[];
  }, [customEvents, tasks, attendance, gymLogs, gcalEvents, selectedDate]);

  // Math for overlapping events layout
  const processedEvents = useMemo(() => {
    const rawEvents = dayEvents;

    const timedEvents = rawEvents.map((event, index) => {
      let startHour = 9;
      let startMin = 0;
      let endHour = 10;
      let endMin = 0;
      
      if (event.startTime) {
        const parts = event.startTime.split(':');
        if (parts.length === 2) {
          startHour = parseInt(parts[0], 10);
          startMin = parseInt(parts[1], 10);
        }
      } else {
        startHour = 9 + (index % 5);
      }

      if (event.endTime && event.startTime) {
        const parts = event.endTime.split(':');
        if (parts.length === 2) {
          endHour = parseInt(parts[0], 10);
          endMin = parseInt(parts[1], 10);
        }
      } else {
        endHour = startHour + 1;
        endMin = startMin;
      }

      const top = (startHour * HOUR_HEIGHT) + ((startMin / 60) * HOUR_HEIGHT);
      let height = ((endHour - startHour) * HOUR_HEIGHT) + ((endMin - startMin) / 60) * HOUR_HEIGHT;
      if (height < 40) height = 40;

      return { ...event, top, height, startTotalMins: startHour * 60 + startMin, endTotalMins: endHour * 60 + endMin };
    }).sort((a, b) => a.startTotalMins - b.startTotalMins);

    const eventGroups: (typeof timedEvents[number])[][] = [];
    let currentGroup: (typeof timedEvents[number])[] = [];
    let lastEventEnd = 0;

    timedEvents.forEach(ev => {
      if (currentGroup.length === 0) {
        currentGroup.push(ev);
        lastEventEnd = ev.endTotalMins;
      } else if (ev.startTotalMins < lastEventEnd) {
        currentGroup.push(ev);
        lastEventEnd = Math.max(lastEventEnd, ev.endTotalMins);
      } else {
        eventGroups.push(currentGroup);
        currentGroup = [ev];
        lastEventEnd = ev.endTotalMins;
      }
    });
    if (currentGroup.length > 0) eventGroups.push(currentGroup);

    const finalEvents: (typeof timedEvents[0] & { left: string, width: string })[] = [];
    eventGroups.forEach(group => {
      group.forEach((ev, i) => {
        finalEvents.push({
          ...ev,
          left: `${(i / group.length) * 100}%`,
          width: `${100 / group.length}%`
        });
      });
    });

    return finalEvents;
  }, [dayEvents]);

  // --- WEEK VIEW LOGIC ---
  const weekEvents = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
    
    let allWeekEvents: any[] = [];
    
    for (let i = 0; i < 7; i++) {
      const cur = new Date(d);
      cur.setDate(d.getDate() + i);
      const dateStr = cur.toISOString().slice(0, 10);
      
      const events = customEvents.filter(e => e.date === dateStr);
      const dayTasks = tasks.filter(t => t.date === dateStr).map(t => {
        let startTime = '09:00'; let endTime = '10:00';
        if (t.timeSlot) {
          if (t.timeSlot.includes('-')) {
            const parts = t.timeSlot.split('-');
            startTime = parts[0].trim(); endTime = parts[1].trim();
          } else {
            startTime = t.timeSlot.trim();
            const parts = startTime.split(':');
            if (parts.length === 2) {
              endTime = `${(parseInt(parts[0], 10) + 1).toString().padStart(2, '0')}:${parts[1]}`;
            }
          }
        }
        return { id: t.id, title: t.title, type: 'todo', date: dateStr, startTime, endTime };
      });
      
      const dayOfWeek = cur.getDay().toString();
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const classEvents = attendance?.flatMap(subj => {
        const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)] || subj.schedule?.[DAY_NAMES[cur.getDay()]] || subj.schedule?.[DAY_NAMES[cur.getDay()].toLowerCase()];
        if (!sch) return [];
        const evtList: any[] = [];
        if (sch.classes && Array.isArray(sch.classes)) {
          sch.classes.forEach((c: any, idx: number) => {
            if (c.time) {
              const parts = c.time.split(':');
              evtList.push({
                id: `${subj.id}-class-${dateStr}-${idx}`, title: `${subj.name} (Class)`, type: 'class', date: dateStr,
                startTime: c.time, endTime: parts.length === 2 ? `${(parseInt(parts[0], 10)+1).toString().padStart(2, '0')}:${parts[1]}` : c.time
              });
            }
          });
        }
        if (sch.labs && Array.isArray(sch.labs)) {
          sch.labs.forEach((l: any, idx: number) => {
            if (l.time) {
               const parts = l.time.split(':');
               evtList.push({
                id: `${subj.id}-lab-${dateStr}-${idx}`, title: `${subj.name} (Lab)`, type: 'lab', date: dateStr,
                startTime: l.time, endTime: parts.length === 2 ? `${(parseInt(parts[0], 10)+2).toString().padStart(2, '0')}:${parts[1]}` : l.time
              });
            }
          });
        }
        return evtList;
      }) || [];

      const gcals = gcalEvents.filter(e => e.date === dateStr);
      
      const gymEvts = (gymLogs || []).filter(g => g.date === dateStr).map(g => ({
        id: g.id, title: 'Gym Workout', type: 'gym', date: g.date, startTime: '', endTime: '', location: 'Gym'
      }));
      const dayCombined = [...events, ...dayTasks, ...classEvents, ...gymEvts, ...gcals];
      
      dayCombined.forEach(event => {
        let startHour = 9; let startMin = 0; let endHour = 10; let endMin = 0;
        if (event.startTime) {
          const parts = event.startTime.split(':');
          if (parts.length === 2) { startHour = parseInt(parts[0], 10); startMin = parseInt(parts[1], 10); }
        }
        if (event.endTime && event.startTime) {
          const parts = event.endTime.split(':');
          if (parts.length === 2) { endHour = parseInt(parts[0], 10); endMin = parseInt(parts[1], 10); }
        } else {
          endHour = startHour + 1; endMin = startMin;
        }
        const top = (startHour * HOUR_HEIGHT) + ((startMin / 60) * HOUR_HEIGHT);
        let height = ((endHour - startHour) * HOUR_HEIGHT) + ((endMin - startMin) / 60) * HOUR_HEIGHT;
        if (height < 20) height = 20;

        allWeekEvents.push({ ...event, top, height, dayIndex: i, dateStr });
      });
    }
    return allWeekEvents;
  }, [selectedDate, customEvents, tasks, attendance, gymLogs, gcalEvents]);

  // --- MONTH VIEW LOGIC ---
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

  // Math for current time indicator
  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const indicatorTop = (currentHour * HOUR_HEIGHT) + ((currentMinutes / 60) * HOUR_HEIGHT);
  const isToday = selectedDate === now.toISOString().slice(0, 10);

  // Month formatting for header
  const monthName = new Date(selectedDate).toLocaleString('default', { month: 'long' });
  const dayNameShort = new Date(selectedDate).toLocaleString('default', { weekday: 'short' });
  const dateNum = new Date(selectedDate).getDate();

  // Marked Dates for Calendar Dropdown
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
      marks[selectedDate] = { ...marks[selectedDate], selected: true };
    } else {
      marks[selectedDate] = { selected: true };
    }
    return marks;
  }, [customEvents, tasks, selectedDate, attendance, gymLogs]);

  // Months array for chips
  const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const currentMonthIdx = new Date(selectedDate).getMonth();

  const toggleMonthDropdown = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMonthDropdownOpen(!isMonthDropdownOpen);
  };

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
      {/* 1. TOP HEADER BAR */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.profileBtn}>
            <View style={styles.profileCircle}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.profileImage} />
              ) : (
                <Text style={styles.profileInitials}>{user?.displayName?.charAt(0)?.toUpperCase() || 'Z'}</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1.5. SUB HEADER (Month + View Selector) */}
      <View style={styles.subHeader}>
        <TouchableOpacity 
          style={styles.monthSelector} 
          onPress={toggleMonthDropdown}
          activeOpacity={0.7}
        >
          <Text style={styles.monthText}>{monthName}</Text>
          <Ionicons name={isMonthDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} style={{ marginLeft: 4, marginTop: 4 }} />
        </TouchableOpacity>

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
      {!isMonthDropdownOpen && currentView !== 'Month' && (
        <View style={styles.weekStrip}>
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
      )}

      {/* 3. TIMELINE GRID (DAY VIEW) */}
      {currentView === 'Day' && (
      <ScrollView ref={scrollViewRef} style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.timelineInner}>
          {/* Hour Grid Lines */}
          {HOURS.map(hour => (
            <TouchableOpacity 
              key={hour} 
              style={[styles.hourRow, { top: hour * HOUR_HEIGHT }]}
              onPress={() => {
                setInitialTime(`${hour.toString().padStart(2, '0')}:00`);
                setSelectedEvent(null);
                setShowAddModal(true);
              }}
            >
              <Text style={styles.hourText}>
                {format12Hour(`${hour.toString().padStart(2, '0')}:00`)}
              </Text>
              <View style={styles.hourLine} />
            </TouchableOpacity>
          ))}

          {/* Render Absolute Events */}
          <View style={styles.eventsContainer}>
            {processedEvents.map((event) => {
              const typeColor = getEventColors(colors)[event.type]?.bg || '#a599ff';
              const isDarkText = getEventColors(colors)[event.type]?.text === '#202124';
              
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventBlock, 
                    { 
                      top: event.top, 
                      height: event.height, 
                      left: event.left as any, 
                      width: event.width as any,
                      backgroundColor: `${typeColor}40`, // 25% opacity hex
                      borderLeftColor: typeColor
                    }
                  ]}
                  onPress={() => {
                    if (event.type === 'gym') {
                      const log = gymLogs?.find(g => g.id === event.id);
                      if (log) {
                        setSelectedGymLog(log);
                        setGymStartTimeInput(event.startTime || '10:00');
                        setGymEndTimeInput(event.endTime || '11:00');
                        setShowGymModal(true);
                      }
                    } else {
                      setSelectedEvent(event); setShowEventModal(true);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.eventBlockTitle, { color: typeColor }]} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text style={[styles.eventBlockLocation, { color: typeColor }]} numberOfLines={1}>
                    {format12Hour(event.startTime)} - {format12Hour(event.endTime)}{event.location ? ` • ${event.location}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Current Time Indicator Line */}
          {isToday && (
            <View style={[styles.currentTimeIndicator, { top: indicatorTop }]}>
              <View style={styles.currentTimeDot} />
              <View style={styles.currentTimeLine} />
            </View>
          )}

          {/* Bottom padding so we can scroll past midnight */}
          <View style={{ height: 100, top: 24 * HOUR_HEIGHT }} />
        </View>
      </ScrollView>
      )}

      {/* 4. WEEK VIEW GRID */}
      {currentView === 'Week' && (
        <ScrollView style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.timelineInner, { flexDirection: 'row' }]}>
            {/* Hour Axis */}
            <View style={styles.weekHourAxis}>
              {HOURS.map(hour => (
                <View key={hour} style={[styles.hourRow, { top: hour * HOUR_HEIGHT }]}>
                  <Text style={styles.weekHourText}>{format12Hour(hour + ':00').replace(' AM','a').replace(' PM','p')}</Text>
                </View>
              ))}
            </View>
            {/* 7 Columns */}
            <View style={styles.weekGrid}>
              {Array.from({length: 7}).map((_, i) => {
                const isTodayCol = new Date(selectedDate).getDay() === i && selectedDate === now.toISOString().slice(0, 10);
                return (
                  <View key={i} style={[styles.weekCol, isTodayCol && styles.weekColToday]}>
                    {/* Hour Lines */}
                    {HOURS.map(hour => (
                      <View key={`hl-${hour}`} style={[styles.weekHourLine, { top: hour * HOUR_HEIGHT }]} />
                    ))}
                    {/* Current Time Tick */}
                    {isTodayCol && (
                      <View style={[styles.weekCurrentTimeTick, { top: indicatorTop }]} />
                    )}
                    {/* Events */}
                    {weekEvents.filter((e: any) => e.dayIndex === i).map((event: any) => {
                      const typeColor = getEventColors(colors)[event.type]?.bg || '#a599ff';
                      return (
                        <TouchableOpacity
                          key={event.id}
                          style={[styles.weekEventBlock, { top: event.top, height: event.height, backgroundColor: `${typeColor}40`, borderLeftColor: typeColor }]}
                          onPress={() => { setSelectedDate(event.dateStr); setCurrentView('Day'); }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.weekEventTitle, { color: typeColor }]} numberOfLines={1}>{event.title}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
            <View style={{ height: 100, top: 24 * HOUR_HEIGHT, width: '100%', position: 'absolute' }} />
          </View>
        </ScrollView>
      )}

      {/* 5. MONTH VIEW */}
      {currentView === 'Month' && (
        <View style={styles.monthViewContainer}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            markingType={'custom'}
            markedDates={
              Object.keys(markedDates).reduce((acc: any, date) => {
                const hasEvents = markedDates[date].dots && markedDates[date].dots.length > 0;
                acc[date] = {
                  customStyles: {
                    container: {
                      backgroundColor: date === selectedDate ? colors.accentPrimary : 'transparent',
                      borderRadius: 16
                    },
                    text: {
                      color: date === selectedDate ? '#000' : colors.textPrimary,
                      fontWeight: date === selectedDate ? 'bold' : 'normal'
                    }
                  }
                };
                if (hasEvents) {
                  // Single purple dot for any event
                  acc[date].marked = true;
                  acc[date].dotColor = date === selectedDate ? '#000' : colors.accentPrimary;
                }
                return acc;
              }, {})
            }
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: colors.textMuted,
              dayTextColor: colors.textPrimary,
              textDisabledColor: colors.border,
              monthTextColor: colors.textPrimary,
              arrowColor: colors.accentPrimary,
              textDayFontFamily: FONT_FAMILY.body,
              textDayHeaderFontFamily: FONT_FAMILY.medium,
              textDayFontSize: 16,
              textDayHeaderFontSize: 12,
            } as any}
          />
          <View style={styles.monthEventListContainer}>
            <Text style={styles.monthEventListHeader}>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
            <FlatList
              data={dayEvents}
              keyExtractor={item => item.id}
              renderItem={renderMonthEventItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No events on this day.</Text>}
            />
          </View>
        </View>
      )}

      {/* 4. FLOATING ACTION BUTTON (FAB) */}
      <TouchableOpacity 
        style={styles.fab} 
        activeOpacity={0.8}
        onPress={() => {
          setInitialTime('');
          setSelectedEvent(null);
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>

      {/* ADD EVENT MODAL (Reusing existing) */}
      <AddEventModal 
        visible={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        selectedDate={selectedDate}
        initialStartTime={initialTime}
        existingEvent={selectedEvent}
      />
      <Modal visible={showEventModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
        
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowEventModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                <TouchableOpacity onPress={() => {
                  setShowEventModal(false);
                  setShowAddModal(true);
                }}>
                  <Ionicons name="pencil" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity>
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.modalTitle}>{selectedEvent?.title}</Text>
            <View style={styles.modalRow}>
              <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
              <Text style={styles.modalText}>{selectedDate}</Text>
            </View>
            {selectedEvent?.startTime && (
              <View style={styles.modalRow}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={styles.modalText}>
                  {selectedEvent.startTime} {selectedEvent.endTime ? `- ${selectedEvent.endTime}` : ''}
                </Text>
              </View>
            )}
            {selectedEvent?.location && (
              <View style={styles.modalRow}>
                <Ionicons name="location-outline" size={20} color={colors.textMuted} />
                <Text style={styles.modalText}>{selectedEvent.location}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={showGymModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Gym Time</Text>
              <TouchableOpacity onPress={() => setShowGymModal(false)}>
                <Ionicons name="close" size={24} color="#8e8e93" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 16, marginTop: 12 }}>
              <View>
                <Text style={{ color: '#8e8e93', fontSize: 12, marginBottom: 8 }}>Start Time (HH:MM)</Text>
                <TextInput
                  style={{ backgroundColor: '#1c1c1e', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 }}
                  value={gymStartTimeInput}
                  onChangeText={setGymStartTimeInput}
                  placeholder="10:00"
                  placeholderTextColor="#5a5a5f"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View>
                <Text style={{ color: '#8e8e93', fontSize: 12, marginBottom: 8 }}>End Time (HH:MM)</Text>
                <TextInput
                  style={{ backgroundColor: '#1c1c1e', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 }}
                  value={gymEndTimeInput}
                  onChangeText={setGymEndTimeInput}
                  placeholder="11:00"
                  placeholderTextColor="#5a5a5f"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: '#a599ff', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 }}
                onPress={handleSaveGymTime}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Save Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { 
        flex: 1, 
        backgroundColor: colors.background // Matched exactly to the screenshot's deep dark hue
      },
      
      /* 1. Header */
      header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        backgroundColor: colors.background,
      },
      headerLeft: {
        width: 40,
        alignItems: 'flex-start',
      },
      headerTitle: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 18,
        color: colors.textPrimary,
      },
      headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
      },
      iconBtn: {
        padding: 8,
      },
      profileBtn: {
        padding: 4,
        marginLeft: 8,
      },
      profileCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#a599ff', // matches screenshot avatar color
        justifyContent: 'center',
        alignItems: 'center',
      },
      profileInitials: {
        color: '#000',
        fontFamily: FONT_FAMILY.bold,
        fontSize: 14,
      },
      profileImage: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
      },

      /* 1.5 Sub Header */
      subHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: colors.background,
      },
      monthSelector: {
        flexDirection: 'row',
        alignItems: 'center',
      },
      monthText: {
        fontFamily: FONT_FAMILY.bold, // screenshot shows bold title for month
        fontSize: 28,
        color: colors.textPrimary,
      },
      viewSelector: {
        flexDirection: 'row',
        backgroundColor: '#1E1E1E', // dark grey pill background
        borderRadius: 8,
        padding: 2,
      },
      viewSelectorBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
      },
      viewSelectorBtnActive: {
        backgroundColor: '#a599ff', // Active purple pill
      },
      viewSelectorText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 13,
        color: colors.textMuted,
      },
      viewSelectorTextActive: {
        color: '#000',
        fontFamily: FONT_FAMILY.bold,
      },

      /* Month Dropdown */
      monthDropdownContainer: {
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingBottom: 16,
        zIndex: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 10,
      },
      monthChipsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 8,
      },
      monthChip: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: colors.surface,
      },
      monthChipActive: {
        backgroundColor: colors.surface2,
      },
      monthChipText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 14,
        color: colors.textPrimary,
      },
      monthChipTextActive: {
        color: colors.accentPrimary,
      },

      /* 2. Date Selector (Week Strip) */
      weekStrip: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        paddingHorizontal: 24, 
        marginBottom: 16,
        paddingTop: 8,
        backgroundColor: colors.background,
      },
      dayCol: { 
        alignItems: 'center', 
        gap: 8 
      },
      dayLetter: { 
        fontSize: 12, 
        color: colors.textMuted, 
        fontFamily: FONT_FAMILY.body,
        fontWeight: '500'
      },
      dayLetterActive: { 
        color: '#fff',
        fontFamily: FONT_FAMILY.bold,
      },
      dayPill: { 
        width: 38, 
        height: 44, 
        borderRadius: 12, 
        backgroundColor: 'transparent', 
        alignItems: 'center', 
        justifyContent: 'center', 
        overflow: 'hidden' 
      },
      dayPillActive: { 
        backgroundColor: '#a599ff', 
      },
      dayNum: { 
        fontSize: 18, 
        color: colors.textPrimary, 
        fontFamily: FONT_FAMILY.body 
      },
      dayNumActive: { 
        color: '#000', 
        fontFamily: FONT_FAMILY.bold 
      },

      /* 3. Timeline */
      timelineScroll: {
        flex: 1,
        backgroundColor: colors.background,
      },
      timelineInner: {
        height: 24 * HOUR_HEIGHT + 100, // 24 hours + padding
        position: 'relative',
      },
      hourRow: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: HOUR_HEIGHT,
        flexDirection: 'row',
      },
      hourText: {
        width: 60,
        textAlign: 'center',
        fontFamily: FONT_FAMILY.body,
        fontSize: 12,
        color: colors.textMuted,
        marginTop: -8, // Center text on the line
      },
      hourLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border, // Very subtle grid line
      },
      eventsContainer: {
        position: 'absolute',
        top: 0,
        left: 60, // Right of the hour text
        right: 12,
        bottom: 0,
      },
      eventBlock: {
        position: 'absolute',
        borderRadius: 6,
        padding: 4,
        paddingHorizontal: 8,
        borderLeftWidth: 3,
      },
      eventBlockTitle: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 13,
      },
      eventBlockLocation: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 11,
        opacity: 0.9,
        marginTop: 2,
      },
      currentTimeIndicator: {
        position: 'absolute',
        left: 54, // left edge aligned with line
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10,
      },
      currentTimeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#a599ff', // fixed to purple
        marginLeft: 0,
      },
      currentTimeLine: {
        flex: 1,
        height: 2,
        backgroundColor: '#a599ff', // fixed to purple
      },

      /* 4. FAB */
      fab: {
        position: 'absolute',
        bottom: 110, // moved up above tab bar
        right: 20, // matched with Sara button
        width: 48, // matched with Sara button
        height: 48,
        borderRadius: 24,
        backgroundColor: '#a599ff', // standard purple
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#a599ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
      },

      /* Modal */
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      },
      modalContent: {
        backgroundColor: colors.surface,
        width: '100%',
        borderRadius: 8,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 10,
      },
      modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
      },
      modalTitle: {
        fontFamily: FONT_FAMILY.title,
        fontSize: 24,
        color: colors.textPrimary,
        marginBottom: 16,
      },
      modalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 16,
      },
      modalText: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 16,
        color: colors.textPrimary,
      },

      /* Week View Styles */
      weekHourAxis: { width: 40, position: 'relative' },
      weekHourText: { fontSize: 10, color: colors.textMuted, position: 'absolute', top: -7, left: 4 },
      weekGrid: { flex: 1, flexDirection: 'row' },
      weekCol: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.border, position: 'relative' },
      weekColToday: { backgroundColor: 'rgba(165,153,255,0.04)' },
      weekHourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
      weekCurrentTimeTick: { position: 'absolute', left: 0, width: 12, height: 2, backgroundColor: colors.accentPrimary, zIndex: 10 },
      weekEventBlock: { position: 'absolute', left: 1, right: 1, borderRadius: 4, padding: 2, borderLeftWidth: 2, overflow: 'hidden' },
      weekEventTitle: { fontSize: 9, fontWeight: '600', fontFamily: FONT_FAMILY.medium },
      
      /* Month View Styles */
      monthViewContainer: { flex: 1 },
      monthEventListContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
      monthEventListHeader: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 12, letterSpacing: 1 },
      monthEventRow: { backgroundColor: '#1c1c1e', padding: 12, borderRadius: 12, marginBottom: 8, borderLeftWidth: 3 },
      monthEventTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
      monthEventTime: { fontSize: 12, color: colors.textSecondary },
      emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 16, textAlign: 'center' },
    });
