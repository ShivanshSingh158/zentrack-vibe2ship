import { NavLink, Link } from 'react-router-dom';
import {
  Briefcase, ListTodo, GraduationCap, LogOut, Play, Pause, Zap,
  Home, Calendar, Target, BookOpen, X, Flame, BarChart3, Menu,
  ClipboardCheck, ClipboardList, Settings2, GripVertical, Check, Wrench, Dumbbell, ShieldAlert
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { usePomodoroContext } from '../contexts/PomodoroContext';
import { useState, useCallback, useEffect } from 'react';

interface SidebarProps {
  user: User;
  onLogout: () => void;
  onOpenSecurity?: () => void;
}

// ── All available modules ──────────────────────────────────────────────────
interface ModuleDef {
  id: string;
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ReactNode;
  mobileOnly?: boolean;
  isPremium?: boolean;
}


const ALL_MODULES: ModuleDef[] = [
  // ── Primary: Daily-use modules (Core AI Suite Focus) ──
  { id: 'home',        label: 'Home',          shortLabel: 'Home',    path: '/home',        icon: <Home size={20} /> },
  { id: 'todo',        label: 'To-Do',         shortLabel: 'To-Do',   path: '/todo',        icon: <ListTodo size={20} /> },
  { id: 'calendar',    label: 'Calendar',      shortLabel: 'Cal.',    path: '/calendar',    icon: <Calendar size={20} /> },
  { id: 'goals',       label: 'Goals & OKRs',  shortLabel: 'Goals',   path: '/goals',       icon: <Target size={20} /> },
  { id: 'gym',         label: 'Gym AI',        shortLabel: 'Gym',     path: '/gym',         icon: <Dumbbell size={20} /> },

  // ── Secondary: Less frequent / Clutter modules (Hidden in "More") ──
  { id: 'notes',       label: 'Smart Storage', shortLabel: 'Notes',   path: '/notes',       icon: <BookOpen size={20} color="#fbbf24" /> },
  { id: 'habits',      label: 'Habits',        shortLabel: 'Habits',  path: '/habits',      icon: <Flame size={20} /> },
  { id: 'learning',    label: 'Learning',      shortLabel: 'Learn',   path: '/learning',    icon: <GraduationCap size={20} /> },
  { id: 'tools',       label: 'Power Tools',   shortLabel: 'Tools',   path: '/tools',       icon: <Wrench size={20} /> },
  { id: 'jobs',        label: 'Job Tracker',   shortLabel: 'Jobs',    path: '/jobs',        icon: <Briefcase size={20} /> },
  { id: 'analytics',   label: 'Analytics',     shortLabel: 'Stats',   path: '/analytics',   icon: <BarChart3 size={20} /> },
  { id: 'attendance',  label: 'Attendance',    shortLabel: 'Attend.', path: '/attendance',  icon: <ClipboardCheck size={20} /> },
  { id: 'assignments', label: 'Assignments',   shortLabel: 'Assign.', path: '/assignments', icon: <ClipboardList size={20} /> },
  { id: 'integrations',label: 'Integrations',  shortLabel: 'Connect', path: '/integrations',icon: <Zap size={20} /> },
];

// The index where secondary modules start (after primary group)
const SECONDARY_START_INDEX = 5;

// Home is always pinned first; max 4 more can be pinned to bottom bar
const DEFAULT_PINNED = ['home', 'todo', 'goals', 'calendar', 'gym'];
const STORAGE_KEY = 'nav_pinned_v4';
const MAX_PINNED = 5; // including home = 4 user slots

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      // validate all ids exist
      const valid = parsed.filter(id => ALL_MODULES.some(m => m.id === id));
      if (valid.length > 0) return valid;
    }
  } catch { /* ignore */ }
  return DEFAULT_PINNED;
}

function savePinned(pinned: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
}

// ── Sidebar Component ─────────────────────────────────────────────────────
export function Sidebar({ user, onLogout, onOpenSecurity }: SidebarProps) {
  const { state, pauseTimer, resumeTimer, formatTime, dismissTimer, toggleFocusMode, setDuration } = usePomodoroContext();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [pinned, setPinned] = useState<string[]>(loadPinned);

  // Clean up any "ghost" tabs that no longer exist (like daily log)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(prev => {
      const valid = prev.filter(id => ALL_MODULES.some(m => m.id === id));
      if (valid.length !== prev.length) {
        savePinned(valid);
        return valid;
      }
      return prev;
    });
  }, []);

  // Pin / unpin a module in the customize panel
  const togglePin = useCallback((id: string) => {
    if (id === 'home') return; // home always pinned
    setPinned(prev => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter(p => p !== id);
      } else {
        if (prev.length >= MAX_PINNED) {
          // replace last non-home pinned
          next = [...prev.slice(0, MAX_PINNED - 1), id];
        } else {
          next = [...prev, id];
        }
      }
      savePinned(next);
      return next;
    });
  }, []);

  // Move pinned item up/down
  const movePinned = useCallback((id: string, dir: -1 | 1) => {
    setPinned(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 1 || newIdx >= prev.length) return prev; // can't move home (index 0)
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      savePinned(next);
      return next;
    });
  }, []);

  const pinnedModules = pinned.map(id => ALL_MODULES.find(m => m.id === id)!).filter(Boolean);
  const moreModules   = ALL_MODULES.filter(m => !pinned.includes(m.id));

  const closeAll = () => { setShowMobileMenu(false); setShowCustomize(false); };

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/home" className="app-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
            <img src="/logo.png" alt="Zentrack" className="logo-icon" style={{ width: 24, height: 24, borderRadius: '6px' }} />
            <span>Zentrack</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {/* Pinned links always visible */}
          {pinnedModules.map(m => (
            <NavLink key={m.id} to={m.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${m.mobileOnly ? 'hide-on-desktop' : ''}`} style={m.isPremium ? { color: '#fbbf24' } : undefined}>
              {m.icon}
              <span>{m.label}</span>
            </NavLink>
          ))}

          {/* Mobile "More" trigger */}
          <div className="nav-item mobile-menu-trigger" onClick={() => setShowMobileMenu(true)} style={{ cursor: 'pointer' }}>
            <Menu size={18} />
            <span>More</span>
          </div>

          {/* Desktop-only: remaining primary modules */}
          <div className="desktop-only-links">
            {moreModules.filter(m => {
              const idx = ALL_MODULES.findIndex(am => am.id === m.id);
              return idx < SECONDARY_START_INDEX;
            }).map(m => (
              <NavLink key={m.id} to={m.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${m.mobileOnly ? 'hide-on-desktop' : ''}`} style={m.isPremium ? { color: '#fbbf24' } : undefined}>
                {m.icon}
                <span>{m.label}</span>
              </NavLink>
            ))}

            {/* Divider between primary and secondary */}
            {moreModules.some(m => ALL_MODULES.findIndex(am => am.id === m.id) >= SECONDARY_START_INDEX) && (
              <div style={{ padding: '0.5rem 0.75rem', margin: '0.25rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>More</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>
              </div>
            )}

            {/* Secondary modules — slightly dimmer */}
            {moreModules.filter(m => {
              const idx = ALL_MODULES.findIndex(am => am.id === m.id);
              return idx >= SECONDARY_START_INDEX;
            }).map(m => (
              <NavLink key={m.id} to={m.path} className={({ isActive }) => `nav-item secondary ${isActive ? 'active' : ''} ${m.mobileOnly ? 'hide-on-desktop' : ''}`} style={m.isPremium ? { color: '#fbbf24' } : undefined}>
                {m.icon}
                <span>{m.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Mini Pomodoro Indicator */}
          {state.taskId && (
            <div className="hide-on-mobile" style={{
              marginTop: 'auto', padding: '0.75rem',
              background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Focusing On</div>
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  <button className="btn-icon" onClick={toggleFocusMode} style={{ padding: '0.2rem', color: 'var(--text-muted)' }} title="Focus Mode"><Zap size={14} /></button>
                  <button className="btn-icon" onClick={dismissTimer} style={{ padding: '0.2rem', color: 'var(--text-muted)' }} aria-label="Dismiss"><X size={14} /></button>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state.taskText}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(135deg, #a855f7, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>{formatTime(state.timeLeft)}</span>
                <div style={{ display: 'flex', gap: '0.2rem', marginLeft: 'auto' }}>
                  {!state.isRunning && (
                    <>
                      <button className="btn-icon" onClick={() => setDuration(Math.max(1, Math.floor(state.timeLeft / 60) - 5))} style={{ fontSize: '0.65rem', padding: '0.2rem', fontWeight: 700 }}>-5</button>
                      <button className="btn-icon" onClick={() => setDuration(Math.floor(state.timeLeft / 60) + 5)} style={{ fontSize: '0.65rem', padding: '0.2rem', fontWeight: 700 }}>+5</button>
                    </>
                  )}
                  <button className="btn-icon" onClick={() => state.isRunning ? pauseTimer() : resumeTimer()} style={{ padding: '0.3rem' }}>
                    {state.isRunning ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </nav>


        <div className="sidebar-footer">
          <div className="user-profile">
            {user.photoURL
              ? <img src={user.photoURL} alt="Profile" className="user-avatar" loading="lazy" decoding="async" />
              : <div className="user-avatar-fallback">{user.displayName?.charAt(0) || 'U'}</div>}
            <span className="user-name">{user.displayName}</span>
          </div>
          <button className="btn-logout" onClick={onLogout} title="Logout"><LogOut size={16} /></button>
        </div>
      </aside>

      {/* ── Mobile Bottom Sheet (More Menu) ── */}
      {showMobileMenu && !showCustomize && (
        <div className="mobile-sheet-overlay" onClick={closeAll}>
          <div className="mobile-sheet-content" onClick={e => e.stopPropagation()}>

            {/* Sheet header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <img src="/logo.png" alt="Zentrack" className="logo-icon" style={{ width: 18, height: 18, borderRadius: '4px' }} /> All Modules
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => setShowCustomize(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem',
                    background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
                    color: '#a855f7', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  <Settings2 size={13} /> Customize Nav
                </button>
                <button className="btn-icon" onClick={closeAll} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: '0.4rem' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Module grid — only non-pinned modules (pinned ones are on the bottom bar already) */}
            <div className="mobile-sheet-grid">
              {moreModules.map(m => (
                <NavLink
                  key={m.id}
                  to={m.path}
                  className={({ isActive }) => `sheet-item ${isActive ? 'active' : ''}`}
                  onClick={closeAll}
                  style={m.isPremium ? { color: '#fbbf24' } : undefined}
                >
                  <div className="sheet-icon">{m.icon}</div>
                  <span>{m.label}</span>
                </NavLink>
              ))}

              <div className="sidebar-bottom-actions">
                <button 
                  className="action-button logout-button"
                  onClick={onOpenSecurity}
                  title="Security & Privacy"
                >
                  <div className="action-icon" style={{ color: '#8b5cf6' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <span className="action-text">Security</span>
                </button>

                <button 
                  className="action-button logout-button"
                  onClick={onLogout}
                  title="Logout"
                >
                  <div className="action-icon">
                    <LogOut size={20} />
                  </div>
                  <span className="action-text">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customize Nav Bottom Sheet ── */}
      {showMobileMenu && showCustomize && (
        <div className="mobile-sheet-overlay" onClick={closeAll}>
          <div className="mobile-sheet-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings2 size={18} style={{ color: 'var(--accent-primary)' }} /> Customize Nav
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Choose up to {MAX_PINNED} tabs to pin in the bottom bar
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setShowCustomize(false)}
                  style={{ padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Check size={13} /> Done
                </button>
                <button className="btn-icon" onClick={closeAll} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: '0.4rem' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Bottom Bar Preview */}
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                Bottom Bar Preview
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                {pinnedModules.map(m => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', opacity: 1 }}>
                    <div style={{ color: 'var(--accent-primary)' }}>{m.icon}</div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{m.shortLabel}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', opacity: 0.5 }}>
                  <Menu size={20} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>More</span>
                </div>
              </div>
            </div>

            {/* Pinned list — reorderable */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>📌 Pinned to Bar ({pinned.length}/{MAX_PINNED})</span>
                <span style={{ color: 'var(--accent-primary)', opacity: 0.7 }}>tap to unpin</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {pinnedModules.map((m, idx) => (
                  <div
                    key={m.id}
                    className={m.mobileOnly ? 'hide-on-desktop' : ''}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)',
                      background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
                    }}
                  >
                    <GripVertical size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ color: '#a855f7', flexShrink: 0 }}>{m.icon}</div>
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{m.label}</span>
                    {/* Up/Down reorder */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <button
                        onClick={() => movePinned(m.id, -1)}
                        disabled={idx <= 1 || m.id === 'home'}
                        style={{ background: 'none', border: 'none', cursor: idx <= 1 ? 'default' : 'pointer', color: idx <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: '0.1rem', lineHeight: 1, fontSize: '0.7rem' }}
                      >▲</button>
                      <button
                        onClick={() => movePinned(m.id, 1)}
                        disabled={idx === pinnedModules.length - 1 || m.id === 'home'}
                        style={{ background: 'none', border: 'none', cursor: idx === pinnedModules.length - 1 ? 'default' : 'pointer', color: idx === pinnedModules.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: '0.1rem', lineHeight: 1, fontSize: '0.7rem' }}
                      >▼</button>
                    </div>
                    {m.id !== 'home' && (
                      <button
                        onClick={() => togglePin(m.id)}
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                      >
                        Remove
                      </button>
                    )}
                    {m.id === 'home' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>always</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* More modules — tap to add */}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>☰ In "More" menu</span>
                <span style={{ color: 'var(--accent-primary)', opacity: 0.7 }}>tap to pin</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {moreModules.map(m => (
                  <div
                    key={m.id}
                    onClick={() => togglePin(m.id)}
                    className={m.mobileOnly ? 'hide-on-desktop' : ''}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                      cursor: pinned.length >= MAX_PINNED ? 'not-allowed' : 'pointer',
                      opacity: pinned.length >= MAX_PINNED ? 0.5 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{m.icon}</div>
                    <span style={{ flex: 1, fontSize: '0.9rem' }}>{m.label}</span>
                    {pinned.length < MAX_PINNED && (
                      <span style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 600, background: 'rgba(124,58,237,0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(124,58,237,0.2)' }}>
                        + Pin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                onClick={() => { setPinned(DEFAULT_PINNED); savePinned(DEFAULT_PINNED); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reset to defaults
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
