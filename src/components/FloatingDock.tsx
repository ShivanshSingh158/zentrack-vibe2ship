import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, LayoutGrid, LogOut, Volume2, VolumeX, User as UserIcon, Mic, Edit2, Check,
  BookOpen, CheckSquare, Calendar, StickyNote, Target, Dumbbell, Zap, GraduationCap,
  FileText, Award, Briefcase, BarChart3
} from 'lucide-react';
import { auth } from '../services/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { toast } from 'sonner';
import { GeminiAuthBadge } from './ui/GeminiAuthBadge';
import { getKeyStatus } from '../services/userGeminiAuth';
import { useVoice } from '../contexts/VoiceContext';
import '../styles/dock.css';

const ALL_APPS = [
  { name: 'Tasks', icon: <CheckSquare size={22} color="#a599ff" strokeWidth={2.2} />, route: '/tasks', isLucide: true },
  { name: 'Calendar', icon: <Calendar size={22} color="#38bdf8" strokeWidth={2.2} />, route: '/calendar', isLucide: true },
  { name: 'Notes', icon: <StickyNote size={22} color="#fad7a1" strokeWidth={2.2} />, route: '/notes', isLucide: true },
  { name: 'Goals', icon: <Target size={22} color="#818cf8" strokeWidth={2.2} />, route: '/goals', isLucide: true },
  { name: 'Habits', icon: <Zap size={22} color="#f59e0b" strokeWidth={2.2} />, route: '/habits', isLucide: true },
  { name: 'Learning', icon: <BookOpen size={22} color="#5eda9e" strokeWidth={2.2} />, route: '/learning', isLucide: true },
  { name: 'Attendance', icon: <GraduationCap size={22} color="#38bdf8" strokeWidth={2.2} />, route: '/attendance', isLucide: true },
  { name: 'Assignments', icon: <FileText size={22} color="#f472b6" strokeWidth={2.2} />, route: '/assignments', isLucide: true },
  { name: 'Jobs', icon: <Briefcase size={22} color="#fbbf24" strokeWidth={2.2} />, route: '/jobs', isLucide: true },
  { name: 'Grades', icon: <Award size={22} color="#a599ff" strokeWidth={2.2} />, route: '/grades', isLucide: true },
  { name: 'Analytics', icon: <BarChart3 size={22} color="#38bdf8" strokeWidth={2.2} />, route: '/analytics', isLucide: true },
];

interface FloatingDockProps {
  hidden?: boolean;
  inHeader?: boolean;
}

export function FloatingDock({ hidden = false, inHeader = false }: FloatingDockProps) {
  const { isMuted, setIsMuted, isSpeaking } = useVoice();
  const [user, setUser] = useState<User | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasProRing, setHasProRing] = useState(getKeyStatus().hasPersonalKey);
  const [isFocused, setIsFocused] = useState(false);
  
  const [pinnedApps, setPinnedApps] = useState<string[]>(() => {
    const saved = localStorage.getItem('desktop_pinned_apps');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((name: string) => name !== 'Gym');
        }
      } catch (e) {}
    }
    return ['Tasks', 'Calendar', 'Notes', 'Goals', 'Learning'];
  });

  useEffect(() => {
    localStorage.setItem('desktop_pinned_apps', JSON.stringify(pinnedApps));
  }, [pinnedApps]);
  
  const location = useLocation();
  const navigate = useNavigate();
  const mouseX = useMotionValue(Infinity);

  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAuthChange = () => setHasProRing(getKeyStatus().hasPersonalKey);
    window.addEventListener('gemini-auth-changed', handleAuthChange);
    return () => window.removeEventListener('gemini-auth-changed', handleAuthChange);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  // Close more popover on escape or outside click
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreOpen]);

  // Handle Focus Mode (Cmd+.)
  useEffect(() => {
    const handleFocusStart = () => setIsFocused(true);
    const handleFocusEnd = () => setIsFocused(false);
    window.addEventListener('zen-focus-start', handleFocusStart);
    window.addEventListener('zen-focus-end', handleFocusEnd);
    return () => {
      window.removeEventListener('zen-focus-start', handleFocusStart);
      window.removeEventListener('zen-focus-end', handleFocusEnd);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err: any) {
      toast.error('Logout failed: ' + err.message);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isFocused) setIsFocused(false); // Wake up dock on direct hover
    mouseX.set(e.pageX);
  };

  const handleMouseLeave = () => {
    mouseX.set(Infinity);
  };

  return (
    <>
      <motion.div
        className={`floating-dock-container ${inHeader ? 'in-header' : ''}`}
        initial={{ y: 100, opacity: 0 }}
        animate={{ 
          y: hidden ? 100 : 0, 
          opacity: hidden ? 0 : (isFocused ? 0.2 : 1),
          pointerEvents: hidden ? 'none' : 'auto'
        }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        style={inHeader ? { position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' } : {}}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ opacity: hidden ? 0 : 1 }} // Force opacity 1 on hover even in focus, unless hidden
      >
        <div className="dock-pill">
          <DockItem 
            key="Home" 
            app={{ name: 'Home', icon: <Home size={22} />, route: '/home', isLucide: true }} 
            mouseX={mouseX} 
            isActive={location.pathname === '/home'}
          />
          {pinnedApps.map(name => {
            const app = ALL_APPS.find(a => a.name === name);
            if (!app) return null;
            return (
              <DockItem 
                key={app.name} 
                app={app} 
                mouseX={mouseX} 
                isActive={location.pathname === app.route}
              />
            );
          })}

          {/* Separator line */}
          <div className="dock-separator" />

          {/* More Button */}
          <div className="dock-item-wrapper" ref={moreRef}>
            <button 
              className={`dock-more-btn ${isMoreOpen ? 'active' : ''}`}
              onClick={() => setIsMoreOpen(!isMoreOpen)}
            >
              <LayoutGrid size={22} />
            </button>

            <AnimatePresence>
              {isMoreOpen && (
                <motion.div
                  className="dock-popover"
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  {/* Edit Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem 1rem 0.5rem', borderBottom: '1px solid rgba(196,149,106,0.1)', marginBottom: '1rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {isEditing ? 'EDIT PINNED MODULES' : 'ALL MODULES'}
                    </span>
                    <button onClick={() => setIsEditing(!isEditing)} style={{ background: 'transparent', border: 'none', color: isEditing ? '#c4956a' : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'color 0.2s' }}>
                      {isEditing ? <Check size={18} /> : <Edit2 size={18} />}
                    </button>
                  </div>

                  {/* Apps Grid */}
                  <div 
                    className="dock-popover-grid hide-scrollbar" 
                    style={{ maxHeight: '480px', overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: '0.5rem', paddingBottom: '0.5rem', overflowX: 'hidden' }}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    <AnimatePresence mode="popLayout">
                      {(isEditing ? ALL_APPS : ALL_APPS.filter(app => !pinnedApps.includes(app.name))).map(app => {
                        const isPinned = pinnedApps.includes(app.name);
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            key={app.name}
                            onClick={() => {
                              if (isEditing) {
                                setPinnedApps(prev => {
                                  if (prev.includes(app.name)) return prev.filter(n => n !== app.name);
                                  if (prev.length >= 6) { toast.error("Maximum 6 pinned apps allowed."); return prev; }
                                  return [...prev, app.name];
                                });
                              } else {
                                setIsMoreOpen(false);
                                navigate(app.route);
                              }
                            }}
                            className={`popover-app-item ${location.pathname === app.route && !isEditing ? 'active' : ''}`}
                            style={{
                              cursor: 'pointer',
                              position: 'relative',
                              border: isEditing && isPinned ? '1px solid rgba(196,149,106,0.5)' : undefined,
                              background: isEditing && isPinned ? 'rgba(196,149,106,0.1)' : undefined
                            }}
                          >
                            {isEditing && isPinned && (
                              <motion.div 
                                initial={{ scale: 0 }} 
                                animate={{ scale: 1 }}
                                style={{ position: 'absolute', top: 6, right: 6, background: '#c4956a', borderRadius: '50%', padding: '2px', color: '#000', zIndex: 2 }}
                              >
                                <Check size={12} />
                              </motion.div>
                            )}
                            {app.isLucide ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', opacity: isEditing && !isPinned ? 0.3 : 1, transition: 'opacity 0.3s' }}>
                                {app.icon}
                              </div>
                            ) : (
                              <img src={(app as any).img} alt={app.name} style={{ opacity: isEditing && !isPinned ? 0.3 : 1, transition: 'opacity 0.3s' }} />
                            )}
                            <span style={{ color: isEditing && !isPinned ? 'rgba(255,255,255,0.3)' : undefined, transition: 'color 0.3s' }}>{app.name}</span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* System Header / Footer inside popover */}
                  <div className="dock-popover-footer">
                    <div className="system-toggles">
                      <GeminiAuthBadge />
                      <button 
                        onClick={() => setIsMuted(!isMuted)}
                        className="voice-toggle-btn"
                        title={isMuted ? "Unmute Voice" : "Mute Voice"}
                      >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        {isSpeaking && !isMuted && (
                          <motion.div 
                            className="voice-pulse"
                            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          />
                        )}
                      </button>
                    </div>

                    <div className="user-section">
                      <div className={`avatar-wrap ${hasProRing ? 'pro-ring' : ''}`}>
                        {user?.photoURL ? (
                          <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" />
                        ) : (
                          <UserIcon size={16} />
                        )}
                      </div>
                      <button className="logout-btn" onClick={handleLogout}>
                        <LogOut size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function DockItem({ app, mouseX, isActive }: { app: any, mouseX: any, isActive: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  
  // Calculate distance from mouse to center of this icon
  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Scale based on distance (macOS dock effect)
  const scaleSync = useTransform(distance, [-150, 0, 150], [1, 1.4, 1]);
  const scale = useSpring(scaleSync, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <NavLink to={app.route} ref={ref} style={{ textDecoration: 'none' }}>
      <motion.div 
        className={`dock-item ${isActive ? 'active' : ''}`}
        style={{ scale }}
      >
        {app.isLucide ? app.icon : <img src={app.img} alt={app.name} />}
        {isActive && <motion.div layoutId="dock-indicator" className="dock-indicator" />}
      </motion.div>
    </NavLink>
  );
}
