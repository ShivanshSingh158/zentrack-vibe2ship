import { X, SkipForward } from 'lucide-react';
import { createPortal } from 'react-dom';

interface RestTimerPillProps {
  timeLeft: number;      // seconds remaining
  totalTime: number;     // total seconds
  exerciseName: string;
  isRunning: boolean;
  onSkip: () => void;
  onStop: () => void;
}

export const RestTimerPill = ({ timeLeft, totalTime, exerciseName, isRunning, onSkip, onStop }: RestTimerPillProps) => {
  if (!isRunning || timeLeft <= 0) return null;

  const progress = totalTime > 0 ? (totalTime - timeLeft) / totalTime : 0;
  const pct = Math.round(progress * 100);
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  const formatted = `${m}:${String(s).padStart(2, '0')}`;

  // Color shifts from green → amber → red as time ticks down
  const color = timeLeft > totalTime * 0.6 ? '#1db954'
    : timeLeft > totalTime * 0.3 ? '#f59e0b'
    : '#ef4444';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 9850,
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        padding: '0.55rem 0.9rem 0.55rem 0.75rem',
        borderRadius: '999px',
        background: 'rgba(12,10,20,0.96)',
        border: `1px solid ${color}55`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${color}22`,
        backdropFilter: 'blur(12px)',
        animation: 'restPillIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        minWidth: '220px',
      }}
    >
      {/* Circular progress */}
      <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0 }}>
        <svg width="38" height="38" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle
            cx="19" cy="19" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${2 * Math.PI * 15 * (1 - progress)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color }}>
          {pct}%
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {formatted}
        </div>
        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.38)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Rest · {exerciseName}
        </div>
      </div>

      {/* Skip */}
      <button
        onClick={onSkip}
        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.6rem', borderRadius: '99px', border: `1px solid ${color}44`, background: `${color}18`, color, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}
        title="Skip rest"
      >
        <SkipForward size={12} /> Skip
      </button>

      {/* Close */}
      <button onClick={onStop} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}>
        <X size={13} />
      </button>

      <style>{`
        @keyframes restPillIn {
          from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  );
};
