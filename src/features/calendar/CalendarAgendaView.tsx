import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Clock, MapPin, Video, CheckCircle2, ChevronRight, AlertCircle, Dumbbell, BookOpen, CheckSquare, Sparkles, History, ChevronDown, ChevronUp } from 'lucide-react';
import { format12Hour, getEventColors } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';
import { getLocalDateString } from '../../utils/dateUtils';

interface CalendarAgendaViewProps {
  events: MergedCalendarEvent[];
  selectedDate: string;
  isDark?: boolean;
  onSelectEvent: (event: MergedCalendarEvent) => void;
  onSelectDate: (dateStr: string) => void;
}

export const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({
  events,
  selectedDate,
  isDark = true,
  onSelectEvent,
  onSelectDate,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const colorMap = useMemo(() => getEventColors(isDark), [isDark]);
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [showPastEvents, setShowPastEvents] = useState(false);

  // Native non-passive wheel isolation for smooth mouse wheel scrolling
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Effective cutoff: defaults to today (or selectedDate if user deliberately picked a past date)
  const effectiveStartDate = useMemo(() => {
    if (selectedDate && selectedDate < todayStr) return selectedDate;
    return todayStr;
  }, [selectedDate, todayStr]);

  // Count past events before the active start date
  const pastEventsCount = useMemo(() => {
    return events.filter(e => e.date && e.date !== 'Unscheduled' && e.date < effectiveStartDate).length;
  }, [events, effectiveStartDate]);

  // Group events by date chronologically starting from Today / effectiveStartDate
  const groupedEvents = useMemo(() => {
    const map = new Map<string, MergedCalendarEvent[]>();

    events.forEach(evt => {
      const d = evt.date || 'Unscheduled';
      // By default, hide events prior to the effective start date unless toggled
      if (!showPastEvents && d !== 'Unscheduled' && d < effectiveStartDate) {
        return;
      }
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(evt);
    });

    // Sort dates
    const sortedDates = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Unscheduled') return 1;
      if (b === 'Unscheduled') return -1;
      return a.localeCompare(b);
    });

    return sortedDates.map(dateKey => {
      // Sort events within the date by startTime
      const dayEvts = (map.get(dateKey) || []).sort((a, b) => {
        if (!a.startTime && !b.startTime) return 0;
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });

      let displayHeading = dateKey;
      let isToday = false;
      if (dateKey !== 'Unscheduled') {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dObj = new Date(y, (m || 1) - 1, d || 1);
        displayHeading = dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        isToday = dateKey === todayStr;
      }

      return {
        dateKey,
        displayHeading,
        isToday,
        events: dayEvts,
      };
    });
  }, [events, showPastEvents, effectiveStartDate, todayStr]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'class':
      case 'lab':
        return <BookOpen size={13} />;
      case 'gym':
        return <Dumbbell size={13} />;
      case 'todo':
        return <CheckSquare size={13} />;
      default:
        return <Clock size={13} />;
    }
  };

  if (groupedEvents.length === 0) {
    return (
      <div className="agenda-empty-state">
        <Sparkles size={36} color="rgba(165, 153, 255, 0.4)" />
        <h3>No Upcoming Events Scheduled</h3>
        <p>Use the + Add Event button or your AI Assistant to plan your week.</p>
        {pastEventsCount > 0 && !showPastEvents && (
          <button
            type="button"
            className="agenda-past-toggle-btn"
            onClick={() => setShowPastEvents(true)}
            style={{ marginTop: '1rem' }}
          >
            <History size={14} />
            <span>Show {pastEventsCount} earlier event{pastEventsCount === 1 ? '' : 's'}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="calendar-agenda-view-root" ref={scrollContainerRef}>
      {pastEventsCount > 0 && (
        <div className="agenda-past-toggle-banner">
          <button
            type="button"
            className="agenda-past-toggle-btn"
            onClick={() => setShowPastEvents(v => !v)}
            title={showPastEvents ? 'Hide earlier events' : 'View events before today'}
          >
            <History size={13} />
            <span>{showPastEvents ? 'Hide earlier events' : `Show ${pastEventsCount} earlier event${pastEventsCount === 1 ? '' : 's'}`}</span>
            {showPastEvents ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      {groupedEvents.map(({ dateKey, displayHeading, isToday, events: dayEvts }) => (
        <div key={dateKey} className={`agenda-date-group ${isToday ? 'today-group' : ''}`}>
          <div className="agenda-date-header" onClick={() => dateKey !== 'Unscheduled' && onSelectDate(dateKey)}>
            <span className={`agenda-date-title ${isToday ? 'today-text' : ''}`}>
              {displayHeading}
            </span>
            {isToday && <span className="agenda-today-badge">TODAY</span>}
            <span className="agenda-count-badge">{dayEvts.length} event{dayEvts.length === 1 ? '' : 's'}</span>
          </div>

          <div className="agenda-events-stack">
            {dayEvts.map(evt => {
              const colorSpec = colorMap[evt.type] || colorMap.todo;
              return (
                <div
                  key={evt.id}
                  className={`agenda-event-row ${evt.isCompleted ? 'completed' : ''}`}
                  onClick={() => onSelectEvent(evt)}
                >
                  <div
                    className="agenda-type-indicator"
                    style={{ backgroundColor: colorSpec.border }}
                  />

                  <div className="agenda-time-column">
                    {evt.startTime ? (
                      <span className="agenda-time-text">
                        {format12Hour(evt.startTime)}
                      </span>
                    ) : (
                      <span className="agenda-all-day-text">All Day</span>
                    )}
                    {evt.endTime && (
                      <span className="agenda-end-time-text">
                        to {format12Hour(evt.endTime)}
                      </span>
                    )}
                  </div>

                  <div className="agenda-main-details">
                    <div className="agenda-title-row">
                      <span className="agenda-title-text">{evt.title}</span>
                      {evt.isCompleted && <CheckCircle2 size={13} color="#5eda9e" />}
                    </div>

                    <div className="agenda-sub-meta">
                      <span
                        className="agenda-type-chip"
                        style={{
                          backgroundColor: colorSpec.bg,
                          color: colorSpec.border,
                          borderColor: `${colorSpec.border}40`,
                        }}
                      >
                        {getEventIcon(evt.type)}
                        <span>{evt.type.toUpperCase()}</span>
                      </span>

                      {evt.location && (
                        <span className="agenda-location-text">
                          <MapPin size={11} />
                          <span>{evt.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {evt.meetLink && (
                    <a
                      href={evt.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="agenda-join-meet-btn"
                      onClick={e => e.stopPropagation()}
                    >
                      <Video size={13} />
                      <span>Join Meet</span>
                    </a>
                  )}

                  <ChevronRight size={14} className="agenda-arrow-icon" />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
