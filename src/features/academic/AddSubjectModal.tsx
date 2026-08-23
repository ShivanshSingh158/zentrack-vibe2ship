import React, { useState, useEffect, useMemo } from 'react';
import { X, Sparkles, Calculator, Plus, Trash2 } from 'lucide-react';
import type { AttendanceSubject } from './AttendanceModule';

interface AddSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSubject?: AttendanceSubject | null;
  onSave: (subjectData: any) => Promise<void>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Map visual index to actual Date.getDay() (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
const DAY_MAP = [1, 2, 3, 4, 5, 6, 0];

const defaultInitialSchedule: Record<string, { classes: any[]; labs: any[]; classCount: number; labCount: number }> = {
  '0': { classes: [], labs: [], classCount: 0, labCount: 0 },
  '1': { classes: [{ time: '10:00 AM', room: '' }], labs: [], classCount: 1, labCount: 0 },
  '2': { classes: [{ time: '10:00 AM', room: '' }], labs: [], classCount: 1, labCount: 0 },
  '3': { classes: [{ time: '10:00 AM', room: '' }], labs: [], classCount: 1, labCount: 0 },
  '4': { classes: [{ time: '10:00 AM', room: '' }], labs: [], classCount: 1, labCount: 0 },
  '5': { classes: [{ time: '10:00 AM', room: '' }], labs: [], classCount: 1, labCount: 0 },
  '6': { classes: [], labs: [], classCount: 0, labCount: 0 },
};

export const AddSubjectModal: React.FC<AddSubjectModalProps> = ({
  isOpen,
  onClose,
  existingSubject,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [targetPercentage, setTargetPercentage] = useState('75');
  const [schedule, setSchedule] = useState<any>(defaultInitialSchedule);
  const [loading, setLoading] = useState(false);

  // ── Mid-Semester Calibration State ──
  const [calibrationMode, setCalibrationMode] = useState<'fresh' | 'mid_semester'>('fresh');
  const [classesAttended, setClassesAttended] = useState('');
  const [classesTotal, setClassesTotal] = useState('');
  const [hasLabs, setHasLabs] = useState(false);
  const [labsAttended, setLabsAttended] = useState('');
  const [labsTotal, setLabsTotal] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (existingSubject) {
        setName(existingSubject.name);
        setTargetPercentage(existingSubject.targetPercentage?.toString() || '75');

        const hasExistingCounts = (existingSubject.classesTotal || 0) > 0 || (existingSubject.labsTotal || 0) > 0;
        setCalibrationMode(hasExistingCounts ? 'mid_semester' : 'fresh');
        setClassesAttended(existingSubject.classesAttended ? existingSubject.classesAttended.toString() : '0');
        setClassesTotal(existingSubject.classesTotal ? existingSubject.classesTotal.toString() : '0');

        const subjectHasLabs = (existingSubject.labsTotal || 0) > 0 || (existingSubject.labsAttended || 0) > 0;
        setHasLabs(subjectHasLabs);
        setLabsAttended(existingSubject.labsAttended ? existingSubject.labsAttended.toString() : '0');
        setLabsTotal(existingSubject.labsTotal ? existingSubject.labsTotal.toString() : '0');

        const migratedSchedule: any = {};
        for (let i = 0; i < 7; i++) {
          const dStr = i.toString();
          const d = existingSubject.schedule?.[dStr] || { classCount: 0, labCount: 0, classes: [], labs: [] };

          let newClasses = d.classes || [];
          if (newClasses.length === 0 && d.classCount > 0) {
            newClasses = Array.from({ length: d.classCount }).map(() => ({ time: '', room: '' }));
          }

          let newLabs = d.labs || [];
          if (newLabs.length === 0 && d.labCount > 0) {
            newLabs = Array.from({ length: d.labCount }).map(() => ({ time: '', room: '' }));
          }

          migratedSchedule[dStr] = {
            classes: newClasses,
            labs: newLabs,
            classCount: newClasses.length,
            labCount: newLabs.length,
          };
        }
        setSchedule(migratedSchedule);
      } else {
        setName('');
        setTargetPercentage('75');
        setCalibrationMode('fresh');
        setClassesAttended('');
        setClassesTotal('');
        setHasLabs(false);
        setLabsAttended('');
        setLabsTotal('');
        setSchedule(defaultInitialSchedule);
      }
    }
  }, [isOpen, existingSubject]);

  // ── Calibration Preview Calculations ──
  const previewData = useMemo(() => {
    if (calibrationMode === 'fresh') return null;
    const cAtt = Math.max(0, parseInt(classesAttended, 10) || 0);
    const cTot = Math.max(0, parseInt(classesTotal, 10) || 0);
    const lAtt = hasLabs ? Math.max(0, parseInt(labsAttended, 10) || 0) : 0;
    const lTot = hasLabs ? Math.max(0, parseInt(labsTotal, 10) || 0) : 0;
    const totalAtt = cAtt + lAtt;
    const totalTot = cTot + lTot;
    const target = parseInt(targetPercentage, 10) || 75;

    if (totalTot === 0) return { pct: 100, safe: true, label: 'Enter held & attended counts to preview baseline' };
    const pct = (totalAtt / totalTot) * 100;
    const safe = pct >= target;

    if (safe) {
      const canMiss = Math.floor((totalAtt * 100 / target) - totalTot);
      return {
        pct: Math.round(pct * 10) / 10,
        safe: true,
        label: canMiss > 0 ? `✓ Starting Safe: Can miss up to ${canMiss} upcoming class${canMiss > 1 ? 'es' : ''}` : `⚠️ On the edge: 0 skips remaining at ${target}% target`,
      };
    } else {
      const need = Math.ceil((target * totalTot - 100 * totalAtt) / (100 - target));
      return {
        pct: Math.round(pct * 10) / 10,
        safe: false,
        label: `🚨 Starting Below Target: Need to attend next ${need} class${need > 1 ? 'es' : ''} in a row`,
      };
    }
  }, [calibrationMode, classesAttended, classesTotal, hasLabs, labsAttended, labsTotal, targetPercentage]);

  const addSession = (dayIdx: number, type: 'classes' | 'labs') => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr.push({ time: type === 'classes' ? '10:00 AM' : '02:00 PM', room: '' });
      return {
        ...prev,
        [dayIdx.toString()]: {
          ...current,
          [type]: arr,
          [`${type === 'classes' ? 'classCount' : 'labCount'}`]: arr.length,
        },
      };
    });
  };

  const removeSession = (dayIdx: number, type: 'classes' | 'labs', idx: number) => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr.splice(idx, 1);
      return {
        ...prev,
        [dayIdx.toString()]: {
          ...current,
          [type]: arr,
          [`${type === 'classes' ? 'classCount' : 'labCount'}`]: arr.length,
        },
      };
    });
  };

  const updateSession = (dayIdx: number, type: 'classes' | 'labs', idx: number, field: 'time' | 'room', value: string) => {
    setSchedule((prev: any) => {
      const current = prev[dayIdx.toString()] || { classes: [], labs: [] };
      const arr = [...(current[type] || [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return {
        ...prev,
        [dayIdx.toString()]: { ...current, [type]: arr },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      const target = parseInt(targetPercentage, 10) || 75;
      let cAtt = 0;
      let cTot = 0;
      let lAtt = 0;
      let lTot = 0;

      if (calibrationMode === 'mid_semester') {
        cAtt = Math.max(0, parseInt(classesAttended, 10) || 0);
        cTot = Math.max(cAtt, parseInt(classesTotal, 10) || 0);
        lAtt = hasLabs ? Math.max(0, parseInt(labsAttended, 10) || 0) : 0;
        lTot = hasLabs ? Math.max(lAtt, parseInt(labsTotal, 10) || 0) : 0;
      }

      await onSave({
        name: name.trim(),
        targetPercentage: target,
        classesAttended: cAtt,
        classesTotal: cTot,
        labsAttended: lAtt,
        labsTotal: lTot,
        schedule,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tt-modal-overlay" onClick={onClose}>
      <div
        className="tt-modal-dialog"
        style={{ maxWidth: '640px' }}
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <div className="tt-modal-header">
          <h2 className="tt-header-title">{existingSubject ? 'Edit Subject' : 'Add Subject'}</h2>
          <button type="button" className="tt-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="tt-modal-list custom-scrollbar">
          {/* Subject Name Input Group */}
          <div className="tt-input-group">
            <label className="tt-input-label">Subject Name</label>
            <input
              type="text"
              className="tt-text-input"
              placeholder="e.g., Data Structures & Algorithms"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Target Percentage Input Group */}
          <div className="tt-input-group">
            <div className="tt-input-label-row">
              <label className="tt-input-label">Target Percentage (%)</label>
              <span className="tt-target-slider-val">{targetPercentage}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={targetPercentage}
              onChange={e => setTargetPercentage(e.target.value)}
              className="tt-range-slider"
            />
          </div>

          {/* ── Mid-Semester Calibration Segmented Control ── */}
          <div className="tt-input-group">
            <label className="tt-input-label">Starting Point Calibration</label>

            <div className="tt-segmented-control">
              <button
                type="button"
                className={`tt-seg-btn ${calibrationMode === 'fresh' ? 'active' : ''}`}
                onClick={() => setCalibrationMode('fresh')}
              >
                <Sparkles size={14} />
                <span>Starting Fresh (0/0)</span>
              </button>
              <button
                type="button"
                className={`tt-seg-btn ${calibrationMode === 'mid_semester' ? 'active' : ''}`}
                onClick={() => setCalibrationMode('mid_semester')}
              >
                <Calculator size={14} />
                <span>Mid-Semester Baseline</span>
              </button>
            </div>

            {calibrationMode === 'fresh' ? (
              <p className="tt-helper-text">
                ✨ Starting with 0 classes. You'll log attendance day-by-day as classes happen.
              </p>
            ) : (
              <div className="tt-calibration-card">
                <span className="tt-calib-header">
                  Input your past attendance record to calibrate your baseline stats:
                </span>

                {/* Classes inputs */}
                <div>
                  <span className="tt-micro-label">Classes Attended / Total Held</span>
                  <div className="tt-calib-row">
                    <input
                      type="number"
                      min="0"
                      placeholder="Attended (e.g. 24)"
                      value={classesAttended}
                      onChange={e => setClassesAttended(e.target.value)}
                      className="tt-calib-input"
                    />
                    <span className="tt-calib-slash">/</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Total Held (e.g. 30)"
                      value={classesTotal}
                      onChange={e => setClassesTotal(e.target.value)}
                      className="tt-calib-input"
                    />
                  </div>
                </div>

                {/* Labs Toggle */}
                <label className="tt-lab-toggle-row">
                  <input
                    type="checkbox"
                    checked={hasLabs}
                    onChange={e => setHasLabs(e.target.checked)}
                    className="tt-checkbox"
                  />
                  <span className="tt-lab-toggle-text">
                    Include Separate Lab Attendance
                  </span>
                </label>

                {hasLabs && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <span className="tt-micro-label">Labs Attended / Total Held</span>
                    <div className="tt-calib-row">
                      <input
                        type="number"
                        min="0"
                        placeholder="Attended (e.g. 5)"
                        value={labsAttended}
                        onChange={e => setLabsAttended(e.target.value)}
                        className="tt-calib-input"
                      />
                      <span className="tt-calib-slash">/</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Total Held (e.g. 6)"
                        value={labsTotal}
                        onChange={e => setLabsTotal(e.target.value)}
                        className="tt-calib-input"
                      />
                    </div>
                  </div>
                )}

                {/* Live Calibration Stats Preview */}
                {previewData && (
                  <div className={`tt-preview-card ${previewData.safe ? 'safe' : 'danger'}`}>
                    <div className="tt-preview-header">
                      <span className="tt-preview-title">Calibrated Starting Baseline</span>
                      <span className="tt-preview-pct">{previewData.pct}%</span>
                    </div>
                    <span className="tt-preview-label">{previewData.label}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weekly Schedule (Monday - Sunday) */}
          <div className="tt-input-group">
            <label className="tt-input-label">Weekly Schedule (Classes / Labs)</label>

            <div className="tt-days-list">
              {DAYS.map((dayName, i) => {
                const dayIdx = DAY_MAP[i];
                const sched = schedule[dayIdx.toString()] || { classes: [], labs: [] };
                const classes = sched.classes || [];
                const labs = sched.labs || [];

                return (
                  <div key={dayName} className="tt-day-card">
                    <div className="tt-day-header">
                      <span className="tt-day-title">{dayName}</span>
                      <div className="tt-day-actions">
                        <button
                          type="button"
                          className="tt-add-session-btn class"
                          onClick={() => addSession(dayIdx, 'classes')}
                        >
                          <Plus size={12} strokeWidth={2.5} />
                          <span>Class</span>
                        </button>
                        <button
                          type="button"
                          className="tt-add-session-btn lab"
                          onClick={() => addSession(dayIdx, 'labs')}
                        >
                          <Plus size={12} strokeWidth={2.5} />
                          <span>Lab</span>
                        </button>
                      </div>
                    </div>

                    {classes.length === 0 && labs.length === 0 ? (
                      <div className="tt-no-sessions">No sessions scheduled</div>
                    ) : null}

                    {/* Classes List */}
                    {classes.map((cls: any, idx: number) => (
                      <div key={`class-${idx}`} className="tt-session-row">
                        <span className="tt-session-type class">CLASS</span>
                        <input
                          type="text"
                          placeholder="Time (e.g. 10:00 AM)"
                          value={cls.time || ''}
                          onChange={e => updateSession(dayIdx, 'classes', idx, 'time', e.target.value)}
                          className="tt-session-input time"
                        />
                        <input
                          type="text"
                          placeholder="Room"
                          value={cls.room || ''}
                          onChange={e => updateSession(dayIdx, 'classes', idx, 'room', e.target.value)}
                          className="tt-session-input room"
                        />
                        <button
                          type="button"
                          className="tt-session-del-btn"
                          onClick={() => removeSession(dayIdx, 'classes', idx)}
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    {/* Labs List */}
                    {labs.map((lab: any, idx: number) => (
                      <div key={`lab-${idx}`} className="tt-session-row">
                        <span className="tt-session-type lab">LAB</span>
                        <input
                          type="text"
                          placeholder="Time (e.g. 02:00 PM)"
                          value={lab.time || ''}
                          onChange={e => updateSession(dayIdx, 'labs', idx, 'time', e.target.value)}
                          className="tt-session-input time"
                        />
                        <input
                          type="text"
                          placeholder="Room"
                          value={lab.room || ''}
                          onChange={e => updateSession(dayIdx, 'labs', idx, 'room', e.target.value)}
                          className="tt-session-input room"
                        />
                        <button
                          type="button"
                          className="tt-session-del-btn"
                          onClick={() => removeSession(dayIdx, 'labs', idx)}
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tt-modal-footer" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="tt-footer-action-btn cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tt-save-btn"
              disabled={loading}
            >
              {loading ? 'Saving...' : existingSubject ? 'Update Subject' : 'Save Subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
