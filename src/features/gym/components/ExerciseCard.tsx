import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import { Check, ChevronDown, Plus, Trash2, Edit3, History, MinusCircle, CalendarDays, PlaySquare, X } from 'lucide-react';
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
  stallWarning?: string;
  onUpdate: (idx: number, ex: GymExerciseLog) => void;
  onDelete: (idx: number) => void;
  onEditClick: (idx: number) => void;
  onMoveToDate: (idx: number, date: string) => void;
  onHistoryClick: (exerciseId: string, name: string) => void;
  onSetComplete: (exerciseName: string, restSecs: number) => void;
  editMode: boolean;
}

// ── CSS-driven smooth accordion (no framer-motion, no layout recalc) ──────────
// Using max-height transition is the gold standard for smooth collapsible content.
// It's GPU-composited via clip and avoids layout/paint jank.
const accordionStyles = `
.gym-accordion {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: grid-template-rows;
}
.gym-accordion.open {
  grid-template-rows: 1fr;
}
.gym-accordion > .gym-accordion-inner {
  overflow: hidden;
  min-height: 0;
}
.gym-card {
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(25,25,30,0.45);
  transition: background 220ms ease, border-color 220ms ease, opacity 220ms ease;
  will-change: background, opacity;
  -webkit-tap-highlight-color: transparent;
}
.gym-card.done {
  background: rgba(29,185,84,0.06);
  border-color: rgba(29,185,84,0.2);
  opacity: 0.65;
}
.gym-card.skipped {
  background: rgba(255,255,255,0.02);
  border-color: rgba(255,255,255,0.05);
  opacity: 0.45;
}
.gym-card-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  padding: 0.3rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.gym-card-btn:active {
  transform: scale(0.93);
  transition: transform 80ms ease, background 150ms ease;
}
.gym-chevron {
  color: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.gym-chevron.open {
  transform: rotate(180deg);
}
.gym-video-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: grid-template-rows;
  background: #000;
}
.gym-video-wrapper.open {
  grid-template-rows: 1fr;
}
.gym-video-wrapper > .gym-video-inner {
  overflow: hidden;
  min-height: 0;
}
`;

// Inject styles once
if (typeof document !== 'undefined' && !document.getElementById('gym-card-styles')) {
  const el = document.createElement('style');
  el.id = 'gym-card-styles';
  el.textContent = accordionStyles;
  document.head.appendChild(el);
}

// ── Video Player (lazy mount + smooth open) ────────────────────────────────────
const VideoPlayer = memo(({ videoId, isOpen, onClose }: { videoId: string; isOpen: boolean; onClose: () => void }) => {
  // Only render the iframe after the panel opens (prevents iframe pop-in)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (isOpen && !mounted) {
      // Small delay so the grid-template-rows animation starts first
      const t = setTimeout(() => setMounted(true), 60);
      return () => clearTimeout(t);
    }
    if (!isOpen) {
      // Unmount after close animation completes
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  return (
    <div className={`gym-video-wrapper${isOpen ? ' open' : ''}`}>
      <div className="gym-video-inner">
        <div style={{ position: 'relative', padding: '0 0.75rem 0.6rem' }}>
          {/* Close button overlay */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '6px', right: '18px', zIndex: 10,
              background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
          <div style={{
            position: 'relative', width: '100%', paddingBottom: '56.25%',
            borderRadius: '10px', overflow: 'hidden', background: '#000',
            marginTop: '0.5rem',
          }}>
            {mounted && (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
            {!mounted && (
              <div style={{
                position: 'absolute', inset: 0, background: '#111', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <PlaySquare size={32} color="rgba(255,255,255,0.15)" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
VideoPlayer.displayName = 'VideoPlayer';

// ── ExerciseCard ───────────────────────────────────────────────────────────────
const ExerciseCard = memo(({
  index, ex, previousSession, allTimePR, stallWarning, onUpdate, onDelete,
  onEditClick, onMoveToDate, onHistoryClick, onSetComplete, editMode,
}: ExerciseCardProps) => {
  const [open, setOpen] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const fallbackVideoId = React.useMemo(() => {
    if (ex.videoId) return ex.videoId;
    for (const day of GYM_PLAN) {
      const match = day.exercises?.find(e => e.id === ex.exerciseId);
      if (match?.videoId) return match.videoId;
    }
    return null;
  }, [ex.videoId, ex.exerciseId]);

  const completedSets = ex.setsLog.filter(s => s.completed).length;
  const totalSets = ex.setsLog.length;
  const allDone = totalSets > 0 && completedSets === totalSets;
  const muscleColor = resolveMuscleColor(ex.muscle);
  const isSkipped = ex.skipped === true;

  // Compact summary: "3×10 @ 80kg"
  const lastCompletedWeight = ex.setsLog
    .filter(s => s.completed && s.weight != null)
    .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);
  const lastCompletedReps = ex.setsLog.find(s => s.completed)?.reps ?? null;
  const summaryStr = (() => {
    if (completedSets > 0 && lastCompletedWeight > 0 && lastCompletedReps) {
      return `${completedSets}×${lastCompletedReps} @ ${fmtKg(lastCompletedWeight)}kg`;
    }
    if (completedSets > 0 && lastCompletedReps) return `${completedSets}×${lastCompletedReps} reps`;
    return `${ex.targetSets} × ${ex.targetReps}`;
  })();

  const prWeight = allTimePR?.weightKg ?? 0;
  const newPRSet = useCallback((setIdx: number) => {
    if (!allTimePR || prWeight <= 0) return false;
    const s = ex.setsLog[setIdx];
    return s.completed && (s.weight ?? 0) > prWeight;
  }, [allTimePR, prWeight, ex.setsLog]);

  const addSet = useCallback(() => {
    onUpdate(index, {
      ...ex,
      setsLog: [...ex.setsLog, { setNumber: ex.setsLog.length + 1, reps: null, weight: null, completed: false }],
    });
  }, [onUpdate, index, ex]);

  const updateSet = useCallback((idx: number, s: GymSet) => {
    const updated = [...ex.setsLog];
    updated[idx] = s;
    onUpdate(index, { ...ex, setsLog: updated });
  }, [onUpdate, index, ex]);

  const removeSet = useCallback((idx: number) => {
    const updated = ex.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 }));
    onUpdate(index, { ...ex, setsLog: updated });
  }, [onUpdate, index, ex]);

  const toggleSkip = useCallback(() => {
    onUpdate(index, { ...ex, skipped: !ex.skipped });
  }, [onUpdate, index, ex]);

  const getRestTime = useCallback(() => {
    const muscle = ex.muscle?.toLowerCase() ?? '';
    return ['chest', 'back', 'quads', 'hamstrings', 'glutes'].some(m => muscle.includes(m)) ? 180 : 90;
  }, [ex.muscle]);

  const handleToggleOpen = useCallback(() => {
    if (!isSkipped) setOpen(o => !o);
  }, [isSkipped]);

  const handleFormClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPlayer(p => !p);
  }, []);

  const handleCloseVideo = useCallback(() => setShowPlayer(false), []);

  // Progressive overload computation (memoized)
  const overloadBanner = React.useMemo(() => {
    if (!previousSession || previousSession.maxWeight <= 0) return null;
    const lastWeight = previousSession.maxWeight;
    const suggestedWeight = previousSession.allRepsCompleted
      ? parseFloat((lastWeight + 2.5).toFixed(1))
      : lastWeight;
    const isProgress = suggestedWeight > lastWeight;
    return { lastWeight, suggestedWeight, isProgress };
  }, [previousSession]);

  return (
    <div
      className={`gym-card${allDone ? ' done' : ''}${isSkipped ? ' skipped' : ''}`}
    >
      {/* Muscle accent stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
        background: isSkipped ? 'rgba(255,255,255,0.1)' : allDone ? '#1db954' : muscleColor,
        borderRadius: '3px 0 0 3px',
      }} />

      {/* ── HEADER (always visible, tap to expand) ── */}
      <div
        role="button"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.6rem 0.75rem 0.6rem 1rem',
          cursor: isSkipped ? 'default' : 'pointer',
          minHeight: '52px', userSelect: 'none', WebkitUserSelect: 'none',
        }}
        onClick={handleToggleOpen}
      >
        {/* Status circle */}
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: isSkipped ? 'rgba(255,255,255,0.05)' : allDone ? '#1db954' : `${muscleColor}18`,
          border: `2px solid ${isSkipped ? 'rgba(255,255,255,0.15)' : allDone ? '#1db954' : muscleColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', fontWeight: 700, flexDirection: 'column',
          color: isSkipped ? 'rgba(255,255,255,0.3)' : allDone ? '#000' : muscleColor,
          transition: 'background 200ms ease, border-color 200ms ease',
        }}>
          {isSkipped ? '—' : allDone ? <Check size={13} /> : (
            <>
              <span style={{ lineHeight: 1, fontSize: '0.6rem', fontWeight: 800 }}>{completedSets}</span>
              <span style={{ lineHeight: 1, fontSize: '0.45rem', color: `${muscleColor}90`, borderTop: `1px solid ${muscleColor}50`, paddingTop: '1px' }}>{totalSets}</span>
            </>
          )}
        </div>

        {/* Name + summary */}
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
            <span style={{
              fontSize: '0.65rem', fontWeight: allDone ? 700 : 400, whiteSpace: 'nowrap',
              color: allDone ? '#1db954' : 'rgba(255,255,255,0.4)',
            }}>
              {summaryStr}
            </span>
            {allTimePR && allTimePR.weightKg > 0 && !isSkipped && (
              <span style={{ fontSize: '0.55rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '0.05rem 0.25rem', borderRadius: '99px', fontWeight: 700, flexShrink: 0 }}>
                PR:{fmtKg(allTimePR.weightKg)}
              </span>
            )}
            {stallWarning && !isSkipped && (
              <span style={{ fontSize: '0.55rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '0.05rem 0.35rem', borderRadius: '99px', fontWeight: 800, flexShrink: 0, border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '0.15rem' }} title={stallWarning}>
                ⚠️ Stalled
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {fallbackVideoId && (
            <button
              className="gym-card-btn"
              onClick={handleFormClick}
              style={{
                background: showPlayer ? 'rgba(255,0,0,0.2)' : 'rgba(255,0,0,0.08)',
                borderColor: `rgba(255,0,0,${showPlayer ? '0.45' : '0.2'})`,
                color: '#ef4444', gap: '0.18rem', padding: '0.28rem 0.4rem',
              }}
              title="Watch Form Tutorial"
            >
              <PlaySquare size={11} />
              <span style={{ fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase' }}>Form</span>
            </button>
          )}

          <button
            className="gym-card-btn"
            onClick={e => { e.stopPropagation(); onHistoryClick(ex.exerciseId, ex.name); }}
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
            title="View history"
          >
            <History size={12} />
          </button>

          {editMode && (
            <>
              <button
                className="gym-card-btn"
                onClick={e => { e.stopPropagation(); toggleSkip(); }}
                style={{
                  background: isSkipped ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  borderColor: isSkipped ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                  color: isSkipped ? '#818cf8' : 'rgba(255,255,255,0.35)',
                }}
                title={isSkipped ? 'Unskip' : 'Skip'}
              >
                <MinusCircle size={12} />
              </button>
              <button
                className="gym-card-btn"
                onClick={e => { e.stopPropagation(); onEditClick(index); }}
                style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)', color: '#3b82f6' }}
              >
                <Edit3 size={12} />
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  className="gym-card-btn"
                  onClick={e => { e.stopPropagation(); dateInputRef.current?.showPicker(); }}
                  style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)', color: '#a855f7' }}
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
                className="gym-card-btn"
                onClick={e => { e.stopPropagation(); onDelete(index); }}
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}

          {!isSkipped && (
            <div className={`gym-chevron${open ? ' open' : ''}`}>
              <ChevronDown size={15} />
            </div>
          )}
        </div>
      </div>

      {/* ── FORM VIDEO (CSS accordion, lazy iframe) ── */}
      <VideoPlayer videoId={fallbackVideoId || ''} isOpen={showPlayer && !!fallbackVideoId} onClose={handleCloseVideo} />

      {/* ── EXPANDED SETS CONTENT (CSS accordion) ── */}
      <div className={`gym-accordion${open && !isSkipped ? ' open' : ''}`}>
        <div className="gym-accordion-inner">
          <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {/* Progressive Overload Banner */}
            {overloadBanner && (
              <div style={{
                padding: '0.5rem 0.65rem', borderRadius: '10px', marginBottom: '0.15rem',
                background: overloadBanner.isProgress ? 'rgba(29,185,84,0.08)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${overloadBanner.isProgress ? 'rgba(29,185,84,0.2)' : 'rgba(245,158,11,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: overloadBanner.isProgress ? '#1db954' : '#f59e0b', marginBottom: '0.1rem' }}>
                    {overloadBanner.isProgress ? '📈 Progressive Overload Target' : '🎯 Maintain Weight'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>
                    Last: <span style={{ color: '#fff', fontWeight: 700 }}>{fmtKg(overloadBanner.lastWeight)}kg</span>
                    {overloadBanner.isProgress && <> → Target: <span style={{ color: '#1db954', fontWeight: 800 }}>{fmtKg(overloadBanner.suggestedWeight)}kg</span></>}
                  </div>
                </div>
                {overloadBanner.isProgress && (
                  <div style={{ fontSize: '1rem', flexShrink: 0, fontWeight: 800, color: '#1db954' }}>+2.5</div>
                )}
              </div>
            )}

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
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              <Plus size={12} /> Add Set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

ExerciseCard.displayName = 'ExerciseCard';
export { MUSCLE_COLORS, ExerciseCard };
