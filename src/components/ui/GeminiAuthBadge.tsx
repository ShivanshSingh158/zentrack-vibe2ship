import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, X, Trash2, ShieldCheck, Loader2, Bot } from 'lucide-react';
import { requestGeminiToken, deleteUserGeminiKey as deleteUserGeminiToken, getKeyStatus } from '../../services/userGeminiAuth';
import type { GeminiKeyStatus } from '../../services/userGeminiAuth';
import { isSignedInToGoogle, signInWithGoogle, signOutGoogle, wasEverConnectedToGoogle, initGoogleCalendar } from '../../services/googleCalendar';
import { toast } from 'sonner';

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

  const wsLabel = workspaceConnected ? 'WORKSPACE ✓' : 'WORKSPACE';
  const aiLabel = geminiStatus.hasPersonalKey ? 'PRO AI' : 'SHARED POOL';

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
            width="10" height="10" viewBox="0 0 18 18"
            style={{
              filter: workspaceConnected ? 'none' : 'grayscale(1) opacity(0.4)',
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
          <AuthManagementPanel
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

/**
 * AuthManagementPanel — Combined panel for:
 *   • Google Workspace OAuth (for Gmail, Calendar, Drive agents)
 *   • Personal Gemini AI OAuth (for private AI quota)
 */
const AuthManagementPanel: React.FC<{
  onClose: () => void;
  onChanged: () => void;
  workspaceConnected: boolean;
  geminiStatus: GeminiKeyStatus;
}> = ({ onClose, onChanged, workspaceConnected, geminiStatus }) => {
  const [signingInWS, setSigningInWS] = useState(false);
  const [signingInAI, setSigningInAI] = useState(false);
  const [wsError, setWsError] = useState('');
  const [aiError, setAiError] = useState('');

  const handleConnectWorkspace = async () => {
    setSigningInWS(true);
    setWsError('');
    try {
      await initGoogleCalendar();
      await signInWithGoogle();
      onChanged();
      toast.success('✅ Google Workspace connected! Gmail, Calendar & Drive agents are active.');
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('popup-blocked') || msg.includes('popup_blocked')) {
        setWsError('Popup blocked — please allow popups for this site and try again.');
      } else if (msg.includes('popup-closed') || msg.includes('cancelled')) {
        setWsError('Sign-in cancelled.');
      } else {
        setWsError(msg || 'Connection failed. Please try again.');
      }
    } finally {
      setSigningInWS(false);
    }
  };

  const handleDisconnectWorkspace = () => {
    signOutGoogle();
    deleteUserGeminiToken();
    onChanged();
    toast.info('Google Workspace disconnected.');
  };

  const handleConnectAI = async () => {
    setSigningInAI(true);
    setAiError('');
    try {
      await requestGeminiToken();
      onChanged();
      toast.success('✅ Personal AI quota connected! Running on your private Google account.');
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('popup-blocked') || msg.includes('popup_blocked')) {
        setAiError('Popup blocked — please allow popups and try again.');
      } else if (msg.includes('popup-closed') || msg.includes('cancelled')) {
        setAiError('Sign-in cancelled.');
      } else {
        setAiError(msg || 'Sign-in failed. Please try again.');
      }
    } finally {
      setSigningInAI(false);
    }
  };

  const handleDisconnectAI = async () => {
    await deleteUserGeminiToken();
    onChanged();
    toast.info('Personal AI quota disconnected. Using shared API pool.');
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5, 5, 8, 0.75)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(10, 10, 15, 0.98), rgba(5, 5, 8, 0.99))',
          border: '1px solid rgba(251, 191, 36, 0.15)',
          borderRadius: '24px',
          padding: '2.2rem',
          width: '460px',
          maxWidth: '95vw',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 50px rgba(6, 182, 212, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px', transition: 'color 0.2s' }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', marginBottom: '0.35rem', letterSpacing: '0.08em', textTransform: 'uppercase', textShadow: '0 0 12px rgba(251, 191, 36, 0.3)' }}>Connection Center</div>
          <div style={{ fontSize: '0.78rem', color: '#a1a1aa', letterSpacing: '0.02em' }}>Manage Google Workspace & AI quota connections</div>
        </div>

        {/* ─── Google Workspace Section ─── */}
        <div style={{
          background: workspaceConnected ? 'rgba(6,182,212,0.06)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${workspaceConnected ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.05)'}`,
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: workspaceConnected ? 'inset 0 0 15px rgba(6,182,212,0.03)' : 'none',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['gmail', 'google-calendar', 'google-drive'].map(svc => (
                <img key={svc}
                  src={`https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${svc}.png`}
                  alt={svc} width="22" height="22"
                  style={{ filter: workspaceConnected ? 'none' : 'grayscale(1) opacity(0.3)', transition: 'all 0.3s' }}
                />
              ))}
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: workspaceConnected ? '#06b6d4' : '#e4e4e7', letterSpacing: '0.01em' }}>
                Google Workspace
              </div>
              <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '1px' }}>Gmail · Calendar · Drive · Docs · Meet</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              {workspaceConnected
                ? <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#06b6d4', background: 'rgba(6,182,212,0.12)', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(6,182,212,0.25)', letterSpacing: '0.04em' }}>● LIVE</span>
                : <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#71717a', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.04em' }}>● OFFLINE</span>
              }
            </div>
          </div>

          {wsError && (
            <div style={{ fontSize: '0.75rem', color: '#fca5a5', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginBottom: '0.85rem', border: '1px solid rgba(239,68,68,0.2)' }}>
              {wsError}
            </div>
          )}

          {workspaceConnected ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: '0.72rem', color: '#a1a1aa', lineHeight: 1.45 }}>
                Agents have direct access to Calendar, Drive & Mail files.
              </div>
              <button
                onClick={handleDisconnectWorkspace}
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: '#f87171', cursor: 'pointer', padding: '0.45rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.2s' }}
              >
                <Trash2 size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWorkspace}
              disabled={signingInWS}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.7rem 1.25rem', borderRadius: '10px', width: '100%',
                border: '1px solid rgba(6,182,212,0.3)',
                background: signingInWS 
                  ? 'rgba(6,182,212,0.04)' 
                  : 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.08))',
                color: '#06b6d4', cursor: signingInWS ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', transition: 'all 0.2s',
                boxShadow: signingInWS ? 'none' : '0 4px 12px rgba(6,182,212,0.05)',
              }}
              onMouseEnter={e => { if(!signingInWS) { e.currentTarget.style.background = 'rgba(6,182,212,0.22)'; e.currentTarget.style.borderColor = 'rgba(6,182,212,0.45)'; } }}
              onMouseLeave={e => { if(!signingInWS) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.08))'; e.currentTarget.style.borderColor = 'rgba(6,182,212,0.3)'; } }}
            >
              {signingInWS ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
              {signingInWS ? 'Establishing Workspace Link...' : 'Link Google Workspace'}
            </button>
          )}
        </div>

        {/* ─── Personal AI Quota Section ─── */}
        <div style={{
          background: geminiStatus.hasPersonalKey ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${geminiStatus.hasPersonalKey ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.05)'}`,
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: geminiStatus.hasPersonalKey ? 'inset 0 0 15px rgba(251,191,36,0.03)' : 'none',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.08))', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={18} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: geminiStatus.hasPersonalKey ? '#fbbf24' : '#e4e4e7', letterSpacing: '0.01em' }}>Personal AI Quota</div>
              <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '1px' }}>Your private Gemini compute budget</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              {geminiStatus.hasPersonalKey
                ? <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(251,191,36,0.25)', letterSpacing: '0.04em' }}>● CONNECTED</span>
                : <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#71717a', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.04em' }}>● SHARED</span>
              }
            </div>
          </div>

          {aiError && (
            <div style={{ fontSize: '0.75rem', color: '#fca5a5', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginBottom: '0.85rem', border: '1px solid rgba(239,68,68,0.2)' }}>
              {aiError}
            </div>
          )}

          {geminiStatus.hasPersonalKey ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: '0.72rem', color: '#a1a1aa', lineHeight: 1.45 }}>
                AI execution speed is optimized via your personal Google developer account.
              </div>
              <button
                onClick={handleDisconnectAI}
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: '#f87171', cursor: 'pointer', padding: '0.45rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.2s' }}
              >
                <Trash2 size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <>
              {signingInAI ? (
                /* Sleek high-tech scanner connecting loader bar */
                <div style={{
                  background: 'rgba(251, 191, 36, 0.05)',
                  border: '1px dashed rgba(251, 191, 36, 0.3)',
                  borderRadius: '10px',
                  padding: '0.8rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>
                    <span>ESTABLISHING NEURAL LINK...</span>
                    <Loader2 size={12} className="spin" style={{ color: '#fbbf24' }} />
                  </div>
                  <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0, top: 0, bottom: 0,
                      background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)',
                      width: '40%',
                      animation: 'scanline-sweep 1.8s infinite ease-in-out',
                    }} />
                  </div>
                  <style>{`
                    @keyframes scanline-sweep {
                      0% { left: -40%; }
                      100% { left: 110%; }
                    }
                  `}</style>
                </div>
              ) : (
                <button
                  onClick={handleConnectAI}
                  disabled={signingInAI}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.7rem 1.25rem', borderRadius: '10px', width: '100%',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.08))',
                    color: '#fbbf24', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(251, 191, 36, 0.05)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251, 191, 36, 0.22)'; e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.45)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.08))'; e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.3)'; }}
                >
                  <Bot size={14} />
                  Connect Personal AI Quota
                </button>
              )}
              <div style={{ fontSize: '0.62rem', color: '#71717a', lineHeight: 1.45, marginTop: '0.6rem', textAlign: 'center', fontFamily: 'var(--font-sans, sans-serif)' }}>
                Runs on your private quota. Sync Workspace to enable instant authentication.
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};
