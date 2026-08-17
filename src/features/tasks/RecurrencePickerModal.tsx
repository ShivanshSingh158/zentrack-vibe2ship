import React, { useState } from 'react';
import { Repeat, X, Check } from 'lucide-react';
import type { RecurrenceRule } from '../../types';

interface RecurrencePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: RecurrenceRule;
  onSave: (rule: RecurrenceRule) => void;
}

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const RecurrencePickerModal: React.FC<RecurrencePickerModalProps> = ({
  isOpen,
  onClose,
  rule,
  onSave,
}) => {
  const [type, setType] = useState<RecurrenceRule['type']>(rule.type || 'once');
  const [interval, setInterval] = useState<number>(rule.interval || 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(rule.daysOfWeek || [1, 2, 3, 4, 5]); // default Mon-Fri
  const [endDate, setEndDate] = useState<string>(rule.endDate || '');

  if (!isOpen) return null;

  const toggleDay = (dayIdx: number) => {
    if (daysOfWeek.includes(dayIdx)) {
      setDaysOfWeek(prev => prev.filter(d => d !== dayIdx));
    } else {
      setDaysOfWeek(prev => [...prev, dayIdx].sort());
    }
  };

  const handleSave = () => {
    onSave({
      type,
      interval: type === 'custom' ? interval : 1,
      daysOfWeek: type === 'weekly' ? daysOfWeek : undefined,
      endDate: endDate || undefined,
    });
    onClose();
  };

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card recurrence-modal" onClick={e => e.stopPropagation()}>
        <div className="recurrence-header">
          <div className="recurrence-header-left">
            <Repeat size={20} color="#a599ff" />
            <h3>Repeat Task</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="recurrence-body">
          {/* Recurrence Types */}
          <div className="recurrence-types-grid">
            {[
              { id: 'once', label: 'Does not repeat' },
              { id: 'daily', label: 'Every day' },
              { id: 'weekly', label: 'Every week' },
              { id: 'monthly', label: 'Every month' },
              { id: 'custom', label: 'Custom interval' },
            ].map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => setType(item.id as any)}
                className={`recurrence-type-btn ${type === item.id ? 'selected' : ''}`}
              >
                <span>{item.label}</span>
                {type === item.id && <Check size={16} color="#a599ff" />}
              </button>
            ))}
          </div>

          {/* Weekly day checkboxes */}
          {type === 'weekly' && (
            <div className="recurrence-section">
              <label>Repeat on:</label>
              <div className="recurrence-days-row">
                {DAY_NAMES.map((dayLetter, idx) => {
                  const isSelected = daysOfWeek.includes(idx);
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      className={`day-circle-btn ${isSelected ? 'selected' : ''}`}
                      title={DAY_LABELS[idx]}
                    >
                      {dayLetter}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom interval */}
          {type === 'custom' && (
            <div className="recurrence-section">
              <label>Repeat every:</label>
              <div className="custom-interval-row">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={interval}
                  onChange={e => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="interval-input"
                />
                <span>days</span>
              </div>
            </div>
          )}

          {/* Optional End Date */}
          {type !== 'once' && (
            <div className="recurrence-section">
              <label>End Repeat (Optional):</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="recurrence-end-date-input"
              />
            </div>
          )}
        </div>

        <div className="recurrence-footer">
          <button type="button" className="recurrence-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="recurrence-save-btn" onClick={handleSave}>
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
};
