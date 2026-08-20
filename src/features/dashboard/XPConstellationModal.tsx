import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Lock, CheckCircle2, Sparkles, Trophy, Award, Flame, Dumbbell, BookOpen, Target } from 'lucide-react';

const LEVEL_THRESHOLDS = [
  0, 500, 1200, 2500, 4200, 6500, 9500, 13500, 
  18000, 23000, 29000, 36000, 44000, 53000, 
  63500, 75500, 89000, 104000, 121000, 140000
];

const LEVEL_TITLES = [
  'Seeker', 'Warden', 'Sentinel', 'Guardian', 'Vanguard',
  'Luminary', 'Legend', 'Mythic', 'Paragon', 'Titan',
  'Ascendant', 'Exalted', 'Sovereign', 'Archon', 'Celestial',
  'Ethereal', 'Empyrean', 'Astral', 'Zenith', 'Apex'
];

const LEVEL_COLORS: [string, string][] = [
  ['#34d399', '#22d3ee'], // 0 Seeker
  ['#22d3ee', '#3b82f6'], // 1 Warden
  ['#14b8a6', '#0ea5e9'], // 2 Sentinel
  ['#3b82f6', '#6366f1'], // 3 Guardian
  ['#a855f7', '#ec4899'], // 4 Vanguard
  ['#f59e0b', '#fbbf24'], // 5 Luminary
  ['#f97316', '#ef4444'], // 6 Legend
  ['#ec4899', '#8b5cf6'], // 7 Mythic
  ['#94a3b8', '#f8fafc'], // 8 Paragon
  ['#dc2626', '#7f1d1d'], // 9 Titan
  ['#6ee7b7', '#059669'], // 10 Ascendant
  ['#ca8a04', '#fef08a'], // 11 Exalted
  ['#7e22ce', '#d946ef'], // 12 Sovereign
  ['#2563eb', '#22d3ee'], // 13 Archon
  ['#1e3a8a', '#e0f2fe'], // 14 Celestial
  ['#a78bfa', '#fdf4ff'], // 15 Ethereal
  ['#f43f5e', '#fdba74'], // 16 Empyrean
  ['#0f766e', '#5eead4'], // 17 Astral
  ['#334155', '#e2e8f0'], // 18 Zenith
  ['#eab308', '#ffffff'], // 19 Apex
];

const LORE = [
  "The journey begins. Eyes wide open, stepping into the unknown.",
  "A steadfast protector of discipline, forging iron habits.",
  "A vigilant watcher of progress. Every rep, every day matters.",
  "An unwavering shield against complacency. The foundation is set.",
  "The tip of the spear. Leading the charge into uncharted strength.",
  "A shining beacon of dedication. Your aura inspires all.",
  "Carving your name into eternity. A living myth walking among mortals.",
  "Beyond human limits. A cosmic force of unstoppable momentum.",
  "A flawless model of excellence. The standard all others strive to meet.",
  "Unstoppable force meets immovable object. Raw, earth-shattering power.",
  "Rising above mortal limitations. A being of pure, untethered potential.",
  "Revered and glorious. Walking in the warm light of true achievement.",
  "Absolute authority over your own destiny. The king of your domain.",
  "A commander of raw energy. Precision and power perfectly balanced.",
  "Observing from the stars. Your vision spans galaxies and ages.",
  "Drifting through the material world untouched. Pure spiritual focus.",
  "Burning with the fierce, blinding heat of a supreme solar flare.",
  "Navigating multidimensional spaces. Boundless depth and ancient wisdom.",
  "The absolute peak of physical and mental perfection. Silent, sharp, absolute.",
  "The pinnacle of existence. Radiating pure, brilliant light above all else."
];

const MASCOT_FILES: Record<string, string> = {
  'Seeker': '/mascots/level0.png',
  'Warden': '/mascots/level1.png',
  'Sentinel': '/mascots/level3.png',
  'Guardian': '/mascots/level2.png',
  'Vanguard': '/mascots/level4.png',
  'Luminary': '/mascots/level5.png',
  'Legend': '/mascots/level6.png',
  'Mythic': '/mascots/level7.png',
  'Paragon': '/mascots/level8.png',
  'Titan': '/mascots/level9.png',
  'Ascendant': '/mascots/level10.png',
  'Exalted': '/mascots/level11.png',
  'Sovereign': '/mascots/level12.png',
  'Archon': '/mascots/level13.png',
  'Celestial': '/mascots/level14.png',
  'Ethereal': '/mascots/level15.png',
  'Empyrean': '/mascots/level16.png',
  'Astral': '/mascots/level17.png',
  'Zenith': '/mascots/level18.png',
  'Apex': '/mascots/level19.png',
};

interface XPConstellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentXP: number;
}

export const XPConstellationModal: React.FC<XPConstellationModalProps> = ({
  isOpen,
  onClose,
  currentXP,
}) => {
  const [selectedTierIndex, setSelectedTierIndex] = useState<number | null>(null);

  // Compute current user level index
  const currentTierIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (currentXP >= LEVEL_THRESHOLDS[i]) {
        idx = i;
      }
    }
    return idx;
  }, [currentXP]);

  const activeIndex = selectedTierIndex ?? currentTierIndex;
  const activeTitle = LEVEL_TITLES[activeIndex];
  const activeXP = LEVEL_THRESHOLDS[activeIndex];
  const activeGradient = LEVEL_COLORS[activeIndex];
  const activeMascot = MASCOT_FILES[activeTitle] || '/mascots/level0.png';
  const activeLore = LORE[activeIndex];

  const currentLevelTitle = LEVEL_TITLES[currentTierIndex];
  const nextTierIndex = Math.min(currentTierIndex + 1, LEVEL_THRESHOLDS.length - 1);
  const nextTierTitle = LEVEL_TITLES[nextTierIndex];
  const nextTierXP = LEVEL_THRESHOLDS[nextTierIndex];
  const currentThreshold = LEVEL_THRESHOLDS[currentTierIndex];
  const progressToNext = nextTierXP > currentThreshold
    ? Math.min(1, Math.max(0, (currentXP - currentThreshold) / (nextTierXP - currentThreshold)))
    : 1;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          padding: '1.5rem',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: '100%',
            maxWidth: '1100px',
            maxHeight: '90vh',
            background: 'linear-gradient(180deg, #121215 0%, #0c0c0e 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Ambient Background Glow matching active tier */}
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              left: '20%',
              width: '600px',
              height: '350px',
              background: `radial-gradient(circle, ${activeGradient[0]}25 0%, transparent 70%)`,
              pointerEvents: 'none',
              filter: 'blur(40px)',
              transition: 'background 0.5s ease',
            }}
          />

          {/* Modal Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
              flexShrink: 0,
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(165, 153, 255, 0.15)',
                  border: '1px solid rgba(165, 153, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a599ff',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  XP Constellation &amp; Mastery Tiers
                </h2>
                <span style={{ fontSize: '0.76rem', color: '#8e8e93' }}>
                  20 Cosmic Progression Tiers · Synced with ZenTrack Mobile
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#a599ff',
                  fontFeatureSettings: '"tnum"',
                }}
              >
                ⚡ {currentXP} Total XP
              </div>

              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  color: '#8e8e93',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div
            style={{
              padding: '1.5rem 1.75rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              zIndex: 1,
            }}
          >
            {/* ── TOP HERO INSPECTOR: ACTIVE / SELECTED TIER ── */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '18px',
                padding: '1.25rem 1.5rem',
                display: 'grid',
                gridTemplateColumns: '130px 1fr auto',
                gap: '1.5rem',
                alignItems: 'center',
              }}
            >
              {/* Floating Hero Mascot */}
              <div
                style={{
                  width: '130px',
                  height: '130px',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Radiant Aura */}
                <img
                  src={activeMascot}
                  alt=""
                  style={{
                    position: 'absolute',
                    width: '120px',
                    height: '120px',
                    filter: `blur(18px) drop-shadow(0 0 20px ${activeGradient[0]})`,
                    opacity: 0.9,
                    pointerEvents: 'none',
                  }}
                />
                {/* Real Character */}
                <img
                  src={activeMascot}
                  alt={activeTitle}
                  style={{
                    position: 'absolute',
                    width: '120px',
                    height: '120px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.8))',
                    animation: 'floatBob 3.5s ease-in-out infinite',
                  }}
                />
              </div>

              {/* Tier Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '0.18rem 0.55rem',
                      borderRadius: '6px',
                      background: `${activeGradient[0]}25`,
                      color: activeGradient[0],
                      border: `1px solid ${activeGradient[0]}45`,
                    }}
                  >
                    Tier {activeIndex + 1}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                    {activeTitle}
                  </h3>
                  {activeIndex === currentTierIndex && (
                    <span style={{ fontSize: '0.72rem', color: '#5eda9e', fontWeight: 700 }}>
                      ● CURRENT TIER
                    </span>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: '0.84rem', color: '#8e8e93', lineHeight: 1.45 }}>
                  "{activeLore}"
                </p>

                {/* Progress bar to next */}
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#8e8e93' }}>
                    <span>Threshold: {activeXP} XP</span>
                    {activeIndex === currentTierIndex && (
                      <span>{nextTierXP - currentXP} XP to {nextTierTitle}</span>
                    )}
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${activeIndex < currentTierIndex ? 100 : activeIndex === currentTierIndex ? progressToNext * 100 : 0}%`,
                        background: `linear-gradient(90deg, ${activeGradient[0]}, ${activeGradient[1]})`,
                        borderRadius: '999px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Status Badge on Right */}
              <div style={{ textAlign: 'right' }}>
                {activeIndex <= currentTierIndex ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#5eda9e', fontSize: '0.8rem', fontWeight: 700 }}>
                    <CheckCircle2 size={16} />
                    <span>UNLOCKED</span>
                  </div>
                ) : (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#8e8e93', fontSize: '0.8rem', fontWeight: 600 }}>
                    <Lock size={15} />
                    <span>LOCKED</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── 20-TIER CONSTELLATION NODE GRID ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff' }}>All 20 Mastery Tiers</span>
                <span style={{ fontSize: '0.72rem', color: '#8e8e93' }}>Click any tier to inspect</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {LEVEL_TITLES.map((title, i) => {
                  const threshold = LEVEL_THRESHOLDS[i];
                  const grad = LEVEL_COLORS[i];
                  const mascot = MASCOT_FILES[title] || '/mascots/level0.png';
                  const isCurrent = i === currentTierIndex;
                  const isUnlocked = i <= currentTierIndex;
                  const isSelected = i === activeIndex;

                  return (
                    <div
                      key={title}
                      onClick={() => setSelectedTierIndex(i)}
                      style={{
                        background: isSelected
                          ? `${grad[0]}18`
                          : isCurrent
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected
                          ? `1.5px solid ${grad[0]}`
                          : isCurrent
                          ? `1px solid ${grad[0]}60`
                          : '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '14px',
                        padding: '0.75rem 0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        position: 'relative',
                        opacity: isUnlocked ? 1 : 0.45,
                        boxShadow: isCurrent ? `0 0 16px ${grad[0]}30` : 'none',
                      }}
                    >
                      {/* Level Mascot Mini */}
                      <div style={{ width: '48px', height: '48px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isCurrent && (
                          <img
                            src={mascot}
                            alt=""
                            style={{
                              position: 'absolute',
                              width: '44px',
                              height: '44px',
                              filter: `blur(8px) drop-shadow(0 0 10px ${grad[0]})`,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        <img
                          src={mascot}
                          alt={title}
                          style={{
                            width: '44px',
                            height: '44px',
                            objectFit: 'contain',
                            filter: !isUnlocked ? 'grayscale(100%)' : 'none',
                          }}
                        />
                      </div>

                      {/* Title & XP */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: isUnlocked ? '#ffffff' : '#8e8e93' }}>
                          {title}
                        </div>
                        <div style={{ fontSize: '0.64rem', color: isCurrent ? grad[0] : '#8e8e93', fontWeight: 600 }}>
                          {threshold} XP
                        </div>
                      </div>

                      {/* Small Indicator */}
                      {isCurrent && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '6px',
                            fontSize: '0.55rem',
                            fontWeight: 800,
                            color: grad[0],
                          }}
                        >
                          ● YOU
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── XP REWARDS EARNING CHEATSHEET ── */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                <CheckCircle2 size={15} color="#a599ff" />
                <span style={{ color: '#d1d1d6' }}>Task Completed: <strong style={{ color: '#ffffff' }}>+50–100 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                <Flame size={15} color="#f59e0b" />
                <span style={{ color: '#d1d1d6' }}>Habit Logged: <strong style={{ color: '#ffffff' }}>+50 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                <Dumbbell size={15} color="#38bdf8" />
                <span style={{ color: '#d1d1d6' }}>Gym Workout: <strong style={{ color: '#ffffff' }}>+100–150 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                <Trophy size={15} color="#5eda9e" />
                <span style={{ color: '#d1d1d6' }}>Perfect Day: <strong style={{ color: '#ffffff' }}>+1,000 XP</strong></span>
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
