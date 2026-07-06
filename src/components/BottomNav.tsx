import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Mic } from 'lucide-react';
import '../styles/bottom-nav.css';
import { MobileAppDrawer, MOBILE_APPS } from './MobileAppDrawer';

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const [pinnedApps, setPinnedApps] = useState<string[]>(() => {
    const saved = localStorage.getItem('mobile_pinned_apps');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return ['Tasks', 'Calendar']; // Default
  });

  useEffect(() => {
    localStorage.setItem('mobile_pinned_apps', JSON.stringify(pinnedApps));
  }, [pinnedApps]);

  const handleTogglePin = (appName: string) => {
    setPinnedApps(prev => {
      if (prev.includes(appName)) {
        return prev.filter(name => name !== appName);
      }
      if (prev.length >= 5) {
        alert("You can only pin up to 5 apps on the navigation bar.");
        return prev;
      }
      return [...prev, appName];
    });
  };

  const handleToggleVoice = () => {
    window.dispatchEvent(new CustomEvent('toggle-voice-capture'));
  };

  const handleOpenDrawer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMoreOpen(true);
  };

  const leftPinned = pinnedApps.slice(0, Math.ceil(pinnedApps.length / 2));
  const rightPinned = pinnedApps.slice(Math.ceil(pinnedApps.length / 2));

  const renderPinnedApp = (appName: string) => {
    const app = MOBILE_APPS.find(a => a.name === appName);
    if (!app) return null;
    return (
      <NavLink 
        key={app.name} 
        to={app.route} 
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        {location.pathname === app.route && <div className="bottom-nav-indicator" />}
        <img src={app.img} alt={app.name} style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
        <span>{app.name}</span>
      </NavLink>
    );
  };

  return (
    <>
      <nav className="bottom-nav-container">
        
        {/* Left Side Group */}
        <div className="bottom-nav-side">
          <NavLink 
            to="/home" 
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            {location.pathname === '/home' && <div className="bottom-nav-indicator" />}
            <Home className="bottom-nav-icon" size={22} strokeWidth={2.2} />
            <span>Home</span>
          </NavLink>
          {leftPinned.map(renderPinnedApp)}
        </div>

        {/* Center Gap for the absolute-positioned Voice FAB */}
        <div className="bottom-nav-center-spacer" />

        {/* Right Side Group */}
        <div className="bottom-nav-side">
          {rightPinned.map(renderPinnedApp)}
          
          {/* More / Apps Drawer Trigger */}
          <button 
            id="mobile-more-btn"
            className="bottom-nav-item"
            onClick={handleOpenDrawer}
          >
            <LayoutGrid className="bottom-nav-icon" size={22} strokeWidth={2.2} />
            <span>More</span>
          </button>
        </div>

      </nav>

      {/* Mobile-only standalone App Drawer */}
      <MobileAppDrawer 
        isOpen={isMoreOpen} 
        onClose={() => setIsMoreOpen(false)}
        pinnedApps={pinnedApps}
        onTogglePin={handleTogglePin}
      />
    </>
  );
};
