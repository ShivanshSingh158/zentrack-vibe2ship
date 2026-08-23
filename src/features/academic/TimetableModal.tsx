import React from 'react';
import { X, Plus, Edit2, Trash2, Download, RotateCcw } from 'lucide-react';
import type { AttendanceSubject } from './AttendanceModule';

interface TimetableModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: AttendanceSubject[];
  onAddSubject: () => void;
  onEditSubject: (subject: AttendanceSubject) => void;
  onDeleteSubject: (id: string) => void;
  onExportCSV: () => void;
  onResetSemester: () => void;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const TimetableModal: React.FC<TimetableModalProps> = ({
  isOpen,
  onClose,
  subjects,
  onAddSubject,
  onEditSubject,
  onDeleteSubject,
  onExportCSV,
  onResetSemester,
}) => {
  if (!isOpen) return null;

  return (
    <div className="tt-modal-overlay" onClick={onClose}>
      <div
        className="tt-modal-dialog"
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {/* Header matching Mobile Timetable Header */}
        <div className="tt-modal-header">
          <h2 className="tt-header-title">Timetable</h2>
          <div className="tt-header-actions">
            <button
              type="button"
              className="tt-add-btn"
              onClick={onAddSubject}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Add</span>
            </button>
            <button
              type="button"
              className="tt-close-btn"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Subjects List Scroll Area */}
        <div className="tt-modal-list custom-scrollbar">
          {subjects.length === 0 ? (
            <div className="tt-empty-state">
              <p className="tt-empty-title">No subjects added yet</p>
              <p className="tt-empty-desc">
                Tap "+ Add" above to configure your weekly timetable.
              </p>
            </div>
          ) : (
            subjects.map(s => {
              const target = s.targetPercentage || 75;
              const clsAtt = s.classesAttended || 0;
              const clsTot = s.classesTotal || 0;
              const labAtt = s.labsAttended || 0;
              const labTot = s.labsTotal || 0;

              return (
                <div key={s.id} className="tt-subject-card">
                  {/* Card Header: Subject Title + Round Action Icons */}
                  <div className="tt-card-header">
                    <span className="tt-subject-title">{s.name}</span>
                    <div className="tt-card-actions">
                      <button
                        type="button"
                        className="tt-icon-action-btn"
                        onClick={() => onEditSubject(s)}
                        title="Edit Subject & Schedule"
                      >
                        <Edit2 size={15} color="#8e8e93" />
                      </button>
                      <button
                        type="button"
                        className="tt-icon-action-btn delete"
                        onClick={() => onDeleteSubject(s.id!)}
                        title="Delete Subject"
                      >
                        <Trash2 size={15} color="#ff6961" />
                      </button>
                    </div>
                  </div>

                  {/* Subtitle: Target Attendance */}
                  <div className="tt-meta-row">
                    <span className="tt-target-label">Target:</span>
                    <span className="tt-target-val">{target}%</span>
                  </div>

                  {/* Metrics Tiles matching Mobile */}
                  <div className="tt-metrics-row">
                    <div className="tt-metric-chip">
                      <span className="tt-metric-label">Classes</span>
                      <span className="tt-metric-val">{clsAtt}/{clsTot}</span>
                    </div>
                    <div className="tt-metric-chip">
                      <span className="tt-metric-label">Labs</span>
                      <span className="tt-metric-val">{labAtt}/{labTot}</span>
                    </div>
                  </div>

                  {/* Weekly Schedule Days Breakdown */}
                  <div className="tt-schedule-strip">
                    {['1', '2', '3', '4', '5', '6'].map(dKey => {
                      const dayIdx = Number(dKey);
                      const dSched = s.schedule?.[dKey] || s.schedule?.[dayIdx];
                      const classes = Array.isArray(dSched?.classes) ? dSched.classes : [];
                      const labs = Array.isArray(dSched?.labs) ? dSched.labs : [];
                      const cCount = classes.length || (typeof dSched?.classCount === 'number' ? dSched.classCount : 0);
                      const lCount = labs.length || (typeof dSched?.labCount === 'number' ? dSched.labCount : 0);
                      const hasItems = cCount > 0 || lCount > 0;

                      if (!hasItems) return null;

                      const parts = [];
                      if (cCount > 0) parts.push(`${cCount}C`);
                      if (lCount > 0) parts.push(`${lCount}L`);

                      return (
                        <span key={dKey} className="tt-day-badge">
                          {DAY_SHORT[dayIdx]}: {parts.join(' ')}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions: Export CSV & Reset Semester */}
        {subjects.length > 0 && (
          <div className="tt-modal-footer">
            <button
              type="button"
              className="tt-footer-action-btn export"
              onClick={onExportCSV}
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              className="tt-footer-action-btn reset"
              onClick={onResetSemester}
            >
              <RotateCcw size={16} />
              <span>Reset Semester</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
