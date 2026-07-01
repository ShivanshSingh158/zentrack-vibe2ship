import React, { useState, useEffect } from 'react';
import { Download, X, Share, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PWAInstallPrompt: React.FC = () => {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    const mqStandAlone = '(display-mode: standalone)';
    if (window.matchMedia(mqStandAlone).matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // iOS detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    
    if (outcome === 'accepted') {
      setInstallPromptEvent(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Could save this to localStorage if we don't want to show it again for a while
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  useEffect(() => {
    const lastDismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (lastDismissed) {
      const daysSinceDismissed = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) { // Don't show again for 7 days
        setDismissed(true);
      }
    }
  }, []);

  if (isStandalone || dismissed) return null;
  if (!installPromptEvent && !isIOS) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          position: 'fixed',
          bottom: 'calc(40px + env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '420px',
          background: 'rgba(15, 15, 20, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px',
          padding: '1.5rem',
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.03)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <button 
          onClick={handleDismiss}
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'white'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textAlign: 'center', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src="/pwa-192x192.png" alt="logo" style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
            </div>
            <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'white', fontFamily: 'var(--font-display, inherit)', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '-0.02em' }}>
              <Sparkles size={16} color="#fbbf24" fill="#fbbf24" /> New Zentrack
            </h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.01em', fontWeight: 400 }}>
            A fresh update is ready. Install instantly — no data lost.
          </p>
        </div>

        {isIOS ? (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
            To install on iOS: tap <Share size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> <strong>Share</strong> then <strong>Add to Home Screen</strong>.
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleInstallClick}
            style={{
              background: 'linear-gradient(135deg, #a855f7, #ec4899)',
              color: 'white',
              border: 'none',
              borderRadius: '999px',
              padding: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              width: '100%',
              fontSize: '0.95rem',
              boxShadow: '0 8px 25px rgba(168, 85, 247, 0.35)',
              marginTop: '0.25rem',
              letterSpacing: '0.01em'
            }}
          >
            <Zap size={16} fill="white" />
            Install Now
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
