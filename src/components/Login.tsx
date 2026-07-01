import React, { useState, useEffect } from 'react';
import { signInWithRedirect, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { LogIn, Loader2, Play, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { seedDemoData } from '../utils/seedDemoData';
import { motion } from 'framer-motion';
import '../styles/landing.css';

interface LoginProps {
  onBack?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onBack }) => {
  const googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('https://www.googleapis.com/auth/calendar');
  googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
  googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
  googleProvider.addScope('https://www.googleapis.com/auth/documents');
  
  // If we're returning from a Google redirect, show spinner until App.tsx processes it
  const [isLoading, setIsLoading] = useState(
    () => localStorage.getItem('zen_is_redirecting') === '1'
  );

  useEffect(() => {
    // Failsafe: if App.tsx's getRedirectResult hangs for some reason, un-stick after 15s
    if (!isLoading) return;
    const timeout = setTimeout(() => {
      localStorage.removeItem('zen_is_redirecting');
      setIsLoading(false);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  const handleLogin = () => {
    // Use redirect - works universally, never gets popup-blocked
    localStorage.setItem('zen_is_redirecting', '1');
    setIsLoading(true);
    signInWithRedirect(auth, googleProvider).catch(err => {
      localStorage.removeItem('zen_is_redirecting');
      setIsLoading(false);
      console.error('Redirect error:', err);
      toast.error('Sign-in failed: ' + (err.message || err.code));
    });
  };


  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="login-overlay" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 100, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'rgba(5, 15, 30, 0.45)', 
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflow: 'hidden' 
      }}
    >

      {/* Back Button */}
      {onBack && (
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          onClick={onBack}
          style={{
            position: 'absolute',
            top: '2rem',
            left: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.9rem',
            cursor: 'pointer',
            padding: '0.5rem',
            zIndex: 110,
          }}
          whileHover={{ color: '#fff', x: -3 }}
        >
          <ArrowLeft size={18} />
          Back to Home
        </motion.button>
      )}

      {/* Floating Glass Login Card */}
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="liquid-glass"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '3.5rem 2.5rem',
          borderRadius: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
          margin: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255,255,255,0.05)'
        }}
      >
        {/* Animated Brand Logo/Text */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'white' }}
        >
          <img src="/logo_white.png" alt="ZenTrack Logo" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 400, margin: 0, letterSpacing: '0.02em' }}>
            ZenTrack
          </h1>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '2.5rem' }}
        >
          Enter the flow state. Master your tasks, time, and habits with an intelligent companion.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}
        >
          {/* Main Action Button */}
          <motion.button
            onClick={handleLogin}
            disabled={isLoading}
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.98 }}
            className="liquid-glass"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '1.15rem',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.05rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.2)',
              opacity: isLoading ? 0.7 : 1,
              transition: 'background-color 0.3s ease'
            }}
          >
            {isLoading ? <Loader2 size={20} className="spin" /> : <LogIn size={20} />}
            {isLoading ? 'Synchronizing...' : 'Initialize Session'}
          </motion.button>
          
          {/* Secondary Action Button */}
          <motion.button
            onClick={async () => {
              try {
                setIsLoading(true);
                try {
                  await signInWithEmailAndPassword(auth, 'demo@zentrack.com', 'demo123');
                } catch (e: any) {
                  // If the user doesn't exist (or invalid credential), try to create it
                  if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
                    await createUserWithEmailAndPassword(auth, 'demo@zentrack.com', 'demo123');
                  } else {
                    throw e; // Rethrow if it's some other error
                  }
                }
                // Only seed if we successfully logged in or created the account
                await seedDemoData();
              } catch (e: unknown) {
                toast.error('Demo login failed: ' + (e as { message?: string }).message);
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            whileHover={{ scale: 1.02, color: 'rgba(255,255,255,1)' }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '1rem',
              borderRadius: '0.75rem',
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid transparent',
              transition: 'color 0.3s ease'
            }}
          >
            <Play size={16} />
            Try Demo
          </motion.button>
        </motion.div>

        {/* Info Text */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '2.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Secure Google Authentication<br/>
          <span style={{ fontSize: '0.65rem', opacity: 0.7, textTransform: 'none', display: 'block', marginTop: '0.25rem' }}>Requires Gmail, Docs, and Drive API Scopes</span>
        </motion.p>
      </motion.div>
    </motion.div>
  );
};
