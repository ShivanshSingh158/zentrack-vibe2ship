import React from 'react';
import { motion } from 'framer-motion';

interface SolarSystemLoaderProps {
  title?: string;
  subtitle?: string;
}

export const SolarSystemLoader: React.FC<SolarSystemLoaderProps> = ({ 
  title = "Loading Zentrack...", 
  subtitle = "AUTHENTICATING" 
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      overflow: 'hidden',
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      {/* Animated Background Image */}
      <motion.div
        initial={{ scale: 1, filter: 'blur(10px) brightness(0.5)' }}
        animate={{ scale: 1.15, filter: 'blur(0px) brightness(1)' }}
        transition={{ 
          scale: { duration: 20, ease: 'linear', repeat: Infinity, repeatType: 'reverse' },
          filter: { duration: 2, ease: 'easeOut' }
        }}
        style={{
          position: 'absolute',
          inset: -50, // Bleed for scaling
          backgroundImage: 'url(/solar-system-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: 1
        }}
      />
      
      {/* Subtle floating particles (stars) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0, 
              x: Math.random() * window.innerWidth, 
              y: Math.random() * window.innerHeight,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{ 
              opacity: [0, 0.8, 0],
              y: [null, Math.random() * window.innerHeight - 100]
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 0 10px #fff'
            }}
          />
        ))}
      </div>

      {/* Gradient Overlay for better text readability */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.6) 100%)',
        zIndex: 3
      }} />

      {/* Content */}
      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.5, duration: 1, type: 'spring', damping: 20 }}
        style={{
          position: 'relative',
          zIndex: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          padding: 'clamp(2rem, 5vh, 2.5rem) clamp(1.5rem, 8vw, 4rem)',
          background: 'rgba(10, 15, 30, 0.3)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '32px',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Glowing planetary rings effect for the spinner */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(139,92,246,0.2)' }} 
          />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
            style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#a78bfa', borderRightColor: 'rgba(167,139,250,0.1)' }} 
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 4.5, ease: 'linear', repeat: Infinity }}
            style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: '#38bdf8', borderLeftColor: 'rgba(56,189,248,0.1)' }} 
          />
          
          {/* Orbital element */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 5, ease: 'linear', repeat: Infinity }}
            style={{ position: 'absolute', inset: -12, borderRadius: '50%' }}
          >
             <div style={{ position: 'absolute', top: -3, left: '50%', width: 6, height: 6, background: '#a78bfa', borderRadius: '50%', boxShadow: '0 0 10px #a78bfa' }} />
          </motion.div>

          {/* Inner core */}
          <motion.div 
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
            style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 0 20px #fff, 0 0 40px #a78bfa, 0 0 60px #38bdf8' }} 
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <motion.h2 
            animate={{ opacity: [0.8, 1, 0.8], textShadow: ['0 0 10px rgba(255,255,255,0)', '0 0 20px rgba(255,255,255,0.5)', '0 0 10px rgba(255,255,255,0)'] }}
            transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
            style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '0.08em', textAlign: 'center' }}
          >
            {title}
          </motion.h2>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', margin: 0 }}
          >
            {subtitle}
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
};
