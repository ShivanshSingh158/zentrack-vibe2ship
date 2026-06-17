import { memo } from 'react';
import { Check, X } from 'lucide-react';
import type { GymSet } from '../../../types/gym.types';

interface SetRowProps {
  set: GymSet;
  previousSet?: GymSet | null;
  isNewPR?: boolean;
  onChange: (s: GymSet) => void;
  onDelete: () => void;
  onComplete?: () => void;
}

const SetRow = memo(({ set, previousSet, isNewPR, onChange, onDelete, onComplete }: SetRowProps) => {
  const handleComplete = () => {
    const next = !set.completed;
    onChange({ ...set, completed: next });
    if (next && onComplete) onComplete();
  };

  // Use text inputs with inputMode to prevent native number-spinner overlap on mobile
  const inputShared: React.CSSProperties = {
    width: '100%', minWidth: 0, padding: 0, background: 'transparent', border: 'none',
    color: '#fff', textAlign: 'center', fontSize: '1rem', fontWeight: 800,
    outline: 'none', WebkitAppearance: 'none', appearance: 'none',
  };
  const stepBtn: React.CSSProperties = {
    padding: '0', width: '36px', flexShrink: 0,
    background: 'rgba(255,255,255,0.04)', border: 'none',
    color: 'rgba(255,255,255,0.65)', cursor: 'pointer',
    fontWeight: 700, fontSize: '1.15rem', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', WebkitUserSelect: 'none',
    touchAction: 'manipulation',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '22px 1fr 1fr 38px',
      gap: '0.3rem', alignItems: 'center',
      padding: '0.4rem 0.4rem', borderRadius: '10px',
      background: set.completed
        ? (isNewPR ? 'rgba(251,191,36,0.12)' : 'rgba(29,185,84,0.08)')
        : 'rgba(255,255,255,0.03)',
      border: `1px solid ${set.completed
        ? (isNewPR ? 'rgba(251,191,36,0.4)' : 'rgba(29,185,84,0.25)')
        : 'rgba(255,255,255,0.07)'}`,
      transition: 'all 0.18s',
    }}>
      {/* Set number */}
      <div style={{
        fontSize: '0.65rem', color: isNewPR ? '#fbbf24' : 'rgba(255,255,255,0.3)',
        fontWeight: 700, textAlign: 'center', lineHeight: 1.3,
      }}>
        {set.setNumber}
        {isNewPR && <div style={{ fontSize: '0.4rem', color: '#fbbf24', fontWeight: 800, lineHeight: 1.2 }}>PR!</div>}
      </div>

      {/* Reps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem' }}>
        <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', fontWeight: 700, textAlign: 'center', letterSpacing: '0.08em' }}>REPS</span>
        <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.07)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.09)', overflow: 'hidden', height: '38px' }}>
          <button
            onClick={() => onChange({ ...set, reps: Math.max(0, (set.reps || 0) - 1) })}
            style={{ ...stepBtn, borderRight: '1px solid rgba(255,255,255,0.06)' }}
          >−</button>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            value={set.reps ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              onChange({ ...set, reps: v === '' ? null : Number(v) });
            }}
            placeholder="—"
            style={inputShared}
          />
          <button
            onClick={() => onChange({ ...set, reps: (set.reps || 0) + 1 })}
            style={{ ...stepBtn, borderLeft: '1px solid rgba(255,255,255,0.06)' }}
          >+</button>
        </div>
        {previousSet?.reps != null && (
          <span style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1 }}>
            prev: {previousSet.reps}
          </span>
        )}
      </div>

      {/* Weight */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem' }}>
        <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', fontWeight: 700, textAlign: 'center', letterSpacing: '0.08em' }}>KG</span>
        <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.07)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.09)', overflow: 'hidden', height: '38px' }}>
          <button
            onClick={() => onChange({ ...set, weight: Math.max(0, Number(((set.weight || 0) - 2.5).toFixed(1))) })}
            style={{ ...stepBtn, borderRight: '1px solid rgba(255,255,255,0.06)' }}
          >−</button>
          <input
            type="text" inputMode="decimal" pattern="[0-9.]*"
            value={set.weight ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              onChange({ ...set, weight: v === '' ? null : Number(v) });
            }}
            placeholder="—"
            style={inputShared}
          />
          <button
            onClick={() => onChange({ ...set, weight: Number(((set.weight || 0) + 2.5).toFixed(1)) })}
            style={{ ...stepBtn, borderLeft: '1px solid rgba(255,255,255,0.06)' }}
          >+</button>
        </div>
        {previousSet?.weight != null && (
          <span style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1 }}>
            prev: {previousSet.weight}kg
          </span>
        )}
      </div>

      {/* Done + Delete */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
        <button
          onClick={handleComplete}
          style={{
            width: '34px', height: '34px', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: set.completed ? (isNewPR ? '#fbbf24' : '#1db954') : 'rgba(255,255,255,0.08)',
            color: set.completed ? '#000' : 'rgba(255,255,255,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            boxShadow: set.completed ? `0 2px 10px ${isNewPR ? 'rgba(251,191,36,0.5)' : 'rgba(29,185,84,0.45)'}` : 'none',
          }}
          title="Mark done"
        >
          <Check size={15} strokeWidth={2.5} />
        </button>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', padding: 0, display: 'flex', alignItems: 'center' }}
          title="Remove set"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
});

SetRow.displayName = 'SetRow';
export default SetRow;
