import React from 'react';
import { Edit2, Trash2, TrendingUp, ChevronUp, Wand2, Loader2, Calendar, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import type { Goal, KeyResult } from '../../types/index';
import { formatDisplayDate } from '../../utils/dateUtils';

export interface GoalCardProps {
  goal: Goal;
  localKrProgress: { [krId: string]: number };
  isExpanded: boolean;
  toggleExpanded: () => void;
  isBreakingDown: boolean;
  handleAIBreakdown: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  handleLocalSliderChange: (krId: string, value: number) => void;
  commitGoalKRProgress: (goalId: string, krId: string, value: number) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  localKrProgress,
  isExpanded,
  toggleExpanded,
  isBreakingDown,
  handleAIBreakdown,
  onEdit,
  onDelete,
  handleLocalSliderChange,
  commitGoalKRProgress,
}) => {
  // Calculate overall progress
  let totalProgress = 0;
  const krs = goal.keyResults || [];
  if (krs.length > 0) {
    const sum = krs.reduce((acc: number, kr: KeyResult) => {
      const val = localKrProgress[kr.id] !== undefined ? localKrProgress[kr.id] : (kr.currentValue || 0);
      const target = kr.targetValue || 1;
      return acc + (Math.min(val / target, 1));
    }, 0);
    totalProgress = Math.round((sum / krs.length) * 100);
  }

  const isCompleted = goal.status === 'completed';

  return (
    <div className={`goal-card ${goal.status}`}>
      {/* ── Top Header ── */}
      <div className="goal-card-top">
        <div className="goal-card-titles">
          <h2 className="goal-title" style={{ textDecoration: isCompleted ? 'line-through' : 'none' }}>
            {goal.title}
          </h2>
          <div className="goal-meta-row">
            {goal.subject && (
              <span className="goal-subject-pill">
                {goal.subject}
              </span>
            )}
            <div className="goal-deadline">
              <Calendar size={13} style={{ opacity: 0.7 }} />
              <span>Deadline: <span>{formatDisplayDate(goal.deadline)}</span></span>
            </div>
            <span>•</span>
            <span className={`goal-status-badge ${goal.status}`}>
              {goal.status}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="goal-card-actions">
          <button
            type="button"
            className="goal-action-btn ai-btn"
            onClick={() => handleAIBreakdown(goal)}
            title="AI Milestone Breakdown"
            disabled={isBreakingDown}
          >
            {isBreakingDown ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Wand2 size={15} />
            )}
          </button>
          <button
            type="button"
            className="goal-action-btn"
            onClick={() => onEdit(goal)}
            title="Edit Goal"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            className="goal-action-btn delete-btn"
            onClick={() => onDelete(goal.id!)}
            title="Delete Goal"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <p className="goal-description">{goal.description}</p>
      )}

      {/* ── Overall Progress Bar ── */}
      <div className="goal-progress-section">
        <div className="goal-progress-labels">
          <span>Overall Progress</span>
          <span className="goal-progress-pct">{totalProgress}%</span>
        </div>
        <div className="goal-progress-track">
          <div
            className="goal-progress-fill"
            style={{ width: `${Math.min(Math.max(totalProgress, 0), 100)}%` }}
          />
        </div>
      </div>

      {/* ── Milestones & Key Results ── */}
      <div className="goal-milestones-box">
        <div className="goal-milestones-header">
          <span className="goal-milestones-title">Milestones & Key Results</span>
          {krs.length > 0 && (
            <button
              type="button"
              className="goal-history-toggle"
              onClick={toggleExpanded}
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={13} /> Hide History
                </>
              ) : (
                <>
                  <TrendingUp size={13} /> Show History
                </>
              )}
            </button>
          )}
        </div>

        {krs.length === 0 ? (
          <div className="goal-empty-milestones">
            <span>No milestones defined yet.</span>
            <button
              type="button"
              onClick={() => onEdit(goal)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--zen-purple, #7c3aed)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              + Add Milestone
            </button>
          </div>
        ) : (
          krs.map((kr: KeyResult) => {
            const displayValue = localKrProgress[kr.id] !== undefined ? localKrProgress[kr.id] : (kr.currentValue || 0);
            const target = kr.targetValue || 1;
            const pct = Math.min(Math.round((displayValue / target) * 100), 100);
            const milestoneTitle = kr.title || (kr as any).text || 'Milestone';

            return (
              <div key={kr.id} className="goal-milestone-item">
                <div className="goal-milestone-info">
                  <div className="goal-milestone-name">{milestoneTitle}</div>
                  <div className="goal-milestone-metrics">
                    {displayValue} / {kr.targetValue} {kr.unit || '%'} ({pct}%)
                  </div>
                  <div className="goal-milestone-mini-track">
                    <div
                      className="goal-milestone-mini-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="goal-milestone-controls">
                  {(!kr.syncType || kr.syncType === 'none') ? (
                    <>
                      <input
                        type="range"
                        min="0"
                        max={kr.targetValue}
                        value={displayValue}
                        onChange={(e) => handleLocalSliderChange(kr.id, parseFloat(e.target.value))}
                        onMouseUp={() => commitGoalKRProgress(goal.id!, kr.id, displayValue)}
                        onTouchEnd={() => commitGoalKRProgress(goal.id!, kr.id, displayValue)}
                        className="goal-slider"
                        disabled={goal.status !== 'active'}
                      />
                      <input
                        type="number"
                        value={displayValue}
                        onChange={(e) => handleLocalSliderChange(kr.id, parseFloat(e.target.value))}
                        onBlur={() => commitGoalKRProgress(goal.id!, kr.id, displayValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitGoalKRProgress(goal.id!, kr.id, displayValue);
                        }}
                        className="goal-number-input"
                        disabled={goal.status !== 'active'}
                      />
                    </>
                  ) : (
                    <span className="goal-auto-sync-tag">
                      <Sparkles size={12} /> Auto-Synced
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Progress History Chart */}
        {isExpanded && krs.length > 0 && (
          <div className="goal-history-card">
            <h4 className="goal-history-heading">Progress History</h4>
            <div style={{ height: '200px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart margin={{ top: 5, right: 15, bottom: 5, left: 0 }}>
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    stroke="var(--text-muted, #78716c)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-muted, #78716c)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    contentStyle={{
                      background: 'var(--bg-surface, #ffffff)',
                      border: '1px solid var(--border-subtle, #edeae6)',
                      borderRadius: '8px',
                      color: 'var(--text-primary, #202020)',
                      fontSize: '12px',
                    }}
                  />
                  {krs.map((kr: KeyResult, idx: number) => {
                    const colors = ['#7c3aed', '#059669', '#f59e0b', '#ef4444', '#0284c7'];
                    const milestoneName = kr.title || (kr as any).text || `Milestone ${idx + 1}`;
                    return (
                      <Line
                        key={kr.id}
                        data={kr.history || []}
                        type="monotone"
                        dataKey="value"
                        name={milestoneName}
                        stroke={colors[idx % colors.length]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors[idx % colors.length] }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
