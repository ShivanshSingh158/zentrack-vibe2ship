import React, { useState, useMemo } from 'react';
import { X, Sparkles, Clock, Check, Zap, ChevronDown, ChevronUp, Calendar, ArrowRight } from 'lucide-react';
import { calculateDayFreeSlots, type CalculatedFreeSlot } from './calendarUtils';

export interface AiFreeSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  dayEvents?: { startTime?: string; endTime?: string; title?: string; type?: string }[];
  onBookSlot?: (slotStr: string) => void;
  // Backwards compatibility
  result?: string | null;
  aiResult?: string | null;
  isLoading?: boolean;
}

export const AiFreeSlotModal: React.FC<AiFreeSlotModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  dayEvents = [],
  onBookSlot,
}) => {
  const [showBusyDetails, setShowBusyDetails] = useState(false);

  // Compute exact schedule intervals algorithmically (0ms latency, zero AI hallucination)
  const analysis = useMemo(() => {
    return calculateDayFreeSlots(selectedDate, dayEvents, 8, 22);
  }, [selectedDate, dayEvents]);

  // Formatted date title
  const formattedDate = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dateObj = new Date(y, (m || 1) - 1, d || 1);
      return dateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  if (!isOpen) return null;

  const { freeSlots, optimalSlot, busyBlocks, totalFreeMinutes, totalBusyMinutes } = analysis;

  const formatMinLabel = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal-card ai-slot-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="ai-modal-header-left">
            <div className="ai-sparkle-badge">
              <Sparkles size={18} />
            </div>
            <div>
              <h3>Smart Free Slots</h3>
              <p className="ai-modal-subtitle">
                {formattedDate} • {freeSlots.length} open {freeSlots.length === 1 ? 'window' : 'windows'}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="ai-modal-body">
          {/* Day Metrics Quick Bar */}
          <div className="free-slots-metrics-bar">
            <div className="slot-metric-pill free">
              <span className="slot-metric-label">Free Time</span>
              <span className="slot-metric-val">{formatMinLabel(totalFreeMinutes)}</span>
            </div>
            <div className="slot-metric-pill busy">
              <span className="slot-metric-label">Scheduled</span>
              <span className="slot-metric-val">{formatMinLabel(totalBusyMinutes)}</span>
            </div>
            <div className="slot-metric-pill slots">
              <span className="slot-metric-label">Available Slots</span>
              <span className="slot-metric-val">{freeSlots.length} Blocks</span>
            </div>
          </div>

          {/* 1. HERO OPTIMAL FOCUS WINDOW */}
          {optimalSlot ? (
            <div className="optimal-slot-hero">
              <div className="optimal-hero-top">
                <div className="optimal-badge">
                  <Zap size={13} />
                  <span>Recommended Focus Window</span>
                </div>
                <span className="optimal-duration-chip">
                  {optimalSlot.durationLabel} uninterrupted
                </span>
              </div>

              <div className="optimal-hero-middle">
                <div className="optimal-time-display">
                  <Clock size={18} />
                  <span className="optimal-time-text">{optimalSlot.timeRange}</span>
                </div>
                {onBookSlot && (
                  <button
                    type="button"
                    className="optimal-book-btn"
                    onClick={() => onBookSlot(optimalSlot.startTimeStr)}
                    title={`Schedule task or event at ${optimalSlot.formattedStart}`}
                  >
                    <span>Schedule Here</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>

              <p className="optimal-hero-desc">
                Continuous free block during prime cognitive hours. Zero conflicts with your classes, tasks, or calendar.
              </p>
            </div>
          ) : busyBlocks.length === 0 ? (
            /* Entire Day Open */
            <div className="optimal-slot-hero completely-free">
              <div className="optimal-hero-top">
                <div className="optimal-badge free-day">
                  <Calendar size={13} />
                  <span>Completely Open Schedule</span>
                </div>
                <span className="optimal-duration-chip">14h open</span>
              </div>
              <div className="optimal-hero-middle">
                <div className="optimal-time-display">
                  <Clock size={18} />
                  <span className="optimal-time-text">8:00 AM – 10:00 PM</span>
                </div>
                {onBookSlot && (
                  <button
                    type="button"
                    className="optimal-book-btn"
                    onClick={() => onBookSlot('09:00')}
                    title="Book event at 9:00 AM"
                  >
                    <span>Schedule at 9:00 AM</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <p className="optimal-hero-desc">
                No scheduled commitments found on this date. You have full flexibility across the entire day.
              </p>
            </div>
          ) : (
            /* Fully Booked Day */
            <div className="optimal-slot-hero fully-booked">
              <div className="optimal-badge busy-day">
                <Clock size={13} />
                <span>Fully Booked Schedule</span>
              </div>
              <p className="optimal-hero-desc" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                No uninterrupted free blocks over 15 minutes found between 8:00 AM and 10:00 PM.
              </p>
            </div>
          )}

          {/* 2. ALL FREE BLOCKS LIST */}
          {freeSlots.length > 0 && (
            <div className="free-slots-section">
              <div className="free-slots-section-header">
                <span className="free-slots-section-title">All Open Windows</span>
                <span className="free-slots-count-chip">{freeSlots.length} available</span>
              </div>

              <div className="free-slots-list">
                {freeSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={`free-slot-card ${slot.isOptimalFocus ? 'optimal-border' : ''}`}
                  >
                    <div className="free-slot-left">
                      <span className={`period-tag period-${slot.period}`}>
                        {slot.period.charAt(0).toUpperCase() + slot.period.slice(1)}
                      </span>
                      <div className="free-slot-info">
                        <span className="free-slot-time">{slot.timeRange}</span>
                        <span className="free-slot-duration">{slot.durationLabel} continuous</span>
                      </div>
                    </div>

                    {onBookSlot && (
                      <button
                        type="button"
                        className="free-slot-book-btn"
                        onClick={() => onBookSlot(slot.startTimeStr)}
                        title={`Book a task or event starting at ${slot.formattedStart}`}
                      >
                        <span>+ Book Slot</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. SCHEDULED COMMITMENTS TRANSPARENCY ACCORDION */}
          {busyBlocks.length > 0 && (
            <div className="busy-blocks-accordion">
              <button
                type="button"
                className="busy-accordion-toggle"
                onClick={() => setShowBusyDetails(prev => !prev)}
              >
                <span>Accounted Commitments ({busyBlocks.length})</span>
                {showBusyDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showBusyDetails && (
                <div className="busy-blocks-list">
                  {busyBlocks.map((b, idx) => (
                    <div key={idx} className="busy-block-item">
                      <span className="busy-block-title">{b.title}</span>
                      <span className="busy-block-time">
                        {b.formattedStart} – {b.formattedEnd} ({formatMinLabel(b.durationMinutes)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="calendar-modal-footer">
          <button type="button" className="calendar-save-btn ai-got-it-btn" onClick={onClose}>
            <Check size={16} />
            <span>Got It</span>
          </button>
        </div>
      </div>
    </div>
  );
};
