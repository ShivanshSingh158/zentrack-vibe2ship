import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Target, Activity, CheckCircle, Info, Calendar as CalendarIcon, Zap } from 'lucide-react';
import type { GymDayLog } from '../../../types/gym.types';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../../data/gymPlan';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange(dateStr: string) {
  // Assuming Monday is the start of the week
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 is Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMonday);
  
  const dates = Array.from({ length: 7 }, (_, i) => {
    const td = new Date(start);
    td.setDate(start.getDate() + i);
    return `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
  });
  
  return { start: dates[0], end: dates[6], dates };
}

function getMuscleColor(muscle: string) {
  const colors: Record<string, string> = {
    Chest: '#3b82f6',
    Back: '#10b981',
    Legs: '#f59e0b',
    Shoulders: '#8b5cf6',
    Arms: '#ec4899',
    Core: '#ef4444',
  };
  // Handle unknown/custom muscles
  for (const [k, v] of Object.entries(colors)) {
    if (muscle.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#a855f7';
}

// ── Component ────────────────────────────────────────────────────────────────

interface WeeklyGymInsightsProps {
  userId: string | null;
  selectedDate: string;
}

export const WeeklyGymInsights = ({ userId, selectedDate }: WeeklyGymInsightsProps) => {
  const [logs, setLogs] = useState<GymDayLog[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end, dates } = useMemo(() => getWeekRange(selectedDate), [selectedDate]);

  useEffect(() => {
    async function fetchWeekLogs() {
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const q = query(
          collection(db, 'gymLogs'),
          where('userId', '==', userId),
          where('date', '>=', start),
          where('date', '<=', end)
        );
        const snap = await getDocs(q);
        const fetched: GymDayLog[] = [];
        snap.forEach(d => fetched.push(d.data() as GymDayLog));
        setLogs(fetched);
      } catch (e) {
        console.error('Failed to fetch weekly insights:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchWeekLogs();
  }, [userId, start, end]);

  // Compute insights
  const insights = useMemo(() => {
    let totalVolume = 0;
    let completedSets = 0;
    let targetSets = 0;
    let workoutCount = 0;
    const muscleSets: Record<string, { hit: number; missed: number }> = {};

    logs.forEach(log => {
      let isWorkout = false;
      log.exercises?.forEach(ex => {
        const muscleName = ex.muscle;
        if (!muscleName) return;
        if (!muscleSets[muscleName]) muscleSets[muscleName] = { hit: 0, missed: 0 };
        
        targetSets += ex.targetSets || ex.setsLog.length;
        
        ex.setsLog.forEach(set => {
          if (set.completed) {
            completedSets++;
            isWorkout = true;
            muscleSets[muscleName].hit++;
            if (set.weight && set.reps) totalVolume += set.weight * set.reps;
          } else if (!ex.skipped) {
            muscleSets[muscleName].missed++;
          }
        });
      });
      if (isWorkout) workoutCount++;
    });

    const muscles = Object.entries(muscleSets)
      .map(([name, stats]) => ({ name, ...stats, total: stats.hit + stats.missed }))
      .sort((a, b) => b.total - a.total);

    return { totalVolume, completedSets, targetSets, workoutCount, muscles };
  }, [logs]);

  if (loading) {
    return (
      <div style={{ margin: '1.25rem 1rem', padding: '2rem 1.25rem', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a855f7', animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.8rem' }}>Crunching weekly numbers...</div>
      </div>
    );
  }

  const startDateFmt = new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDateFmt = new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="liquid-panel" style={{ margin: '1rem', padding: '1.25rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.15rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={18} color="#a855f7" /> Weekly Insights
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
            {startDateFmt} — {endDateFmt}
          </div>
        </div>
        <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', padding: '0.3rem 0.6rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#a855f7' }}>{insights.workoutCount}</span>
          <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Workouts</span>
        </div>
      </div>

      {/* Week Glance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
        {dates.map((d, i) => {
          const dayLog = logs.find(l => l.date === d);
          const hasSets = dayLog?.exercises?.some(ex => ex.setsLog.some(s => s.completed));
          const isRest = GYM_PLAN.find(p => p.dayIndex === WEEKDAY_TO_PLAN[new Date(d + 'T00:00:00').getDay()])?.isRest;
          
          let color = 'rgba(255,255,255,0.08)';
          let dot = null;
          
          if (hasSets) {
            color = '#1db954';
          } else if (isRest) {
            color = 'rgba(255,255,255,0.15)';
            dot = <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />;
          } else if (new Date(d) < new Date(selectedDate)) {
            color = '#ef4444'; // Missed
          }

          return (
            <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: d === selectedDate ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                {['M','T','W','T','F','S','S'][i]}
              </div>
              <div style={{ 
                width: '100%', height: '24px', borderRadius: '6px', 
                background: color, border: d === selectedDate ? '1px solid rgba(255,255,255,0.4)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {dot}
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
            <Activity size={12} /> Total Volume
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
            {insights.totalVolume > 0 ? `${insights.totalVolume.toLocaleString()} kg` : '0 kg'}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
            <CheckCircle size={12} /> Sets Hit
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>{insights.completedSets}</span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/ {insights.targetSets}</span>
          </div>
        </div>
      </div>

      {/* Muscle Breakdown */}
      <div>
        <h3 style={{ margin: '0 0 0.8rem', fontSize: '0.85rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Target size={14} color="#a855f7" /> Muscle Sets Breakdown
        </h3>
        {insights.muscles.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1rem' }}>
            No exercises logged this week yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {insights.muscles.map(m => {
              const maxSets = Math.max(...insights.muscles.map(x => x.total));
              const hitWidth = Math.max((m.hit / maxSets) * 100, 2);
              const missWidth = Math.max((m.missed / maxSets) * 100, 0);
              const color = getMuscleColor(m.name);

              return (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '65px', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                  </div>
                  <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${hitWidth}%`, background: color, borderRadius: '99px', transition: 'width 0.5s ease-out' }} />
                    {m.missed > 0 && (
                      <div style={{ width: `${missWidth}%`, background: 'rgba(239, 68, 68, 0.4)', borderRadius: '0 99px 99px 0', borderLeft: '1px solid rgba(0,0,0,0.2)', transition: 'width 0.5s ease-out' }} />
                    )}
                  </div>
                  <div style={{ width: '40px', textAlign: 'right', fontSize: '0.7rem' }}>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{m.hit}</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>/{m.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
