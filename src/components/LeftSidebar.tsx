import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { User } from 'firebase/auth';
import {
  Inbox,
  CalendarDays,
  Flame,
  ChevronDown,
  ChevronRight,
  PanelLeft,
  Plus,
  BookOpen,
  GraduationCap,
  Target,
  Compass,
  Briefcase,
  Sparkles,
  Sun,
  Moon,
  Settings,
  LogOut,
  Activity,
  RotateCw,
  Layers,
  LayoutDashboard,
  BarChart3
} from 'lucide-react';
import { useGlobalData } from '../contexts/GlobalDataContext';
import { getLocalDateString } from '../utils/dateUtils';

// ── Todoist Authentic Icons (Matching Image 2) ──
const TodayCalendarIcon: React.FC<{ size?: number }> = ({ size = 17 }) => {
  const dayNumber = new Date().getDate();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="3" y="4" width="18" height="18" rx="2.5" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <text
        x="12"
        y="18.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      >
        {dayNumber}
      </text>
    </svg>
  );
};


const ProductivityWaveIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <path d="M5 14.5V9.5M9 19V5M13 16V8M17 20V4M21 14V10" />
  </svg>
);

interface LeftSidebarProps {
  user: User | null;
  onLogout: () => void;
  onOpenSecurity?: () => void;
  onOpenSara?: () => void;
  isPlainTheme: boolean;
  onToggleTheme: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  user,
  onLogout,
  onOpenSecurity,
  onOpenSara,
  isPlainTheme,
  onToggleTheme,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { tasks } = useGlobalData();
  const location = useLocation();
  const navigate = useNavigate();
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);

  // Counts
  const pendingInboxCount = useMemo(() => {
    return (tasks || []).filter(t => !t.date && t.status !== 'completed').length;
  }, [tasks]);

  const todayTasks = useMemo(() => {
    return (tasks || []).filter(t => t.date === todayStr);
  }, [tasks, todayStr]);

  const todayPendingCount = useMemo(() => {
    return todayTasks.filter(t => t.status !== 'completed').length;
  }, [todayTasks]);

  const todayDoneCount = useMemo(() => {
    return todayTasks.filter(t => t.status === 'completed').length;
  }, [todayTasks]);

  const todayTotalCount = todayTasks.length;

  const inboxBadgeCount = useMemo(() => {
    if (todayPendingCount > 0) return todayPendingCount;
    return pendingInboxCount;
  }, [todayPendingCount, pendingInboxCount]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const displayName = useMemo(() => {
    if (user?.displayName) {
      return user.displayName.split(' ')[0].toLowerCase();
    }
    if (user?.email) {
      return user.email.split('@')[0].toLowerCase();
    }
    return 'shivansh';
  }, [user]);

  const handleQuickAddTask = () => {
    window.dispatchEvent(new CustomEvent('open-new-task-modal'));
  };

  return (
    <aside
      className={`todoist-sidebar ${isCollapsed ? 'collapsed' : ''}`}
      aria-label="Sidebar Navigation"
    >
      {/* ── USER PROFILE HEADER ── */}
      <div className="todoist-user-row" style={{ position: 'relative' }}>
        {!isCollapsed && (
          <button
            type="button"
            className="todoist-user-btn"
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            title="User Profile & Quick Settings"
            aria-expanded={isUserMenuOpen}
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="todoist-avatar"
                style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, maxWidth: 32, maxHeight: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: 'none', outline: 'none', boxShadow: 'none' }}
              />
            ) : (
              <div className="todoist-avatar" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32, borderRadius: '50%', flexShrink: 0, border: 'none', boxShadow: 'none' }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="todoist-user-name">{displayName}</span>
            <ChevronDown
              size={15}
              strokeWidth={2}
              style={{
                transform: isUserMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
                opacity: 0.7,
                flexShrink: 0
              }}
            />
          </button>
        )}

        <div className="todoist-header-actions" style={isCollapsed ? { width: '100%', justifyContent: 'center' } : {}}>
          <button
            type="button"
            className="todoist-icon-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeft size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* ── USER PROFILE DROPDOWN MENU ── */}
        <AnimatePresence>
          {isUserMenuOpen && !isCollapsed && (
            <>
              {/* Click-away backdrop */}
              <div
                className="todoist-user-menu-backdrop"
                onClick={() => setIsUserMenuOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 999,
                  background: 'transparent',
                }}
              />
              <motion.div
                ref={userMenuRef}
                className="todoist-user-menu-popover"
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Profile Summary */}
                <div
                  className="user-menu-profile-row"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/tasks');
                  }}
                  title="View Tasks & Daily Plan"
                >
                  <div className="user-menu-avatar-badge">
                    <Activity size={15} />
                  </div>
                  <div className="user-menu-profile-info">
                    <div className="user-menu-profile-name">{user?.displayName || displayName}</div>
                    <div className="user-menu-profile-tasks">{todayDoneCount}/{todayTotalCount} tasks completed</div>
                  </div>
                  <span className="user-menu-shortcut">O then P</span>
                </div>

                <div className="user-menu-divider" />

                {/* Settings */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSecurity?.();
                  }}
                  title="Account & Security Settings"
                >
                  <div className="user-menu-item-left">
                    <Settings size={15} />
                    <span>Settings</span>
                  </div>
                  <span className="user-menu-shortcut">O then S</span>
                </button>

                {/* Theme Toggle */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onToggleTheme();
                  }}
                  title="Toggle Dark / Light Theme"
                >
                  <div className="user-menu-item-left">
                    {isPlainTheme ? <Moon size={15} /> : <Sun size={15} />}
                    <span>{isPlainTheme ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                </button>

                {/* Cloud & Integrations */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/integrations');
                  }}
                  title="Google Calendar & Workspace Integrations"
                >
                  <div className="user-menu-item-left">
                    <Layers size={15} />
                    <span>Integrations</span>
                  </div>
                </button>

                <div className="user-menu-divider" />

                {/* Academic & Attendance */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/attendance');
                  }}
                  title="Academic Attendance & Bunk Manager"
                >
                  <div className="user-menu-item-left">
                    <GraduationCap size={15} />
                    <span>Attendance & Classes</span>
                  </div>
                </button>

                {/* Notes & Knowledge Vault */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/notes');
                  }}
                  title="ZenNotes & PDF Storage"
                >
                  <div className="user-menu-item-left">
                    <BookOpen size={15} />
                    <span>Notes & Studio Vault</span>
                  </div>
                </button>

                {/* Goals & OKRs */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/goals');
                  }}
                  title="Life Goals & Milestones"
                >
                  <div className="user-menu-item-left">
                    <Target size={15} />
                    <span>Goals & Milestones</span>
                  </div>
                </button>

                {/* Weekly Review */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/review');
                  }}
                  title="Weekly Productivity Review"
                >
                  <div className="user-menu-item-left">
                    <RotateCw size={15} />
                    <span>Weekly Review</span>
                  </div>
                </button>

                {/* Analytics */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate('/analytics');
                  }}
                  title="Analytics & Habit Reports"
                >
                  <div className="user-menu-item-left">
                    <BarChart3 size={15} />
                    <span>Analytics</span>
                  </div>
                  <span className="user-menu-shortcut">G then A</span>
                </button>

                <div className="user-menu-divider" />

                {/* SARA AI Copilot */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenSara?.();
                  }}
                  title="SARA AI Voice Assistant"
                >
                  <div className="user-menu-item-left">
                    <Sparkles size={15} style={{ color: 'var(--zen-purple, #7c3aed)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--zen-purple, #7c3aed)' }}>SARA AI Voice</span>
                  </div>
                </button>

                <div className="user-menu-divider" />

                {/* Log out */}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  title="Log out of ZenTrack"
                >
                  <div className="user-menu-item-left">
                    <LogOut size={15} />
                    <span>Log out</span>
                  </div>
                </button>

                <div className="user-menu-divider" />

                {/* Footer */}
                <div className="user-menu-footer">
                  <span>ZenTrack Life OS</span>
                  <span>v1.2.0</span>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── QUICK ADD TASK BUTTON ── */}
      <div className="todoist-add-task-row">
        <button
          type="button"
          className="todoist-add-task-btn"
          onClick={handleQuickAddTask}
          title="Add task"
        >
          <span className="plus-circle">
            <Plus size={14} strokeWidth={2.6} />
          </span>
          {!isCollapsed && <span className="add-task-label">Add task</span>}
        </button>
        {!isCollapsed && (
          <button
            type="button"
            className="todoist-add-task-side-btn"
            onClick={() => navigate('/analytics')}
            title="Productivity pulse & telemetry"
          >
            <ProductivityWaveIcon size={18} />
          </button>
        )}
      </div>

      {/* ── NAVIGATION LIST (Dashboard First, Then Inbox) ── */}
      <nav className="todoist-nav-list">
        {/* 1. Dashboard */}
        <NavLink
          to="/home"
          className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
          title="Dashboard"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <LayoutDashboard size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Dashboard</span>}
          </div>
        </NavLink>

        {/* 2. Inbox */}
        <NavLink
          to="/tasks"
          className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
          title="Inbox"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <Inbox size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Inbox</span>}
          </div>
          {!isCollapsed && inboxBadgeCount > 0 && (
            <span className="todoist-badge">{inboxBadgeCount}</span>
          )}
        </NavLink>

        {/* 3. Calendar */}
        <NavLink
          to="/calendar"
          className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
          title="Calendar"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <CalendarDays size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Calendar</span>}
          </div>
        </NavLink>

        {/* 5. Habits */}
        <NavLink
          to="/habits"
          className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
          title="Habits"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <Flame size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Habits</span>}
          </div>
        </NavLink>

        {/* 6. Analytics */}
        <NavLink
          to="/analytics"
          className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
          title="Analytics"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <BarChart3 size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Analytics</span>}
          </div>
        </NavLink>

        {/* ── COLLAPSIBLE: WORKSPACE (My Projects) ── */}
        {!isCollapsed && (
          <button
            type="button"
            className="todoist-section-header"
            onClick={() => setIsProjectsOpen(!isProjectsOpen)}
            title="Toggle Workspace"
          >
            <span>Workspace</span>
            <span className="todoist-section-chevron">
              {isProjectsOpen ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
            </span>
          </button>
        )}

        {(isProjectsOpen || isCollapsed) && (
          <>
            {/* Notes & Docs */}
            <NavLink
              to="/notes"
              className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
              title="Notes"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <BookOpen size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Notes</span>}
              </div>
            </NavLink>

            {/* Attendance */}
            <NavLink
              to="/attendance"
              className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
              title="Attendance"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <GraduationCap size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Attendance</span>}
              </div>
            </NavLink>

            {/* Learning Checklist */}
            <NavLink
              to="/learning"
              className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
              title="Learning"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <Compass size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Learning</span>}
              </div>
            </NavLink>

            {/* Goals & OKRs */}
            <NavLink
              to="/goals"
              className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
              title="Goals"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <Target size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Goals</span>}
              </div>
            </NavLink>

            {/* Job Tracker */}
            <NavLink
              to="/jobs"
              className={({ isActive }) => `todoist-nav-item ${isActive ? 'active' : ''}`}
              title="Job Tracker"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <Briefcase size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Job Tracker</span>}
              </div>
            </NavLink>

            {/* SARA AI (Uniform typography & icon alignment matching all other items) */}
            <button
              type="button"
              className="todoist-nav-item"
              onClick={onOpenSara}
              title="Sara AI Voice Assistant"
            >
              <div className="todoist-nav-item-left">
                <span className="todoist-nav-item-icon">
                  <Sparkles size={17} strokeWidth={1.8} />
                </span>
                {!isCollapsed && <span>Sara AI</span>}
              </div>
            </button>
          </>
        )}
      </nav>

      {/* ── SIDEBAR FOOTER (Settings, Dark Mode, Help & Resources) ── */}
      <div className="todoist-sidebar-footer">
        {/* Settings */}
        <button
          type="button"
          className="todoist-nav-item"
          onClick={() => onOpenSecurity?.()}
          title="Settings"
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              <Settings size={17} strokeWidth={1.8} />
            </span>
            {!isCollapsed && <span>Settings</span>}
          </div>
        </button>

        {/* Dark Mode / Light Mode Toggle */}
        <button
          type="button"
          className="todoist-nav-item"
          onClick={onToggleTheme}
          title={isPlainTheme ? 'Switch to Dark mode' : 'Switch to Light mode'}
        >
          <div className="todoist-nav-item-left">
            <span className="todoist-nav-item-icon">
              {isPlainTheme ? <Moon size={17} strokeWidth={1.8} /> : <Sun size={17} strokeWidth={1.8} />}
            </span>
            {!isCollapsed && <span>{isPlainTheme ? 'Dark mode' : 'Light mode'}</span>}
          </div>
        </button>
      </div>
    </aside>
  );
};
