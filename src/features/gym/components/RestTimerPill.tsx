import { X, SkipForward, Maximize2, Minimize2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';

interface RestTimerPillProps {
  timeLeft: number;      // seconds remaining
  totalTime: number;     // total seconds
  exerciseName: string;
  isRunning: boolean;
  onSkip: () => void;
  onStop: () => void;
}

export const RestTimerPill = ({ timeLeft, totalTime, exerciseName, isRunning, onSkip, onStop }: RestTimerPillProps) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const dragControls = useDragControls();

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

  const pillVariants = {
    expanded: { 
      width: 'auto',
      minWidth: '220px',
      borderRadius: '999px',
      padding: '0.55rem 0.9rem 0.55rem 0.75rem',
      backgroundColor: 'rgba(12,10,20,0.96)',
      opacity: 1,
      y: 0,
      scale: 1,
      x: '-50%'
    },
    minimized: { 
      width: '54px', 
      minWidth: '54px',
      height: '54px',
      borderRadius: '50%',
      padding: '0px',
      backgroundColor: 'rgba(12,10,20,0.96)',
      opacity: 1,
      y: 0,
      scale: 1,
      x: '-50%'
    }
  };

  return createPortal(
    <motion.div
      drag
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0}
      initial={{ y: 20, opacity: 0, scale: 0.9, x: '-50%' }}
      style={{
        position: 'fixed',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        zIndex: 9850,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem',
        border: `1px solid ${color}55`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${color}22`,
        backdropFilter: 'blur(12px)',
        cursor: 'grab',
        touchAction: 'none'
      }}
      variants={pillVariants}
      animate={isMinimized ? 'minimized' : 'expanded'}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onPointerDown={(e) => dragControls.start(e)}
    >
      {isMinimized ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onDoubleClick={() => setIsMinimized(false)}>
          <svg width="50" height="50" style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
            <circle cx="25" cy="25" r="21" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="25" cy="25" r="21" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 21}`}
              strokeDashoffset={`${2 * Math.PI * 21 * (1 - progress)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color }}>
            {formatted}
          </div>
          {/* Invisible overlay for skip/maximize on single tap vs drag */}
          <div style={{ position: 'absolute', top: '-10px', right: '-10px' }}>
            <button onClick={() => setIsMinimized(false)} style={{ background: color, border: 'none', color: '#000', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              <Maximize2 size={10} />
            </button>
          </div>
        </div>
      ) : (
        <>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {/* Skip */}
            <button
              onClick={onSkip}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.6rem', borderRadius: '99px', border: `1px solid ${color}44`, background: `${color}18`, color, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}
              title="Skip rest"
            >
              <SkipForward size={12} /> Skip
            </button>

            {/* Minimize */}
            <button onClick={() => setIsMinimized(true)} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '50%', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.35rem', display: 'flex', alignItems: 'center' }}>
              <Minimize2 size={13} />
            </button>

            {/* Close */}
            <button onClick={onStop} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}>
              <X size={13} />
            </button>
          </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
};
