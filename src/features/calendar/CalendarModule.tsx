import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Plus, AlertTriangle, Clock, ExternalLink, Link2, Link2Off, RefreshCw, Zap, AlertCircle, Wand2, Menu, Search, Settings, HelpCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/calendar.css';
import { autoScheduleDay } from '../../services/gemini';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  initGoogleCalendar, isSignedInToGoogle, signInWithGoogle, signOutGoogle,
  addEventToGoogleCalendar, deleteGoogleCalendarEvent, pollGoogleCalendarChanges,
  getLastSyncTime,
} from '../../services/googleCalendar';
import { EventPopover } from './EventPopover';
const GC_CLIENT_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID &&
  import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID !== 'YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE';

// Poll interval: 2 minutes
const POLL_INTERVAL_MS = 2 * 60 * 1000;


interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'todo' | 'job' | 'goal' | 'exam' | 'assignment_due' | 'holiday' | 'viva' | 'submission' | 'gcal';
  isCompleted?: boolean;
  sourceCollection?: string;
  sourceId?: string;
  gcalEventId?: string; // GCal event ID for events synced TO Google Calendar
  fromGCal?: boolean;  // true for events pulled FROM Google Calendar
  startTime?: string;  // e.g. "14:00"
  endTime?: string;    // e.g. "15:00"
  location?: string;
  description?: string;
  guests?: string[];
  meetLink?: string;
}

export const EVENT_COLORS: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  exam: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Exam', icon: '📝' },
  assignment_due: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', label: 'Assignment', icon: '📋' },
  holiday: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Holiday', icon: '🌴' },
  viva: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Viva', icon: '🎤' },
  submission: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Submission', icon: '📤' },
  todo: { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', label: 'Task', icon: '✅' },
  job: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', label: 'Interview', icon: '💼' },
  goal: { color: '#ec4899', bg: 'rgba(236,72,153,0.1)', label: 'Deadline', icon: '🎯' },
  gcal: { color: '#4285f4', bg: 'rgba(66,133,244,0.1)', label: 'Google Cal', icon: '📅' },
};

export const CalendarModule = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [gcalEvents, setGcalEvents] = useState<CalendarEvent[]>([]); // Events pulled FROM Google Calendar
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('day');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<string>('exam');
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(Object.keys(EVENT_COLORS)));
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [isMyCalendarsExpanded, setIsMyCalendarsExpanded] = useState(true);
  const [isOtherCalendarsExpanded, setIsOtherCalendarsExpanded] = useState(true);

  // ── Google Calendar sync state ────────────────────────────────────────────────
  const [gcLoading, setGcLoading] = useState(false);
  const [dragSelection, setDragSelection] = useState<{
    isDragging: boolean;
    dateStr: string;
    startMins: number;
    currentMins: number;
    popoverPos: { x: number; y: number } | null;
    existingEvent?: CalendarEvent;
  } | null>(null);
  const dragSelectionRef = useRef(dragSelection);
  useEffect(() => { dragSelectionRef.current = dragSelection; }, [dragSelection]);

  const { userPreferences, isGoogleConnected: gcConnected, connectGoogle, disconnectGoogle } = useGlobalData();
  const [gcSyncing, setGcSyncing] = useState(false);
  const [gcApiError, setGcApiError] = useState<string | null>(null); // 'not_enabled' | error msg
  const [lastSynced, setLastSynced] = useState<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track gcalEventIds for events we've pushed: zentrackId -> gcalId
  const gcalIdMapRef = useRef<Record<string, string>>({});

  // ── GCal Polling ──────────────────────────────────────────────────────────────
  const runPoll = useCallback(async () => {
    if (!isSignedInToGoogle()) return;
    try {
      setGcSyncing(true);
      const { added, deleted } = await pollGoogleCalendarChanges();

      // Remove any deleted GCal events from our gcalEvents list
      if (deleted.length > 0) {
        setGcalEvents(prev => prev.filter(e => !deleted.includes(e.gcalEventId ?? '')));
      }

      // Add newly discovered external GCal events
      if (added.length > 0) {
        const newEvents: CalendarEvent[] = added.map(item => {
          const date = item.start.date ?? item.start.dateTime?.split('T')[0] ?? '';
          let startTime, endTime;
          if (item.start.dateTime && item.end.dateTime) {
            const startD = new Date(item.start.dateTime);
            const endD = new Date(item.end.dateTime);
            startTime = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
            endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;
          }
          return {
            id: `gcal_${item.id}`,
            gcalEventId: item.id,
            title: item.summary ?? '(No title)',
            date,
            type: 'gcal' as const,
            fromGCal: true,
            startTime,
            endTime,
            description: item.description,
            location: (item as any).location,
          };
        }).filter(e => !!e.date);

        setGcalEvents(prev => {
          const existingIds = new Set(prev.map(e => e.gcalEventId));
          const fresh = newEvents.filter(e => !existingIds.has(e.gcalEventId));
          if (fresh.length > 0) {
             window.dispatchEvent(new CustomEvent('gcal-events-added', { detail: added }));
          }
          return [...prev, ...fresh];
        });
      }

      setLastSynced(getLastSyncTime());
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('not enabled') || msg.includes('Enable it')) {
        setGcApiError('not_enabled');
        stopPolling();
      } else if (msg.includes('401') || msg.includes('invalid_grant')) {
        setGcConnected(false);
        stopPolling();
      }
      console.error('[GCal Poll]', err);
    } finally {
      setGcSyncing(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    runPoll(); // immediate first poll
    pollTimerRef.current = setInterval(runPoll, POLL_INTERVAL_MS);
  }, [runPoll]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Start/stop polling based on connection state
  useEffect(() => {
    if (gcConnected) {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [gcConnected, startPolling, stopPolling]);

  // ── Connect ───────────────────────────────────────────────────────────────────
  const handleGoogleConnect = async () => {
    setGcLoading(true);
    setGcApiError(null);
    try {
      await connectGoogle();
      toast.success('✅ Connected! Auto-syncing with Google Calendar…');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('popup_closed') || msg.includes('access_denied')) {
        toast.error('Google sign-in cancelled.');
      } else {
        toast.error('Google sign-in failed: ' + msg);
      }
    } finally {
      setGcLoading(false);
    }
  };

  const handleGoogleDisconnect = () => {
    disconnectGoogle();
    setGcalEvents([]);
    setGcApiError(null);
    gcalIdMapRef.current = {};
    toast.info('Disconnected from Google Calendar');
  };

  // ── Auto-push event to GCal when added ────────────────────────────────────────
  const pushToGCal = useCallback(async (
    zentrackId: string, title: string, date: string, type: string,
    startTime?: string, endTime?: string, location?: string, description?: string, guests?: string[], meetLink?: string
  ) => {
    if (!isSignedInToGoogle()) return;
    try {
      let finalDesc = description || `ZenTrack — ${EVENT_COLORS[type]?.icon ?? ''} ${EVENT_COLORS[type]?.label ?? type}: ${title}`;
      if (meetLink) finalDesc += `\n\nMeet: ${meetLink}`;
      const gcalId = await addEventToGoogleCalendar({
        zentrackId,
        title,
        date,
        type,
        startDateTime: startTime ? `${date}T${startTime}:00` : undefined,
        endDateTime: endTime ? `${date}T${endTime}:00` : undefined,
        location,
        attendees: guests,
        description: finalDesc,
      });
      gcalIdMapRef.current[zentrackId] = gcalId;
      // Persist gcalEventId back to Firestore so we can delete it later
      try {
        await updateDoc(doc(db, 'calendar_events', zentrackId), { gcalEventId: gcalId });
      } catch { /* best effort */ }
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('not enabled') || msg.includes('Enable it')) {
        setGcApiError('not_enabled');
      }
      console.error('[GCal push]', err);
    }
  }, []);

  // ── Manual export (side panel button) ────────────────────────────────────────
  const [exportingId, setExportingId] = useState<string | null>(null);
  const handleExportEvent = async (ev: CalendarEvent) => {
    if (!isSignedInToGoogle()) {
      setGcConnected(false);
      await handleGoogleConnect();
      if (!isSignedInToGoogle()) return;
    }
    setExportingId(ev.id);
    try {
      const zenId = ev.id.replace(/^(todo_|job_|goal_|assign_)/, '');
      const gcalId = await addEventToGoogleCalendar({
        zentrackId: zenId,
        title: ev.title,
        date: ev.date,
        type: ev.type,
        description: `ZenTrack — ${EVENT_COLORS[ev.type]?.icon ?? ''} ${EVENT_COLORS[ev.type]?.label ?? ev.type}: ${ev.title}`,
      });
      gcalIdMapRef.current[ev.id] = gcalId;
      toast.success(`✅ "${ev.title}" synced to Google Calendar!`);
    } catch (err: any) {
      const msg = err?.message ?? 'unknown';
      if (msg.includes('not enabled') || msg.includes('Enable it')) {
        setGcApiError('not_enabled');
        toast.error('Google Calendar API not enabled. See the banner above.');
      } else if (msg.includes('401') || msg.includes('invalid_grant')) {
        setGcConnected(false);
        toast.error('Session expired — please reconnect.');
      } else {
        toast.error('Sync failed: ' + msg);
      }
    } finally {
      setExportingId(null);
    }
  };

  // ── Auto-Schedule Day ────────────────────────────────────────────────────────
  const handleAutoSchedule = async () => {
    setIsAutoScheduling(true);
    toast.info('AI is analyzing your tasks...');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
      const uncompletedTodos = events.filter(e => e.type === 'todo' && e.status !== 'completed');
      if (uncompletedTodos.length === 0) {
        toast.info('No pending tasks to schedule!');
        return;
      }
      
      const allScheduled = allEvents.filter(e => e.date);
      const res = await autoScheduleDay(uncompletedTodos, allScheduled, userPreferences.peakEnergyTime);
      
      if (!res.scheduledTasks || res.scheduledTasks.length === 0) {
        toast.info('AI found no tasks needing scheduling right now.');
        return;
      }

      let count = 0;
      for (const t of res.scheduledTasks) {
        if (t.id && t.date) {
          const rawId = t.id.replace('todo_', '');
          const updateData: any = { date: t.date };
          if (t.time) updateData.timeSlot = t.time;
          await updateDoc(doc(db, 'todos', rawId), updateData);
          count++;
        }
      }
      toast.success(`🪄 AI successfully scheduled ${count} tasks!`);
    } catch (err: any) {
      toast.error('AI Auto-Schedule failed: ' + err.message);
    } finally {
      setIsAutoScheduling(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────────


  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    setIsLoading(true);

    let todosEvents: CalendarEvent[] = [];
    let jobsEvents: CalendarEvent[] = [];
    let goalsEvents: CalendarEvent[] = [];
    let assignmentEvents: CalendarEvent[] = [];
    // Track previous custom event IDs to detect newly added ones for auto-push
    const prevCustomIds = new Set<string>();

    const updateEvents = () => {
      setEvents([...todosEvents, ...jobsEvents, ...goalsEvents, ...assignmentEvents]);
      setIsLoading(false);
    };

    const unsubTodos = onSnapshot(query(collection(db, 'todos'), where('userId', '==', user.uid)), (snap) => {
      todosEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.date) todosEvents.push({ id: `todo_${d.id}`, title: data.text, date: data.date, type: 'todo', isCompleted: data.status === 'completed' });
      });
      updateEvents();
    });

    const unsubJobs = onSnapshot(query(collection(db, 'job_applications'), where('userId', '==', user.uid)), (snap) => {
      jobsEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.interviewDate) jobsEvents.push({ id: `job_${d.id}`, title: `Interview: ${data.company}`, date: data.interviewDate, type: 'job' });
      });
      updateEvents();
    });

    const unsubGoals = onSnapshot(query(collection(db, 'goals'), where('userId', '==', user.uid), where('status', '==', 'active')), (snap) => {
      goalsEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.deadline) goalsEvents.push({ id: `goal_${d.id}`, title: `Deadline: ${data.title}`, date: data.deadline, type: 'goal' });
      });
      updateEvents();
    });

    const unsubAssignments = onSnapshot(query(collection(db, 'assignments'), where('userId', '==', user.uid)), (snap) => {
      assignmentEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.dueDate) assignmentEvents.push({
          id: `assign_${d.id}`, title: `${data.subjectName}: ${data.title}`, date: data.dueDate,
          type: 'assignment_due', isCompleted: data.status === 'submitted' || data.status === 'graded'
        });
      });
      updateEvents();
    });

    // Custom calendar events — auto-push new ones to GCal
    const unsubCustom = onSnapshot(query(collection(db, 'calendar_events'), where('userId', '==', user.uid)), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent & { gcalEventId?: string }));
      setCustomEvents(docs);

      // Auto-push newly added events to Google Calendar
      if (isSignedInToGoogle()) {
        docs.forEach(ev => {
          if (!prevCustomIds.has(ev.id) && prevCustomIds.size > 0 && !ev.gcalEventId) {
            // This is a new event with no gcalEventId — push it
            pushToGCal(ev.id, ev.title, ev.date, ev.type);
          }
          prevCustomIds.add(ev.id);
        });
        // Remove deleted from prevCustomIds
        const currentIds = new Set(docs.map(d => d.id));
        prevCustomIds.forEach(id => { if (!currentIds.has(id)) prevCustomIds.delete(id); });
      } else {
        // Just track IDs
        docs.forEach(ev => prevCustomIds.add(ev.id));
      }
    });

    return () => { unsubTodos(); unsubJobs(); unsubGoals(); unsubAssignments(); unsubCustom(); };
  }, [pushToGCal]);

  const allEvents = useMemo(() => {
    const combined = [...events, ...customEvents, ...gcalEvents];
    return combined.filter(e => visibleTypes.has(e.type) && (!hideCompleted || e.status !== 'completed'));
  }, [events, customEvents, gcalEvents, hideCompleted, visibleTypes]);

  // Upcoming exams countdown
  const upcomingExams = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    return [...events, ...customEvents]
      .filter(e => (e.type === 'exam' || e.type === 'viva') && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3)
      .map(e => {
        const today = new Date(todayStr + 'T00:00:00');
        const examDate = new Date(e.date + 'T00:00:00');
        const daysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...e, daysLeft };
      });
  }, [events, customEvents]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !selectedDayStr) return;
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (newEventType === 'todo') {
        const ref = await addDoc(collection(db, 'todos'), {
          userId: user.uid, title: newEventTitle.trim(), date: selectedDayStr,
          status: 'pending', priority: 'medium', createdAt: Date.now()
        });
        // Auto-push to GCal
        if (isSignedInToGoogle()) {
          pushToGCal(`todo_${ref.id}`, newEventTitle.trim(), selectedDayStr, 'todo').catch(() => {});
        }
      } else {
        const ref = await addDoc(collection(db, 'calendar_events'), {
          userId: user.uid, title: newEventTitle.trim(), date: selectedDayStr, type: newEventType
        });
        // Auto-push to GCal
        if (isSignedInToGoogle()) {
          pushToGCal(ref.id, newEventTitle.trim(), selectedDayStr, newEventType).catch(() => {});
        }
      }
      setNewEventTitle('');
      toast.success(gcConnected ? '✅ Added & synced to Google Calendar!' : 'Added!');
    } catch { toast.error('Failed to add'); }
  };

  const handlePopoverSave = async (data: any) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const type = data.type;
      const col = type === 'todo' ? 'todos' : 'calendar_events';
      const payload: any = {
        title: data.title,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location,
        description: data.description,
        meetLink: data.meetLink,
      };
      if (type === 'todo') {
        payload.status = 'pending';
        payload.priority = 'medium';
      } else {
        payload.type = type;
      }

      let eventId = '';
      if (dragSelection?.existingEvent && !dragSelection.existingEvent.fromGCal) {
         eventId = dragSelection.existingEvent.id;
         const rawId = eventId.startsWith('todo_') ? eventId.replace('todo_', '') : eventId;
         await updateDoc(doc(db, col, rawId), payload);
      } else {
         payload.userId = user.uid;
         payload.createdAt = Date.now();
         const ref = await addDoc(collection(db, col), payload);
         eventId = type === 'todo' ? `todo_${ref.id}` : ref.id;
      }
      
      if (isSignedInToGoogle() && !dragSelection?.existingEvent?.fromGCal) {
        pushToGCal(
          eventId,
          data.title, data.date, type,
          data.startTime, data.endTime, data.location, data.description, [], data.meetLink
        ).catch(() => {});
      }
      setDragSelection(null);
      toast.success(gcConnected ? '✅ Saved & synced!' : 'Saved!');
    } catch { toast.error('Failed to save'); }
  };

  const handleDeleteCustomEvent = async (id: string) => {
    try {
      // Also delete from GCal if we have the gcal event ID
      const gcalId = gcalIdMapRef.current[id];
      if (gcalId && isSignedInToGoogle()) {
        deleteGoogleCalendarEvent(gcalId).catch(err => console.warn('[GCal] Delete failed:', err));
        delete gcalIdMapRef.current[id];
      }

      if (id.startsWith('todo_')) {
        await deleteDoc(doc(db, 'todos', id.replace('todo_', '')));
      } else if (id.startsWith('gcal_')) {
        // Event from GCal — remove from local state and optionally from GCal
        const gcalEventId = id.replace('gcal_', '');
        if (isSignedInToGoogle()) {
          deleteGoogleCalendarEvent(gcalEventId).catch(() => {});
        }
        setGcalEvents(prev => prev.filter(e => e.id !== id));
        toast.success('Removed from Google Calendar');
        return;
      } else {
        // Check if Firestore doc has gcalEventId stored
        const evData = customEvents.find(e => e.id === id);
        const storedGcalId = (evData as any)?.gcalEventId;
        if (storedGcalId && isSignedInToGoogle()) {
          deleteGoogleCalendarEvent(storedGcalId).catch(() => {});
        }
        await deleteDoc(doc(db, 'calendar_events', id));
      }
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const renderTimeGrid = (days: Date[]) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const todayStr = getLocalDateString(new Date());

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, dateStr: string) => {
      // Only left click
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const mins = Math.floor((y / 60) * 60); // 1px = 1min
      const startMins = Math.floor(mins / 15) * 15; // Snap to 15 mins
      
      setDragSelection({
        isDragging: true,
        dateStr,
        startMins,
        currentMins: startMins + 30, // Default 30 min block
        popoverPos: null,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>, dateStr: string) => {
      if (!dragSelectionRef.current?.isDragging || dragSelectionRef.current.dateStr !== dateStr) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, e.clientY - rect.top);
      const mins = Math.floor((y / 60) * 60);
      const currentMins = Math.max(dragSelectionRef.current.startMins + 15, Math.floor(mins / 15) * 15);
      
      setDragSelection(prev => prev ? { ...prev, currentMins } : null);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragSelectionRef.current?.isDragging) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      
      // Calculate popover position
      const rect = e.currentTarget.getBoundingClientRect();
      // Place popover near the dragged block
      const topY = Math.min(dragSelectionRef.current.startMins, dragSelectionRef.current.currentMins);
      const popoverPos = {
        x: rect.width > 400 ? rect.left + rect.width / 2 - 200 : rect.right + 16,
        y: rect.top + topY,
      };

      setDragSelection(prev => prev ? { ...prev, isDragging: false, popoverPos } : null);
    };

    return (
      <div className="gc-content-area">
        {/* Header: Timezone + Day Headers */}
        <div className="gc-grid-header" style={{ alignItems: 'stretch' }}>
          <div className="gc-timezone">GMT+05:30</div>
          <div className="gc-day-headers" style={{ flexDirection: 'column' }}>
            <div style={{ display: 'flex' }}>
              {days.map((d, i) => {
                const isToday = getLocalDateString(d) === todayStr;
                return (
                  <div key={i} className={`gc-day-header-cell ${isToday ? 'today' : ''}`} onClick={() => setSelectedDayStr(p => p === getLocalDateString(d) ? null : getLocalDateString(d))} style={{ cursor: 'pointer' }}>
                    <div className="gc-day-header-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className="gc-day-header-date">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {/* All-day events row */}
            <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {days.map((d, i) => {
                const dateStr = getLocalDateString(d);
                const dayEvents = allEvents.filter(e => e.date === dateStr && !e.startTime);
                return (
                  <div key={i} style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.08)', padding: '2px', minHeight: '24px' }}>
                    {dayEvents.map(ev => {
                      const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
                      return (
                        <div key={ev.id} className="gc-event" style={{
                          position: 'relative', height: '22px', background: cfg.color, color: '#fff', marginBottom: '2px', padding: '2px 6px', left: 'auto', right: 'auto', borderRadius: '4px', fontSize: '11px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                        }}>
                          {ev.title}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Grid */}
        <div className="gc-grid-scroll" data-lenis-prevent>
          <div className="gc-time-axis">
            {hours.map(h => (
              <div key={h} className="gc-time-label">
                {h > 0 ? <span>{h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}</span> : null}
              </div>
            ))}
          </div>

          <div className="gc-grid-columns">
            {/* Background horizontal lines */}
            {hours.map(h => (
              <div key={`line-${h}`} className="gc-hour-line" style={{ top: `${h * 60}px` }} />
            ))}

            {/* Current Time Line (only if today is visible) */}
            {days.some(d => getLocalDateString(d) === todayStr) && (
              <div className="gc-current-time-line" style={{ top: `${(new Date().getHours() * 60) + new Date().getMinutes()}px`, zIndex: 5 }}>
                <div className="gc-current-time-dot" />
              </div>
            )}

            {/* Day columns */}
            {days.map((d, i) => {
              const dateStr = getLocalDateString(d);
              const dayTimedEvents = allEvents.filter(e => e.date === dateStr && e.startTime);

              return (
                <div 
                  key={i} 
                  className="gc-day-col"
                  style={{ position: 'relative', flex: 1, borderRight: '1px solid rgba(255,255,255,0.08)', cursor: 'crosshair', minHeight: '1440px' }}
                  onPointerDown={(e) => handlePointerDown(e, dateStr)}
                  onPointerMove={(e) => handlePointerMove(e, dateStr)}
                  onPointerUp={handlePointerUp}
                >
                  {/* Timed Events */}
                  {dayTimedEvents.map(ev => {
                    const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
                    const [sH, sM] = ev.startTime!.split(':').map(Number);
                    const [eH, eM] = (ev.endTime || ev.startTime!).split(':').map(Number);
                    const top = sH * 60 + sM;
                    const height = Math.max(15, (eH * 60 + eM) - top);
                    
                    const formatTimeShort = (time: string) => {
                      const [h, m] = time.split(':').map(Number);
                      const ampm = h >= 12 ? 'pm' : 'am';
                      const h12 = h % 12 || 12;
                      return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
                    };

                    return (
                      <div key={ev.id} onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDragSelection({
                          isDragging: false,
                          dateStr: ev.date,
                          startMins: top,
                          currentMins: top + height,
                          popoverPos: { x: rect.right + 16, y: rect.top },
                          existingEvent: ev
                        });
                      }} style={{
                        position: 'absolute',
                        top: `${top}px`,
                        height: `${height}px`,
                        left: '4px',
                        right: '8px',
                        background: cfg.color,
                        borderRadius: '4px',
                        padding: height <= 30 ? '2px 6px' : '4px 6px',
                        color: '#fff',
                        fontSize: '12px',
                        overflow: 'hidden',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.2)',
                        borderLeft: '4px solid rgba(0,0,0,0.15)',
                        zIndex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        fontFamily: 'var(--font-sans)',
                        transition: 'box-shadow 0.2s ease',
                        lineHeight: 1.2
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                          {ev.title}{height <= 30 && `, ${formatTimeShort(ev.startTime!)}`}
                        </div>
                        {height > 30 && (
                          <div style={{ opacity: 0.9, fontSize: '11px', fontWeight: 500, textShadow: '0 1px 2px rgba(0,0,0,0.2)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formatTimeShort(ev.startTime!)} – {formatTimeShort(ev.endTime || ev.startTime!)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Drag Ghost Block */}
                  {dragSelection && dragSelection.dateStr === dateStr && (
                    <div style={{
                      position: 'absolute',
                      top: `${Math.min(dragSelection.startMins, dragSelection.currentMins)}px`,
                      height: `${Math.max(15, Math.abs(dragSelection.currentMins - dragSelection.startMins))}px`,
                      left: '4px',
                      right: '8px',
                      background: 'rgba(138, 180, 248, 0.4)',
                      border: '1px solid #8AB4F8',
                      borderRadius: '4px',
                      pointerEvents: 'none',
                      zIndex: 10
                    }}>
                      <div style={{ padding: '4px', color: '#8AB4F8', fontSize: '12px', fontWeight: 500 }}>
                        (No title)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMonthViewGoogle = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    const todayStr = getLocalDateString(new Date());

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`pad-${i}`} className="gc-month-cell" style={{ background: '#202124' }} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getLocalDateString(new Date(year, month, d));
      const dayEvents = allEvents.filter(e => e.date === dateStr);
      const isToday = dateStr === todayStr;

      days.push(
        <div key={d} className={`gc-month-cell ${isToday ? 'today' : ''}`} onClick={() => setSelectedDayStr(p => p === dateStr ? null : dateStr)} style={{ cursor: 'pointer' }}>
          <div className="gc-month-date">{d}</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {dayEvents.slice(0, 4).map(ev => {
              const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
              return (
                <div key={ev.id} onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDragSelection({
                    isDragging: false,
                    dateStr: ev.date,
                    startMins: 600,
                    currentMins: 630,
                    popoverPos: { x: rect.right + 16, y: rect.top },
                    existingEvent: ev
                  });
                }} className="gc-month-event all-day" style={{ background: cfg.color, color: '#fff', padding: '2px 6px', borderRadius: '4px', borderLeft: '3px solid rgba(0,0,0,0.15)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', marginBottom: '2px', fontWeight: 500 }}>
                  {ev.title}
                </div>
              );
            })}
            {dayEvents.length > 4 && <div style={{ fontSize: '0.65rem', color: '#9AA0A6', paddingLeft: '4px' }}>{dayEvents.length - 4} more</div>}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#1A1B20' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', padding: '0.5rem 0', color: '#9AA0A6', fontSize: '0.75rem', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => <div key={day}>{day}</div>)}
        </div>
        <div className="gc-month-grid">
          {days}
        </div>
      </div>
    );
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  let headerLabel = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  if (viewMode === 'week') {
    const day = currentDate.getDay();
    const sow = new Date(currentDate); sow.setDate(currentDate.getDate() - day);
    const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
    headerLabel = `${sow.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${eow.toLocaleDateString(undefined, {month:'short', day:'numeric'})}, ${currentDate.getFullYear()}`;
  } else if (viewMode === 'day') {
    headerLabel = currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  if (isLoading) return <div style={{ padding: '2rem', color: '#E8EAED' }}>Loading Calendar...</div>;

  return (
    <div className="gc-app-container">
      {/* HEADER */}
      <header className="gc-header">
        <div className="gc-header-left">
          <div className="gc-hamburger">
            <Menu size={20} />
          </div>
          <div className="gc-logo-area">
            <CalendarIcon size={24} color="#8AB4F8" />
            <span>Calendar</span>
          </div>
          <button className="gc-today-btn" onClick={() => setCurrentDate(new Date())}>Today</button>
          <div className="gc-nav-arrows">
            <button onClick={handlePrev}><ChevronLeft size={20} /></button>
            <button onClick={handleNext}><ChevronRight size={20} /></button>
          </div>
          <div className="gc-date-title">{headerLabel}</div>
        </div>
        
        <div className="gc-header-right">
          <div style={{ position: 'relative' }}>
            <button 
              className="gc-view-select" 
              onClick={() => setShowViewMenu(!showViewMenu)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '1rem', paddingLeft: '1.25rem', backgroundImage: 'none' }}
            >
              {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8EAED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: showViewMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>

            <AnimatePresence>
              {showViewMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{ position: 'absolute', top: '44px', right: '0', background: 'rgba(32,33,36,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.5rem', minWidth: '130px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' }}
                >
                  {['day', 'week', 'month'].map(mode => (
                    <button
                      key={mode}
                      className="gc-view-option"
                      onClick={() => { setViewMode(mode as any); setShowViewMenu(false); }}
                      style={{ background: viewMode === mode ? 'rgba(138,180,248,0.1)' : 'transparent', border: 'none', color: viewMode === mode ? '#8AB4F8' : '#E8EAED', padding: '0.5rem 1rem', textAlign: 'left', cursor: 'pointer', fontSize: '0.95rem', fontWeight: viewMode === mode ? 600 : 500, borderRadius: '8px', transition: 'background 0.2s', marginBottom: '2px' }}
                      onMouseEnter={e => e.currentTarget.style.background = viewMode === mode ? 'rgba(138,180,248,0.15)' : 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = viewMode === mode ? 'rgba(138,180,248,0.1)' : 'transparent'}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div style={{ position: 'relative' }}>
            {gcConnected ? (
              <div onClick={() => setShowProfileMenu(!showProfileMenu)}>
                {auth.currentUser?.photoURL ? (
                  <img 
                    src={auth.currentUser.photoURL} 
                    alt="Profile" 
                    style={{ width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover' }}
                  />
                ) : (
                  <div 
                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', color: '#1A1B20' }}
                  >
                    {auth.currentUser?.displayName?.[0]?.toUpperCase() || 'Z'}
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={() => handleGoogleConnect()} 
                style={{ background: 'transparent', border: '1px solid #8AB4F8', color: '#8AB4F8', padding: '6px 16px', borderRadius: '16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138, 180, 248, 0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                Connect Google Calendar
              </button>
            )}

            {showProfileMenu && gcConnected && (
              <div style={{ position: 'absolute', top: '40px', right: '0', background: '#202124', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', minWidth: '220px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#E8EAED', fontWeight: 500 }}>{auth.currentUser?.displayName || 'User'}</span>
                  <span style={{ fontSize: '0.8rem', color: '#9AA0A6' }}>{auth.currentUser?.email || ''}</span>
                </div>
                <button onClick={() => { handleGoogleDisconnect(); setShowProfileMenu(false); }} style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: '#ef4444', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem' }}>Disconnect Google Calendar</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="gc-main">
        {/* SIDEBAR */}
        <div className="gc-sidebar" data-lenis-prevent>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button className="gc-create-btn" style={{ flex: 1 }} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const dateStr = getLocalDateString(currentDate);
              const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
              const startMins = Math.floor(nowMins / 15) * 15;
              setDragSelection({
                isDragging: false,
                dateStr,
                startMins,
                currentMins: startMins + 60,
                popoverPos: { x: rect.right + 16, y: rect.top }
              });
            }}>
              <Plus size={20} color="#EA4335" />
              Create
            </button>
            <button 
              className="gc-create-btn" 
              style={{ flex: 1, padding: '0 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} 
              onClick={handleAutoSchedule}
              disabled={isAutoScheduling}
            >
              <Wand2 size={16} color="#8AB4F8" style={{ marginRight: '6px' }} />
              {isAutoScheduling ? 'Scheduling...' : 'Auto'}
            </button>
          </div>

          {/* Mini Calendar (Static mock of current month) */}
          <div className="gc-mini-cal">
            <div className="gc-mini-cal-header">
              <span>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <ChevronLeft size={16} cursor="pointer" onClick={handlePrev} />
                <ChevronRight size={16} cursor="pointer" onClick={handleNext} />
              </div>
            </div>
            <div className="gc-mini-grid">
              {['S','M','T','W','T','F','S'].map(d => <div key={d} className="gc-mini-day">{d}</div>)}
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay() }).map((_, i) => <div key={`p-${i}`} />)}
              {Array.from({ length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() }).map((_, i) => (
                <div key={i} className={`gc-mini-date ${getLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), i+1)) === getLocalDateString(new Date()) ? 'today' : ''} ${selectedDayStr === getLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), i+1)) ? 'active' : ''}`} onClick={() => {
                  setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), i+1));
                  setSelectedDayStr(getLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), i+1)));
                }}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="gc-filters">
            <section>
              <div className="gc-filter-title" onClick={() => setIsMyCalendarsExpanded(!isMyCalendarsExpanded)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                My calendars 
                <ChevronRight size={16} style={{ transform: isMyCalendarsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}/>
              </div>
              {isMyCalendarsExpanded && Object.entries(EVENT_COLORS).filter(([k]) => k !== 'gcal' && k !== 'holiday').map(([key, cfg]) => (
                <div key={key} className="gc-filter-item" onClick={() => {
                  setVisibleTypes(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}>
                  <div className="gc-filter-checkbox" style={{ background: visibleTypes.has(key) ? cfg.color : 'transparent', border: `2px solid ${cfg.color}`, backgroundClip: visibleTypes.has(key) ? 'border-box' : 'content-box' }}>
                    {visibleTypes.has(key) && <Check size={12} color="#1A1B20" />}
                  </div>
                  <span>{cfg.icon} {cfg.label}</span>
                </div>
              ))}
            </section>
            <section>
              <div className="gc-filter-title" onClick={() => setIsOtherCalendarsExpanded(!isOtherCalendarsExpanded)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Other calendars 
                <ChevronRight size={16} style={{ transform: isOtherCalendarsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}/>
              </div>
              {isOtherCalendarsExpanded && Object.entries(EVENT_COLORS).filter(([k]) => k === 'gcal' || k === 'holiday').map(([key, cfg]) => (
                <div key={key} className="gc-filter-item" onClick={() => {
                  setVisibleTypes(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}>
                  <div className="gc-filter-checkbox" style={{ background: visibleTypes.has(key) ? cfg.color : 'transparent', border: `2px solid ${cfg.color}`, backgroundClip: visibleTypes.has(key) ? 'border-box' : 'content-box' }}>
                    {visibleTypes.has(key) && <Check size={12} color="#1A1B20" />}
                  </div>
                  <span>{cfg.icon} {cfg.label}</span>
                </div>
              ))}
            </section>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${viewMode}-${currentDate.toISOString()}`}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}
            >
              {viewMode === 'month' && renderMonthViewGoogle()}
              {viewMode === 'day' && renderTimeGrid([currentDate])}
              {viewMode === 'week' && renderTimeGrid(Array.from({ length: 7 }, (_, i) => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() - d.getDay() + i);
                return d;
              }))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* New Drag Selection Event Popover */}
        {dragSelection && dragSelection.popoverPos && createPortal(
          <EventPopover
            x={dragSelection.popoverPos.x}
            y={dragSelection.popoverPos.y}
            initialDate={dragSelection.dateStr}
            initialStartTime={`${String(Math.floor(Math.min(dragSelection.startMins, dragSelection.currentMins) / 60)).padStart(2, '0')}:${String(Math.min(dragSelection.startMins, dragSelection.currentMins) % 60).padStart(2, '0')}`}
            initialEndTime={`${String(Math.floor(Math.max(dragSelection.startMins, dragSelection.currentMins) / 60)).padStart(2, '0')}:${String(Math.max(dragSelection.startMins, dragSelection.currentMins) % 60).padStart(2, '0')}`}
            onClose={() => setDragSelection(null)}
            onSave={handlePopoverSave}
            existingEvent={dragSelection.existingEvent}
            onDelete={(id) => {
              handleDeleteCustomEvent(id);
              setDragSelection(null);
            }}
          />,
          document.body
        )}
      </div>
    </div>
  );
};
