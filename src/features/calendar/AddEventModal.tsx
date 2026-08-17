import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Clock, MapPin, AlignLeft, Sparkles, Check, Link2 } from 'lucide-react';
import { getEventColors, format12Hour } from './calendarUtils';

interface AddEventModalProps {
  isOpen: boolean;
  selectedDate: string;
  initialStartTime?: string;
  isDark?: boolean;
  isGoogleConnected?: boolean;
  onClose: () => void;
  onSave: (eventData: {
    title: string;
    date: string;
    type: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    description?: string;
    syncToGCal?: boolean;
  }) => void;
}

const EVENT_TYPES = [
  { key: 'exam', label: 'Exam', icon: '📝' },
  { key: 'assignment_due', label: 'Assignment', icon: '📋' },
  { key: 'viva', label: 'Viva', icon: '🎤' },
  { key: 'submission', label: 'Submission', icon: '📤' },
  { key: 'holiday', label: 'Holiday', icon: '🌴' },
  { key: 'todo', label: 'Task', icon: '✅' },
  { key: 'job', label: 'Interview', icon: '💼' },
  { key: 'goal', label: 'Goal', icon: '🎯' },
  { key: 'gcal', label: 'Event', icon: '📅' },
];

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  selectedDate,
  initialStartTime,
  isDark = true,
  isGoogleConnected = false,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [type, setType] = useState('exam');
  const [startTime, setStartTime] = useState(initialStartTime || '09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [syncToGCal, setSyncToGCal] = useState(isGoogleConnected);

  const colorMap = getEventColors(isDark);

  useEffect(() => {
    if (selectedDate) setDate(selectedDate);
    if (initialStartTime) {
      setStartTime(initialStartTime);
      const [h, m] = initialStartTime.split(':').map(Number);
      const endH = Math.min(23, (h || 9) + 1);
      setEndTime(`${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`);
    }
  }, [selectedDate, initialStartTime]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      date,
      type,
      startTime,
      endTime,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      syncToGCal,
    });
    onClose();
  };

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="modal-header-left">
            <CalendarIcon size={18} color="#a599ff" />
            <h3>Create Calendar Event</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="calendar-modal-form">
          {/* Title Input */}
          <div className="form-field-group">
            <label>Event Title</label>
            <input
              type="text"
              className="calendar-input title-input"
              placeholder="e.g. Midterm Exam, Team Sync, Project Review"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Type Selector Pills */}
          <div className="form-field-group">
            <label>Event Category</label>
            <div className="event-type-pills-row">
              {EVENT_TYPES.map(t => {
                const colorSpec = colorMap[t.key] || colorMap.todo;
                const isSelected = type === t.key;

                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`event-type-pill ${isSelected ? 'selected' : ''}`}
                    style={{
                      backgroundColor: isSelected ? colorSpec.border : colorSpec.bg,
                      color: isSelected ? '#000000' : colorSpec.border,
                      borderColor: colorSpec.border,
                    }}
                    onClick={() => setType(t.key)}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Time Row */}
          <div className="form-row-dual">
            <div className="form-field-group">
              <label>
                <CalendarIcon size={12} /> Date
              </label>
              <input
                type="date"
                className="calendar-input"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field-group">
              <label>
                <Clock size={12} /> Start Time
              </label>
              <input
                type="time"
                className="calendar-input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>

            <div className="form-field-group">
              <label>
                <Clock size={12} /> End Time
              </label>
              <input
                type="time"
                className="calendar-input"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Location */}
          <div className="form-field-group">
            <label>
              <MapPin size={12} /> Location / Room (Optional)
            </label>
            <input
              type="text"
              className="calendar-input"
              placeholder="e.g. Hall B, Google Meet, Library 3rd Floor"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-field-group">
            <label>
              <AlignLeft size={12} /> Description (Optional)
            </label>
            <textarea
              className="calendar-textarea"
              rows={2}
              placeholder="Add extra details, notes, or links..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Google Calendar Sync Option */}
          {isGoogleConnected && (
            <label className="gcal-sync-checkbox-row">
              <input
                type="checkbox"
                checked={syncToGCal}
                onChange={e => setSyncToGCal(e.target.checked)}
              />
              <Link2 size={14} color="#a599ff" />
              <span>Sync directly to Google Calendar</span>
            </label>
          )}

          {/* Footer Actions */}
          <div className="calendar-modal-footer">
            <button type="button" className="calendar-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="calendar-save-btn" disabled={!title.trim()}>
              <Check size={16} />
              <span>Save Event</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
