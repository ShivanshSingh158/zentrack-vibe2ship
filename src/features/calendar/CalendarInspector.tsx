import React from 'react';
import { X, Clock, MapPin, Video, Trash2, Edit2, CheckCircle2, AlertTriangle, BookOpen, Dumbbell, CheckSquare, Calendar as CalendarIcon } from 'lucide-react';
import { format12Hour, getEventColors } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';

interface CalendarInspectorProps {
  event: MergedCalendarEvent | null;
  onClose: () => void;
  onEdit: (event: MergedCalendarEvent) => void;
  onDelete: (event: MergedCalendarEvent) => void;
  isDark?: boolean;
}

export const CalendarInspector: React.FC<CalendarInspectorProps> = ({
  event,
  onClose,
  onEdit,
  onDelete,
  isDark = true,
}) => {
  if (!event) return null;

  const colorMap = getEventColors(isDark);
  const colorSpec = colorMap[event.type] || colorMap.todo;

  const [y, m, d] = (event.date || '').split('-').map(Number);
  const dateFormatted = event.date
    ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No Date';

  return (
    <div className="calendar-inspector-panel">
      {/* Header */}
      <div className="inspector-header">
        <span
          className="inspector-type-badge"
          style={{
            backgroundColor: colorSpec.bg,
            color: colorSpec.border,
            borderColor: `${colorSpec.border}40`,
          }}
        >
          {event.type.toUpperCase()}
        </span>

        <div className="inspector-top-actions">
          {event.type !== 'class' && event.type !== 'gym' && (
            <>
              <button
                type="button"
                className="inspector-icon-btn edit"
                onClick={() => onEdit(event)}
                title="Edit Event"
              >
                <Edit2 size={13} />
              </button>
              <button
                type="button"
                className="inspector-icon-btn delete"
                onClick={() => onDelete(event)}
                title="Delete Event"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
          <button
            type="button"
            className="inspector-icon-btn close"
            onClick={onClose}
            title="Close Inspector"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="inspector-title-area">
        <h2 className="inspector-title">{event.title}</h2>
        {event.isCompleted && (
          <div className="inspector-completed-chip">
            <CheckCircle2 size={13} color="#5eda9e" />
            <span>Completed</span>
          </div>
        )}
      </div>

      {/* Main Metadata List */}
      <div className="inspector-meta-list">
        {/* Date */}
        <div className="inspector-meta-item">
          <CalendarIcon size={14} className="meta-icon" />
          <div className="meta-content">
            <span className="meta-label">Date</span>
            <span className="meta-val">{dateFormatted}</span>
          </div>
        </div>

        {/* Time */}
        <div className="inspector-meta-item">
          <Clock size={14} className="meta-icon" />
          <div className="meta-content">
            <span className="meta-label">Time Window</span>
            <span className="meta-val">
              {event.startTime
                ? `${format12Hour(event.startTime)} – ${format12Hour(event.endTime)}`
                : 'All Day Event'}
            </span>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="inspector-meta-item">
            <MapPin size={14} className="meta-icon" />
            <div className="meta-content">
              <span className="meta-label">Location</span>
              <span className="meta-val">{event.location}</span>
            </div>
          </div>
        )}
      </div>

      {/* Google Meet Direct Launcher */}
      {event.meetLink && (
        <a
          href={event.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inspector-meet-launcher-btn"
        >
          <Video size={16} />
          <span>Join Google Meet</span>
        </a>
      )}

      {/* Description */}
      {event.description && (
        <div className="inspector-description-block">
          <span className="desc-heading">NOTES & AGENDA</span>
          <p className="desc-text">{event.description}</p>
        </div>
      )}

      {/* Footer Info */}
      <div className="inspector-footer">
        <span className="source-label">
          Source: {event.fromGCal ? 'Google Calendar' : event.type === 'class' ? 'Academic Timetable' : event.type === 'gym' ? 'Zen Gym Routine' : 'ZenTrack Local Event'}
        </span>
      </div>
    </div>
  );
};
