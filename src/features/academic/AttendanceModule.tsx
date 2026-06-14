import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import { Check, X, RotateCcw, Edit2, GraduationCap, Plus, History, PieChart, Calendar, Settings, Palmtree, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { playPopSound } from '../../utils/sound';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface AttendanceSubject {
  id?: string;
  userId: string;
  name: string;
  classesAttended: number;
  classesTotal: number;
  labsAttended: number;
  labsTotal: number;
  targetPercentage: number;
  order: number;
  schedule: Record<string, { classCount: number, labCount: number }>;
}

const defaultSchedule: Record<string, { classCount: number, labCount: number }> = {
  '0': { classCount: 1, labCount: 0 },
  '1': { classCount: 1, labCount: 0 },
  '2': { classCount: 1, labCount: 0 },
  '3': { classCount: 1, labCount: 0 },
  '4': { classCount: 1, labCount: 0 },
  '5': { classCount: 1, labCount: 0 },
  '6': { classCount: 1, labCount: 0 },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AttendanceModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [isExtraClassOpen, setIsExtraClassOpen] = useState(false);
  const [extraClassSubject, setExtraClassSubject] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Auth: track user properly via onAuthStateChanged ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // ── Fetch Subjects ──
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'attendance_subjects'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, async (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject));
      
      const batch = writeBatch(db);
      let needsCommit = false;
      data.forEach(sub => {
        if (!sub.schedule) {
          sub.schedule = defaultSchedule;
          batch.update(doc(db, 'attendance_subjects', sub.id!), { schedule: defaultSchedule });
          needsCommit = true;
        }
      });
      if (needsCommit) await batch.commit();

      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSubjects(data);
      setIsLoading(false);
    }, (err) => {
      console.error('Subjects listener error:', err);
      toast.error('Failed to load subjects');
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ── Fetch Logs: simple query, sort client-side to avoid composite index requirement ──
  useEffect(() => {
    if (!user) return;
    const qLogs = query(
      collection(db, 'attendance_logs'),
      where('userId', '==', user.uid)
    );
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort client-side: newest first
      allLogs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(allLogs);
    }, (err) => {
      console.error('Logs listener error:', err);
      toast.error('Failed to load attendance logs');
    });
    return () => unsubLogs();
  }, [user]);

  // ── Add Subject ──
  const handleAddSubject = async () => {
    if (!user) { toast.error('Not logged in'); return; }
    try {
      await addDoc(collection(db, 'attendance_subjects'), {
        userId: user.uid,
        name: `New Subject`,
        classesAttended: 0,
        classesTotal: 0,
        labsAttended: 0,
        labsTotal: 0,
        targetPercentage: 75,
        order: subjects.length + 1,
        schedule: defaultSchedule
      });
      toast.success('Subject added!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to add subject: ${err.message}`);
    }
  };

  // ── Delete Subject ──
  const handleDeleteSubject = async (id: string) => {
    if (!user) { toast.error('Not logged in'); return; }
    try {
      const subjectLogs = logs.filter(l => l.subjectId === id);
      const batch = writeBatch(db);
      subjectLogs.forEach(l => batch.delete(doc(db, 'attendance_logs', l.id)));
      batch.delete(doc(db, 'attendance_subjects', id));
      await batch.commit();
      toast.success('Subject and its logs deleted');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  // ── Rename Subject ──
  const saveSubjectName = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateDoc(doc(db, 'attendance_subjects', id), { name: editName.trim() });
      setEditingId(null);
      toast.success('Name updated!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to update name: ${err.message}`);
    }
  };

  // ── LOG ATTENDANCE (Attended / Missed) ──
  const handleLog = async (subject: AttendanceSubject, type: 'class' | 'lab', action: 'attended' | 'missed', logDate: string = selectedDate, isExtra: boolean = false) => {
    if (!user) { toast.error('Not logged in — please refresh the page'); return; }
    if (!subject.id) { toast.error('Subject ID is missing'); return; }

    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';
    
    const currentAttended = subject[attendedKey] || 0;
    const currentTotal = subject[totalKey] || 0;
    const newAttended = currentAttended + (action === 'attended' ? 1 : 0);
    const newTotal = currentTotal + 1;

    try {
      playPopSound();
      const batch = writeBatch(db);

      // Update subject counters
      batch.update(doc(db, 'attendance_subjects', subject.id), {
        [attendedKey]: newAttended,
        [totalKey]: newTotal
      });

      // Create log entry
      const logRef = doc(collection(db, 'attendance_logs'));
      batch.set(logRef, {
        userId: user.uid,
        subjectId: subject.id,
        subjectName: subject.name,
        type,
        action,
        date: logDate,
        isExtra,
        timestamp: Date.now()
      });

      await batch.commit();
      toast.success(`${action === 'attended' ? '✓ Attended' : '✗ Missed'} — ${subject.name} (${type})`);
      if (isExtra) setExtraClassSubject('');
    } catch (err: any) {
      console.error('handleLog error:', err);
      toast.error(`Failed to log: ${err.message}`);
    }
  };

  // ── UNDO a log entry ──
  const handleUndo = async (logId: string) => {
    if (!user) { toast.error('Not logged in — please refresh the page'); return; }

    const logToUndo = logs.find(l => l.id === logId);
    if (!logToUndo) {
      toast.error('Could not find this log entry. Try refreshing the page.');
      return;
    }

    const subject = subjects.find(s => s.id === logToUndo.subjectId);
    if (!subject) {
      toast.error('Could not find the subject for this log. It may have been deleted.');
      return;
    }

    const type = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';

    const currentAttended = subject[attendedKey] || 0;
    const currentTotal = subject[totalKey] || 0;
    const newAttended = Math.max(0, currentAttended - (logToUndo.action === 'attended' ? 1 : 0));
    const newTotal = Math.max(0, currentTotal - 1);

    try {
      const batch = writeBatch(db);

      // Revert subject counters
      batch.update(doc(db, 'attendance_subjects', subject.id!), {
        [attendedKey]: newAttended,
        [totalKey]: newTotal
      });

      // Delete the log entry
      batch.delete(doc(db, 'attendance_logs', logId));

      await batch.commit();
      toast.success(`Undone! Reverted ${logToUndo.action} for ${subject.name}`);
    } catch (err: any) {
      console.error('handleUndo error:', err);
      toast.error(`Failed to undo: ${err.message}`);
    }
  };

  // ── Update timetable schedule ──
  const handleUpdateSchedule = async (subId: string, dayIdx: string, field: 'classCount'|'labCount', value: number) => {
    const sub = subjects.find(s => s.id === subId);
    if (!sub) return;
    
    const currentSchedule = sub.schedule || defaultSchedule;
    const newSchedule = { ...currentSchedule };
    if (!newSchedule[dayIdx]) newSchedule[dayIdx] = { classCount: 0, labCount: 0 };
    newSchedule[dayIdx] = { ...newSchedule[dayIdx], [field]: Math.max(0, value) };
    
    try {
      await updateDoc(doc(db, 'attendance_subjects', subId), { schedule: newSchedule });
    } catch (err: any) {
      toast.error(`Failed to update schedule: ${err.message}`);
    }
  };

  // ── Calculate bunk status ──
  const calculateStatus = (attended: number, total: number, target: number) => {
    attended = attended || 0;
    total = total || 0;
    target = target || 75;
    if (total === 0) return { pct: 100, safe: true, bunkInfo: 'No classes yet' };
    const pct = (attended / total) * 100;
    const safe = pct >= target;
    
    let bunkInfo = '';
    if (safe) {
      const safeToMiss = Math.floor((attended * 100 / target) - total);
      bunkInfo = safeToMiss > 0 ? `Safe to bunk ${safeToMiss}` : 'On the edge (0 bunks)';
    } else {
      const needToAttend = Math.ceil((target * total - 100 * attended) / (100 - target));
      bunkInfo = `Attend next ${needToAttend} to reach ${target}%`;
    }

    return { pct, safe, bunkInfo };
  };

  // ── Derived State ──
  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
  
  const todayScheduledSubjects = useMemo(() => {
    return subjects.filter(s => {
      const sch = s.schedule?.[selectedDayOfWeek];
      return sch && (sch.classCount > 0 || sch.labCount > 0);
    });
  }, [subjects, selectedDayOfWeek]);

  const logsForSelectedDate = useMemo(() => {
    return logs.filter(l => l.date === selectedDate && !l.isExtra);
  }, [logs, selectedDate]);

  // Global Stats
  const globalAttended = subjects.reduce((sum, s) => sum + (s.classesAttended || 0) + (s.labsAttended || 0), 0);
  const globalTotal = subjects.reduce((sum, s) => sum + (s.classesTotal || 0) + (s.labsTotal || 0), 0);
  const globalPct = globalTotal === 0 ? 100 : (globalAttended / globalTotal) * 100;
  const globalSafe = globalPct >= 75;

  const chartData = [
    { name: 'Attended', value: globalAttended, color: '#10b981' },
    { name: 'Missed', value: Math.max(0, globalTotal - globalAttended), color: '#ef4444' }
  ];

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Attendance Data...</div>;
  }

  return (
    <div className="page-pad">
      
      <div className="page-header">
        <div className="page-header-info">
          <h1>
            <GraduationCap size={26} className="icon-blue" />
            Attendance Tracker
          </h1>
          <p className="subtitle">Log specific classes according to your timetable.</p>
        </div>
        
        <div className="page-header-actions">
          <div className="date-picker-wrap">
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={() => setIsTimetableModalOpen(true)}>
            <Settings size={16} /> Timetable
          </button>
        </div>
      </div>

      <div className="attendance-top-container">
        
        {/* Global Summary */}
        <div className="panel panel-green attendance-summary-panel">
          <div className="panel-body" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <h2 className="overview-title" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PieChart size={18} /> <span>Semester Overview</span>
              </h2>
              <div className="global-pct" style={{ fontSize: '3rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: globalSafe ? '#10b981' : '#ef4444' }}>
                {Math.round(globalPct)}%
              </div>
              <div className="global-total" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Total: {globalAttended} / {globalTotal}
              </div>
            </div>
            <div className="pie-chart-container" style={{ width: '120px', height: '120px' }}>
              {globalTotal > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={chartData} innerRadius={40} outerRadius={55} paddingAngle={5} dataKey="value" stroke="none">
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Global Log History */}
        <div className="panel attendance-log-panel">
          <div className="panel-header">
            <h2><History size={18} /> <span>Global Log History</span></h2>
          </div>
          <div className="panel-body">
            {logs.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No logs yet.</div>
            ) : (
              <div className="log-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} className="log-history-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div className="log-history-title" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        <span style={{ color: log.action === 'attended' ? '#10b981' : '#ef4444' }}>{log.action === 'attended' ? '✓ Attended' : '✗ Missed'}</span> {log.isExtra ? '(Extra) ' : ''}{log.type || 'class'} for <strong>{log.subjectName}</strong>
                      </div>
                      <div className="log-history-time" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {formatDisplayDate(log.date)} • {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    <button className="btn-secondary btn-xs undo-btn" onClick={() => handleUndo(log.id)} title="Undo this log">
                      <RotateCcw size={12} /> <span className="undo-text">Undo</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Extra Classes Card — at bottom since extra classes happen rarely */}
        <div className="attendance-extra-class">
          {!isExtraClassOpen ? (
            <button className="btn-secondary" onClick={() => setIsExtraClassOpen(true)} style={{ width: '100%', padding: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
              <PlusCircle size={15} className="icon-green" /> Log Extra Class
            </button>
          ) : (
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-subtle)', opacity: 0.85 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                  <PlusCircle size={15} className="icon-green" /> Log Extra Class
                </h2>
                <button className="btn-icon" onClick={() => setIsExtraClassOpen(false)} style={{ padding: '0.2rem' }}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={extraClassSubject}
                  onChange={e => setExtraClassSubject(e.target.value)}
                  style={{ flex: 1, padding: '0.45rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  <option value="">Select Subject...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {extraClassSubject && (
                  <>
                    <button onClick={() => { const s = subjects.find(s => s.id === extraClassSubject); if(s) handleLog(s, 'class', 'attended', selectedDate, true); }} className="btn-secondary" style={{ color: '#10b981', border: '1px solid #10b98130', fontSize: '0.82rem', padding: '0.35rem 0.6rem' }} title="Attended Extra Class">
                      <Check size={14} /> Class
                    </button>
                    <button onClick={() => { const s = subjects.find(s => s.id === extraClassSubject); if(s) handleLog(s, 'lab', 'attended', selectedDate, true); }} className="btn-secondary" style={{ color: '#10b981', border: '1px solid #10b98130', fontSize: '0.82rem', padding: '0.35rem 0.6rem' }} title="Attended Extra Lab">
                      <Check size={14} /> Lab
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

      </div>


        {/* Timetable / Daily View */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Schedule for {formatDisplayDate(selectedDate)}
            </h2>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)' }}>
              {DAY_NAMES[parseInt(selectedDayOfWeek)]}
            </div>
          </div>
          
          {todayScheduledSubjects.length === 0 ? (
            <div style={{ padding: '3rem 2rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px dashed rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
              <Palmtree size={48} style={{ color: '#10b981', margin: '0 auto 1rem auto', opacity: 0.8 }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>No classes scheduled today!</h3>
              <p style={{ color: 'var(--text-muted)' }}>It's a holiday or off-day. Enjoy your free time!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
              {todayScheduledSubjects.map(subject => {
                const sch = subject.schedule[selectedDayOfWeek];
                const classLogsToday = logsForSelectedDate.filter(l => l.subjectId === subject.id && (l.type === 'class' || !l.type)).sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
                const labLogsToday = logsForSelectedDate.filter(l => l.subjectId === subject.id && l.type === 'lab').sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
                
                const classStatus = calculateStatus(subject.classesAttended, subject.classesTotal, subject.targetPercentage);
                const labStatus = calculateStatus(subject.labsAttended, subject.labsTotal, subject.targetPercentage);

                // Get recent logs for this subject (across all dates)
                const subjectRecentLogs = logs.filter(l => l.subjectId === subject.id).slice(0, 5);

                return (
                  <div key={subject.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Subject Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.1)' }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{subject.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Target: {subject.targetPercentage}%
                      </div>
                    </div>

                    {/* Classes Row */}
                    {sch.classCount > 0 && (
                      <div style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ flex: '1 1 100px' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Classes ({sch.classCount})</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: classStatus.safe ? '#10b981' : '#ef4444' }}>
                              {Math.round(classStatus.pct)}%
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({subject.classesAttended || 0}/{subject.classesTotal || 0})</span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: classStatus.safe ? 'var(--text-secondary)' : '#ef4444', marginTop: '0.1rem', fontWeight: 500 }}>
                            {classStatus.bunkInfo}
                          </div>
                        </div>

                        {/* Inline Sessions */}
                        <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {Array.from({ length: sch.classCount }).map((_, idx) => {
                            const logForSession = classLogsToday[idx];
                            return (
                              <div key={`class-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-base)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Class {idx + 1}</span>
                                {logForSession ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', color: logForSession.action === 'attended' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                      {logForSession.action === 'attended' ? '✓ Attended' : '✗ Missed'}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                      {new Date(logForSession.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                    <button onClick={() => handleUndo(logForSession.id)} className="btn-secondary" style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem', borderColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                      <RotateCcw size={10} /> Undo
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button onClick={() => handleLog(subject, 'class', 'attended')} className="btn-secondary btn-sm btn-success-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                      <Check size={12} /> Attended
                                    </button>
                                    <button onClick={() => handleLog(subject, 'class', 'missed')} className="btn-secondary btn-sm btn-danger-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                      <X size={12} /> Missed
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Labs Row */}
                    {sch.labCount > 0 && (
                      <div style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ flex: '1 1 100px' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Labs ({sch.labCount})</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: labStatus.safe ? '#10b981' : '#ef4444' }}>
                              {Math.round(labStatus.pct)}%
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({subject.labsAttended || 0}/{subject.labsTotal || 0})</span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: labStatus.safe ? 'var(--text-secondary)' : '#ef4444', marginTop: '0.1rem', fontWeight: 500 }}>
                            {labStatus.bunkInfo}
                          </div>
                        </div>

                        {/* Inline Sessions */}
                        <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {Array.from({ length: sch.labCount }).map((_, idx) => {
                            const logForSession = labLogsToday[idx];
                            return (
                              <div key={`lab-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-base)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Lab {idx + 1}</span>
                                {logForSession ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', color: logForSession.action === 'attended' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                      {logForSession.action === 'attended' ? '✓ Attended' : '✗ Missed'}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                      {new Date(logForSession.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                    <button onClick={() => handleUndo(logForSession.id)} className="btn-secondary" style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem', borderColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                      <RotateCcw size={10} /> Undo
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button onClick={() => handleLog(subject, 'lab', 'attended')} className="btn-secondary btn-sm btn-success-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                      <Check size={12} /> Attended
                                    </button>
                                    <button onClick={() => handleLog(subject, 'lab', 'missed')} className="btn-secondary btn-sm btn-danger-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                      <X size={12} /> Missed
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Subject Recent Logs */}
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>RECENT LOGS</div>
                      {subjectRecentLogs.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No logs yet for this subject.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {subjectRecentLogs.map(log => (
                            <div key={`recent-${log.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                              <span style={{ color: log.action === 'attended' ? '#10b981' : '#ef4444' }}>
                                {log.action === 'attended' ? '✓ Attended' : '✗ Missed'} {log.type || 'class'} {log.isExtra ? '(Extra)' : ''}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {formatDisplayDate(log.date)} {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                                <button onClick={() => handleUndo(log.id)} className="btn-icon" title="Undo" style={{ padding: '0.1rem' }}>
                                  <RotateCcw size={11} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Timetable Setup Modal */}
      {isTimetableModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Configure Timetable & Subjects</h2>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Add/edit subjects, and set the number of classes and labs per day.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn-primary" onClick={handleAddSubject}>
                  <Plus size={16} /> Add Subject
                </button>
                <button className="btn-icon" onClick={() => setIsTimetableModalOpen(false)}><X size={20} /></button>
              </div>
            </div>
            
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {subjects.map(subject => (
                <div key={subject.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    
                    {editingId === subject.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                        <input 
                          autoFocus 
                          type="text" 
                          value={editName} 
                          onChange={e => setEditName(e.target.value)} 
                          onBlur={() => saveSubjectName(subject.id!)}
                          onKeyDown={e => e.key === 'Enter' && saveSubjectName(subject.id!)}
                          className="todo-input" 
                          style={{ flex: 1, padding: '0.25rem 0.5rem' }} 
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, fontSize: '1.1rem', color: 'var(--accent-primary)', flex: 1 }}>
                        {subject.name}
                        <button onClick={() => { setEditingId(subject.id!); setEditName(subject.name); }} className="btn-icon" style={{ opacity: 0.5 }}><Edit2 size={14}/></button>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Target %</label>
                        <input 
                          type="number" 
                          value={subject.targetPercentage} 
                          onChange={async (e) => {
                            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                            await updateDoc(doc(db, 'attendance_subjects', subject.id!), { targetPercentage: val });
                          }}
                          style={{ width: '60px', padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <button className="btn-icon danger" onClick={() => setConfirmDeleteId(subject.id!)} title="Delete Subject">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'center' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 500 }}>Type</th>
                          {DAY_NAMES.map(day => (
                            <th key={day} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 500 }}>{day.substring(0,3)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>Classes</td>
                          {Object.keys(defaultSchedule).map(dayIdx => (
                            <td key={`class-${dayIdx}`} style={{ padding: '0.5rem' }}>
                              <input 
                                type="number" 
                                min="0" max="10"
                                value={subject.schedule?.[dayIdx]?.classCount || 0}
                                onChange={(e) => handleUpdateSchedule(subject.id!, dayIdx, 'classCount', parseInt(e.target.value) || 0)}
                                style={{ width: '50px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
                              />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>Labs</td>
                          {Object.keys(defaultSchedule).map(dayIdx => (
                            <td key={`lab-${dayIdx}`} style={{ padding: '0.5rem' }}>
                              <input 
                                type="number" 
                                min="0" max="10"
                                value={subject.schedule?.[dayIdx]?.labCount || 0}
                                onChange={(e) => handleUpdateSchedule(subject.id!, dayIdx, 'labCount', parseInt(e.target.value) || 0)}
                                style={{ width: '50px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete Subject"
        message="Are you sure you want to delete this subject and all its logs? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteId) handleDeleteSubject(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};
