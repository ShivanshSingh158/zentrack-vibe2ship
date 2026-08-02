import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, LayoutGrid, Edit2, Check } from 'lucide-react';

interface MobileAppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedApps: string[];
  onTogglePin: (appName: string) => void;
}

export const MOBILE_APPS = [
  { name: 'Tasks', img: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Google_Tasks_2021.svg', route: '/tasks' },
  { name: 'Calendar', img: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg', route: '/calendar' },
  { name: 'Notes', img: 'https://img.icons8.com/color/96/000000/google-keep.png', route: '/notes' },
  { name: 'Analytics', img: 'https://img.icons8.com/color/96/000000/google-analytics.png', route: '/analytics' },
  { name: 'Assignments', img: 'https://img.icons8.com/color/96/000000/google-classroom.png', route: '/assignments' },
  { name: 'Goals', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Trophy/3D/trophy_3d.png', route: '/goals' },
  { name: 'Habits', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Counterclockwise%20arrows%20button/3D/counterclockwise_arrows_button_3d.png', route: '/habits' },
  { name: 'Jobs', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Briefcase/3D/briefcase_3d.png', route: '/jobs' },
  { name: 'Learning', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Brain/3D/brain_3d.png', route: '/learning' },
  { name: 'Attendance', img: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Graduation%20cap/3D/graduation_cap_3d.png', route: '/attendance' },
  { name: 'Grades', img: 'https://img.icons8.com/color/96/000000/exam.png', route: '/grades' },
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
                    >
                      <img src={app.img} alt={app.name} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
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
