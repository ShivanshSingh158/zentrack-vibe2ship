import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2, PlaySquare, Route, Timer, Briefcase, GraduationCap, Flame, Command } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { playPopSound } from '../utils/sound';

interface OnboardingCarouselProps {
  userId: string;
  onComplete: () => void;
}

const CARDS = [
  {
    id: 'intro',
    title: 'The Ultimate Productivity Suite',
    desc: 'Unleash Zen AI for smart insights, use our LeetCode Solver to crush interviews, and track applications with the Job Analyzer.',
    icon: <Command size={80} style={{ color: '#8b5cf6' }} />,
    color: 'rgba(139, 92, 246, 0.15)'
  },
  {
    id: 'tools',
    title: 'Tools for Every Need',
    desc: 'Calculate your GPA instantly and connect your Spotify account to play your favorite study playlists directly inside the app.',
    icon: <Flame size={80} style={{ color: '#ef4444' }} />,
    color: 'rgba(239, 68, 68, 0.15)'
  },
  {
    id: 'learning',
    title: 'The Academic Hub',
    desc: 'Import entire YouTube playlists to track and watch lectures without distractions. Plus, easily log and track your college attendance!',
    icon: <GraduationCap size={80} style={{ color: '#6366f1' }} />,
    color: 'rgba(99, 102, 241, 0.15)'
  },
  {
    id: 'storage',
    title: 'Universal Cloud Storage',
    desc: 'Upload your notes and access them from any device anywhere! Features a built-in viewer for PDF, DOCX, and JPEG files.',
    icon: <Briefcase size={80} style={{ color: '#f59e0b' }} />,
    color: 'rgba(245, 158, 11, 0.15)'
  },
  {
    id: 'fitness',
    title: 'Track Your Gains',
    desc: 'Log your Gym and Cardio sessions effortlessly. We show this here so you know: this powerful tracker is exclusively optimized for your Mobile device!',
    icon: <CheckCircle2 size={80} style={{ color: '#10b981' }} />,
    color: 'rgba(16, 185, 129, 0.15)'
  }
];

export const OnboardingCarousel: React.FC<OnboardingCarouselProps> = ({ userId, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const width = scrollRef.current.clientWidth;
      const newIndex = Math.round(scrollLeft / width);
      if (newIndex !== currentIndex) {
        setCurrentIndex(newIndex);
      }
    }
  };

  const scrollTo = (index: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        left: index * scrollRef.current.clientWidth,
        behavior: 'smooth'
      });
      setCurrentIndex(index);
      playPopSound();
    }
  };

  const handleFinish = async () => {
    // Mark onboarding as done for this user permanently (matches App.tsx check)
    localStorage.setItem(`zen_onboarding_done_${userId}`, 'true');
    onComplete();
  };

  // Add global style for scroll snapping to avoid modifying index.css directly for this
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .onboarding-scroller {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none;  /* IE and Edge */
        width: 100%;
        height: 100%;
        border-radius: var(--radius-lg);
      }
      .onboarding-scroller::-webkit-scrollbar {
        display: none;
      }
      .onboarding-slide {
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        scroll-snap-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        text-align: center;
        box-sizing: border-box;
      }
      .onboarding-icon-container {
        width: 160px;
        height: 160px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2rem;
        box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
        animation: float 6s ease-in-out infinite;
      }
      @keyframes float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-15px); }
        100% { transform: translateY(0px); }
      }
      @media (max-width: 600px) {
        .onboarding-icon-container {
          width: 120px;
          height: 120px;
          margin-bottom: 1.5rem;
        }
        .onboarding-slide h2 {
          font-size: 1.5rem !important;
        }
        .onboarding-slide p {
          font-size: 0.95rem !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(9, 9, 11, 0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '800px',
        height: '600px',
        maxHeight: '90vh',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        
        {/* Main swipeable area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div className="onboarding-scroller" ref={scrollRef} onScroll={handleScroll}>
            {CARDS.map((card) => (
              <div key={card.id} className="onboarding-slide">
                <div className="onboarding-icon-container" style={{ backgroundColor: card.color }}>
                  {card.icon}
                </div>
                <h2 style={{ 
                  fontSize: '2rem', 
                  marginBottom: '1rem', 
                  fontFamily: 'var(--font-display)',
                  background: 'var(--accent-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  {card.title}
                </h2>
                <p style={{ 
                  fontSize: '1.1rem', 
                  color: 'var(--text-secondary)', 
                  lineHeight: 1.6, 
                  maxWidth: '500px',
                  margin: '0 auto'
                }}>
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
          
          {/* Navigation Arrows (Desktop) */}
          <button 
            onClick={() => scrollTo(Math.max(0, currentIndex - 1))}
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: currentIndex === 0 ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              zIndex: 10
            }}
            className="hide-on-mobile"
          >
            <ChevronLeft size={24} />
          </button>
          
          <button 
            onClick={() => scrollTo(Math.min(CARDS.length - 1, currentIndex + 1))}
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: currentIndex === CARDS.length - 1 ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              zIndex: 10
            }}
            className="hide-on-mobile"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Bottom Bar: Dots & Button */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)'
        }}>
          {/* Dots */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {CARDS.map((_, idx) => (
              <div 
                key={idx}
                onClick={() => scrollTo(idx)}
                style={{
                  width: idx === currentIndex ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: idx === currentIndex ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>

          {/* Action Button */}
          {currentIndex === CARDS.length - 1 ? (
            <button 
              className="btn-primary" 
              onClick={handleFinish}
              style={{ padding: '0.6rem 1.5rem', fontWeight: 600, fontSize: '1rem' }}
            >
              Get Started
            </button>
          ) : (
            <button 
              className="btn-secondary" 
              onClick={() => scrollTo(currentIndex + 1)}
              style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}
            >
              Next
            </button>
          )}
        </div>
        
        {/* Skip Button (top right) */}
        {currentIndex !== CARDS.length - 1 && (
          <button 
            onClick={handleFinish}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              padding: '0.5rem',
              zIndex: 10
            }}
          >
            Skip Intro
          </button>
        )}

      </div>
    </div>
  );
};
