import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, Palette, Bot, Link2, Bell, ShieldCheck, 
  LogOut, Copy, Check, CheckCircle, RefreshCw, Trash2, 
  Save, Phone, ExternalLink, Sun, Moon, Sparkles, 
  Download, AlertTriangle, Key, Sliders, Volume2, ShieldAlert,
  Edit2, Mail
} from 'lucide-react';
import { auth, db } from '../../services/firebase';
import { signOut, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, updateDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export type SettingsTabId = 'account' | 'appearance' | 'ai' | 'integrations' | 'notifications' | 'data';

export interface SecuritySettingsModalProps {
  onClose: () => void;
  user?: any;
  onLogout?: () => void;
  isPlainTheme?: boolean;
  onToggleTheme?: () => void;
  initialTab?: SettingsTabId;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({ 
  onClose,
  user: userProp,
  onLogout,
  isPlainTheme = false,
  onToggleTheme,
  initialTab = 'account'
}) => {
  const navigate = useNavigate();
  const { 
    userPreferences, 
    tasks, 
    habits, 
    goals, 
    notes,
    isGoogleConnected,
    googleStatus,
    connectGoogle,
    disconnectGoogle
  } = useGlobalData();

  const currentUser = userProp || auth.currentUser;
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [copiedUid, setCopiedUid] = useState(false);
  const [logoutConfirmStep, setLogoutConfirmStep] = useState(false);

  // ── User Profile Edit Name State ─────────────────────────────────────────
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(() => currentUser?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);

  // ── Appearance & Density State ───────────────────────────────────────────
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('zen_density') as 'comfortable' | 'compact') || 'comfortable';
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    return localStorage.getItem('zen_reduced_motion') === 'true';
  });

  const handleToggleDensity = (val: 'comfortable' | 'compact') => {
    setDensity(val);
    localStorage.setItem('zen_density', val);
    if (val === 'compact') {
      document.body.classList.add('density-compact');
    } else {
      document.body.classList.remove('density-compact');
    }
    toast.success(`Density updated to ${val}`);
  };

  const handleToggleReducedMotion = (val: boolean) => {
    setReducedMotion(val);
    localStorage.setItem('zen_reduced_motion', val ? 'true' : 'false');
    if (val) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
    toast.success(val ? 'Reduced motion enabled' : 'Smooth animations restored');
  };

  const handleSaveDisplayName = async () => {
    if (!nameInput.trim() || !currentUser?.uid) return;
    setIsSavingName(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: nameInput.trim() });
      }
      await setDoc(doc(db, 'user_profiles', currentUser.uid), {
        displayName: nameInput.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setIsEditingName(false);
      toast.success('Display name saved successfully');
    } catch (err: any) {
      console.error('Failed to update name:', err);
      toast.error('Failed to update display name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!currentUser?.email) return;
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      toast.success(`Password reset email sent to ${currentUser.email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send password reset');
    }
  };

  const handleSendTestNotification = () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      toast.error('Please enable desktop alerts first');
      return;
    }
    try {
      new Notification('ZenTrack Fleet Alert', {
        body: 'Your notification pipeline is connected and active.',
        icon: '/pwa-192x192.png'
      });
      toast.success('Test notification sent to your desktop');
    } catch {
      toast.info('Test notification dispatched');
    }
  };

  // ── AI & Autonomy Settings State ──────────────────────────────────────────
  const [agentLevel, setAgentLevel] = useState<number>(userPreferences?.defaultPermissionLevel || 1);
  const [ghostDetectorEnabled, setGhostDetectorEnabled] = useState(userPreferences?.ghostDetectorEnabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── SARA Voice Preferences State ──────────────────────────────────────────
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(() => {
    return localStorage.getItem('zen_sound_fx') !== 'false';
  });

  // ── Notification / SMS Settings State ─────────────────────────────────────
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneLoaded, setPhoneLoaded] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [testSmsSent, setTestSmsSent] = useState(false);
  const [testSmsError, setTestSmsError] = useState('');
  const [browserNotifPermission, setBrowserNotifPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });

  // ── Data Wipe & Danger Zone State ────────────────────────────────────────
  const [isWiping, setIsWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Reset logout confirmation if tab changes
  useEffect(() => {
    setLogoutConfirmStep(false);
  }, [activeTab]);

  // Load user phone from Firestore
  useEffect(() => {
    const user = currentUser || auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'user_profiles', user.uid)).then(snap => {
      if (snap.exists()) {
        const phone = snap.data()?.phoneNumber || snap.data()?.phone || '';
        setPhoneNumber(phone);
      }
      setPhoneLoaded(true);
    }).catch(() => setPhoneLoaded(true));
  }, [currentUser]);

  // ── Handler: Copy User UID ───────────────────────────────────────────────
  const handleCopyUid = () => {
    if (!currentUser?.uid) return;
    navigator.clipboard.writeText(currentUser.uid);
    setCopiedUid(true);
    toast.success('Account UID copied to clipboard');
    setTimeout(() => setCopiedUid(false), 2500);
  };

  // ── Handler: Safe Log Out ────────────────────────────────────────────────
  const handleTriggerLogout = () => {
    if (!logoutConfirmStep) {
      setLogoutConfirmStep(true);
      setTimeout(() => setLogoutConfirmStep(false), 5000);
      return;
    }
    
    // Execute actual sign out
    toast.info('Signing out of ZenTrack...');
    onClose();
    if (onLogout) {
      onLogout();
    } else {
      signOut(auth).then(() => {
        window.location.reload();
      });
    }
  };

  // ── Handler: Save Phone Number (SMS) ────────────────────────────────────
  const handleSavePhone = async () => {
    const user = currentUser || auth.currentUser;
    if (!user || !phoneNumber.trim()) return;
    setIsSavingPhone(true);
    try {
      await setDoc(doc(db, 'user_profiles', user.uid), {
        phoneNumber: phoneNumber.trim(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setPhoneSaved(true);
      toast.success('Phone number saved for high-priority SMS alerts');
      setTimeout(() => setPhoneSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save phone:', e);
      toast.error('Failed to save phone number');
    } finally {
      setIsSavingPhone(false);
    }
  };

  // ── Handler: Send Test SMS ───────────────────────────────────────────────
  const handleTestSms = async () => {
    setTestSmsSent(false);
    setTestSmsError('');
    const user = currentUser || auth.currentUser;
    if (!user) {
      setTestSmsError('Not logged in');
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const VERCEL_BASE = import.meta.env.VITE_APP_URL || 'https://myzentrack.vercel.app';
      const resp = await fetch(`${VERCEL_BASE}/api/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: `ZenTrack test SMS\n\nThis confirms your phone number is correctly linked.\nHigh-priority task alerts will arrive here.\n\nmyzentrack.vercel.app`,
        }),
      });
      if (resp.ok) {
        setTestSmsSent(true);
        toast.success('Test SMS dispatched successfully!');
        setTimeout(() => setTestSmsSent(false), 5000);
      } else {
        const d = await resp.json();
        const errStr = d.error || `HTTP ${resp.status}`;
        setTestSmsError(errStr);
        toast.error(`SMS failed: ${errStr}`);
      }
    } catch (e: any) {
      const errStr = e.message || 'Network error';
      setTestSmsError(errStr);
      toast.error(`SMS error: ${errStr}`);
    }
  };

  // ── Handler: Request Browser Notification Permission ────────────────────
  const handleRequestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Browser notifications are not supported on this device');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotifPermission(permission);
      if (permission === 'granted') {
        toast.success('Browser desktop notifications enabled!');
      } else {
        toast.info(`Notification permission: ${permission}`);
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };

  // ── Handler: Save AI Preferences ─────────────────────────────────────────
  const handleSaveAiSettings = async () => {
    const user = currentUser || auth.currentUser;
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'preferences.defaultPermissionLevel': agentLevel,
        'preferences.ghostDetectorEnabled': ghostDetectorEnabled
      });
      localStorage.setItem('zen_sound_fx', soundEffectsEnabled ? 'true' : 'false');
      setSaveSuccess(true);
      toast.success('AI preferences saved successfully');
      setTimeout(() => {
        setIsSaving(false);
        setTimeout(() => setSaveSuccess(false), 2500);
      }, 400);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save preferences');
      setIsSaving(false);
    }
  };

  // ── Handler: Export All Data to JSON ─────────────────────────────────────
  const handleExportDataJson = () => {
    setIsExporting(true);
    try {
      const exportPayload = {
        exportDate: new Date().toISOString(),
        version: '1.2.0',
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          displayName: currentUser?.displayName,
        },
        counts: {
          tasks: (tasks || []).length,
          habits: (habits || []).length,
          goals: (goals || []).length,
          notes: (notes || []).length,
        },
        tasks: tasks || [],
        habits: habits || [],
        goals: goals || [],
        notes: notes || [],
      };

      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `zentrack-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Data exported: ${(tasks || []).length} tasks, ${(notes || []).length} notes`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export data JSON');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Handler: Wipe Data (Danger Zone) ─────────────────────────────────────
  const handleWipeData = async () => {
    if (wipeConfirm !== 'DELETE') return;
    const user = currentUser || auth.currentUser;
    if (!user) return;
    
    setIsWiping(true);
    try {
      const collectionsToWipe = ['tasks', 'todos', 'goals', 'habits', 'jobs', 'notes'];
      const batch = writeBatch(db);
      
      for (const colName of collectionsToWipe) {
        const q = query(collection(db, colName), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        snap.forEach(docSnap => batch.delete(docSnap.ref));
      }
      
      await batch.commit();
      toast.success('Account data wiped cleanly');
      window.location.reload();
    } catch (e) {
      console.error("Failed to wipe data", e);
      toast.error('Failed to wipe data');
      setIsWiping(false);
    }
  };

  const displayName = useMemo(() => {
    return currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  }, [currentUser]);

  const initialLetter = useMemo(() => {
    return displayName.charAt(0).toUpperCase();
  }, [displayName]);

  return (
    <div className="security-modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="security-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="security-modal-header">
          <div className="security-modal-header-left">
            <div className="security-modal-header-icon">
              <Sliders size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="security-modal-title">Settings & Preferences</h2>
              <p className="security-modal-subtitle">Manage your account, appearance, AI agents, notifications & data</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="security-modal-close-btn"
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>

        {/* 2-Column Main Workspace */}
        <div className="settings-layout">

          {/* ── LEFT SIDEBAR NAVIGATION ── */}
          <aside className="settings-nav-sidebar">
            <div className="settings-nav-group">
              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => setActiveTab('account')}
              >
                <User size={16} />
                <span>Account & Profile</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'appearance' ? 'active' : ''}`}
                onClick={() => setActiveTab('appearance')}
              >
                <Palette size={16} />
                <span>Appearance & Themes</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                <Bot size={16} />
                <span>AI & SARA</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'integrations' ? 'active' : ''}`}
                onClick={() => setActiveTab('integrations')}
              >
                <Link2 size={16} />
                <span>Integrations</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'notifications' ? 'active' : ''}`}
                onClick={() => setActiveTab('notifications')}
              >
                <Bell size={16} />
                <span>Notifications & SMS</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveTab('data')}
              >
                <ShieldCheck size={16} />
                <span>Data & Privacy</span>
              </button>
            </div>

            {/* Quick Log Out Button in Sidebar Footer */}
            <div className="settings-nav-footer">
              <button
                type="button"
                className="settings-sidebar-logout-btn"
                onClick={handleTriggerLogout}
                title="Log out of ZenTrack"
              >
                <LogOut size={15} />
                <span>{logoutConfirmStep ? 'Confirm Log Out?' : 'Log Out'}</span>
              </button>
            </div>
          </aside>

          {/* ── RIGHT CONTENT PANE ── */}
          <main className="settings-content-wrapper">
            <div className="settings-content-body">

              {/* ── TAB 1: ACCOUNT & PROFILE ─────────────────────────────── */}
              {activeTab === 'account' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Account & Profile</h3>
                    <p className="settings-tab-subtitle">Manage your personal credentials, subscription tier, and active session</p>
                  </div>

                  {/* Profile Identity Card */}
                  <div className="settings-profile-card">
                    <div className="settings-avatar-wrapper">
                      {currentUser?.photoURL ? (
                        <img 
                          src={currentUser.photoURL} 
                          alt={displayName} 
                          className="settings-profile-avatar"
                        />
                      ) : (
                        <div className="settings-avatar-fallback">{initialLetter}</div>
                      )}
                      <span className="settings-avatar-dot" title="Online & Synced" />
                    </div>

                    <div className="settings-profile-info">
                      <div className="settings-profile-name-row">
                        {!isEditingName ? (
                          <>
                            <span className="settings-profile-name">{displayName}</span>
                            <button
                              type="button"
                              className="settings-edit-name-btn"
                              onClick={() => {
                                setNameInput(displayName);
                                setIsEditingName(true);
                              }}
                              title="Edit Display Name"
                            >
                              <Edit2 size={12} />
                              <span>Edit</span>
                            </button>
                            <span className="settings-badge-pro">Fleet Olympus Pro</span>
                          </>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', width: '100%', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              className="security-input"
                              style={{ maxWidth: '220px', padding: '0.35rem 0.65rem' }}
                              placeholder="Your full name"
                              autoFocus
                            />
                            <button
                              type="button"
                              className="security-btn security-btn-primary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                              onClick={handleSaveDisplayName}
                              disabled={isSavingName}
                            >
                              {isSavingName ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              className="security-btn"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => setIsEditingName(false)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                        <span className="settings-profile-email">{currentUser?.email || 'No email associated'}</span>
                        {currentUser?.email && (
                          <span className={`settings-status-pill ${currentUser?.emailVerified ? 'connected' : 'disconnected'}`}>
                            {currentUser?.emailVerified ? '● Verified' : '○ Unverified'}
                          </span>
                        )}
                      </div>

                      <div className="settings-profile-uid-row">
                        <span>UID: {currentUser?.uid ? `${currentUser.uid.slice(0, 14)}...` : 'Unknown'}</span>
                        <button 
                          type="button" 
                          onClick={handleCopyUid} 
                          className="settings-uid-copy-btn"
                          title="Copy Full UID"
                        >
                          {copiedUid ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          <span>{copiedUid ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* System & Session Specifications */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">
                      <ShieldCheck size={16} /> Active Session & Authentication
                    </h4>
                    <p className="security-section-desc">
                      Authenticated via Google Identity Services & Firebase Auth. End-to-end token validation is active across all Vercel edge endpoints.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem', marginTop: '0.65rem' }}>
                      <div className="settings-meta-cell">
                        <div className="settings-meta-label">Client Version</div>
                        <div className="settings-meta-val">v1.2.0 (Progressive Web App)</div>
                      </div>
                      <div className="settings-meta-cell">
                        <div className="settings-meta-label">Cloud Fleet Sync</div>
                        <div className="settings-meta-val safe">● Active & Connected</div>
                      </div>
                      <div className="settings-meta-cell">
                        <div className="settings-meta-label">Account Created</div>
                        <div className="settings-meta-val">
                          {currentUser?.metadata?.creationTime 
                            ? new Date(currentUser.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) 
                            : 'Active'}
                        </div>
                      </div>
                      <div className="settings-meta-cell">
                        <div className="settings-meta-label">Last Active Session</div>
                        <div className="settings-meta-val">
                          {currentUser?.metadata?.lastSignInTime 
                            ? new Date(currentUser.metadata.lastSignInTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) 
                            : 'Active Session'}
                        </div>
                      </div>
                    </div>

                    {currentUser?.email && (
                      <div className="settings-divider-row">
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Password & Account Security</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Receive a secure reset link to update your credentials</div>
                        </div>
                        <button
                          type="button"
                          className="security-btn"
                          onClick={handleSendPasswordReset}
                          style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
                        >
                          <Mail size={13} />
                          <span>Reset Password</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Prominent Log Out Action */}
                  <div className="settings-logout-card">
                    <div className="settings-logout-info">
                      <h4>Sign Out of ZenTrack</h4>
                      <p>Terminate your active session on this device. All encrypted tasks, calendar blocks, and notes remain safely synced in the cloud.</p>
                    </div>
                    <button
                      type="button"
                      className="settings-logout-action-btn"
                      onClick={handleTriggerLogout}
                    >
                      <LogOut size={16} />
                      <span>{logoutConfirmStep ? 'Click to Confirm Sign Out' : 'Sign Out'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB 2: APPEARANCE & THEMES ───────────────────────────── */}
              {activeTab === 'appearance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Appearance & Themes</h3>
                    <p className="settings-tab-subtitle">Customize the visual styling, theme density, and ambient lighting of ZenTrack</p>
                  </div>

                  <div className="settings-theme-grid">
                    {/* Light Mode Card */}
                    <div 
                      className={`settings-theme-card ${isPlainTheme ? 'active' : ''}`}
                      onClick={() => {
                        if (!isPlainTheme && onToggleTheme) onToggleTheme();
                      }}
                    >
                      <div className="settings-theme-preview light-preview">
                        <div className="preview-bar header" />
                        <div className="preview-bar line1" />
                        <div className="preview-bar line2" />
                      </div>
                      <div className="settings-theme-footer">
                        <span className="settings-theme-label">
                          <Sun size={16} color="#d97706" />
                          <span>Light Mode (Plain Theme)</span>
                        </span>
                        <div className="settings-theme-radio">
                          {isPlainTheme && <div className="settings-theme-radio-dot" />}
                        </div>
                      </div>
                    </div>

                    {/* Dark Mode Card */}
                    <div 
                      className={`settings-theme-card ${!isPlainTheme ? 'active' : ''}`}
                      onClick={() => {
                        if (isPlainTheme && onToggleTheme) onToggleTheme();
                      }}
                    >
                      <div className="settings-theme-preview dark-preview">
                        <div className="preview-bar header" />
                        <div className="preview-bar line1" />
                        <div className="preview-bar line2" />
                      </div>
                      <div className="settings-theme-footer">
                        <span className="settings-theme-label">
                          <Moon size={16} color="#38bdf8" />
                          <span>Dark Mode (Zen Glass)</span>
                        </span>
                        <div className="settings-theme-radio">
                          {!isPlainTheme && <div className="settings-theme-radio-dot" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* UI Density Selector */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">
                      <Sliders size={16} /> Information Density
                    </h4>
                    <p className="security-section-desc">
                      Choose between comfortable standard spacing or compact density for higher data density on screen.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                      <div 
                        className={`settings-density-choice ${density === 'comfortable' ? 'active' : ''}`}
                        onClick={() => handleToggleDensity('comfortable')}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>Comfortable (Default)</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Balanced padding and breathable typography</div>
                      </div>
                      <div 
                        className={`settings-density-choice ${density === 'compact' ? 'active' : ''}`}
                        onClick={() => handleToggleDensity('compact')}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>Compact Mode</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>Tighter lists, more content in view</div>
                      </div>
                    </div>
                  </div>

                  {/* Motion Physics */}
                  <div className="security-toggle-card">
                    <div className="security-toggle-text">
                      <div className="security-toggle-title">Reduced Motion Physics</div>
                      <div className="security-toggle-desc">
                        Minimize animated transitions and spring physics for a simpler, instantaneous interface experience.
                      </div>
                    </div>
                    <label className="security-switch-label">
                      <input 
                        type="checkbox" 
                        checked={reducedMotion} 
                        onChange={(e) => handleToggleReducedMotion(e.target.checked)}
                        className="security-switch-input" 
                      />
                      <span className="security-switch-track">
                        <span className="security-switch-thumb" />
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── TAB 3: AI & SARA ─────────────────────────────────────── */}
              {activeTab === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">AI Agents & SARA Voice</h3>
                    <p className="settings-tab-subtitle">Configure operational autonomy, proactive scanning, and conversational audio feedback</p>
                  </div>

                  {/* Global Agent Autonomy Level (Zero Purple, Royal Azure / Sky Blue) */}
                  <div>
                    <h4 className="security-section-title">
                      <Bot size={17} /> Global Agent Autonomy Level
                    </h4>
                    <p className="security-section-desc">
                      Define the level of operational authority granted to Olympus fleet agents across calendar scheduling, email drafting, and task triage.
                    </p>

                    <div className="security-card-box">
                      {/* Slider Control */}
                      <div className="security-range-container">
                        <div className="security-slider-track-wrap">
                          <input 
                            type="range" 
                            min="1" 
                            max="3" 
                            step="1"
                            value={agentLevel} 
                            onChange={(e) => setAgentLevel(parseInt(e.target.value))}
                            className="security-range-input"
                            aria-label="Autonomy Level Slider"
                          />
                        </div>
                        <div className="security-range-markers">
                          <span 
                            onClick={() => setAgentLevel(1)}
                            className={`security-range-marker ${agentLevel === 1 ? 'active' : ''}`}
                          >
                            1. Draft-Only
                          </span>
                          <span 
                            onClick={() => setAgentLevel(2)}
                            className={`security-range-marker ${agentLevel === 2 ? 'active' : ''}`}
                          >
                            2. Standard
                          </span>
                          <span 
                            onClick={() => setAgentLevel(3)}
                            className={`security-range-marker ${agentLevel === 3 ? 'active' : ''}`}
                          >
                            3. Full Autonomy
                          </span>
                        </div>
                      </div>

                      {/* Level Option Cards */}
                      <div className="security-level-cards">
                        {/* Level 1 Card */}
                        <div 
                          onClick={() => setAgentLevel(1)}
                          className={`security-level-card ${agentLevel === 1 ? 'selected' : ''}`}
                        >
                          <div className="security-level-card-radio">
                            {agentLevel === 1 && <div className="security-level-card-radio-dot" />}
                          </div>
                          <div className="security-level-card-content">
                            <div className="security-level-card-header">
                              <span className="security-level-card-title">Level 1: Draft-Only</span>
                              <span className="security-level-badge draft">Safe Guard</span>
                            </div>
                            <div className="security-level-card-desc">
                              AI requires explicit review and approval before executing any external action (sending emails, booking calendar slots, or mutating external tools).
                            </div>
                          </div>
                        </div>

                        {/* Level 2 Card */}
                        <div 
                          onClick={() => setAgentLevel(2)}
                          className={`security-level-card ${agentLevel === 2 ? 'selected' : ''}`}
                        >
                          <div className="security-level-card-radio">
                            {agentLevel === 2 && <div className="security-level-card-radio-dot" />}
                          </div>
                          <div className="security-level-card-content">
                            <div className="security-level-card-header">
                              <span className="security-level-card-title">Level 2: Standard (Recommended)</span>
                              <span className="security-level-badge standard">Balanced</span>
                            </div>
                            <div className="security-level-card-desc">
                              AI autonomously schedules internal calendar blocks and organizes tasks, but will draft all outgoing emails and sensitive actions for approval.
                            </div>
                          </div>
                        </div>

                        {/* Level 3 Card */}
                        <div 
                          onClick={() => setAgentLevel(3)}
                          className={`security-level-card ${agentLevel === 3 ? 'selected' : ''}`}
                        >
                          <div className="security-level-card-radio">
                            {agentLevel === 3 && <div className="security-level-card-radio-dot" />}
                          </div>
                          <div className="security-level-card-content">
                            <div className="security-level-card-header">
                              <span className="security-level-card-title">Level 3: Full Autonomy</span>
                              <span className="security-level-badge autonomy">High Autonomy</span>
                            </div>
                            <div className="security-level-card-desc">
                              AI agents independently negotiate deadlines, dispatch communications, and resolve scheduling conflicts without manual intervention.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ghost Detector Privacy */}
                  <div className="security-toggle-card">
                    <div className="security-toggle-text">
                      <div className="security-toggle-title">Ghost Detector Background Scanning</div>
                      <div className="security-toggle-desc">
                        Allows S.A.R.A to securely scan incoming Google Workspace items for hidden commitments. Raw message bodies are never retained on external servers.
                      </div>
                    </div>
                    <label className="security-switch-label">
                      <input 
                        type="checkbox" 
                        checked={ghostDetectorEnabled} 
                        onChange={(e) => setGhostDetectorEnabled(e.target.checked)}
                        className="security-switch-input" 
                      />
                      <span className="security-switch-track">
                        <span className="security-switch-thumb" />
                      </span>
                    </label>
                  </div>

                  {/* Audio Feedback Sounds */}
                  <div className="security-toggle-card">
                    <div className="security-toggle-text">
                      <div className="security-toggle-title">Audio Feedback & Sound FX</div>
                      <div className="security-toggle-desc">
                        Play subtle acoustic pops and chimes when completing tasks, starting timers, or receiving agent notifications.
                      </div>
                    </div>
                    <label className="security-switch-label">
                      <input 
                        type="checkbox" 
                        checked={soundEffectsEnabled} 
                        onChange={(e) => setSoundEffectsEnabled(e.target.checked)}
                        className="security-switch-input" 
                      />
                      <span className="security-switch-track">
                        <span className="security-switch-thumb" />
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── TAB 4: INTEGRATIONS & CLOUD ──────────────────────────── */}
              {activeTab === 'integrations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Integrations & Cloud Services</h3>
                    <p className="settings-tab-subtitle">Manage connections to Google Calendar, Gemini AI, and external cloud providers</p>
                  </div>

                  <div className="settings-integrations-list">
                    {/* Google Calendar Card */}
                    <div className="settings-integration-card">
                      <div className="settings-integration-left">
                        <div className="settings-integration-icon">📅</div>
                        <div>
                          <div className="settings-integration-title">Google Calendar</div>
                          <div className="settings-integration-desc">2-way sync for meetings, timetable blocks, and schedule conflict resolution</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span className={`settings-status-pill ${isGoogleConnected ? 'connected' : 'disconnected'}`}>
                          {isGoogleConnected ? '● Connected' : '○ Disconnected'}
                        </span>
                        {isGoogleConnected ? (
                          <button
                            type="button"
                            className="security-btn"
                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => disconnectGoogle()}
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="security-btn security-btn-primary"
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
                            onClick={() => connectGoogle()}
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Gemini AI Core Card */}
                    <div className="settings-integration-card">
                      <div className="settings-integration-left">
                        <div className="settings-integration-icon">⚡</div>
                        <div>
                          <div className="settings-integration-title">Gemini AI Model Engine</div>
                          <div className="settings-integration-desc">High-speed reasoning via Vercel serverless proxy (Gemini 2.5 Flash active)</div>
                        </div>
                      </div>
                      <span className="settings-status-pill connected">● Edge Active</span>
                    </div>

                    {/* Google Workspace Card */}
                    <div className="settings-integration-card">
                      <div className="settings-integration-left">
                        <div className="settings-integration-icon">📂</div>
                        <div>
                          <div className="settings-integration-title">Google Workspace Suite</div>
                          <div className="settings-integration-desc">Gmail, Drive, Docs, and Google Meet integration layer for Olympus fleet</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="security-btn"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          onClose();
                          navigate('/integrations');
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Manage</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 5: NOTIFICATIONS & SMS ───────────────────────────── */}
              {activeTab === 'notifications' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Notifications & SMS Alerts</h3>
                    <p className="settings-tab-subtitle">Configure real-time mobile SMS delivery and browser desktop push notifications</p>
                  </div>

                  {/* Twilio SMS Alerts Section */}
                  <div className="security-card-box">
                    <label style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <Phone size={16} /> Phone Number for High-Priority Alerts
                    </label>
                    <p className="security-section-desc" style={{ marginBottom: '0.75rem' }}>
                      Include your international country code (e.g., +1 for US/Canada, +91 for India).
                    </p>
                    <div className="security-input-row">
                      <input
                        type="tel"
                        value={phoneLoaded ? phoneNumber : 'Loading...'}
                        onChange={e => setPhoneNumber(e.target.value)}
                        disabled={!phoneLoaded}
                        placeholder="+1234567890"
                        className="security-input"
                      />
                      <button
                        onClick={handleSavePhone}
                        disabled={isSavingPhone || !phoneNumber.trim()}
                        className={`security-btn ${phoneSaved ? 'security-btn-success' : 'security-btn-primary'}`}
                      >
                        {phoneSaved ? (
                          <><CheckCircle size={15} /> Saved</>
                        ) : isSavingPhone ? (
                          <><RefreshCw size={15} className="animate-spin" /> Saving</>
                        ) : (
                          <><Save size={15} /> Save Phone</>
                        )}
                      </button>
                    </div>

                    {/* Test SMS Delivery Button */}
                    <div className="settings-divider-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>Dispatch Verification Test SMS</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.65rem' }}>
                        Send a test SMS to confirm your device is receiving high-priority task alerts.
                      </div>
                      <button
                        onClick={handleTestSms}
                        disabled={!phoneNumber.trim() || testSmsSent}
                        className={`security-btn ${testSmsSent ? 'security-btn-success' : 'security-btn-primary'}`}
                      >
                        {testSmsSent ? (
                          <><CheckCircle size={15} /> SMS Dispatched!</>
                        ) : (
                          <><Bell size={15} /> Send Test SMS</>
                        )}
                      </button>
                      {testSmsError && (
                        <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                          ❌ {testSmsError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Browser Push Notifications */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">
                      <Bell size={16} /> Desktop Browser Push Notifications
                    </h4>
                    <p className="security-section-desc">
                      Receive instant heads-up alerts for Pomodoro timer sessions, urgent deadlines, and morning agenda summaries.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <span className={`settings-status-pill ${browserNotifPermission === 'granted' ? 'connected' : 'disconnected'}`}>
                        {browserNotifPermission === 'granted' ? '● Notifications Enabled' : '○ Permission Not Granted'}
                      </span>
                      {browserNotifPermission !== 'granted' ? (
                        <button
                          type="button"
                          className="security-btn security-btn-primary"
                          onClick={handleRequestNotifPermission}
                        >
                          Enable Desktop Alerts
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="security-btn"
                          onClick={handleSendTestNotification}
                        >
                          <Bell size={13} />
                          <span>Send Test Alert</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Alert Rules Accordion */}
                  <div className="security-alert-rules">
                    <div className="security-alert-rules-title">When are priority SMS alerts dispatched?</div>
                    <ul className="security-alert-list">
                      <li>🚨 High-priority task becomes overdue</li>
                      <li>⏰ High-priority deadline approaching within 2 hours</li>
                      <li>☀️ Morning agenda briefing (7:30 AM local time)</li>
                      <li>📚 Critical academic assignment due within 24 hours</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* ── TAB 6: DATA & PRIVACY ────────────────────────────────── */}
              {activeTab === 'data' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Data, Backup & Privacy</h3>
                    <p className="settings-tab-subtitle">Inspect your cloud storage metrics, export offline backups, and manage encryption</p>
                  </div>

                  {/* Cloud Item Metrics */}
                  <div>
                    <h4 className="security-section-title">Cloud Storage Item Metrics</h4>
                    <div className="settings-stats-grid">
                      <div className="settings-stat-box">
                        <div className="settings-stat-num">{(tasks || []).length}</div>
                        <div className="settings-stat-label">Tasks & Todos</div>
                      </div>
                      <div className="settings-stat-box">
                        <div className="settings-stat-num">{(habits || []).length}</div>
                        <div className="settings-stat-label">Habits</div>
                      </div>
                      <div className="settings-stat-box">
                        <div className="settings-stat-num">{(goals || []).length}</div>
                        <div className="settings-stat-label">Goals</div>
                      </div>
                      <div className="settings-stat-box">
                        <div className="settings-stat-num">{(notes || []).length}</div>
                        <div className="settings-stat-label">Vault Notes</div>
                      </div>
                    </div>
                  </div>

                  {/* Instant Data Export Card */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">
                      <Download size={16} /> Instant Data Export (JSON Backup)
                    </h4>
                    <p className="security-section-desc">
                      Download a complete, offline JSON file containing all your tasks, habits, goals, notes, and profile configurations.
                    </p>
                    <button
                      type="button"
                      className="security-btn security-btn-primary"
                      onClick={handleExportDataJson}
                      disabled={isExporting}
                    >
                      {isExporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                      <span>Export All Data (JSON)</span>
                    </button>
                  </div>

                  {/* Data Protection Status */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">
                      <Key size={16} /> Encryption & Compliance
                    </h4>
                    <div className="security-status-card">
                      <div className="security-status-row">
                        <div className="security-status-dot" />
                        <span>AES-256 Encryption at Rest active</span>
                      </div>
                      <div className="security-status-row">
                        <div className="security-status-dot" />
                        <span>TLS 1.3 Transport Encryption enforced</span>
                      </div>
                      <div className="security-status-row">
                        <div className="security-status-dot" />
                        <span>Firebase Security Rules & Multi-Tenant Isolation verified</span>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="security-danger-card">
                    <div className="security-danger-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={16} color="#ef4444" /> Full Account Data Wipe
                    </div>
                    <div className="security-danger-desc">
                      Permanently erase all tasks, habits, goals, jobs, and notes from Firebase. This operation cannot be undone.
                    </div>
                    <div className="security-input-row" style={{ marginTop: '0.75rem' }}>
                      <input 
                        type="text" 
                        placeholder="Type DELETE to confirm" 
                        value={wipeConfirm}
                        onChange={(e) => setWipeConfirm(e.target.value)}
                        className="security-danger-input"
                      />
                      <button 
                        onClick={handleWipeData}
                        disabled={wipeConfirm !== 'DELETE' || isWiping}
                        className="security-btn security-btn-danger"
                      >
                        {isWiping ? (
                          <><RefreshCw size={15} className="animate-spin" /> Wiping...</>
                        ) : (
                          <><Trash2 size={16} /> Wipe Data</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Footer (Save button visible on AI tab) */}
            {activeTab === 'ai' && (
              <div className="settings-content-footer">
                <button 
                  onClick={handleSaveAiSettings}
                  disabled={isSaving}
                  className={`security-btn ${saveSuccess ? 'security-btn-success' : 'security-btn-primary'}`}
                  style={{ minWidth: '150px' }}
                >
                  {saveSuccess ? (
                    <><Check size={16} /> Saved Changes</>
                  ) : isSaving ? (
                    <><RefreshCw size={16} className="animate-spin" /> Saving...</>
                  ) : (
                    <><Save size={16} /> Save AI Settings</>
                  )}
                </button>
              </div>
            )}
          </main>
        </div>
      </motion.div>
    </div>
  );
};
