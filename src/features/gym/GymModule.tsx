import { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth } from '../../services/firebase';
import { doc, getDoc, setDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Dumbbell, ChevronDown, ChevronUp, Check, Plus, Trash2,
  Edit3, X, Bed, Flame,
  RotateCcw, Timer, Zap, Wind, Download,
} from 'lucide-react';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../data/gymPlan';
import type { GymDayLog, GymExerciseLog, GymSet, GymPlanExercise, GymCardioLog } from '../../types/gym.types';
import { toast } from 'sonner';
import { ZenGymAI } from './ZenGymAI';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabelFromDate(dateS: string): string {
  const d = new Date(dateS + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function planDayIndexForDate(dateS: string): number {
  const d = new Date(dateS + 'T00:00:00');
  return WEEKDAY_TO_PLAN[d.getDay()];
}

function makeDocId(userId: string, date: string) {
  return `${userId}_${date}`;
}

/** The permanent treadmill entry that lives on every active day */
function makeTreadmillEntry(): GymCardioLog {
  return {
    id: 'permanent_treadmill',
    type: 'Treadmill',
    durationMinutes: null,
    distanceKm: null,
    speedKmh: null,
    calories: null,
    completed: false,
    isPermanent: true,
  };
}

function buildDefaultLog(userId: string, date: string, planDayIdx: number): GymDayLog {
  const plan = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isRestDay = plan?.isRest === true;

  // Auto-populate plan exercises so user just enters weights — no manual import needed
  const exercises: GymExerciseLog[] = isRestDay ? [] : (plan?.exercises || []).map(ex => ({
    exerciseId: ex.id,
    name: ex.name,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    muscle: ex.muscle,
    isCustom: false,
    setsLog: Array.from({ length: ex.targetSets }, (_, i) => ({
      setNumber: i + 1, reps: null, weight: null, completed: false,
    })),
  }));

  return {
    userId,
    date,
    dayPlanIndex: planDayIdx,
    exercises,
    cardio: isRestDay ? [] : [makeTreadmillEntry()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Ensure a loaded log always has the permanent treadmill entry on active days */
function ensureTreadmill(log: GymDayLog, isRestDay: boolean): GymDayLog {
  if (isRestDay) return log;
  const cardio = log.cardio || [];
  const hasTreadmill = cardio.some(c => c.id === 'permanent_treadmill');
  if (hasTreadmill) return log;
  return { ...log, cardio: [makeTreadmillEntry(), ...cardio] };
}

// Muscle tag colours
const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#f97316',
  'Back': '#3b82f6',
  'Shoulders': '#8b5cf6',
  'Side Delts': '#7c3aed',
  'Rear Delts': '#6d28d9',
  'Triceps': '#10b981',
  'Biceps': '#06b6d4',
  'Brachialis': '#0284c7',
  'Forearms': '#0891b2',
  'Quads': '#f59e0b',
  'Hamstrings': '#d97706',
  'Glutes/Hams': '#b45309',
  'Quads/Glutes': '#ca8a04',
  'Calves': '#65a30d',
  'Soleus': '#4d7c0f',
  'Abs': '#ef4444',
  'Core': '#dc2626',
  'Obliques': '#be185d',
  'Upper Back / Rear Delts': '#7e22ce',
  'Serratus / Pec Minor': '#ea580c',
};

const resolveMuscleColor = (m: string | undefined): string => {
  if (!m) return '#a855f7';
  const found = Object.keys(MUSCLE_COLORS).find(k => k.toLowerCase() === m.toLowerCase());
  return found ? MUSCLE_COLORS[found] : '#a855f7';
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface SetRowProps {
  set: GymSet;
  onChange: (s: GymSet) => void;
  onDelete: () => void;
}

const SetRow = ({ set, onChange, onDelete }: SetRowProps) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr) minmax(0, 1fr) auto',
    gap: '0.4rem',
    alignItems: 'center',
    padding: '0.45rem 0.5rem',
    borderRadius: '10px',
    background: set.completed ? 'rgba(29,185,84,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${set.completed ? 'rgba(29,185,84,0.25)' : 'rgba(255,255,255,0.07)'}`,
    transition: 'all 0.2s',
  }}>
    {/* Set # */}
    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textAlign: 'center' }}>
      {set.setNumber}
    </div>
    {/* Reps */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Reps</label>
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', height: '36px' }}>
        <button onClick={() => onChange({...set, reps: Math.max(0, (set.reps||0) - 1)})} style={{ padding: '0 0.4rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700 }}>-</button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={set.reps ?? ''}
          onChange={e => onChange({ ...set, reps: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="—"
          style={{ width: '100%', minWidth: 0, padding: 0, background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '0.95rem', fontWeight: 700, outline: 'none' }}
        />
        <button onClick={() => onChange({...set, reps: (set.reps||0) + 1})} style={{ padding: '0 0.4rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700 }}>+</button>
      </div>
    </div>
    {/* Weight */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>kg</label>
      <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', height: '36px' }}>
        <button onClick={() => onChange({...set, weight: Math.max(0, (set.weight||0) - 2.5)})} style={{ padding: '0 0.4rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700 }}>-</button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={set.weight ?? ''}
          onChange={e => onChange({ ...set, weight: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="—"
          style={{ width: '100%', minWidth: 0, padding: 0, background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '0.95rem', fontWeight: 700, outline: 'none' }}
        />
        <button onClick={() => onChange({...set, weight: (set.weight||0) + 2.5})} style={{ padding: '0 0.4rem', background: 'rgba(255,255,255,0.03)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700 }}>+</button>
      </div>
    </div>
    {/* Done checkbox + delete */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
      <button
        onClick={() => onChange({ ...set, completed: !set.completed })}
        style={{
          width: '32px', height: '32px', borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: set.completed ? '#1db954' : 'rgba(255,255,255,0.07)',
          color: set.completed ? '#000' : 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        title="Mark done"
      >
        <Check size={14} />
      </button>
      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: '0', display: 'flex', alignItems: 'center' }}
        title="Remove set"
      >
        <X size={11} />
      </button>
    </div>
  </div>
);

interface ExerciseCardProps {
  ex: GymExerciseLog;
  onChange: (ex: GymExerciseLog) => void;
  onDelete: () => void;
  onEditClick: () => void;
  editMode: boolean;
}

const ExerciseCard = ({ ex, onChange, onDelete, onEditClick, editMode }: ExerciseCardProps) => {
  const [open, setOpen] = useState(false);
  const completedSets = ex.setsLog.filter(s => s.completed).length;
  const totalSets = ex.setsLog.length;
  const allDone = totalSets > 0 && completedSets === totalSets;
  const muscleColor = resolveMuscleColor(ex.muscle);

  const addSet = () => {
    onChange({
      ...ex,
      setsLog: [...ex.setsLog, { setNumber: ex.setsLog.length + 1, reps: null, weight: null, completed: false }],
    });
  };

  const updateSet = (idx: number, s: GymSet) => {
    const updated = [...ex.setsLog];
    updated[idx] = s;
    onChange({ ...ex, setsLog: updated });
  };

  const removeSet = (idx: number) => {
    const updated = ex.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 }));
    onChange({ ...ex, setsLog: updated });
  };

  return (
    <motion.div 
      layout
      className="liquid-panel"
      animate={{
        backgroundColor: allDone ? 'rgba(29,185,84,0.15)' : 'rgba(25, 25, 30, 0.45)',
        borderColor: allDone ? 'rgba(29,185,84,0.4)' : 'rgba(255, 255, 255, 0.1)',
        scale: allDone ? 0.98 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{
      borderRadius: '14px',
      overflow: 'hidden',
      padding: 0,
    }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 0.9rem', cursor: 'pointer',
          background: allDone ? 'rgba(29,185,84,0.06)' : 'transparent',
          minHeight: '60px',
        }}
        onClick={() => setOpen(o => !o)}
      >
        {/* Status circle */}
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          background: allDone ? '#1db954' : `rgba(${muscleColor.replace(/[^\d,]/g, '')},0.12)` || 'rgba(168,85,247,0.12)',
          border: `2px solid ${allDone ? '#1db954' : muscleColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700,
          color: allDone ? '#000' : muscleColor,
          transition: 'all 0.2s',
        }}>
          {allDone ? <Check size={16} /> : `${completedSets}/${totalSets}`}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: allDone ? 'rgba(255,255,255,0.6)' : '#fff', lineHeight: 1.3, wordBreak: 'break-word', textDecoration: allDone ? 'line-through' : 'none' }}>
            {ex.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{ex.targetSets} × {ex.targetReps}</span>
            {ex.muscle && (
              <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '99px', background: `${muscleColor}22`, color: muscleColor, border: `1px solid ${muscleColor}44` }}>
                {ex.muscle}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {editMode && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onEditClick(); }}
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', padding: '0.35rem 0.5rem', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.35rem 0.5rem', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <div style={{ color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {/* Expanded: set logger */}
      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.9rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {ex.setsLog.map((s, idx) => (
                <SetRow
                  key={idx}
                  set={s}
                  onChange={ns => updateSet(idx, ns)}
                  onDelete={() => removeSet(idx)}
                />
              ))}
              <button
                onClick={addSet}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  padding: '0.55rem', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.15)',
                  background: 'transparent', color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                  fontSize: '0.82rem', marginTop: '0.1rem', minHeight: '44px',
                }}
              >
                <Plus size={13} /> Add Set
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Add/Edit Exercise Modal ────────────────────────────────────────────────────────
interface AddExerciseModalProps {
  planDayIdx: number;
  initialExercise?: GymExerciseLog;
  onAdd: (ex: GymExerciseLog, savePermanently: boolean) => void;
  onClose: () => void;
}

const AddExerciseModal = ({ planDayIdx, initialExercise, onAdd, onClose }: AddExerciseModalProps) => {
  const plan = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isEditMode = !!initialExercise;
  const [name, setName] = useState(initialExercise?.name || '');
  const [sets, setSets] = useState(initialExercise?.targetSets || 3);
  const [reps, setReps] = useState(initialExercise?.targetReps || '8–12');
  const [muscle, setMuscle] = useState(initialExercise?.muscle || '');
  const [savePermanently, setSavePermanently] = useState(false);
  const [fromPlan, setFromPlan] = useState<GymPlanExercise | null>(null);

  const submit = () => {
    if (!name.trim()) { toast.error('Exercise name required'); return; }
    let ex: GymExerciseLog;
    if (isEditMode && initialExercise) {
      let newSetsLog = [...initialExercise.setsLog];
      if (sets > newSetsLog.length) {
        const toAdd = sets - newSetsLog.length;
        for (let i = 0; i < toAdd; i++) {
          newSetsLog.push({ setNumber: newSetsLog.length + 1, reps: null, weight: null, completed: false });
        }
      } else if (sets < newSetsLog.length) {
        newSetsLog = newSetsLog.slice(0, sets);
      }
      ex = {
        ...initialExercise,
        name: name.trim(),
        targetSets: sets,
        targetReps: reps,
        muscle: muscle || undefined,
        setsLog: newSetsLog,
      };
    } else {
      ex = {
        exerciseId: fromPlan?.id || `custom_${Date.now()}`,
        name: name.trim(),
        targetSets: sets,
        targetReps: reps,
        muscle: muscle || undefined,
        isCustom: !fromPlan,
        setsLog: Array.from({ length: sets }, (_, i) => ({
          setNumber: i + 1, reps: null, weight: null, completed: false,
        })),
      };
    }
    onAdd(ex, savePermanently);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', padding: '1.5rem', paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom, 20px))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{isEditMode ? 'Edit Exercise' : 'Add Exercise'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        {/* Quick-add from plan */}
        {!isEditMode && plan && plan.exercises.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>From your {plan.name} split</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '160px', overflowY: 'auto' }}>
              {plan.exercises.map(p => (
                <button key={p.id} onClick={() => { setName(p.name); setSets(p.targetSets); setReps(p.targetReps); setMuscle(p.muscle || ''); setFromPlan(p); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '10px', border: `1px solid ${fromPlan?.id === p.id ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.07)'}`, background: fromPlan?.id === p.id ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', minHeight: '44px' }}>
                  <span style={{ fontSize: '0.85rem', color: fromPlan?.id === p.id ? '#a855f7' : 'rgba(255,255,255,0.8)', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{p.targetSets}×{p.targetReps}</span>
                </button>
              ))}
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.75rem 0' }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.3rem' }}>Exercise Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cable Flyes" style={{ width: '100%', padding: '0.75rem 0.85rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.3rem' }}>Sets</label>
              <input type="number" min={1} max={10} value={sets} onChange={e => setSets(Number(e.target.value))} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.95rem', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.3rem' }}>Reps / Duration</label>
              <input value={reps} onChange={e => setReps(e.target.value)} placeholder="e.g. 8–12" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.95rem', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.3rem' }}>Muscle Group (optional)</label>
            <select value={muscle} onChange={e => setMuscle(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}>
              <option value="" style={{ color: '#000' }}>None</option>
              {Object.keys(MUSCLE_COLORS).sort().map(m => (
                <option key={m} value={m} style={{ color: '#000' }}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input 
              type="checkbox" 
              id="savePermanently" 
              checked={savePermanently} 
              onChange={e => setSavePermanently(e.target.checked)} 
              style={{ width: '18px', height: '18px', accentColor: '#1db954', cursor: 'pointer' }}
            />
            <label htmlFor="savePermanently" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', userSelect: 'none' }}>
              Save permanently to this day's split
            </label>
          </div>
          <button onClick={submit} style={{ padding: '0.9rem', borderRadius: '12px', border: 'none', background: 'var(--accent-gradient)', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.25rem', minHeight: '52px' }}>
            {isEditMode ? 'Save Changes' : 'Add Exercise'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Treadmill Card (always-visible, permanent) ────────────────────────────────
interface TreadmillCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
}

const TreadmillCard = ({ cardio, onChange }: TreadmillCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;
  const hasData = cardio.durationMinutes || cardio.distanceKm || cardio.speedKmh;

  return (
    <div className="liquid-panel" style={{
      background: done ? 'rgba(29,185,84,0.15)' : 'rgba(25, 25, 30, 0.45)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
      borderRadius: '14px',
      overflow: 'hidden',
      transition: 'all 0.2s',
      padding: 0,
    }}>
      {/* ── Tappable header — same pattern as ExerciseCard ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 0.9rem', cursor: 'pointer',
          background: done ? 'rgba(29,185,84,0.06)' : 'transparent',
          minHeight: '60px',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#1db954' : 'rgba(239,68,68,0.12)',
          border: `2px solid ${done ? '#1db954' : '#ef4444'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: done ? '#000' : '#ef4444',
          transition: 'all 0.2s',
        }}>
          {done ? <Check size={16} /> : <Wind size={16} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: done ? 'rgba(255,255,255,0.6)' : '#fff', textDecoration: done ? 'line-through' : 'none' }}>
            🏃 Treadmill
          </div>
          {/* Chips when collapsed */}
          {!open && hasData ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              {!!cardio.durationMinutes && <span style={{ fontSize: '0.68rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '0.1rem 0.4rem', borderRadius: '99px', fontWeight: 600 }}>⏱ {cardio.durationMinutes} min</span>}
              {!!cardio.distanceKm && <span style={{ fontSize: '0.68rem', color: '#fb923c', background: 'rgba(251,146,60,0.1)', padding: '0.1rem 0.4rem', borderRadius: '99px', fontWeight: 600 }}>📍 {cardio.distanceKm} km</span>}
              {!!cardio.speedKmh && <span style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '0.1rem 0.4rem', borderRadius: '99px', fontWeight: 600 }}>💨 {cardio.speedKmh} km/h</span>}
            </div>
          ) : !open ? (
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.15rem' }}>Tap to log session</div>
          ) : null}
        </div>

        <div style={{ color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* ── Expanded: inputs + done button ── */}
      {open && (
      <div style={{ padding: '0 0.9rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
          {/* Time */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.25rem',
            }}>
              <Timer size={9} /> mins
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              value={cardio.durationMinutes ?? ''}
              onChange={e => onChange({ ...cardio, durationMinutes: e.target.value ? Number(e.target.value) : null })}
              placeholder="—"
              style={{
                width: '100%', padding: '0.65rem 0.35rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center',
                outline: 'none', boxSizing: 'border-box',
                WebkitAppearance: 'none',
              }}
            />
          </div>

          {/* Distance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.25rem',
            }}>
              <Zap size={9} /> km
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              max={50}
              value={cardio.distanceKm ?? ''}
              onChange={e => onChange({ ...cardio, distanceKm: e.target.value ? Number(e.target.value) : null })}
              placeholder="—"
              style={{
                width: '100%', padding: '0.65rem 0.35rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center',
                outline: 'none', boxSizing: 'border-box',
                WebkitAppearance: 'none',
              }}
            />
          </div>

          {/* Speed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.25rem',
            }}>
              <Wind size={9} /> km/h
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              max={30}
              value={cardio.speedKmh ?? ''}
              onChange={e => onChange({ ...cardio, speedKmh: e.target.value ? Number(e.target.value) : null })}
              placeholder="—"
              style={{
                width: '100%', padding: '0.65rem 0.35rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center',
                outline: 'none', boxSizing: 'border-box',
                WebkitAppearance: 'none',
              }}
            />
          </div>
        </div>

        {/* Mark Done button */}
        <button
          onClick={() => { onChange({ ...cardio, completed: !done }); if (!done) setOpen(false); }}
          style={{
            padding: '0.7rem', borderRadius: '10px', border: 'none',
            background: done ? '#1db954' : 'rgba(255,255,255,0.1)',
            color: done ? '#000' : '#fff', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            cursor: 'pointer', minHeight: '44px', fontSize: '0.9rem', transition: 'all 0.15s',
          }}
        >
          <Check size={15} /> {done ? 'Completed ✓' : 'Mark as Done'}
        </button>
      </div>
      )}
    </div>
  );
};

// ── Other Cardio Card (collapsible) ──────────────────────────────────────────
interface CardioCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
  onDelete: () => void;
  editMode: boolean;
}

const CardioCard = ({ cardio, onChange, onDelete, editMode }: CardioCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '14px',
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 0.9rem', cursor: 'pointer',
          background: done ? 'rgba(29,185,84,0.06)' : 'transparent',
          minHeight: '60px',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#1db954' : 'rgba(239,68,68,0.12)',
          border: `2px solid ${done ? '#1db954' : '#ef4444'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: done ? '#000' : '#ef4444',
          transition: 'all 0.2s',
        }}>
          {done ? <Check size={16} /> : <Flame size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: done ? 'rgba(255,255,255,0.6)' : '#fff', textDecoration: done ? 'line-through' : 'none' }}>
            {cardio.type}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
            {cardio.durationMinutes && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{cardio.durationMinutes} min</span>}
            {cardio.distanceKm && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{cardio.distanceKm} km</span>}
            {cardio.speedKmh && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{cardio.speedKmh} km/h</span>}
            {cardio.calories && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{cardio.calories} kcal</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {editMode && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.35rem 0.5rem', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Trash2 size={14} />
            </button>
          )}
          <div style={{ color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: '0.25rem' }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 0.9rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Minutes</label>
              <input type="number" value={cardio.durationMinutes || ''} onChange={e => onChange({ ...cardio, durationMinutes: e.target.value ? Number(e.target.value) : null })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.95rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Dist (km)</label>
              <input type="number" step="0.1" value={cardio.distanceKm || ''} onChange={e => onChange({ ...cardio, distanceKm: e.target.value ? Number(e.target.value) : null })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.95rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Calories</label>
              <input type="number" value={cardio.calories || ''} onChange={e => onChange({ ...cardio, calories: e.target.value ? Number(e.target.value) : null })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.95rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={() => onChange({ ...cardio, completed: !cardio.completed })} style={{ marginTop: '0.25rem', padding: '0.6rem', borderRadius: '10px', border: 'none', background: cardio.completed ? '#1db954' : 'rgba(255,255,255,0.1)', color: cardio.completed ? '#000' : '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', minHeight: '44px' }}>
            <Check size={14} /> {cardio.completed ? 'Completed' : 'Mark Complete'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Add Cardio Modal ──────────────────────────────────────────────────────────
const AddCardioModal = ({ onAdd, onClose }: { onAdd: (c: GymCardioLog) => void, onClose: () => void }) => {
  const [type, setType] = useState('Cycling');

  const submit = () => {
    onAdd({
      id: `cardio_${Date.now()}`,
      type,
      durationMinutes: null,
      distanceKm: null,
      speedKmh: null,
      calories: null,
      completed: false,
    });
    onClose();
  };

  const cardioTypes = ['Cycling', 'Stairmaster', 'Elliptical', 'Rowing', 'Outdoor Run', 'Jump Rope', 'Swimming', 'Other'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', padding: '1.5rem', paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom, 20px))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Add Extra Cardio</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
          🏃 Treadmill is always included. Add any extra cardio here.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '0.5rem' }}>Cardio Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {cardioTypes.map(t => (
                <button key={t} onClick={() => setType(t)} style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', border: `1px solid ${type === t ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`, background: type === t ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: type === t ? '#f87171' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.88rem', minHeight: '44px' }}>{t}</button>
              ))}
            </div>
          </div>
          <button onClick={submit} style={{ padding: '0.9rem', borderRadius: '12px', border: 'none', background: 'var(--accent-gradient)', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', minHeight: '52px' }}>
            Add Cardio Session
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main GymModule ────────────────────────────────────────────────────────────
export const GymModule = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // Initialize log immediately from plan data so the UI renders instantly.
  // Firestore data will silently overwrite this with saved weights/completion.
  const [log, setLog] = useState<GymDayLog>(() => {
    const date = todayStr();
    const pidx = planDayIndexForDate(date);
    return buildDefaultLog('', date, pidx);
  });
  const [syncing, setSyncing] = useState(true); // subtle background sync indicator
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExerciseIdx, setEditingExerciseIdx] = useState<number | null>(null);
  const [showAddCardioModal, setShowAddCardioModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showWipeTemplatesConfirm, setShowWipeTemplatesConfirm] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const planDayIdx = planDayIndexForDate(selectedDate);
  const planDay = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isRestDay = planDay?.isRest === true;

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUserId(u?.uid || null));
    return () => unsub();
  }, []);

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : true);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load log for selected date — silently updates UI already rendered from plan
  const loadLog = useCallback(async () => {
    if (!userId) return;
    // Show plan structure immediately for the new date before Firestore responds
    setLog(buildDefaultLog(userId, selectedDate, planDayIdx));
    setSyncing(true);
    try {
      const logRef = doc(db, 'gymLogs', makeDocId(userId, selectedDate));
      const logSnap = await getDoc(logRef);
      if (logSnap.exists()) {
        const loaded = logSnap.data() as GymDayLog;
        setLog(ensureTreadmill(loaded, isRestDay));
      } else {
        // If no log exists for this specific day yet, fetch permanent custom exercises
        const customRef = doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`);
        const customSnap = await getDoc(customRef);
        let defaultLog = buildDefaultLog(userId, selectedDate, planDayIdx);
        if (customSnap.exists()) {
          const customData = customSnap.data();
          if (customData.customExercises && customData.customExercises.length > 0) {
            const customLogExercises: GymExerciseLog[] = customData.customExercises.map((cx: any) => ({
              exerciseId: cx.id,
              name: cx.name,
              targetSets: cx.targetSets,
              targetReps: cx.targetReps,
              muscle: cx.muscle,
              isCustom: true,
              setsLog: Array.from({ length: cx.targetSets }, (_, i) => ({
                setNumber: i + 1, reps: null, weight: null, completed: false,
              })),
            }));
            defaultLog = { ...defaultLog, exercises: [...defaultLog.exercises, ...customLogExercises] };
            setLog(defaultLog);
          }
        }
      }
    } catch (e) {
      console.error('GymModule load error:', e);
      // Keep the default log already displayed
    } finally {
      setSyncing(false);
    }
  }, [userId, selectedDate, planDayIdx, isRestDay]);

  useEffect(() => { loadLog(); }, [loadLog]);

  useEffect(() => {
    const handleUpdate = () => loadLog();
    window.addEventListener('gym-log-updated', handleUpdate);
    return () => window.removeEventListener('gym-log-updated', handleUpdate);
  }, [loadLog]);

  // Auto-save with debounce
  const saveLog = useCallback(async (data: GymDayLog) => {
    if (!userId) return;
    setSaving(true);
    try {
      const updated = { ...data, updatedAt: Date.now() };
      await setDoc(doc(db, 'gymLogs', makeDocId(userId, selectedDate)), updated);
      setLog(updated);
    } catch (e) {
      console.error('GymModule save error:', e);
      toast.error('Failed to save — check connection');
    } finally {
      setSaving(false);
    }
  }, [userId, selectedDate]);

  const scheduleAutosave = useCallback((data: GymDayLog) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveLog(data), 1200);
  }, [saveLog]);

  const updateExercise = (idx: number, ex: GymExerciseLog) => {
    if (!log) return;
    const exs = [...log.exercises];
    exs[idx] = ex;
    const updated = { ...log, exercises: exs, updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
  };

  const deleteExercise = (idx: number) => {
    if (!log) return;
    const exs = log.exercises.filter((_, i) => i !== idx);
    const updated = { ...log, exercises: exs, updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    toast.success('Exercise removed');
  };

  const addExercise = async (ex: GymExerciseLog, savePermanently: boolean) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises, ex], updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    
    if (savePermanently && userId) {
      try {
        const customRef = doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`);
        const planEx = {
          id: ex.exerciseId,
          name: ex.name,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          muscle: ex.muscle,
        };
        await setDoc(customRef, {
          customExercises: arrayUnion(planEx)
        }, { merge: true });
        toast.success('Saved permanently to your split!');
      } catch (err) {
        console.error('Failed to save permanent exercise', err);
        toast.error('Failed to save permanently');
      }
    } else {
      toast.success('Exercise added!');
    }
  };

  const updateCardio = (idx: number, c: GymCardioLog) => {
    if (!log) return;
    const cArr = log.cardio ? [...log.cardio] : [];
    cArr[idx] = c;
    const updated = { ...log, cardio: cArr, updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
  };

  const deleteCardio = (idx: number) => {
    if (!log) return;
    // Never delete the permanent treadmill
    const item = (log.cardio || [])[idx];
    if (item?.isPermanent) { toast.error('Treadmill is always tracked'); return; }
    const cArr = (log.cardio || []).filter((_, i) => i !== idx);
    const updated = { ...log, cardio: cArr, updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    toast.success('Cardio removed');
  };

  const addCardio = (c: GymCardioLog) => {
    if (!log) return;
    const cArr = log.cardio ? [...log.cardio] : [];
    const updated = { ...log, cardio: [...cArr, c], updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    toast.success('Cardio added!');
  };

  const clearDay = () => {
    if (!userId || !log) return;
    const resetCardio = [{
      id: 'permanent_treadmill',
      name: 'Treadmill',
      isPermanent: true,
      durationMinutes: null,
      distanceKm: null,
      speedKmh: null,
      type: 'Treadmill',
      calories: null,
      completed: false,
    }];
    const updated = { ...log, exercises: [], cardio: resetCardio, updatedAt: Date.now() };
    setLog(updated);
    scheduleAutosave(updated);
    toast.success('Day cleared');
    setShowClearConfirm(false);
  };

  const importPlan = () => {
    if (!userId || !log) return;
    if (planDay?.exercises && planDay.exercises.length > 0) {
      const planExercises: GymExerciseLog[] = planDay.exercises.map(ex => ({
        exerciseId: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        muscle: ex.muscle,
        setsLog: Array.from({ length: ex.targetSets }, (_, i) => ({
          setNumber: i + 1, reps: null, weight: null, completed: false,
        })),
      }));
      
      const updated = { 
        ...log, 
        exercises: [...log.exercises, ...planExercises], 
        updatedAt: Date.now() 
      };
      setLog(updated);
      scheduleAutosave(updated);
      toast.success('Plan imported successfully!');
    } else {
      toast.error('No plan available for this day.');
    }
  };

  const wipeAllTemplates = async () => {
    if (!userId) return;
    if (confirm('Are you sure you want to permanently delete ALL of your saved custom routines for the entire week? This cannot be undone.')) {
      try {
        for (let i = 1; i <= 7; i++) {
          await deleteDoc(doc(db, 'gymCustomPlans', `${userId}_day${i}`));
        }
        toast.success('All custom templates wiped successfully');
      } catch (err) {
        console.error('Failed to wipe templates', err);
        toast.error('Failed to wipe templates');
      }
    }
  };

  // ── Progress stats ─────────────────────────────────────────────────────────
  const totalSets = log?.exercises.reduce((a, ex) => a + ex.setsLog.length, 0) || 0;
  const doneSets = log?.exercises.reduce((a, ex) => a + ex.setsLog.filter(s => s.completed).length, 0) || 0;
  const doneExs = log?.exercises.filter(ex => ex.setsLog.length > 0 && ex.setsLog.every(s => s.completed)).length || 0;
  const totalExs = log?.exercises.length || 0;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  // Split cardio: permanent treadmill vs extras
  const treadmillEntry = log?.cardio?.find(c => c.id === 'permanent_treadmill') || null;
  const treadmillIdx = log?.cardio?.findIndex(c => c.id === 'permanent_treadmill') ?? -1;
  const extraCardio = (log?.cardio || []).filter(c => c.id !== 'permanent_treadmill');

  // Date nav (last 7 days)
  const weekDates = Array.from({ length: 7 }, (_, i) => dateStr(i - 6));

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '400px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Dumbbell size={32} style={{ color: '#a855f7' }} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#fff' }}>Mobile Only</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            The Gym Tracker is optimized exclusively for mobile devices. Please open Zentrack on your phone to log your workouts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '0 0 7rem 0', minHeight: '100vh', boxSizing: 'border-box', overflowX: 'hidden', position: 'relative' }}>
      {/* Dynamic Background Layer */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12), transparent 70%)', opacity: 1 - (pct/100), transition: 'opacity 1s ease' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.18), transparent 70%)', opacity: pct/100, transition: 'opacity 1s ease' }} />

      {/* ── Header ── */}
      <div style={{ padding: '1.1rem 1rem 0.65rem', background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Dumbbell size={18} style={{ color: '#a855f7' }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gym Tracker</h1>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {saving ? (
                  <><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1s ease-in-out infinite' }} />Saving...</>
                ) : syncing ? (
                  <><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#a855f7', animation: 'pulse 1s ease-in-out infinite' }} />Syncing...</>
                ) : (
                  <><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />Auto-saved</>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: '0.5rem' }}>
            <button
              onClick={importPlan}
              title="Import routine for this day"
              style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '36px' }}
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => setEditMode(e => !e)}
              style={{ padding: '0.45rem 0.8rem', borderRadius: '8px', border: `1px solid ${editMode ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`, background: editMode ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)', color: editMode ? '#fbbf24' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '36px' }}
            >
              <Edit3 size={13} /> {editMode ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              title="Clear all exercises"
              style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '36px' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Date strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', paddingBottom: '0.15rem' }}>
          {weekDates.map(d => {
            const isSelected = d === selectedDate;
            const isToday = d === todayStr();
            const dayLabel = dayLabelFromDate(d);
            const dayNum = parseInt(d.split('-')[2]);
            const pIdx = planDayIndexForDate(d);
            const pDay = GYM_PLAN.find(p => p.dayIndex === pIdx);
            // Short muscle label: "Chest & Back A" → "Chest", "Shoulders & Arms A" → "Shldr", "Legs A..." → "Legs"
            const musclePart = pDay?.isRest
              ? ''
              : (() => {
                  const first = (pDay?.name || '').split(/[,&]/)[0].trim();
                  const abbrev: Record<string, string> = {
                    'Chest': 'Chest', 'Shoulders': 'Shldr', 'Legs A': 'Legs',
                    'Legs B': 'Legs', 'Rest Day': ''
                  };
                  return abbrev[first] ?? first.slice(0, 5);
                })();
            return (
              <button key={d} onClick={() => setSelectedDate(d)} style={{
                padding: '0.45rem 0', borderRadius: '10px', border: isSelected ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent', cursor: 'pointer',
                background: isSelected ? 'var(--accent-gradient)' : isToday ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                boxShadow: isSelected ? '0 4px 12px rgba(124,58,237,0.4)' : 'none',
                minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.15rem',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', minHeight: '58px',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
              }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1 }}>{dayLabel}</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: isSelected ? '#fff' : isToday ? '#a855f7' : 'rgba(255,255,255,0.7)', lineHeight: 1 }}>{dayNum}</span>
                {pDay?.isRest
                  ? <Bed size={10} style={{ color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', marginTop: '0.1rem' }} />
                  : <span style={{ fontSize: '0.5rem', color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)', fontWeight: 700, marginTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1 }}>{musclePart}</span>
                }
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Day Content ── Always renders immediately from plan, syncs from Firestore */}
      {planDay?.isRest ? (
        <div style={{ opacity: syncing ? 0.7 : 1, transition: 'opacity 0.2s ease' }}>
        <div style={{ margin: '1.5rem 1rem', padding: '2rem 1.5rem', borderRadius: '20px', background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(124,58,237,0.04))', border: '1px solid rgba(99,102,241,0.15)', textAlign: 'center' }}>
          <Bed size={40} style={{ color: '#818cf8', margin: '0 auto 0.75rem' }} />
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>Rest Day 🛌</h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: '280px', marginInline: 'auto' }}>
            {planDay.focus}
          </p>
        </div>
        </div>
      ) : (
        <div style={{ opacity: syncing ? 0.7 : 1, transition: 'opacity 0.2s ease', pointerEvents: syncing ? 'none' : 'auto' }}>
          {/* Day card */}
          <div className="liquid-panel" style={{ margin: '1rem 1rem 0', padding: '1rem 1.1rem', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a855f7', background: 'rgba(124,58,237,0.15)', padding: '0.15rem 0.5rem', borderRadius: '99px' }}>
                    {planDay?.name || `Day ${planDayIdx}`}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>{dayLabelFromDate(selectedDate) === dayLabelFromDate(todayStr()) ? 'Today' : dayLabelFromDate(selectedDate)}</span>
                </div>
                <h2 style={{ margin: '0.35rem 0 0.15rem', fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{planDay?.subtitle}</h2>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>{planDay?.focus}</div>
              </div>
              {/* Progress ring */}
              <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
                <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                  <motion.circle cx="28" cy="28" r="22" fill="none" stroke={pct === 100 ? '#1db954' : '#a855f7'} strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    animate={{ strokeDashoffset: 2 * Math.PI * 22 * (1 - pct / 100) }}
                    transition={{ type: 'spring', stiffness: 60, damping: 15 }}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.05rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</span>
                  <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, lineHeight: 1 }}>{doneExs}/{totalExs}</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.3rem' }}>
                <span>{doneExs}/{totalExs} exercises complete</span>
                <span>{doneSets}/{totalSets} sets done</span>
              </div>
              <div style={{ height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: '99px', transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>

          {/* Focus tip */}
          {planDay?.focus && (
            <div style={{ margin: '0.6rem 1rem 0', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: '10px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }}>
              <Flame size={13} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '0.1rem' }} />
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{planDay.focus}</span>
            </div>
          )}

          {/* ── Treadmill Cardio (always at top) ── */}
          {treadmillEntry && treadmillIdx !== -1 && (
            <div style={{ padding: '0.9rem 1rem 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                marginBottom: '0.55rem',
              }}>
                <div style={{ width: '3px', height: '16px', borderRadius: '99px', background: 'linear-gradient(180deg,#ef4444,#f97316)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>
                  Cardio
                </span>
              </div>
              <TreadmillCard
                cardio={treadmillEntry}
                onChange={updated => updateCardio(treadmillIdx, updated)}
              />
            </div>
          )}

          {/* ── Exercise list ── */}
          <div style={{ padding: '0.9rem 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.1rem' }}>
              <div style={{ width: '3px', height: '16px', borderRadius: '99px', background: 'linear-gradient(180deg,#7c3aed,#a855f7)' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>
                Exercises
              </span>
            </div>

            {log?.exercises.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem 1.5rem', background: 'rgba(124,58,237,0.05)', borderRadius: '16px', border: '1px dashed rgba(124,58,237,0.2)' }}>
                <Dumbbell size={28} style={{ color: '#a855f7', margin: '0 auto 0.75rem', opacity: 0.8 }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.35rem' }}>Start your workout</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1.25rem' }}>You haven't logged any exercises today.</div>
                <button
                  onClick={importPlan}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    margin: '0 auto',
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
                  }}
                >
                  <Download size={16} /> Import My Routine
                </button>
              </div>
            )}

            {log?.exercises.map((ex, idx) => (
              <ExerciseCard
                key={ex.exerciseId + idx}
                ex={ex}
                onChange={updated => updateExercise(idx, updated)}
                onDelete={() => deleteExercise(idx)}
                onEditClick={() => setEditingExerciseIdx(idx)}
                editMode={editMode}
              />
            ))}

            {/* Add exercise button */}
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.8rem', borderRadius: '12px',
                border: '1.5px dashed rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.04)',
                color: '#a855f7', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                transition: 'all 0.15s', marginTop: '0.1rem', minHeight: '50px',
              }}
            >
              <Plus size={16} /> Add Exercise
            </button>

            {/* Wipe all templates button (only in edit mode) */}
            {editMode && (
              <button
                onClick={() => setShowWipeTemplatesConfirm(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  padding: '0.9rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600, marginTop: '0.2rem', minHeight: '52px',
                }}
              >
                <Trash2 size={16} /> Wipe All Custom Templates
              </button>
            )}

            {/* ── Extra Cardio section ── */}
            {extraCardio.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.55rem' }}>
                  <div style={{ width: '3px', height: '16px', borderRadius: '99px', background: 'linear-gradient(180deg,#ef4444,#f97316)' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>
                    Extra Cardio
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {(log?.cardio || []).map((c, idx) => {
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
              </div>
            )}

            <button
              onClick={() => setShowAddCardioModal(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.8rem', borderRadius: '12px',
                border: '1.5px dashed rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)',
                color: '#ef4444', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
                transition: 'all 0.15s', marginTop: '0.1rem', minHeight: '50px',
              }}
            >
              <Plus size={16} /> Add Extra Cardio
            </button>
          </div>

          {/* Workout complete banner */}
          {pct === 100 && totalSets > 0 && (
            <div style={{ margin: '1rem 1rem 1.5rem', padding: '1.25rem', borderRadius: '16px', background: 'linear-gradient(135deg,rgba(29,185,84,0.15),rgba(16,185,129,0.08))', border: '1px solid rgba(29,185,84,0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏆</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1db954' }}>Workout Complete!</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.25rem' }}>All {totalSets} sets done. Great work! 💪</div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Exercise Modal */}
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
              const planEx = { id: ex.exerciseId, name: ex.name, targetSets: ex.targetSets, targetReps: ex.targetReps, muscle: ex.muscle };
              setDoc(doc(db, 'gymCustomPlans', `${userId}_day${planDayIdx}`), {
                customExercises: arrayUnion(planEx)
              }, { merge: true }).catch(err => {
                console.error(err);
                toast.error('Failed to save permanently');
              });
              toast.success('Exercise updated permanently!');
            } else {
              toast.success('Exercise updated for today!');
            }
          }}
          onClose={() => setEditingExerciseIdx(null)}
        />
      )}

      {/* Add Cardio Modal */}
      {showAddCardioModal && (
        <AddCardioModal
          onAdd={addCardio}
          onClose={() => setShowAddCardioModal(false)}
        />
      )}

      {/* Clear Day Confirm Modal */}
      {showClearConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '340px', border: '1px solid rgba(239,68,68,0.3)', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#ef4444' }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '1.1rem' }}>Clear Entire Day?</h3>
            <p style={{ margin: '0 0 1.5rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', lineHeight: 1.4 }}>This will wipe all exercises and reset all cardio data for today's log.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button onClick={() => setShowClearConfirm(false)} style={{ padding: '0.75rem', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}>Cancel</button>
              <button onClick={clearDay} style={{ padding: '0.75rem', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600 }}>Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Templates Confirm Modal */}
      {showWipeTemplatesConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '340px', border: '1px solid rgba(239,68,68,0.5)', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#f87171' }}>
              <Flame size={24} />
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '1.1rem' }}>Wipe ALL Custom Templates?</h3>
            <p style={{ margin: '0 0 1.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.4 }}>Are you absolutely sure you want to permanently delete ALL of your saved custom routines for the entire week? This cannot be undone.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button onClick={wipeAllTemplates} style={{ padding: '0.85rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 700 }}>Yes, Wipe Everything</button>
              <button onClick={() => setShowWipeTemplatesConfirm(false)} style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#fff', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zen Gym AI Floating Coach (single instance) ── */}
      <ZenGymAI userId={userId} todayLog={log} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity: 0.5; }
        input[type=number] { -moz-appearance: textfield; }
        * { -webkit-tap-highlight-color: transparent; }
        @media (max-width: 600px) {
          .gym-header { position: sticky; top: 0; }
        }
      `}</style>
    </div>
  );
};
