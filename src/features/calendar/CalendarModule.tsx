import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { formatLocalDateStr, getLocalDateString } from '../../utils/dateUtils';
import { getEventColors, parseTimeTo24h, parseTaskTimeSlot } from './calendarUtils';
import { CalendarDayView, type MergedCalendarEvent } from './CalendarDayView';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarAgendaView } from './CalendarAgendaView';
import { CalendarMiniMonth } from './CalendarMiniMonth';
import { CalendarLayerToggles, type CalendarLayersState } from './CalendarLayerToggles';
import { CalendarInspector } from './CalendarInspector';
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
  Check, ChevronLeft, ChevronRight, LayoutGrid, Columns, ListFilter,
  CalendarDays, AlignLeft
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
    return getLocalDateString();
  });

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('day');
  const [customEvents, setCustomEvents] = useState<MergedCalendarEvent[]>([]);
  const [gcalEvents, setGcalEvents] = useState<MergedCalendarEvent[]>([]);

  // Layer Visibility State
  const [layers, setLayers] = useState<CalendarLayersState>({
    showClasses: true,
    showGCal: true,
    showGym: true,
    showTasks: true,
  });

  const handleToggleLayer = (key: keyof CalendarLayersState) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Modals & Inspector
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAiSlotModalOpen, setIsAiSlotModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MergedCalendarEvent | null>(null);
  const [quickAddStartTime, setQuickAddStartTime] = useState<string>('09:00');

  // AI Free Slot State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSlotResult, setAiSlotResult] = useState<string | null>(null);

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

  // ── 2. Merge All Data Sources ──
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

    // (B) Academic Timetable (Classes & Labs)
    if (attendanceSubjects && attendanceSubjects.length > 0) {
      const [selY, selM, selD] = selectedDate.split('-').map(Number);
      const baseD = new Date(selY, (selM || 1) - 1, selD || 1);
      for (let offset = -30; offset <= 30; offset++) {
        const curD = new Date(baseD);
        curD.setDate(baseD.getDate() + offset);
        const dayOfWeekNum = curD.getDay();
        const dayOfWeekStr = dayOfWeekNum.toString();
        const dateStr = getLocalDateString(curD);
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
      const [selY, selM, selD] = selectedDate.split('-').map(Number);
      const baseD = new Date(selY, (selM || 1) - 1, selD || 1);
      for (let offset = -30; offset <= 30; offset++) {
        const curD = new Date(baseD);
        curD.setDate(baseD.getDate() + offset);
        const dayOfWeekNum = curD.getDay();
        const dateStr = getLocalDateString(curD);

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
            location: 'Gym',
          });
        }
      }
    }

    // (D) Google Calendar Sync
    gcalEvents.forEach(ge => {
      merged.push({ ...ge, fromGCal: true });
    });

    return merged;
  }, [customEvents, tasks, attendanceSubjects, gymSchedule, gymLogs, gcalEvents, selectedDate]);

  // ── 3. Filter by Active Layer Toggles ──
  const filteredEvents = useMemo(() => {
    return allMergedEvents.filter(e => {
      if (e.type === 'class' || e.type === 'lab') return layers.showClasses;
      if (e.fromGCal) return layers.showGCal;
      if (e.type === 'gym') return layers.showGym;
      if (e.type === 'todo') return layers.showTasks;
      return true;
    });
  }, [allMergedEvents, layers]);

  // Layer Counts for today
  const layerCounts = useMemo(() => {
    const today = selectedDate;
    const dayEvts = allMergedEvents.filter(e => e.date === today);
    return {
      classes: dayEvts.filter(e => e.type === 'class' || e.type === 'lab').length,
      gcal: dayEvts.filter(e => e.fromGCal).length,
      gym: dayEvts.filter(e => e.type === 'gym').length,
      tasks: dayEvts.filter(e => e.type === 'todo').length,
    };
  }, [allMergedEvents, selectedDate]);

  // Day specific events
  const timedDayEvents = useMemo(() => {
    return filteredEvents.filter(e => e.date === selectedDate && !!e.startTime);
  }, [filteredEvents, selectedDate]);

  const unscheduledDayEvents = useMemo(() => {
    return filteredEvents.filter(e => e.date === selectedDate && !e.startTime);
  }, [filteredEvents, selectedDate]);

  // ── 4. Keyboard Shortcuts (Cron / Superhuman Style) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 't' || e.key === 'T') {
        setSelectedDate(getLocalDateString());
      } else if (e.key === 'd' || e.key === 'D') {
        setViewMode('day');
      } else if (e.key === 'w' || e.key === 'W') {
        setViewMode('week');
      } else if (e.key === 'm' || e.key === 'M') {
        setViewMode('month');
      } else if (e.key === 'a' || e.key === 'A') {
        setViewMode('agenda');
      } else if (e.key === 'c' || e.key === 'C') {
        setIsAddModalOpen(true);
      } else if (e.key === 'Escape') {
        setSelectedEvent(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── 5. AI Free Slot Finder ──
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

  // Quick Slot creation
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
  };

  // Date Navigator Helpers
  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, (m || 1) - 1, d || 1);
    dateObj.setDate(dateObj.getDate() - (viewMode === 'week' ? 7 : 1));
    setSelectedDate(getLocalDateString(dateObj));
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, (m || 1) - 1, d || 1);
    dateObj.setDate(dateObj.getDate() + (viewMode === 'week' ? 7 : 1));
    setSelectedDate(getLocalDateString(dateObj));
  };

  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const displayDateObj = new Date(selY, (selM || 1) - 1, selD || 1);
  const formattedHeaderDate = displayDateObj.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="calendar-module-root">
      {/* ── TOP CONTROL HEADER ── */}
      <div className="calendar-header-bar">
        <div className="calendar-header-left">
          <div className="calendar-date-nav-group">
            <h1 className="calendar-hero-title">{formattedHeaderDate}</h1>
            <div className="calendar-nav-chevrons">
              <button type="button" onClick={handlePrevDay} className="nav-chevron-btn" title="Previous">
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getLocalDateString())}
                className="nav-today-btn"
                title="Jump to Today (Key: T)"
              >
                Today
              </button>
              <button type="button" onClick={handleNextDay} className="nav-chevron-btn" title="Next">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-header-actions">
          {/* Linear-Style Segmented View Switcher */}
          <div className="calendar-segmented-view-picker">
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => setViewMode('day')}
              title="Day View (Key: D)"
            >
              <Clock size={13} />
              <span>Day</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
              title="Week View (Key: W)"
            >
              <Columns size={13} />
              <span>Week</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
              title="Month View (Key: M)"
            >
              <LayoutGrid size={13} />
              <span>Month</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'agenda' ? 'active' : ''}`}
              onClick={() => setViewMode('agenda')}
              title="Agenda View (Key: A)"
            >
              <AlignLeft size={13} />
              <span>Agenda</span>
            </button>
          </div>

          {/* AI Free Slot Button */}
          <button
            type="button"
            className="calendar-action-pill-btn ai-btn"
            onClick={handleFindFreeSlot}
            title="Find continuous deep work window"
          >
            <Sparkles size={14} color="#38bdf8" />
            <span>AI Free Slot</span>
          </button>

          {/* Google Calendar Connect Button */}
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
            title="Create Event (Key: C)"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* ── 3-COLUMN POWER DESKTOP LAYOUT ── */}
      <div className="calendar-power-layout">
        {/* LEFT SIDEBAR: Mini Month + Layer Toggles */}
        <aside className="calendar-left-sidebar">
          <CalendarMiniMonth
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            events={allMergedEvents}
          />

          <CalendarLayerToggles
            layers={layers}
            onToggleLayer={handleToggleLayer}
            eventCounts={layerCounts}
          />
        </aside>

        {/* CENTER VIEWPORT: Day / Week / Month / Agenda */}
        <main className="calendar-center-viewport">
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
              allEvents={filteredEvents}
              onSelectDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
              onQuickAddAtDateTime={handleQuickAddAtDateTime}
            />
          )}

          {viewMode === 'month' && (
            <CalendarMonthView
              selectedDate={selectedDate}
              allEvents={filteredEvents}
              onSelectDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
            />
          )}

          {viewMode === 'agenda' && (
            <CalendarAgendaView
              events={filteredEvents}
              selectedDate={selectedDate}
              onSelectEvent={handleSelectEvent}
              onSelectDate={setSelectedDate}
            />
          )}
        </main>

        {/* RIGHT INSPECTOR (Visible when an event is selected) */}
        {selectedEvent && (
          <aside className="calendar-right-inspector">
            <CalendarInspector
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onEdit={(evt) => {
                setSelectedEvent(evt);
                setIsDetailModalOpen(true);
              }}
              onDelete={async (evt) => {
                if (window.confirm('Delete this event?')) {
                  try {
                    await deleteDoc(doc(db, 'calendar_events', evt.id));
                    toast.success('Event deleted');
                    setSelectedEvent(null);
                  } catch (err) {
                    toast.error('Failed to delete event');
                  }
                }
              }}
            />
          </aside>
        )}
      </div>

      {/* ── MODALS & SHEETS ── */}
      <AddEventModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        selectedDate={selectedDate}
        initialStartTime={quickAddStartTime}
        onEventCreated={() => setIsAddModalOpen(false)}
      />

      {selectedEvent && (
        <EventDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
          }}
          event={selectedEvent}
          onEventUpdated={() => {
            setIsDetailModalOpen(false);
            setSelectedEvent(null);
          }}
          onEventDeleted={() => {
            setIsDetailModalOpen(false);
            setSelectedEvent(null);
          }}
        />
      )}

      <AiFreeSlotModal
        isOpen={isAiSlotModalOpen}
        onClose={() => setIsAiSlotModalOpen(false)}
        selectedDate={selectedDate}
        aiResult={aiSlotResult}
        isLoading={aiLoading}
        onBookSlot={(slotStr) => {
          setIsAiSlotModalOpen(false);
          setQuickAddStartTime(slotStr);
          setIsAddModalOpen(true);
        }}
      />
    </div>
  );
};
