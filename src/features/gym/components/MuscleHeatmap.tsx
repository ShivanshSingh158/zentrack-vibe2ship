import { useMemo } from 'react';
import type { GymDayLog } from '../../../types/gym.types';

interface MuscleHeatmapProps {
  /** Logs for the last 7 days */
  recentLogs: GymDayLog[];
}

const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#f97316', 'Back': '#3b82f6', 'Shoulders': '#8b5cf6',
  'Side Delts': '#7c3aed', 'Rear Delts': '#6d28d9', 'Triceps': '#10b981',
  'Biceps': '#06b6d4', 'Brachialis': '#0284c7', 'Forearms': '#0891b2',
  'Quads': '#f59e0b', 'Hamstrings': '#d97706', 'Glutes/Hams': '#b45309',
  'Quads/Glutes': '#ca8a04', 'Calves': '#65a30d', 'Abs': '#ef4444',
  'Core': '#dc2626', 'Obliques': '#be185d',
};

export const MuscleHeatmap = ({ recentLogs }: MuscleHeatmapProps) => {
  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of recentLogs) {
      for (const ex of log.exercises || []) {
        if (ex.muscle && !ex.skipped) {
          counts[ex.muscle] = (counts[ex.muscle] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [recentLogs]);

  if (muscleCounts.length === 0) return null;

  return (
    <div style={{ margin: '0.6rem 1rem 0', padding: '0.65rem 0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
        Today's Muscles
      </div>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {muscleCounts.map(([muscle, count]) => {
          const color = MUSCLE_COLORS[muscle] || '#a855f7';
          const intensity = count >= 3 ? 1 : count === 2 ? 0.7 : 0.45;
          return (
            <div key={muscle} style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.2rem 0.45rem', borderRadius: '99px',
              background: `${color}${Math.round(intensity * 0.15 * 255).toString(16).padStart(2, '0')}`,
              border: `1px solid ${color}${Math.round(intensity * 0.4 * 255).toString(16).padStart(2, '0')}`,
              opacity: 0.5 + intensity * 0.5,
            }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.62rem', color: color, fontWeight: 700, whiteSpace: 'nowrap' }}>{muscle}</span>
              <span style={{ fontSize: '0.58rem', color: count >= 2 ? color : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>×{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
