import React from 'react';
import { X, Calendar as CalendarIcon, Clock, MapPin, AlignLeft, Trash2, Edit3, ExternalLink, Video } from 'lucide-react';
import { getEventColors, format12Hour } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';

interface EventDetailModalProps {
  isOpen: boolean;
  event: MergedCalendarEvent | null;
  isDark?: boolean;
  onClose: () => void;
  onDelete: (event: MergedCalendarEvent) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  isOpen,
  event,
  isDark = true,
  onClose,
  onDelete,
}) => {
  if (!isOpen || !event) return null;

  const colorMap = getEventColors(isDark);
  const colorSpec = colorMap[event.type] || colorMap.todo;

  const isCustomEvent = !event.id.startsWith('todo_') && !event.id.startsWith('gcal_') && !event.id.includes('-class-') && !event.id.includes('-lab-') && !event.id.startsWith('gym-');

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal-card detail-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="detail-type-badge" style={{ backgroundColor: colorSpec.bg, color: colorSpec.border, borderColor: colorSpec.border }}>
            <span>{colorSpec.icon || '📅'}</span>
            <span>{colorSpec.label || event.type.toUpperCase()}</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Title */}
        <h3 className="detail-event-title" style={{ color: isDark ? '#ffffff' : '#111827' }}>
          {event.title}
        </h3>

        {/* Meta Details List */}
        <div className="detail-meta-list">
          {/* Date & Time */}
          <div className="detail-meta-row">
            <div className="detail-meta-icon-box">
              <Clock size={16} color="#a599ff" />
            </div>
            <div className="detail-meta-content">
              <span className="detail-meta-primary">
                {event.startTime ? `${format12Hour(event.startTime)} - ${format12Hour(event.endTime)}` : 'All Day'}
              </span>
              <span className="detail-meta-secondary">{event.date}</span>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="detail-meta-row">
              <div className="detail-meta-icon-box">
                <MapPin size={16} color="#5eda9e" />
              </div>
              <div className="detail-meta-content">
                <span className="detail-meta-primary">{event.location}</span>
              </div>
            </div>
          )}

          {/* Google Meet Link */}
          {event.meetLink && (
            <div className="detail-meta-row">
              <div className="detail-meta-icon-box">
                <Video size={16} color="#89dceb" />
              </div>
              <div className="detail-meta-content">
                <a href={event.meetLink} target="_blank" rel="noreferrer" className="meet-join-link">
                  <span>Join Google Meet</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="detail-meta-row">
              <div className="detail-meta-icon-box">
                <AlignLeft size={16} color="#8e8e93" />
              </div>
              <div className="detail-meta-content">
                <p className="detail-description-text">{event.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="detail-modal-footer">
          {isCustomEvent && (
            <button
              type="button"
              className="detail-delete-btn"
              onClick={() => {
                onDelete(event);
                onClose();
              }}
            >
              <Trash2 size={15} />
              <span>Delete Event</span>
            </button>
          )}
          <button type="button" className="detail-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
