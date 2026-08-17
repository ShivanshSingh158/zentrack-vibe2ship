import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import {
  GraduationCap, Plus, Trash2, Edit2, TrendingUp, Target,
  Check, X, Award, ChevronDown, ChevronUp, BookOpen, Layers,
  School, Sparkles, AlertCircle, FileText, CheckCircle2, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid
} from 'recharts';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export interface Semester {
  id?: string;
  userId: string;
  name: string;
  order: number;
  sgpa?: number | null;
  totalCredits?: number | null;
  createdAt?: number;
}

export interface SemesterSubject {
  id?: string;
  userId: string;
  semesterId: string;
  name: string;
  credits: number;
  grade?: string;
}

// Standard 10-point scale
const GRADE_OPTIONS = [
  { label: 'A+', points: 10, color: '#5eda9e' },
  { label: 'A', points: 9, color: '#5eda9e' },
  { label: 'B+', points: 8, color: '#a599ff' },
  { label: 'B', points: 7, color: '#a599ff' },
  { label: 'C', points: 6, color: '#38bdf8' },
  { label: 'D', points: 5, color: '#fbbf24' },
  { label: 'F', points: 0, color: '#ff6961' },
];

const GRADE_MAP: Record<string, number> = Object.fromEntries(
  GRADE_OPTIONS.map(g => [g.label, g.points])
);

export const GradeCalculatorModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<SemesterSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Forms
  const [isAddSemModalOpen, setIsAddSemModalOpen] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const [activeSemForCourse, setActiveSemForCourse] = useState<string | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseCredits, setCourseCredits] = useState('4');
  const [courseGrade, setCourseGrade] = useState('A+');
  const [editingCourse, setEditingCourse] = useState<SemesterSubject | null>(null);

  // Direct SGPA Modal
  const [directSem, setDirectSem] = useState<Semester | null>(null);
  const [directSGPA, setDirectSGPA] = useState('');
  const [directCredits, setDirectCredits] = useState('24');

  // Target Simulator
  const [targetCGPA, setTargetCGPA] = useState('9.0');
  const [targetCredits, setTargetCredits] = useState('24');

  // Delete Confirm Dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'semester' | 'subject'; id: string } | null>(null);

  // Expanded Semesters
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    const semQ = query(collection(db, 'semesters'), where('userId', '==', user.uid));
    const unsubSem = onSnapshot(semQ, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Semester));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSemesters(data);
      setExpandedSems(new Set(data.map(s => s.id!)));
      setIsLoading(false);
    });

    const subQ = query(collection(db, 'semester_subjects'), where('userId', '==', user.uid));
    const unsubSub = onSnapshot(subQ, snap => {
      setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as SemesterSubject)));
    });

    return () => {
      unsubSem();
      unsubSub();
    };
  }, [user]);

  // SGPA Calculation Function
  const calculateSGPA = (semSubs: SemesterSubject[]) => {
    const graded = semSubs.filter(s => s.grade && GRADE_MAP[s.grade] != null);
    if (graded.length === 0) return null;
    let totalCredits = 0;
    let totalPoints = 0;
    graded.forEach(s => {
      const gp = GRADE_MAP[s.grade!];
      totalCredits += s.credits;
      totalPoints += s.credits * gp;
    });
    return totalCredits > 0 ? totalPoints / totalCredits : null;
  };

  // Progression & CGPA Data Model
  const cgpaData = useMemo(() => {
    let cumCredits = 0;
    let cumPoints = 0;

    return semesters.map((sem, idx) => {
      const isDirect = sem.sgpa != null && sem.totalCredits != null;
      let sgpa: number | null = null;
      let semCredits = 0;

      if (isDirect) {
        sgpa = sem.sgpa!;
        semCredits = sem.totalCredits!;
        cumCredits += semCredits;
        cumPoints += semCredits * sgpa;
      } else {
        const semSubs = subjects.filter(s => s.semesterId === sem.id);
        const calc = calculateSGPA(semSubs);
        sgpa = calc ? parseFloat(calc.toFixed(2)) : null;

        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            cumCredits += s.credits;
            cumPoints += s.credits * GRADE_MAP[s.grade!];
          }
        });
        semCredits = semSubs.reduce((acc, sub) => acc + sub.credits, 0);
      }

      const cgpa = cumCredits > 0 ? parseFloat((cumPoints / cumCredits).toFixed(2)) : null;

      return {
        id: sem.id,
        name: sem.name || `Semester ${idx + 1}`,
        calcSgpa: sgpa,
        calcCgpa: cgpa,
        credits: semCredits,
      };
    });
  }, [semesters, subjects]);

  // Overall Global CGPA & Credits
  const currentCGPA = cgpaData.length > 0 ? cgpaData[cgpaData.length - 1].calcCgpa : null;
  const totalCumulativeCredits = useMemo(() => {
    let creds = 0;
    for (const sem of semesters) {
      if (sem.totalCredits != null) {
        creds += sem.totalCredits;
      } else {
        const semSubs = subjects.filter(s => s.semesterId === sem.id);
        creds += semSubs.reduce((acc, s) => acc + s.credits, 0);
      }
    }
    return creds;
  }, [semesters, subjects]);

  // Target SGPA Simulator Math ("What Do I Need?")
  const targetNeeded = useMemo(() => {
    if (!currentCGPA || semesters.length < 1) return null;
    const target = parseFloat(targetCGPA);
    if (isNaN(target) || target > 10 || target <= 0) return null;

    let totalCredits = 0;
    let totalPoints = 0;

    semesters.forEach(sem => {
      if (sem.sgpa != null && sem.totalCredits != null) {
        totalCredits += sem.totalCredits;
        totalPoints += sem.totalCredits * sem.sgpa;
      } else {
        const semSubs = subjects.filter(s => s.semesterId === sem.id);
        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            totalCredits += s.credits;
            totalPoints += s.credits * GRADE_MAP[s.grade!];
          }
        });
      }
    });

    const nextCredits = parseInt(targetCredits, 10) || 24;
    if (nextCredits <= 0) return null;

    const neededPoints = target * (totalCredits + nextCredits) - totalPoints;
    const neededSGPA = neededPoints / nextCredits;

    return {
      neededSGPA: parseFloat(neededSGPA.toFixed(2)),
      achievable: neededSGPA <= 10.0 && neededSGPA >= 0,
    };
  }, [currentCGPA, targetCGPA, targetCredits, semesters, subjects]);

  // ── Handlers ──
  const handleAddSemester = async () => {
    if (!user || !newSemName.trim()) return;
    try {
      await addDoc(collection(db, 'semesters'), {
        userId: user.uid,
        name: newSemName.trim(),
        order: semesters.length,
        createdAt: Date.now(),
      });
      toast.success(`Created "${newSemName}"`);
      setNewSemName('');
      setIsAddSemModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create semester');
    }
  };

  const handleSaveCourse = async () => {
    if (!user || !courseName.trim() || !activeSemForCourse) return;
    try {
      if (editingCourse?.id) {
        await updateDoc(doc(db, 'semester_subjects', editingCourse.id), {
          name: courseName.trim(),
          credits: parseInt(courseCredits, 10) || 4,
          grade: courseGrade,
        });
        toast.success(`Updated ${courseName}`);
      } else {
        await addDoc(collection(db, 'semester_subjects'), {
          userId: user.uid,
          semesterId: activeSemForCourse,
          name: courseName.trim(),
          credits: parseInt(courseCredits, 10) || 4,
          grade: courseGrade,
        });
        toast.success(`Added ${courseName}`);
      }
      setCourseName('');
      setCourseCredits('4');
      setCourseGrade('A+');
      setEditingCourse(null);
      setActiveSemForCourse(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save course');
    }
  };

  const handleSaveDirectSGPA = async () => {
    if (!directSem?.id) return;
    const sgpaVal = parseFloat(directSGPA);
    const credVal = parseInt(directCredits, 10);
    if (isNaN(sgpaVal) || sgpaVal < 0 || sgpaVal > 10) {
      toast.error('SGPA must be between 0 and 10');
      return;
    }
    try {
      await updateDoc(doc(db, 'semesters', directSem.id), {
        sgpa: sgpaVal,
        totalCredits: credVal || 24,
      });
      toast.success(`Updated SGPA for ${directSem.name}`);
      setDirectSem(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update direct SGPA');
    }
  };

  const toggleExpand = (semId: string) => {
    setExpandedSems(prev => {
      const next = new Set(prev);
      if (next.has(semId)) next.delete(semId);
      else next.add(semId);
      return next;
    });
  };

  return (
    <div className="gr-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="gr-header-bar">
        <div className="gr-header-left">
          <h1 className="gr-hero-title">Grade Calculator & CGPA Planner</h1>
          <span className="gr-stats-subtitle">
            {currentCGPA ? `${currentCGPA} Cumulative GPA` : 'No grades yet'} · {totalCumulativeCredits} Total Credits
          </span>
        </div>

        <div className="gr-header-actions">
          <button
            type="button"
            className="gr-primary-add-btn"
            onClick={() => {
              setNewSemName(`Semester ${semesters.length + 1}`);
              setIsAddSemModalOpen(true);
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Add Semester</span>
          </button>
        </div>
      </div>

      {/* ── TOP HERO ROW (CGPA Hero Banner & Target Simulator) ── */}
      <div className="gr-hero-row">
        {/* Cumulative GPA Hero Banner */}
        <div className="gr-cgpa-banner">
          <div className="gr-cgpa-left">
            <span className="gr-cgpa-label">CUMULATIVE GPA (CGPA)</span>
            <span className="gr-cgpa-value" style={{ color: currentCGPA && currentCGPA >= 8.5 ? '#5eda9e' : (currentCGPA && currentCGPA >= 7.0 ? '#a599ff' : '#ffffff') }}>
              {currentCGPA !== null ? currentCGPA.toFixed(2) : '--'}
            </span>
            <span className="gr-cgpa-subtext">
              {semesters.length} {semesters.length === 1 ? 'Semester' : 'Semesters'} · {totalCumulativeCredits} Total Credits
            </span>
          </div>

          <div className="gr-cgpa-icon-box">
            <GraduationCap size={28} />
          </div>
        </div>

        {/* "What Do I Need?" Target Simulator */}
        <div className="gr-simulator-card">
          <div className="gr-sim-top">
            <h3 className="gr-sim-title">What Do I Need? (Target Planner)</h3>
            <Target size={16} color="var(--gr-accent-purple)" />
          </div>

          <div className="gr-sim-inputs-row">
            <div className="gr-sim-input-box">
              <span className="gr-sim-input-label">Target CGPA</span>
              <input
                type="number"
                min="5"
                max="10"
                step="0.1"
                className="gr-sim-input"
                value={targetCGPA}
                onChange={e => setTargetCGPA(e.target.value)}
              />
            </div>

            <div className="gr-sim-input-box">
              <span className="gr-sim-input-label">Next Sem Credits</span>
              <input
                type="number"
                min="1"
                max="40"
                className="gr-sim-input"
                value={targetCredits}
                onChange={e => setTargetCredits(e.target.value)}
              />
            </div>
          </div>

          {targetNeeded ? (
            <div className={`gr-sim-badge ${targetNeeded.achievable ? 'achievable' : 'unachievable'}`}>
              {targetNeeded.achievable ? (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>Achievable: Need {targetNeeded.neededSGPA.toFixed(2)} SGPA in next semester</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} />
                  <span>Unattainable in 1 sem (Needs {targetNeeded.neededSGPA.toFixed(2)} SGPA &gt; 10.0)</span>
                </>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)' }}>
              Add completed semester grades to compute target forecasts.
            </span>
          )}
        </div>
      </div>

      {/* ── ACADEMIC PROGRESSION CHART (COMPOSED RECHARTS) ── */}
      {cgpaData.some(d => d.calcSgpa !== null) && (
        <div className="gr-chart-card">
          <div className="gr-chart-header">
            <h3 className="gr-chart-title">Academic Progression (SGPA vs CGPA Trend)</h3>
            <div className="gr-chart-legend">
              <div className="gr-legend-item">
                <div className="gr-legend-dot" style={{ background: '#a599ff' }} />
                <span>SGPA (Semester)</span>
              </div>
              <div className="gr-legend-item">
                <div className="gr-legend-dot" style={{ background: '#38bdf8' }} />
                <span>CGPA (Cumulative)</span>
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cgpaData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#8e8e93" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 10]} ticks={[0, 2.5, 5, 7.5, 10]} stroke="#8e8e93" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#141416',
                    border: '1px solid #242428',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="calcSgpa" name="SGPA" fill="#a599ff" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Area type="monotone" dataKey="calcCgpa" name="CGPA" stroke="#38bdf8" fill="rgba(56,189,248,0.12)" strokeWidth={2.5} dot={{ fill: '#38bdf8', r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── SEMESTER & COURSE BREAKDOWN ── */}
      <div className="gr-semesters-list">
        {semesters.length === 0 ? (
          <div className="notes-empty-state">
            <GraduationCap size={32} color="var(--gr-accent-purple)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No semesters added</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--gr-text-tertiary)', margin: 0 }}>
              Add your semesters and course grades to calculate SGPA, CGPA, and future targets.
            </p>
            <button
              type="button"
              className="gr-primary-add-btn"
              onClick={() => {
                setNewSemName('Semester 1');
                setIsAddSemModalOpen(true);
              }}
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Add Semester 1</span>
            </button>
          </div>
        ) : (
          semesters.map((sem, idx) => {
            const semSubs = subjects.filter(s => s.semesterId === sem.id);
            const semData = cgpaData.find(d => d.id === sem.id);
            const isExpanded = expandedSems.has(sem.id!);

            return (
              <div key={sem.id} className="gr-semester-card">
                <div className="gr-sem-top">
                  <div className="gr-sem-title-box">
                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => toggleExpand(sem.id!)}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <h3 className="gr-sem-title">{sem.name || `Semester ${idx + 1}`}</h3>
                    <span className="gr-sem-sgpa-pill">
                      {semData?.calcSgpa ? `${semData.calcSgpa.toFixed(2)} SGPA` : 'Pending'}
                    </span>
                    <span className="gr-sem-credits">
                      {semData?.credits || 0} Credits
                    </span>
                  </div>

                  <div className="gr-sem-actions">
                    {/* Direct Override Button */}
                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => {
                        setDirectSGPA(sem.sgpa ? String(sem.sgpa) : '');
                        setDirectCredits(sem.totalCredits ? String(sem.totalCredits) : '24');
                        setDirectSem(sem);
                      }}
                      title="Direct SGPA Override"
                    >
                      Direct SGPA
                    </button>

                    {/* Add Course Button */}
                    <button
                      type="button"
                      className="att-primary-add-btn"
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.76rem' }}
                      onClick={() => {
                        setCourseName('');
                        setCourseCredits('4');
                        setCourseGrade('A+');
                        setEditingCourse(null);
                        setActiveSemForCourse(sem.id!);
                      }}
                    >
                      <Plus size={13} strokeWidth={2.5} />
                      <span>Add Course</span>
                    </button>

                    {/* Delete Semester */}
                    <button
                      type="button"
                      className="hb-card-delete-btn"
                      onClick={() => setDeleteConfirm({ type: 'semester', id: sem.id! })}
                      title="Delete Semester"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Courses List */}
                {isExpanded && (
                  <div className="gr-courses-table">
                    {semSubs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--gr-text-tertiary)', fontSize: '0.8rem' }}>
                        {sem.sgpa != null ? (
                          <span>Direct SGPA configured ({sem.sgpa} SGPA, {sem.totalCredits} credits). Add courses if you wish to track individual grades.</span>
                        ) : (
                          <span>No courses added yet. Click "+ Add Course" to enter subject grades.</span>
                        )}
                      </div>
                    ) : (
                      semSubs.map(sub => {
                        const gp = GRADE_MAP[sub.grade || 'A+'] ?? 10;
                        const gradeColorHex = GRADE_OPTIONS.find(g => g.label === sub.grade)?.color || '#a599ff';
                        const points = sub.credits * gp;

                        return (
                          <div key={sub.id} className="gr-course-row">
                            <div className="gr-course-info">
                              <span className="gr-course-name">{sub.name}</span>
                              <span className="gr-course-credits-badge">{sub.credits} Credits</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                              <span
                                className="gr-grade-pill"
                                style={{
                                  background: `${gradeColorHex}18`,
                                  color: gradeColorHex,
                                  border: `1px solid ${gradeColorHex}35`
                                }}
                              >
                                {sub.grade || 'A+'} ({gp})
                              </span>

                              <span className="gr-grade-points">{points} GP</span>

                              <button
                                type="button"
                                className="att-card-action-btn"
                                onClick={() => {
                                  setCourseName(sub.name);
                                  setCourseCredits(String(sub.credits));
                                  setCourseGrade(sub.grade || 'A+');
                                  setEditingCourse(sub);
                                  setActiveSemForCourse(sem.id!);
                                }}
                              >
                                <Edit2 size={13} />
                              </button>

                              <button
                                type="button"
                                className="hb-card-delete-btn"
                                onClick={() => setDeleteConfirm({ type: 'subject', id: sub.id! })}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── ADD SEMESTER MODAL ── */}
      {isAddSemModalOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsAddSemModalOpen(false)}>
          <div className="notes-modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Add Semester</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setIsAddSemModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
              SEMESTER TITLE
              <input
                type="text"
                placeholder="e.g. Semester 6, Fall 2026"
                className="notes-search-bar notes-search-input"
                style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                value={newSemName}
                onChange={e => setNewSemName(e.target.value)}
                autoFocus
              />
            </label>

            <div className="notes-modal-footer">
              <button type="button" className="gr-action-pill-btn" onClick={() => setIsAddSemModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="gr-primary-add-btn" onClick={handleAddSemester}>
                Create Semester
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT COURSE MODAL ── */}
      {activeSemForCourse && (
        <div className="notes-modal-overlay" onClick={() => setActiveSemForCourse(null)}>
          <div className="notes-modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">{editingCourse ? 'Edit Course Grade' : 'Add Course Grade'}</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setActiveSemForCourse(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
                COURSE NAME
                <input
                  type="text"
                  placeholder="e.g. Operating Systems, Advanced AI"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  autoFocus
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
                  CREDITS
                  <input
                    type="number"
                    min="1"
                    max="12"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                    value={courseCredits}
                    onChange={e => setCourseCredits(e.target.value)}
                  />
                </label>

                <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
                  GRADE (10-POINT SCALE)
                  <select
                    value={courseGrade}
                    onChange={e => setCourseGrade(e.target.value)}
                    className="notes-search-bar"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem', color: '#fff' }}
                  >
                    {GRADE_OPTIONS.map(g => (
                      <option key={g.label} value={g.label} style={{ background: '#141416' }}>
                        {g.label} ({g.points} Points)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="gr-action-pill-btn" onClick={() => setActiveSemForCourse(null)}>
                Cancel
              </button>
              <button type="button" className="gr-primary-add-btn" onClick={handleSaveCourse}>
                {editingCourse ? 'Save Changes' : 'Add Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIRECT SGPA OVERRIDE MODAL ── */}
      {directSem && (
        <div className="notes-modal-overlay" onClick={() => setDirectSem(null)}>
          <div className="notes-modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Direct SGPA ({directSem.name})</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setDirectSem(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
                SGPA (0 - 10)
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  placeholder="e.g. 9.45"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                  value={directSGPA}
                  onChange={e => setDirectSGPA(e.target.value)}
                  autoFocus
                />
              </label>

              <label style={{ fontSize: '0.76rem', color: 'var(--gr-text-tertiary)', fontWeight: 600 }}>
                TOTAL CREDITS
                <input
                  type="number"
                  min="1"
                  max="40"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                  value={directCredits}
                  onChange={e => setDirectCredits(e.target.value)}
                />
              </label>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="gr-action-pill-btn" onClick={() => setDirectSem(null)}>
                Cancel
              </button>
              <button type="button" className="gr-primary-add-btn" onClick={handleSaveDirectSGPA}>
                Save SGPA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM DIALOG ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.type === 'semester' ? 'Semester' : 'Course'}`}
        message={`Are you sure you want to delete this ${deleteConfirm?.type === 'semester' ? 'semester and all its course records' : 'course grade'}?`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          if (!deleteConfirm) return;
          try {
            if (deleteConfirm.type === 'semester') {
              await deleteDoc(doc(db, 'semesters', deleteConfirm.id));
              toast.success('Semester deleted');
            } else {
              await deleteDoc(doc(db, 'semester_subjects', deleteConfirm.id));
              toast.success('Course deleted');
            }
          } catch (err) {
            console.error(err);
            toast.error('Failed to delete');
          }
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};
