import React, { useState, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Plus, Trash2, Edit3, History, MinusCircle, CalendarDays, PlaySquare } from 'lucide-react';
import SetRow from './SetRow';
import type { GymExerciseLog, GymSet, PreviousSessionExercise, GymPersonalRecord } from '../../../types/gym.types';
import { GYM_PLAN } from '../../../data/gymPlan';

/** Format kg: max 1 decimal, strip trailing zero */
const fmtKg = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  return parseFloat(v.toFixed(1)).toString();
};

const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#f97316', 'Back': '#3b82f6', 'Shoulders': '#8b5cf6',
  'Side Delts': '#7c3aed', 'Rear Delts': '#6d28d9', 'Triceps': '#10b981',
  'Biceps': '#06b6d4', 'Brachialis': '#0284c7', 'Forearms': '#0891b2',
  'Quads': '#f59e0b', 'Hamstrings': '#d97706', 'Glutes/Hams': '#b45309',
  'Quads/Glutes': '#ca8a04', 'Calves': '#65a30d', 'Soleus': '#4d7c0f',
  'Abs': '#ef4444', 'Core': '#dc2626', 'Obliques': '#be185d',
  'Upper Back / Rear Delts': '#7e22ce', 'Serratus / Pec Minor': '#ea580c',
};

export const resolveMuscleColor = (m: string | undefined) => {
  if (!m) return '#a855f7';
  const found = Object.keys(MUSCLE_COLORS).find(k => k.toLowerCase() === m.toLowerCase());
  return found ? MUSCLE_COLORS[found] : '#a855f7';
};

interface ExerciseCardProps {
  index: number;
  ex: GymExerciseLog;
  previousSession?: PreviousSessionExercise | null;
  allTimePR?: GymPersonalRecord | null;
  onUpdate: (idx: number, ex: GymExerciseLog) => void;
  onDelete: (idx: number) => void;
  onEditClick: (idx: number) => void;
  onMoveToDate: (idx: number, date: string) => void;
  onHistoryClick: (exerciseId: string, name: string) => void;
  onSetComplete: (exerciseName: string, restSecs: number) => void;
  editMode: boolean;
}

const ExerciseCard = memo(({
  index, ex, previousSession, allTimePR, onUpdate, onDelete,
  onEditClick, onMoveToDate, onHistoryClick, onSetComplete, editMode,
}: ExerciseCardProps) => {
  const [open, setOpen] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  const fallbackVideoId = React.useMemo(() => {
    if (ex.videoId) return ex.videoId;
    for (const day of GYM_PLAN) {
      const match = day.exercises?.find(e => e.id === ex.exerciseId);
      if (match?.videoId) return match.videoId;
    }
    return null;
  }, [ex.videoId, ex.exerciseId]);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const completedSets = ex.setsLog.filter(s => s.completed).length;
  const totalSets = ex.setsLog.length;
  const allDone = totalSets > 0 && completedSets === totalSets;
  const muscleColor = resolveMuscleColor(ex.muscle);
  const isSkipped = ex.skipped === true;

  // Build compact one-line summary: "3×10 @ 80kg"
  const lastCompletedWeight = ex.setsLog
    .filter(s => s.completed && s.weight != null)
    .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);
  const lastCompletedReps = ex.setsLog.find(s => s.completed)?.reps ?? null;
  const summaryStr = (() => {
    if (completedSets > 0 && lastCompletedWeight > 0 && lastCompletedReps) {
      return `${completedSets}×${lastCompletedReps} @ ${fmtKg(lastCompletedWeight)}kg`;
    }
    if (completedSets > 0 && lastCompletedReps) {
      return `${completedSets}×${lastCompletedReps} reps`;
    }
    return `${ex.targetSets} × ${ex.targetReps}`;
  })();

  // Detect PR
  const prWeight = allTimePR?.weightKg ?? 0;
  const newPRSet = (setIdx: number) => {
    if (!allTimePR || prWeight <= 0) return false;
    const s = ex.setsLog[setIdx];
    return s.completed && (s.weight ?? 0) > prWeight;
  };

  const addSet = () => {
    onUpdate(index, {
      ...ex,
      setsLog: [...ex.setsLog, { setNumber: ex.setsLog.length + 1, reps: null, weight: null, completed: false }],
    });
  };

  const updateSet = (idx: number, s: GymSet) => {
    const updated = [...ex.setsLog];
    updated[idx] = s;
    onUpdate(index, { ...ex, setsLog: updated });
  };

  const removeSet = (idx: number) => {
    const updated = ex.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 }));
    onUpdate(index, { ...ex, setsLog: updated });
  };

  const toggleSkip = () => {
    onUpdate(index, { ...ex, skipped: !ex.skipped });
  };

  const getRestTime = () => {
    const muscle = ex.muscle?.toLowerCase() ?? '';
    const isCompound = ['chest', 'back', 'quads', 'hamstrings', 'glutes'].some(m => muscle.includes(m));
    return isCompound ? 180 : 90;
  };

  return (
    <motion.div
      layout="position"
      className="liquid-panel"
      animate={{
        backgroundColor: isSkipped
          ? 'rgba(255,255,255,0.02)'
          : allDone ? 'rgba(29,185,84,0.06)' : 'rgba(25,25,30,0.45)',
        borderColor: isSkipped
          ? 'rgba(255,255,255,0.05)'
          : allDone ? 'rgba(29,185,84,0.2)' : 'rgba(255,255,255,0.08)',
        opacity: isSkipped ? 0.45 : allDone ? 0.65 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{ borderRadius: '14px', overflow: 'hidden', padding: 0 }}
    >
      {/* Muscle color left accent stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
        background: isSkipped ? 'rgba(255,255,255,0.1)' : allDone ? '#1db954' : muscleColor,
        borderRadius: '3px 0 0 3px',
        opacity: allDone ? 0.6 : 1,
      }} />

      {/* ── HEADER ROW (always visible, compact) ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 0.75rem 0.6rem 1rem',
          cursor: 'pointer', minHeight: '52px',
        }}
        onClick={() => !isSkipped && setOpen(o => !o)}
      >
        {/* Status circle — compact */}
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: isSkipped ? 'rgba(255,255,255,0.05)' : allDone ? '#1db954' : `${muscleColor}18`,
          border: `2px solid ${isSkipped ? 'rgba(255,255,255,0.15)' : allDone ? '#1db954' : muscleColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', fontWeight: 700,
          color: isSkipped ? 'rgba(255,255,255,0.3)' : allDone ? '#000' : muscleColor,
          transition: 'all 0.2s', flexDirection: 'column',
        }}>
          {isSkipped ? '—' : allDone ? <Check size={13} /> : (
            <>
              <span style={{ lineHeight: 1, fontSize: '0.6rem', fontWeight: 800 }}>{completedSets}</span>
              <span style={{ lineHeight: 1, fontSize: '0.45rem', color: allDone ? '#000' : `${muscleColor}90`, borderTop: `1px solid ${muscleColor}50`, paddingTop: '1px' }}>{totalSets}</span>
            </>
          )}
        </div>

        {/* Name + compact one-line summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.2,
            color: isSkipped ? 'rgba(255,255,255,0.3)' : allDone ? 'rgba(255,255,255,0.45)' : '#fff',
            textDecoration: (allDone || isSkipped) ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ex.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: '0.65rem', color: allDone ? '#1db954' : 'rgba(255,255,255,0.4)', fontWeight: allDone ? 700 : 400, whiteSpace: 'nowrap' }}>
              {summaryStr}
            </span>
            {allTimePR && allTimePR.weightKg > 0 && !isSkipped && (
              <span style={{ fontSize: '0.55rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '0.05rem 0.25rem', borderRadius: '99px', fontWeight: 700, flexShrink: 0 }}>
                PR:{fmtKg(allTimePR.weightKg)}
              </span>
            )}
          </div>
        </div>

        {/* Right action buttons — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
          {/* Form Video — always visible */}
          {fallbackVideoId && (
            <button
              onClick={e => { e.stopPropagation(); setShowPlayer(p => !p); }}
              style={{
                background: showPlayer ? 'rgba(255,0,0,0.2)' : 'rgba(255,0,0,0.08)',
                border: `1px solid rgba(255,0,0,${showPlayer ? '0.45' : '0.2'})`,
                padding: '0.28rem 0.4rem',
                borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '0.18rem',
                color: '#ef4444', cursor: 'pointer', transition: 'all 0.18s',
              }}
              title="Watch Form Tutorial"
            >
              <PlaySquare size={11} />
              <span style={{ fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase' }}>Form</span>
            </button>
          )}

          {/* History */}
          <button
            onClick={e => { e.stopPropagation(); onHistoryClick(ex.exerciseId, ex.name); }}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '0.28rem', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="View history"
          >
            <History size={12} />
          </button>

          {editMode && (
            <>
              <button
                onClick={e => { e.stopPropagation(); toggleSkip(); }}
                style={{ background: isSkipped ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isSkipped ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '7px', padding: '0.28rem', color: isSkipped ? '#818cf8' : 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title={isSkipped ? 'Unskip' : 'Skip'}
              >
                <MinusCircle size={12} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onEditClick(index); }}
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '7px', padding: '0.28rem', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Edit3 size={12} />
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { e.stopPropagation(); dateInputRef.current?.showPicker(); }}
                  style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '7px', padding: '0.28rem', color: '#a855f7', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Move to another day"
                >
                  <CalendarDays size={12} />
                </button>
                <input
                  type="date"
                  ref={dateInputRef}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, padding: 0, margin: 0, border: 'none', right: 0 }}
                  onChange={e => { if (e.target.value) { onMoveToDate(index, e.target.value); e.target.value = ''; } }}
                  onClick={e => e.stopPropagation()}
                />
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDelete(index); }}
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', padding: '0.28rem', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}

          {!isSkipped && (
            <div style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' }}>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          )}
        </div>
      </div>

      {/* ── EXPANDED CONTENT ── */}
      <AnimatePresence>
        {showPlayer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.75rem 0.75rem' }}>
              <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${fallbackVideoId}?autoplay=1`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </motion.div>
        )}

        {open && !isSkipped && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {/* Progressive Overload Banner */}
              {previousSession && previousSession.maxWeight > 0 && (() => {
                const lastWeight = previousSession.maxWeight;
                // If all sets were completed, suggest +2.5kg, else maintain weight
                const suggestedWeight = previousSession.allRepsCompleted
                  ? parseFloat((lastWeight + 2.5).toFixed(1))
                  : lastWeight;
                const isProgress = suggestedWeight > lastWeight;
                return (
                  <div style={{
                    padding: '0.5rem 0.65rem', borderRadius: '10px', marginBottom: '0.25rem',
                    background: isProgress ? 'rgba(29,185,84,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${isProgress ? 'rgba(29,185,84,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isProgress ? '#1db954' : '#f59e0b', marginBottom: '0.1rem' }}>
                        {isProgress ? '📈 Progressive Overload Target' : '🎯 Maintain Weight'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>
                        Last: <span style={{ color: '#fff', fontWeight: 700 }}>{fmtKg(lastWeight)}kg</span>
                        {isProgress && <> → Target: <span style={{ color: '#1db954', fontWeight: 800 }}>{fmtKg(suggestedWeight)}kg</span></>}
                      </div>
                    </div>
                    {isProgress && (
                      <div style={{ fontSize: '1.1rem', flexShrink: 0 }}>+2.5</div>
                    )}
                  </div>
                );
              })()}
              {ex.setsLog.map((s, idx) => (
                <SetRow
                  key={`${ex.exerciseId}-set-${idx}`}
                  set={s}
                  previousSet={previousSession?.sets?.[idx] ?? null}
                  isNewPR={newPRSet(idx)}
                  onChange={ns => updateSet(idx, ns)}
                  onDelete={() => removeSet(idx)}
                  onComplete={() => onSetComplete(ex.name, getRestTime())}
                />
              ))}
              <button
                onClick={addSet}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                  padding: '0.5rem', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.12)',
                  background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                  fontSize: '0.8rem', marginTop: '0.05rem', minHeight: '42px',
                }}
              >
                <Plus size={12} /> Add Set
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ExerciseCard.displayName = 'ExerciseCard';
export { MUSCLE_COLORS, ExerciseCard };
