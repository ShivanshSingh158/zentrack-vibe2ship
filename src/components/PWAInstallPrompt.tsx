import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
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
          bottom: 'calc(75px + env(safe-area-inset-bottom))', // Just above BottomNav if mobile
          left: '1rem',
          right: '1rem',
          maxWidth: '400px',
          margin: '0 auto',
          background: 'rgba(20, 20, 26, 0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(167, 139, 250, 0.3)',
          borderRadius: '16px',
          padding: '1rem',
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <button 
          onClick={handleDismiss}
          style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #a78bfa 0%, #6366f1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Download size={20} color="white" />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'white' }}>Install ZenTrack</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              Install for faster access and a native app experience.
            </p>
          </div>
        </div>

        {isIOS ? (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
            To install on iOS: tap <Share size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> <strong>Share</strong> then <strong>Add to Home Screen</strong>.
          </div>
        ) : (
          <button
            onClick={handleInstallClick}
            style={{
              background: '#a78bfa',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%'
            }}
          >
            <Download size={16} />
            Install App
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
