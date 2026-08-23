import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Lock, CheckCircle2, Sparkles, Trophy, Award, Flame, Dumbbell, BookOpen, Target, ChevronLeft, ChevronRight } from 'lucide-react';

import { LEVEL_THRESHOLDS, LEVEL_TITLES } from '../../services/xpSystem';

const LEVEL_COLORS: [string, string][] = [
  ['#34d399', '#10b981'], // 0 Seeker (Emerald Nature)
  ['#06b6d4', '#0284c7'], // 1 Warden (Cyan Hydro Aegis)
  ['#14b8a6', '#0d9488'], // 2 Sentinel (Deep Teal Vanguard)
  ['#3b82f6', '#1d4ed8'], // 3 Guardian (Cobalt Steel Protector)
  ['#a855f7', '#7c3aed'], // 4 Vanguard (Royal Violet Knight)
  ['#f59e0b', '#d97706'], // 5 Luminary (Solar Gold Sage)
  ['#ea580c', '#c2410c'], // 6 Legend (Blazing Magma Flame)
  ['#ec4899', '#db2777'], // 7 Mythic (Mythic Rose Plasma)
  ['#64748b', '#94a3b8'], // 8 Paragon (Silver Metallic Titan)
  ['#dc2626', '#991b1b'], // 9 Titan (Blood Crimson Behemoth)
  ['#10b981', '#047857'], // 10 Ascendant (Jade Transcendent)
  ['#eab308', '#ca8a04'], // 11 Exalted (Radiant Solar Dawn)
  ['#9333ea', '#6b21a8'], // 12 Sovereign (Imperial Purple Monarch)
  ['#2563eb', '#06b6d4'], // 13 Archon (Electric Plasma Archon)
  ['#1e40af', '#60a5fa'], // 14 Celestial (Cosmic Starfield Deep Blue)
  ['#818cf8', '#c084fc'], // 15 Ethereal (Ethereal Lavender Horizon)
  ['#f43f5e', '#fb923c'], // 16 Empyrean (Supernova Coral Flare)
  ['#0d9488', '#2dd4bf'], // 17 Astral (Astral Aurora Borealis)
  ['#475569', '#e2e8f0'], // 18 Zenith (Dark Obsidian Platinum)
  ['#ffd700', '#ff7bf0'], // 19 Apex (Supreme Singularity Rainbow Gold)
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

const TIER_ARCHETYPES = [
  { realm: 'Initiate Realm', element: 'Wind & Discovery', perk: '+5% XP on Daily Quests', title: 'The Seeker of Wisdom' },
  { realm: 'Initiate Realm', element: 'Iron & Discipline', perk: 'Habit Habituation Buffer', title: 'The Iron Warden' },
  { realm: 'Initiate Realm', element: 'Cyan Light', perk: 'Pomodoro Focus +10 XP', title: 'The Vigilant Sentinel' },
  { realm: 'Initiate Realm', element: 'Aegis Shield', perk: 'Zero-Miss Streak Protection', title: 'The Resilient Guardian' },
  { realm: 'Initiate Realm', element: 'Neon Lightning', perk: 'Multi-Task Velocity Bonus', title: 'The Spearhead Vanguard' },
  { realm: 'Luminary Realm', element: 'Solar Flare', perk: '+15% Streak Multiplier & Aura', title: 'The Radiant Luminary' },
  { realm: 'Luminary Realm', element: 'Blazing Fire', perk: '2x XP on Perfect Days', title: 'The Immortal Legend' },
  { realm: 'Luminary Realm', element: 'Astral Violet', perk: 'Constellation HUD Glow Theme', title: 'The Cosmic Mythic' },
  { realm: 'Luminary Realm', element: 'Glacial Platinum', perk: 'Mastery Aura Halo Unlocked', title: 'The Flawless Paragon' },
  { realm: 'Luminary Realm', element: 'Volcanic Core', perk: 'High-Impact Focus Surge', title: 'The Earth-Shaker Titan' },
  { realm: 'Sovereign Realm', element: 'Emerald Ether', perk: 'Instant Recall Accelerator', title: 'The High Ascendant' },
  { realm: 'Sovereign Realm', element: 'Golden Dawn', perk: 'Prestige Streak Emblem', title: 'The Exalted Sovereign' },
  { realm: 'Sovereign Realm', element: 'Imperial Velvet', perk: 'Domain Authority Multiplier', title: 'The True Sovereign' },
  { realm: 'Sovereign Realm', element: 'Arcane Plasma', perk: 'Synapse Speed Overdrive', title: 'The Star Archon' },
  { realm: 'Sovereign Realm', element: 'Deep Cosmos', perk: 'Galactic Horizon Badge', title: 'The Celestial Sentinel' },
  { realm: 'Cosmic Apex', element: 'Pure Spirit', perk: 'Flow-State Transmutation', title: 'The Ethereal Soul' },
  { realm: 'Cosmic Apex', element: 'Supernova', perk: 'Cosmic Flare HUD Glow', title: 'The Empyrean Flare' },
  { realm: 'Cosmic Apex', element: 'Abyssal Void', perk: 'Omnipresent Habit Sync', title: 'The Astral Wanderer' },
  { realm: 'Cosmic Apex', element: 'Obsidian Zenith', perk: 'Zenith Mastery Halo', title: 'The Absolute Zenith' },
  { realm: 'Cosmic Apex', element: 'Supreme Singularity', perk: 'Eternal Zen Omniscience', title: 'The Apex Divinity' },
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
  initialSpotlight?: boolean;
}

export const XPConstellationModal: React.FC<XPConstellationModalProps> = ({
  isOpen,
  onClose,
  currentXP,
  initialSpotlight = true,
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

  const [viewMode, setViewMode] = useState<'path' | 'grid'>('path');
  const [isAscendedSpotlightOpen, setIsAscendedSpotlightOpen] = useState(true);
  const [navDirection, setNavDirection] = useState<'next' | 'prev'>('next');

  // Determine bespoke animation archetype for each mascot realm
  const getArchetypeAnimation = (index: number, dir: 'next' | 'prev') => {
    // T16 - T20: Apex / Celestial Gods (Hyper-Singularity Implosion & Warp)
    if (index >= 15) {
      return {
        initial: {
          scale: dir === 'next' ? 1.9 : 0.2,
          opacity: 0,
          rotate: dir === 'next' ? -10 : 10,
          filter: 'blur(32px) brightness(280%)',
          y: dir === 'next' ? 40 : -40,
        },
        animate: {
          scale: 1,
          opacity: 1,
          rotate: 0,
          filter: 'blur(0px) brightness(100%)',
          y: 0,
          transition: { type: 'spring', stiffness: 220, damping: 18, mass: 0.8 },
        },
        exit: {
          scale: dir === 'next' ? 0.2 : 1.9,
          opacity: 0,
          rotate: dir === 'next' ? 10 : -10,
          filter: 'blur(28px) brightness(300%)',
          y: dir === 'next' ? -40 : 40,
          transition: { duration: 0.22, ease: 'easeIn' },
        },
      };
    }
    // T11 - T15: Sovereign Realm (Sacred Mandala Dimensional Spin)
    if (index >= 10) {
      return {
        initial: {
          scale: 0.25,
          opacity: 0,
          rotate: dir === 'next' ? -140 : 140,
          filter: 'blur(22px) drop-shadow(0 0 50px #ffd700)',
          x: dir === 'next' ? 120 : -120,
        },
        animate: {
          scale: 1,
          opacity: 1,
          rotate: 0,
          filter: 'blur(0px) drop-shadow(0 20px 50px rgba(0,0,0,0.95))',
          x: 0,
          transition: { type: 'spring', stiffness: 260, damping: 20 },
        },
        exit: {
          scale: 1.6,
          opacity: 0,
          rotate: dir === 'next' ? 140 : -140,
          filter: 'blur(25px)',
          x: dir === 'next' ? -120 : 120,
          transition: { duration: 0.22, ease: 'easeIn' },
        },
      };
    }
    // T6 - T10: Luminary Realm (Solar Supernova Shockwave)
    if (index >= 5) {
      return {
        initial: {
          scale: 1.6,
          opacity: 0,
          y: dir === 'next' ? 70 : -70,
          filter: 'blur(26px) brightness(220%)',
        },
        animate: {
          scale: 1,
          opacity: 1,
          y: 0,
          filter: 'blur(0px) brightness(100%)',
          transition: { type: 'spring', stiffness: 280, damping: 22 },
        },
        exit: {
          scale: 0.35,
          opacity: 0,
          y: dir === 'next' ? -70 : 70,
          filter: 'blur(18px) brightness(40%)',
          transition: { duration: 0.22, ease: 'easeIn' },
        },
      };
    }
    // T1 - T5: Initiate Realm (Arcane Crystal Warp)
    return {
      initial: {
        scale: 0.55,
        opacity: 0,
        x: dir === 'next' ? 140 : -140,
        rotate: dir === 'next' ? 18 : -18,
        filter: 'blur(18px) contrast(150%)',
      },
      animate: {
        scale: 1,
        opacity: 1,
        x: 0,
        rotate: 0,
        filter: 'blur(0px) contrast(100%)',
        transition: { type: 'spring', stiffness: 300, damping: 24 },
      },
      exit: {
        scale: 0.55,
        opacity: 0,
        x: dir === 'next' ? -140 : 140,
        rotate: dir === 'next' ? -18 : 18,
        filter: 'blur(18px)',
        transition: { duration: 0.2, ease: 'easeIn' },
      },
    };
  };

  // Automatically open into spotlight mode whenever modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setIsAscendedSpotlightOpen(initialSpotlight !== undefined ? initialSpotlight : true);
      setSelectedTierIndex(null);
    }
  }, [isOpen, initialSpotlight]);

  // Keyboard navigation for spotlight mode with boundary clamping
  React.useEffect(() => {
    if (!isOpen || !isAscendedSpotlightOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (activeIndex > 0) {
          setNavDirection('prev');
          setSelectedTierIndex(activeIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (activeIndex < LEVEL_TITLES.length - 1) {
          setNavDirection('next');
          setSelectedTierIndex(activeIndex + 1);
        }
      } else if (e.key === 'Escape') {
        setIsAscendedSpotlightOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAscendedSpotlightOpen, activeIndex]);

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
          padding: '1rem',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: '92vw',
            maxWidth: '1240px',
            height: '90vh',
            maxHeight: '920px',
            background: '#101012',
            border: '1px solid #1c1c20',
            borderRadius: '24px',
            boxShadow: '0 28px 80px rgba(0, 0, 0, 0.95), 0 0 60px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Ambient Dynamic Galaxy Nebula Glow */}
          <div
            style={{
              position: 'absolute',
              top: '-15%',
              left: '20%',
              width: '700px',
              height: '380px',
              background: `radial-gradient(circle, ${activeGradient[0]}22 0%, ${activeGradient[1]}08 45%, transparent 70%)`,
              pointerEvents: 'none',
              filter: 'blur(70px)',
              transition: 'all 0.4s ease',
              zIndex: 0,
            }}
          />

          {/* Modal Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.1rem 1.85rem',
              borderBottom: '1px solid #1c1c20',
              flexShrink: 0,
              zIndex: 10,
              background: 'rgba(16, 16, 18, 0.9)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  background: 'rgba(165, 153, 255, 0.12)',
                  border: '1px solid rgba(165, 153, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a599ff',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', fontFamily: 'Inter, sans-serif' }}>
                  XP Constellation &amp; Mastery Galaxy
                </h2>
                <span style={{ fontSize: '0.76rem', color: '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                  20 Cosmic Progression Tiers · Interactive Star Map
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* View Switcher: Path vs Grid */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#141416',
                  border: '1px solid #1c1c20',
                  borderRadius: '10px',
                  padding: '3px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('path')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: viewMode === 'path' ? '#a599ff' : 'transparent',
                    color: viewMode === 'path' ? '#000000' : '#8e8e93',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span>✨</span>
                  <span>Constellation Path</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: viewMode === 'grid' ? '#a599ff' : 'transparent',
                    color: viewMode === 'grid' ? '#000000' : '#8e8e93',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span>⊞</span>
                  <span>All Tiers</span>
                </button>
              </div>

              {/* Total XP Capsule */}
              <div
                style={{
                  background: '#141416',
                  border: '1px solid #1c1c20',
                  padding: '0.38rem 0.95rem',
                  borderRadius: '999px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#a599ff',
                  fontFamily: 'Inter, sans-serif',
                  fontFeatureSettings: '"tnum"',
                }}
              >
                ⚡ {currentXP.toLocaleString()} XP
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#141416',
                  border: '1px solid #1c1c20',
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

          {/* Modal Body */}
          <div
            style={{
              padding: '1.15rem 1.85rem 1.35rem 1.85rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              zIndex: 1,
              flex: 1,
              justifyContent: 'space-between',
            }}
          >
            {/* ── TOP HERO INSPECTOR: ACTIVE / SELECTED TIER ── */}
            <div
              style={{
                background: '#141416',
                border: '1px solid #1c1c20',
                borderRadius: '18px',
                padding: '1.1rem 1.5rem',
                display: 'grid',
                gridTemplateColumns: '115px 1fr auto',
                gap: '1.5rem',
                alignItems: 'center',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.45)',
                position: 'relative',
                overflow: 'visible',
                flexShrink: 0,
              }}
            >
              {/* Subtle top color strip */}
              <div
                style={{
                  position: 'absolute',
                  top: -1,
                  left: '20px',
                  right: '20px',
                  height: '2px',
                  background: `linear-gradient(90deg, transparent, ${activeGradient[0]}, transparent)`,
                  borderRadius: '2px',
                }}
              />

              {/* Floating Hero Mascot */}
              <div
                onClick={() => setIsAscendedSpotlightOpen(true)}
                title="Click to view Ascended Mascot Spotlight"
                style={{
                  width: '115px',
                  height: '115px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'visible',
                  cursor: 'pointer',
                }}
              >
                {/* Radiant Aura */}
                <img
                  src={activeMascot}
                  alt=""
                  style={{
                    position: 'absolute',
                    width: '110px',
                    height: '110px',
                    filter: `blur(18px) drop-shadow(0 0 24px ${activeGradient[0]})`,
                    opacity: 0.95,
                    pointerEvents: 'none',
                  }}
                />
                {/* Real Character */}
                <img
                  src={activeMascot}
                  alt={activeTitle}
                  style={{
                    position: 'relative',
                    width: '110px',
                    height: '110px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.85))',
                    animation: 'floatBob 3.5s ease-in-out infinite',
                    zIndex: 2,
                    transition: 'transform 200ms ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.1) translateY(-4px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                  }}
                />

                {/* "Click Me" Interactive Pill */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    zIndex: 5,
                    background: 'rgba(20, 20, 24, 0.92)',
                    border: `1px solid ${activeGradient[0]}80`,
                    borderRadius: '999px',
                    padding: '2px 8px',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    color: activeGradient[0],
                    letterSpacing: '0.04em',
                    fontFamily: 'Inter, sans-serif',
                    boxShadow: `0 2px 10px rgba(0,0,0,0.8), 0 0 10px ${activeGradient[0]}40`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>✨</span>
                  <span>Click Me</span>
                </div>
              </div>

              {/* Tier Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '0.22rem 0.65rem',
                      borderRadius: '6px',
                      background: `${activeGradient[0]}18`,
                      color: activeGradient[0],
                      border: `1px solid ${activeGradient[0]}40`,
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    Tier {activeIndex + 1}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', fontFamily: 'Inter, sans-serif' }}>
                    {activeTitle}
                  </h3>
                  {activeIndex === currentTierIndex && (
                    <span style={{ fontSize: '0.74rem', color: '#5eda9e', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                      ● CURRENT TIER
                    </span>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: '0.86rem', color: '#8e8e93', lineHeight: 1.45, fontStyle: 'italic', fontFamily: 'Inter, sans-serif' }}>
                  "{activeLore}"
                </p>

                {/* Progress bar to next */}
                <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                    <span>Threshold: <strong style={{ color: '#ffffff' }}>{activeXP.toLocaleString()} XP</strong></span>
                    {activeIndex === currentTierIndex && (
                      <span style={{ color: '#a599ff', fontWeight: 600 }}>{(nextTierXP - currentXP).toLocaleString()} XP to {nextTierTitle}</span>
                    )}
                  </div>
                  <div style={{ width: '100%', height: '7px', background: '#222226', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${activeIndex < currentTierIndex ? 100 : activeIndex === currentTierIndex ? Math.max(4, progressToNext * 100) : 0}%`,
                        background: `linear-gradient(90deg, ${activeGradient[0]}, ${activeGradient[1]})`,
                        borderRadius: '999px',
                        transition: 'width 0.4s ease',
                        boxShadow: `0 0 10px ${activeGradient[0]}80`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Status Badge on Right */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {activeIndex <= currentTierIndex ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      color: '#5eda9e',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      background: 'rgba(94, 218, 158, 0.12)',
                      border: '1px solid rgba(94, 218, 158, 0.25)',
                      padding: '0.38rem 0.85rem',
                      borderRadius: '8px',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>UNLOCKED</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      color: '#8e8e93',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#18181c',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '0.38rem 0.85rem',
                      borderRadius: '8px',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <Lock size={14} />
                    <span>LOCKED</span>
                  </div>
                )}
              </div>
            </div>
            {/* ── VIEW MODE 1: GALAXY CONSTELLATION STAR PATH ── */}
            {viewMode === 'path' ? (
              <div
                style={{
                  background: '#141416',
                  border: '1px solid #1c1c20',
                  borderRadius: '20px',
                  padding: '1.15rem 1.4rem',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Embedded Twinkling Cosmic Stars */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `radial-gradient(1.5px 1.5px at 40px 60px, rgba(255,255,255,0.8), transparent),
                                      radial-gradient(1px 1px at 120px 180px, #a599ff, transparent),
                                      radial-gradient(1.5px 1.5px at 280px 40px, #38bdf8, transparent),
                                      radial-gradient(2px 2px at 420px 140px, rgba(255,255,255,0.7), transparent),
                                      radial-gradient(1px 1px at 580px 220px, #fef08a, transparent),
                                      radial-gradient(1.5px 1.5px at 720px 80px, #d8b4fe, transparent),
                                      radial-gradient(2px 2px at 860px 170px, rgba(255,255,255,0.9), transparent),
                                      radial-gradient(1px 1px at 980px 50px, #5eda9e, transparent)`,
                    backgroundSize: '100% 100%',
                    opacity: 0.65,
                    pointerEvents: 'none',
                  }}
                />

                {/* Section Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', position: 'relative', zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                      Cosmic Ascension Path
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#a599ff', background: 'rgba(165,153,255,0.12)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                      Scroll Horizontally →
                    </span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                    Tier {currentTierIndex + 1} / 20 Unlocked
                  </span>
                </div>

                {/* Horizontal Constellation Flow Track */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    overflowX: 'auto',
                    paddingBottom: '0.75rem',
                    paddingTop: '0.35rem',
                    position: 'relative',
                    zIndex: 2,
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
                          flexShrink: 0,
                          width: '118px',
                          background: isSelected
                            ? `${grad[0]}15`
                            : isCurrent
                            ? '#1c1c22'
                            : '#18181c',
                          border: isSelected
                            ? `2px solid ${grad[0]}`
                            : isCurrent
                            ? `2px solid ${grad[0]}90`
                            : '1px solid #1c1c20',
                          borderRadius: '16px',
                          padding: '0.85rem 0.55rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.5rem',
                          cursor: 'pointer',
                          transition: 'all 180ms ease',
                          position: 'relative',
                          opacity: isUnlocked ? 1 : 0.35,
                          boxShadow: isSelected
                            ? `0 0 20px ${grad[0]}40`
                            : isCurrent
                            ? `0 0 16px ${grad[0]}30`
                            : 'none',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.borderColor = isUnlocked ? `${grad[0]}70` : 'rgba(255,255,255,0.2)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.borderColor = isCurrent ? `${grad[0]}90` : '#1c1c20';
                          }
                        }}
                      >
                        {/* Tier Step Badge */}
                        <div
                          style={{
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            color: isUnlocked ? grad[0] : '#8e8e93',
                            background: isUnlocked ? `${grad[0]}15` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isUnlocked ? `${grad[0]}35` : 'rgba(255,255,255,0.06)'}`,
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontFamily: 'Inter, sans-serif',
                            letterSpacing: '0.04em',
                          }}
                        >
                          TIER {i + 1}
                        </div>

                        {/* Mascot Character Avatar */}
                        <div style={{ width: '52px', height: '52px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isCurrent && (
                            <img
                              src={mascot}
                              alt=""
                              style={{
                                position: 'absolute',
                                width: '50px',
                                height: '50px',
                                filter: `blur(10px) drop-shadow(0 0 14px ${grad[0]})`,
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                          <img
                            src={mascot}
                            alt={title}
                            style={{
                              position: 'relative',
                              width: '50px',
                              height: '50px',
                              objectFit: 'contain',
                              filter: !isUnlocked ? 'grayscale(100%)' : 'drop-shadow(0 5px 12px rgba(0,0,0,0.6))',
                              zIndex: 2,
                            }}
                          />
                        </div>

                        {/* Title & XP */}
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isUnlocked ? '#ffffff' : '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                            {title}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: isCurrent ? grad[0] : '#8e8e93', fontWeight: 600, fontFamily: 'Inter, sans-serif', marginTop: '1px' }}>
                            {threshold >= 1000 ? `${(threshold / 1000).toLocaleString()}k XP` : `${threshold} XP`}
                          </div>
                        </div>

                        {/* Current Player Indicator */}
                        {isCurrent && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-7px',
                              background: grad[0],
                              color: '#000000',
                              fontSize: '0.58rem',
                              fontWeight: 900,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              fontFamily: 'Inter, sans-serif',
                              boxShadow: `0 0 12px ${grad[0]}`,
                            }}
                          >
                            YOU
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── INTERACTIVE COSMIC CODEX & REALM POWERS ── */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.25fr 1fr',
                    gap: '1rem',
                    marginTop: '0.85rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {/* Card 1: Inspected Tier Archetype & Element */}
                  <div
                    style={{
                      background: '#18181c',
                      border: '1px solid #1c1c20',
                      borderRadius: '14px',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: activeGradient[0], textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter, sans-serif' }}>
                        {TIER_ARCHETYPES[activeIndex]?.realm || 'Cosmic Realm'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#8e8e93', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                        Tier {activeIndex + 1}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                      {TIER_ARCHETYPES[activeIndex]?.title || activeTitle}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#8e8e93', display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'Inter, sans-serif' }}>
                      <span>Element:</span>
                      <strong style={{ color: '#d1d1d6' }}>{TIER_ARCHETYPES[activeIndex]?.element || 'Cosmic Aura'}</strong>
                    </div>
                  </div>

                  {/* Card 2: Tier Passive Perk & Mastery Buff */}
                  <div
                    style={{
                      background: '#18181c',
                      border: `1px solid ${activeIndex <= currentTierIndex ? 'rgba(94, 218, 158, 0.25)' : '#1c1c20'}`,
                      borderRadius: '14px',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: activeIndex <= currentTierIndex ? '#5eda9e' : '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter, sans-serif' }}>
                        {activeIndex <= currentTierIndex ? '⚡ Active Perk Unlocked' : '🔒 Tier Mastery Perk'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: activeIndex <= currentTierIndex ? '#5eda9e' : '#8e8e93', fontWeight: 700 }}>
                        {activeIndex <= currentTierIndex ? 'UNLOCKED' : 'LOCKED'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: activeIndex <= currentTierIndex ? '#5eda9e' : '#f2f2f7', fontFamily: 'Inter, sans-serif' }}>
                      {TIER_ARCHETYPES[activeIndex]?.perk || '+10% Mastery Boost'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                      {activeIndex <= currentTierIndex
                        ? 'Permanently applied to your daily ZenTrack momentum.'
                        : `Reach ${activeXP.toLocaleString()} XP to unlock this perk.`}
                    </div>
                  </div>

                  {/* Card 3: 4 Celestial Realms Progress */}
                  <div
                    style={{
                      background: '#18181c',
                      border: '1px solid #1c1c20',
                      borderRadius: '14px',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#a599ff', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter, sans-serif' }}>
                      Realms Standing
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                      <span style={{ color: currentTierIndex >= 4 ? '#5eda9e' : '#ffffff' }}>Initiate (T1–5)</span>
                      <span style={{ fontWeight: 700, color: currentTierIndex >= 4 ? '#5eda9e' : '#a599ff' }}>{currentTierIndex >= 4 ? '✓ Mastered' : `${currentTierIndex + 1}/5`}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                      <span style={{ color: currentTierIndex >= 5 && currentTierIndex <= 9 ? '#a599ff' : currentTierIndex > 9 ? '#5eda9e' : '#8e8e93' }}>Luminary (T6–10)</span>
                      <span style={{ fontWeight: 700, color: currentTierIndex >= 5 && currentTierIndex <= 9 ? '#a599ff' : currentTierIndex > 9 ? '#5eda9e' : '#8e8e93' }}>{currentTierIndex > 9 ? '✓ Mastered' : currentTierIndex >= 5 ? 'Active (T6)' : 'Locked'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                      <span style={{ color: currentTierIndex >= 10 && currentTierIndex <= 14 ? '#a599ff' : currentTierIndex > 14 ? '#5eda9e' : '#8e8e93' }}>Sovereign (T11–15)</span>
                      <span style={{ fontWeight: 700, color: '#8e8e93' }}>{currentTierIndex > 14 ? '✓ Mastered' : 'Locked'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── VIEW MODE 2: 20-TIER COMPACT CONSTELLATION NODE GRID ── */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>All 20 Mastery Tiers</span>
                  <span style={{ fontSize: '0.72rem', color: '#8e8e93', fontFamily: 'Inter, sans-serif' }}>Click any tier to inspect</span>
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
                            ? `${grad[0]}15`
                            : isCurrent
                            ? '#1c1c22'
                            : '#18181c',
                          border: isSelected
                            ? `1.5px solid ${grad[0]}`
                            : isCurrent
                            ? `1.5px solid ${grad[0]}70`
                            : '1px solid #1c1c20',
                          borderRadius: '14px',
                          padding: '0.85rem 0.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.45rem',
                          cursor: 'pointer',
                          transition: 'all 180ms ease',
                          position: 'relative',
                          opacity: isUnlocked ? 1 : 0.4,
                          boxShadow: isSelected
                            ? `0 0 20px ${grad[0]}35`
                            : isCurrent
                            ? `0 0 16px ${grad[0]}25`
                            : 'none',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = isUnlocked ? `${grad[0]}50` : 'rgba(255,255,255,0.15)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.borderColor = isCurrent ? `${grad[0]}70` : '#1c1c20';
                          }
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
                                width: '46px',
                                height: '46px',
                                filter: `blur(8px) drop-shadow(0 0 12px ${grad[0]})`,
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                          <img
                            src={mascot}
                            alt={title}
                            style={{
                              width: '46px',
                              height: '46px',
                              objectFit: 'contain',
                              filter: !isUnlocked ? 'grayscale(100%)' : 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))',
                              transition: 'transform 200ms ease',
                            }}
                          />
                        </div>

                        {/* Title & XP */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: isUnlocked ? '#ffffff' : '#8e8e93', fontFamily: 'Inter, sans-serif' }}>
                            {title}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: isCurrent ? grad[0] : '#8e8e93', fontWeight: 600, fontFamily: 'Inter, sans-serif', marginTop: '1px' }}>
                            {threshold >= 1000 ? `${(threshold / 1000).toFixed(0)}k XP` : `${threshold} XP`}
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
                              background: `${grad[0]}20`,
                              padding: '1px 4px',
                              borderRadius: '4px',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── XP REWARDS EARNING CHEATSHEET ── */}
            <div
              style={{
                background: '#141416',
                border: '1px solid #1c1c20',
                borderRadius: '16px',
                padding: '0.9rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                flexWrap: 'wrap',
                gap: '0.85rem',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                <CheckCircle2 size={15} color="#5eda9e" />
                <span style={{ color: '#8e8e93' }}>Task Completed: <strong style={{ color: '#ffffff' }}>+50–100 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                <Flame size={15} color="#f59e0b" />
                <span style={{ color: '#8e8e93' }}>Habit Logged: <strong style={{ color: '#ffffff' }}>+50 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                <Zap size={15} color="#a599ff" />
                <span style={{ color: '#8e8e93' }}>Focus Session: <strong style={{ color: '#ffffff' }}>+100–150 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                <BookOpen size={15} color="#38bdf8" />
                <span style={{ color: '#8e8e93' }}>Active Recall / Quiz: <strong style={{ color: '#ffffff' }}>+50 XP</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                <Trophy size={15} color="#f59e0b" />
                <span style={{ color: '#8e8e93' }}>Perfect Day: <strong style={{ color: '#ffffff' }}>+1,000 XP</strong></span>
              </div>
            </div>

          </div>

          {/* ── ASCENDED MASCOT SPOTLIGHT CINEMATIC OVERLAY (SUPREME GOD-TIER ANIMATION) ── */}
          <AnimatePresence>
            {isAscendedSpotlightOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setIsAscendedSpotlightOpen(false)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 200,
                  backgroundColor: 'rgba(3, 3, 5, 0.96)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {/* ── Rotating Cosmic God Rays ── */}
                <div
                  style={{
                    position: 'absolute',
                    width: activeIndex === 19 ? '1200px' : '900px',
                    height: activeIndex === 19 ? '1200px' : '900px',
                    borderRadius: '50%',
                    background: activeIndex === 19
                      ? `conic-gradient(from 0deg, transparent 0deg, #ffd70038 25deg, transparent 50deg, #ff7bf02a 75deg, transparent 100deg, #7bf0ff35 125deg, transparent 150deg, #ffd7003a 175deg, transparent 200deg, #ff7bf02a 225deg, transparent 250deg, #7bf0ff35 275deg, transparent 300deg, #ffd70038 325deg, transparent 360deg)`
                      : `conic-gradient(from 0deg, transparent 0deg, ${activeGradient[0]}22 30deg, transparent 60deg, ${activeGradient[1]}18 90deg, transparent 120deg, ${activeGradient[0]}20 150deg, transparent 180deg, ${activeGradient[1]}18 210deg, transparent 240deg, ${activeGradient[0]}22 270deg, transparent 300deg, ${activeGradient[1]}18 330deg, transparent 360deg)`,
                    animation: 'spinRays 30s linear infinite',
                    pointerEvents: 'none',
                    filter: 'blur(35px)',
                  }}
                />

                {/* ── Multi-Layer Supernova Singularity Core ── */}
                <motion.div
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.2, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: 'absolute',
                    width: activeIndex === 19 ? '900px' : '680px',
                    height: activeIndex === 19 ? '900px' : '680px',
                    borderRadius: '50%',
                    background: activeIndex === 19
                      ? `radial-gradient(circle, rgba(255, 215, 0, 0.55) 0%, rgba(255, 123, 240, 0.28) 35%, rgba(123, 240, 255, 0.18) 55%, transparent 75%)`
                      : `radial-gradient(circle, ${activeGradient[0]}45 0%, ${activeGradient[1]}20 40%, transparent 70%)`,
                    filter: 'blur(70px)',
                    pointerEvents: 'none',
                  }}
                />

                {/* ── Sacred Celestial Orbit Rings (Sacred Geometry) ── */}
                <div
                  style={{
                    position: 'absolute',
                    width: activeIndex === 19 ? '660px' : '440px',
                    height: activeIndex === 19 ? '660px' : '440px',
                    borderRadius: '50%',
                    border: `1.5px dashed ${activeIndex === 19 ? 'rgba(255, 215, 0, 0.65)' : activeGradient[0] + '45'}`,
                    animation: 'spinRays 35s linear infinite',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: activeIndex === 19 ? '520px' : '340px',
                      height: activeIndex === 19 ? '520px' : '340px',
                      borderRadius: '50%',
                      border: `1px solid ${activeIndex === 19 ? 'rgba(255, 123, 240, 0.55)' : activeGradient[1] + '35'}`,
                      animation: 'spinReverse 22s linear infinite',
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', color: activeIndex === 19 ? '#ffd700' : activeGradient[0], fontSize: '16px', textShadow: '0 0 12px #ffd700' }}>✦</span>
                    <span style={{ position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)', color: activeIndex === 19 ? '#7bf0ff' : activeGradient[1], fontSize: '16px', textShadow: '0 0 12px #7bf0ff' }}>✦</span>
                    <span style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', color: activeIndex === 19 ? '#ff7bf0' : activeGradient[0], fontSize: '16px', textShadow: '0 0 12px #ff7bf0' }}>◈</span>
                    <span style={{ position: 'absolute', right: '-10px', top: '50%', transform: 'translateY(-50%)', color: activeIndex === 19 ? '#ffffff' : activeGradient[1], fontSize: '16px', textShadow: '0 0 12px #ffffff' }}>◈</span>
                    {activeIndex === 19 && (
                      <>
                        <span style={{ position: 'absolute', top: '14%', left: '14%', color: '#ffd700', fontSize: '14px' }}>✵</span>
                        <span style={{ position: 'absolute', top: '14%', right: '14%', color: '#ff7bf0', fontSize: '14px' }}>✵</span>
                        <span style={{ position: 'absolute', bottom: '14%', left: '14%', color: '#7bf0ff', fontSize: '14px' }}>✵</span>
                        <span style={{ position: 'absolute', bottom: '14%', right: '14%', color: '#ffffff', fontSize: '14px' }}>✵</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Top Close / Return Pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: '18px',
                    right: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '999px',
                    color: '#d1d1d6',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    zIndex: 20,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  }}
                >
                  <span>ESC / Click anywhere</span>
                  <X size={14} />
                </div>

                {/* Left Fast Tier Navigator (Hidden on Tier 1 / index 0) */}
                {activeIndex > 0 && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setNavDirection('prev');
                      setSelectedTierIndex(Math.max(0, activeIndex - 1));
                    }}
                    title="Previous Tier (Arrow Left)"
                    style={{
                      position: 'absolute',
                      left: '24px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'rgba(20, 20, 24, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 20,
                      transition: 'all 150ms ease',
                      backdropFilter: 'blur(10px)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                      e.currentTarget.style.borderColor = activeGradient[0];
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(-50%)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                  >
                    <ChevronLeft size={22} />
                  </button>
                )}

                {/* Right Fast Tier Navigator (Hidden on Tier 20 / index 19) */}
                {activeIndex < LEVEL_TITLES.length - 1 && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setNavDirection('next');
                      setSelectedTierIndex(Math.min(LEVEL_TITLES.length - 1, activeIndex + 1));
                    }}
                    title="Next Tier (Arrow Right)"
                    style={{
                      position: 'absolute',
                      right: '24px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'rgba(20, 20, 24, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 20,
                      transition: 'all 150ms ease',
                      backdropFilter: 'blur(10px)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                      e.currentTarget.style.borderColor = activeGradient[0];
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(-50%)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                  >
                    <ChevronRight size={22} />
                  </button>
                )}

                {/* ── Cinematic Header with Directional Parallax ── */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`header-${activeIndex}`}
                    initial={{ opacity: 0, x: navDirection === 'next' ? 40 : -40, y: -10 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, x: navDirection === 'next' ? -40 : 40, y: -10 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    style={{ textAlign: 'center', marginBottom: '0.15rem', zIndex: 10 }}
                  >
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.18em',
                        padding: '0.28rem 0.95rem',
                        borderRadius: '999px',
                        background: activeIndex === 19 ? 'rgba(255, 215, 0, 0.2)' : `${activeGradient[0]}22`,
                        color: activeIndex === 19 ? '#ffd700' : activeGradient[0],
                        border: `1.5px solid ${activeIndex === 19 ? '#ffd70080' : activeGradient[0] + '60'}`,
                        boxShadow: activeIndex === 19 ? '0 0 30px rgba(255, 215, 0, 0.6)' : `0 0 24px ${activeGradient[0]}45`,
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      ✦ {activeIndex === 19 ? 'SUPREME SINGULARITY · TIER 20' : `TIER ${activeIndex + 1} · ${TIER_ARCHETYPES[activeIndex]?.realm || 'COSMIC REALM'}`} ✦
                    </span>
                    <h1
                      style={{
                        margin: '0.35rem 0 0 0',
                        fontSize: activeIndex === 19 ? '3.2rem' : '2.6rem',
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '-0.03em',
                        fontFamily: 'Inter, sans-serif',
                        textShadow: activeIndex === 19
                          ? '0 0 45px rgba(255, 215, 0, 0.8), 0 0 90px rgba(255, 123, 240, 0.5)'
                          : `0 0 40px ${activeGradient[0]}75, 0 0 80px ${activeGradient[0]}30`,
                      }}
                    >
                      {activeTitle}
                    </h1>
                    <div style={{ fontSize: '1rem', color: activeIndex === 19 ? '#ffd700' : activeGradient[0], fontWeight: 700, fontFamily: 'Inter, sans-serif', marginTop: '2px', letterSpacing: '0.02em', textShadow: activeIndex === 19 ? '0 0 16px rgba(255, 215, 0, 0.6)' : 'none' }}>
                      {TIER_ARCHETYPES[activeIndex]?.title || `The Master of ${activeTitle}`}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* ── CENTERPIECE: GOD-TIER BESPOKE ARCHETYPE MASCOT WARP ── */}
                <div
                  style={{
                    width: activeIndex === 19 ? '480px' : '300px',
                    height: activeIndex === 19 ? '480px' : '300px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0.1rem 0 0.5rem 0',
                    zIndex: 10,
                  }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`mascot-${activeIndex}`}
                      initial={getArchetypeAnimation(activeIndex, navDirection).initial}
                      animate={getArchetypeAnimation(activeIndex, navDirection).animate}
                      exit={getArchetypeAnimation(activeIndex, navDirection).exit}
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {/* Pulsing Harmonic Outer Supernova Aura */}
                      <motion.img
                        animate={{ scale: [1, 1.22, 1], opacity: [0.8, 1, 0.8] }}
                        transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
                        src={activeMascot}
                        alt=""
                        style={{
                          position: 'absolute',
                          width: activeIndex === 19 ? '470px' : '290px',
                          height: activeIndex === 19 ? '470px' : '290px',
                          filter: activeIndex === 19
                            ? 'blur(45px) drop-shadow(0 0 110px #ffd700) drop-shadow(0 0 150px #ff7bf0)'
                            : `blur(36px) drop-shadow(0 0 70px ${activeGradient[0]})`,
                          pointerEvents: 'none',
                        }}
                      />
                      {/* Real Ascended Mascot Avatar with Breathing Wing Dynamics */}
                      <motion.img
                        animate={{ y: [0, -18, 0], rotate: [0, -1.5, 1.5, 0] }}
                        transition={{ repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
                        src={activeMascot}
                        alt={activeTitle}
                        style={{
                          position: 'relative',
                          width: activeIndex === 19 ? '470px' : '290px',
                          height: activeIndex === 19 ? '470px' : '290px',
                          objectFit: 'contain',
                          filter: activeIndex === 19
                            ? 'drop-shadow(0 30px 70px rgba(0,0,0,0.95)) drop-shadow(0 0 45px rgba(255, 215, 0, 0.85))'
                            : `drop-shadow(0 20px 50px rgba(0,0,0,0.95)) drop-shadow(0 0 25px ${activeGradient[0]}60)`,
                          zIndex: 12,
                        }}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* ── Ultra-Luxe Glassmorphism Lore & Powers Bento with Directional Parallax ── */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`lore-${activeIndex}`}
                    initial={{ opacity: 0, x: navDirection === 'next' ? 40 : -40, y: 15 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, x: navDirection === 'next' ? -40 : 40, y: 15 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    style={{
                      maxWidth: '680px',
                      width: '100%',
                      background: activeIndex === 19 ? 'rgba(20, 18, 12, 0.85)' : 'rgba(16, 16, 20, 0.82)',
                      border: `1px solid ${activeIndex === 19 ? 'rgba(255, 215, 0, 0.55)' : activeGradient[0] + '50'}`,
                      borderRadius: '18px',
                      padding: '1.05rem 1.75rem',
                      textAlign: 'center',
                      boxShadow: activeIndex === 19
                        ? '0 16px 50px rgba(0, 0, 0, 0.95), 0 0 50px rgba(255, 215, 0, 0.3)'
                        : `0 16px 50px rgba(0, 0, 0, 0.9), 0 0 40px ${activeGradient[0]}25`,
                      backdropFilter: 'blur(28px)',
                      zIndex: 10,
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#f2f2f7', lineHeight: 1.5, fontStyle: 'italic', fontFamily: 'Inter, sans-serif' }}>
                      "{activeLore}"
                    </p>

                    {/* Powers & Perks Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.35rem', flexWrap: 'wrap', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#d1d1d6', fontFamily: 'Inter, sans-serif' }}>
                        <span>⚡ Element:</span>
                        <strong style={{ color: activeIndex === 19 ? '#ffd700' : activeGradient[0] }}>{TIER_ARCHETYPES[activeIndex]?.element || 'Cosmic Aura'}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#d1d1d6', fontFamily: 'Inter, sans-serif' }}>
                        <span>🛡️ Mastery Perk:</span>
                        <strong style={{ color: '#5eda9e' }}>{TIER_ARCHETYPES[activeIndex]?.perk || '+10% XP'}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#d1d1d6', fontFamily: 'Inter, sans-serif' }}>
                        <span>🎯 Required:</span>
                        <strong style={{ color: '#ffffff' }}>{activeXP.toLocaleString()} XP</strong>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CSS Animation Keyframes for Cosmic Spotlight */}
          <style>{`
            @keyframes spinRays {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes spinReverse {
              from { transform: rotate(360deg); }
              to { transform: rotate(0deg); }
            }
          `}</style>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
