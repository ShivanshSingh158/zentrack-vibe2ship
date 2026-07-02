import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playPopSound } from '../../utils/sound';
import {
  ProactiveAgentAnimation,
  WorkspaceIntegrationAnimation,
  SmartTasksAnimation,
  FlowStateAnimation,
  LearningAnimation,
  ConsoleAnalyticsAnimation,
} from '../LandingAnimations';
import '../../styles/landing.css';

interface OnboardingCarouselProps {
  userId: string;
  onComplete: () => void;
}

const CARDS = [
  {
    id: 'intro',
    title: 'Fully Autonomous',
    desc: 'Your AI companion never sleeps. The moment an email lands or a deadline shifts, agents auto-trigger. Zero manual setup.',
    AnimationComp: ProactiveAgentAnimation
  },
  {
    id: 'sync',
    title: 'Deep Google Integration',
    desc: 'Not just connected — deeply embedded. Speaks Gmail, Calendar, Drive, Docs, Tasks, and YouTube natively.',
    AnimationComp: WorkspaceIntegrationAnimation
  },
  {
    id: 'tasks',
    title: 'Smart Tasks',
    desc: 'Every task knows exactly where it belongs. AI reads your inbox, extracts items, assigns scores, and time-blocks.',
    AnimationComp: SmartTasksAnimation
  },
  {
    id: 'flow',
    title: 'Flow State Engine',
    desc: 'Build the conditions for your deepest work. Intelligent focus sessions protect your time and habit streaks build momentum.',
    AnimationComp: FlowStateAnimation
  },
  {
    id: 'learning',
    title: 'Growth on Autopilot',
    desc: 'Curated daily learning modules, YouTube integration, and spaced-repetition AI coaching that adapts to your rhythm.',
    AnimationComp: LearningAnimation
  },
  {
    id: 'console',
    title: 'Agent Console',
    desc: 'Speak in plain language and watch your agents reason in real-time. Get live analytics on every dimension of your productivity.',
    AnimationComp: ConsoleAnalyticsAnimation
  }
];

export const OnboardingCarousel: React.FC<OnboardingCarouselProps> = ({ userId, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const handleNext = () => {
    if (currentIndex < CARDS.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
      playPopSound();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
      playPopSound();
    }
  };

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
    playPopSound();
  };

  const handleFinish = async () => {
    localStorage.setItem(`zen_onboarding_done_${userId}`, 'true');
    onComplete();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 100 : -100,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.5, type: 'spring', bounce: 0.2 }
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -100 : 100,
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.4 }
    })
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="liquid-glass"
        style={{
          width: '100%',
          maxWidth: '840px',
          height: '620px',
          maxHeight: '90vh',
          borderRadius: '24px',
          boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255,255,255,0.05)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '1rem'
        }}
      >
        {/* Skip Button */}
        <AnimatePresence>
          {currentIndex !== CARDS.length - 1 && (
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleFinish}
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-secondary)',
                borderRadius: '20px',
                padding: '0.4rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                zIndex: 20,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Skip Intro
            </motion.button>
          )}
        </AnimatePresence>

        {/* Swipeable Content Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{
                position: 'absolute',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '0 3rem'
              }}
            >
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100, delay: 0.15 }}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: 0,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ 
                  width: '560px', 
                  transform: 'scale(0.55)', 
                  transformOrigin: 'center center' 
                }}>
                  {CARDS[currentIndex]?.AnimationComp && React.createElement(CARDS[currentIndex].AnimationComp)}
                </div>
              </motion.div>

              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ 
                  fontSize: '2rem', 
                  marginBottom: '0.75rem', 
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: '#fff',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1
                }}
              >
                {CARDS[currentIndex].title}
              </motion.h2>

              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ 
                  fontSize: '1.05rem', 
                  color: 'rgba(255,255,255,0.6)', 
                  lineHeight: 1.5, 
                  maxWidth: '520px',
                  margin: '0 auto',
                  fontWeight: 400
                }}
              >
                {CARDS[currentIndex].desc}
              </motion.p>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          <AnimatePresence>
            {currentIndex > 0 && (
              <motion.button 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onClick={handlePrev}
                className="hide-on-mobile"
                style={{
                  position: 'absolute', left: '1.5rem', top: '50%', marginTop: '-24px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '50%', width: 48, height: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff', zIndex: 10,
                  backdropFilter: 'blur(8px)', transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <ChevronLeft size={24} />
              </motion.button>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {currentIndex < CARDS.length - 1 && (
              <motion.button 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={handleNext}
                className="hide-on-mobile"
                style={{
                  position: 'absolute', right: '1.5rem', top: '50%', marginTop: '-24px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '50%', width: 48, height: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff', zIndex: 10,
                  backdropFilter: 'blur(8px)', transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <ChevronRight size={24} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Bar: Dots & Action Button */}
        <div style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20
        }}>
          {/* Progress Dots */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {CARDS.map((_, idx) => (
              <motion.div 
                key={idx}
                onClick={() => handleDotClick(idx)}
                animate={{ 
                  width: idx === currentIndex ? 32 : 8,
                  backgroundColor: idx === currentIndex ? '#fff' : 'rgba(255,255,255,0.2)'
                }}
                transition={{ duration: 0.3 }}
                style={{
                  height: 8,
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>

          {/* Action Button */}
          <AnimatePresence mode="wait">
            {currentIndex === CARDS.length - 1 ? (
              <motion.button 
                key="finish"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.15)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleFinish}
                className="liquid-glass"
                style={{ 
                  padding: '1rem 2.5rem', 
                  borderRadius: '12px',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontWeight: 600, 
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.3s ease'
                }}
              >
                Initialize Systems
              </motion.button>
            ) : (
              <motion.button 
                key="next"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="liquid-glass"
                style={{ 
                  padding: '1rem 2.5rem', 
                  borderRadius: '12px',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontWeight: 500, 
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.3s ease'
                }}
              >
                Continue
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
