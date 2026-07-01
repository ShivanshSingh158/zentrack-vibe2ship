import React, { useEffect, useState, useRef } from 'react';
import { Grid, User as UserIcon, Edit2, X, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { CommandPalette } from './CommandPalette';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { GeminiAuthBadge } from './ui/GeminiAuthBadge';
import { getKeyStatus } from '../services/userGeminiAuth';

export function TopNav() {
  const [user, setUser] = useState<User | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isEditingDrawer, setIsEditingDrawer] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [hasProRing, setHasProRing] = useState(getKeyStatus().hasPersonalKey);

  useEffect(() => {
    const handleAuthChange = () => setHasProRing(getKeyStatus().hasPersonalKey);
    window.addEventListener('gemini-auth-changed', handleAuthChange);
    return () => window.removeEventListener('gemini-auth-changed', handleAuthChange);
  }, []);

  const drawerRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const defaultPinnedApps = ['Tasks', 'Calendar', 'Notes', 'Goals', 'Analytics'];
  const [pinnedApps, setPinnedApps] = useState<string[]>(() => {
    const saved = localStorage.getItem('zentrack_pinned_apps');
    if (saved) {
      try { return JSON.parse(saved); } catch { return defaultPinnedApps; }
    }
    return defaultPinnedApps;
  });

  useEffect(() => {
    localStorage.setItem('zentrack_pinned_apps', JSON.stringify(pinnedApps));
  }, [pinnedApps]);

  const togglePin = (appName: string) => {
    setPinnedApps(prev => {
      if (prev.includes(appName)) {
        return prev.filter(a => a !== appName);
      }
      if (prev.length >= 9) {
        toast.error('You can only pin up to 9 apps in the taskbar.');
        return prev;
      }
      return [...prev, appName];
    });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isDrawerOpen) setIsEditingDrawer(false);
  }, [isDrawerOpen]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false);
        setIsEditingDrawer(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsDrawerOpen(false);
        setIsEditingDrawer(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const handleOpenDrawerEvent = () => {
      setIsDrawerOpen(true);
    };

    if (isDrawerOpen || isProfileOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    window.addEventListener('open-app-drawer', handleOpenDrawerEvent);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('open-app-drawer', handleOpenDrawerEvent);
    };
  }, [isDrawerOpen, isProfileOpen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err: unknown) {
      toast.error('Logout failed: ' + (err as { message?: string }).message);
    }
  };

  const apps = [
    { name: 'Tasks', img: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Google_Tasks_2021.svg', route: '/tasks' },
    { name: 'Calendar', img: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg', route: '/calendar' },
    { name: 'Notes', img: 'https://img.icons8.com/color/96/000000/google-keep.png', route: '/notes' },
    { name: 'Analytics', img: 'https://img.icons8.com/color/96/000000/google-analytics.png', route: '/analytics' },
    { name: 'Assignments', img: 'https://img.icons8.com/color/96/000000/google-classroom.png', route: '/assignments' },
    { name: 'Goals', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Trophy/3D/trophy_3d.png', route: '/goals' },
    { name: 'Habits', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Counterclockwise%20arrows%20button/3D/counterclockwise_arrows_button_3d.png', route: '/habits' },
    { name: 'Gym', img: 'https://img.icons8.com/color/96/000000/dumbbell.png', route: '/gym' },
    { name: 'Jobs', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Briefcase/3D/briefcase_3d.png', route: '/jobs' },
    { name: 'Learning', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Brain/3D/brain_3d.png', route: '/learning' },
    { name: 'Tools', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hammer%20and%20wrench/3D/hammer_and_wrench_3d.png', route: '/tools' },
    { name: 'Integration', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Link/3D/link_3d.png', route: '/integrations' },
    { name: 'Review', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Crystal%20ball/3D/crystal_ball_3d.png', route: '/review' },
    { name: 'Attendance', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Graduation%20cap/3D/graduation_cap_3d.png', route: '/attendance' },
    { name: 'Grades', img: 'https://img.icons8.com/color/96/000000/exam.png', route: '/grades' },
  ];

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <div className="app-logo" onClick={() => navigate('/home')} style={{ cursor: 'pointer' }}>
          <img src="/logo_white.png" alt="ZenTrack" className="logo-circle" style={{ borderRadius: 0, objectFit: 'contain' }} />
          <span className="logo-text" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '1.75rem', transform: 'translateY(1px)' }}>ZenTrack</span>
        </div>
      </div>
      <div className="top-nav-center">
        <nav className="main-nav-links">
          <AnimatePresence mode="popLayout">
            {pinnedApps.map(appName => {
              const app = apps.find(a => a.name === appName);
              if (!app) return null;
              return (
                <motion.div
                  key={app.name}
                  layout
                  initial={{ opacity: 0, scale: 0.8, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <NavLink to={app.route} className="nav-link">{app.name}</NavLink>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </nav>
      </div>

      <div className="top-nav-right">
        <div className="hide-on-mobile">
          <CommandPalette />
        </div>
        
        <div className="app-drawer-container hide-on-mobile" ref={drawerRef}>
          <button 
            className={`icon-button ${isDrawerOpen ? 'active' : ''}`} 
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            title="Google Apps"
          >
            <Grid size={20} />
          </button>
          
          {isDrawerOpen && (
            <div className="app-drawer google-style-drawer">
              <div className="drawer-header">
                <span className="drawer-title">Your favorites</span>
                <button 
                  className={`drawer-edit-btn ${isEditingDrawer ? 'editing' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingDrawer(!isEditingDrawer);
                  }}
                >
                  {isEditingDrawer ? <X size={16} /> : <Edit2 size={16} />}
                </button>
              </div>
              <div className="drawer-scroll-area" data-lenis-prevent="true">
                <div className="app-drawer-grid">
                  {apps.map((app) => (
                    <button 
                      key={app.name} 
                      className={`app-drawer-item ${isEditingDrawer ? 'editing-mode' : ''} ${pinnedApps.includes(app.name) ? 'pinned' : ''}`}
                      onClick={() => {
                        if (isEditingDrawer) {
                          togglePin(app.name);
                        } else {
                          navigate(app.route);
                          setIsDrawerOpen(false);
                        }
                      }}
                    >
                      <div className="app-drawer-icon-wrap">
                        <img src={app.img} alt={app.name} className={`real-app-icon ${isEditingDrawer && !pinnedApps.includes(app.name) ? 'dimmed' : ''}`} />
                        {isEditingDrawer && (
                          <div className={`pin-indicator ${pinnedApps.includes(app.name) ? 'active' : ''}`}></div>
                        )}
                      </div>
                      <span className="app-drawer-label">{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <GeminiAuthBadge />
          <div className="user-profile" ref={profileRef}>
            <button 
              className="user-avatar-btn"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className={hasProRing ? "google-pro-border" : ""}>
                {user?.photoURL && !imageError ? (
                  <img 
                    src={user.photoURL} 
                    alt="User Avatar" 
                    className="user-avatar" 
                    referrerPolicy="no-referrer"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="user-avatar-fallback">
                    <UserIcon size={20} />
                  </div>
                )}
              </div>
            </button>
            
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div 
                  className="profile-dropdown"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <button className="profile-dropdown-item" onClick={handleLogout}>
                    <LogOut size={16} />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
