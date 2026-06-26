import React from 'react';
import { Edit2, Trash2, TrendingUp, ChevronUp, Wand2, Loader2 } from 'lucide-react';
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

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', opacity: goal.status === 'active' ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: goal.status === 'completed' ? 'line-through' : 'none' }}>{goal.title}</h2>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {goal.subject && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 600 }}>
                {goal.subject}
              </span>
            )}
            <span>Deadline: <span style={{ color: 'var(--text-primary)' }}>{formatDisplayDate(goal.deadline)}</span></span>
            <span>•</span>
            <span className={`tag ${goal.status}`}>{goal.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-icon" style={{ color: '#8b5cf6' }} onClick={() => handleAIBreakdown(goal)} title="AI Breakdown" disabled={isBreakingDown}>
            {isBreakingDown ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={16} />}
          </button>
          <button className="btn-icon" onClick={() => onEdit(goal)} title="Edit Goal"><Edit2 size={16} /></button>
          <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => onDelete(goal.id!)} title="Delete Goal"><Trash2 size={16} /></button>
        </div>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{goal.description}</p>

      {/* Overall Progress Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
          <span>Overall Progress</span>
          <span>{totalProgress}%</span>
        </div>
        <div style={{ height: '8px', background: 'var(--bg-surface-active)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${totalProgress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Key Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Milestones</h3>
          <button className="btn-icon" onClick={toggleExpanded} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
            {isExpanded ? <><ChevronUp size={14}/> Hide History</> : <><TrendingUp size={14}/> Show History</>}
          </button>
        </div>
        
        {krs.length === 0 && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No milestones defined.</div>}
        
        {krs.map((kr: KeyResult) => {
          const displayValue = localKrProgress[kr.id] !== undefined ? localKrProgress[kr.id] : (kr.currentValue || 0);
          const target = kr.targetValue || 1;
          const pct = Math.round((displayValue / target) * 100);
          
          return (
            <div key={kr.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 500, marginBottom: '0.25rem' }}>{kr.text}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {displayValue} / {kr.targetValue} {kr.unit} ({pct}%)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      style={{ width: '100px' }}
                      disabled={goal.status !== 'active'}
                    />
                    <input 
                      type="number" 
                      value={displayValue}
                      onChange={(e) => handleLocalSliderChange(kr.id, parseFloat(e.target.value))}
                      onBlur={() => commitGoalKRProgress(goal.id!, kr.id, displayValue)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitGoalKRProgress(goal.id!, kr.id, displayValue) }}
                      style={{ width: '60px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '0.25rem 0.5rem', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      disabled={goal.status !== 'active'}
                    />
                  </>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--accent-primary)' }}>
                    Auto-Synced
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Progress History Chart */}
        {isExpanded && goal.keyResults.length > 0 && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Progress History</h4>
            <div style={{ height: '200px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tickFormatter={(ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
                    stroke="var(--text-muted)" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                  />
                  {krs.map((kr: KeyResult, idx: number) => {
                    const colors = ['#7c3aed', '#fbbf24', '#ef4444', '#10b981', '#a855f7'];
                    return (
                      <Line 
                        key={kr.id} 
                        data={kr.history || []} 
                        type="monotone" 
                        dataKey="value" 
                        name={kr.text || `Milestone ${idx+1}`} 
                        stroke={colors[idx % colors.length]} 
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors[idx % colors.length] }}
                      />
                    )
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
