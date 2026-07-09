import React, { useState, useEffect } from 'react';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { LogIn, Loader2, Play, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { seedDemoData } from '../utils/seedDemoData';
import { motion } from 'framer-motion';
import '../styles/landing.css';

interface LoginProps {
  onBack?: () => void;
}

// Build provider ONCE outside the component so it is never recreated on re-render
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/tasks');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/documents');

export const Login: React.FC<LoginProps> = ({ onBack }) => {
  const [isLoading, setIsLoading] = useState(
    () => localStorage.getItem('zen_is_redirecting') === '1'
  );

  useEffect(() => {
    // Failsafe: if redirect result hangs, un-stick the UI after 15s
    if (!isLoading) return;
    const timeout = setTimeout(() => {
      localStorage.removeItem('zen_is_redirecting');
      setIsLoading(false);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  // ─── THE CORRECT POPUP PATTERN ────────────────────────────────────────────
  // signInWithPopup MUST be called synchronously inside the click handler.
  // Firebase opens the popup window as its very FIRST action — before any
  // async work — so Chrome cannot flag it as "not from user gesture".
  // Calling an async function (even without await) before signInWithPopup
  // can break the synchronous user-gesture chain.
  // ─────────────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    setIsLoading(true);

    // ── Immediately signal App.tsx to show loading overlay ────────────────────
    // This switches App to 'authenticating' phase BEFORE the popup opens,
    // so the landing page is fully hidden by the time auth is in progress.
    // The overlay persists until onAuthStateChanged fires with the user.
    window.dispatchEvent(new Event('zen-auth-starting'));

    // Call popup synchronously — no await, no async before this line
    signInWithPopup(auth, googleProvider)
      .then(() => {
        // onAuthStateChanged in App.tsx handles navigation + authPhase → 'authenticated'
      })
      .catch((err) => {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-cancelled-by-user') {
          // Browser blocked the popup — fall back to redirect
          localStorage.setItem('zen_is_redirecting', '1');
          signInWithRedirect(auth, googleProvider).catch(redirectErr => {
            localStorage.removeItem('zen_is_redirecting');
            setIsLoading(false);
            toast.error('Sign-in failed: ' + (redirectErr.message || redirectErr.code));
          });
        } else if (err.code === 'auth/unauthorized-domain') {
          // User cancelled the popup — revert to unauthenticated gracefully
          window.dispatchEvent(new Event('zen-auth-cancelled'));
          setIsLoading(false);
          toast.error('Domain not authorized. Add this site in Firebase Console → Authentication → Settings.', { duration: 10000 });
        } else {
          // Any other error — also revert
          window.dispatchEvent(new Event('zen-auth-cancelled'));
          setIsLoading(false);
          console.error('Sign-in error:', err);
          if (err.code !== 'auth/cancelled-popup-request') {
            toast.error('Sign-in failed: ' + (err.message || err.code), { duration: 8000 });
          }
        }
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
        background: 'rgba(6, 5, 3, 0.55)', 
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
            color: 'rgba(185, 168, 145, 0.70)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            padding: '0.5rem',
            zIndex: 110,
          }}
          whileHover={{ color: 'rgba(235, 224, 204, 1)', x: -3 }}
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
          background: 'rgba(18, 14, 8, 0.88)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(210, 175, 130, 0.14)',
          boxShadow: '0 1px 0 rgba(235, 210, 175, 0.07) inset, 0 32px 72px rgba(0,0,0,0.65)',
        }}
      >
        {/* Animated Brand Logo/Text */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'rgba(235, 224, 204, 0.95)' }}
        >
          <img src="/logo_white.png" alt="ZenTrack Logo" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'brightness(0.9) sepia(0.15)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 400, margin: 0, letterSpacing: '-0.01em' }}>
            ZenTrack
          </h1>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          style={{ color: 'rgba(185, 168, 145, 0.72)', fontSize: '1rem', lineHeight: 1.65, marginBottom: '2.5rem' }}
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
              borderRadius: '0.875rem',
              color: '#1a110a',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'linear-gradient(135deg, #c4956a 0%, #dba87e 50%, #c4956a 100%)',
              backgroundSize: '200% 100%',
              opacity: isLoading ? 0.7 : 1,
              letterSpacing: '0.02em',
            }}
          >
            {isLoading ? <Loader2 size={20} className="spin" /> : <LogIn size={20} />}
            {isLoading ? 'Synchronizing...' : 'Sign in with Google'}
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
              padding: '0.9rem',
              borderRadius: '0.875rem',
              background: 'rgba(196, 149, 106, 0.07)',
              color: 'rgba(185, 168, 145, 0.65)',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid rgba(196, 149, 106, 0.15)',
              transition: 'color 0.2s ease, background 0.2s ease'
            }}
          >
            <Play size={16} />
            Try Demo Mode
          </motion.button>
        </motion.div>

        {/* Info Text */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          style={{ color: 'rgba(140, 124, 104, 0.55)', fontSize: '0.72rem', marginTop: '2.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Secure Google Authentication<br/>
          <span style={{ fontSize: '0.65rem', opacity: 0.75, textTransform: 'none', display: 'block', marginTop: '0.25rem' }}>Gmail · Calendar · Drive · Tasks</span>
        </motion.p>
      </motion.div>
    </motion.div>
  );
};
