import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Siren, CheckCircle2, Trash2 } from 'lucide-react';
import { generateCrisisTriage } from './generateCrisisTriage';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { toast } from 'sonner';

export const CrisisTriageModal = ({ onClose }: { onClose: () => void }) => {
  const { tasks, goals, habits } = useGlobalData();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    generateCrisisTriage({ tasks, goals, habits })
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error("Triage failed", err);
        setLoading(false);
      });
  }, [tasks, goals, habits]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{
          background: 'rgba(20,10,15,0.95)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '24px', padding: '2rem', width: '90%', maxWidth: '500px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444' }}>
            <Siren size={24} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Crisis Triage Mode</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '3rem 0', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
            Analyzing your pile... finding the one thing that matters.
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{data.message}"
            </p>

            {/* War Room: Top 5 */}
            <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(185,28,28,0.05))', borderRadius: '16px', padding: '1.25rem', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171', marginBottom: '0.75rem', fontWeight: 600 }}>Priority War Room: The 5 Things</div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#fff', fontSize: '1.05rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {data.top5?.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Blocked Calendar */}
            <div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem', fontWeight: 500 }}>Auto-Blocked on Calendar:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.blockCalendarTop3?.map((block: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px' }}>
                    <CheckCircle2 size={16} color="#4ade80" />
                    <span style={{ color: '#e5e7eb', fontSize: '0.95rem', flex: 1 }}>{block.task}</span>
                    <span style={{ color: '#a78bfa', fontSize: '0.85rem', fontWeight: 600 }}>{block.durationMinutes}m</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Drop Today */}
            <div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem', fontWeight: 500 }}>Drop Immediately:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.dropToday?.map((drop: string, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(239,68,68,0.05)', padding: '0.75rem', borderRadius: '12px', opacity: 0.8 }}>
                    <Trash2 size={16} color="#ef4444" />
                    <span style={{ color: '#fca5a5', fontSize: '0.95rem', textDecoration: 'line-through' }}>{drop}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <button onClick={() => {
              // Simulate blocking the calendar via toast
              toast.success("Calendar blocked for your top 3 tasks.");
              onClose();
            }} style={{ width: '100%', padding: '1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem' }}>
              I Understand. I'm Doing It Now.
            </button>
          </div>
        ) : (
          <div style={{ color: '#ef4444' }}>Failed to generate triage. Try again later.</div>
        )}
      </motion.div>
    </div>
  );
};
