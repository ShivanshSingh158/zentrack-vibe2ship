import React from 'react';
import {
  X, Plus, Edit2, Trash2, Download, RotateCcw,
  BookOpen, FlaskConical, CalendarDays, Target, GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="tt-modal-overlay" onClick={onClose}>
          <motion.div
            className="tt-modal-dialog"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 350 } }}
            exit={{ opacity: 0, scale: 0.95, y: 15, transition: { duration: 0.15 } }}
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
        {/* Header matching Mobile Timetable Header */}
        <div className="tt-modal-header">
          <div className="tt-header-left">
            <h2 className="tt-header-title">Timetable</h2>
            <span className="tt-header-count-badge">
              {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}
            </span>
          </div>
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

              const totalAtt = clsAtt + labAtt;
              const totalHeld = clsTot + labTot;
              const totalPct = totalHeld > 0 ? Math.round((totalAtt / totalHeld) * 100) : null;

              const clsPct = clsTot > 0 ? Math.round((clsAtt / clsTot) * 100) : null;
              const labPct = labTot > 0 ? Math.round((labAtt / labTot) * 100) : null;

              const clsStatus = clsPct !== null ? (clsPct >= target ? 'safe' : clsPct >= target - 5 ? 'warning' : 'danger') : 'none';
              const labStatus = labPct !== null ? (labPct >= target ? 'safe' : labPct >= target - 5 ? 'warning' : 'danger') : 'none';

              // Build schedule items
              const scheduleItems: React.ReactNode[] = [];
              ['1', '2', '3', '4', '5', '6'].forEach(dKey => {
                const dayIdx = Number(dKey);
                const dSched = s.schedule?.[dKey] || s.schedule?.[dayIdx];
                const classes = Array.isArray(dSched?.classes) ? dSched.classes : [];
                const labs = Array.isArray(dSched?.labs) ? dSched.labs : [];
                const cCount = classes.length || (typeof dSched?.classCount === 'number' ? dSched.classCount : 0);
                const lCount = labs.length || (typeof dSched?.labCount === 'number' ? dSched.labCount : 0);
                const hasItems = cCount > 0 || lCount > 0;

                if (!hasItems) return;

                const parts: string[] = [];
                if (cCount > 0) parts.push(`${cCount}C`);
                if (lCount > 0) parts.push(`${lCount}L`);

                scheduleItems.push(
                  <span key={dKey} className="tt-day-badge">
                    <span className="tt-day-name">{DAY_SHORT[dayIdx]}:</span>
                    <span className="tt-day-val">{parts.join(' ')}</span>
                  </span>
                );
              });

              return (
                <div key={s.id} className="tt-subject-card">
                  {/* Card Header: Squircle Badge + Title + Target + Action Icons */}
                  <div className="tt-card-header">
                    <div className="tt-card-header-left">
                      <div className="tt-subject-badge">
                        <GraduationCap size={15} strokeWidth={2.2} />
                      </div>
                      <div className="tt-subject-title-group">
                        <div className="tt-subject-title-row">
                          <span className="tt-subject-title">{s.name}</span>
                          <span className="tt-target-pill">
                            <Target size={11} strokeWidth={2.2} />
                            <span>{target}%</span>
                          </span>
                          {totalPct !== null && (
                            <span className={`tt-status-pct-pill ${totalPct >= target ? 'safe' : totalPct >= target - 5 ? 'warning' : 'danger'}`}>
                              {totalPct}%
                            </span>
                          )}
                        </div>
                        {totalHeld > 0 && (
                          <div className="tt-subject-subtext">
                            <span>{totalAtt} of {totalHeld} attended</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="tt-card-actions">
                      <button
                        type="button"
                        className="tt-icon-action-btn edit"
                        onClick={() => onEditSubject(s)}
                        title="Edit Subject & Schedule"
                      >
                        <Edit2 size={13} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="tt-icon-action-btn delete"
                        onClick={() => onDeleteSubject(s.id!)}
                        title="Delete Subject"
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  {/* Infused Attendance Progress Rows (Seamlessly integrated, no cutout boxes) */}
                  <div className="tt-infused-bars">
                    <div className="tt-infused-bar-row">
                      <div className="tt-infused-tag class">
                        <BookOpen size={11} strokeWidth={2.5} />
                        <span>CLASS</span>
                      </div>
                      <div className="tt-infused-track">
                        <div
                          className={`tt-infused-fill ${clsStatus}`}
                          style={{ width: `${Math.min(100, clsPct ?? 0)}%` }}
                        />
                      </div>
                      <div className="tt-infused-stats">
                        <span className="tt-infused-count">{clsAtt}/{clsTot}</span>
                        {clsPct !== null && (
                          <span className={`tt-infused-pct ${clsStatus}`}>{clsPct}%</span>
                        )}
                      </div>
                    </div>

                    {(labTot > 0 || labAtt > 0) && (
                      <div className="tt-infused-bar-row">
                        <div className="tt-infused-tag lab">
                          <FlaskConical size={11} strokeWidth={2.5} />
                          <span>LAB</span>
                        </div>
                        <div className="tt-infused-track">
                          <div
                            className={`tt-infused-fill ${labStatus}`}
                            style={{ width: `${Math.min(100, labPct ?? 0)}%` }}
                          />
                        </div>
                        <div className="tt-infused-stats">
                          <span className="tt-infused-count">{labAtt}/{labTot}</span>
                          {labPct !== null && (
                            <span className={`tt-infused-pct ${labStatus}`}>{labPct}%</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Weekly Schedule Days Breakdown */}
                  <div className="tt-schedule-strip">
                    <div className="tt-schedule-anchor">
                      <CalendarDays size={12} strokeWidth={2.2} />
                      <span>Weekly:</span>
                    </div>
                    <div className="tt-schedule-badges">
                      {scheduleItems.length > 0 ? (
                        scheduleItems
                      ) : (
                        <span className="tt-no-sched-text">No weekly schedule configured</span>
                      )}
                    </div>
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
