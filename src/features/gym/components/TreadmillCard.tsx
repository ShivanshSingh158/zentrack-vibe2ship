import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Timer, Zap, Wind } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GymCardioLog } from '../../../types/gym.types';

interface TreadmillCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
}

export const TreadmillCard = ({ cardio, onChange }: TreadmillCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;
  const hasData = cardio.durationMinutes || cardio.distanceKm;

  return (
    <motion.div layout="position" className="liquid-panel" style={{
      background: done ? 'rgba(29,185,84,0.12)' : 'rgba(25,25,30,0.45)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.35)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '14px', overflow: 'hidden', transition: 'all 0.2s', padding: 0,
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.55rem',
          padding: '0.75rem 0.85rem', cursor: 'pointer',
          background: done ? 'rgba(29,185,84,0.05)' : 'transparent', minHeight: '56px',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{
          width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#1db954' : 'rgba(239,68,68,0.12)',
          border: `2px solid ${done ? '#1db954' : '#ef4444'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: done ? '#000' : '#ef4444', transition: 'all 0.2s',
        }}>
          {done ? <Check size={15} /> : <Wind size={15} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: done ? 'rgba(255,255,255,0.55)' : '#fff', textDecoration: done ? 'line-through' : 'none' }}>
            🏃 Treadmill
          </div>
          {!open && hasData ? (
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
              {!!cardio.durationMinutes && <span style={{ fontSize: '0.65rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '0.08rem 0.35rem', borderRadius: '99px', fontWeight: 600 }}>⏱ {cardio.durationMinutes} min</span>}
              {!!cardio.distanceKm && <span style={{ fontSize: '0.65rem', color: '#fb923c', background: 'rgba(251,146,60,0.1)', padding: '0.08rem 0.35rem', borderRadius: '99px', fontWeight: 600 }}>📍 {cardio.distanceKm} km</span>}
            </div>
          ) : !open ? (
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.28)', marginTop: '0.1rem' }}>Tap to log</div>
          ) : null}
        </div>

        <div style={{ color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 0.85rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                {[
                  { label: 'mins', icon: <Timer size={9} />, value: cardio.durationMinutes, key: 'durationMinutes', step: 1, max: 180 },
                  { label: 'km', icon: <Zap size={9} />, value: cardio.distanceKm, key: 'distanceKm', step: 0.1, max: 50 },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      {field.icon} {field.label}
                    </label>
                    <input
                      type="number" inputMode="decimal" min={0} step={field.step} max={field.max}
                      value={field.value ?? ''}
                      onChange={e => onChange({ ...cardio, [field.key]: e.target.value ? Number(e.target.value) : null })}
                      placeholder="—"
                      style={{ width: '100%', padding: '0.6rem 0.3rem', borderRadius: '10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => { onChange({ ...cardio, completed: !done }); if (!done) setOpen(false); }}
                style={{
                  padding: '0.65rem', borderRadius: '10px', border: 'none',
                  background: done ? '#1db954' : 'rgba(255,255,255,0.1)',
                  color: done ? '#000' : '#fff', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  cursor: 'pointer', minHeight: '44px', fontSize: '0.88rem', transition: 'all 0.15s',
                }}
              >
                <Check size={14} /> {done ? 'Completed ✓' : 'Mark as Done'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
