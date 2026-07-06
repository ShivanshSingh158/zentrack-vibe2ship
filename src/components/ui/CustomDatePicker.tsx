import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ value, onChange, className, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or use today
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  
  // State for the calendar view (which month/year we are looking at)
  const [viewDate, setViewDate] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  // Sync state if value prop changes externally
  useEffect(() => {
    if (value) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
        if (!isOpen) {
          setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
        }
      }
    }
  }, [value, isOpen]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Calendar logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    // Format to YYYY-MM-DD
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(newDate.getDate()).padStart(2, '0');
    
    onChange(`${year}-${month}-${dayStr}`);
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // Empty slots before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" style={{ padding: '0.5rem', textAlign: 'center', opacity: 0 }} />);
    }
    
    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = 
        currentDate.getFullYear() === year && 
        currentDate.getMonth() === month && 
        currentDate.getDate() === day;
        
      const isToday = 
        new Date().getFullYear() === year && 
        new Date().getMonth() === month && 
        new Date().getDate() === day;

      days.push(
        <button
          key={day}
          onClick={(e) => { e.stopPropagation(); handleDateSelect(day); }}
          style={{
            padding: '0.4rem',
            textAlign: 'center',
            borderRadius: '8px',
            background: isSelected ? 'var(--accent-primary)' : 'transparent',
            color: isSelected ? '#fff' : (isToday ? 'var(--accent-primary)' : 'var(--text-primary)'),
            fontWeight: isSelected || isToday ? 600 : 400,
            border: isToday && !isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.85rem'
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'transparent';
          }}
        >
          {day}
        </button>
      );
    }
    
    return days;
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return 'Select date';
    const [y, m, d] = dateString.split('-');
    if (!y || !m || !d) return dateString;
    return `${d}-${m}-${y}`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }} className={className}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.8rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          transition: 'all 0.2s',
          boxShadow: isOpen ? '0 0 0 2px rgba(99, 102, 241, 0.3)' : 'none',
          height: '42px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <CalendarIcon size={16} color="var(--accent-primary)" style={{ opacity: 0.8 }} />
          <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>
            {formatDateDisplay(value)}
          </span>
        </div>
        <ChevronDownIcon isOpen={isOpen} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              left: 0,
              zIndex: 1000,
              background: '#15151a',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              width: '280px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <button onClick={handlePrevMonth} className="btn-icon" style={{ background: 'transparent', padding: '0.4rem' }}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </div>
              <button onClick={handleNextMonth} className="btn-icon" style={{ background: 'transparent', padding: '0.4rem' }}>
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Days of Week */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem', marginBottom: '0.6rem' }}>
              {DAYS_OF_WEEK.map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem' }}>
              {renderCalendar()}
            </div>
            
            {/* Quick Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border-subtle)' }}>
               <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const d = new Date();
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    onChange(`${year}-${month}-${day}`);
                    setIsOpen(false);
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                 Today
               </button>
               <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-base)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                 Close
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg 
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);
