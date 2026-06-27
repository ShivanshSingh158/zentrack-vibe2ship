import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, Clock, FileText, Trash2 } from 'lucide-react';
import { missionReportStore } from '../../stores/missionReportStore';

export const ReportArchive: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Subscribe to the store
  const reports = useSyncExternalStore(missionReportStore.subscribe, missionReportStore.getSnapshot);

  useEffect(() => {
    const handleShow = () => setIsOpen(true);
    window.addEventListener('show-report-archive', handleShow);
    return () => window.removeEventListener('show-report-archive', handleShow);
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '85vh',
          background: 'rgba(10, 10, 15, 0.95)',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(168, 85, 247, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Archive size={18} style={{ color: '#c084fc' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', letterSpacing: '0.05em' }}>MISSION ARCHIVES</h2>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {reports.length > 0 && (
              <button 
                onClick={() => missionReportStore.clearReports()}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
              <Archive size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
              <p>No mission reports archived yet.</p>
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(168, 85, 247, 0.15)',
                borderRadius: '8px',
                padding: '16px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
              onClick={() => {
                // Open the actual mission report viewer
                window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result: report.content } }));
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d8b4fe', fontSize: '0.9rem', fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: '12px', wordBreak: 'break-word' }}>
                    <FileText size={16} style={{ flexShrink: 0 }} />
                    {(() => {
                      const words = report.summary.split(' ');
                      return words.length > 5 ? words.slice(0, 3).join(' ') + '...' : report.summary;
                    })()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '0.8rem', flexShrink: 0 }}>
                    <Clock size={12} />
                    {(() => {
                      const d = new Date(report.timestamp);
                      const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().slice(-2)}`;
                      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return `${dateStr}, ${timeStr}`;
                    })()}
                  </div>
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {report.content.replace(/🏷️.*?(\n|$)/, '').replace(/🎯.*?(\n|$)/, '').replace(/<\/?b>/gi, '').replace(/\*\*/g, '').replace(/#/g, '').replace(/\n/g, ' ').trim()}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
