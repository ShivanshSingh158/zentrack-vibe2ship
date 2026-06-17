import { useState, useCallback, memo } from 'react';
import { Check, ChevronDown, Timer, Zap, Wind } from 'lucide-react';
import type { GymCardioLog } from '../../../types/gym.types';

interface TreadmillCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.3rem', borderRadius: '10px',
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: '1rem', fontWeight: 700, textAlign: 'center',
  outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' as any,
};

export const TreadmillCard = memo(({ cardio, onChange }: TreadmillCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;
  const hasData = !!(cardio.durationMinutes || cardio.distanceKm);

  const handleToggle = useCallback(() => setOpen(o => !o), []);
  const handleMarkDone = useCallback(() => {
    onChange({ ...cardio, completed: !done });
    if (!done) setOpen(false); // auto-close on complete
  }, [onChange, cardio, done]);

  return (
    <div style={{
      borderRadius: '14px', overflow: 'hidden', position: 'relative',
      background: done ? 'rgba(29,185,84,0.12)' : 'rgba(25,25,30,0.45)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.35)' : 'rgba(255,255,255,0.08)'}`,
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
          {done ? <Check size={14} /> : <Wind size={14} />}
        </div>

        {/* Label + summary pills */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.88rem', fontWeight: 600,
            color: done ? 'rgba(255,255,255,0.5)' : '#fff',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            🏃 Treadmill
          </div>
          {hasData && (
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.18rem', flexWrap: 'wrap' }}>
              {!!cardio.durationMinutes && (
                <span style={{ fontSize: '0.64rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '0.05rem 0.32rem', borderRadius: '99px', fontWeight: 600 }}>
                  ⏱ {cardio.durationMinutes} min
                </span>
              )}
              {!!cardio.distanceKm && (
                <span style={{ fontSize: '0.64rem', color: '#fb923c', background: 'rgba(251,146,60,0.1)', padding: '0.05rem 0.32rem', borderRadius: '99px', fontWeight: 600 }}>
                  📍 {cardio.distanceKm} km
                </span>
              )}
            </div>
          )}
          {!hasData && (
            <div style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.28)', marginTop: '0.1rem' }}>
              Tap to log
            </div>
          )}
        </div>

        {/* Chevron — CSS rotation, no DOM swap */}
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
          <div style={{ padding: '0 0.85rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {/* Duration + Distance inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              {[
                { label: 'mins', icon: <Timer size={9} />, value: cardio.durationMinutes, key: 'durationMinutes', step: 1, max: 180 },
                { label: 'km', icon: <Zap size={9} />, value: cardio.distanceKm, key: 'distanceKm', step: 0.1, max: 50 },
              ].map(field => (
                <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{
                    fontSize: '0.56rem', color: 'rgba(255,255,255,0.35)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '0.2rem',
                  }}>
                    {field.icon} {field.label}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={field.step}
                    max={field.max}
                    value={field.value ?? ''}
                    onChange={e => onChange({ ...cardio, [field.key]: e.target.value ? Number(e.target.value) : null })}
                    placeholder="—"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            {/* Mark done button */}
            <button
              onClick={handleMarkDone}
              style={{
                padding: '0.65rem', borderRadius: '10px', border: 'none',
                background: done ? '#1db954' : 'rgba(255,255,255,0.1)',
                color: done ? '#000' : '#fff', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                cursor: 'pointer', minHeight: '44px', fontSize: '0.88rem',
                transition: 'background 200ms ease, color 200ms ease',
              }}
            >
              <Check size={14} /> {done ? 'Completed ✓' : 'Mark as Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

TreadmillCard.displayName = 'TreadmillCard';
