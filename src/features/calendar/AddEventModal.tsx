import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Calendar as CalendarIcon, Clock, MapPin, AlignLeft,
  Sparkles, Check, Link2, Repeat, Tag
} from 'lucide-react';
import { format12Hour } from './calendarUtils';
import { parseNLEvent, type ParsedEvent } from '../../utils/dateUtils';
import { auth, db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { addEventToGoogleCalendar } from '../../services/googleCalendar';
import { toast } from 'sonner';

export interface AddEventModalProps {
  isOpen: boolean;
  selectedDate: string;
  initialStartTime?: string;
  isDark?: boolean;
  isGoogleConnected?: boolean;
  existingEvent?: any;
  onClose: () => void;
  onEventCreated?: () => void;
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
];

const ACADEMIC_PRESETS = [
  { label: 'Internal Exam', type: 'exam', icon: '📝' },
  { label: 'Lab Viva', type: 'viva', icon: '🎤' },
  { label: 'Project Submission', type: 'submission', icon: '📤' },
  { label: 'Placement Drive', type: 'job', icon: '💼' },
];

const RECURRENCE_OPTIONS = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
] as const;

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  selectedDate,
  initialStartTime,
  isGoogleConnected = false,
  existingEvent,
  onClose,
  onEventCreated,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [type, setType] = useState('exam');
  const [startTime, setStartTime] = useState(initialStartTime || '09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [syncToGCal, setSyncToGCal] = useState(isGoogleConnected);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state on open / initialStartTime change / existingEvent change
  useEffect(() => {
    if (existingEvent) {
      setTitle(existingEvent.title || '');
      setDate(existingEvent.date || selectedDate);
      setType(existingEvent.type || 'exam');
      setStartTime(existingEvent.startTime || '09:00');
      setEndTime(existingEvent.endTime || '10:00');
      setLocation(existingEvent.location || '');
      setDescription(existingEvent.description || '');
      setRecurrenceRule(existingEvent.recurrenceRule || 'none');
    } else {
      setTitle('');
      setDate(selectedDate);
      setType('exam');
      setStartTime(initialStartTime || '09:00');
      if (initialStartTime) {
        const [h, m] = initialStartTime.split(':').map(Number);
        const endH = Math.min(23, (h || 9) + 1);
        setEndTime(`${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`);
      } else {
        setEndTime('10:00');
      }
      setLocation('');
      setDescription('');
      setRecurrenceRule('none');
    }
  }, [selectedDate, initialStartTime, existingEvent]);

  // Real-time NLP parsing
  const parsedNLEvent: ParsedEvent | null = useMemo(() => {
    if (existingEvent || !title.trim() || title.trim().length < 3) return null;
    return parseNLEvent(title.trim());
  }, [title, existingEvent]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!existingEvent && newTitle.trim().length >= 3) {
      const p = parseNLEvent(newTitle.trim());
      if (p.date) setDate(p.date);
      if (p.startTime) setStartTime(p.startTime);
      if (p.endTime) setEndTime(p.endTime);
      if (p.type) setType(p.type);
    }
  };

  const handleApplyPreset = (preset: typeof ACADEMIC_PRESETS[0]) => {
    setTitle(preset.label);
    setType(preset.type);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !title.trim()) return;

    setIsSubmitting(true);
    try {
      const cleanTitle = parsedNLEvent?.title || title.trim();
      const payload: any = {
        title: cleanTitle,
        date,
        type,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        recurrenceRule: recurrenceRule !== 'none' ? recurrenceRule : undefined,
        userId: user.uid,
        updatedAt: Date.now(),
      };

      if (existingEvent?.id) {
        await updateDoc(doc(db, 'calendar_events', existingEvent.id), payload);
        toast.success('Event updated');
      } else {
        payload.createdAt = Date.now();
        await addDoc(collection(db, 'calendar_events'), payload);

        if (syncToGCal && isGoogleConnected) {
          try {
            await addEventToGoogleCalendar({
              summary: cleanTitle,
              start: { dateTime: `${date}T${startTime || '09:00'}:00` },
              end: { dateTime: `${date}T${endTime || '10:00'}:00` },
              description: description || undefined,
              location: location || undefined,
            });
            toast.success('Synced to Google Calendar');
          } catch (gErr) {
            console.warn('Google Calendar sync failed', gErr);
          }
        }
        toast.success('Event added to calendar');
      }

      onEventCreated?.();
      onClose();
    } catch (err) {
      console.error('Error saving calendar event:', err);
      toast.error('Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="calendar-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={onClose}
    >
      <motion.div
        className="calendar-modal-card"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="modal-header-left">
            <CalendarIcon size={18} color="#a599ff" />
            <h3>{existingEvent ? 'Edit Event' : 'Create Event'}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Academic Presets Row */}
        {!existingEvent && (
          <div className="calendar-academic-presets-bar">
            <span className="presets-label">QUICK PRESETS</span>
            <div className="presets-chips-row">
              {ACADEMIC_PRESETS.map((p, idx) => {
                const isSelected = title === p.label;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`preset-chip-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => handleApplyPreset(p)}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="calendar-modal-form">
          {/* Title Input with live NLP detection */}
          <div className="form-field-group">
            <div className="field-label-row">
              <label>Event Title</label>
              <div className="nlp-indicator-pill">
                <Sparkles size={11} className="nlp-sparkle-icon" />
                <span>S.A.R.A NLP</span>
              </div>
            </div>
            <div className="calendar-input-wrapper">
              <input
                type="text"
                className="calendar-input title-input"
                placeholder='e.g., "Midterm Exam next Friday from 10am to 12pm" or "Physics Viva"'
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Live NLP detected preview badge */}
            {parsedNLEvent && (
              <div className="calendar-nlp-live-preview">
                <Sparkles size={13} className="nlp-sparkle-icon" />
                <span className="nlp-preview-text">
                  Recognized: {parsedNLEvent.date ? `📅 ${parsedNLEvent.date} ` : ''}
                  {parsedNLEvent.startTime ? `⏰ ${format12Hour(parsedNLEvent.startTime)} ` : ''}
                  {parsedNLEvent.typeLabel ? `• ${parsedNLEvent.typeIcon} ${parsedNLEvent.typeLabel}` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Type Selector Pills (Subtle, unified theme styling) */}
          <div className="form-field-group">
            <label>
              <Tag size={12} /> Event Category
            </label>
            <div className="event-type-pills-row">
              {EVENT_TYPES.map(t => {
                const isSelected = type === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`event-type-pill ${isSelected ? 'selected' : ''}`}
                    onClick={() => setType(t.key)}
                  >
                    <span className="type-pill-icon">{t.icon}</span>
                    <span className="type-pill-label">{t.label}</span>
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

          {/* Recurrence Rule Row */}
          <div className="form-field-group">
            <label>
              <Repeat size={12} /> Recurrence
            </label>
            <div className="calendar-recurrence-pills-row">
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`recurrence-pill-btn ${recurrenceRule === opt.key ? 'active' : ''}`}
                  onClick={() => setRecurrenceRule(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
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
              placeholder="e.g. Room 402, Hall B, or Google Meet"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-field-group">
            <label>
              <AlignLeft size={12} /> Notes & Agenda (Optional)
            </label>
            <textarea
              className="calendar-textarea"
              rows={2}
              placeholder="Add extra syllabus notes, submission links, or agenda..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Google Calendar Sync Option */}
          {isGoogleConnected && !existingEvent && (
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
            <button type="button" className="calendar-cancel-btn" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="calendar-save-btn" disabled={!title.trim() || isSubmitting}>
              <Check size={16} />
              <span>{isSubmitting ? 'Saving...' : existingEvent ? 'Save Changes' : 'Create Event'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
