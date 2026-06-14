import React, { useState, useEffect, useRef } from 'react';
import { Mic, Dumbbell, GraduationCap, CheckSquare, Moon, ArrowRight, Check, Sparkles, ClipboardList, Layers, MessageSquare, Palette, Zap } from 'lucide-react';
import { auth } from '../services/firebase';
import { motion } from 'framer-motion';

// Generate 40 random particles
const PARTICLES = Array.from({ length: 40 }).map((_, i) => ({
  id: i,
  angle: Math.random() * Math.PI * 2,
  velocity: 50 + Math.random() * 200,
  size: 4 + Math.random() * 8,
  delay: Math.random() * 0.1,
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 720
}));

const ParticleExplosion = ({ color }: { color: string }) => {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', zIndex: 999999, pointerEvents: 'none' }}>
      {PARTICLES.map((p) => {
        const x = Math.cos(p.angle) * p.velocity;
        const y = Math.sin(p.angle) * p.velocity;
        return (
          <motion.div
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ 
              x, 
              y, 
              scale: [0, 1, 0], 
              opacity: [1, 1, 0],
              rotate: p.rotation + p.rotationSpeed
            }}
            transition={{ 
              duration: 0.7, 
              ease: "easeOut", 
              delay: p.delay 
            }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px', // Mix of circles and squares
              boxShadow: `0 0 10px ${color}`
            }}
          />
        );
      })}
    </div>
  );
};

const STEPS = [
  {
    icon: <Palette size={24} style={{ color: '#ec4899' }} />,
    color: '#ec4899', // Pink
    title: '3D Parallax Login',
    description: 'Welcome back! We just revolutionized the login screen with a stunning, interactive 3D parallax glass orb and deep space ambient blending.'
  },
  {
    icon: <MessageSquare size={24} style={{ color: '#0ea5e9' }} />,
    color: '#0ea5e9', // Sky Blue
    title: 'Draggable Voice Assistant',
    description: 'Your Voice Assistant widget is now fully draggable! Click and drag the microphone anywhere on your screen for the perfect custom setup.'
  },
  {
    icon: <Moon size={24} style={{ color: '#8b5cf6' }} />,
    color: '#8b5cf6', // Violet
    title: 'Neon Focus Timers',
    description: 'Deep Focus mode and sidebar timers have been unified with gorgeous rotating neon glow rings. Entering the flow state never looked this premium.'
  },
  {
    icon: <CheckSquare size={24} style={{ color: '#3b82f6' }} />,
    color: '#3b82f6', // Blue
    title: 'Refined Task Manager',
    description: 'We replaced cluttered priority text with sleek glowing LED dots (Red, Amber, Green) to give your task list a cleaner, futuristic vibe.'
  },
  {
    icon: <ClipboardList size={24} style={{ color: '#10b981' }} />,
    color: '#10b981', // Emerald
    title: 'Brain Dump & Quick Voice',
    description: 'Quickly say "Add buy groceries to my extra works" to instantly beam ad-hoc thoughts directly into your new global Brain Dump bento box.'
  },
  {
    icon: <Dumbbell size={24} style={{ color: '#ef4444' }} />,
    color: '#ef4444', // Red
    title: 'Seamless Gym & Sleep',
    description: 'Log your workouts, attendance, and sleep patterns entirely hands-free. Just say "I slept at 11 PM" or "I benched 225 for 5 reps."'
  },
  {
    icon: <Zap size={24} style={{ color: '#ec4899' }} />,
    color: '#ec4899', // Pink
    title: 'Seamless Future Updates',
    description: 'No more refreshing. From now on, when a new update arrives, a premium bar will drop down from the top of your screen. Click it to instantly install!'
  }
];

const TypewriterText = ({ text, speed = 30 }: { text: string, speed?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return <>{displayedText}</>;
};

export const UpdateFlashcard: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isFlying, setIsFlying] = useState(false);
  
  // Parallax Tilt State
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      
      const key = `voice_assistant_onboarding_v7_${uid}`;
      if (!localStorage.getItem(key)) {
        const timer = setTimeout(() => setIsVisible(true), 1000);
        return () => clearTimeout(timer);
      }
    };
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []);

  const step = STEPS[currentStep];

  if (!isVisible) return null;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setIsFlying(true);
      window.dispatchEvent(new Event('demo-update-prompt'));
      
      const uid = auth.currentUser?.uid;
      if (uid) {
        localStorage.setItem(`voice_assistant_onboarding_v7_${uid}`, 'true');
      }

      setTimeout(() => {
        setIsVisible(false);
      }, 700);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current || isFlying) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within the element.
    const y = e.clientY - rect.top;  // y position within the element.
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -3; // Max tilt 3deg (reduced sensitivity)
    const rotateY = ((x - centerX) / centerX) * 3;
    
    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotation({ x: 0, y: 0 });
  };

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 5, 10, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 99998,
        opacity: isFlying ? 0 : 1,
        transition: 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'none'
      }} />

      {/* Render Particles when flying */}
      {isFlying && <ParticleExplosion color={step.color} />}

      {/* Parallax Container */}
      <div 
        style={{
          position: 'fixed',
          top: isFlying ? 'calc(100vh - 113px)' : '50%',
          left: isFlying ? 'calc(100vw - 48px)' : '50%',
          transform: isFlying 
            ? 'translate(-50%, -50%) scale(0.05)' 
            : `translate(-50%, -50%) perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          opacity: isFlying ? 0 : 1,
          maxWidth: '400px',
          width: '90vw',
          zIndex: 99999,
          transition: isFlying ? 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)' : 'transform 0.1s ease-out',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div ref={cardRef} style={{
          position: 'relative',
          background: 'rgba(20, 20, 25, 0.8)',
          border: `1px solid ${step.color}40`,
          borderRadius: isFlying ? '50%' : '40px',
          padding: '2.5rem 2rem 2rem 2rem',
          boxShadow: isFlying ? 'none' : `0 30px 60px -15px rgba(0,0,0,0.9), 0 0 40px -10px ${step.color}50`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: 'all 0.5s ease'
        }}>
          
          {/* Dynamic Color Glow Background */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: `radial-gradient(circle at 50% 0%, ${step.color}20 0%, transparent 50%)`,
            pointerEvents: 'none',
            transition: 'background 0.5s ease'
          }} />

          {/* Animated Gradient Border matching voice widget */}
          <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent', borderRadius: 'inherit', background: `linear-gradient(135deg, ${step.color}, #a855f7) border-box`, WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none', opacity: 0.7, transition: 'background 0.5s ease' }} />

          {/* 3D Spinning Voice Assistant Logo */}
          <div style={{
            position: 'relative',
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            background: 'linear-gradient(to bottom, rgba(30,30,40,0.9), rgba(15,15,20,0.95))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem',
            boxShadow: `inset 0 4px 20px rgba(255,255,255,0.1), 0 0 40px ${step.color}60`,
            transition: 'box-shadow 0.5s ease'
          }}>
             <div style={{
              position: 'absolute',
              inset: '-4px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, #a855f7, ${step.color}, #f97316)`,
              animation: 'spin 3s linear infinite',
              zIndex: 0,
              filter: 'blur(8px)',
              transition: 'background 0.5s ease'
            }} />

            <div style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'spinAndPause 6s infinite',
              zIndex: 1,
              background: 'rgba(14, 14, 18, 0.95)',
              borderRadius: '50%',
            }}>
              <div style={{
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'swapMic 6s infinite',
              }}>
                <Mic size={36} color={step.color} style={{ transition: 'color 0.5s ease' }} />
                <Sparkles size={18} style={{ position: 'absolute', top: '-10px', right: '-12px', color: '#fbbf24', animation: 'starTwinkle 3s ease-in-out infinite' }} />
              </div>

              <div style={{
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'swapLogo 6s infinite',
              }}>
                <img src="/logo.png" alt="Listening" style={{ width: '44px', height: '44px', borderRadius: '50%', mixBlendMode: 'screen', objectFit: 'contain' }} />
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            What's New in Zentrack
          </h2>

          {/* Interactive Carousel Content */}
          <div style={{ 
            background: 'rgba(0,0,0,0.3)', 
            border: `1px solid ${step.color}30`,
            borderRadius: '32px', 
            padding: '1.5rem',
            width: '100%',
            marginBottom: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: '160px',
            justifyContent: 'flex-start',
            transition: 'all 0.5s ease',
            boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.5)'
          }}>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: `linear-gradient(135deg, ${step.color}20, transparent)`, borderRadius: '16px', border: `1px solid ${step.color}40`, transition: 'all 0.5s ease' }}>
              {step.icon}
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: step.color, margin: '0 0 0.75rem 0', transition: 'color 0.5s ease' }}>
              {step.title}
            </h3>
            <p style={{ fontSize: '0.95rem', color: '#cbd5e1', lineHeight: 1.6, margin: 0, minHeight: '3rem' }}>
              <TypewriterText text={step.description} speed={25} /><span style={{ animation: 'pulse 1s infinite' }}>|</span>
            </p>
          </div>

          {/* Footer Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {STEPS.map((s, idx) => (
                <div key={idx} style={{
                  width: idx === currentStep ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: idx === currentStep ? s.color : 'rgba(255,255,255,0.1)',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: idx === currentStep ? `0 0 10px ${s.color}80` : 'none'
                }} />
              ))}
            </div>
            
            <button onClick={handleNext} style={{ 
              background: `linear-gradient(135deg, ${step.color}, #6366f1)`, 
              color: '#fff', 
              border: 'none', 
              padding: '0.75rem 1.5rem', 
              borderRadius: '12px', 
              fontSize: '1rem', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: `0 8px 25px ${step.color}50`
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95) translateY(2px)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
            >
              {currentStep === STEPS.length - 1 ? (
                 <>Launch <Check size={18} strokeWidth={3} /></>
              ) : (
                 <>Next <ArrowRight size={18} strokeWidth={3} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
