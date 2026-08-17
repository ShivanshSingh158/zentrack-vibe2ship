import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import {
  ClipboardList, Plus, X, Calendar, AlertTriangle, Check,
  Clock, FileText, Edit2, Trash2, BookOpen, ListChecks,
  Sparkles, CheckCircle2, AlertCircle, Layers, School, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { useSubjects } from '../../hooks/useSubjects';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export interface Assignment {
  id?: string;
  userId: string;
  title: string;
  subjectName: string;
  dueDate: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
  weightage?: number | null;
  maxMarks?: number | null;
  obtainedMarks?: number | null;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
  in_progress: { label: 'In Progress', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  submitted: { label: 'Submitted', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)' },
  graded: { label: 'Graded', color: '#5eda9e', bg: 'rgba(94,218,158,0.12)', border: 'rgba(94,218,158,0.3)' },
};

const getDaysUntilDue = (dueDate: string) => {
  const today = new Date(getLocalDateString(new Date()) + 'T00:00:00');
  const due = new Date(dueDate + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const AssignmentModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formCustomSubject, setFormCustomSubject] = useState('');
  const [formDueDate, setFormDueDate] = useState(getLocalDateString(new Date()));
  const [formWeightage, setFormWeightage] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<Assignment['status']>('not_started');
  const [formMaxMarks, setFormMaxMarks] = useState('');
  const [formObtainedMarks, setFormObtainedMarks] = useState('');

  // Timetable subjects for suggestions
  const { subjects: timetableSubjects } = useSubjects();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    const q = query(collection(db, 'assignments'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(data);
      setIsLoading(false);
    }, err => {
      console.error(err);
      toast.error('Failed to load assignments');
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  // Merge Timetable subjects + custom ones
  const allSubjectNames = useMemo(() => {
    const timetableNames = (timetableSubjects || []).map(s => s.name);
    const usedNames = assignments.map(a => a.subjectName).filter(Boolean);
    const merged = new Set([...timetableNames, ...usedNames]);
    return Array.from(merged).sort();
  }, [timetableSubjects, assignments]);

  const effectiveSubject = formSubject === '__custom__' ? formCustomSubject : formSubject;

  // Filtered & Sorted Assignments
  const filteredAssignments = useMemo(() => {
    let filtered = [...assignments];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    filtered.sort((a, b) => {
      const aDays = getDaysUntilDue(a.dueDate);
      const bDays = getDaysUntilDue(b.dueDate);
      const statusOrder = { not_started: 0, in_progress: 1, submitted: 2, graded: 3 };
      if (a.status === 'graded' && b.status !== 'graded') return 1;
      if (b.status === 'graded' && a.status !== 'graded') return -1;
      return aDays - bDays;
    });

    return filtered;
  }, [assignments, statusFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = assignments.length;
    const active = assignments.filter(a => a.status === 'not_started' || a.status === 'in_progress').length;
    const overdue = assignments.filter(a => getDaysUntilDue(a.dueDate) < 0 && a.status !== 'submitted' && a.status !== 'graded').length;
    const dueSoon = assignments.filter(a => {
      const d = getDaysUntilDue(a.dueDate);
      return d >= 0 && d <= 7 && a.status !== 'submitted' && a.status !== 'graded';
    }).length;
    const completed = assignments.filter(a => a.status === 'submitted' || a.status === 'graded').length;

    return { total, active, overdue, dueSoon, completed };
  }, [assignments]);

  // ── Handlers ──
  const handleOpenAddModal = () => {
    setEditingAssignment(null);
    setFormTitle('');
    setFormSubject(allSubjectNames[0] || '');
    setFormCustomSubject('');
    setFormDueDate(getLocalDateString(new Date()));
    setFormWeightage('');
    setFormDescription('');
    setFormStatus('not_started');
    setFormMaxMarks('');
    setFormObtainedMarks('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (a: Assignment) => {
    setEditingAssignment(a);
    setFormTitle(a.title);
    if (allSubjectNames.includes(a.subjectName)) {
      setFormSubject(a.subjectName);
      setFormCustomSubject('');
    } else {
      setFormSubject('__custom__');
      setFormCustomSubject(a.subjectName);
    }
    setFormDueDate(a.dueDate);
    setFormWeightage(a.weightage ? String(a.weightage) : '');
    setFormDescription(a.description || '');
    setFormStatus(a.status);
    setFormMaxMarks(a.maxMarks ? String(a.maxMarks) : '');
    setFormObtainedMarks(a.obtainedMarks ? String(a.obtainedMarks) : '');
    setIsModalOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!user || !formTitle.trim() || !effectiveSubject.trim()) {
      toast.error('Please enter a title and subject');
      return;
    }

    try {
      const data: Partial<Assignment> = {
        userId: user.uid,
        title: formTitle.trim(),
        subjectName: effectiveSubject.trim(),
        dueDate: formDueDate,
        status: formStatus,
        weightage: formWeightage ? parseFloat(formWeightage) : null,
        description: formDescription.trim(),
        maxMarks: formMaxMarks ? parseFloat(formMaxMarks) : null,
        obtainedMarks: formObtainedMarks ? parseFloat(formObtainedMarks) : null,
        updatedAt: Date.now(),
      };

      if (editingAssignment?.id) {
        await updateDoc(doc(db, 'assignments', editingAssignment.id), data);
        toast.success(`Updated "${formTitle}"`);
      } else {
        await addDoc(collection(db, 'assignments'), { ...data, createdAt: Date.now() });
        toast.success(`Created "${formTitle}"`);
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save assignment');
    }
  };

  const handleStatusChange = async (assignment: Assignment, nextStatus: Assignment['status']) => {
    try {
      await updateDoc(doc(db, 'assignments', assignment.id!), {
        status: nextStatus,
        updatedAt: Date.now(),
      });
      toast.success(`Marked as ${STATUS_CONFIG[nextStatus].label}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="as-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="as-header-bar">
        <div className="as-header-left">
          <h1 className="as-hero-title">Assignments & Coursework</h1>
          <span className="as-stats-subtitle">
            {stats.active} pending · {stats.dueSoon} due soon · {stats.completed} completed
          </span>
        </div>

        <div className="as-header-actions">
          {/* Status Filter Pills */}
          <button
            type="button"
            className={`as-filter-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span>All ({assignments.length})</span>
          </button>

          <button
            type="button"
            className={`as-filter-pill-btn ${statusFilter === 'not_started' ? 'active' : ''}`}
            onClick={() => setStatusFilter('not_started')}
          >
            <span>⏳ Not Started ({assignments.filter(a => a.status === 'not_started').length})</span>
          </button>

          <button
            type="button"
            className={`as-filter-pill-btn ${statusFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            <span>⚡ In Progress ({assignments.filter(a => a.status === 'in_progress').length})</span>
          </button>

          <button
            type="button"
            className={`as-filter-pill-btn ${statusFilter === 'submitted' ? 'active' : ''}`}
            onClick={() => setStatusFilter('submitted')}
          >
            <span>📤 Submitted ({assignments.filter(a => a.status === 'submitted').length})</span>
          </button>

          <button
            type="button"
            className={`as-filter-pill-btn ${statusFilter === 'graded' ? 'active' : ''}`}
            onClick={() => setStatusFilter('graded')}
          >
            <span>✅ Graded ({assignments.filter(a => a.status === 'graded').length})</span>
          </button>

          {/* New Assignment Solid CTA */}
          <button
            type="button"
            className="as-primary-add-btn"
            onClick={handleOpenAddModal}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Assignment</span>
          </button>
        </div>
      </div>

      {/* ── SUMMARY METRICS QUAD-CARDS ── */}
      <div className="as-metrics-grid">
        <div className="as-metric-card">
          <div className="as-metric-top">
            <span>Total Tracked</span>
            <ClipboardList size={14} color="var(--as-accent-purple)" />
          </div>
          <span className="as-metric-value">{stats.total}</span>
          <span className="as-metric-subtext">{stats.active} in active development</span>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-top">
            <span>Due This Week</span>
            <Clock size={14} color="var(--as-accent-amber)" />
          </div>
          <span className="as-metric-value" style={{ color: 'var(--as-accent-amber)' }}>
            {stats.dueSoon}
          </span>
          <span className="as-metric-subtext">Due within the next 7 days</span>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-top">
            <span>Overdue</span>
            <AlertTriangle size={14} color="var(--as-accent-rose)" />
          </div>
          <span className="as-metric-value" style={{ color: stats.overdue > 0 ? 'var(--as-accent-rose)' : '#ffffff' }}>
            {stats.overdue}
          </span>
          <span className="as-metric-subtext">{stats.overdue > 0 ? 'Urgent action required' : 'All clear & on schedule'}</span>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-top">
            <span>Completed & Graded</span>
            <CheckCircle2 size={14} color="var(--as-accent-emerald)" />
          </div>
          <span className="as-metric-value" style={{ color: 'var(--as-accent-emerald)' }}>
            {stats.completed}
          </span>
          <span className="as-metric-subtext">Submitted or officially evaluated</span>
        </div>
      </div>

      {/* ── ASSIGNMENTS LIST ── */}
      <div className="as-assignments-list">
        {filteredAssignments.length === 0 ? (
          <div className="notes-empty-state">
            <ClipboardList size={32} color="var(--as-accent-purple)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No assignments found</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--as-text-tertiary)', margin: 0 }}>
              {statusFilter === 'all'
                ? 'Create coursework items and deadlines to track submissions and grades.'
                : `No assignments matching the "${statusFilter}" filter.`}
            </p>
            <button
              type="button"
              className="as-primary-add-btn"
              onClick={handleOpenAddModal}
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Create Assignment</span>
            </button>
          </div>
        ) : (
          filteredAssignments.map((assignment) => {
            const daysLeft = getDaysUntilDue(assignment.dueDate);
            const isDone = assignment.status === 'submitted' || assignment.status === 'graded';
            const isOverdue = daysLeft < 0 && !isDone;
            const isDueSoon = daysLeft >= 0 && daysLeft <= 2 && !isDone;

            let deadlineClass = 'normal';
            let deadlineText = `${daysLeft} days left`;
            if (isDone) {
              deadlineClass = 'done';
              deadlineText = assignment.status === 'graded' ? 'Graded' : 'Submitted';
            } else if (isOverdue) {
              deadlineClass = 'overdue';
              deadlineText = `Overdue by ${Math.abs(daysLeft)}d`;
            } else if (daysLeft === 0) {
              deadlineClass = 'due-soon';
              deadlineText = 'Due Today!';
            } else if (daysLeft === 1) {
              deadlineClass = 'due-soon';
              deadlineText = 'Due Tomorrow';
            }

            return (
              <div
                key={assignment.id}
                className={`as-assignment-card ${isOverdue ? 'overdue' : ''}`}
              >
                <div className="as-card-left">
                  <div className="as-card-header-row">
                    <span className="as-subject-pill">{assignment.subjectName}</span>
                    {assignment.weightage ? (
                      <span className="as-weightage-tag">• Weight: {assignment.weightage}%</span>
                    ) : null}
                    {assignment.obtainedMarks != null && assignment.maxMarks != null ? (
                      <span className="as-weightage-tag">• Score: {assignment.obtainedMarks}/{assignment.maxMarks}</span>
                    ) : null}
                  </div>

                  <h3 className="as-card-title">{assignment.title}</h3>

                  {assignment.description ? (
                    <p className="as-card-desc">{assignment.description}</p>
                  ) : null}

                  <div className="as-card-meta-row">
                    <span className={`as-deadline-pill ${deadlineClass}`}>
                      <Clock size={11} />
                      <span>{deadlineText}</span>
                    </span>
                    <span>•</span>
                    <span>Due: {formatDisplayDate(assignment.dueDate)}</span>
                  </div>
                </div>

                {/* Right Side: Status Dropdown & Actions */}
                <div className="as-card-right">
                  <select
                    className="as-status-dropdown"
                    value={assignment.status}
                    onChange={(e) => handleStatusChange(assignment, e.target.value as Assignment['status'])}
                    style={{
                      background: STATUS_CONFIG[assignment.status].bg,
                      color: STATUS_CONFIG[assignment.status].color,
                      borderColor: STATUS_CONFIG[assignment.status].border,
                    }}
                  >
                    <option value="not_started" style={{ background: '#141416', color: '#fff' }}>⏳ Not Started</option>
                    <option value="in_progress" style={{ background: '#141416', color: '#fff' }}>⚡ In Progress</option>
                    <option value="submitted" style={{ background: '#141416', color: '#fff' }}>📤 Submitted</option>
                    <option value="graded" style={{ background: '#141416', color: '#fff' }}>✅ Graded</option>
                  </select>

                  <button
                    type="button"
                    className="att-card-action-btn"
                    onClick={() => handleOpenEditModal(assignment)}
                    title="Edit Assignment"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    type="button"
                    className="hb-card-delete-btn"
                    onClick={() => setDeleteConfirmId(assignment.id!)}
                    title="Delete Assignment"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── COURSEWORK STUDIO MODAL ── */}
      {isModalOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="notes-modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">{editingAssignment ? 'Edit Assignment' : 'New Assignment'}</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>
                ASSIGNMENT TITLE
                <input
                  type="text"
                  placeholder="e.g. CPU Scheduling Simulator, Midterm Project"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                />
              </label>

              {/* Subject Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>SUBJECT / COURSE</span>
                <select
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="notes-search-bar"
                  style={{ width: '100%', borderRadius: 8, color: '#fff' }}
                >
                  {allSubjectNames.map((s) => (
                    <option key={s} value={s} style={{ background: '#141416' }}>{s}</option>
                  ))}
                  <option value="__custom__" style={{ background: '#141416' }}>+ Custom Subject...</option>
                </select>

                {formSubject === '__custom__' && (
                  <input
                    type="text"
                    placeholder="Enter custom subject name"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                    value={formCustomSubject}
                    onChange={(e) => setFormCustomSubject(e.target.value)}
                  />
                )}
              </div>

              {/* Due Date & Weightage */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>
                  DUE DATE
                  <input
                    type="date"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem', colorScheme: 'dark' }}
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </label>

                <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>
                  WEIGHTAGE (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="e.g. 15"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                    value={formWeightage}
                    onChange={(e) => setFormWeightage(e.target.value)}
                  />
                </label>
              </div>

              {/* Status & Marks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>
                  STATUS
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as Assignment['status'])}
                    className="notes-search-bar"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem', color: '#fff' }}
                  >
                    <option value="not_started" style={{ background: '#141416' }}>⏳ Not Started</option>
                    <option value="in_progress" style={{ background: '#141416' }}>⚡ In Progress</option>
                    <option value="submitted" style={{ background: '#141416' }}>📤 Submitted</option>
                    <option value="graded" style={{ background: '#141416' }}>✅ Graded</option>
                  </select>
                </label>

                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600, flex: 1 }}>
                    SCORE
                    <input
                      type="number"
                      placeholder="Obt"
                      className="notes-search-bar notes-search-input"
                      style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                      value={formObtainedMarks}
                      onChange={(e) => setFormObtainedMarks(e.target.value)}
                    />
                  </label>
                  <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600, flex: 1 }}>
                    OUT OF
                    <input
                      type="number"
                      placeholder="Max"
                      className="notes-search-bar notes-search-input"
                      style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                      value={formMaxMarks}
                      onChange={(e) => setFormMaxMarks(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {/* Description */}
              <label style={{ fontSize: '0.76rem', color: 'var(--as-text-tertiary)', fontWeight: 600 }}>
                DESCRIPTION / NOTES
                <textarea
                  rows={2}
                  placeholder="Additional guidelines, rubric, or submission link..."
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem', resize: 'vertical' }}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </label>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="as-filter-pill-btn" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="as-primary-add-btn" onClick={handleSaveAssignment}>
                {editingAssignment ? 'Save Changes' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM DIALOG ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Assignment"
        message="Are you sure you want to permanently delete this assignment?"
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await deleteDoc(doc(db, 'assignments', deleteConfirmId));
            toast.success('Assignment deleted');
            setDeleteConfirmId(null);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};
