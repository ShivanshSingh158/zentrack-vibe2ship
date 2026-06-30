import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, X, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { useGlobalData } from '../contexts/GlobalDataContext';
import { toast } from 'sonner';

/**
 * GoogleWorkspaceBanner
 *
 * Shown when Google Workspace is disconnected (token expired / never connected).
 * The ONLY place that calls connectGoogle() — which opens the OAuth popup.
 * Because this is a button click handler, browsers allow the popup.
 *
 * NEVER trigger connectGoogle() from useEffect, setInterval, or agent code.
 */
export const GoogleWorkspaceBanner: React.FC = () => {
  const { googleStatus, connectGoogle } = useGlobalData() as any;
  const [dismissed, setDismissed] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  // Don't show while still checking (avoids flicker on fast connections)
  // Don't show when connected
  // Don't show when dismissed this session
  const shouldShow = !dismissed && !justConnected && googleStatus === 'disconnected';

  const handleConnect = () => {
    if (isConnecting) return;
    setIsConnecting(true);
    connectGoogle()
      .then(() => {
        setJustConnected(true);
        toast.success('✅ Google Workspace connected! Calendar, Gmail, Drive and Docs are now synced.');
        setTimeout(() => setJustConnected(false), 3000);
      })
      .catch((err: any) => {
        const msg = err?.message || 'Connection failed';
        if (msg.includes('popup-blocked') || msg.includes('popup_closed') || msg.includes('closed')) {
          toast.warning('Popup was closed. Click "Connect Google" again to try.', { duration: 5000 });
        } else if (msg.includes('popup-blocked')) {
          toast.error('Popup blocked by browser. Please allow popups for this site and try again.');
        } else {
          toast.error(`Google connection failed: ${msg}`);
        }
      })
      .finally(() => {
        setIsConnecting(false);
      });
  };

  return (
    <AnimatePresence>
      {(shouldShow || justConnected) && (
        <motion.div
          key="google-workspace-banner"
          initial={{ opacity: 0, y: -60, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -60, height: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          style={{ overflow: 'hidden', zIndex: 950, position: 'relative' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.65rem 1.25rem',
              background: justConnected
                ? 'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.06) 100%)'
                : 'linear-gradient(90deg, rgba(239,68,68,0.10) 0%, rgba(251,146,60,0.06) 100%)',
              borderBottom: justConnected
                ? '1px solid rgba(16,185,129,0.25)'
                : '1px solid rgba(239,68,68,0.2)',
              backdropFilter: 'blur(8px)',
              flexWrap: 'wrap',
            }}
          >
            {/* Left: Icon + Message */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
              {justConnected ? (
                <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              ) : (
                <WifiOff size={16} style={{ color: '#f97316', flexShrink: 0 }} />
              )}
              <span style={{
                fontSize: '0.82rem',
                color: justConnected ? 'rgba(52,211,153,0.95)' : 'rgba(253,186,116,0.95)',
                fontWeight: 500,
                lineHeight: 1.4,
              }}>
                {justConnected
                  ? 'Google Workspace connected — Calendar, Gmail & Drive are fully synced.'
                  : 'Google Workspace is not connected. Connect to enable Calendar sync, Gmail, Drive, Docs and all AI workspace features.'}
              </span>
            </div>

            {/* Right: Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              {!justConnected && (
                <>
                  {/* Connect button — the ONLY place the popup is triggered */}
                  <motion.button
                    id="google-workspace-connect-btn"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(251,146,60,0.4)',
                      background: isConnecting
                        ? 'rgba(251,146,60,0.05)'
                        : 'rgba(251,146,60,0.12)',
                      color: '#fb923c',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: isConnecting ? 0.7 : 1,
                    }}
                  >
                    {isConnecting ? (
                      <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    {isConnecting ? 'Connecting…' : 'Connect Google'}
                  </motion.button>

                  {/* Dismiss for this session */}
                  <button
                    id="google-workspace-banner-dismiss"
                    onClick={() => setDismissed(true)}
                    title="Dismiss"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.4)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
