import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Trash2, ShieldCheck, Loader2, Bot } from 'lucide-react';
import { requestGeminiToken, deleteUserGeminiKey as deleteUserGeminiToken } from '../../services/userGeminiAuth';
import type { GeminiKeyStatus } from '../../services/userGeminiAuth';
import { signInWithGoogle, signOutGoogle, initGoogleCalendar } from '../../services/googleCalendar';
import { toast } from 'sonner';

/**
 * GeminiAuthModal — Combined modal for:
 *   • Google Workspace OAuth (for Gmail, Calendar, Drive agents)
 *   • Personal Gemini AI OAuth (for private AI quota)
 */
export const GeminiAuthModal: React.FC<{
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
      window.dispatchEvent(new Event('google-token-refreshed'));
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
      window.dispatchEvent(new Event('google-token-disconnected'));
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
