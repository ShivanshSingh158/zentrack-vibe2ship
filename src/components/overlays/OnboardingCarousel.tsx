import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Bot, Terminal, Cloud, Rocket, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playPopSound } from '../../utils/sound';

interface OnboardingCarouselProps {
  userId: string;
  onComplete: () => void;
}

const CARDS = [
  {
    id: 'intro',
    title: 'Meet the Zenith Fleet',
    desc: 'Your personal fleet of autonomous AI agents. They don\'t just give advice — they execute complex tasks in the background while you focus on what matters.',
    icon: <Bot size={72} strokeWidth={1.5} />,
    gradient: 'linear-gradient(135deg, #8b5cf6, #c084fc)',
    shadow: 'rgba(139, 92, 246, 0.4)'
  },
  {
    id: 'workflow',
    title: 'True Agentic Workflow',
    desc: 'Experience the Agent Terminal. Watch in real-time as Hermes clears your inbox, Chronos optimizes your calendar, and Argus guards your deadlines.',
    icon: <Terminal size={72} strokeWidth={1.5} />,
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    shadow: 'rgba(6, 182, 212, 0.4)'
  },
  {
    id: 'sync',
    title: 'Deep Workspace Sync',
    desc: 'Seamlessly connected to your world. We securely sync with Google Calendar, Gmail, Drive, and Tasks to create a unified, proactive intelligence layer.',
    icon: <Cloud size={72} strokeWidth={1.5} />,
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    shadow: 'rgba(16, 185, 129, 0.4)'
  },
  {
    id: 'mastery',
    title: 'Academic & Career Mastery',
    desc: 'Built for ambition. From automated attendance tracking and GPA calculators to AI-powered LeetCode solving and Job application analysis.',
    icon: <Rocket size={72} strokeWidth={1.5} />,
    gradient: 'linear-gradient(135deg, #f59e0b, #ea580c)',
    shadow: 'rgba(245, 158, 11, 0.4)'
  },
  {
    id: 'always-on',
    title: 'Always Working For You',
    desc: 'The orchestration engine never sleeps. It scans for risks, catches ghost commitments, and keeps your schedule flawless. Welcome to the future of productivity.',
    icon: <Zap size={72} strokeWidth={1.5} />,
    gradient: 'linear-gradient(135deg, #ef4444, #be123c)',
    shadow: 'rgba(239, 68, 68, 0.4)'
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
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
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
        initial={{ y: 40, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.1 }}
        style={{
          width: '100%',
          maxWidth: '840px',
          height: '620px',
          maxHeight: '90vh',
          background: 'linear-gradient(145deg, rgba(20,24,35,0.95) 0%, rgba(10,12,20,0.95) 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
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
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
                style={{ 
                  width: 140, 
                  height: 140, 
                  borderRadius: '35%', 
                  background: CARDS[currentIndex].gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  marginBottom: '2.5rem',
                  boxShadow: `0 20px 40px -10px ${CARDS[currentIndex].shadow}, inset 0 2px 10px rgba(255,255,255,0.3)`,
                  position: 'relative'
                }}
              >
                {/* Micro-animation floating ring */}
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, ease: 'linear', repeat: Infinity }}
                  style={{
                    position: 'absolute',
                    inset: -20,
                    border: '1px dashed rgba(255,255,255,0.2)',
                    borderRadius: '40%'
                  }}
                />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
                >
                  {CARDS[currentIndex].icon}
                </motion.div>
              </motion.div>

              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ 
                  fontSize: '2.4rem', 
                  marginBottom: '1rem', 
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
                  fontSize: '1.15rem', 
                  color: 'rgba(255,255,255,0.6)', 
                  lineHeight: 1.6, 
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleFinish}
                style={{ 
                  padding: '0.8rem 2rem', 
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f5b840, #38bdf8)',
                  color: '#000',
                  border: 'none',
                  fontWeight: 700, 
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(245,184,64,0.3)'
                }}
              >
                Initialize Systems
              </motion.button>
            ) : (
              <motion.button 
                key="next"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                style={{ 
                  padding: '0.8rem 2rem', 
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.15)',
                  fontWeight: 600, 
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
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
