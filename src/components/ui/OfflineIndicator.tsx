import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * OfflineIndicator — mounts at root level.
 * Shows a persistent amber bar when the network is down.
 * Firestore's offline cache still accepts writes silently; this tells
 * the user their data will sync when connectivity returns.
 */
export const OfflineIndicator = () => {
  const [online, setOnline]       = useState(navigator.onLine);
  const [showBack, setShowBack]   = useState(false); // "back online" flash

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 2500);
    };
    const handleOffline = () => {
      setOnline(false);
      setShowBack(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Nothing to render when fully online
  if (online && !showBack) return null;

  return (
    <>
      <style>{`
        @keyframes oiSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes oiSlideUp {
          from { transform: translateY(0);     opacity: 1; }
          to   { transform: translateY(-100%); opacity: 0; }
        }
        .oi-bar {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          padding: 0.5rem 1rem;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          animation: oiSlideDown 0.3s ease-out;
        }
        .oi-bar.offline {
          background: rgba(245,158,11,0.95);
          color: #1a1400;
          backdrop-filter: blur(8px);
        }
        .oi-bar.reconnected {
          background: rgba(16,185,129,0.95);
          color: #001a0d;
          animation: oiSlideDown 0.3s ease-out, oiSlideUp 0.4s ease-in 2.1s forwards;
        }
      `}</style>

      {!online && (
        <div className="oi-bar offline" role="status" aria-live="polite">
          <WifiOff size={14} />
          You're offline — changes will sync automatically when reconnected
        </div>
      )}

      {online && showBack && (
        <div className="oi-bar reconnected" role="status" aria-live="polite">
          <Wifi size={14} />
          Back online — all changes synced ✓
        </div>
      )}
    </>
  );
};
