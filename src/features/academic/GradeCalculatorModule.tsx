import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import { Calculator, Plus, Trash2, Edit2, TrendingUp, Target, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Semester, SemesterSubject } from '../../types/index';
import {  Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Line, ComposedChart } from 'recharts';
import { useSubjects } from '../../hooks/useSubjects';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

// Standard 10-point grading scale (A+ = 10, no O)
const GRADE_OPTIONS = [
  { label: 'A+', points: 10 },
  { label: 'A',  points: 9  },
  { label: 'B+', points: 8  },
  { label: 'B',  points: 7  },
  { label: 'C',  points: 6  },
  { label: 'D',  points: 5  },
  { label: 'F',  points: 0  },
];
const GRADE_MAP: Record<string, number> = Object.fromEntries(
  GRADE_OPTIONS.map(g => [g.label, g.points])
);

const gradeColor = (gp: number | null | undefined) => {
  if (gp == null) return 'var(--text-muted)';
  if (gp >= 9) return '#10b981';
  if (gp >= 7) return '#3b82f6';
  if (gp >= 5) return '#f59e0b';
  return '#ef4444';
};

export const GradeCalculatorModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<SemesterSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSemId, setActiveSemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New semester inline
  const [showAddSem, setShowAddSem] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const semInputRef = useRef<HTMLInputElement>(null);

  // Inline add/edit subject row
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [subName, setSubName]     = useState('');
  const [subCredits, setSubCredits] = useState('4');
  const [subGrade, setSubGrade]   = useState('A+');
  const subNameRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<{type: 'semester'|'subject', id: string} | null>(null);

  // Target CGPA
  const [targetCGPA, setTargetCGPA] = useState('9.0');
  const [targetCredits, setTargetCredits] = useState('24');

  // Direct SGPA inline
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [directSGPA, setDirectSGPA] = useState('');
  const [directCredits, setDirectCredits] = useState('24');

  // Timetable subjects for suggestions
  const { subjects: timetableSubjects } = useSubjects();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'semesters'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSemesters(data);
      if (data.length > 0) {
        setActiveSemId(prev => prev && data.find(s => s.id === prev) ? prev : data[data.length - 1].id!);
      }
      setIsLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'semester_subjects'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject)));
    });
  }, [user]);

  const activeSemSubjects = useMemo(() =>
    subjects.filter(s => s.semesterId === activeSemId),
    [subjects, activeSemId]
  );

  const calculateSGPA = (semSubjects: SemesterSubject[]) => {
    const graded = semSubjects.filter(s => s.grade && GRADE_MAP[s.grade] != null);
    if (graded.length === 0) return null;
    let totalCredits = 0, totalPoints = 0;
    graded.forEach(s => {
      const gp = GRADE_MAP[s.grade!];
      totalCredits += s.credits;
      totalPoints  += s.credits * gp;
    });
    return totalCredits > 0 ? totalPoints / totalCredits : null;
  };

  const cgpaData = useMemo(() => {
    let cumCredits = 0, cumPoints = 0;
    return semesters.map(sem => {
      const isDirect = sem.sgpa != null && sem.totalCredits != null;
      let sgpa = null;
      let credits = 0;

      if (isDirect) {
        sgpa = sem.sgpa!;
        credits = sem.totalCredits!;
        cumCredits += credits;
        cumPoints += credits * sgpa;
      } else {
        const semSubs = subjects.filter(s => s.semesterId === sem.id);
        sgpa = calculateSGPA(semSubs);
        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            cumCredits += s.credits;
            cumPoints  += s.credits * GRADE_MAP[s.grade!];
          }
        });
        credits = semSubs.reduce((acc, sub) => acc + sub.credits, 0);
      }

      const cgpa = cumCredits > 0 ? cumPoints / cumCredits : null;
      return {
        name: sem.name,
        sgpa:  sgpa  ? parseFloat(sgpa.toFixed(2))  : null,
        cgpa:  cgpa  ? parseFloat(cgpa.toFixed(2))  : null,
        credits,
      };
    });
  }, [semesters, subjects]);

  const activeSemester = semesters.find(s => s.id === activeSemId);
  const isDirectMode = activeSemester?.sgpa != null && activeSemester?.totalCredits != null;

  const currentCGPA = cgpaData.length > 0 ? cgpaData[cgpaData.length - 1].cgpa : null;
  const currentSGPA = isDirectMode ? activeSemester!.sgpa : (activeSemId ? calculateSGPA(activeSemSubjects) : null);

  const whatDoINeed = useMemo(() => {
    if (!currentCGPA || semesters.length < 1) return null;
    const target = parseFloat(targetCGPA);
    if (isNaN(target) || target > 10) return null;
    let totalCredits = 0, totalPoints = 0;
    
    semesters.forEach(sem => {
      if (sem.sgpa != null && sem.totalCredits != null) {
        totalCredits += sem.totalCredits;
        totalPoints += sem.totalCredits * sem.sgpa;
      } else {
        const semSubs = subjects.filter(s => s.semesterId === sem.id);
        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            totalCredits += s.credits;
            totalPoints  += s.credits * GRADE_MAP[s.grade!];
          }
        });
      }
    });

    const nextCredits = parseInt(targetCredits) || 24;
    const neededPoints = target * (totalCredits + nextCredits) - totalPoints;
    const neededSGPA = neededPoints / nextCredits;
    return { neededSGPA: Math.max(0, Math.min(10, neededSGPA)), achievable: neededSGPA <= 10, nextCredits };
  }, [currentCGPA, targetCGPA, targetCredits, subjects, semesters]);

  // ── Handlers ──────────────────────────────────────────────

  const handleAddSemester = async () => {
    if (!user || !newSemName.trim()) return;
    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'semesters'), {
        userId: user.uid, name: newSemName.trim(),
        order: semesters.length + 1, createdAt: Date.now(),
      });
      setActiveSemId(docRef.id);
      setNewSemName('');
      setShowAddSem(false);
      toast.success('Semester added!');
    } catch (err: any) { toast.error(err.message); }
    finally { setIsSaving(false); }
  };

  const openAddRow = () => {
    setEditingSubId(null);
    setSubName('');
    setSubCredits('4');
    setSubGrade('A+');
    setShowInlineForm(true);
    setTimeout(() => subNameRef.current?.focus(), 50);
  };

  const openEditRow = (sub: SemesterSubject) => {
    setEditingSubId(sub.id!);
    setSubName(sub.name);
    setSubCredits(String(sub.credits));
    setSubGrade(sub.grade || 'A+');
    setShowInlineForm(true);
    setTimeout(() => subNameRef.current?.focus(), 50);
  };

  const cancelInlineForm = () => {
    setShowInlineForm(false);
    setEditingSubId(null);
    setSubName('');
    setSubCredits('4');
    setSubGrade('A+');
  };

  const handleSaveSubject = async () => {
    if (!user || !activeSemId) return;
    const name = subName.trim();
    if (!name) { toast.error('Enter a subject name'); subNameRef.current?.focus(); return; }
    const credits = parseInt(subCredits) || 4;
    const grade = subGrade;
    const gradePoints = GRADE_MAP[grade] ?? null;

    setIsSaving(true);
    try {
      const data = { userId: user.uid, semesterId: activeSemId, name, credits, grade, gradePoints };
      if (editingSubId) {
        await updateDoc(doc(db, 'semester_subjects', editingSubId), data);
        toast.success('Updated!');
      } else {
        await addDoc(collection(db, 'semester_subjects'), data);
        toast.success('Subject added!');
      }
      cancelInlineForm();
    } catch (err: any) { toast.error(err.message); }
    finally { setIsSaving(false); }
  };

  const handleSaveDirectSGPA = async () => {
    if (!activeSemId) return;
    const sgpaVal = parseFloat(directSGPA);
    const creditsVal = parseInt(directCredits);
    if (isNaN(sgpaVal) || sgpaVal < 0 || sgpaVal > 10) { toast.error('Invalid SGPA'); return; }
    if (isNaN(creditsVal) || creditsVal <= 0) { toast.error('Invalid credits'); return; }
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'semesters', activeSemId), { sgpa: sgpaVal, totalCredits: creditsVal });
      toast.success('Direct SGPA saved!');
      setShowDirectForm(false);
    } catch (err: any) { toast.error(err.message); }
    finally { setIsSaving(false); }
  };

  const handleClearDirectSGPA = async () => {
    if (!activeSemId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'semesters', activeSemId), { sgpa: null, totalCredits: null });
      toast.success('Reverted to subjects mode');
    } catch (err: any) { toast.error(err.message); }
    finally { setIsSaving(false); }
  };

  const handleDeleteSemester = async (id: string) => {
    try {
      const semSubs = subjects.filter(s => s.semesterId === id);
      await Promise.all(semSubs.map(s => deleteDoc(doc(db, 'semester_subjects', s.id!))));
      await deleteDoc(doc(db, 'semesters', id));
      if (activeSemId === id) setActiveSemId(semesters.find(s => s.id !== id)?.id || null);
      toast.success('Semester deleted!');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteSubject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'semester_subjects', id));
      toast.success('Deleted!');
    } catch (err: any) { toast.error(err.message); }
  };

  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>;

  const activeSGPA  = currentSGPA;
  const semesterRow = cgpaData.find(d => d.name === semesters.find(s => s.id === activeSemId)?.name);
  const semCredits  = semesterRow?.credits ?? activeSemSubjects.reduce((a, s) => a + s.credits, 0);

  return (
    <div>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Calculator size={26} style={{ color: '#f59e0b' }} /> GPA Calculator
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>Track grades · Calculate SGPA &amp; CGPA</p>
        </div>
      </div>

      {/* ── Overview Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* CGPA */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>CGPA (Cumulative)</div>
          <div style={{ fontSize: '2.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: gradeColor(currentCGPA) }}>
            {currentCGPA != null ? currentCGPA.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>out of 10.00</div>
        </div>

        {/* SGPA */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            SGPA · {semesters.find(s => s.id === activeSemId)?.name ?? '—'}
          </div>
          <div style={{ fontSize: '2.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: gradeColor(activeSGPA) }}>
            {activeSGPA != null ? activeSGPA.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{semCredits} credits this sem</div>
        </div>

        {/* What do I need */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Target size={13} /> Target CGPA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <input type="number" step="0.1" min="0" max="10" value={targetCGPA}
              onChange={e => setTargetCGPA(e.target.value)}
              title="Target CGPA"
              style={{ width: '65px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', textAlign: 'center', fontSize: '1rem', fontWeight: 700 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>in next</span>
            <input type="number" min="1" value={targetCredits}
              onChange={e => setTargetCredits(e.target.value)}
              title="Remaining Credits"
              style={{ width: '55px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>cr</span>
          </div>
          {whatDoINeed && currentCGPA && (
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: whatDoINeed.achievable ? '#10b981' : '#ef4444' }}>
              {whatDoINeed.achievable
                ? `Need avg SGPA ≥ ${whatDoINeed.neededSGPA.toFixed(2)} for ${whatDoINeed.nextCredits} cr`
                : `❌ Not achievable with ${whatDoINeed.nextCredits} cr`}
            </div>
          )}
          {!currentCGPA && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Add grades to see projection</div>}
        </div>
      </div>

      {/* ── GPA Trend Chart ── */}
      {cgpaData.length > 0 && cgpaData.some(d => d.sgpa !== null) && (
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} /> GPA Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={cgpaData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.85rem' }}
                formatter={(val: any, name: any) => [typeof val === 'number' ? val.toFixed(2) : '—', String(name ?? '').toUpperCase()]}
              />
              <Bar dataKey="sgpa" fill="#3b82f6" radius={[4, 4, 0, 0]} name="SGPA" />
              <Line type="monotone" dataKey="cgpa" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} name="CGPA" />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: 12, height: 12, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> SGPA (bars)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: 12, height: 2, background: '#10b981', display: 'inline-block' }} /> CGPA (line)</span>
          </div>
        </div>
      )}

      {/* ── Grading Scale Reference ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {GRADE_OPTIONS.map(g => (
          <span key={g.label} style={{
            padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
            background: `${gradeColor(g.points)}18`, color: gradeColor(g.points),
            border: `1px solid ${gradeColor(g.points)}40`,
          }}>
            {g.label} = {g.points}
          </span>
        ))}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginLeft: '0.25rem' }}>pts</span>
      </div>

      {/* ── Semester Tabs + Add Semester ── */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {semesters.map(sem => {
          const sd = cgpaData.find(d => d.name === sem.name);
          return (
            <div key={sem.id} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
              <button
                onClick={() => { setActiveSemId(sem.id!); cancelInlineForm(); }}
                style={{
                  padding: '0.45rem 0.9rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem',
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  background: activeSemId === sem.id ? 'var(--accent-primary)' : 'var(--bg-surface)',
                  color: activeSemId === sem.id ? '#fff' : 'var(--text-secondary)',
                  border: activeSemId === sem.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                }}
              >
                {sem.name}
                {sd?.sgpa != null && (
                  <span style={{ marginLeft: '0.4rem', opacity: 0.8, fontSize: '0.72rem' }}>
                    {sd.sgpa.toFixed(1)}
                  </span>
                )}
              </button>
              <button className="btn-icon danger" onClick={() => setConfirmDelete({type: 'semester', id: sem.id!})}
                style={{ padding: '0.1rem', opacity: 0.5 }} title="Delete semester">
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}

        {showAddSem ? (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              ref={semInputRef} autoFocus type="text" value={newSemName}
              onChange={e => setNewSemName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSemester(); if (e.key === 'Escape') setShowAddSem(false); }}
              placeholder="e.g., Semester 3"
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.82rem', background: 'var(--bg-surface)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none', width: '140px' }}
            />
            <button className="btn-primary" onClick={handleAddSemester} disabled={isSaving}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}>
              {isSaving ? '...' : 'Add'}
            </button>
            <button className="btn-icon" onClick={() => setShowAddSem(false)}><X size={15} /></button>
          </div>
        ) : (
          <button className="btn-secondary" onClick={() => { setShowAddSem(true); setTimeout(() => semInputRef.current?.focus(), 50); }}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
            <Plus size={13} /> Add Semester
          </button>
        )}
      </div>

      {/* ── Subjects Table ── */}
      {activeSemId && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {semesters.find(s => s.id === activeSemId)?.name} — Subjects
            </h3>
            {!showInlineForm && !isDirectMode && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!activeSemester?.sgpa && (
                  <button className="btn-secondary" onClick={() => setShowDirectForm(true)}
                    style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}>
                    Set Direct SGPA
                  </button>
                )}
                <button className="btn-primary" onClick={openAddRow}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}>
                  <Plus size={14} /> Add Subject
                </button>
              </div>
            )}
            {isDirectMode && (
              <button className="btn-secondary" onClick={handleClearDirectSGPA}
                style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem', color: '#ef4444', borderColor: '#ef444440' }}>
                Clear Direct SGPA
              </button>
            )}
          </div>

          {showDirectForm && !isDirectMode && (
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(124,58,237,0.06)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Enter Direct SGPA</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="number" step="0.01" min="0" max="10" placeholder="SGPA (e.g. 9.5)" value={directSGPA}
                  onChange={e => setDirectSGPA(e.target.value)}
                  style={{ width: '130px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--accent-primary)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none' }}
                />
                <input
                  type="number" min="1" placeholder="Total Credits" value={directCredits}
                  onChange={e => setDirectCredits(e.target.value)}
                  style={{ width: '130px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none' }}
                />
                <button className="btn-primary" onClick={handleSaveDirectSGPA} disabled={isSaving} style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}>
                  {isSaving ? '...' : 'Save'}
                </button>
                <button className="btn-secondary" onClick={() => setShowDirectForm(false)} style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isDirectMode ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: gradeColor(activeSemester!.sgpa!), marginBottom: '0.5rem' }}>
                {activeSemester!.sgpa!.toFixed(2)}
              </div>
              <p style={{ fontSize: '0.9rem' }}>Using Direct SGPA ({activeSemester!.totalCredits} credits)</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {['Subject Name', 'Credits', 'Grade', 'Points', 'Weighted', ''].map(h => (
                    <th key={h} style={{
                      padding: '0.6rem 1rem', textAlign: 'left',
                      borderBottom: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', fontSize: '0.75rem',
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Inline add/edit form row */}
                {showInlineForm && (
                  <tr style={{ background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        ref={subNameRef}
                        type="text"
                        value={subName}
                        onChange={e => setSubName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveSubject(); if (e.key === 'Escape') cancelInlineForm(); }}
                        placeholder="Subject name…"
                        list="gpa-subject-suggestions"
                        style={{
                          width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px',
                          border: '1px solid var(--accent-primary)',
                          background: 'var(--bg-base)', color: 'var(--text-primary)',
                          fontSize: '0.88rem', outline: 'none',
                        }}
                      />
                      <datalist id="gpa-subject-suggestions">
                        {timetableSubjects.map(s => <option key={s.id} value={s.name} />)}
                      </datalist>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <input
                        type="number" min="1" max="10" value={subCredits}
                        onChange={e => setSubCredits(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveSubject(); if (e.key === 'Escape') cancelInlineForm(); }}
                        style={{
                          width: '56px', padding: '0.4rem 0.5rem', borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-base)', color: 'var(--text-primary)',
                          fontSize: '0.88rem', outline: 'none', textAlign: 'center',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <select
                        value={subGrade}
                        onChange={e => setSubGrade(e.target.value)}
                        style={{
                          padding: '0.4rem 0.5rem', borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-base)', color: gradeColor(GRADE_MAP[subGrade] ?? null),
                          fontSize: '0.88rem', fontWeight: 700, outline: 'none', cursor: 'pointer',
                        }}
                      >
                        {GRADE_OPTIONS.map(g => (
                          <option key={g.label} value={g.label}>{g.label} ({g.points})</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: gradeColor(GRADE_MAP[subGrade] ?? null) }}>
                      {GRADE_MAP[subGrade] ?? '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {GRADE_MAP[subGrade] != null ? ((GRADE_MAP[subGrade] ?? 0) * (parseInt(subCredits) || 0)).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn-primary"
                          onClick={handleSaveSubject}
                          disabled={isSaving}
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                          title="Save (Enter)"
                        >
                          {isSaving ? '...' : <><Check size={13} /> {editingSubId ? 'Update' : 'Save'}</>}
                        </button>
                        <button className="btn-icon" onClick={cancelInlineForm} title="Cancel (Escape)">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Existing subjects */}
                {activeSemSubjects.length === 0 && !showInlineForm ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      No subjects yet — click <strong>Add Subject</strong> above to get started.
                    </td>
                  </tr>
                ) : (
                  activeSemSubjects.map(sub => {
                    const gp = GRADE_MAP[sub.grade || ''];
                    const isEditing = editingSubId === sub.id;
                    return (
                      <tr key={sub.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: isEditing ? 'rgba(124,58,237,0.04)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 500, fontSize: '0.9rem' }}>{sub.name}</td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-secondary)' }}>{sub.credits}</td>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <span style={{
                            padding: '0.15rem 0.55rem', borderRadius: '4px', fontSize: '0.82rem',
                            fontWeight: 700, background: `${gradeColor(gp ?? null)}18`,
                            color: gradeColor(gp ?? null),
                          }}>
                            {sub.grade || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: gradeColor(gp ?? null) }}>
                          {gp != null ? gp : '—'}
                        </td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {gp != null ? (gp * sub.credits).toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '0.7rem 1rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button className="btn-icon" onClick={() => openEditRow(sub)} title="Edit">
                              <Edit2 size={13} />
                            </button>
                            <button className="btn-icon danger" onClick={() => setConfirmDelete({type: 'subject', id: sub.id!})} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Totals row */}
                {activeSemSubjects.length > 0 && (
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '2px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.9rem' }}>Semester Total</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                      {activeSemSubjects.reduce((s, sub) => s + sub.credits, 0)} cr
                    </td>
                    <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: 700, color: gradeColor(activeSGPA), fontSize: '1rem' }}>
                        SGPA: {activeSGPA != null ? activeSGPA.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontWeight: 700, color: gradeColor(currentCGPA), fontSize: '0.9rem' }}>
                        CGPA: {currentCGPA != null ? currentCGPA.toFixed(2) : '—'}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add button at bottom when form is not open */}
          {!showInlineForm && (
            <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={openAddRow}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.3rem 0', width: '100%', transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Plus size={14} /> Add subject
              </button>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* No semesters yet */}
      {semesters.length === 0 && !showAddSem && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <Calculator size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p style={{ marginBottom: '1rem' }}>No semesters yet. Add your first semester to get started.</p>
          <button className="btn-primary" onClick={() => setShowAddSem(true)}>
            <Plus size={16} /> Add First Semester
          </button>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === 'semester' ? 'Delete Semester' : 'Delete Subject'}
        message={confirmDelete?.type === 'semester' ? 'Delete this semester and all its subjects? This cannot be undone.' : 'Delete this subject? This cannot be undone.'}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDelete) { confirmDelete.type === 'semester' ? handleDeleteSemester(confirmDelete.id) : handleDeleteSubject(confirmDelete.id); } setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
