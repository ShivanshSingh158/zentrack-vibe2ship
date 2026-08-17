import React, { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface TaskDateStripProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  tasks: TodoItem[];
}

const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TaskDateStrip: React.FC<TaskDateStripProps> = ({
  selectedDate,
  onSelectDate,
  tasks,
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);

  // Compute 7 days centered around selectedDate
  const days = useMemo(() => {
    const base = new Date(selectedDate + 'T12:00:00');
    if (isNaN(base.getTime())) return [];
    const list = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = getLocalDateString(d);
      const hasTasks = tasks.some(t => t.date === dateStr && t.status !== 'completed');
      const hasCompleted = tasks.some(t => t.date === dateStr && t.status === 'completed');
      list.push({
        dateObj: d,
        dateStr,
        dayAbbr: DAY_ABBR[d.getDay()],
        dayNum: d.getDate(),
        monthAbbr: MONTH_ABBR[d.getMonth()],
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasTasks,
        hasCompleted,
      });
    }
    return list;
  }, [selectedDate, todayStr, tasks]);

  const shiftDate = (daysCount: number) => {
    const base = new Date(selectedDate + 'T12:00:00');
    base.setDate(base.getDate() + daysCount);
    onSelectDate(getLocalDateString(base));
  };

  const handleCalendarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      onSelectDate(e.target.value);
    }
  };

  return (
    <div className="task-date-strip-container">
      <button 
        type="button"
        className="strip-arrow-btn"
        onClick={() => shiftDate(-1)}
        title="Previous Day"
        aria-label="Previous Day"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="task-date-strip-scroll">
        {days.map((item) => (
          <button
            type="button"
            key={item.dateStr}
            onClick={() => onSelectDate(item.dateStr)}
            className={`date-pill ${item.isSelected ? 'selected' : ''} ${item.isToday ? 'today' : ''}`}
          >
            <span className="date-pill-day">{item.dayAbbr}</span>
            <span className="date-pill-num">{item.dayNum}</span>
            {item.hasTasks ? (
              <span className="date-pill-dot active" />
            ) : item.hasCompleted ? (
              <span className="date-pill-dot completed" />
            ) : (
              <span className="date-pill-dot empty" />
            )}
          </button>
        ))}
      </div>

      <button 
        type="button"
        className="strip-arrow-btn"
        onClick={() => shiftDate(1)}
        title="Next Day"
        aria-label="Next Day"
      >
        <ChevronRight size={16} />
      </button>

      {/* Quick Jump / Calendar picker */}
      <div className="strip-jump-wrapper">
        <button
          type="button"
          className="strip-jump-btn"
          onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
          title="Jump to date"
        >
          <CalendarIcon size={14} />
          <span>Jump</span>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={handleCalendarPick}
          className="strip-hidden-date-input"
        />
      </div>
    </div>
  );
};
