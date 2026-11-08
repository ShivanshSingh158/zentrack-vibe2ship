import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, Palette, Bell, ShieldCheck, 
  LogOut, Copy, Check, CheckCircle, RefreshCw, Trash2, 
  Save, Phone, Sun, Moon,
  Download, Sliders
} from 'lucide-react';
import { auth, db } from '../../services/firebase';
import { signOut, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, doc, setDoc, getDoc } from 'firebase/firestore';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { toast } from 'sonner';

export type SettingsTabId = 'account' | 'appearance' | 'notifications' | 'data';

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
  const { 
    tasks, 
    notes,
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
      new Notification('ZenTrack Alert', {
        body: 'Your notification pipeline is connected and active.',
        icon: '/pwa-192x192.png'
      });
      toast.success('Test notification sent to your desktop');
    } catch {
      toast.info('Test notification dispatched');
    }
  };

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

  // ── Data & Privacy State ──────────────────────────────────────────────────
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Load user profile from Firestore on mount
  useEffect(() => {
    const user = currentUser || auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'user_profiles', user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.phoneNumber) setPhoneNumber(d.phoneNumber);
      }
      setPhoneLoaded(true);
    }).catch(() => setPhoneLoaded(true));
  }, [currentUser]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Handler: Copy User ID ─────────────────────────────────────────────────
  const handleCopyUid = () => {
    if (!currentUser?.uid) return;
    navigator.clipboard.writeText(currentUser.uid).then(() => {
      setCopiedUid(true);
      toast.success('User ID copied to clipboard');
      setTimeout(() => setCopiedUid(false), 2000);
    });
  };

  // ── Handler: Trigger Logout ───────────────────────────────────────────────
  const handleTriggerLogout = () => {
    if (!logoutConfirmStep) {
      setLogoutConfirmStep(true);
      setTimeout(() => setLogoutConfirmStep(false), 4000);
      return;
    }
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
          notes: (notes || []).length,
        },
        tasks: tasks || [],
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
      const collectionsToWipe = ['tasks', 'todos', 'notes'];
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
              <p className="security-modal-subtitle">Manage your account, appearance, notifications & data</p>
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
                    </div>

                    <div className="settings-profile-details">
                      <div className="settings-name-row">
                        {isEditingName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                            <input
                              type="text"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              placeholder="Your full name"
                              className="security-input"
                              style={{ maxWidth: '240px', padding: '0.35rem 0.65rem', fontSize: '0.9rem' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={handleSaveDisplayName}
                              disabled={isSavingName}
                              className="security-btn security-btn-primary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                            >
                              {isSavingName ? <RefreshCw size={13} className="animate-spin" /> : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingName(false);
                                setNameInput(currentUser?.displayName || '');
                              }}
                              className="security-btn"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h4 className="settings-profile-name">{displayName}</h4>
                            <button 
                              type="button" 
                              onClick={() => setIsEditingName(true)}
                              className="settings-edit-name-btn"
                              title="Edit display name"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>

                      <div className="settings-email-row">
                        <span>{currentUser?.email || 'No email attached'}</span>
                      </div>

                      <div className="settings-badges-row">
                        <span className="settings-plan-badge">Pro Active</span>
                        <span className="settings-provider-badge">
                          {currentUser?.providerData?.[0]?.providerId === 'google.com' ? 'Google Auth' : 'Email/Password'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Unique Cloud UID */}
                  <div className="security-card-box">
                    <div className="security-card-row">
                      <div>
                        <div className="security-card-label">Cloud Workspace User ID</div>
                        <div className="security-card-sub">Unique cryptographic identifier for your Firestore data sync</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code className="security-code-tag">{currentUser?.uid || 'Unknown'}</code>
                        <button
                          type="button"
                          onClick={handleCopyUid}
                          className="security-icon-btn"
                          title="Copy User ID"
                        >
                          {copiedUid ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password & Security Actions */}
                  <div className="security-card-box">
                    <div className="security-card-row">
                      <div>
                        <div className="security-card-label">Reset Account Password</div>
                        <div className="security-card-sub">Dispatch a secure password recovery link to your primary email address</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSendPasswordReset}
                        className="security-btn"
                      >
                        Send Reset Link
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 2: APPEARANCE & THEMES ───────────────────────────── */}
              {activeTab === 'appearance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Appearance & Themes</h3>
                    <p className="settings-tab-subtitle">Configure color schemes, layout density, and interface motion preferences</p>
                  </div>

                  {/* Theme Selector */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">Color Theme</h4>
                    <p className="security-section-desc">Choose between Obsidian Glassmorphism and Minimal Light Mode</p>

                    <div className="settings-theme-cards-grid">
                      <div 
                        className={`settings-theme-preview-card ${!isPlainTheme ? 'selected' : ''}`}
                        onClick={() => { if (isPlainTheme && onToggleTheme) onToggleTheme(); }}
                      >
                        <div className="theme-preview-box dark-theme-preview">
                          <Moon size={20} color="#a599ff" />
                        </div>
                        <div className="theme-card-meta">
                          <span className="theme-card-name">Obsidian Dark</span>
                          <span className="theme-card-desc">Deep slate glassmorphism with neon accents</span>
                        </div>
                        {!isPlainTheme && <div className="theme-check-pill"><Check size={12} /> Active</div>}
                      </div>

                      <div 
                        className={`settings-theme-preview-card ${isPlainTheme ? 'selected' : ''}`}
                        onClick={() => { if (!isPlainTheme && onToggleTheme) onToggleTheme(); }}
                      >
                        <div className="theme-preview-box light-theme-preview">
                          <Sun size={20} color="#f59e0b" />
                        </div>
                        <div className="theme-card-meta">
                          <span className="theme-card-name">Minimal Light</span>
                          <span className="theme-card-desc">Clean, high-contrast monochrome design</span>
                        </div>
                        {isPlainTheme && <div className="theme-check-pill"><Check size={12} /> Active</div>}
                      </div>
                    </div>
                  </div>

                  {/* Layout Density */}
                  <div className="security-card-box">
                    <h4 className="security-section-title">Layout Density</h4>
                    <p className="security-section-desc">Adjust row heights, padding, and information density across task lists</p>

                    <div className="settings-density-row">
                      <button
                        type="button"
                        className={`settings-density-btn ${density === 'comfortable' ? 'active' : ''}`}
                        onClick={() => handleToggleDensity('comfortable')}
                      >
                        Comfortable (Default)
                      </button>
                      <button
                        type="button"
                        className={`settings-density-btn ${density === 'compact' ? 'active' : ''}`}
                        onClick={() => handleToggleDensity('compact')}
                      >
                        Compact (Dense Lists)
                      </button>
                    </div>
                  </div>

                  {/* Motion & Animations */}
                  <div className="security-card-box">
                    <div className="security-card-row">
                      <div>
                        <div className="security-card-label">Reduced Motion</div>
                        <div className="security-card-sub">Disable micro-interactions and smooth page transitions for maximum performance</div>
                      </div>
                      <button
                        type="button"
                        className={`settings-toggle-switch ${reducedMotion ? 'on' : 'off'}`}
                        onClick={() => handleToggleReducedMotion(!reducedMotion)}
                        aria-label="Toggle reduced motion"
                      >
                        <div className="toggle-switch-thumb" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 3: NOTIFICATIONS & SMS ───────────────────────────── */}
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
                </div>
              )}

              {/* ── TAB 4: DATA & PRIVACY ────────────────────────────────── */}
              {activeTab === 'data' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="settings-tab-header">
                    <h3 className="settings-tab-title">Data, Backup & Privacy</h3>
                    <p className="settings-tab-subtitle">Inspect your cloud storage metrics, export offline backups, and manage data</p>
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
                        <div className="settings-stat-num">{(notes || []).length}</div>
                        <div className="settings-stat-label">Notes & Docs</div>
                      </div>
                    </div>
                  </div>

                  {/* JSON Backup Export */}
                  <div className="security-card-box">
                    <div className="security-card-row">
                      <div>
                        <div className="security-card-label">Export Full Workspace Backup</div>
                        <div className="security-card-sub">Download a JSON archive containing all tasks, notes, and profile settings</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportDataJson}
                        disabled={isExporting}
                        className="security-btn security-btn-primary"
                      >
                        {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        <span>Export JSON</span>
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone: Wipe Data */}
                  <div className="security-card-box danger-zone">
                    <h4 className="security-section-title" style={{ color: '#ef4444' }}>Danger Zone: Wipe Workspace Data</h4>
                    <p className="security-section-desc">
                      Type <strong>DELETE</strong> below to irreversibly wipe all tasks and notes associated with this account.
                    </p>
                    <div className="security-input-row" style={{ marginTop: '0.75rem' }}>
                      <input
                        type="text"
                        value={wipeConfirm}
                        onChange={(e) => setWipeConfirm(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="security-input"
                        style={{ maxWidth: '240px', borderColor: wipeConfirm === 'DELETE' ? '#ef4444' : undefined }}
                      />
                      <button
                        type="button"
                        onClick={handleWipeData}
                        disabled={wipeConfirm !== 'DELETE' || isWiping}
                        className="security-btn"
                        style={{
                          background: wipeConfirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.1)',
                          color: wipeConfirm === 'DELETE' ? '#ffffff' : '#ef4444',
                          borderColor: '#ef4444',
                          cursor: wipeConfirm === 'DELETE' ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {isWiping ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span>Wipe All Data</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
};
