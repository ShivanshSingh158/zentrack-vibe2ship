import React from 'react';
import { TrendingUp, Target, Calendar, Apple, User } from 'lucide-react';
import type { GymStats, GymDayLog, WeightTarget, GymProfile, TabId, SessionMode } from '../../types/gym.types';
import { fmtKg } from './ZenGymAI';

export interface GymWorkoutSummaryProps {
  stats: GymStats | null;
  todayLog: GymDayLog | null;
  currentTargets: WeightTarget[];
  sessionMode: SessionMode;
  profile: GymProfile | null;
  setActiveTab: (tab: TabId) => void;
  send: (prompt?: string) => void;
}

export const GymWorkoutSummary: React.FC<GymWorkoutSummaryProps> = ({
  stats,
  todayLog,
  currentTargets,
  sessionMode,
  profile,
  setActiveTab,
  send,
}) => {
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, height: '100%', width: '100%' }}>
      <div
        id="zenGymAI-targets-scroll"
        onTouchStart={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as any,
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          padding: '0.75rem 1rem',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, padding: '0.5rem 0.65rem', borderRadius: '10px', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.12)', flexShrink: 0 }}>
          <TrendingUp size={11} style={{ color: '#a855f7', marginRight: '0.3rem', verticalAlign: 'middle' }} />
          {stats ? `Based on your last ${stats.totalWorkouts} sessions.` : "Showing today's exercises."} Tap any row to ask the AI.
        </div>

        {!todayLog?.exercises?.length ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.3)' }}>
            <Target size={28} style={{ opacity: 0.2, margin: '0 auto 0.5rem', display: 'block' }} />
            <div style={{ fontSize: '0.85rem' }}>No exercises in today's plan</div>
            <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>Import your routine first</div>
          </div>
        ) : (
          <>
            {currentTargets.map((target, i) => {
              const trendIcon = target.trend === 'up' ? '↑' : target.trend === 'down' ? '↓' : target.trend === 'new' ? '✦' : '→';
              const trendColor = target.trend === 'up' ? '#1db954' : target.trend === 'down' ? '#ef4444' : target.trend === 'new' ? '#a855f7' : '#f59e0b';
              const ex = todayLog?.exercises?.find(e => e.exerciseId === target.exerciseId) ?? todayLog?.exercises?.[i];
              const completedSets = ex?.setsLog?.filter(s => s.completed).length ?? 0;
              const totalSetCount = ex?.setsLog?.length ?? ex?.targetSets ?? 0;
              const isDone = completedSets === totalSetCount && totalSetCount > 0;

              return (
                <div
                  key={target.exerciseId}
                  onClick={() => {
                    setActiveTab('chat');
                    send(`Tell me specifically what weight and reps to target for ${target.exerciseName} today, and explain the progression logic.`);
                  }}
                  style={{
                    padding: '0.8rem', borderRadius: '14px', cursor: 'pointer', flexShrink: 0,
                    background: isDone ? 'rgba(29,185,84,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isDone ? 'rgba(29,185,84,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isDone ? 'rgba(255,255,255,0.5)' : '#fff', textDecoration: isDone ? 'line-through' : 'none' }}>
                        {target.exerciseName}
                      </div>
                      {target.muscle && (
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.08rem' }}>{target.muscle}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: trendColor }}>
                          {target.recommendedWeight != null ? `${fmtKg(target.recommendedWeight)}kg` : '—'}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: trendColor }}>{trendIcon}</span>
                      </div>
                      <span style={{ fontSize: '0.58rem', color: trendColor, background: `${trendColor}18`, padding: '0.05rem 0.28rem', borderRadius: '99px', fontWeight: 600 }}>
                        {target.confidence === 'high' ? 'High confidence' : target.confidence === 'medium' ? 'Moderate' : 'First session'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.35rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.3rem', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                        {target.lastMaxWeight != null ? `${fmtKg(target.lastMaxWeight)}kg` : '—'}
                      </div>
                      <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Last max</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.3rem', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                        {target.lastDate ? new Date(target.lastDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </div>
                      <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Last session</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.3rem', borderRadius: '8px', background: isDone ? 'rgba(29,185,84,0.12)' : 'rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isDone ? '#1db954' : '#fff' }}>
                        {totalSetCount > 0 ? `${completedSets}/${totalSetCount}` : `0/${ex?.targetSets ?? '?'}`}
                      </div>
                      <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Sets done</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.35rem', fontSize: '0.62rem', color: 'rgba(255,255,255,0.2)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.2rem' }}>
                    <Calendar size={10} /> Tap to ask AI for coaching
                  </div>
                </div>
              );
            })}

            {sessionMode === 'complete' && (
              <div style={{ padding: '0.7rem 0.8rem', borderRadius: '12px', background: 'rgba(29,185,84,0.07)', border: '1px solid rgba(29,185,84,0.18)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <Apple size={13} style={{ color: '#1db954' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1db954' }}>Nutrition Window</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                  Eat {profile?.bodyweightKg ? `${Math.round(profile.bodyweightKg * 0.4)}–${Math.round(profile.bodyweightKg * 0.5)}g protein` : '30–40g protein'} within 2 hours.
                </div>
                <button onClick={() => { setActiveTab('chat'); send("Give me a specific post-workout meal recommendation with exact foods and amounts based on my profile and today's session."); }}
                  style={{ marginTop: '0.45rem', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(29,185,84,0.25)', background: 'rgba(29,185,84,0.1)', color: '#1db954', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>
                  Ask for full meal plan →
                </button>
              </div>
            )}

            {!profile && (
              <div style={{ padding: '0.65rem 0.8rem', borderRadius: '12px', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <User size={13} style={{ color: '#a855f7', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a855f7' }}>Set your Gym Profile</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)', marginTop: '0.08rem' }}>Add bodyweight, age & goal for personalized targets</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
