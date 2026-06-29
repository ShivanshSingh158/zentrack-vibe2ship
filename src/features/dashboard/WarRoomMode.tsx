import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, XCircle, ShieldAlert } from 'lucide-react';

export const WarRoomMode = ({ task, onExit }: { task: any; onExit: () => void }) => {
  if (!task) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(20, 0, 0, 0.95)',
        backdropFilter: 'blur(20px)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ff4444',
        border: '4px solid #ff0000',
      }}
    >
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button 
          onClick={onExit}
          style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }}
        >
          <XCircle size={32} />
        </button>
      </div>

      <motion.div 
        animate={{ scale: [1, 1.1, 1] }} 
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <ShieldAlert size={80} style={{ marginBottom: '20px' }} />
      </motion.div>

      <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '4px' }}>
        WAR ROOM MODE ACTIVE
      </h1>
      
      <div style={{ fontSize: '24px', color: '#ffaaaa', marginBottom: '40px', maxWidth: '600px', textAlign: 'center' }}>
        CRITICAL DEADLINE DETECTED
      </div>

      <div style={{
        background: 'rgba(255, 0, 0, 0.1)',
        padding: '30px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 0, 0, 0.3)',
        width: '600px',
        textAlign: 'center'
      }}>
        {/* ✅ BUG FIX: was task.text — agent-created tasks only have task.title */}
        <h2 style={{ color: '#fff', fontSize: '32px', margin: '0 0 20px 0' }}>{task.title || task.text}</h2>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', color: '#ffaaaa' }}>
            <Clock size={24} />
            {new Date(task.date).toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', color: '#ffaaaa' }}>
            <AlertTriangle size={24} />
            DNA Score: {task.deadlineDNA ?? (() => {
              const hoursLeft = (new Date(task.date).getTime() - Date.now()) / 3_600_000;
              const estimatedH = (task.estimatedMinutes || 60) / 60;
              const urgencyRatio = Math.max(0, Math.min(1, estimatedH / Math.max(0.1, hoursLeft)));
              const priorityMult = task.priority === 'high' ? 1.5 : task.priority === 'medium' ? 1.0 : 0.6;
              return Math.round(Math.min(100, urgencyRatio * priorityMult * 100));
            })()}
          </div>
        </div>

        <button 
          style={{
            marginTop: '40px',
            padding: '16px 32px',
            fontSize: '20px',
            fontWeight: 'bold',
            background: '#ff0000',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '2px'
          }}
          onClick={onExit}
        >
          ACKNOWLEDGE & FOCUS
        </button>
      </div>
    </motion.div>
  );
};
