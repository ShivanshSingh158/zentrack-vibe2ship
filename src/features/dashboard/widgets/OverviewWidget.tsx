/**
 * OverviewWidget.tsx — Web twin of mobile UnifiedLifeWidget
 * SVG quest donut ring + compact metric rows + XP progress bar
 * Exact mobile design language: Obsidian Cosmos tokens
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface OverviewWidgetProps {
  habitsCompleted: number;
  habitsTotal: number;
  tasksCompleted: number;
  tasksTotal: number;
  waterCompletedMl: number;
  waterGoalMl: number;
  overallAttendancePct: number;
  levelLabel: string;
  levelXP: number;
  levelNextXP: number;
  levelProgress: number;
  levelNextLabel: string;
}

const RING_SIZE = 120;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LEVEL_GRADIENTS: Record<string, [string, string]> = {
  Seeker:    ['#34d399', '#22d3ee'],
  Warden:    ['#22d3ee', '#3b82f6'],
  Sentinel:  ['#14b8a6', '#0ea5e9'],
  Guardian:  ['#3b82f6', '#6366f1'],
  Vanguard:  ['#a855f7', '#ec4899'],
  Luminary:  ['#f59e0b', '#fbbf24'],
  Legend:    ['#f97316', '#ef4444'],
  Mythic:    ['#ec4899', '#8b5cf6'],
  Paragon:   ['#8b5cf6', '#6366f1'],
  Titan:     ['#6366f1', '#3b82f6'],
  Ascendant: ['#3b82f6', '#06b6d4'],
  Exalted:   ['#06b6d4', '#10b981'],
  Sovereign: ['#10b981', '#84cc16'],
  Archon:    ['#84cc16', '#eab308'],
  Celestial: ['#eab308', '#f97316'],
  Ethereal:  ['#f97316', '#ef4444'],
  Empyrean:  ['#ef4444', '#ec4899'],
  Astral:    ['#ec4899', '#d946ef'],
  Zenith:    ['#d946ef', '#a855f7'],
  Apex:      ['#a855f7', '#8b5cf6'],
};

export function OverviewWidget({
  habitsCompleted,
  habitsTotal,
  tasksCompleted,
  tasksTotal,
  waterCompletedMl,
  waterGoalMl,
  overallAttendancePct,
  levelLabel,
  levelXP,
  levelNextXP,
  levelProgress,
  levelNextLabel,
}: OverviewWidgetProps) {
  const navigate = useNavigate();

  const gradients = LEVEL_GRADIENTS[levelLabel] ?? ['#a599ff', '#6366f1'];
  const gradId = 'ow-ring-gradient';

  const ringPct = tasksTotal > 0 ? tasksCompleted / tasksTotal : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - ringPct);

  const waterLiters = useMemo(() => {
    const ml = waterCompletedMl || 0;
    return ml >= 100 ? (ml / 1000).toFixed(1) : String(ml);
  }, [waterCompletedMl]);

  const waterGoalLiters = useMemo(() => {
    const ml = waterGoalMl || 3000;
    return ml >= 100 ? (ml / 1000).toFixed(1) : String(ml);
  }, [waterGoalMl]);

  const waterPct = waterGoalMl > 0 ? Math.min((waterCompletedMl / waterGoalMl) * 100, 100) : 0;

  return (
    <div className="ow-card">
      {/* Section Label */}
      <div className="ow-section-label">
        <span>Overview</span>
        <button className="ow-stats-link" onClick={() => navigate('/analytics')}>Stats →</button>
      </div>

      {/* Main row: Ring left, Metrics right */}
      <div className="ow-main-row">
        {/* SVG Donut Ring */}
        <div className="ow-ring-wrapper" onClick={() => navigate('/tasks')} title="Go to tasks">
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="ow-ring-svg"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={gradients[0]} />
                <stop offset="100%" stopColor={gradients[1]} />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={RING_STROKE}
            />
            {/* Progress arc */}
            {tasksTotal > 0 && (
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.25,1,0.5,1)' }}
              />
            )}
          </svg>
          {/* Center label */}
          <div className="ow-ring-center">
            <span className="ow-ring-count" style={{ color: gradients[0] }}>
              {tasksCompleted}/{tasksTotal}
            </span>
            <span className="ow-ring-label">
              {tasksTotal === 0 ? 'REST DAY' : 'QUESTS TODAY'}
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="ow-v-divider" />

        {/* Compact metric rows */}
        <div className="ow-metrics-col">
          {/* Momentum (Habits) */}
          <motion.button
            className="ow-metric-row"
            onClick={() => navigate('/habits')}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="ow-metric-left">
              <span className="ow-metric-emoji">🌱</span>
              <span className="ow-metric-label" style={{ color: '#5eda9e' }}>Momentum</span>
            </div>
            <span className="ow-metric-value" style={{ color: '#5eda9e' }}>
              {habitsCompleted}/{habitsTotal}
            </span>
          </motion.button>

          {/* Hydration (Water) */}
          <motion.button
            className="ow-metric-row ow-metric-row--water"
            onClick={() => navigate('/')}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {/* Fill bar */}
            <div
              className="ow-water-fill"
              style={{ width: `${waterPct}%` }}
            />
            <div className="ow-metric-left" style={{ position: 'relative' }}>
              <span className="ow-metric-emoji">💧</span>
              <span className="ow-metric-label" style={{ color: '#89dceb' }}>Hydration</span>
            </div>
            <span className="ow-metric-value" style={{ color: '#89dceb', position: 'relative' }}>
              {waterLiters}/{waterGoalLiters}L
            </span>
          </motion.button>

          {/* Classes (Attendance) */}
          <motion.button
            className="ow-metric-row"
            onClick={() => navigate('/attendance')}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="ow-metric-left">
              <span className="ow-metric-emoji">🎓</span>
              <span className="ow-metric-label" style={{ color: '#ff9f4d' }}>Classes</span>
            </div>
            <span className="ow-metric-value" style={{ color: '#ff9f4d' }}>
              {overallAttendancePct > 0 ? `${overallAttendancePct}%` : '—'}
            </span>
          </motion.button>
        </div>
      </div>

      {/* XP Section */}
      <div className="ow-xp-section">
        <div className="ow-xp-label-row">
          <span className="ow-xp-level-text">
            {levelLabel} • {levelXP.toLocaleString()} / {levelNextXP.toLocaleString()} xp
          </span>
          <span className="ow-xp-to-next">
            {(levelNextXP - levelXP).toLocaleString()} to {levelNextLabel}
          </span>
        </div>
        <div className="ow-xp-track">
          <div
            className="ow-xp-fill"
            style={{
              width: `${Math.max(levelProgress * 100, 2)}%`,
              background: `linear-gradient(90deg, ${gradients[0]}, ${gradients[1]})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
