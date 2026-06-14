import React, { useState, useEffect } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { LogIn, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

export const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  // Mouse tracking for 3D tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth out the mouse movements
  const springConfig = { damping: 40, stiffness: 150, mass: 1 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  // Map mouse position to rotation degrees (Subtle premium movement)
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-6, 6]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set(clientX / innerWidth - 0.5);
    mouseY.set(clientY / innerHeight - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  useEffect(() => {
    getRedirectResult(auth).then(result => {
      // User signed in via redirect — onAuthStateChanged handles the rest
    }).catch(err => {
      console.error('Redirect sign-in error:', err);
    });
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    const timeout = setTimeout(() => setIsLoading(false), 15000);
    try {
      await signInWithPopup(auth, googleProvider);
      clearTimeout(timeout);
    } catch (error: any) {
      clearTimeout(timeout);
      console.error('Sign-in error:', error);
      if (error.code === 'auth/popup-blocked') {
        toast.info('Popup blocked — trying redirect sign-in instead...', { duration: 5000 });
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr) {
          toast.error('Sign-in failed. Please allow popups for this site.');
        }
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error('This domain is not authorized for sign-in.', { duration: 12000 });
      } else if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        toast.error(error.message || 'Failed to log in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#020203', // Deep space dark
        position: 'relative',
        overflow: 'hidden',
        perspective: '1500px'
      }}
    >
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
              background: `radial-gradient(circle at center, ${orb.color}30 0%, transparent 50%)`,
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
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
        maskImage: 'linear-gradient(transparent, black)',
        WebkitMaskImage: 'linear-gradient(transparent, black)'
      }} />

      {/* 3. The 3D Interactive Core */}
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          zIndex: 10
        }}
      >
        {/* Floating Orbital Rings */}
        <motion.div
          animate={{ rotateZ: 360, rotateX: 20 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '800px', height: '800px',
            marginLeft: '-400px', marginTop: '-400px',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: '50%',
            transformStyle: 'preserve-3d',
            transform: 'translateZ(-100px)',
            pointerEvents: 'none'
          }}
        />
        <motion.div
          animate={{ rotateZ: -360, rotateY: 30 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '1000px', height: '1000px',
            marginLeft: '-500px', marginTop: '-500px',
            border: '1px dashed rgba(236,72,153,0.15)',
            borderRadius: '50%',
            transformStyle: 'preserve-3d',
            transform: 'translateZ(-200px)',
            pointerEvents: 'none'
          }}
        />

        {/* The Glass Prism Card */}
        <div style={{
          width: '580px',
          padding: '5rem 4rem',
          background: 'radial-gradient(circle at center, rgba(15, 10, 25, 0.5) 0%, rgba(10, 10, 15, 0) 80%)',
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transformStyle: 'preserve-3d',
          position: 'relative'
        }}>
          
          {/* Dynamic Light Reflection inside the card */}
          <motion.div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.05) 0%, transparent 60%)',
            pointerEvents: 'none',
            transform: 'translateZ(1px)'
          }} />

          {/* Floating Logo */}
          <motion.div
            style={{
              transform: 'translateZ(40px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '2rem'
            }}
          >
            <img 
              src="/logo.png" 
              alt="Zentrack" 
              style={{ 
                width: 110, 
                height: 110, 
                objectFit: 'cover', 
                borderRadius: '50%',
                boxShadow: '0 0 40px rgba(124,58,237,0.25), inset 0 0 20px rgba(255,255,255,0.1)'
              }} 
            />
          </motion.div>

          {/* Floating Title */}
          <motion.h1
            style={{
              transform: 'translateZ(30px)',
              fontFamily: 'var(--font-display)',
              fontSize: '4.5rem',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              margin: '0 0 1rem 0',
              background: 'linear-gradient(135deg, #fff 0%, #c4b5fd 40%, #a855f7 80%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 10px 30px rgba(124,58,237,0.2)'
            }}
          >
            Zentrack
          </motion.h1>

          {/* Floating Subtitle */}
          <motion.p
            style={{
              transform: 'translateZ(20px)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '1.15rem',
              lineHeight: 1.6,
              marginBottom: '3.5rem',
              maxWidth: '300px',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)'
            }}
          >
            Enter the flow state. Master your tasks, time, and habits.
          </motion.p>

          {/* Floating Button */}
          <motion.button
            onClick={handleLogin}
            disabled={isLoading}
            whileHover={{ scale: 1.05, boxShadow: '0 15px 35px rgba(124,58,237,0.3), inset 0 0 20px rgba(255,255,255,0.3)' }}
            whileTap={{ scale: 0.95 }}
            style={{
              transform: 'translateZ(50px)', // Pops out the most!
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1.2rem 2.5rem',
              borderRadius: '100px',
              background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
              color: '#fff',
              fontSize: '1.1rem',
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(124,58,237,0.2), inset 0 0 10px rgba(255,255,255,0.2)',
              opacity: isLoading ? 0.7 : 1,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {isLoading ? <Loader2 size={20} className="spin" /> : <LogIn size={20} />}
            {isLoading ? 'Synchronizing...' : 'Initialize Session'}
          </motion.button>
          
          {/* Subtle info text */}
          <motion.p 
            style={{ 
              transform: 'translateZ(10px)', 
              color: 'rgba(255,255,255,0.3)', 
              fontSize: '0.75rem', 
              marginTop: '2.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}
          >
            Secure Google Authentication
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
};
