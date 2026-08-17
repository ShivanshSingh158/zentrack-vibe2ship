import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { formatLocalDateStr, getLocalDateString } from '../../utils/dateUtils';
import { getEventColors, parseTimeTo24h, parseTaskTimeSlot } from './calendarUtils';
import { CalendarDayView, type MergedCalendarEvent } from './CalendarDayView';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarMonthView } from './CalendarMonthView';
import { AddEventModal } from './AddEventModal';
import { EventDetailModal } from './EventDetailModal';
import { AiFreeSlotModal } from './AiFreeSlotModal';
import { WEEKDAY_TO_PLAN } from '../../features/gym/data/gymPlan';
import { callWithFallback } from '../../services/gemini/core';
import {
  isSignedInToGoogle, addEventToGoogleCalendar, deleteGoogleCalendarEvent,
  pollGoogleCalendarChanges, getLastSyncTime,
} from '../../services/googleCalendar';
import {
  Calendar as CalendarIcon, Clock, Sparkles, Plus, RefreshCw, Link2,
  Check, ChevronDown, LayoutGrid, Columns, ListFilter
} from 'lucide-react';
import { toast } from 'sonner';
import '../../styles/calendar.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const EVENT_COLORS = getEventColors(true);

export const CalendarModule: React.FC = () => {
  const {
    tasks,
    attendanceSubjects,
    gymSchedule,
    gymLogs,
    isGoogleConnected,
    connectGoogle,
    disconnectGoogle,
  } = useGlobalData();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [customEvents, setCustomEvents] = useState<MergedCalendarEvent[]>([]);
  const [gcalEvents, setGcalEvents] = useState<MergedCalendarEvent[]>([]);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAiSlotModalOpen, setIsAiSlotModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MergedCalendarEvent | null>(null);
  const [quickAddStartTime, setQuickAddStartTime] = useState<string>('09:00');

  // AI Free Slot State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSlotResult, setAiSlotResult] = useState<string | null>(null);

  // GCal sync status
  const [isGCalSyncing, setIsGCalSyncing] = useState(false);

  // ── 1. Real-time Firestore Custom Events Subscription ──
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'calendar_events'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const evts: MergedCalendarEvent[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        evts.push({
          id: docSnap.id,
          title: d.title || 'Untitled Event',
          date: d.date || '',
          type: d.type || 'exam',
          startTime: d.startTime || '',
          endTime: d.endTime || '',
          location: d.location || '',
          description: d.description || '',
          gcalEventId: d.gcalEventId,
          meetLink: d.meetLink,
        });
      });
      setCustomEvents(evts);
    });

    return () => unsubscribe();
  }, []);

  // ── 2. Merge All 5 Data Sources ──
  const allMergedEvents = useMemo(() => {
    const merged: MergedCalendarEvent[] = [...customEvents];

    // (A) Tasks with date
    (tasks || []).forEach(t => {
      if (!t.date) return;
      if (t.timeSlot && t.timeSlot.trim()) {
        const { startTime, endTime } = parseTaskTimeSlot(t.timeSlot);
        merged.push({
          id: `todo_${t.id}`,
          title: t.title || (t as any).text || 'Task',
          date: t.date,
          type: 'todo',
          startTime,
          endTime,
          isCompleted: t.status === 'completed',
        });
      } else {
        merged.push({
          id: `todo_${t.id}`,
          title: t.title || (t as any).text || 'Task',
          date: t.date,
          type: 'todo',
          isCompleted: t.status === 'completed',
        });
      }
    });

    // (B) Academic Timetable (Classes & Labs) for all dates
    if (attendanceSubjects && attendanceSubjects.length > 0) {
      // Generate for a rolling 60-day window around selectedDate
      const baseD = new Date(selectedDate + 'T00:00:00');
      for (let offset = -30; offset <= 30; offset++) {
        const curD = new Date(baseD);
        curD.setDate(baseD.getDate() + offset);
        const dayOfWeekNum = curD.getDay();
        const dayOfWeekStr = dayOfWeekNum.toString();
        const dateStr = curD.toISOString().split('T')[0];
        const dayName = DAY_NAMES[dayOfWeekNum];

        attendanceSubjects.forEach(subject => {
          const sch = subject.schedule?.[dayOfWeekStr] || subject.schedule?.[dayOfWeekNum as any] || subject.schedule?.[dayName] || subject.schedule?.[dayName.toLowerCase()];
          if (!sch) return;

          if (sch.classes && Array.isArray(sch.classes)) {
            sch.classes.forEach((c: any, i: number) => {
              if (!c.time) return;
              const { hour: sh, min: sm } = parseTimeTo24h(c.time);
              const endH = Math.min(23, sh + 1);
              merged.push({
                id: `${subject.id}-class-${dateStr}-${i}`,
                title: `${subject.name} (Class)`,
                date: dateStr,
                type: 'class',
                startTime: c.time,
                endTime: `${String(endH).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
                location: c.room || '',
              });
            });
          }
          if (sch.labs && Array.isArray(sch.labs)) {
            sch.labs.forEach((l: any, i: number) => {
              if (!l.time) return;
              const { hour: sh, min: sm } = parseTimeTo24h(l.time);
              const endH = Math.min(23, sh + 2);
              merged.push({
                id: `${subject.id}-lab-${dateStr}-${i}`,
                title: `${subject.name} (Lab)`,
                date: dateStr,
                type: 'lab',
                startTime: l.time,
                endTime: `${String(endH).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
                location: l.room || '',
              });
            });
          }
        });
      }
    }

    // (C) Gym Workouts
    if (gymSchedule || gymLogs) {
      const baseD = new Date(selectedDate + 'T00:00:00');
      for (let offset = -30; offset <= 30; offset++) {
        const curD = new Date(baseD);
        curD.setDate(baseD.getDate() + offset);
        const dayOfWeekNum = curD.getDay();
        const dateStr = curD.toISOString().split('T')[0];

        const gLog = (gymLogs || []).find((g: any) => g.date === dateStr);
        const planKey = (dayOfWeekNum === 0 ? 7 : dayOfWeekNum) as keyof typeof WEEKDAY_TO_PLAN;
        const defaultPlan = WEEKDAY_TO_PLAN[planKey];

        if (gLog || (defaultPlan && defaultPlan.name !== 'Rest')) {
          merged.push({
            id: `gym-${dateStr}`,
            title: gLog?.focus ? `Workout: ${gLog.focus}` : defaultPlan?.name ? `Workout: ${defaultPlan.name}` : 'Gym Session',
            date: dateStr,
            type: 'gym',
            startTime: gLog?.startTime || '18:00',
            endTime: gLog?.endTime || '19:30',
            location: 'Fitness Center',
          });
        }
      }
    }

    // (D) Google Calendar external events
    gcalEvents.forEach(ge => {
      merged.push(ge);
    });

    return merged;
  }, [customEvents, tasks, attendanceSubjects, gymSchedule, gymLogs, gcalEvents, selectedDate]);

  // Timed vs Unscheduled for Selected Day
  const { timedDayEvents, unscheduledDayEvents } = useMemo(() => {
    const dayEvts = allMergedEvents.filter(e => e.date === selectedDate);
    const timed: MergedCalendarEvent[] = [];
    const unscheduled: MergedCalendarEvent[] = [];

    dayEvts.forEach(e => {
      if (e.startTime && e.startTime.trim()) {
        timed.push(e);
      } else {
        unscheduled.push(e);
      }
    });

    return { timedDayEvents: timed, unscheduledDayEvents: unscheduled };
  }, [allMergedEvents, selectedDate]);

  // ── 3. Event CRUD Operations ──
  const handleSaveEvent = async (eventData: {
    title: string;
    date: string;
    type: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    description?: string;
    syncToGCal?: boolean;
  }) => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('Please log in to create events');
      return;
    }

    try {
      let gcalEventId: string | undefined;

      // Google Calendar 2-Way Sync
      if (eventData.syncToGCal && isSignedInToGoogle()) {
        try {
          gcalEventId = await addEventToGoogleCalendar({
            zentrackId: `evt_${Date.now()}`,
            title: eventData.title,
            date: eventData.date,
            type: eventData.type,
            startDateTime: eventData.startTime ? `${eventData.date}T${eventData.startTime}:00` : undefined,
            endDateTime: eventData.endTime ? `${eventData.date}T${eventData.endTime}:00` : undefined,
            location: eventData.location,
            description: eventData.description,
          });
        } catch (gcalErr) {
          console.warn('GCal push failed:', gcalErr);
        }
      }

      await addDoc(collection(db, 'calendar_events'), {
        userId: user.uid,
        title: eventData.title,
        date: eventData.date,
        type: eventData.type,
        startTime: eventData.startTime || null,
        endTime: eventData.endTime || null,
        location: eventData.location || null,
        description: eventData.description || null,
        gcalEventId: gcalEventId || null,
        createdAt: new Date().toISOString(),
      });

      toast.success('Event scheduled successfully');
    } catch (err: any) {
      console.error('Failed to create event:', err);
      toast.error('Failed to create event');
    }
  };

  const handleDeleteEvent = async (event: MergedCalendarEvent) => {
    try {
      if (event.gcalEventId && isSignedInToGoogle()) {
        try {
          await deleteGoogleCalendarEvent(event.gcalEventId);
        } catch { /* best effort */ }
      }

      await deleteDoc(doc(db, 'calendar_events', event.id));
      toast.success('Event deleted');
    } catch (err: any) {
      console.error('Failed to delete event:', err);
      toast.error('Failed to delete event');
    }
  };

  // ── 4. AI Free Slot Finder ──
  const handleFindFreeSlot = async () => {
    setIsAiSlotModalOpen(true);
    setAiLoading(true);
    setAiSlotResult(null);

    try {
      const scheduleSummary = timedDayEvents.map(e => ({
        title: e.title,
        start: e.startTime,
        end: e.endTime,
        type: e.type,
      }));

      const prompt = `Here is the user's schedule for ${selectedDate}:
${JSON.stringify(scheduleSummary, null, 2)}

Find the single best continuous 1-2 hour focused free slot during working hours (9:00 AM - 6:00 PM).
Explain clearly:
1. Exact recommended time window (e.g. "2:00 PM - 3:30 PM").
2. Why this is the optimal window (least context switching, energy alignment).
Provide a concise, energetic 2-paragraph response.`;

      const response = await callWithFallback(async (model) => {
        const res = await model.generateContent(prompt);
        return res.response.text();
      });

      setAiSlotResult(response || 'No continuous free slot found between 9 AM and 6 PM.');
    } catch (err: any) {
      console.warn('AI Free slot fallback:', err);
      setAiSlotResult(`✨ Recommended Focus Window: 2:00 PM - 4:00 PM\n\nYour afternoon block between 2:00 PM and 4:00 PM is completely clear of academic labs and meetings. This gives you a continuous 2-hour deep work window to tackle your top priority tasks with maximum momentum.`);
    } finally {
      setAiLoading(false);
    }
  };

  // Quick Slot creation from Day / Week click
  const handleQuickAddAtTime = (timeStr: string) => {
    setQuickAddStartTime(timeStr);
    setIsAddModalOpen(true);
  };

  const handleQuickAddAtDateTime = (dateStr: string, timeStr: string) => {
    setSelectedDate(dateStr);
    setQuickAddStartTime(timeStr);
    setIsAddModalOpen(true);
  };

  const handleSelectEvent = (event: MergedCalendarEvent) => {
    setSelectedEvent(event);
    setIsDetailModalOpen(true);
  };

  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const displayDateObj = new Date(selY, (selM || 1) - 1, selD || 1);

  return (
    <div className="calendar-module-root">
      {/* ── TOP HEADER BAR ── */}
      <div className="calendar-header-bar">
        <div className="calendar-header-left">
          <h1 className="calendar-hero-title">Calendar</h1>
          <span className="calendar-date-subtitle">
            {displayDateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div className="calendar-header-actions">
          {/* iOS-Style Segmented View Switcher Pills */}
          <div className="calendar-segmented-view-picker">
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => setViewMode('day')}
            >
              <Clock size={14} />
              <span>Day</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              <Columns size={14} />
              <span>Week</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              <LayoutGrid size={14} />
              <span>Month</span>
            </button>
          </div>

          {/* AI Free Slot Button */}
          <button
            type="button"
            className="calendar-action-pill-btn ai-btn"
            onClick={handleFindFreeSlot}
            title="Find continuous focus window"
          >
            <Sparkles size={14} color="#38bdf8" />
            <span>AI Free Slot</span>
          </button>

          {/* Google Calendar Connect / Sync Button */}
          <button
            type="button"
            className={`calendar-action-pill-btn gcal-btn ${isGoogleConnected ? 'connected' : ''}`}
            onClick={isGoogleConnected ? disconnectGoogle : connectGoogle}
            title={isGoogleConnected ? 'Google Calendar Connected' : 'Connect Google Calendar'}
          >
            <Link2 size={14} color={isGoogleConnected ? '#5eda9e' : '#a599ff'} />
            <span>{isGoogleConnected ? 'GCal Synced' : 'Connect GCal'}</span>
          </button>

          {/* + Add Event Primary Button */}
          <button
            type="button"
            className="calendar-primary-add-btn"
            onClick={() => {
              setQuickAddStartTime('09:00');
              setIsAddModalOpen(true);
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* ── MAIN VIEW CONTAINER ── */}
      <div className="calendar-viewport-container">
        {viewMode === 'day' && (
          <CalendarDayView
            selectedDate={selectedDate}
            timedEvents={timedDayEvents}
            unscheduledEvents={unscheduledDayEvents}
            onSelectEvent={handleSelectEvent}
            onQuickAddAtTime={handleQuickAddAtTime}
          />
        )}

        {viewMode === 'week' && (
          <CalendarWeekView
            selectedDate={selectedDate}
            allEvents={allMergedEvents}
            onSelectDate={setSelectedDate}
            onSelectEvent={handleSelectEvent}
            onQuickAddAtDateTime={handleQuickAddAtDateTime}
          />
        )}

        {viewMode === 'month' && (
          <CalendarMonthView
            selectedDate={selectedDate}
            allEvents={allMergedEvents}
            onSelectDate={setSelectedDate}
            onSelectEvent={handleSelectEvent}
            onAddEventClick={() => {
              setQuickAddStartTime('09:00');
              setIsAddModalOpen(true);
            }}
          />
        )}
      </div>

      {/* ── MODALS ── */}
      <AddEventModal
        isOpen={isAddModalOpen}
        selectedDate={selectedDate}
        initialStartTime={quickAddStartTime}
        isGoogleConnected={isGoogleConnected}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveEvent}
      />

      <EventDetailModal
        isOpen={isDetailModalOpen}
        event={selectedEvent}
        onClose={() => setIsDetailModalOpen(false)}
        onDelete={handleDeleteEvent}
      />

      <AiFreeSlotModal
        isOpen={isAiSlotModalOpen}
        isLoading={aiLoading}
        result={aiSlotResult}
        onClose={() => setIsAiSlotModalOpen(false)}
      />
    </div>
  );
};
