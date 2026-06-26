import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShieldCheck, Loader2, Bot } from 'lucide-react';
import { requestGeminiToken, deleteUserGeminiKey as deleteUserGeminiToken, getKeyStatus } from '../../services/userGeminiAuth';
import type { GeminiKeyStatus } from '../../services/userGeminiAuth';
import { isSignedInToGoogle, signInWithGoogle, signOutGoogle, wasEverConnectedToGoogle, initGoogleCalendar } from '../../services/googleCalendar';
import { toast } from 'sonner';
import { GeminiAuthModal } from './GeminiAuthModal';

/**
 * GeminiAuthBadge — Dual-status pill showing:
 *   • Google Workspace connection (Gmail, Calendar, Drive)
 *   • AI key source (personal quota vs shared pool)
 * 
 * Click to open the combined auth management panel.
 * Listens to gemini-auth-changed and google-token-refreshed events for live updates.
 */
export const GeminiAuthBadge: React.FC = () => {
  const [geminiStatus, setGeminiStatus] = useState<GeminiKeyStatus>(getKeyStatus());
  const [workspaceConnected, setWorkspaceConnected] = useState<boolean>(isSignedInToGoogle());
  const [showPanel, setShowPanel] = useState(false);

  const refresh = useCallback(() => {
    setGeminiStatus(getKeyStatus());
    setWorkspaceConnected(isSignedInToGoogle());
  }, []);

  useEffect(() => {
    refresh();
    // Listen for auth state changes from both systems
    window.addEventListener('gemini-auth-changed', refresh);
    window.addEventListener('google-token-refreshed', refresh);

    // Also poll every 30s to catch token expiry accurately in the UI
    const interval = setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('gemini-auth-changed', refresh);
      window.removeEventListener('google-token-refreshed', refresh);
      clearInterval(interval);
    };
  }, [refresh]);

  // Refresh when panel closes
  useEffect(() => {
    if (!showPanel) refresh();
  }, [showPanel, refresh]);



  return (
    <>
      <style>{`
        @keyframes cyber-pulse-cyan {
          0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(6, 182, 212, 0); }
          100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
        }
        @keyframes cyber-pulse-purple {
          0% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(167, 139, 250, 0); }
          100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0); }
        }
        @keyframes cyber-breath {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        .cyber-badge-container {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          background: rgba(15, 15, 24, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #f0f0f3;
          user-select: none;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        }
        .cyber-badge-container:hover {
          background: rgba(22, 22, 36, 0.8);
          border-color: rgba(139, 92, 246, 0.25);
          box-shadow: 0 0 16px rgba(139, 92, 246, 0.12), 0 4px 14px rgba(0, 0, 0, 0.4);
          transform: translateY(-1px);
        }
        .cyber-badge-container:active {
          transform: translateY(0);
        }
        .cyber-orb {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
          transition: all 0.3s ease;
        }
        .cyber-orb.connected {
          border-color: rgba(6, 182, 212, 0.35);
          background: rgba(6, 182, 212, 0.06);
          animation: cyber-pulse-cyan 3s infinite ease-in-out;
        }
        .cyber-status-dot {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
          border: 1.2px solid #09090b;
        }
        .cyber-separator {
          width: 1px;
          height: 12px;
          background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.15) 20%, rgba(255, 255, 255, 0.15) 80%, transparent);
        }
        .cyber-node {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.05rem 0.25rem;
          border-radius: 4px;
          transition: all 0.3s;
        }
        .cyber-node-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          position: relative;
        }
        .cyber-node-dot.pro {
          background: #c084fc;
          box-shadow: 0 0 6px #c084fc;
          animation: cyber-pulse-purple 2s infinite ease-in-out;
        }
        .cyber-node-dot.shared {
          background: #60a5fa;
          box-shadow: 0 0 5px rgba(96, 165, 250, 0.7);
          animation: cyber-breath 2.5s infinite ease-in-out;
        }
        .cyber-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          transition: color 0.3s;
        }
        .cyber-label.pro {
          color: #c084fc;
          text-shadow: 0 0 6px rgba(192, 132, 252, 0.25);
        }
        .cyber-label.shared {
          color: #94a3b8;
        }
      `}</style>

      <button
        className="cyber-badge-container"
        onClick={() => setShowPanel(true)}
        title={
          workspaceConnected
            ? 'Google Workspace connected (Gmail, Calendar, Drive active)'
            : wasEverConnectedToGoogle()
              ? 'Workspace session expired — click to reconnect'
              : 'Google Workspace not connected — click to sign in'
        }
      >
        {/* Google Workspace Orb */}
        <div className={`cyber-orb ${workspaceConnected ? 'connected' : ''}`}>
          <svg
            width="12" height="12" viewBox="0 0 18 18"
            style={{
              filter: workspaceConnected ? 'none' : 'grayscale(0.8) opacity(0.8)',
              transition: 'filter 0.3s ease',
              flexShrink: 0,
            }}
          >
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {workspaceConnected && <div className="cyber-status-dot" />}
        </div>

        <div className="cyber-separator" />

        {/* AI Quota Node */}
        <div className="cyber-node">
          <div className={`cyber-node-dot ${geminiStatus.hasPersonalKey ? 'pro' : 'shared'}`} />
          <span className={`cyber-label ${geminiStatus.hasPersonalKey ? 'pro' : 'shared'}`}>
            {geminiStatus.hasPersonalKey ? 'Pro AI' : 'Shared AI'}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {showPanel && (
          <GeminiAuthModal
            onClose={() => setShowPanel(false)}
            onChanged={refresh}
            workspaceConnected={workspaceConnected}
            geminiStatus={geminiStatus}
          />
        )}
      </AnimatePresence>
    </>
  );
};


