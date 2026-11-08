import React, { useMemo, useState } from 'react';
import {
  X, Clock, MapPin, Video, Trash2, Edit2, CheckCircle2,
  AlertTriangle, BookOpen, Dumbbell, CheckSquare, Calendar as CalendarIcon,
  Check, Ban, Sparkles, GraduationCap
} from 'lucide-react';
import { format12Hour, getEventColors } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';
import { auth, db } from '../../services/firebase';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';

export interface CalendarInspectorProps {
  event: MergedCalendarEvent | null;
  onClose: () => void;
  onEdit: (event: MergedCalendarEvent) => void;
  onDelete: (event: MergedCalendarEvent) => void;
  isDark?: boolean;
  attendanceSubjects?: any[];
  attendanceLogs?: any[];
}

export const CalendarInspector: React.FC<CalendarInspectorProps> = ({
  event,
  onClose,
  onEdit,
  onDelete,
  isDark = true,
  attendanceSubjects = [],
  attendanceLogs = [],
}) => {
  const [logging, setLogging] = useState(false);

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

  const isClassOrLab = event.type === 'class' || event.type === 'lab';

  // Find matching subject
  const subject = useMemo(() => {
    if (!event || !isClassOrLab) return null;
    if (event.subjectId) {
      return attendanceSubjects.find(s => s.id === event.subjectId) || null;
    }
    const clean = (event.title || '').replace(/\s*\((Class|Lab)\)\s*/i, '').trim().toLowerCase();
    return attendanceSubjects.find(s => s.name?.toLowerCase() === clean) || null;
  }, [event, isClassOrLab, attendanceSubjects]);

  // Attendance stats for subject
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

  // Handle Attendance Action (Present, Absent, Cancelled)
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

      // Previous state reverse calculation if re-logging
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
        // Reverse previous action
        if (prevAction === 'attended') {
          deltaAttended -= 1;
          deltaTotal -= 1;
        } else if (prevAction === 'missed') {
          deltaTotal -= 1;
        }
        // Apply new action
        if (action === 'attended') {
          deltaAttended += 1;
          deltaTotal += 1;
        } else if (action === 'missed') {
          deltaTotal += 1;
        }
      }

      // Log payload
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

      // Subject count update
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
    } catch (err) {
      console.error('Error logging attendance from calendar:', err);
      toast.error('Failed to log attendance');
    } finally {
      setLogging(false);
    }
  };

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

      {/* Interactive Academic Timetable Card (Mobile Parity) */}
      {isClassOrLab && subject && stats && (
        <div className="inspector-attendance-card">
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
              style={{
                color: stats.pct >= 75 ? '#5eda9e' : '#ff6961',
              }}
            >
              {stats.bunkMsg}
            </span>
            <span className="att-card-counts">
              {stats.attended} / {stats.total} {stats.isLab ? 'labs' : 'classes'}
            </span>
          </div>

          {/* Current Status Pill if Logged */}
          {existingLog && (
            <div className={`att-logged-indicator ${existingLog.action}`}>
              {existingLog.action === 'attended' && '✅ Marked Present'}
              {existingLog.action === 'missed' && '❌ Marked Absent'}
              {existingLog.action === 'cancelled' && '⚠️ Class Cancelled'}
            </div>
          )}

          {/* One-Tap Action Buttons */}
          <div className="att-action-buttons-grid">
            <button
              type="button"
              className={`att-quick-btn present ${existingLog?.action === 'attended' ? 'active' : ''}`}
              onClick={() => handleLogAttendance('attended')}
              disabled={logging}
              title="Mark as Present"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Present</span>
            </button>
            <button
              type="button"
              className={`att-quick-btn absent ${existingLog?.action === 'missed' ? 'active' : ''}`}
              onClick={() => handleLogAttendance('missed')}
              disabled={logging}
              title="Mark as Absent"
            >
              <X size={13} strokeWidth={2.5} />
              <span>Absent</span>
            </button>
            <button
              type="button"
              className={`att-quick-btn cancelled ${existingLog?.action === 'cancelled' ? 'active' : ''}`}
              onClick={() => handleLogAttendance('cancelled')}
              disabled={logging}
              title="Class was cancelled"
            >
              <Ban size={13} strokeWidth={2} />
              <span>Cancelled</span>
            </button>
          </div>
        </div>
      )}

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

        {/* Recurrence Indicator if recurring */}
        {event.recurrenceRule && event.recurrenceRule !== 'none' && (
          <div className="inspector-meta-item">
            <Sparkles size={14} className="meta-icon" color="#a599ff" />
            <div className="meta-content">
              <span className="meta-label">Recurrence</span>
              <span className="meta-val" style={{ textTransform: 'capitalize' }}>
                {event.recurrenceRule} recurring event
              </span>
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
