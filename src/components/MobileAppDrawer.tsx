import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X, LayoutGrid, Edit2, Check,
  BookOpen, CheckSquare, Calendar, StickyNote, Target, Dumbbell, Zap, GraduationCap,
  FileText, Award, Briefcase, BarChart3
} from 'lucide-react';

interface MobileAppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedApps: string[];
  onTogglePin: (appName: string) => void;
}

export const MOBILE_APPS = [
  { name: 'Tasks', icon: <CheckSquare size={26} color="#a599ff" strokeWidth={2.2} />, route: '/tasks', isLucide: true },
  { name: 'Calendar', icon: <Calendar size={26} color="#38bdf8" strokeWidth={2.2} />, route: '/calendar', isLucide: true },
  { name: 'Notes', icon: <StickyNote size={26} color="#fad7a1" strokeWidth={2.2} />, route: '/notes', isLucide: true },
  { name: 'Goals', icon: <Target size={26} color="#818cf8" strokeWidth={2.2} />, route: '/goals', isLucide: true },
  { name: 'Habits', icon: <Zap size={26} color="#f59e0b" strokeWidth={2.2} />, route: '/habits', isLucide: true },
  { name: 'Learning', icon: <BookOpen size={26} color="#5eda9e" strokeWidth={2.2} />, route: '/learning', isLucide: true },
  { name: 'Attendance', icon: <GraduationCap size={26} color="#38bdf8" strokeWidth={2.2} />, route: '/attendance', isLucide: true },
  { name: 'Jobs', icon: <Briefcase size={26} color="#fbbf24" strokeWidth={2.2} />, route: '/jobs', isLucide: true },
  { name: 'Grades', icon: <Award size={26} color="#a599ff" strokeWidth={2.2} />, route: '/grades', isLucide: true },
  { name: 'Analytics', icon: <BarChart3 size={26} color="#38bdf8" strokeWidth={2.2} />, route: '/analytics', isLucide: true },
];

export const MobileAppDrawer: React.FC<MobileAppDrawerProps> = ({ isOpen, onClose, pinnedApps, onTogglePin }) => {
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();

  // When closing drawer, exit edit mode
  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const handleNavigate = (route: string) => {
    handleClose();
    navigate(route);
  };

  const displayedApps = isEditing ? MOBILE_APPS : MOBILE_APPS.filter(app => !pinnedApps.includes(app.name));

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'auto' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* Drawer Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(10, 15, 25, 0.95)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px 24px 0 0',
              padding: '1.5rem',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LayoutGrid size={20} color="#a78bfa" />
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'white' }}>
                  {isEditing ? 'Edit Navigation' : 'All Modules'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  style={{
                    background: isEditing ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isEditing ? '#a78bfa' : 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                  }}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={handleClose}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Grid */}
            <div style={{ overflowY: 'auto', paddingBottom: '2rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {displayedApps.map((app) => {
                  const isPinned = pinnedApps.includes(app.name);
                  return (
                    <button
                      key={app.name}
                      onClick={() => {
                        if (isEditing) {
                          onTogglePin(app.name);
                        } else {
                          handleNavigate(app.route);
                        }
                      }}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '16px',
                        padding: '1rem 0.5rem',
                        cursor: 'pointer',
                        transition: 'background 0.2s, transform 0.1s, opacity 0.2s',
                        opacity: isEditing && !isPinned ? 0.5 : 1,
                      }}
                      onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      {app.isLucide ? (
                        <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                          {app.icon}
                        </div>
                      ) : (
                        <img src={(app as any).img} alt={app.name} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.8)', fontWeight: 500 }}>
                        {app.name}
                      </span>
                      {isEditing && isPinned && (
                        <div style={{
                          position: 'absolute', top: '4px', right: '4px',
                          background: '#a78bfa', color: 'white', borderRadius: '50%',
                          width: '18px', height: '18px', display: 'flex',
                          alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
