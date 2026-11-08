import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Calendar as CalendarIcon, Clock, MapPin, AlignLeft,
  Trash2, Edit3, ExternalLink, Video, CheckCircle2, Check,
  Ban, GraduationCap, Repeat
} from 'lucide-react';
import { getEventColors, format12Hour } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';
import { auth, db } from '../../services/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';

export interface EventDetailModalProps {
  isOpen: boolean;
  event: MergedCalendarEvent | null;
  isDark?: boolean;
  attendanceSubjects?: any[];
  attendanceLogs?: any[];
  onClose: () => void;
  onEventUpdated?: () => void;
  onEventDeleted?: () => void;
  onDelete?: (event: MergedCalendarEvent) => void;
  onEdit?: (event: MergedCalendarEvent) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  isOpen,
  event,
  isDark = true,
  attendanceSubjects = [],
  attendanceLogs = [],
  onClose,
  onEventUpdated,
  onEventDeleted,
  onDelete,
  onEdit,
}) => {
  const [logging, setLogging] = useState(false);

  if (!isOpen || !event) return null;

  const colorMap = getEventColors(isDark);
  const colorSpec = colorMap[event.type] || colorMap.todo;

  const isCustomEvent =
    !event.id.startsWith('todo_') &&
    !event.id.startsWith('gcal_') &&
    !event.id.includes('-class-') &&
    !event.id.includes('-lab-') &&
    !event.id.startsWith('gym-');

  const isClassOrLab = event.type === 'class' || event.type === 'lab';

  // Find matching subject for classes/labs
  const subject = useMemo(() => {
    if (!event || !isClassOrLab) return null;
    if (event.subjectId) {
      return attendanceSubjects.find(s => s.id === event.subjectId) || null;
    }
    const clean = (event.title || '').replace(/\s*\((Class|Lab)\)\s*/i, '').trim().toLowerCase();
    return attendanceSubjects.find(s => s.name?.toLowerCase() === clean) || null;
  }, [event, isClassOrLab, attendanceSubjects]);

  // Attendance statistics
  const stats = useMemo(() => {
    if (!subject) return null;
    const isLab = event.type === 'lab' || event.sessionType === 'lab';
    const attended = isLab ? (subject.labsAttended || 0) : (subject.classesAttended || 0);
    const total = isLab ? (subject.labsTotal || 0) : (subject.classesTotal || 0);
    const pct = total > 0 ? Math.round((attended / total) * 100) : 100;

    let bunkMsg = '';
    let canBunk = 0;
    let mustAttend = 0;
    if (pct >= 75) {
      canBunk = Math.floor((attended - 0.75 * total) / 0.75);
      bunkMsg = canBunk > 0 ? `Can bunk ${canBunk} more ${isLab ? 'labs' : 'classes'}` : 'On the edge (75%)';
    } else {
      mustAttend = Math.ceil((0.75 * total - attended) / 0.25);
      bunkMsg = `Must attend ${mustAttend} more to reach 75%`;
    }
    return { attended, total, pct, isLab, bunkMsg, canBunk, mustAttend };
  }, [subject, event]);

  // Existing log check
  const existingLog = useMemo(() => {
    if (!subject || !event.date) return null;
    const targetType = event.sessionType || event.type || 'class';
    const targetIdx = event.sessionIdx ?? 0;
    return (attendanceLogs || []).find(
      (l: any) =>
        (l.subjectId === subject.id || l.subjectName === subject.name) &&
        (l.date || '').slice(0, 10) === event.date &&
        !l.isExtra &&
        (l.type || 'class') === targetType &&
        (l.idx ?? 0) === targetIdx
    );
  }, [subject, attendanceLogs, event]);

  // Handle Attendance Action
  const handleLogAttendance = async (action: 'attended' | 'missed' | 'cancelled') => {
    const user = auth.currentUser;
    if (!subject || !user || !event.date) return;

    setLogging(true);
    try {
      const isLab = event.type === 'lab' || event.sessionType === 'lab';
      const type = isLab ? 'lab' : 'class';
      const sessionIdx = event.sessionIdx ?? 0;
      const cleanDate = event.date;
      const logId = `${subject.id}_${cleanDate}_${type}_${sessionIdx}`;

      const batch = writeBatch(db);

      const prevAction = existingLog?.action;
      let deltaAttended = 0;
      let deltaTotal = 0;

      if (!existingLog) {
        if (action === 'attended') {
          deltaAttended = 1;
          deltaTotal = 1;
        } else if (action === 'missed') {
          deltaTotal = 1;
        }
      } else if (prevAction !== action) {
        if (prevAction === 'attended') {
          deltaAttended -= 1;
          deltaTotal -= 1;
        } else if (prevAction === 'missed') {
          deltaTotal -= 1;
        }
        if (action === 'attended') {
          deltaAttended += 1;
          deltaTotal += 1;
        } else if (action === 'missed') {
          deltaTotal += 1;
        }
      }

      const logData = {
        userId: user.uid,
        subjectId: subject.id,
        subjectName: subject.name,
        type,
        action,
        date: cleanDate,
        idx: sessionIdx,
        isExtra: false,
        timestamp: Date.now(),
      };

      batch.set(doc(db, 'attendance_logs', logId), logData, { merge: true });

      if (deltaTotal !== 0 || deltaAttended !== 0) {
        const subjectRef = doc(db, 'attendance_subjects', subject.id);
        const updates: any = {};
        if (isLab) {
          updates.labsTotal = Math.max(0, (subject.labsTotal || 0) + deltaTotal);
          updates.labsAttended = Math.max(0, (subject.labsAttended || 0) + deltaAttended);
        } else {
          updates.classesTotal = Math.max(0, (subject.classesTotal || 0) + deltaTotal);
          updates.classesAttended = Math.max(0, (subject.classesAttended || 0) + deltaAttended);
        }
        batch.update(subjectRef, updates);
      }

      await batch.commit();

      const label = action === 'attended' ? 'Present' : action === 'missed' ? 'Absent' : 'Cancelled';
      toast.success(`Marked as ${label} for ${subject.name}`);
      onEventUpdated?.();
    } catch (err) {
      console.error('Error logging attendance:', err);
      toast.error('Failed to log attendance');
    } finally {
      setLogging(false);
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
        className="calendar-modal-card detail-card"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="calendar-modal-header">
          <div
            className="detail-type-badge"
            style={{
              backgroundColor: colorSpec.bg,
              color: colorSpec.border,
              borderColor: colorSpec.border,
            }}
          >
            <span>{colorSpec.icon || '📅'}</span>
            <span>{colorSpec.label || event.type.toUpperCase()}</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Title */}
        <h3 className="detail-event-title" style={{ color: isDark ? '#ffffff' : '#111827' }}>
          {event.title}
        </h3>

        {/* Interactive Timetable HUD Card */}
        {isClassOrLab && subject && stats && (
          <div className="inspector-attendance-card" style={{ margin: '0.25rem 0 0.5rem 0' }}>
            <div className="att-card-header">
              <div className="att-card-subj-info">
                <GraduationCap size={15} color="#a599ff" />
                <span className="att-card-subj-name">{subject.name}</span>
              </div>
              <div
                className="att-card-pct-badge"
                style={{
                  backgroundColor: stats.pct >= 75 ? 'rgba(94, 218, 158, 0.15)' : 'rgba(255, 105, 97, 0.15)',
                  color: stats.pct >= 75 ? '#5eda9e' : '#ff6961',
                  borderColor: stats.pct >= 75 ? 'rgba(94, 218, 158, 0.3)' : 'rgba(255, 105, 97, 0.3)',
                }}
              >
                {stats.pct}%
              </div>
            </div>

            <div className="att-card-bunk-row">
              <span
                className="att-card-bunk-pill"
                style={{ color: stats.pct >= 75 ? '#5eda9e' : '#ff6961' }}
              >
                {stats.bunkMsg}
              </span>
              <span className="att-card-counts">
                {stats.attended} / {stats.total} {stats.isLab ? 'labs' : 'classes'}
              </span>
            </div>

            {/* Current Logged Status */}
            {existingLog && (
              <div className={`att-logged-indicator ${existingLog.action}`}>
                {existingLog.action === 'attended' && '✅ Marked Present'}
                {existingLog.action === 'missed' && '❌ Marked Absent'}
                {existingLog.action === 'cancelled' && '⚠️ Class Cancelled'}
              </div>
            )}

            {/* Attendance Buttons */}
            <div className="att-action-buttons-grid">
              <button
                type="button"
                className={`att-quick-btn present ${existingLog?.action === 'attended' ? 'active' : ''}`}
                onClick={() => handleLogAttendance('attended')}
                disabled={logging}
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Present</span>
              </button>
              <button
                type="button"
                className={`att-quick-btn absent ${existingLog?.action === 'missed' ? 'active' : ''}`}
                onClick={() => handleLogAttendance('missed')}
                disabled={logging}
              >
                <X size={13} strokeWidth={2.5} />
                <span>Absent</span>
              </button>
              <button
                type="button"
                className={`att-quick-btn cancelled ${existingLog?.action === 'cancelled' ? 'active' : ''}`}
                onClick={() => handleLogAttendance('cancelled')}
                disabled={logging}
              >
                <Ban size={13} strokeWidth={2} />
                <span>Cancelled</span>
              </button>
            </div>
          </div>
        )}

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

          {/* Recurrence */}
          {event.recurrenceRule && event.recurrenceRule !== 'none' && (
            <div className="detail-meta-row">
              <div className="detail-meta-icon-box">
                <Repeat size={16} color="#a599ff" />
              </div>
              <div className="detail-meta-content">
                <span className="detail-meta-primary" style={{ textTransform: 'capitalize' }}>
                  {event.recurrenceRule} recurring event
                </span>
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
          {isCustomEvent && onDelete && (
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
      </motion.div>
    </motion.div>
  );
};
