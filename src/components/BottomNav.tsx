import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, CheckSquare, Calendar, Sparkles, LayoutGrid } from 'lucide-react';
import '../styles/bottom-nav.css';

export const BottomNav: React.FC = () => {
  const location = useLocation();

  const handleOpenAgent = () => {
    window.dispatchEvent(new CustomEvent('toggle-zen-agent'));
  };

  const handleOpenDrawer = () => {
    window.dispatchEvent(new CustomEvent('open-app-drawer'));
  };

  const navItems = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
  ];

  const trailingItems = [
    { name: 'Calendar', path: '/calendar', icon: Calendar },
  ];

  return (
    <nav className="bottom-nav-container">
      {navItems.map((item) => (
        <NavLink 
          key={item.name} 
          to={item.path} 
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          {location.pathname === item.path && <div className="bottom-nav-indicator" />}
          <item.icon className="bottom-nav-icon" size={22} strokeWidth={2.2} />
          <span>{item.name}</span>
        </NavLink>
      ))}

      {/* Center AI FAB */}
      <button 
        className="bottom-nav-item ai-fab-tab"
        onClick={handleOpenAgent}
      >
        <div className="bottom-nav-icon">
          <Sparkles size={20} strokeWidth={2.5} />
        </div>
        <span>Agent</span>
      </button>

      {trailingItems.map((item) => (
        <NavLink 
          key={item.name} 
          to={item.path} 
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          {location.pathname === item.path && <div className="bottom-nav-indicator" />}
          <item.icon className="bottom-nav-icon" size={22} strokeWidth={2.2} />
          <span>{item.name}</span>
        </NavLink>
      ))}

      {/* More / Apps Drawer Trigger */}
      <button 
        className="bottom-nav-item"
        onClick={handleOpenDrawer}
      >
        <LayoutGrid className="bottom-nav-icon" size={22} strokeWidth={2.2} />
        <span>More</span>
      </button>
    </nav>
  );
};
