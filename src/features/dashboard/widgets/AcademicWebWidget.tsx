/**
 * AcademicWebWidget.tsx — Web twin of mobile Academic & Attendance section
 * Subject rows with attendance percentage pills (Green/Amber/Red)
 */
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

interface AcademicWebWidgetProps {
  attendanceSubjects: any[];
}

function getAttendancePill(pct: number): { color: string; bg: string; border: string; label: string } {
  if (pct >= 75) return {
    color: '#5eda9e',
    bg: 'rgba(94,218,158,0.12)',
    border: 'rgba(94,218,158,0.28)',
    label: `${Math.round(pct)}% Safe`,
  };
  if (pct >= 65) return {
    color: '#ff9f4d',
    bg: 'rgba(255,159,77,0.12)',
    border: 'rgba(255,159,77,0.28)',
    label: `${Math.round(pct)}% At Risk`,
  };
  return {
    color: '#ff6961',
    bg: 'rgba(255,105,97,0.12)',
    border: 'rgba(255,105,97,0.28)',
    label: pct > 0 ? `${Math.round(pct)}% Low` : 'No Data',
  };
}

export function AcademicWebWidget({ attendanceSubjects }: AcademicWebWidgetProps) {
  const navigate = useNavigate();

  const subjects = attendanceSubjects.slice(0, 6);

  return (
    <div className="academic-card">
      {/* Header */}
      <div className="academic-header">
        <div className="academic-header-left">
          <GraduationCap size={13} color="#89dceb" />
          <span className="academic-section-label">Academic &amp; Attendance</span>
        </div>
        <button className="academic-details-link" onClick={() => navigate('/attendance')}>
          Details →
        </button>
      </div>

      {/* Subject rows */}
      <div className="academic-list">
        {subjects.length === 0 && (
          <div className="academic-empty">No subjects tracked yet</div>
        )}
        {subjects.map((subj: any, i: number) => {
          const attended = subj.classesAttended ?? 0;
          const total = subj.classesTotal ?? 0;
          const pct = total > 0 ? (attended / total) * 100 : 0;
          const pill = getAttendancePill(pct);

          return (
            <motion.div
              key={subj.id}
              className="academic-row"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              onClick={() => navigate('/attendance')}
            >
              <span className="academic-subj-name">{subj.name}</span>
              <span
                className="academic-pct-pill"
                style={{ color: pill.color, background: pill.bg, borderColor: pill.border }}
              >
                {pill.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
