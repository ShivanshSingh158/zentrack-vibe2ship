import React, { useState, useEffect } from 'react';
import { X, Share, Sparkles, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const PWAInstallPrompt: React.FC = () => {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const mqStandAlone = '(display-mode: standalone)';
    if (window.matchMedia(mqStandAlone).matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const lastDismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (lastDismissed) {
      const daysSince = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) setDismissed(true);
    }
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') setInstallPromptEvent(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  if (isStandalone || dismissed) return null;
  if (!installPromptEvent && !isIOS) return null;

  return (
    <>
      <style>{`
        @keyframes zen-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes zen-pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(245,184,64,0.25), 0 0 40px rgba(56,189,248,0.1); }
          50% { box-shadow: 0 0 30px rgba(245,184,64,0.4), 0 0 60px rgba(56,189,248,0.2); }
        }
        @keyframes zen-dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        .zen-install-btn {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #f5b840 0%, #f0a820 40%, #38bdf8 100%);
          background-size: 200% auto;
          transition: background-position 0.5s ease, transform 0.2s ease, box-shadow 0.3s ease;
        }
        .zen-install-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: zen-shimmer 2.5s linear infinite;
        }
        .zen-install-btn:hover {
          background-position: right center;
          transform: translateY(-1px);
          box-shadow: 0 12px 32px rgba(245,184,64,0.45), 0 4px 16px rgba(56,189,248,0.2) !important;
        }
        .zen-install-btn:active { transform: scale(0.97) translateY(0); }
      `}</style>

      <AnimatePresence>
        <motion.div
          key="pwa-prompt"
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '92%',
            maxWidth: '400px',
            background: 'rgba(3, 13, 26, 0.85)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(245,184,64,0.2)',
            borderRadius: '20px',
            padding: '1.35rem 1.5rem 1.5rem',
            boxShadow: '0 24px 60px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(245,184,64,0.12) inset',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
            animation: 'zen-pulse-glow 3s ease-in-out infinite',
          }}
        >
          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer',
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.15)';
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            <X size={13} />
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingRight: '1.5rem' }}>
            {/* Logo Badge */}
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(245,184,64,0.15), rgba(56,189,248,0.1))',
              border: '1px solid rgba(245,184,64,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 16px rgba(245,184,64,0.12)',
            }}>
              <img src="/pwa-192x192.png" alt="ZenTrack" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain' }} />
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                <Sparkles size={13} color="#f5b840" fill="#f5b840" />
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#f5b840',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-sans)',
                }}>
                  New Update Ready
                </span>
              </div>
              <h4 style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.95)',
                fontFamily: 'var(--font-display, inherit)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}>
                Install ZenTrack
              </h4>
              <p style={{
                margin: '0.2rem 0 0',
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.4,
              }}>
                Instant access — no data lost
              </p>
            </div>
          </div>

          {/* Action */}
          {isIOS ? (
            <div style={{
              background: 'rgba(56,189,248,0.07)',
              border: '1px solid rgba(56,189,248,0.15)',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <Share size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
              <span>Tap <strong style={{ color: '#38bdf8' }}>Share</strong> → <strong style={{ color: '#38bdf8' }}>Add to Home Screen</strong></span>
            </div>
          ) : (
            <motion.button
              className="zen-install-btn"
              whileTap={{ scale: 0.97 }}
              onClick={handleInstallClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                color: '#030d1a',
                border: 'none',
                borderRadius: '12px',
                padding: '0.85rem 1.25rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                fontSize: '0.92rem',
                boxShadow: '0 8px 24px rgba(245,184,64,0.3)',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.01em',
              }}
            >
              <Download size={16} strokeWidth={2.5} />
              Install Now — Free
            </motion.button>
          )}

          {/* Footer dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '-0.25rem' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: i === 0 ? '#f5b840' : i === 1 ? '#38bdf8' : '#c084fc',
                animation: `zen-dot-pulse 1.6s ease-in-out ${i * 0.3}s infinite`,
              }} />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};
