import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, Database, Lock, EyeOff, Save, Trash2, AlertTriangle, UserCheck, Key } from 'lucide-react';
import { auth, db } from '../../services/firebase';
import { collection, query, where, getDocs, writeBatch, updateDoc, doc } from 'firebase/firestore';
import { useGlobalData } from '../../contexts/GlobalDataContext';

export const SecuritySettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { userPreferences } = useGlobalData();
  const [activeTab, setActiveTab] = useState<'permissions' | 'data'>('permissions');
  const [isWiping, setIsWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  
  // Local state for UI
  const [agentLevel, setAgentLevel] = useState<number>(userPreferences?.defaultPermissionLevel || 1);
  const [ghostDetectorEnabled, setGhostDetectorEnabled] = useState(userPreferences?.ghostDetectorEnabled ?? true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'preferences.defaultPermissionLevel': agentLevel,
        'preferences.ghostDetectorEnabled': ghostDetectorEnabled
      });
      setTimeout(() => {
        setIsSaving(false);
      }, 800);
    } catch (e) {
      console.error(e);
      setIsSaving(false);
    }
  };

  const handleWipeData = async () => {
    if (wipeConfirm !== 'DELETE') return;
    const user = auth.currentUser;
    if (!user) return;
    
    setIsWiping(true);
    try {
      const collectionsToWipe = ['tasks', 'goals', 'habits', 'jobs', 'notes'];
      const batch = writeBatch(db);
      
      for (const colName of collectionsToWipe) {
        const q = query(collection(db, colName), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        snap.forEach(docSnap => batch.delete(docSnap.ref));
      }
      
      await batch.commit();
      window.location.reload(); // Reload to clear contexts
    } catch (e) {
      console.error("Failed to wipe data", e);
      setIsWiping(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        style={{
          width: '600px', maxWidth: '90vw', background: 'var(--bg-panel)',
          borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div style={{ display: 'flex', padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '0.5rem', borderRadius: '12px' }}>
              <ShieldAlert size={24} color="#ef4444" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Security & Privacy</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Manage AI autonomy and your data</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            onClick={() => setActiveTab('permissions')}
            style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'permissions' ? '2px solid #ef4444' : '2px solid transparent', color: activeTab === 'permissions' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Lock size={16} /> Agent Permissions
          </button>
          <button 
            onClick={() => setActiveTab('data')}
            style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'data' ? '2px solid #ef4444' : '2px solid transparent', color: activeTab === 'data' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Database size={16} /> Data & Encryption
          </button>
        </div>

        <div style={{ padding: '2rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {activeTab === 'permissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Agent Autonomy Level */}
              <div>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                  <UserCheck size={18} color="#3b82f6" /> Global Agent Autonomy Level
                </h3>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <input 
                    type="range" 
                    min="1" max="3" 
                    value={agentLevel} 
                    onChange={(e) => setAgentLevel(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#3b82f6', marginBottom: '1.5rem' }}
                  />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ color: agentLevel === 1 ? '#3b82f6' : 'var(--text-muted)', fontWeight: agentLevel === 1 ? 600 : 400 }}>
                      Level 1: Draft-Only (AI requires approval for all external actions like emails/calendar)
                    </div>
                    <div style={{ color: agentLevel === 2 ? '#3b82f6' : 'var(--text-muted)', fontWeight: agentLevel === 2 ? 600 : 400 }}>
                      Level 2: Standard (AI can schedule calendar blocks, but requires approval for emails)
                    </div>
                    <div style={{ color: agentLevel === 3 ? '#ef4444' : 'var(--text-muted)', fontWeight: agentLevel === 3 ? 600 : 400 }}>
                      Level 3: Full Autonomy (AI can negotiate deadlines and send emails independently)
                    </div>
                  </div>
                </div>
              </div>

              {/* Ghost Detector Privacy */}
              <div>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                  <EyeOff size={18} color="#8b5cf6" /> Ghost Detector Privacy
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Enable Background Scanning</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Allow AI to securely scan incoming Gmail & Slack messages for hidden deadlines. Email bodies are never stored.</div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '28px' }}>
                    <input 
                      type="checkbox" 
                      checked={ghostDetectorEnabled} 
                      onChange={(e) => setGhostDetectorEnabled(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }} 
                    />
                    <span style={{ 
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                      backgroundColor: ghostDetectorEnabled ? '#8b5cf6' : '#4b5563', transition: '.4s', borderRadius: '34px' 
                    }}>
                      <span style={{ 
                        position: 'absolute', content: '""', height: '20px', width: '20px', 
                        left: '4px', bottom: '4px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                        transform: ghostDetectorEnabled ? 'translateX(22px)' : 'translateX(0)'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Encryption Info */}
              <div>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                  <Key size={18} color="#10b981" /> Data Protection Status
                </h3>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                    <span style={{ fontWeight: 600 }}>AES-256 Encryption at Rest Enabled</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                    <span style={{ fontWeight: 600 }}>TLS 1.3 Encryption in Transit Active</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                    <span style={{ fontWeight: 600 }}>Firebase App Check Active</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#ef4444' }}>
                  <AlertTriangle size={18} color="#ef4444" /> Danger Zone
                </h3>
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>Full Account Wipe</h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    This action will permanently delete all your tasks, goals, habits, job applications, and AI memory from Firebase. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      placeholder="Type DELETE to confirm" 
                      value={wipeConfirm}
                      onChange={(e) => setWipeConfirm(e.target.value)}
                      style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', flex: 1 }}
                    />
                    <button 
                      onClick={handleWipeData}
                      disabled={wipeConfirm !== 'DELETE' || isWiping}
                      style={{ 
                        padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', 
                        background: wipeConfirm === 'DELETE' ? '#ef4444' : 'rgba(255,255,255,0.1)', 
                        color: 'white', fontWeight: 600, cursor: wipeConfirm === 'DELETE' ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                      }}
                    >
                      {isWiping ? 'Wiping...' : <><Trash2 size={16} /> Wipe Data</>}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {activeTab === 'permissions' && (
          <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              style={{ padding: '0.75rem 2rem', borderRadius: '12px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isSaving ? 'Saving...' : <><Save size={18} /> Save Settings</>}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
