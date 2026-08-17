import React, { useState, useMemo } from 'react';
import { Calendar, Clock, AlertTriangle, X, Check, ArrowRight } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface BulkRescheduleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<string>;
  allTasks: TodoItem[];
  onConfirm: (newDate: string, newTimeSlot?: string) => Promise<void>;
}

const RESCHEDULE_TIME_SLOTS = [
  '6:00 AM–7:00 AM', '7:00 AM–8:00 AM', '7:30 AM–8:30 AM',
  '8:00 AM–9:00 AM', '8:30 AM–10:30 AM', '9:00 AM–10:00 AM',
  '10:00 AM–11:00 AM', '11:00 AM–12:00 PM', '11:30 AM–1:30 PM',
  '12:00 PM–1:00 PM', '1:00 PM–2:00 PM', '1:30 PM–3:30 PM',
  '2:00 PM–3:00 PM', '3:00 PM–4:00 PM', '3:30 PM–5:00 PM',
  '4:00 PM–5:00 PM', '5:00 PM–6:00 PM', '5:30 PM–7:00 PM',
  '6:00 PM–7:00 PM', '6:30 PM–8:30 PM', '7:00 PM–8:00 PM',
  '8:00 PM–9:00 PM', '9:00 PM–10:00 PM', '9:15 PM–10:00 PM',
];

function parseF(s?: string | null): number | null {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  const pm = up.includes('PM');
  const am = up.includes('AM');
  const cl = up.replace(/[APM\s]+$/i, '').trim();
  const pts = cl.split(':');
  let h = parseInt(pts[0], 10);
  if (isNaN(h)) return null;
  const m = pts.length >= 2 ? (parseInt(pts[1], 10) || 0) : 0;
  if (pm && h !== 12) h += 12;
  if (am && h === 12) h = 0;
  return h + m / 60;
}

export const BulkRescheduleSheet: React.FC<BulkRescheduleSheetProps> = ({
  isOpen,
  onClose,
  selectedTaskIds,
  allTasks,
  onConfirm,
}) => {
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [pickedDate, setPickedDate] = useState<string>(todayStr);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Tasks already on pickedDate (excluding selected ones)
  const existingBlocks = useMemo(() =>
    allTasks
      .filter(t => t.date === pickedDate && t.timeSlot && t.id && !selectedTaskIds.has(t.id))
      .map(t => ({ slot: t.timeSlot!, title: t.title || t.text || 'Task' })),
    [allTasks, pickedDate, selectedTaskIds]
  );

  const slotConflict = (slot: string): string | null => {
    const [sStr, eStr] = slot.split(/[-–]/);
    const sF = parseF(sStr);
    if (sF === null) return null;
    const eF = eStr ? parseF(eStr) : sF + 1;
    for (const b of existingBlocks) {
      const [bsStr, beStr] = b.slot.split(/[-–]/);
      const bsF = parseF(bsStr);
      if (bsF === null) continue;
      const beF = beStr ? parseF(beStr) : bsF + 1;
      if (sF < (beF ?? bsF + 1) && (eF ?? sF + 1) > bsF) return b.title;
    }
    return null;
  };

  const conflictOnSelected = pickedSlot ? slotConflict(pickedSlot) : null;
  const friendlyDate = pickedDate === todayStr ? 'Today' : pickedDate;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(pickedDate, pickedSlot || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card reschedule-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="reschedule-header">
          <div>
            <h3>Bulk Reschedule</h3>
            <p className="reschedule-sub">{selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'} selected</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Date Selector */}
        <div className="reschedule-section">
          <label className="reschedule-section-label">Target Date</label>
          <div className="reschedule-date-row">
            <input
              type="date"
              value={pickedDate}
              onChange={e => {
                setPickedDate(e.target.value);
                setPickedSlot(null);
              }}
              className="reschedule-date-input"
            />
            <button
              type="button"
              className={`reschedule-quick-date-btn ${pickedDate === todayStr ? 'active' : ''}`}
              onClick={() => setPickedDate(todayStr)}
            >
              Today
            </button>
            <button
              type="button"
              className="reschedule-quick-date-btn"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setPickedDate(getLocalDateString(tomorrow));
              }}
            >
              Tomorrow
            </button>
          </div>
        </div>

        {/* Existing Commitments Callout */}
        {existingBlocks.length > 0 && (
          <div className="reschedule-existing-callout">
            <div className="existing-callout-header">ALREADY ON {friendlyDate.toUpperCase()}:</div>
            <div className="existing-callout-list">
              {existingBlocks.map((b, i) => (
                <div key={i} className="existing-item">
                  <span className="existing-dot" />
                  <span className="existing-title">{b.title}</span>
                  <span className="existing-slot">({b.slot})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time Slot Picker */}
        <div className="reschedule-section">
          <div className="reschedule-section-label">
            <Clock size={14} />
            <span>Time Slot (Optional)</span>
          </div>

          <button
            type="button"
            className={`reschedule-slot-toggle ${pickedSlot === null ? 'active' : ''}`}
            onClick={() => setPickedSlot(null)}
          >
            <span className={`slot-radio ${pickedSlot === null ? 'checked' : ''}`} />
            <span>Move date only — keep current time slot</span>
          </button>

          <div className="reschedule-slots-grid">
            {RESCHEDULE_TIME_SLOTS.map(slot => {
              const conflict = slotConflict(slot);
              const isSel = pickedSlot === slot;
              return (
                <button
                  type="button"
                  key={slot}
                  onClick={() => setPickedSlot(isSel ? null : slot)}
                  className={`reschedule-slot-btn ${isSel ? 'selected' : ''} ${conflict ? 'has-conflict' : ''}`}
                >
                  <span className="slot-text">{slot}</span>
                  {conflict && !isSel && (
                    <span className="slot-conflict-tag" title={`Conflicts with: ${conflict}`}>
                      ⚠️ {conflict}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Conflict Warning */}
          {conflictOnSelected && (
            <div className="reschedule-conflict-warning">
              <AlertTriangle size={16} color="#ff6961" />
              <span>Conflicts with "{conflictOnSelected}" — you can still proceed</span>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div className="reschedule-footer">
          <button
            type="button"
            className="reschedule-confirm-btn"
            disabled={saving}
            onClick={handleConfirm}
          >
            {saving ? 'Rescheduling...' : `Move ${selectedTaskIds.size} tasks to ${friendlyDate}${pickedSlot ? ` · ${pickedSlot.split('–')[0].trim()}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
