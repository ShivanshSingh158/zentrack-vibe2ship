import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Trash2, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GymCardioLog } from '../../../types/gym.types';

interface CardioCardProps {
  cardio: GymCardioLog;
  onChange: (c: GymCardioLog) => void;
  onDelete: () => void;
  editMode: boolean;
}

export const CardioCard = ({ cardio, onChange, onDelete, editMode }: CardioCardProps) => {
  const [open, setOpen] = useState(false);
  const done = cardio.completed;

  return (
    <motion.div layout="position" style={{
      background: done ? 'rgba(29,185,84,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${done ? 'rgba(29,185,84,0.28)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '14px', overflow: 'hidden', transition: 'all 0.2s',
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
          {done ? <Check size={15} /> : <Flame size={14} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: done ? 'rgba(255,255,255,0.55)' : '#fff', textDecoration: done ? 'line-through' : 'none' }}>
            {cardio.type}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
            {cardio.durationMinutes != null && cardio.durationMinutes > 0 && <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)' }}>{cardio.durationMinutes} min</span>}
            {cardio.distanceKm != null && cardio.distanceKm > 0 && <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)' }}>{cardio.distanceKm} km</span>}
            {cardio.calories != null && cardio.calories > 0 && <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)' }}>{cardio.calories} kcal</span>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {editMode && (
            <button onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.3rem', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} />
            </button>
          )}
          <div style={{ color: 'rgba(255,255,255,0.25)' }}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.85rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem' }}>
            {[
              { label: 'Minutes', key: 'durationMinutes', val: cardio.durationMinutes },
              { label: 'Dist (km)', key: 'distanceKm', val: cardio.distanceKm },
              { label: 'Calories', key: 'calories', val: cardio.calories },
            ].map(f => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{f.label}</label>
                <input
                  type="number" value={f.val ?? ''}
                  onChange={e => onChange({ ...cardio, [f.key]: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.9rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <button onClick={() => onChange({ ...cardio, completed: !done })}
            style={{ padding: '0.6rem', borderRadius: '10px', border: 'none', background: done ? '#1db954' : 'rgba(255,255,255,0.1)', color: done ? '#000' : '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', minHeight: '44px' }}>
            <Check size={14} /> {done ? 'Completed' : 'Mark Complete'}
          </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
