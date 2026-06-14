import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import { ClipboardList, Plus, X, Calendar, AlertTriangle, Check, Clock, FileText, Edit2, Trash2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import type { Assignment } from '../../types/index';
import { useSubjects } from '../../hooks/useSubjects';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: Clock },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Edit2 },
  submitted: { label: 'Submitted', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: FileText },
  graded: { label: 'Graded', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: Check },
};

const getDaysUntilDue = (dueDate: string) => {
  const today = new Date(getLocalDateString(new Date()) + 'T00:00:00');
  const due = new Date(dueDate + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const getUrgencyColor = (daysLeft: number, status: string) => {
  if (status === 'submitted' || status === 'graded') return 'var(--text-muted)';
  if (daysLeft < 0) return '#ef4444';
  if (daysLeft <= 2) return '#f59e0b';
  if (daysLeft <= 7) return '#eab308';
  return '#10b981';
};

const getUrgencyLabel = (daysLeft: number, status: string) => {
  if (status === 'submitted') return 'Submitted';
  if (status === 'graded') return 'Graded';
  if (daysLeft < 0) return `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''}`;
  if (daysLeft === 0) return 'Due Today!';
  if (daysLeft === 1) return 'Due Tomorrow';
  return `${daysLeft} days left`;
};

export const AssignmentModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'subject' | 'status'>('dueDate');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formCustomSubject, setFormCustomSubject] = useState('');
  const [formDueDate, setFormDueDate] = useState(getLocalDateString(new Date()));
  const [formWeightage, setFormWeightage] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<Assignment['status']>('not_started');
  const [formGrade, setFormGrade] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formMaxMarks, setFormMaxMarks] = useState('');
  const [formObtainedMarks, setFormObtainedMarks] = useState('');

  // Timetable subjects from Attendance module
  const { subjects: timetableSubjects } = useSubjects();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'assignments'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(data);
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      toast.error('Failed to load assignments');
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Merge timetable subjects + any custom subjects already used in assignments
  const allSubjectNames = useMemo(() => {
    const timetableNames = timetableSubjects.map(s => s.name);
    const usedNames = assignments.map(a => a.subjectName).filter(Boolean);
    const merged = new Set([...timetableNames, ...usedNames]);
    return Array.from(merged).sort();
  }, [timetableSubjects, assignments]);

  // The effective subject for saving (select or custom input)
  const effectiveSubject = formSubject === '__custom__' ? formCustomSubject : formSubject;

  const filteredAssignments = useMemo(() => {
    let filtered = [...assignments];
    if (filterStatus !== 'all') filtered = filtered.filter(a => a.status === filterStatus);
    if (filterSubject !== 'all') filtered = filtered.filter(a => a.subjectName === filterSubject);

    filtered.sort((a, b) => {
      if (sortBy === 'dueDate') return a.dueDate.localeCompare(b.dueDate);
      if (sortBy === 'subject') return a.subjectName.localeCompare(b.subjectName);
      const statusOrder = { not_started: 0, in_progress: 1, submitted: 2, graded: 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    return filtered;
  }, [assignments, filterStatus, filterSubject, sortBy]);

  const stats = useMemo(() => {
    const total = assignments.length;
    const overdue = assignments.filter(a => getDaysUntilDue(a.dueDate) < 0 && a.status !== 'submitted' && a.status !== 'graded').length;
    const dueSoon = assignments.filter(a => { const d = getDaysUntilDue(a.dueDate); return d >= 0 && d <= 7 && a.status !== 'submitted' && a.status !== 'graded'; }).length;
    const submitted = assignments.filter(a => a.status === 'submitted' || a.status === 'graded').length;
    return { total, overdue, dueSoon, submitted };
  }, [assignments]);

  const resetForm = () => {
    setFormTitle(''); setFormSubject(''); setFormCustomSubject('');
    setFormDueDate(getLocalDateString(new Date()));
    setFormWeightage(''); setFormDescription(''); setFormStatus('not_started');
    setFormGrade(''); setFormMaxMarks(''); setFormObtainedMarks('');
    setEditingId(null);
  };

  const handleSave = async () => {
    const subjectToSave = effectiveSubject.trim();
    if (!user || !formTitle.trim() || !subjectToSave) {
      toast.error('Title and Subject are required');
      return;
    }
    try {
      const data: any = {
        userId: user.uid,
        title: formTitle.trim(),
        subjectName: subjectToSave,
        description: formDescription.trim(),
        dueDate: formDueDate,
        weightage: formWeightage ? parseFloat(formWeightage) : null,
        status: formStatus,
        grade: formGrade || null,
        maxMarks: formMaxMarks ? parseFloat(formMaxMarks) : null,
        obtainedMarks: formObtainedMarks ? parseFloat(formObtainedMarks) : null,
        updatedAt: Date.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'assignments', editingId), data);
        toast.success('Assignment updated!');
      } else {
        data.createdAt = Date.now();
        await addDoc(collection(db, 'assignments'), data);
        toast.success('Assignment added!');
      }
      resetForm();
      setShowAddModal(false);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
      toast.success('Deleted!');
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Assignment['status']) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { status: newStatus, updatedAt: Date.now() });
      toast.success(`Status → ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const openEdit = (a: Assignment) => {
    setFormTitle(a.title);
    // If the subject is in the timetable list use it; otherwise use custom
    const inTimetable = timetableSubjects.some(s => s.name === a.subjectName);
    if (inTimetable) {
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
    setFormGrade(a.grade || '');
    setFormMaxMarks(a.maxMarks ? String(a.maxMarks) : '');
    setFormObtainedMarks(a.obtainedMarks ? String(a.obtainedMarks) : '');
    setEditingId(a.id!);
    setShowAddModal(true);
  };

  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Assignments...</div>;

  return (
    <div className="page-pad">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>
            <ClipboardList size={26} style={{ color: '#8b5cf6' }} />
            Assignment Tracker
          </h1>
          <p className="subtitle">Track all your assignments, submissions, and grades.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <Plus size={16} /> New Assignment
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className="stat-card stat-purple">
          <div className="stat-icon" style={{ background: 'rgba(124,58,237,0.1)' }}><ClipboardList size={18} style={{ color: '#a855f7' }} /></div>
          <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className={`stat-card stat-red ${stats.overdue > 0 ? 'bg-danger-subtle' : ''}`} style={stats.overdue > 0 ? { borderColor: 'rgba(239,68,68,0.3)' } : {}}>
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)' }}><AlertTriangle size={18} style={{ color: '#f87171' }} /></div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{stats.overdue}</div>
          <div className="stat-label">Overdue</div>
        </div>
        <div className="stat-card stat-amber">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)' }}><Clock size={18} style={{ color: '#fbbf24' }} /></div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.dueSoon}</div>
          <div className="stat-label">Due This Week</div>
        </div>
        <div className="stat-card stat-green">
          <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)' }}><Check size={18} style={{ color: '#34d399' }} /></div>
          <div className="stat-value" style={{ color: '#10b981' }}>{stats.submitted}</div>
          <div className="stat-label">Submitted</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="submitted">Submitted</option>
          <option value="graded">Graded</option>
        </select>
        <select className="filter-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
          <option value="all">All Subjects</option>
          {allSubjectNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="filter-divider" />
        <span className="filter-label">Sort</span>
        <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
          <option value="dueDate">Due Date</option>
          <option value="subject">Subject</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Assignment Cards */}
      {filteredAssignments.length === 0 ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-subtle)' }}>
          <ClipboardList size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No assignments yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Click "New Assignment" to add your first one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredAssignments.map(a => {
            const daysLeft = getDaysUntilDue(a.dueDate);
            const urgencyColor = getUrgencyColor(daysLeft, a.status);
            const urgencyLabel = getUrgencyLabel(daysLeft, a.status);
            const sc = STATUS_CONFIG[a.status];
            const StatusIcon = sc.icon;

            return (
              <div key={a.id} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
                padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                borderLeft: `4px solid ${urgencyColor}`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                {/* Status badge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: '80px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <StatusIcon size={18} style={{ color: sc.color }} />
                  </div>
                  <select
                    value={a.status}
                    onChange={e => handleStatusChange(a.id!, e.target.value as Assignment['status'])}
                    style={{ fontSize: '0.7rem', background: 'transparent', border: 'none', color: sc.color, fontWeight: 600, cursor: 'pointer', textAlign: 'center', outline: 'none' }}
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="submitted">Submitted</option>
                    <option value="graded">Graded</option>
                  </select>
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {a.subjectName}
                    </span>
                    {a.weightage && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.weightage}% weightage</span>
                    )}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{a.title}</div>
                  {a.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{a.description}</div>}
                  {a.status === 'graded' && a.obtainedMarks != null && a.maxMarks != null && (
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981', marginTop: '0.25rem' }}>
                      Score: {a.obtainedMarks}/{a.maxMarks} {a.grade && `(${a.grade})`}
                    </div>
                  )}
                </div>

                {/* Due date & urgency */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', minWidth: '120px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Calendar size={14} /> {formatDisplayDate(a.dueDate)}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: urgencyColor, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {daysLeft < 0 && a.status !== 'submitted' && a.status !== 'graded' && <AlertTriangle size={12} />}
                    {urgencyLabel}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="btn-icon" onClick={() => openEdit(a)} title="Edit"><Edit2 size={14} /></button>
                  <button className="btn-icon danger" onClick={() => setConfirmDeleteId(a.id!)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem' }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(1rem, 4vw, 2rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{editingId ? 'Edit Assignment' : 'New Assignment'}</h2>
              <button className="btn-icon" onClick={() => { setShowAddModal(false); resetForm(); }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Title *</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g., DBMS ER Diagram Assignment" className="todo-input" style={{ width: '100%', padding: '0.6rem' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
                    Subject *
                    {timetableSubjects.length > 0 && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                        <BookOpen size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> from timetable
                      </span>
                    )}
                  </label>
                  <select
                    value={formSubject}
                    onChange={e => { setFormSubject(e.target.value); if (e.target.value !== '__custom__') setFormCustomSubject(''); }}
                    className="todo-input"
                    style={{ width: '100%', padding: '0.6rem' }}
                  >
                    <option value="">— Select Subject —</option>
                    {timetableSubjects.length > 0 && (
                      <optgroup label="📅 From Timetable">
                        {timetableSubjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </optgroup>
                    )}
                    <option value="__custom__">✏️ Other / Custom…</option>
                  </select>
                  {formSubject === '__custom__' && (
                    <input
                      type="text"
                      value={formCustomSubject}
                      onChange={e => setFormCustomSubject(e.target.value)}
                      placeholder="Type subject name…"
                      className="todo-input"
                      style={{ width: '100%', padding: '0.5rem', marginTop: '0.4rem' }}
                      autoFocus
                    />
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Due Date *</label>
                  <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} className="todo-input" style={{ width: '100%', padding: '0.6rem' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Weightage (%)</label>
                  <input type="number" value={formWeightage} onChange={e => setFormWeightage(e.target.value)} placeholder="e.g., 10" className="todo-input" style={{ width: '100%', padding: '0.6rem' }} min="0" max="100" />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value as Assignment['status'])} className="todo-input" style={{ width: '100%', padding: '0.6rem' }}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="submitted">Submitted</option>
                    <option value="graded">Graded</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Description</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Assignment details..." className="todo-input" style={{ width: '100%', padding: '0.6rem', minHeight: '80px', resize: 'vertical' }} />
              </div>

              {formStatus === 'graded' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', background: 'rgba(16,185,129,0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Obtained</label>
                    <input type="number" value={formObtainedMarks} onChange={e => setFormObtainedMarks(e.target.value)} className="todo-input" style={{ width: '100%', padding: '0.5rem' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Max Marks</label>
                    <input type="number" value={formMaxMarks} onChange={e => setFormMaxMarks(e.target.value)} className="todo-input" style={{ width: '100%', padding: '0.5rem' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Grade</label>
                    <input type="text" value={formGrade} onChange={e => setFormGrade(e.target.value)} placeholder="A+" className="todo-input" style={{ width: '100%', padding: '0.5rem' }} />
                  </div>
                </div>
              )}

              <button className="btn-primary" onClick={handleSave} style={{ marginTop: '0.5rem', justifyContent: 'center', padding: '0.75rem' }}>
                {editingId ? 'Update Assignment' : 'Add Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete Assignment"
        message="Are you sure you want to delete this assignment? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};
