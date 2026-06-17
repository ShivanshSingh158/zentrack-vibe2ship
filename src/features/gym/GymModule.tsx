import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Dumbbell, Check, Plus, Trash2, Edit3, Bed, Flame,
  RotateCcw, Download, ChevronLeft, ChevronRight, User, Timer, Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { GYM_PLAN } from '../../data/gymPlan';
import { ZenGymAI } from './ZenGymAI';
import { useGymLog, todayStr, dateStrOffset, dayLabelFromDate, planDayIndexForDate } from './hooks/useGymLog';
import { usePreviousSession } from './hooks/usePreviousSession';
import { useRestTimer } from './hooks/useRestTimer';
import { useWorkoutTimer } from './hooks/useWorkoutTimer';
import { ExerciseCard } from './components/ExerciseCard';
import { TreadmillCard } from './components/TreadmillCard';
import { CardioCard } from './components/CardioCard';
import { AddExerciseModal } from './components/AddExerciseModal';
import { AddCardioModal } from './components/AddCardioModal';
import { ExerciseHistoryDrawer } from './components/ExerciseHistoryDrawer';
import { MuscleHeatmap } from './components/MuscleHeatmap';
import { GymProfileModal } from './components/GymProfileModal';
import { RestTimerPill } from './components/RestTimerPill';
import { WeeklyGymInsights } from './components/WeeklyGymInsights';
import type { GymExerciseLog, GymCardioLog } from '../../types/gym.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: number;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

// ── Main Component ────────────────────────────────────────────────────────────

export const GymModule = () => {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExerciseIdx, setEditingExerciseIdx] = useState<number | null>(null);
  const [showAddCardioModal, setShowAddCardioModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [newPR, setNewPR] = useState<{ exerciseName: string; weight: number } | null>(null);

  // Mobile detection with debounced resize
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : true);
  useEffect(() => {
    const handler = debounce(() => setIsMobile(window.innerWidth <= 768), 150);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Core data hook
  const {
    userId, log, syncing, saving, profile,
    loadLog, updateExercise, deleteExercise, addExercise, moveExerciseToDate,
    updateCardio, deleteCardio, addCardio, clearDay, importPlan,
    wipeAllTemplates, saveProfile,
  } = useGymLog(selectedDate);

  // Previous session + PRs
  const { previousSessionData, allTimePRs, setAllTimePRs } = usePreviousSession(userId, selectedDate);

  // Rest timer
  const restTimer = useRestTimer();

  // Workout timer — manual start/stop only
  const workoutTimer = useWorkoutTimer();

  // Reset timer on date change
  useEffect(() => {
    workoutTimer.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Plan info
  const planDayIdx = planDayIndexForDate(selectedDate);
  const planDay = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isRestDay = planDay?.isRest === true;

  // Progress stats
  const totalSets = log?.exercises?.reduce((a, ex) => a + (ex.skipped ? 0 : ex.setsLog.length), 0) ?? 0;
  const doneSets = log?.exercises?.reduce((a, ex) => a + (ex.skipped ? 0 : ex.setsLog.filter(s => s.completed).length), 0) ?? 0;
  const doneExs = log?.exercises?.filter(ex => !ex.skipped && ex.setsLog.length > 0 && ex.setsLog.every(s => s.completed)).length ?? 0;
  const totalExs = log?.exercises?.filter(e => !e.skipped).length ?? 0;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const allWorkoutDone = pct === 100 && totalSets > 0;

  // Cardio split
  const treadmillEntry = log?.cardio?.find(c => c.id === 'permanent_treadmill') ?? null;
  const treadmillIdx = log?.cardio?.findIndex(c => c.id === 'permanent_treadmill') ?? -1;
  const extraCardio = (log?.cardio ?? []).filter(c => c.id !== 'permanent_treadmill');

  // Date strip: 7 days for current weekOffset
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => dateStrOffset(weekOffset * 7 + i - 6)),
  [weekOffset]);

  // Recent logs for muscle heatmap (last 7 days of actual data from log history)
  // We just use the current log as a sample — heatmap will show today's muscles
  const recentLogsForHeatmap = useMemo(() => log ? [log] : [], [log]);

  // Handle set completion → start rest timer + PR check
  const handleSetComplete = useCallback((exerciseName: string, restSecs: number) => {
    restTimer.start(restSecs, exerciseName);
  }, [restTimer]);

  // PR detection: check if any completed set beats all-time PR
  const handlePRCheck = useCallback((ex: GymExerciseLog) => {
    const pr = allTimePRs[ex.exerciseId];
    const maxCompleted = ex.setsLog
      .filter(s => s.completed && s.weight != null)
      .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);
    if (maxCompleted > 0 && (!pr || maxCompleted > pr.weightKg)) {
      const newRecord = {
        exerciseName: ex.name,
        exerciseId: ex.exerciseId,
        weightKg: maxCompleted,
        reps: ex.setsLog.find(s => s.completed && s.weight === maxCompleted)?.reps ?? 0,
        date: selectedDate,
        achievedAt: Date.now(),
      };
      setAllTimePRs(prev => ({ ...prev, [ex.exerciseId]: newRecord }));
      setNewPR({ exerciseName: ex.name, weight: maxCompleted });
      setTimeout(() => setNewPR(null), 4000);
    }
  }, [allTimePRs, selectedDate, setAllTimePRs]);

  const updateExerciseWithPR = useCallback((idx: number, ex: GymExerciseLog) => {
    updateExercise(idx, ex);
    handlePRCheck(ex);
  }, [updateExercise, handlePRCheck]);

  // End-of-workout form-check prompt (shown once when all done)
  const formCheckShownRef = useRef(false);
  useEffect(() => {
    if (allWorkoutDone && !formCheckShownRef.current && selectedDate === todayStr()) {
      formCheckShownRef.current = true;
      setTimeout(() => {
        toast.success('🏆 Workout complete! Open ZenGym AI for recovery advice and form tips.', { duration: 5000 });
      }, 500);
    }
    if (!allWorkoutDone) formCheckShownRef.current = false;
  }, [allWorkoutDone, selectedDate]);

  // ── Not mobile ────────────────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '380px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Dumbbell size={32} style={{ color: '#a855f7' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#fff' }}>Mobile Only</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            The Gym Tracker is optimized exclusively for mobile. Open ZenTrack on your phone to log workouts.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', padding: '0 0 7rem 0', minHeight: '100vh', boxSizing: 'border-box', overflowX: 'hidden', position: 'relative' }}>

      {/* Dynamic background that fills in as workout progresses */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.1), transparent 70%)', opacity: 1 - pct / 100, transition: 'opacity 1s ease' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(29,185,84,0.12), transparent 70%)', opacity: pct / 100, transition: 'opacity 1s ease' }} />

      {/* PR Celebration Banner */}
      {newPR && (
        <div style={{ position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', borderRadius: '12px', padding: '0.6rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 20px rgba(251,191,36,0.4)', animation: 'prBounce 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <Trophy size={16} style={{ color: '#000' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000' }}>New PR! {newPR.weight}kg on {newPR.exerciseName} 🎉</span>
        </div>
      )}

      {/* ── Sticky Header ────────────────────────────────────────────── */}
      <div style={{ padding: '0.85rem 1rem 0.55rem', background: 'rgba(10,10,14,0.94)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Dumbbell size={17} style={{ color: '#a855f7' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Gym Tracker</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.6rem' }}>
                {/* Save status */}
                {saving ? (
                  <><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                  <span style={{ color: '#f59e0b' }}>Saving…</span></>
                ) : syncing ? (
                  <><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                  <span style={{ color: '#a855f7' }}>Syncing…</span></>
                ) : (
                  <><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>Saved</span></>
                )}
                {/* Workout timer — manual control */}
                {selectedDate === todayStr() && (
                  <button
                    onClick={() => workoutTimer.isActive ? workoutTimer.stop() : workoutTimer.start()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.22rem',
                      padding: '0.12rem 0.35rem', borderRadius: '99px',
                      border: workoutTimer.isActive
                        ? '1px solid rgba(245,158,11,0.35)'
                        : '1px solid rgba(255,255,255,0.12)',
                      background: workoutTimer.isActive ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.05)',
                      color: workoutTimer.isActive ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                      cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <Timer size={9} />
                    {workoutTimer.isActive ? workoutTimer.formatted() : 'Start'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
            <button onClick={() => setShowProfileModal(true)} title="Gym Profile"
              style={{ padding: '0.4rem', borderRadius: '8px', border: `1px solid ${profile ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`, background: profile ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)', color: profile ? '#a855f7' : 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '34px', minWidth: '34px', justifyContent: 'center' }}>
              <User size={13} />
            </button>
            <button onClick={importPlan} title="Import routine"
              style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '34px', minWidth: '34px', justifyContent: 'center' }}>
              <Download size={13} />
            </button>
            <button onClick={() => setEditMode(e => !e)}
              style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: `1px solid ${editMode ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`, background: editMode ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)', color: editMode ? '#fbbf24' : 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: '34px' }}>
              <Edit3 size={12} /> {editMode ? 'Done' : 'Edit'}
            </button>
            <button onClick={() => setShowClearConfirm(true)} title="Clear day"
              style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '34px', minWidth: '34px', justifyContent: 'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Date strip with week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button onClick={() => setWeekOffset(w => w - 1)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, display: 'flex', alignItems: 'center', minHeight: '44px', minWidth: '28px', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem', flex: 1 }}>
            {weekDates.map(d => {
              const isSelected = d === selectedDate;
              const isToday = d === todayStr();
              const isFuture = d > todayStr();
              const dayLabel = dayLabelFromDate(d);
              const dayNum = parseInt(d.split('-')[2]);
              const pIdx = planDayIndexForDate(d);
              const pDay = GYM_PLAN.find(p => p.dayIndex === pIdx);
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  disabled={isFuture}
                  style={{
                    padding: '0.4rem 0', borderRadius: '10px',
                    border: isSelected ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                    cursor: isFuture ? 'default' : 'pointer',
                    background: isSelected ? 'var(--accent-gradient)' : isToday ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.03)',
                    boxShadow: isSelected ? '0 3px 10px rgba(124,58,237,0.35)' : 'none',
                    minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem',
                    transition: 'all 0.18s', minHeight: '54px', opacity: isFuture ? 0.3 : 1,
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: '0.58rem', fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', lineHeight: 1 }}>{dayLabel}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: isSelected ? '#fff' : isToday ? '#a855f7' : 'rgba(255,255,255,0.65)', lineHeight: 1 }}>{dayNum}</span>
                  {pDay?.isRest
                    ? <Bed size={9} style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)', marginTop: '0.05rem' }} />
                    : <span style={{ fontSize: '0.46rem', color: isSelected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1, marginTop: '0.05rem' }}>
                        {(pDay?.name || '').split(/[,&]/)[0].trim().slice(0, 5)}
                      </span>
                  }
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { setWeekOffset(w => Math.min(w + 1, 0)); }}
            disabled={weekOffset >= 0}
            style={{ background: 'none', border: 'none', color: weekOffset >= 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)', cursor: weekOffset >= 0 ? 'default' : 'pointer', padding: '0.25rem', flexShrink: 0, display: 'flex', alignItems: 'center', minHeight: '44px', minWidth: '28px', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Day Content ──────────────────────────────────────────────── */}
      {isRestDay ? (
        <WeeklyGymInsights userId={userId} selectedDate={selectedDate} />
      ) : (
        <div style={{ opacity: syncing ? 0.75 : 1, transition: 'opacity 0.2s', pointerEvents: syncing ? 'none' : 'auto' }}>

          {/* Day card */}
          <div className="liquid-panel" style={{ margin: '0.85rem 1rem 0', padding: '0.9rem 1rem', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.7rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a855f7', background: 'rgba(124,58,237,0.14)', padding: '0.12rem 0.45rem', borderRadius: '99px' }}>{planDay?.name || `Day ${planDayIdx}`}</span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>{dayLabelFromDate(selectedDate) === dayLabelFromDate(todayStr()) ? 'Today' : dayLabelFromDate(selectedDate)}</span>
                </div>
                <h2 style={{ margin: '0.3rem 0 0.12rem', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{planDay?.subtitle}</h2>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)' }}>{planDay?.focus}</div>
              </div>
              {/* Progress ring */}
              <div style={{ position: 'relative', width: '52px', height: '52px', flexShrink: 0 }}>
                <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
                  <motion.circle cx="26" cy="26" r="20" fill="none" stroke={pct === 100 ? '#1db954' : '#a855f7'} strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - pct / 100) }}
                    transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</span>
                  <span style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.38)', fontWeight: 600, lineHeight: 1 }}>{doneExs}/{totalExs}</span>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.67rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.25rem' }}>
                <span>{doneExs}/{totalExs} exercises</span>
                <span>{doneSets}/{totalSets} sets</span>
              </div>
              <div style={{ height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#1db954' : 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: '99px', transition: 'width 0.4s' }} />
              </div>
            </div>
          </div>

          {/* Muscle Heatmap */}
          <MuscleHeatmap recentLogs={recentLogsForHeatmap} />

          {/* Treadmill (always at top of workout) */}
          {treadmillEntry && treadmillIdx !== -1 && (
            <div style={{ padding: '0.85rem 1rem 0' }}>
              <SectionLabel color="#ef4444" label="Cardio" />
              <TreadmillCard
                cardio={treadmillEntry}
                onChange={updated => updateCardio(treadmillIdx, updated)}
              />
            </div>
          )}

          {/* Exercise list */}
          <div style={{ padding: '0.85rem 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <SectionLabel color="#a855f7" label="Exercises" />

            {log?.exercises?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.75rem 1.25rem', background: 'rgba(124,58,237,0.04)', borderRadius: '16px', border: '1px dashed rgba(124,58,237,0.18)' }}>
                <Dumbbell size={26} style={{ color: '#a855f7', margin: '0 auto 0.6rem', opacity: 0.7 }} />
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: '0.3rem' }}>Start your workout</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', marginBottom: '1.1rem' }}>No exercises logged yet.</div>
                <button onClick={importPlan}
                  style={{ padding: '0.65rem 1.1rem', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}>
                  <Download size={14} /> Import My Routine
                </button>
              </div>
            ) : (
              log.exercises.map((ex, idx) => (
                <ExerciseCard
                  key={`${ex.exerciseId}-${idx}`}
                  index={idx}
                  ex={ex}
                  previousSession={previousSessionData[ex.exerciseId] ?? previousSessionData[ex.name] ?? null}
                  allTimePR={allTimePRs[ex.exerciseId] ?? null}
                  onUpdate={updateExerciseWithPR}
                  onDelete={deleteExercise}
                  onMoveToDate={(index, date) => moveExerciseToDate(index, date)}
                  onEditClick={setEditingExerciseIdx}
                  onHistoryClick={(id, name) => setHistoryFor({ id, name })}
                  onSetComplete={handleSetComplete}
                  editMode={editMode}
                />
              ))
            )}

            {/* Add Exercise */}
            <button onClick={() => setShowAddModal(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem', borderRadius: '12px', border: '1.5px dashed rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.03)', color: '#a855f7', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, minHeight: '48px' }}>
              <Plus size={15} /> Add Exercise
            </button>

            {/* Wipe templates (edit mode only) */}
            {editMode && (
              <button onClick={() => setShowWipeConfirm(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.1rem', minHeight: '48px' }}>
                <Trash2 size={14} /> Wipe All Custom Templates
              </button>
            )}

            {/* Extra Cardio */}
            {extraCardio.length > 0 && (
              <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <SectionLabel color="#ef4444" label="Extra Cardio" />
                {(log?.cardio ?? []).map((c, idx) => {
                  if (c.id === 'permanent_treadmill') return null;
                  return (
                    <CardioCard
                      key={c.id}
                      cardio={c}
                      onChange={updated => updateCardio(idx, updated)}
                      onDelete={() => deleteCardio(idx)}
                      editMode={editMode}
                    />
                  );
                })}
              </div>
            )}

            {/* Add Extra Cardio */}
            <button onClick={() => setShowAddCardioModal(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem', borderRadius: '12px', border: '1.5px dashed rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.03)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.1rem', minHeight: '48px' }}>
              <Plus size={15} /> Add Extra Cardio
            </button>
          </div>

          {/* Workout Complete Banner */}
          {allWorkoutDone && (
            <div style={{ margin: '0.85rem 1rem 1.25rem', padding: '1.1rem', borderRadius: '16px', background: 'linear-gradient(135deg,rgba(29,185,84,0.12),rgba(16,185,129,0.06))', border: '1px solid rgba(29,185,84,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🏆</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1db954' }}>Workout Complete!</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.42)', marginTop: '0.2rem' }}>
                {totalSets} sets done{workoutTimer.isActive ? ` · ${workoutTimer.formatted()}` : ''}. Great work! 💪
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Rest Timer Pill ──────────────────────────────── */}
      <RestTimerPill
        timeLeft={restTimer.timeLeft}
        totalTime={restTimer.totalTime}
        exerciseName={restTimer.exerciseName}
        isRunning={restTimer.isRunning}
        onSkip={restTimer.skip}
        onStop={restTimer.stop}
      />

      {/* ── ZenGymAI ──────────────────────────────────────────────── */}
      <ZenGymAI userId={userId} todayLog={log} profile={profile} />

      {/* ── Modals ────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddExerciseModal
          planDayIdx={planDayIdx}
          onAdd={addExercise}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingExerciseIdx !== null && log?.exercises[editingExerciseIdx] && (
        <AddExerciseModal
          planDayIdx={planDayIdx}
          initialExercise={log.exercises[editingExerciseIdx]}
          onAdd={(ex, savePermanently) => {
            updateExercise(editingExerciseIdx, ex);
            if (savePermanently && userId) {
              import('firebase/firestore').then(({ doc, setDoc, arrayUnion }) => {
                import('../../services/firebase').then(({ db }) => {
                  setDoc(doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`), {
                    userId,
                    customExercises: arrayUnion({ id: ex.exerciseId, name: ex.name, targetSets: ex.targetSets, targetReps: ex.targetReps, muscle: ex.muscle || null }),
                  }, { merge: true }).catch(console.error);
                });
              });
              toast.success('Exercise updated permanently!');
            } else {
              toast.success('Exercise updated for today!');
            }
          }}
          onClose={() => setEditingExerciseIdx(null)}
        />
      )}
      {showAddCardioModal && <AddCardioModal onAdd={addCardio} onClose={() => setShowAddCardioModal(false)} />}

      {historyFor && userId && (
        <ExerciseHistoryDrawer
          userId={userId}
          exerciseId={historyFor.id}
          exerciseName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {showProfileModal && userId && (
        <GymProfileModal
          userId={userId}
          initial={profile}
          onSave={saveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Clear Day Confirm */}
      {showClearConfirm && (
        <ConfirmModal
          title="Clear Entire Day?"
          body="This wipes all exercises and resets cardio for this day."
          confirmLabel="Clear"
          confirmColor="#ef4444"
          onConfirm={() => { clearDay(); setShowClearConfirm(false); }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {/* Wipe Templates Confirm */}
      {showWipeConfirm && (
        <ConfirmModal
          title="Wipe ALL Custom Templates?"
          body="Permanently deletes all saved custom routines for the entire week. Cannot be undone."
          confirmLabel="Yes, Wipe Everything"
          confirmColor="#ef4444"
          onConfirm={() => { wipeAllTemplates(); setShowWipeConfirm(false); }}
          onCancel={() => setShowWipeConfirm(false)}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes prBounce { from { opacity:0; transform:translateX(-50%) scale(0.7); } to { opacity:1; transform:translateX(-50%) scale(1); } }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { opacity: 0.5; }
        input[type=number] { -moz-appearance: textfield; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

// ── Small shared sub-components ───────────────────────────────────────────────

function SectionLabel({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
      <div style={{ width: '3px', height: '14px', borderRadius: '99px', background: color }} />
      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, confirmColor, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; confirmColor: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px', padding: '1.35rem', width: '100%', maxWidth: '320px', border: `1px solid ${confirmColor}44`, textAlign: 'center' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `${confirmColor}18`, border: `2px solid ${confirmColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.85rem', color: confirmColor }}>
          <Trash2 size={20} />
        </div>
        <h3 style={{ margin: '0 0 0.4rem', color: '#fff', fontSize: '1rem' }}>{title}</h3>
        <p style={{ margin: '0 0 1.25rem', color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
          <button onClick={onCancel} style={{ padding: '0.7rem', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '0.7rem', borderRadius: '10px', border: 'none', background: confirmColor, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
