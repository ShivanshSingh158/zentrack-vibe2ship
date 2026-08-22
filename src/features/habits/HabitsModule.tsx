import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  Plus, Check, Flame, Trophy, X, Trash2, Sparkles,
  ShieldAlert, RotateCcw, AlertTriangle, Snowflake, DollarSign,
  TrendingUp, Calendar, Filter, Archive, CheckCircle2, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { collection, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { playPopSound } from '../../utils/sound';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { awardXP } from '../../services/xpSystem';

export interface Habit {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  type?: 'positive' | 'negative';
  color?: string;
  frequency?: string;
  streak?: number;
  longestStreak?: number;
  targetCount?: number | null;
  costPerDay?: number;
  startDate?: string;
  archived?: boolean;
}

export interface HabitLog {
  id?: string;
  habitId: string;
  userId: string;
  date: string;
  count?: number;
  isFreeze?: boolean;
  timestamp?: any;
}

const PARTICLES = Array.from({ length: 24 }).map((_, i) => ({
  id: i,
  angle: Math.random() * Math.PI * 2,
  velocity: 40 + Math.random() * 120,
  size: 3 + Math.random() * 5,
  delay: Math.random() * 0.08,
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 720,
}));

const ParticleBurst = ({ color, x, y }: { color: string; x: number; y: number }) => (
  <div style={{ position: 'fixed', top: y, left: x, zIndex: 999999, pointerEvents: 'none' }}>
    {PARTICLES.map((p) => {
      const targetX = Math.cos(p.angle) * p.velocity;
      const targetY = Math.sin(p.angle) * p.velocity;
      return (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{
            x: targetX,
            y: targetY,
            scale: [0, 1.2, 0],
            opacity: [1, 1, 0],
            rotate: p.rotation + p.rotationSpeed,
          }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: p.delay }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            backgroundColor: color,
            borderRadius: '50%',
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      );
    })}
  </div>
);

export const HabitsModule = () => {
  const { habits: rawHabits, habitLogs: rawLogs, isLoading } = useGlobalData();
  const user = auth.currentUser;
  const todayStr = getLocalDateString(new Date());

  // Cast habits & logs
  const allHabits = (rawHabits || []) as Habit[];
  const habitLogs = (rawLogs || []) as HabitLog[];

  // Filter & UI States
  const [filterType, setFilterType] = useState<'all' | 'positive' | 'negative' | 'archived'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [relapseConfirmHabit, setRelapseConfirmHabit] = useState<Habit | null>(null);
  const [burstEvent, setBurstEvent] = useState<{ x: number; y: number; color: string } | null>(null);

  // Form State for Creating Habit
  const [formType, setFormType] = useState<'positive' | 'negative'>('positive');
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('⭐');
  const [formColor, setFormColor] = useState('#a599ff');
  const [formFrequency, setFormFrequency] = useState('daily');
  const [formTargetCount, setFormTargetCount] = useState('');
  const [formCostPerDay, setFormCostPerDay] = useState('');

  // Streak Freezes
  const [freezesLeft, setFreezesLeft] = useState(2);

  const POSITIVE_EMOJIS = ['⭐', '💧', '📚', '🏃', '🧘', '🍎', '💤', '🎯', '✍️', '💪', '🧠', '🌅'];
  const NEGATIVE_EMOJIS = ['🚫', '🚭', '🍫', '📱', '🎮', '☕', '🍔', '💸', '🛋️', '🍺'];
  const COLOR_PALETTE = ['#a599ff', '#5eda9e', '#38bdf8', '#fbbf24', '#ff6961', '#c084fc', '#f472b6'];

  // 15 Past Dates for Micro Heatmap
  const past15Days = useMemo(() => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(getLocalDateString(d));
    }
    return dates;
  }, []);

  // Filtered Habits
  const displayedHabits = useMemo(() => {
    return allHabits.filter((h) => {
      if (filterType === 'archived') return h.archived === true;
      if (h.archived) return false;
      if (filterType === 'positive') return h.type !== 'negative';
      if (filterType === 'negative') return h.type === 'negative';
      return true;
    });
  }, [allHabits, filterType]);

  // Summary Metrics Calculations
  const metrics = useMemo(() => {
    const active = allHabits.filter((h) => !h.archived);
    const positive = active.filter((h) => h.type !== 'negative');
    const negative = active.filter((h) => h.type === 'negative');

    // Completed today
    const completedToday = positive.filter((h) => {
      const log = habitLogs.find((l) => l.habitId === h.id && l.date === todayStr);
      if (!log) return false;
      if (h.targetCount && h.targetCount > 0) return (log.count || 0) >= h.targetCount;
      return true;
    }).length;

    // Best streak
    const bestStreak = active.reduce((max, h) => Math.max(max, h.streak || 0, h.longestStreak || 0), 0);

    // Total Money Saved across clean negative habits
    let totalSaved = 0;
    const msPerDay = 1000 * 60 * 60 * 24;
    for (const nh of negative) {
      if (!nh.costPerDay) continue;
      const logs = habitLogs.filter((l) => l.habitId === nh.id);
      let daysClean = 0;
      if (logs.length > 0) {
        const latestLog = logs.reduce((lat, l) => (l.date > lat.date ? l : lat), logs[0]);
        daysClean = Math.max(0, Math.floor((new Date(todayStr).getTime() - new Date(latestLog.date).getTime()) / msPerDay));
      } else if (nh.startDate) {
        daysClean = Math.max(0, Math.floor((new Date(todayStr).getTime() - new Date(nh.startDate).getTime()) / msPerDay));
      }
      totalSaved += daysClean * nh.costPerDay;
    }

    return {
      activeCount: active.length,
      positiveCount: positive.length,
      completedToday,
      completionRate: positive.length > 0 ? Math.round((completedToday / positive.length) * 100) : 100,
      bestStreak,
      totalSaved: Math.round(totalSaved),
    };
  }, [allHabits, habitLogs, todayStr]);

  // ── Habit Actions Handlers ──

  // 1. Toggle Positive Habit
  const handleTogglePositive = async (habit: Habit, e: React.MouseEvent) => {
    if (!user) return;
    const isQuantitative = typeof habit.targetCount === 'number' && habit.targetCount > 0;
    const existingLog = habitLogs.find((l) => l.habitId === habit.id && l.date === todayStr);
    const logDocId = `${habit.id}_${todayStr}`;

    playPopSound();

    if (isQuantitative) {
      const currentCount = existingLog ? (existingLog.count || 1) : 0;

      if (currentCount >= habit.targetCount!) {
        // Decrement / undo completed quantitative count
        const newCount = currentCount - 1;
        if (newCount <= 0) {
          await deleteDoc(doc(db, 'habit_logs', logDocId));
          await updateDoc(doc(db, 'habits', habit.id), {
            streak: Math.max(0, (habit.streak || 1) - 1),
          });
        } else {
          await setDoc(doc(db, 'habit_logs', logDocId), {
            habitId: habit.id,
            userId: user.uid,
            date: todayStr,
            count: newCount,
            timestamp: Date.now(),
          });
        }
        toast.info(`Updated ${habit.name}: ${Math.max(0, newCount)}/${habit.targetCount}`);
        return;
      }

      // Increment quantitative
      const newCount = currentCount + 1;
      const isNowComplete = newCount >= habit.targetCount!;

      if (isNowComplete) {
        setBurstEvent({ x: e.clientX, y: e.clientY, color: habit.color || '#a599ff' });
      }

      await setDoc(doc(db, 'habit_logs', logDocId), {
        habitId: habit.id,
        userId: user.uid,
        date: todayStr,
        count: newCount,
        timestamp: Date.now(),
      });

      if (isNowComplete) {
        const newStreak = (habit.streak || 0) + 1;
        await updateDoc(doc(db, 'habits', habit.id), {
          streak: newStreak,
          longestStreak: Math.max(newStreak, habit.longestStreak || 0),
        });
        awardXP('HABIT_LOG').then(async (res) => {
          toast.success(`Completed ${habit.name}! +${res.added} XP 🔥 ${newStreak} day streak`);
          if (newStreak === 7) {
            const streakRes = await awardXP('HABIT_STREAK_7');
            toast.success(`🔥 7-DAY STREAK MILESTONE! +${streakRes.added} XP Bonus!`);
          } else if (newStreak === 30) {
            const streakRes = await awardXP('HABIT_STREAK_30');
            toast.success(`🏆 30-DAY STREAK LEGEND! +${streakRes.added} XP Bonus!`);
          }
          if (res.leveledUp) {
            toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
          }
        });
      } else {
        toast.info(`${habit.name}: ${newCount}/${habit.targetCount}`);
      }
      return;
    }

    // Binary Positive Habit
    if (existingLog) {
      // Undo
      await deleteDoc(doc(db, 'habit_logs', logDocId));
      await updateDoc(doc(db, 'habits', habit.id), {
        streak: Math.max(0, (habit.streak || 1) - 1),
      });
      toast.info(`Unmarked ${habit.name}`);
    } else {
      // Complete
      setBurstEvent({ x: e.clientX, y: e.clientY, color: habit.color || '#a599ff' });
      await setDoc(doc(db, 'habit_logs', logDocId), {
        habitId: habit.id,
        userId: user.uid,
        date: todayStr,
        count: 1,
        timestamp: Date.now(),
      });
      const newStreak = (habit.streak || 0) + 1;
      await updateDoc(doc(db, 'habits', habit.id), {
        streak: newStreak,
        longestStreak: Math.max(newStreak, habit.longestStreak || 0),
      });
      awardXP('HABIT_LOG').then(async (res) => {
        toast.success(`Completed ${habit.name}! +${res.added} XP 🔥 ${newStreak} day streak`);
        if (newStreak === 7) {
          const streakRes = await awardXP('HABIT_STREAK_7');
          toast.success(`🔥 7-DAY STREAK MILESTONE! +${streakRes.added} XP Bonus!`);
        } else if (newStreak === 30) {
          const streakRes = await awardXP('HABIT_STREAK_30');
          toast.success(`🏆 30-DAY STREAK LEGEND! +${streakRes.added} XP Bonus!`);
        }
        if (res.leveledUp) {
          toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
        }
      });
    }
  };

  // 2. Toggle Negative Habit (Relapse)
  const handleToggleNegative = async (habit: Habit) => {
    if (!user) return;
    const existingLog = habitLogs.find((l) => l.habitId === habit.id && l.date === todayStr);
    const logDocId = `${habit.id}_${todayStr}`;

    if (existingLog) {
      // Undo relapse
      await deleteDoc(doc(db, 'habit_logs', logDocId));
      toast.success(`Relapse removed for ${habit.name}`);
    } else {
      // Prompt confirm relapse
      setRelapseConfirmHabit(habit);
    }
  };

  const handleConfirmRelapse = async () => {
    if (!user || !relapseConfirmHabit) return;
    const logDocId = `${relapseConfirmHabit.id}_${todayStr}`;
    await setDoc(doc(db, 'habit_logs', logDocId), {
      habitId: relapseConfirmHabit.id,
      userId: user.uid,
      date: todayStr,
      isRelapse: true,
      timestamp: Date.now(),
    });
    toast.error(`Logged relapse for ${relapseConfirmHabit.name}. Stay strong!`);
    setRelapseConfirmHabit(null);
  };

  // 3. Create Habit
  const handleCreateHabit = async () => {
    if (!user || !formName.trim()) return;
    try {
      await addDoc(collection(db, 'habits'), {
        userId: user.uid,
        name: formName.trim(),
        emoji: formEmoji || (formType === 'positive' ? '⭐' : '🚫'),
        type: formType,
        color: formColor,
        frequency: formFrequency,
        streak: 0,
        longestStreak: 0,
        startDate: todayStr,
        targetCount: formType === 'positive' && formTargetCount ? parseInt(formTargetCount, 10) : null,
        costPerDay: formType === 'negative' && formCostPerDay ? parseFloat(formCostPerDay) : 0,
        archived: false,
        createdAt: serverTimestamp(),
      });
      toast.success(`Created habit "${formName}"`);
      setIsCreateModalOpen(false);
      setFormName('');
      setFormTargetCount('');
      setFormCostPerDay('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create habit');
    }
  };

  return (
    <div className="hb-module-root">
      {/* Particle Burst for Celebrations */}
      {burstEvent && (
        <ParticleBurst
          x={burstEvent.x}
          y={burstEvent.y}
          color={burstEvent.color}
        />
      )}

      {/* ── TOP HERO HEADER BAR ── */}
      <div className="hb-header-bar">
        <div className="hb-header-left">
          <h1 className="hb-hero-title">Daily Habits & Streaks</h1>
          <span className="hb-stats-subtitle">
            {metrics.completedToday}/{metrics.positiveCount} done today ({metrics.completionRate}%) · ❄️ {freezesLeft} Freezes
          </span>
        </div>

        <div className="hb-header-actions">
          {/* Filter Pills */}
          <button
            type="button"
            className={`hb-filter-pill-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            <span>All ({allHabits.filter(h => !h.archived).length})</span>
          </button>

          <button
            type="button"
            className={`hb-filter-pill-btn ${filterType === 'positive' ? 'active' : ''}`}
            onClick={() => setFilterType('positive')}
          >
            <span>✨ Building ({metrics.positiveCount})</span>
          </button>

          <button
            type="button"
            className={`hb-filter-pill-btn ${filterType === 'negative' ? 'active' : ''}`}
            onClick={() => setFilterType('negative')}
          >
            <span>🚫 Quitting ({allHabits.filter(h => !h.archived && h.type === 'negative').length})</span>
          </button>

          {/* New Habit Solid CTA */}
          <button
            type="button"
            className="hb-primary-add-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      {/* ── SUMMARY METRICS QUAD-CARDS ── */}
      <div className="hb-metrics-grid">
        <div className="hb-metric-card">
          <div className="hb-metric-top">
            <span>Active Habits</span>
            <Sparkles size={14} color="var(--hb-accent-purple)" />
          </div>
          <span className="hb-metric-value">{metrics.activeCount}</span>
          <span className="hb-metric-subtext">{metrics.positiveCount} building · {metrics.activeCount - metrics.positiveCount} avoiding</span>
        </div>

        <div className="hb-metric-card">
          <div className="hb-metric-top">
            <span>Today's Progress</span>
            <CheckCircle2 size={14} color="var(--hb-accent-emerald)" />
          </div>
          <span className="hb-metric-value" style={{ color: 'var(--hb-accent-emerald)' }}>
            {metrics.completionRate}%
          </span>
          <span className="hb-metric-subtext">{metrics.completedToday} of {metrics.positiveCount} completed</span>
        </div>

        <div className="hb-metric-card">
          <div className="hb-metric-top">
            <span>Best Active Streak</span>
            <Flame size={14} color="var(--hb-accent-amber)" />
          </div>
          <span className="hb-metric-value" style={{ color: 'var(--hb-accent-amber)' }}>
            🔥 {metrics.bestStreak}d
          </span>
          <span className="hb-metric-subtext">Longest continuous streak</span>
        </div>

        <div className="hb-metric-card">
          <div className="hb-metric-top">
            <span>Money Saved</span>
            <DollarSign size={14} color="var(--hb-accent-emerald)" />
          </div>
          <span className="hb-metric-value" style={{ color: 'var(--hb-accent-emerald)' }}>
            +${metrics.totalSaved}
          </span>
          <span className="hb-metric-subtext">From avoiding bad habits</span>
        </div>
      </div>

      {/* ── HABITS INTERACTIVE LIST ── */}
      <div className="hb-habits-list">
        {displayedHabits.length === 0 ? (
          <div className="notes-empty-state">
            <Sparkles size={32} color="var(--hb-accent-purple)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No habits found</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--hb-text-tertiary)', margin: 0 }}>
              {filterType === 'all'
                ? 'Create your first daily habit to start building streaks and momentum.'
                : `No habits match the "${filterType}" filter.`}
            </p>
            <button
              type="button"
              className="hb-primary-add-btn"
              onClick={() => setIsCreateModalOpen(true)}
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Create Habit</span>
            </button>
          </div>
        ) : (
          displayedHabits.map((habit) => {
            const isNegative = habit.type === 'negative';
            const todayLog = habitLogs.find((l) => l.habitId === habit.id && l.date === todayStr);

            // Compute completion state
            let isCompleted = false;
            let currentCount = 0;
            if (isNegative) {
              isCompleted = !!todayLog; // For negative, log means relapsed
            } else if (habit.targetCount && habit.targetCount > 0) {
              currentCount = todayLog?.count || 0;
              isCompleted = currentCount >= habit.targetCount;
            } else {
              isCompleted = !!todayLog;
            }

            // Negative habit days clean & money saved
            let daysClean = 0;
            let moneySaved = 0;
            if (isNegative) {
              const msPerDay = 1000 * 60 * 60 * 24;
              const logs = habitLogs.filter((l) => l.habitId === habit.id);
              if (logs.length > 0) {
                const latestLog = logs.reduce((lat, l) => (l.date > lat.date ? l : lat), logs[0]);
                daysClean = Math.max(0, Math.floor((new Date(todayStr).getTime() - new Date(latestLog.date).getTime()) / msPerDay));
              } else if (habit.startDate) {
                daysClean = Math.max(0, Math.floor((new Date(todayStr).getTime() - new Date(habit.startDate).getTime()) / msPerDay));
              }
              if (habit.costPerDay) moneySaved = daysClean * habit.costPerDay;
            }

            // 15-day Micro Heatmap array
            const heatmapSquares = past15Days.map((dateStr) => {
              const log = habitLogs.find((l) => l.habitId === habit.id && l.date === dateStr);
              let status: 'completed' | 'freeze' | 'missed' | 'future' = 'missed';

              if (log) {
                if (log.isFreeze) status = 'freeze';
                else if (habit.targetCount && habit.targetCount > 0) {
                  status = (log.count || 0) >= habit.targetCount ? 'completed' : 'missed';
                } else {
                  status = 'completed';
                }
              } else if (dateStr >= todayStr) {
                status = 'future';
              } else if (habit.startDate && dateStr < habit.startDate) {
                status = 'future';
              }
              return { date: dateStr, status };
            });

            return (
              <div
                key={habit.id}
                className={`hb-habit-card ${isCompleted && !isNegative ? 'completed' : ''} ${isCompleted && isNegative ? 'negative-relapsed' : ''}`}
              >
                <div className="hb-card-left">
                  {/* Action Checkbox / Target Pill Trigger */}
                  {!isNegative ? (
                    habit.targetCount && habit.targetCount > 0 ? (
                      <button
                        type="button"
                        className={`hb-check-trigger quantitative ${isCompleted ? 'completed' : ''}`}
                        onClick={(e) => handleTogglePositive(habit, e)}
                      >
                        {currentCount}/{habit.targetCount}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`hb-check-trigger ${isCompleted ? 'completed' : ''}`}
                        onClick={(e) => handleTogglePositive(habit, e)}
                      >
                        {isCompleted && <Check size={18} strokeWidth={3} />}
                      </button>
                    )
                  ) : null}

                  {/* Emoji Avatar */}
                  <div
                    className="hb-avatar-box"
                    style={{
                      background: isNegative ? 'rgba(255,105,97,0.12)' : (habit.color ? `${habit.color}15` : 'rgba(165,153,255,0.12)')
                    }}
                  >
                    <span>{habit.emoji}</span>
                  </div>

                  {/* Habit Details */}
                  <div className="hb-habit-details">
                    <h3 className={`hb-habit-name ${isCompleted && !isNegative ? 'completed' : ''}`}>
                      {habit.name}
                    </h3>

                    <div className="hb-habit-meta">
                      {isNegative ? (
                        <>
                          {isCompleted ? (
                            <span className="hb-clean-badge" style={{ color: '#ff6961' }}>
                              ⚠️ Relapsed today
                            </span>
                          ) : (
                            <span className="hb-clean-badge" style={{ color: '#5eda9e' }}>
                              🟢 {daysClean} days clean
                            </span>
                          )}
                          {moneySaved > 0 && !isCompleted && (
                            <span className="hb-saved-badge">
                              +${moneySaved} saved (${habit.costPerDay}/day)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="hb-streak-badge">
                            🔥 {habit.streak || 0} day streak
                          </span>
                          {habit.longestStreak ? (
                            <span>• Best: {habit.longestStreak}d</span>
                          ) : null}
                          {habit.targetCount && habit.targetCount > 0 ? (
                            <span>• Target: {habit.targetCount}/day</span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Micro Heatmap & Actions */}
                <div className="hb-card-right">
                  {!isNegative ? (
                    <div className="hb-micro-heatmap" title="15-Day Consistency Heatmap">
                      {heatmapSquares.map((sq, i) => (
                        <div
                          key={i}
                          className={`hb-heat-square ${sq.status}`}
                          style={{
                            backgroundColor: sq.status === 'completed' ? (habit.color || 'var(--hb-accent-purple)') : undefined
                          }}
                          title={`${formatDisplayDate(sq.date)}: ${sq.status}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`hb-relapse-btn ${isCompleted ? 'relapsed' : ''}`}
                      onClick={() => handleToggleNegative(habit)}
                    >
                      {isCompleted ? 'Undo Relapse' : 'Log Relapse'}
                    </button>
                  )}

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="hb-card-delete-btn"
                    onClick={() => setDeleteConfirmId(habit.id)}
                    title="Delete Habit"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── CREATE HABIT MODAL STUDIO ── */}
      {isCreateModalOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="notes-modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">New Habit</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Type Switcher: Building vs Quitting */}
              <div className="hb-type-switcher">
                <button
                  type="button"
                  className={`hb-type-choice ${formType === 'positive' ? 'active-pos' : ''}`}
                  onClick={() => {
                    setFormType('positive');
                    setFormEmoji('⭐');
                  }}
                >
                  <Sparkles size={15} />
                  <span>Building (Do)</span>
                </button>

                <button
                  type="button"
                  className={`hb-type-choice ${formType === 'negative' ? 'active-neg' : ''}`}
                  onClick={() => {
                    setFormType('negative');
                    setFormEmoji('🚫');
                  }}
                >
                  <ShieldAlert size={15} />
                  <span>Avoiding (Quit)</span>
                </button>
              </div>

              {/* Name Input */}
              <label style={{ fontSize: '0.76rem', color: 'var(--hb-text-tertiary)', fontWeight: 600 }}>
                HABIT NAME
                <input
                  type="text"
                  placeholder={formType === 'positive' ? 'e.g. Read 20 Pages, Meditate, Hydrate' : 'e.g. Junk Food, Smoking, Doomscrolling'}
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </label>

              {/* Emoji Preset Chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--hb-text-tertiary)', fontWeight: 600 }}>CHOOSE ICON</span>
                <div className="hb-preset-chips">
                  {(formType === 'positive' ? POSITIVE_EMOJIS : NEGATIVE_EMOJIS).map((em) => (
                    <button
                      key={em}
                      type="button"
                      className={`hb-preset-chip ${formEmoji === em ? 'active' : ''}`}
                      onClick={() => setFormEmoji(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantitative Target Count (Positive Only) */}
              {formType === 'positive' && (
                <label style={{ fontSize: '0.76rem', color: 'var(--hb-text-tertiary)', fontWeight: 600 }}>
                  DAILY TARGET COUNT (OPTIONAL)
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 8 (for 8 glasses of water or 20 pushups)"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                    value={formTargetCount}
                    onChange={(e) => setFormTargetCount(e.target.value)}
                  />
                </label>
              )}

              {/* Daily Cost for Money Saved (Negative Only) */}
              {formType === 'negative' && (
                <label style={{ fontSize: '0.76rem', color: 'var(--hb-text-tertiary)', fontWeight: 600 }}>
                  ESTIMATED DAILY COST ($ / DAY)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 10 (to track $ saved while clean)"
                    className="notes-search-bar notes-search-input"
                    style={{ width: '100%', borderRadius: 8, marginTop: '0.3rem' }}
                    value={formCostPerDay}
                    onChange={(e) => setFormCostPerDay(e.target.value)}
                  />
                </label>
              )}

              {/* Color Accent Picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--hb-text-tertiary)', fontWeight: 600 }}>COLOR ACCENT</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: formColor === c ? '2px solid #ffffff' : 'none',
                        cursor: 'pointer',
                        transform: formColor === c ? 'scale(1.2)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="hb-filter-pill-btn" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="hb-primary-add-btn" onClick={handleCreateHabit}>
                Create Habit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RELAPSE CONFIRMATION MODAL ── */}
      <ConfirmDialog
        isOpen={!!relapseConfirmHabit}
        title={`Relapse on ${relapseConfirmHabit?.name}?`}
        message="Did you slip up today? Logging this will reset your Days Clean counter back to 0. You can always undo this if it was a mistake."
        confirmText="Yes, I relapsed"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleConfirmRelapse}
        onCancel={() => setRelapseConfirmHabit(null)}
      />

      {/* ── DELETE HABIT CONFIRMATION MODAL ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Habit"
        message="Are you sure you want to permanently delete this habit and all its history?"
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await deleteDoc(doc(db, 'habits', deleteConfirmId));
            toast.success('Habit deleted');
            setDeleteConfirmId(null);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};
