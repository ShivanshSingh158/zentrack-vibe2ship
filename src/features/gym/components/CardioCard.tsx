import { useState, useCallback, memo } from 'react';
import { Check, ChevronDown, Trash2, Flame } from 'lucide-react';
import type { GymCardioLog } from '../../../types/gym.types';

interface CardioCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
  onDelete: () => void;
  editMode: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: '0.95rem', fontWeight: 700, textAlign: 'center',
  outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' as any,
};

export const CardioCard = memo(({ cardio, onChange, onDelete, editMode }: CardioCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;

  const handleToggle = useCallback(() => setOpen(o => !o), []);
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);
  const handleMarkDone = useCallback(() => {
    onChange({ ...cardio, completed: !done });
  }, [onChange, cardio, done]);

  const summaryParts = [
    cardio.durationMinutes ? `${cardio.durationMinutes} min` : null,
    cardio.distanceKm ? `${cardio.distanceKm} km` : null,
    cardio.calories ? `${cardio.calories} kcal` : null,
  ].filter(Boolean);

  return (
    <div style={{
      borderRadius: '14px', overflow: 'hidden',
      background: done ? 'rgba(29,185,84,0.08)' : 'rgba(25,25,30,0.45)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.28)' : 'rgba(255,255,255,0.07)'}`,
      transition: 'background 220ms ease, border-color 220ms ease',
    }}>
      {/* ── HEADER ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.55rem',
          padding: '0.65rem 0.85rem', cursor: 'pointer',
          minHeight: '52px', userSelect: 'none', WebkitUserSelect: 'none' as any,
        }}
        onClick={handleToggle}
      >
        {/* Status icon */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#1db954' : 'rgba(239,68,68,0.12)',
          border: `2px solid ${done ? '#1db954' : '#ef4444'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: done ? '#000' : '#ef4444',
          transition: 'background 200ms ease, border-color 200ms ease',
        }}>
          {done ? <Check size={14} /> : <Flame size={13} />}
        </div>

        {/* Name + summary */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.88rem', fontWeight: 600,
            color: done ? 'rgba(255,255,255,0.5)' : '#fff',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {cardio.type}
          </div>
          {summaryParts.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
              {summaryParts.map(s => (
                <span key={s} style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)' }}>{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
          {editMode && (
            <button
              onClick={handleDelete}
              style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', padding: '0.28rem', color: '#ef4444', cursor: 'pointer',
                display: 'flex', alignItems: 'center', transition: 'background 150ms ease',
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Chevron — rotates via CSS */}
        <div style={{
          color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 240ms cubic-bezier(0.4,0,0.2,1)',
          willChange: 'transform',
        }}>
          <ChevronDown size={15} />
        </div>
      </div>

      {/* ── ACCORDION BODY ── */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 240ms cubic-bezier(0.4,0,0.2,1)',
        willChange: 'grid-template-rows',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '0 0.85rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Stat inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem' }}>
              {[
                { label: 'Minutes', key: 'durationMinutes', val: cardio.durationMinutes },
                { label: 'Dist (km)', key: 'distanceKm', val: cardio.distanceKm },
                { label: 'Calories', key: 'calories', val: cardio.calories },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    {f.label}
                  </label>
                  <input
                    type="number"
                    value={f.val ?? ''}
                    onChange={e => onChange({ ...cardio, [f.key]: e.target.value ? Number(e.target.value) : null })}
                    placeholder="—"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            {/* Mark complete button */}
            <button
              onClick={handleMarkDone}
              style={{
                padding: '0.6rem', borderRadius: '10px', border: 'none',
                background: done ? '#1db954' : 'rgba(255,255,255,0.1)',
                color: done ? '#000' : '#fff', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                cursor: 'pointer', minHeight: '44px', fontSize: '0.85rem',
                transition: 'background 200ms ease, color 200ms ease',
              }}
            >
              <Check size={14} /> {done ? 'Completed ✓' : 'Mark Complete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

CardioCard.displayName = 'CardioCard';
