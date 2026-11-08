import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  X, User, Palette, Bell, ShieldCheck, 
  LogOut, Copy, Check, RefreshCw, Trash2, 
  Sun, Moon, Download, Sliders
} from 'lucide-react';
import { auth, db } from '../../services/firebase';
import { signOut, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
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
  const { tasks, notes } = useGlobalData();

  const currentUser = userProp || auth.currentUser;
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [copiedUid, setCopiedUid] = useState(false);
  const [logoutConfirmStep, setLogoutConfirmStep] = useState(false);

  // ── Profile Edit Name State ──────────────────────────────────────────────
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

  // ── Notification Preferences State (SMS Completely Removed) ─────────────
  const [browserNotifPermission, setBrowserNotifPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });
  const [soundEffects, setSoundEffects] = useState(() => {
    return localStorage.getItem('zen_sound_enabled') !== 'false';
  });
  const [reminderLeadTime, setReminderLeadTime] = useState<'15' | '30' | '60' | '120'>(() => {
    return (localStorage.getItem('zen_reminder_lead_time') as any) || '15';
  });

  // ── Data & Privacy State ──────────────────────────────────────────────────
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleDensity = (val: 'comfortable' | 'compact') => {
    setDensity(val);
    localStorage.setItem('zen_density', val);
    if (val === 'compact') {
      document.body.classList.add('density-compact');
    } else {
      document.body.classList.remove('density-compact');
    }
    toast.success(`Density: ${val}`);
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

  const handleToggleSoundEffects = (val: boolean) => {
    setSoundEffects(val);
    localStorage.setItem('zen_sound_enabled', val ? 'true' : 'false');
    toast.success(val ? 'Audio chimes enabled' : 'Audio chimes muted');
  };

  const handleSetReminderLeadTime = (mins: '15' | '30' | '60' | '120') => {
    setReminderLeadTime(mins);
    localStorage.setItem('zen_reminder_lead_time', mins);
    toast.success(`Reminder buffer: ${mins}m`);
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
      toast.success('Display name saved');
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
      toast.success(`Password reset sent to ${currentUser.email}`);
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
      toast.success('Test notification dispatched');
    } catch {
      toast.info('Test notification sent');
    }
  };

  const handleRequestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Browser notifications are not supported on this device');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotifPermission(permission);
      if (permission === 'granted') {
        toast.success('Desktop notifications enabled');
      } else {
        toast.info(`Permission: ${permission}`);
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };

  const handleCopyUid = () => {
    if (!currentUser?.uid) return;
    navigator.clipboard.writeText(currentUser.uid).then(() => {
      setCopiedUid(true);
      toast.success('User ID copied');
      setTimeout(() => setCopiedUid(false), 2000);
    });
  };

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

      toast.success(`Exported ${(tasks || []).length} tasks, ${(notes || []).length} notes`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export data JSON');
    } finally {
      setIsExporting(false);
    }
  };

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
      toast.success('Account data wiped');
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
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="security-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="security-modal-header">
          <div className="security-modal-header-left">
            <Sliders size={16} className="modal-header-icon" />
            <span className="security-modal-title">Settings</span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="security-modal-close-btn"
            aria-label="Close settings"
          >
            <X size={16} />
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
                <User size={15} />
                <span>Account</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'appearance' ? 'active' : ''}`}
                onClick={() => setActiveTab('appearance')}
              >
                <Palette size={15} />
                <span>Appearance</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'notifications' ? 'active' : ''}`}
                onClick={() => setActiveTab('notifications')}
              >
                <Bell size={15} />
                <span>Notifications</span>
              </button>

              <button
                type="button"
                className={`settings-sidebar-tab ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveTab('data')}
              >
                <ShieldCheck size={15} />
                <span>Data & Privacy</span>
              </button>
            </div>

            {/* Quick Log Out in Sidebar Footer */}
            <div className="settings-nav-footer">
              <button
                type="button"
                className="settings-sidebar-logout-btn"
                onClick={handleTriggerLogout}
                title="Log out of ZenTrack"
              >
                <LogOut size={14} />
                <span>{logoutConfirmStep ? 'Confirm Log Out?' : 'Log Out'}</span>
              </button>
            </div>
          </aside>

          {/* ── RIGHT CONTENT PANE ── */}
          <main className="settings-content-wrapper">
            <div className="settings-content-body">

              {/* ── TAB 1: ACCOUNT ─────────────────────────────────────── */}
              {activeTab === 'account' && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <h3 className="settings-section-title">Profile & Identity</h3>
                  </div>

                  <div className="settings-group-card">
                    {/* Row 1: Profile Info */}
                    <div className="settings-row profile-row">
                      <div className="settings-profile-left">
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

                        <div className="settings-profile-info">
                          {isEditingName ? (
                            <div className="name-edit-inline">
                              <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                className="settings-input-sm"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={handleSaveDisplayName}
                                disabled={isSavingName}
                                className="settings-btn-primary-sm"
                              >
                                {isSavingName ? <RefreshCw size={12} className="animate-spin" /> : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingName(false);
                                  setNameInput(currentUser?.displayName || '');
                                }}
                                className="settings-btn-ghost-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="profile-name-wrap">
                              <span className="profile-name-text">{displayName}</span>
                              <button 
                                type="button" 
                                onClick={() => setIsEditingName(true)}
                                className="profile-edit-trigger"
                                title="Edit display name"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                          <span className="profile-email-text">{currentUser?.email || 'No email attached'}</span>
                        </div>
                      </div>

                      <div className="settings-row-right">
                        <span className="cloud-status-indicator">
                          <span className="cloud-status-dot" /> Cloud Active
                        </span>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 2: User ID */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">User ID</span>
                        <span className="settings-row-subtitle">Cryptographic sync identifier</span>
                      </div>
                      <div className="settings-row-right">
                        <code className="settings-code-inline">
                          {currentUser?.uid ? `${currentUser.uid.slice(0, 8)}...${currentUser.uid.slice(-6)}` : 'Unknown'}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyUid}
                          className="settings-action-icon-btn"
                          title="Copy User ID"
                        >
                          {copiedUid ? <Check size={13} color="#5eda9e" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 3: Password Reset */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Password Recovery</span>
                        <span className="settings-row-subtitle">Send a secure reset link to your email</span>
                      </div>
                      <div className="settings-row-right">
                        <button
                          type="button"
                          onClick={handleSendPasswordReset}
                          className="settings-btn-secondary"
                        >
                          Send Reset Link
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 2: APPEARANCE ───────────────────────────────────── */}
              {activeTab === 'appearance' && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <h3 className="settings-section-title">Theme & Layout</h3>
                  </div>

                  <div className="settings-group-card">
                    {/* Row 1: Color Theme */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Color Theme</span>
                        <span className="settings-row-subtitle">
                          {!isPlainTheme ? 'Obsidian Cosmos (Pure Dark Mode)' : 'Frost Quartz (Minimal Light Mode)'}
                        </span>
                      </div>
                      <div className="settings-row-right">
                        <div className="settings-segmented-control">
                          <button
                            type="button"
                            className={`segmented-item ${!isPlainTheme ? 'active' : ''}`}
                            onClick={() => { if (isPlainTheme && onToggleTheme) onToggleTheme(); }}
                          >
                            <Moon size={12} />
                            <span>Dark</span>
                          </button>
                          <button
                            type="button"
                            className={`segmented-item ${isPlainTheme ? 'active' : ''}`}
                            onClick={() => { if (!isPlainTheme && onToggleTheme) onToggleTheme(); }}
                          >
                            <Sun size={12} />
                            <span>Light</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 2: Layout Density */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Layout Density</span>
                        <span className="settings-row-subtitle">Spacing and item height across lists</span>
                      </div>
                      <div className="settings-row-right">
                        <div className="settings-segmented-control">
                          <button
                            type="button"
                            className={`segmented-item ${density === 'comfortable' ? 'active' : ''}`}
                            onClick={() => handleToggleDensity('comfortable')}
                          >
                            <span>Comfortable</span>
                          </button>
                          <button
                            type="button"
                            className={`segmented-item ${density === 'compact' ? 'active' : ''}`}
                            onClick={() => handleToggleDensity('compact')}
                          >
                            <span>Compact</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 3: Reduced Motion */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Reduced Motion</span>
                        <span className="settings-row-subtitle">Disable transitions for maximum responsiveness</span>
                      </div>
                      <div className="settings-row-right">
                        <button
                          type="button"
                          className={`settings-switch ${reducedMotion ? 'active' : ''}`}
                          onClick={() => handleToggleReducedMotion(!reducedMotion)}
                          aria-label="Toggle reduced motion"
                        >
                          <div className="switch-thumb" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 3: NOTIFICATIONS ───────────────────────────────── */}
              {activeTab === 'notifications' && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <h3 className="settings-section-title">Notifications & Audio</h3>
                  </div>

                  <div className="settings-group-card">
                    {/* Row 1: Browser Alerts */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Desktop Browser Alerts</span>
                        <span className="settings-row-subtitle">
                          {browserNotifPermission === 'granted'
                            ? 'Active for task deadlines and Pomodoro intervals'
                            : 'Permission required for desktop reminders'}
                        </span>
                      </div>
                      <div className="settings-row-right">
                        {browserNotifPermission !== 'granted' ? (
                          <button
                            type="button"
                            className="settings-btn-primary"
                            onClick={handleRequestNotifPermission}
                          >
                            Enable Alerts
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="settings-btn-secondary"
                            onClick={handleSendTestNotification}
                          >
                            <Bell size={13} />
                            <span>Send Test</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 2: Pre-task Lead Time */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Pre-Task Buffer</span>
                        <span className="settings-row-subtitle">Alert lead time before scheduled task time</span>
                      </div>
                      <div className="settings-row-right">
                        <div className="settings-segmented-control">
                          {(['15', '30', '60', '120'] as const).map(mins => (
                            <button
                              key={mins}
                              type="button"
                              className={`segmented-item ${reminderLeadTime === mins ? 'active' : ''}`}
                              onClick={() => handleSetReminderLeadTime(mins)}
                            >
                              <span>{mins === '60' ? '1h' : mins === '120' ? '2h' : `${mins}m`}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 3: Audio Chimes */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Audio Chimes</span>
                        <span className="settings-row-subtitle">Sound effects on task completion and timer rings</span>
                      </div>
                      <div className="settings-row-right">
                        <button
                          type="button"
                          className={`settings-switch ${soundEffects ? 'active' : ''}`}
                          onClick={() => handleToggleSoundEffects(!soundEffects)}
                          aria-label="Toggle audio chimes"
                        >
                          <div className="switch-thumb" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 4: DATA & PRIVACY ──────────────────────────────── */}
              {activeTab === 'data' && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <h3 className="settings-section-title">Cloud Storage & Backup</h3>
                  </div>

                  <div className="settings-group-card">
                    {/* Row 1: Metrics */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Workspace Records</span>
                        <span className="settings-row-subtitle">Synced to Firebase Firestore</span>
                      </div>
                      <div className="settings-row-right">
                        <div className="settings-stat-pill">
                          <strong>{(tasks || []).length}</strong> tasks • <strong>{(notes || []).length}</strong> notes
                        </div>
                      </div>
                    </div>

                    <div className="settings-hairline" />

                    {/* Row 2: Export */}
                    <div className="settings-row">
                      <div className="settings-row-left">
                        <span className="settings-row-title">Export Workspace Backup</span>
                        <span className="settings-row-subtitle">Download full JSON snapshot</span>
                      </div>
                      <div className="settings-row-right">
                        <button
                          type="button"
                          onClick={handleExportDataJson}
                          disabled={isExporting}
                          className="settings-btn-secondary"
                        >
                          {isExporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                          <span>Export JSON</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="settings-section-header" style={{ marginTop: '1.4rem' }}>
                    <h3 className="settings-section-title" style={{ color: '#f87171' }}>Danger Zone</h3>
                  </div>

                  <div className="settings-group-card danger-card">
                    <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                      <div className="settings-row-left">
                        <span className="settings-row-title" style={{ color: '#f87171' }}>Wipe Cloud Data</span>
                        <span className="settings-row-subtitle">
                          Irreversibly erase all tasks and notes. Type <strong>DELETE</strong> to confirm.
                        </span>
                        <div style={{ marginTop: '0.6rem' }}>
                          <input
                            type="text"
                            value={wipeConfirm}
                            onChange={(e) => setWipeConfirm(e.target.value)}
                            placeholder="Type DELETE"
                            className="settings-input-sm"
                            style={{ maxWidth: '160px' }}
                          />
                        </div>
                      </div>
                      <div className="settings-row-right" style={{ alignSelf: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleWipeData}
                          disabled={wipeConfirm !== 'DELETE' || isWiping}
                          className="settings-btn-danger"
                        >
                          {isWiping ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          <span>Wipe Data</span>
                        </button>
                      </div>
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
