import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { X, TrendingUp } from 'lucide-react';
import type { GymDayLog, ExerciseHistoryEntry } from '../../../types/gym.types';

/** Format kg: max 1 decimal, strip trailing zero */
const fmtKg = (v: number | null | undefined) => {
  if (v == null || isNaN(v)) return '—';
  return parseFloat(v.toFixed(1)).toString();
};

interface ExerciseHistoryDrawerProps {
  userId: string;
  exerciseId: string;
  exerciseName: string;
  onClose: () => void;
}

function SparkBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', flex: 1, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: '99px', transition: 'width 0.4s' }} />
    </div>
  );
}

export const ExerciseHistoryDrawer = ({ userId, exerciseId, exerciseName, onClose }: ExerciseHistoryDrawerProps) => {
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'gymLogs'), where('userId', '==', userId));
        const snap = await getDocs(q);
        const entries: ExerciseHistoryEntry[] = [];
        snap.forEach(doc => {
          const logData = doc.data() as GymDayLog;
          const ex = logData.exercises?.find(
            e => e.exerciseId === exerciseId || e.name.toLowerCase() === exerciseName.toLowerCase()
          );
          if (!ex) return;
          const completedSets = ex.setsLog.filter(s => s.completed);
          const maxWeight = completedSets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
          const totalReps = completedSets.reduce((s, set) => s + (set.reps ?? 0), 0);
          if (completedSets.length > 0 || ex.setsLog.length > 0) {
            entries.push({
              date: logData.date, maxWeightKg: maxWeight, totalReps,
              completedSets: completedSets.length, totalSets: ex.setsLog.length,
              setsLog: ex.setsLog,
            });
          }
        });
        entries.sort((a, b) => b.date.localeCompare(a.date));
        setHistory(entries.slice(0, 15));
      } catch (e) {
        console.warn('[ExerciseHistory]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, exerciseId, exerciseName]);

  const maxWeight = history.reduce((m, h) => Math.max(m, h.maxWeightKg), 0);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const trend = history.length >= 2
    ? history[0].maxWeightKg > history[1].maxWeightKg ? '↑ Progressing'
    : history[0].maxWeightKg < history[1].maxWeightKg ? '↓ Regressing'
    : '→ Stable'
    : null;

  const trendColor = trend?.startsWith('↑') ? '#1db954' : trend?.startsWith('↓') ? '#ef4444' : '#f59e0b';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 2500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={15} style={{ color: '#a855f7' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exerciseName}</div>
            {trend && <div style={{ fontSize: '0.68rem', color: trendColor, fontWeight: 600 }}>{trend}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} />
          </button>
        </div>

        {/* Summary bar */}
        {!loading && history.length > 0 && (
          <div style={{ padding: '0.65rem 1.1rem', display: 'flex', gap: '1rem', background: 'rgba(124,58,237,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a855f7' }}>{fmtKg(maxWeight)}kg</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>All-time max</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{history.length}</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Sessions</div>
            </div>
            {history[0] && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1db954' }}>{fmtKg(history[0].maxWeightKg)}kg</div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Last session</div>
              </div>
            )}
          </div>
        )}

        {/* History list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.1rem', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.88rem' }}>
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)' }}>
              <TrendingUp size={28} style={{ opacity: 0.3, margin: '0 auto 0.5rem', display: 'block' }} />
              <div style={{ fontSize: '0.88rem' }}>No history yet</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Complete some sets to see your progress</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {history.map((entry, i) => (
                <div key={entry.date} style={{ padding: '0.7rem 0.85rem', borderRadius: '12px', background: i === 0 ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: i === 0 ? '#a855f7' : 'rgba(255,255,255,0.7)' }}>{formatDate(entry.date)}</span>
                    {i === 0 && <span style={{ fontSize: '0.58rem', padding: '0.08rem 0.3rem', borderRadius: '99px', background: 'rgba(124,58,237,0.2)', color: '#a855f7', fontWeight: 700 }}>LATEST</span>}
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', marginLeft: 'auto' }}>
                      {entry.completedSets}/{entry.totalSets} sets
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {entry.setsLog.filter(s => s.completed).map((s, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.28)', width: '16px', flexShrink: 0 }}>{s.setNumber}</span>
                        <SparkBar value={s.weight ?? 0} max={maxWeight} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.weight === maxWeight && maxWeight > 0 ? '#fbbf24' : 'rgba(255,255,255,0.7)', width: '56px', textAlign: 'right', flexShrink: 0 }}>
                          {fmtKg(s.weight)}×{s.reps ?? 0}
                        </span>
                      </div>
                    ))}
                    {entry.completedSets === 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)' }}>No completed sets logged</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
