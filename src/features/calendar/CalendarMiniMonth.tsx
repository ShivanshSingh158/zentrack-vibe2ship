import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import type { MergedCalendarEvent } from './CalendarDayView';

interface CalendarMiniMonthProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  events: MergedCalendarEvent[];
}

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const CalendarMiniMonth: React.FC<CalendarMiniMonthProps> = ({
  selectedDate,
  onSelectDate,
  events,
}) => {
  const [viewYear, viewMonth] = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return [y, (m || 1) - 1];
  }, [selectedDate]);

  const [activeYear, setActiveYear] = React.useState(viewYear);
  const [activeMonth, setActiveMonth] = React.useState(viewMonth);

  React.useEffect(() => {
    setActiveYear(viewYear);
    setActiveMonth(viewMonth);
  }, [viewYear, viewMonth]);

  const todayStr = getLocalDateString();

  const handlePrevMonth = () => {
    if (activeMonth === 0) {
      setActiveMonth(11);
      setActiveYear(y => y - 1);
    } else {
      setActiveMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 11) {
      setActiveMonth(0);
      setActiveYear(y => y + 1);
    } else {
      setActiveMonth(m => m + 1);
    }
  };

  // Pre-calculate days with events for micro-dot indicators
  const eventDatesSet = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => {
      if (e.date) s.add(e.date);
    });
    return s;
  }, [events]);

  const daysGrid = useMemo(() => {
    const firstDay = new Date(activeYear, activeMonth, 1).getDay();
    const totalDays = new Date(activeYear, activeMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(activeYear, activeMonth, 0).getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const prevM = activeMonth === 0 ? 12 : activeMonth;
      const prevY = activeMonth === 0 ? activeYear - 1 : activeYear;
      const mm = String(prevM).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push({ dateStr: `${prevY}-${mm}-${dd}`, dayNum: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const mm = String(activeMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push({ dateStr: `${activeYear}-${mm}-${dd}`, dayNum: d, isCurrentMonth: true });
    }

    // Next month padding to fill complete weeks (35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = activeMonth === 11 ? 1 : activeMonth + 2;
      const nextY = activeMonth === 11 ? activeYear + 1 : activeYear;
      const mm = String(nextM).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push({ dateStr: `${nextY}-${mm}-${dd}`, dayNum: d, isCurrentMonth: false });
    }

    return days;
  }, [activeYear, activeMonth]);

  const monthName = new Date(activeYear, activeMonth, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className="calendar-mini-month-root">
      <div className="mini-month-header">
        <span className="mini-month-title">{monthName}</span>
        <div className="mini-month-arrows">
          <button type="button" onClick={handlePrevMonth} className="mini-arrow-btn" title="Previous month">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={handleNextMonth} className="mini-arrow-btn" title="Next month">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="mini-month-weekdays">
        {WEEKDAY_HEADERS.map((h, i) => (
          <span key={i} className="mini-weekday-col">{h}</span>
        ))}
      </div>

      <div className="mini-month-grid">
        {daysGrid.map(({ dateStr, dayNum, isCurrentMonth }) => {
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasEvents = eventDatesSet.has(dateStr);

          return (
            <button
              key={dateStr}
              type="button"
              className={`mini-day-cell ${isCurrentMonth ? 'in-month' : 'out-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="mini-day-number">{dayNum}</span>
              {hasEvents && !isSelected && <span className="mini-day-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
