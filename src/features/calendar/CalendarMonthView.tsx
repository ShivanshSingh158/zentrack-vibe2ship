import React, { useMemo } from 'react';
import { getEventColors, format12Hour, getDensityTint } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';

interface CalendarMonthViewProps {
  selectedDate: string;
  allEvents: MergedCalendarEvent[];
  isDark?: boolean;
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: MergedCalendarEvent) => void;
  onAddEventClick: () => void;
}

const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
  selectedDate,
  allEvents,
  isDark = true,
  onSelectDate,
  onSelectEvent,
  onAddEventClick,
}) => {
  const colorMap = useMemo(() => getEventColors(isDark), [isDark]);
  const todayStr = new Date().toISOString().split('T')[0];

  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(selY, (selM || 1) - 1, selD || 1);
  const currentMonthIdx = selectedDateObj.getMonth();
  const currentYear = selectedDateObj.getFullYear();
  const monthName = selectedDateObj.toLocaleString('default', { month: 'long' });

  // Event counts by date string for the Month Density Heat Map
  const eventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.date) {
        counts[e.date] = (counts[e.date] || 0) + 1;
      }
    });
    return counts;
  }, [allEvents]);

  // Events on currently selected date
  const selectedDayEvents = useMemo(() => {
    return allEvents
      .filter(e => e.date === selectedDate)
      .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
  }, [allEvents, selectedDate]);

  // Build calendar matrix (42 cells: 6 rows x 7 cols)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonthIdx, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonthIdx + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const cells: Array<{
      dateStr: string;
      dateNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      eventCount: number;
      dots: string[];
    }> = [];

    // Days from previous month
    const prevMonthLastDate = new Date(currentYear, currentMonthIdx, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prevM = currentMonthIdx === 0 ? 12 : currentMonthIdx;
      const prevY = currentMonthIdx === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dateNum: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        eventCount: eventCountByDate[dateStr] || 0,
        dots: [],
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvts = allEvents.filter(e => e.date === dateStr);
      const dots = dayEvts.slice(0, 3).map(e => colorMap[e.type]?.border || '#a599ff');

      cells.push({
        dateStr,
        dateNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        eventCount: eventCountByDate[dateStr] || 0,
        dots,
      });
    }

    // Days from next month to fill complete 6 rows (42 cells)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonthIdx === 11 ? 1 : currentMonthIdx + 2;
      const nextY = currentMonthIdx === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dateNum: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        eventCount: eventCountByDate[dateStr] || 0,
        dots: [],
      });
    }

    return cells;
  }, [currentYear, currentMonthIdx, selectedDate, todayStr, eventCountByDate, allEvents, colorMap]);

  // Stepper handlers
  const handlePrevMonth = () => {
    const prev = new Date(currentYear, currentMonthIdx - 1, 1);
    const maxDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(selD || 1, maxDay);
    const dateStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    onSelectDate(dateStr);
  };

  const handleNextMonth = () => {
    const next = new Date(currentYear, currentMonthIdx + 1, 1);
    const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(selD || 1, maxDay);
    const dateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    onSelectDate(dateStr);
  };

  const handleMonthChipClick = (idx: number) => {
    const d = new Date(currentYear, idx, Math.min(selD || 1, new Date(currentYear, idx + 1, 0).getDate()));
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onSelectDate(dateStr);
  };

  return (
    <div className="calendar-month-view-layout">
      {/* ── Left/Main Column: Month Calendar with Density Heat Map ── */}
      <div className="calendar-month-grid-wrapper">
        {/* Month Stepper & Month Chips Row */}
        <div className="calendar-month-controls-bar">
          <div className="month-stepper-left">
            <button type="button" className="month-nav-btn" onClick={handlePrevMonth} title="Previous Month">
              <ChevronLeft size={16} />
            </button>
            <span className="month-stepper-title">
              {monthName} {currentYear}
            </span>
            <button type="button" className="month-nav-btn" onClick={handleNextMonth} title="Next Month">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Quick Month Chips Row (Jan - Dec) */}
          <div className="month-chips-scroll">
            {ALL_MONTHS.map((m, idx) => (
              <button
                key={m}
                type="button"
                className={`month-chip ${currentMonthIdx === idx ? 'active' : ''}`}
                onClick={() => handleMonthChipClick(idx)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="month-weekday-header-row">
          {WEEKDAYS.map(w => (
            <div key={w} className="month-weekday-cell">
              {w}
            </div>
          ))}
        </div>

        {/* 6x7 Month Grid with Density Heat Map */}
        <div className="month-cells-grid">
          {calendarCells.map((cell, i) => {
            const densityTint = getDensityTint(cell.eventCount, isDark);

            return (
              <div
                key={i}
                className={`month-day-cell ${cell.isCurrentMonth ? 'current-month' : 'other-month'} ${cell.isSelected ? 'selected-cell' : ''} ${cell.isToday ? 'today-cell' : ''}`}
                style={{
                  backgroundColor: cell.isSelected ? 'rgba(165, 153, 255, 0.18)' : densityTint || 'transparent',
                }}
                onClick={() => onSelectDate(cell.dateStr)}
              >
                <span className="month-day-number">{cell.dateNum}</span>

                {/* Event Dots */}
                {cell.dots.length > 0 && !cell.isSelected && (
                  <div className="month-day-dots-row">
                    {cell.dots.map((color, di) => (
                      <span key={di} className="month-dot" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Column: Selected Day Agenda & Quick Actions ── */}
      <div className="calendar-month-agenda-panel">
        <div className="agenda-panel-header">
          <div className="agenda-header-left">
            <CalendarIcon size={16} color="#a599ff" />
            <h4>
              {selectedDateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </h4>
          </div>
          <button type="button" className="agenda-add-btn" onClick={onAddEventClick} title="Add Event">
            <Plus size={15} />
            <span>Add</span>
          </button>
        </div>

        <div className="agenda-events-list">
          {selectedDayEvents.length === 0 ? (
            <div className="agenda-empty-state">
              <span className="agenda-empty-text">No events on this day</span>
              <button type="button" className="agenda-empty-create-btn" onClick={onAddEventClick}>
                + Plan Event
              </button>
            </div>
          ) : (
            selectedDayEvents.map(evt => {
              const colorSpec = colorMap[evt.type] || colorMap.todo;
              return (
                <div
                  key={evt.id}
                  className="agenda-event-card"
                  style={{
                    backgroundColor: colorSpec.bg,
                    borderLeftColor: colorSpec.border,
                  }}
                  onClick={() => onSelectEvent(evt)}
                >
                  <div className="agenda-event-header">
                    <span className="agenda-event-title" style={{ color: colorSpec.border }}>
                      {evt.title}
                    </span>
                    {evt.isCompleted && <CheckCircle2 size={13} color="#5eda9e" />}
                  </div>
                  <div className="agenda-event-meta">
                    <span className="agenda-event-time">
                      <Clock size={11} />
                      {evt.startTime ? `${format12Hour(evt.startTime)} - ${format12Hour(evt.endTime)}` : 'All Day'}
                    </span>
                    {evt.location && (
                      <span className="agenda-event-location">
                        <MapPin size={11} />
                        {evt.location}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
