import { useState } from 'react';
import { X } from 'lucide-react';
import type { GymCardioLog } from '../../../types/gym.types';

const CARDIO_TYPES = ['Cycling', 'Stairmaster', 'Elliptical', 'Rowing', 'Outdoor Run', 'Jump Rope', 'Swimming', 'Other'];

export const AddCardioModal = ({ onAdd, onClose }: { onAdd: (c: GymCardioLog) => void; onClose: () => void }) => {
  const [type, setType] = useState('Cycling');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', padding: '1.25rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 16px))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Add Extra Cardio</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', marginBottom: '0.85rem', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: '8px', padding: '0.55rem 0.7rem' }}>
          🏃 Treadmill is always included. Add any extra cardio here.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
          {CARDIO_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} style={{ padding: '0.5rem 0.8rem', borderRadius: '10px', border: `1px solid ${type === t ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`, background: type === t ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', color: type === t ? '#f87171' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem', minHeight: '42px' }}>{t}</button>
          ))}
        </div>
        <button onClick={() => { onAdd({ id: `cardio_${Date.now()}`, type, durationMinutes: null, distanceKm: null, speedKmh: null, calories: null, completed: false }); onClose(); }}
          style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: 'none', background: 'var(--accent-gradient)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', minHeight: '50px' }}>
          Add Cardio Session
        </button>
      </div>
    </div>
  );
};
