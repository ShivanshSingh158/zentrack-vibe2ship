import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, LayoutGrid, LogOut, Volume2, VolumeX, User as UserIcon, Edit2, Check,
  BookOpen, CheckCircle2, Calendar, FileText, Target, Dumbbell, Flame, GraduationCap,
  Award, Briefcase, BarChart3, Library
} from 'lucide-react';
import { auth } from '../services/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { toast } from 'sonner';
import { GeminiAuthBadge } from './ui/GeminiAuthBadge';
import { getKeyStatus } from '../services/userGeminiAuth';
import { useVoice } from '../contexts/VoiceContext';
import { prefetchRoute } from '../App';
import '../styles/dock.css';

export const ALL_APPS = [
  {
    id: 'Tasks',
    name: 'Tasks',
    icon: <CheckCircle2 size={20} color="#5eda9e" strokeWidth={2.2} />,
    popoverIcon: <CheckCircle2 size={24} color="#5eda9e" strokeWidth={2.2} />,
    color: '#5eda9e',
    route: '/tasks',
    isLucide: true,
  },
  {
    id: 'Habits',
    name: 'Habits',
    icon: <Flame size={20} color="#f59e0b" strokeWidth={2.2} />,
    popoverIcon: <Flame size={24} color="#f59e0b" strokeWidth={2.2} />,
    color: '#f59e0b',
    route: '/habits',
    isLucide: true,
  },
  {
    id: 'Calendar',
    name: 'Calendar',
    icon: <Calendar size={20} color="#38bdf8" strokeWidth={2.2} />,
    popoverIcon: <Calendar size={24} color="#38bdf8" strokeWidth={2.2} />,
    color: '#38bdf8',
    route: '/calendar',
    isLucide: true,
  },
  {
    id: 'Notes',
    name: 'Notes',
    icon: <FileText size={20} color="#fad7a1" strokeWidth={2.2} />,
    popoverIcon: <FileText size={24} color="#fad7a1" strokeWidth={2.2} />,
    color: '#fad7a1',
    route: '/notes',
    isLucide: true,
  },
  {
    id: 'Attendance',
    name: 'Attendance',
    icon: <GraduationCap size={20} color="#a599ff" strokeWidth={2.2} />,
    popoverIcon: <GraduationCap size={24} color="#a599ff" strokeWidth={2.2} />,
    color: '#a599ff',
    route: '/attendance',
    isLucide: true,
  },
  {
    id: 'Assignments',
    name: 'Assignments',
    icon: <BookOpen size={20} color="#f472b6" strokeWidth={2.2} />,
    popoverIcon: <BookOpen size={24} color="#f472b6" strokeWidth={2.2} />,
    color: '#f472b6',
    route: '/assignments',
    isLucide: true,
  },
  {
    id: 'Jobs',
    name: 'Jobs',
    icon: <Briefcase size={20} color="#fbbf24" strokeWidth={2.2} />,
    popoverIcon: <Briefcase size={24} color="#fbbf24" strokeWidth={2.2} />,
    color: '#fbbf24',
    route: '/jobs',
    isLucide: true,
  },
  {
    id: 'Grades',
    name: 'Grades',
    icon: <Award size={20} color="#c084fc" strokeWidth={2.2} />,
    popoverIcon: <Award size={24} color="#c084fc" strokeWidth={2.2} />,
    color: '#c084fc',
    route: '/grades',
    isLucide: true,
  },
  {
    id: 'Analytics',
    name: 'Analytics',
    icon: <BarChart3 size={20} color="#38bdf8" strokeWidth={2.2} />,
    popoverIcon: <BarChart3 size={24} color="#38bdf8" strokeWidth={2.2} />,
    color: '#38bdf8',
    route: '/analytics',
    isLucide: true,
  },
  {
    id: 'Learning',
    name: 'Learning',
    icon: <Library size={20} color="#5eda9e" strokeWidth={2.2} />,
    popoverIcon: <Library size={24} color="#5eda9e" strokeWidth={2.2} />,
    color: '#5eda9e',
    route: '/learning',
    isLucide: true,
  },
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
          return parsed.filter((name: string) => name !== 'Gym' && name !== 'Goals');
        }
      } catch (e) {}
    }
    return ['Tasks', 'Calendar', 'Notes', 'Attendance', 'Learning'];
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
    if (isFocused) setIsFocused(false);
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
          pointerEvents: hidden ? 'none' : 'auto',
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={inHeader ? { position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' } : {}}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ opacity: hidden ? 0 : 1 }}
      >
        <div className="dock-pill">
          <DockItem
            key="Home"
            app={{ name: 'Home', icon: <Home size={20} color="#a599ff" strokeWidth={2.2} />, route: '/home', isLucide: true }}
            mouseX={mouseX}
            isActive={location.pathname === '/home' || location.pathname === '/'}
          />
          {pinnedApps.map((name) => {
            const app = ALL_APPS.find((a) => a.name === name);
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
              title="All Modules"
            >
              <div className="dock-item-icon-wrap">
                <LayoutGrid size={20} color="#a599ff" strokeWidth={2.2} />
              </div>
              <span className="dock-item-label">More</span>
            </button>

            <AnimatePresence>
              {isMoreOpen && (
                <motion.div
                  className="dock-popover"
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  {/* Edit Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0 0.5rem 0.8rem 0.5rem',
                      borderBottom: '1px solid rgba(165, 153, 255, 0.12)',
                      marginBottom: '0.8rem',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                      {isEditing ? 'EDIT PINNED MODULES' : 'ALL MODULES'}
                    </span>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isEditing ? '#a599ff' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      title={isEditing ? 'Save Pins' : 'Edit Pins'}
                    >
                      {isEditing ? <Check size={18} /> : <Edit2 size={18} />}
                    </button>
                  </div>

                  {/* Apps Grid */}
                  <div
                    className="dock-popover-grid hide-scrollbar"
                    style={{
                      maxHeight: '420px',
                      overflowY: 'auto',
                      overscrollBehavior: 'contain',
                      paddingRight: '0.25rem',
                      paddingBottom: '0.5rem',
                      overflowX: 'hidden',
                    }}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    <AnimatePresence mode="popLayout">
                      {(isEditing ? ALL_APPS : ALL_APPS.filter((app) => !pinnedApps.includes(app.name))).map((app) => {
                        const isPinned = pinnedApps.includes(app.name);
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                            key={app.name}
                            onMouseEnter={() => prefetchRoute(app.route)}
                            onTouchStart={() => prefetchRoute(app.route)}
                            onClick={() => {
                              if (isEditing) {
                                setPinnedApps((prev) => {
                                  if (prev.includes(app.name)) return prev.filter((n) => n !== app.name);
                                  if (prev.length >= 6) {
                                    toast.error('Maximum 6 pinned apps allowed.');
                                    return prev;
                                  }
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
                              borderColor: isEditing && isPinned ? 'rgba(165,153,255,0.5)' : undefined,
                              background: isEditing && isPinned ? 'rgba(165,153,255,0.08)' : undefined,
                            }}
                          >
                            {isEditing && isPinned && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  right: 6,
                                  background: '#a599ff',
                                  borderRadius: '50%',
                                  padding: '2px',
                                  color: '#000',
                                  zIndex: 2,
                                }}
                              >
                                <Check size={12} />
                              </motion.div>
                            )}
                            <div
                              className="popover-icon-box"
                              style={{
                                backgroundColor: `${app.color}15`,
                                borderColor: `${app.color}30`,
                                opacity: isEditing && !isPinned ? 0.35 : 1,
                              }}
                            >
                              {app.popoverIcon}
                            </div>
                            <span
                              className="popover-app-label"
                              style={{
                                color: isEditing && !isPinned ? 'rgba(255,255,255,0.35)' : undefined,
                              }}
                            >
                              {getDockLabel(app.name)}
                            </span>
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
                        title={isMuted ? 'Unmute Voice' : 'Mute Voice'}
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
                      <button className="logout-btn" onClick={handleLogout} title="Sign Out">
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

const getDockLabel = (name: string) => {
  if (name === 'Learning') return 'Learn';
  if (name === 'Attendance') return 'Attend';
  return name;
};

function DockItem({ app, mouseX, isActive }: { app: any; mouseX: any; isActive: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Calculate distance from mouse to center of this icon
  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Scale based on distance (macOS dock effect)
  const scaleSync = useTransform(distance, [-150, 0, 150], [1, 1.15, 1]);
  const scale = useSpring(scaleSync, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <NavLink
      to={app.route}
      ref={ref}
      style={{ textDecoration: 'none' }}
      onMouseEnter={() => prefetchRoute(app.route)}
      onTouchStart={() => prefetchRoute(app.route)}
    >
      <motion.div className={`dock-item ${isActive ? 'active' : ''}`} style={{ scale }}>
        <div className="dock-item-icon-wrap">
          {app.isLucide ? app.icon : <img src={app.img} alt={app.name} />}
          {isActive && (
            <motion.div
              layoutId="dock-indicator"
              className="dock-indicator"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
        </div>
        <span className="dock-item-label">{getDockLabel(app.name)}</span>
      </motion.div>
    </NavLink>
  );
}


