import React, { useState } from 'react';
import {
  Network, CheckCircle, Loader2, Calendar, Mail, CheckSquare,
  Video, FileText, HardDrive, Globe, MessageSquare, Hash, Zap,
  WifiOff, RefreshCw, Clock, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { getLastSyncTime } from '../../services/googleCalendar';
import LottieModule from 'lottie-react';
import successAnimation from '../../assets/animations/success-confetti.json';

const Lottie = (LottieModule as any).default || LottieModule;

// Google Workspace services — these are ALL covered by a single OAuth grant
const GOOGLE_SERVICES = [
  { id: 'gcal',   name: 'Google Calendar', icon: <Calendar size={22} />,     description: 'Full bi-directional sync for tasks and events.', color: '#3b82f6' },
  { id: 'gmail',  name: 'Gmail',            icon: <Mail size={22} />,         description: 'Ghost task detection and email automation.',     color: '#ef4444' },
  { id: 'gtasks', name: 'Google Tasks',     icon: <CheckSquare size={22} />,  description: 'Import and export your task lists.',             color: '#10b981' },
  { id: 'gmeet',  name: 'Google Meet',      icon: <Video size={22} />,        description: 'Automatic meeting scheduling and links.',        color: '#f59e0b' },
  { id: 'gdocs',  name: 'Google Docs',      icon: <FileText size={22} />,     description: 'Document creation and context parsing.',        color: '#3b82f6' },
  { id: 'gdrive', name: 'Google Drive',     icon: <HardDrive size={22} />,    description: 'File attachment and organisation.',             color: '#10b981' },
];

// Third-party integrations (future / coming soon)
const THIRD_PARTY = [
  { id: 'chrome',    name: 'Chrome Extension', icon: <Globe size={22} />,       description: 'Task capture from any webpage.',            color: '#ef4444', comingSoon: true },
  { id: 'whatsapp',  name: 'WhatsApp Bot',     icon: <MessageSquare size={22} />, description: 'Reminder delivery via chat.',              color: '#22c55e', comingSoon: true },
  { id: 'slack',     name: 'Slack Bot',        icon: <Hash size={22} />,         description: 'Team task management and alerts.',          color: '#ec4899', comingSoon: true },
  { id: 'zapier',    name: 'Zapier / Make',    icon: <Zap size={22} />,          description: 'Custom webhooks for everything else.',      color: '#f97316', comingSoon: true },
];

function formatLastSync(ts: number): string {
  if (!ts) return 'Never synced';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export const IntegrationsModule: React.FC = () => {
  const { isGoogleConnected, googleStatus, connectGoogle, disconnectGoogle } = useGlobalData() as any;
  const [isConnecting, setIsConnecting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const lastSync = getLastSyncTime();

  const handleConnect = async () => {
    if (isConnecting || isGoogleConnected) return;
    setIsConnecting(true);
    try {
      await connectGoogle();
      setShowConfetti(true);
      toast.success('Google Workspace connected! All services are now synced.');
      setTimeout(() => setShowConfetti(false), 5000);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('popup') || msg.includes('closed')) {
        toast.warning('Popup closed. Click "Connect Google Workspace" to try again.');
      } else {
        toast.error(`Connection failed: ${msg}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectGoogle();
    toast('Google Workspace disconnected.');
  };

  const isChecking = googleStatus === 'checking';

  return (
    <div className="learning-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {showConfetti && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Lottie animationData={successAnimation} loop={false} style={{ width: 400, height: 400 }} />
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="learning-header" style={{ flexShrink: 0, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Network size={24} className="logo-icon" /> Ecosystem Integrations
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Connect ZenTrack to your external services for true agentic autonomy.
            </p>
          </div>

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isChecking ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.9rem', borderRadius: '100px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', fontSize: '0.82rem'
              }}>
                <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                Checking connection…
              </div>
            ) : isGoogleConnected ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.9rem', borderRadius: '100px',
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                color: '#10b981', fontSize: '0.82rem', fontWeight: 600
              }}>
                <CheckCircle size={13} />
                Workspace Connected
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.9rem', borderRadius: '100px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171', fontSize: '0.82rem'
              }}>
                <WifiOff size={13} />
                Not Connected
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '6rem' }}>

        {/* ── Google Workspace Section ──────────────────────────────── */}
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={16} style={{ color: 'var(--accent-primary)' }} />
                Google Workspace
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                One OAuth grant covers all six services below
                {isGoogleConnected && lastSync > 0 && (
                  <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                    · <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Last sync: {formatLastSync(lastSync)}
                  </span>
                )}
              </p>
            </div>

            {/* Master connect / disconnect button — user-initiated popup is allowed here */}
            {!isChecking && (
              isGoogleConnected ? (
                <button
                  id="google-workspace-disconnect-btn"
                  onClick={handleDisconnect}
                  style={{
                    padding: '0.55rem 1.2rem', borderRadius: 'var(--radius-lg)',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171', fontSize: '0.85rem', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    transition: 'all 0.2s',
                  }}
                >
                  <WifiOff size={14} /> Disconnect
                </button>
              ) : (
                <motion.button
                  id="google-workspace-connect-btn"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    padding: '0.55rem 1.4rem', borderRadius: 'var(--radius-lg)',
                    background: isConnecting ? 'var(--bg-surface)' : 'var(--accent-primary)',
                    border: 'none',
                    color: isConnecting ? 'var(--text-muted)' : '#fff',
                    fontSize: '0.9rem', fontWeight: 600,
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    boxShadow: isConnecting ? 'none' : '0 4px 15px rgba(124,58,237,0.3)',
                    transition: 'all 0.2s',
                  }}
                >
                  {isConnecting ? (
                    <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Connecting…</>
                  ) : (
                    <><RefreshCw size={16} /> Connect Google Workspace</>
                  )}
                </motion.button>
              )
            )}
          </div>

          {/* Google service cards */}
          <AnimatePresence>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
              {GOOGLE_SERVICES.map((service, index) => (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  style={{
                    background: 'var(--bg-panel)',
                    border: isGoogleConnected ? `1px solid ${service.color}40` : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'border-color 0.3s',
                  }}
                >
                  {/* Coloured top strip when connected */}
                  <AnimatePresence>
                    {isGoogleConnected && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        exit={{ scaleX: 0 }}
                        style={{
                          position: 'absolute', top: 0, left: 0, right: 0,
                          height: '2px', background: service.color,
                          transformOrigin: 'left',
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <div style={{
                    padding: '0.65rem', borderRadius: 'var(--radius-md)',
                    background: isGoogleConnected ? `${service.color}15` : 'var(--bg-surface)',
                    color: isGoogleConnected ? service.color : 'var(--text-secondary)',
                    flexShrink: 0, transition: 'all 0.3s',
                  }}>
                    {service.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {service.name}
                      </h3>
                      {isChecking && (
                        <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 0.8s linear infinite' }} />
                      )}
                      {!isChecking && isGoogleConnected && (
                        <CheckCircle size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {service.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </section>

        {/* ── Third-party / Future Integrations ────────────────────── */}
        <section>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={16} style={{ color: 'var(--accent-primary)' }} />
            More Integrations
            <span style={{
              fontSize: '0.7rem', fontWeight: 500, padding: '0.15rem 0.5rem',
              borderRadius: '100px', background: 'rgba(124,58,237,0.15)', color: 'var(--accent-primary)',
              letterSpacing: '0.04em'
            }}>Coming Soon</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {THIRD_PARTY.map((integration, index) => (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  opacity: 0.6,
                }}
              >
                <div style={{
                  padding: '0.65rem', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)', flexShrink: 0,
                }}>
                  {integration.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {integration.name}
                    </h3>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 500, padding: '0.1rem 0.4rem',
                      borderRadius: '100px', background: 'var(--bg-surface)',
                      color: 'var(--text-muted)', border: '1px solid var(--border-subtle)'
                    }}>Soon</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {integration.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
