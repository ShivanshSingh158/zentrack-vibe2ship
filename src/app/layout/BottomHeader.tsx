import React from 'react';
import { FloatingDock } from '../../components/FloatingDock';

export const BottomHeader: React.FC = () => {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      height: '80px',
      background: 'transparent',
      borderTop: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 32px',
      zIndex: 1000,
      pointerEvents: 'none',
    }}>
      <div style={{ transform: 'translateY(-4px)', pointerEvents: 'auto' }}>
        <FloatingDock hidden={false} inHeader={true} />
      </div>
    </div>
  );
};
