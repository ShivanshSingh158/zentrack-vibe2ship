import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { LearningTopic, LearningSubTask } from '../../types';
import { toast } from 'sonner';

interface ScheduleStudyModalProps {
  topic: LearningTopic;
  subtask: LearningSubTask;
  onClose: () => void;
}

export const ScheduleStudyModal: React.FC<ScheduleStudyModalProps> = ({ topic, subtask, onClose }) => {
  const [slot, setSlot] = useState<'today' | 'tomorrow' | 'task' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customStartTime, setCustomStartTime] = useState('19:00');
  const [customEndTime, setCustomEndTime] = useState('20:00');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('Please sign in to schedule study sessions');
      return;
    }

    setSaving(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = tmrw.toISOString().split('T')[0];

    try {
      if (slot === 'today' || slot === 'tomorrow' || slot === 'custom') {
        const targetDate = slot === 'today' ? todayStr : slot === 'tomorrow' ? tmrwStr : customDate;
        const sTime = slot === 'custom' ? customStartTime : '19:00';
        const eTime = slot === 'custom' ? customEndTime : '20:00';
        const dayLabel = slot === 'today' ? 'Today' : slot === 'tomorrow' ? 'Tomorrow' : targetDate;

        await addDoc(collection(db, 'calendar_events'), {
          userId: user.uid,
          title: `Study: ${subtask.title}`,
          date: targetDate,
          startTime: sTime,
          endTime: eTime,
          type: 'assignment',
          notes: `Topic: ${topic.title}\nURL: ${subtask.url || ''}`,
          createdAt: serverTimestamp(),
        });

        toast.success(`🎉 Scheduled "${subtask.title}" on ${dayLabel} (${sTime} - ${eTime})!`);
      } else {
        await addDoc(collection(db, 'todos'), {
          userId: user.uid,
          title: `Study: ${subtask.title}`,
          text: `Study: ${subtask.title}`,
          date: todayStr,
          timeSlot: '19:00 - 20:00',
          startTime: '19:00',
          endTime: '20:00',
          priority: 'medium',
          tags: ['Study', topic.title.slice(0, 15)],
          status: 'pending',
          completed: false,
          notes: `Topic: ${topic.title}\nURL: ${subtask.url || ''}`,
          createdAt: serverTimestamp(),
        });

        toast.success(`🎉 Added "${subtask.title}" to your Task timeline!`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule study session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-content lp-schedule-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="lp-modal-header">
          <div className="lp-modal-header-left">
            <div className="lp-modal-icon-badge">
              <Calendar size={18} color="#a599ff" />
            </div>
            <div>
              <h3 className="lp-modal-title">Schedule Study Session</h3>
              <p className="lp-modal-subtitle">{subtask.title}</p>
            </div>
          </div>
          <button type="button" className="lp-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Options */}
        <div className="lp-schedule-options">
          <label className={`lp-schedule-option ${slot === 'today' ? 'active' : ''}`} onClick={() => setSlot('today')}>
            <div className="schedule-option-left">
              <div className="schedule-option-dot" />
              <div>
                <div className="schedule-option-title">Today Evening</div>
                <div className="schedule-option-time">7:00 PM – 8:00 PM (Calendar)</div>
              </div>
            </div>
            <Clock size={16} className="schedule-option-icon" />
          </label>

          <label className={`lp-schedule-option ${slot === 'tomorrow' ? 'active' : ''}`} onClick={() => setSlot('tomorrow')}>
            <div className="schedule-option-left">
              <div className="schedule-option-dot" />
              <div>
                <div className="schedule-option-title">Tomorrow Evening</div>
                <div className="schedule-option-time">7:00 PM – 8:00 PM (Calendar)</div>
              </div>
            </div>
            <Calendar size={16} className="schedule-option-icon" />
          </label>

          <label className={`lp-schedule-option ${slot === 'task' ? 'active' : ''}`} onClick={() => setSlot('task')}>
            <div className="schedule-option-left">
              <div className="schedule-option-dot" />
              <div>
                <div className="schedule-option-title">Add to Tasks Timeline</div>
                <div className="schedule-option-time">Adds a focused pending task for today</div>
              </div>
            </div>
            <CheckCircle2 size={16} className="schedule-option-icon" />
          </label>

          <label className={`lp-schedule-option ${slot === 'custom' ? 'active' : ''}`} onClick={() => setSlot('custom')}>
            <div className="schedule-option-left">
              <div className="schedule-option-dot" />
              <div>
                <div className="schedule-option-title">Custom Date & Time</div>
                <div className="schedule-option-time">Pick custom calendar slot</div>
              </div>
            </div>
            <Clock size={16} className="schedule-option-icon" />
          </label>
        </div>

        {/* Custom fields if selected */}
        {slot === 'custom' && (
          <div className="lp-custom-schedule-fields">
            <div className="lp-input-group">
              <label className="lp-input-label">Date</label>
              <input
                type="date"
                className="lp-text-input"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
              />
            </div>
            <div className="lp-input-row">
              <div className="lp-input-group">
                <label className="lp-input-label">Start Time</label>
                <input
                  type="time"
                  className="lp-text-input"
                  value={customStartTime}
                  onChange={e => setCustomStartTime(e.target.value)}
                />
              </div>
              <div className="lp-input-group">
                <label className="lp-input-label">End Time</label>
                <input
                  type="time"
                  className="lp-text-input"
                  value={customEndTime}
                  onChange={e => setCustomEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="lp-modal-footer">
          <button type="button" className="lp-btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="lp-btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Scheduling...' : 'Confirm Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};
