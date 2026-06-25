import React, { useState, useEffect } from 'react';
import { Network, CheckCircle, Loader2, Calendar, Mail, CheckSquare, Video, FileText, HardDrive, Globe, MessageSquare, Hash, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import LottieModule from 'lottie-react';
import successAnimation from '../../assets/animations/success-confetti.json';

const Lottie = (LottieModule as any).default || LottieModule;

const INTEGRATIONS = [
  { id: 'gcal', name: 'Google Calendar', icon: <Calendar size={24} />, description: 'Full bi-directional sync for tasks and events.', color: '#3b82f6' },
  { id: 'gmail', name: 'Gmail', icon: <Mail size={24} />, description: 'Ghost task detection and email automation.', color: '#ef4444' },
  { id: 'gtasks', name: 'Google Tasks', icon: <CheckSquare size={24} />, description: 'Import and export your task lists.', color: '#10b981' },
  { id: 'gmeet', name: 'Google Meet', icon: <Video size={24} />, description: 'Automatic meeting scheduling.', color: '#f59e0b' },
  { id: 'gdocs', name: 'Google Docs', icon: <FileText size={24} />, description: 'Document creation and context parsing.', color: '#3b82f6' },
  { id: 'gdrive', name: 'Google Drive', icon: <HardDrive size={24} />, description: 'File attachment and organization.', color: '#10b981' },
  { id: 'chrome', name: 'Chrome Extension', icon: <Globe size={24} />, description: 'Task capture from any webpage.', color: '#ef4444' },
  { id: 'whatsapp', name: 'WhatsApp Bot', icon: <MessageSquare size={24} />, description: 'Reminder delivery via chat.', color: '#22c55e' },
  { id: 'slack', name: 'Slack Bot', icon: <Hash size={24} />, description: 'Team task management and alerts.', color: '#ec4899' },
  { id: 'zapier', name: 'Zapier / Make', icon: <Zap size={24} />, description: 'Custom webhooks for everything else.', color: '#f97316' },
];

export const IntegrationsModule: React.FC = () => {
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [showConfetti, setShowConfetti] = useState(false);

  const handleConnectAll = async () => {
    if (connecting) return;
    setConnecting(true);
    setProgress(0);
    setConnectedIds(new Set());
    setShowConfetti(false);

    let currentProgress = 0;
    const newConnected = new Set<string>();

    for (let i = 0; i < INTEGRATIONS.length; i++) {
      const integration = INTEGRATIONS[i];
      // Simulate connection time per service
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      newConnected.add(integration.id);
      setConnectedIds(new Set(newConnected));
      currentProgress = Math.round(((i + 1) / INTEGRATIONS.length) * 100);
      setProgress(currentProgress);
    }

    setConnecting(false);
    setShowConfetti(true);
    toast.success('All Ecosystem Services Connected successfully!');
    
    setTimeout(() => {
      setShowConfetti(false);
    }, 5000);
  };

  const handleConnectSingle = (id: string) => {
    if (connecting) return;
    if (connectedIds.has(id)) {
      setConnectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast('Disconnected integration');
    } else {
      setConnectedIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      toast.success('Integration connected');
    }
  };

  return (
    <div className="learning-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
      {showConfetti && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Lottie animationData={successAnimation} loop={false} style={{ width: 400, height: 400 }} />
        </div>
      )}

      <div className="learning-header" style={{ flexShrink: 0, marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Network size={24} className="logo-icon" /> Ecosystem Integrations
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Connect ZenTrack to your external services for true agentic autonomy.
          </p>
        </div>
        
        <button 
          onClick={handleConnectAll}
          disabled={connecting || connectedIds.size === INTEGRATIONS.length}
          style={{
            background: connecting ? 'var(--bg-surface)' : 'var(--accent-primary)',
            color: connecting ? 'var(--text-muted)' : '#fff',
            border: connecting ? '1px solid var(--border-subtle)' : 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: 'var(--radius-lg)',
            fontSize: '0.95rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: (connecting || connectedIds.size === INTEGRATIONS.length) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: connecting ? 'none' : '0 4px 15px rgba(124, 58, 237, 0.3)',
          }}
        >
          {connecting ? (
            <><Loader2 size={18} className="spin" /> Connecting ({progress}%)...</>
          ) : connectedIds.size === INTEGRATIONS.length ? (
            <><CheckCircle size={18} /> All Connected</>
          ) : (
            <><Zap size={18} /> Connect All Ecosystem Services</>
          )}
        </button>
      </div>

      {connecting && (
        <div style={{ width: '100%', height: '4px', background: 'var(--bg-surface)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <motion.div 
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            style={{ height: '100%', background: 'var(--accent-primary)' }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', alignContent: 'start' }}>
        <AnimatePresence>
          {INTEGRATIONS.map((integration, index) => {
            const isConnected = connectedIds.has(integration.id);
            return (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                style={{
                  background: 'var(--bg-panel)',
                  border: isConnected ? `1px solid ${integration.color}50` : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {isConnected && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: integration.color }} />
                )}
                
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ 
                    padding: '0.75rem', 
                    borderRadius: 'var(--radius-md)', 
                    background: isConnected ? `${integration.color}15` : 'var(--bg-surface)',
                    color: isConnected ? integration.color : 'var(--text-secondary)'
                  }}>
                    {integration.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {integration.name}
                    </h3>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {integration.description}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleConnectSingle(integration.id)}
                    disabled={connecting}
                    style={{
                      background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-surface)',
                      color: isConnected ? '#10b981' : 'var(--text-primary)',
                      border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                      padding: '0.4rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: connecting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      transition: 'all 0.2s',
                      opacity: connecting ? 0.5 : 1
                    }}
                  >
                    {isConnected ? <><CheckCircle size={14} /> Connected</> : 'Connect'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
