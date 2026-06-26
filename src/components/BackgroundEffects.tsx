import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export const BackgroundEffects = () => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: -1,
      overflow: 'hidden',
      background: '#020203', // Deep space dark
      perspective: '1500px'
    }}>
      {/* 1. Deep Space Ambient Orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[
          { color: '#7c3aed', size: 600, top: '-10%', left: '-10%', duration: 25 },
          { color: '#ec4899', size: 500, bottom: '-20%', right: '-10%', duration: 20 },
          { color: '#3b82f6', size: 400, top: '40%', left: '40%', duration: 30 }
        ].map((orb, i) => (
          <motion.div
            key={i}
            animate={{
              transform: [
                'translate(0px, 0px) scale(1)', 
                'translate(50px, -50px) scale(1.1)', 
                'translate(-50px, 50px) scale(0.9)', 
                'translate(0px, 0px) scale(1)'
              ]
            }}
            transition={{ duration: orb.duration, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              width: orb.size * 1.5,
              height: orb.size * 1.5,
              background: `radial-gradient(circle at center, ${orb.color}20 0%, transparent 50%)`,
              top: orb.top, left: orb.left, right: orb.right, bottom: orb.bottom,
              borderRadius: '50%'
            }}
          />
        ))}
      </div>

      {/* 2. Abstract Geometric Grid in Perspective */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60vh',
        background: 'linear-gradient(transparent, rgba(124, 58, 237, 0.05))',
        transform: 'rotateX(70deg) scale(2.5)',
        transformOrigin: 'bottom',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
        maskImage: 'linear-gradient(transparent, black)',
        WebkitMaskImage: 'linear-gradient(transparent, black)'
      }} />

      {/* 3. Floating Orbital Rings & Giant Logo Watermark */}
      <motion.div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transformStyle: 'preserve-3d',
          zIndex: 10,
          pointerEvents: 'none'
        }}
      >
        {/* Giant Logo Watermark */}
        <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '400px', height: '400px',
            marginLeft: '-200px', marginTop: '-200px',
            opacity: 0.15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: 'drop-shadow(0 0 40px rgba(124, 58, 237, 0.4))'
        }}>
            <img 
              src="/logo.png" 
              alt="Zentrack Watermark" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain', 
                borderRadius: '50%'
              }} 
            />
        </div>

        {/* Floating Orbital Rings */}
        <motion.div
          animate={{ rotateZ: 360, rotateX: 20 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '1000px', height: '1000px',
            marginLeft: '-500px', marginTop: '-500px',
            border: '1px solid rgba(124,58,237,0.1)',
            borderRadius: '50%',
            transformStyle: 'preserve-3d',
            transform: 'translateZ(-100px)',
            pointerEvents: 'none'
          }}
        />
        <motion.div
          animate={{ rotateZ: -360, rotateY: 30 }}
          transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '1400px', height: '1400px',
            marginLeft: '-700px', marginTop: '-700px',
            border: '1px dashed rgba(236,72,153,0.08)',
            borderRadius: '50%',
            transformStyle: 'preserve-3d',
            transform: 'translateZ(-200px)',
            pointerEvents: 'none'
          }}
        />
      </motion.div>
    </div>
  );
};
