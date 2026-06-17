import { useState } from 'react';
import { X } from 'lucide-react';
import { GYM_PLAN } from '../../../data/gymPlan';
import { MUSCLE_COLORS } from './ExerciseCard';
import { toast } from 'sonner';
import type { GymExerciseLog, GymPlanExercise } from '../../../types/gym.types';

interface AddExerciseModalProps {
  planDayIdx: number;
  initialExercise?: GymExerciseLog;
  onAdd: (ex: GymExerciseLog, savePermanently: boolean) => void;
  onClose: () => void;
}

function extractYouTubeId(url: string) {
  if (!url) return '';
  if (url.length === 11 && !url.includes('/')) return url;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : url; // fallback to raw string if parsing fails
}

export const AddExerciseModal = ({ planDayIdx, initialExercise, onAdd, onClose }: AddExerciseModalProps) => {
  const plan = GYM_PLAN.find(d => d.dayIndex === planDayIdx);
  const isEditMode = !!initialExercise;
  const [name, setName] = useState(initialExercise?.name || '');
  const [sets, setSets] = useState(initialExercise?.targetSets || 3);
  const [reps, setReps] = useState(initialExercise?.targetReps || '8–12');
  const [muscle, setMuscle] = useState(initialExercise?.muscle || '');
  const [videoId, setVideoId] = useState(initialExercise?.videoId || '');
  const [savePermanently, setSavePermanently] = useState(false);
  const [fromPlan, setFromPlan] = useState<GymPlanExercise | null>(null);

  const submit = () => {
    if (!name.trim()) { toast.error('Exercise name required'); return; }
    let ex: GymExerciseLog;
    if (isEditMode && initialExercise) {
      let newSetsLog = [...initialExercise.setsLog];
      if (sets > newSetsLog.length) {
        for (let i = newSetsLog.length; i < sets; i++) {
          newSetsLog.push({ setNumber: i + 1, reps: null, weight: null, completed: false });
        }
      } else if (sets < newSetsLog.length) {
        newSetsLog = newSetsLog.slice(0, sets);
      }
      ex = {
        ...initialExercise, name: name.trim(), targetSets: sets, targetReps: reps,
        muscle: muscle || undefined,
        videoId: videoId ? extractYouTubeId(videoId) : undefined,
        setsLog: newSetsLog,
      };
    } else {
      ex = {
        exerciseId: fromPlan?.id || `custom_${Date.now()}`,
        name: name.trim(), targetSets: sets, targetReps: reps,
        muscle: muscle || undefined, isCustom: !fromPlan,
        videoId: videoId ? extractYouTubeId(videoId) : undefined,
        setsLog: Array.from({ length: sets }, (_, i) => ({
          setNumber: i + 1, reps: null, weight: null, completed: false,
        })),
      };
    }
    onAdd(ex, savePermanently);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', padding: '1.25rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 16px))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{isEditMode ? 'Edit Exercise' : 'Add Exercise'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>

        {/* Quick-add from plan */}
        {!isEditMode && plan && plan.exercises.length > 0 && (
          <div style={{ marginBottom: '0.85rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
              From {plan.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '140px', overflowY: 'auto' }}>
              {plan.exercises.map(p => (
                <button key={p.id}
                  onClick={() => { setName(p.name); setSets(p.targetSets); setReps(p.targetReps); setMuscle(p.muscle || ''); setVideoId(p.videoId || ''); setFromPlan(p); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', borderRadius: '10px', border: `1px solid ${fromPlan?.id === p.id ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)'}`, background: fromPlan?.id === p.id ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left', minHeight: '42px' }}>
                  <span style={{ fontSize: '0.83rem', color: fromPlan?.id === p.id ? '#a855f7' : 'rgba(255,255,255,0.75)', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.28)' }}>{p.targetSets}×{p.targetReps}</span>
                </button>
              ))}
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.7rem 0' }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.25rem' }}>Exercise Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cable Flyes" style={inputStyle} />
          </div>
          {/* Sets + Reps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.25rem' }}>Sets</label>
              <input type="number" min={1} max={10} value={sets} onChange={e => setSets(Number(e.target.value))} style={{ ...inputStyle, textAlign: 'center' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.25rem' }}>Reps</label>
              <input value={reps} onChange={e => setReps(e.target.value)} placeholder="8–12" style={{ ...inputStyle, textAlign: 'center' }} />
            </div>
          </div>
          {/* Muscle */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.25rem' }}>Muscle Group</label>
            <select value={muscle} onChange={e => setMuscle(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              <option value="" style={{ color: '#000' }}>None</option>
              {Object.keys(MUSCLE_COLORS).sort().map(m => (
                <option key={m} value={m} style={{ color: '#000' }}>{m}</option>
              ))}
            </select>
          </div>
          {/* YouTube Video ID/Link */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.25rem' }}>YouTube Link (Optional)</label>
            <input value={videoId} onChange={e => setVideoId(e.target.value)} placeholder="e.g. https://youtu.be/..." style={inputStyle} />
          </div>
          {/* Save permanently */}
          {!isEditMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
              <input type="checkbox" id="savePerm" checked={savePermanently} onChange={e => setSavePermanently(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#1db954', cursor: 'pointer' }} />
              <label htmlFor="savePerm" style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', userSelect: 'none' }}>Save permanently to this day's split</label>
            </div>
          )}
          <button onClick={submit} style={{ padding: '0.85rem', borderRadius: '12px', border: 'none', background: 'var(--accent-gradient)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.1rem', minHeight: '50px' }}>
            {isEditMode ? 'Save Changes' : 'Add Exercise'}
          </button>
        </div>
      </div>
    </div>
  );
};
