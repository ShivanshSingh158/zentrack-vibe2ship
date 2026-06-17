import { useState } from 'react';
import { X, User } from 'lucide-react';
import type { GymProfile, GymGoal } from '../../../types/gym.types';

interface GymProfileModalProps {
  userId: string;
  initial: GymProfile | null;
  onSave: (p: GymProfile) => void;
  onClose: () => void;
}

const GOALS: { value: GymGoal; label: string; emoji: string }[] = [
  { value: 'hypertrophy', label: 'Build Muscle', emoji: '💪' },
  { value: 'strength', label: 'Strength', emoji: '🏋️' },
  { value: 'weightLoss', label: 'Fat Loss', emoji: '🔥' },
  { value: 'recomp', label: 'Recomp', emoji: '⚡' },
  { value: 'maintenance', label: 'Maintain', emoji: '🧘' },
];

const EXPERIENCE_OPTIONS = [
  { value: 2, label: '< 3 months' },
  { value: 4, label: '3–6 months' },
  { value: 9, label: '6–12 months' },
  { value: 18, label: '1–2 years' },
  { value: 36, label: '2–4 years' },
  { value: 60, label: '4+ years' },
];

export const GymProfileModal = ({ userId, initial, onSave, onClose }: GymProfileModalProps) => {
  const [bodyweight, setBodyweight] = useState(String(initial?.bodyweightKg ?? ''));
  const [height, setHeight] = useState(String(initial?.heightCm ?? ''));
  const [age, setAge] = useState(String(initial?.ageYears ?? ''));
  const [experience, setExperience] = useState(initial?.trainingExperienceMonths ?? 9);
  const [goal, setGoal] = useState<GymGoal>(initial?.primaryGoal ?? 'hypertrophy');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center',
  };

  const save = () => {
    onSave({
      userId, updatedAt: Date.now(),
      bodyweightKg: bodyweight ? Number(bodyweight) : null,
      heightCm: height ? Number(height) : null,
      ageYears: age ? Number(age) : null,
      trainingExperienceMonths: experience,
      primaryGoal: goal,
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 3000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', padding: '1.25rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 16px))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={15} style={{ color: '#a855f7' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Gym Profile</h3>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>Personalizes your AI coaching</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '1rem' }}>
          {/* Goal */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Primary Goal</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
              {GOALS.map(g => (
                <button key={g.value} onClick={() => setGoal(g.value)}
                  style={{ padding: '0.6rem 0.4rem', borderRadius: '10px', border: `1px solid ${goal === g.value ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`, background: goal === g.value ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)', color: goal === g.value ? '#a855f7' : 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, textAlign: 'center', minHeight: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem' }}>
            {[
              { label: 'Weight (kg)', val: bodyweight, set: setBodyweight, placeholder: '75' },
              { label: 'Height (cm)', val: height, set: setHeight, placeholder: '178' },
              { label: 'Age', val: age, set: setAge, placeholder: '24' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.3rem' }}>{f.label}</label>
                <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Training experience */}
          <div>
            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Training Experience</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
              {EXPERIENCE_OPTIONS.map(e => (
                <button key={e.value} onClick={() => setExperience(e.value)}
                  style={{ padding: '0.5rem 0.35rem', borderRadius: '10px', border: `1px solid ${experience === e.value ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`, background: experience === e.value ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)', color: experience === e.value ? '#a855f7' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, minHeight: '40px' }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={save} style={{ padding: '0.85rem', borderRadius: '12px', border: 'none', background: 'var(--accent-gradient)', color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', minHeight: '50px', marginTop: '0.25rem' }}>
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};
