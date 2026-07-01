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
      background: '#05050A' // Deep space dark
    }}>
      {/* 1. Aurora Ambient Orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[
          { color: '#00D4FF', size: 800, top: 'auto', left: '-20%', right: 'auto', bottom: '-20%', duration: 35 }, // Cyan bottom-left
          { color: '#8B5CF6', size: 900, top: '-20%', left: 'auto', right: '-10%', bottom: 'auto', duration: 45 }, // Violet top-right
          { color: '#F59E0B', size: 600, top: '30%', left: '40%', right: 'auto', bottom: 'auto', duration: 55 }  // Amber center
        ].map((orb, i) => (
          <motion.div
            key={i}
            animate={{
              transform: [
                'translate(0px, 0px) scale(1)', 
                'translate(60px, -40px) scale(1.05)', 
                'translate(-40px, 60px) scale(0.95)', 
                'translate(0px, 0px) scale(1)'
              ]
            }}
            transition={{ duration: orb.duration, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              width: orb.size,
              height: orb.size,
              background: `radial-gradient(circle at center, ${orb.color}25 0%, transparent 60%)`,
              top: orb.top, left: orb.left, right: orb.right, bottom: orb.bottom,
              borderRadius: '50%',
              filter: 'blur(80px)'
            }}
          />
        ))}
      </div>
    </div>
  );
};
