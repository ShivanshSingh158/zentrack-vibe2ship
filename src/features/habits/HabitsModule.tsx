import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  Plus, Check, Flame, Trophy, X, Trash2, Sparkles,
  ShieldAlert, RotateCcw, AlertTriangle, Snowflake, DollarSign,
  TrendingUp, Calendar, Filter, Archive, CheckCircle2, ChevronRight,
  Sun, Moon, Zap, ShieldCheck, Edit2, Clock
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
  timeSlot?: 'anytime' | 'morning' | 'daytime' | 'evening';
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
  isRelapse?: boolean;
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

  // PERFECT_DAY helper — call after every habit is logged
  const checkPerfectDay = async (
    justLoggedHabitId: string,
    justLoggedCount: number,
    existingTodayLogs: HabitLog[],
  ) => {
    const key = `zentrack_perfect_day_${todayStr}`;
    if (localStorage.getItem(key)) return;
    const positiveHabits = allHabits.filter(h => h.type !== 'negative' && !h.archived);
    if (positiveHabits.length === 0) return;
    const mergedLogs = [
      ...existingTodayLogs.filter(l => l.habitId !== justLoggedHabitId),
      { habitId: justLoggedHabitId, date: todayStr, count: justLoggedCount } as HabitLog,
    ];
    const allDone = positiveHabits.every(h => {
      const log = mergedLogs.find(l => l.habitId === h.id);
      if (!log) return false;
      if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
      return true;
    });
    if (!allDone) return;
    localStorage.setItem(key, '1');
    const res = await awardXP('PERFECT_DAY');
    toast.success(`★ PERFECT DAY! All habits done! +${res.added} XP 🏆`);
    if (res.leveledUp) toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
  };

  // Filter & Routine States
  const [filterType, setFilterType] = useState<'all' | 'morning' | 'daytime' | 'evening' | 'negative' | 'archived'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [relapseConfirmHabit, setRelapseConfirmHabit] = useState<Habit | null>(null);
  const [burstEvent, setBurstEvent] = useState<{ x: number; y: number; color: string } | null>(null);

  // Form State for Creating / Editing Habit
  const [formType, setFormType] = useState<'positive' | 'negative'>('positive');
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('⭐');
  const [formColor, setFormColor] = useState('#a599ff');
  const [formFrequency, setFormFrequency] = useState('daily');
  const [formTimeSlot, setFormTimeSlot] = useState<'anytime' | 'morning' | 'daytime' | 'evening'>('anytime');
  const [formTargetCount, setFormTargetCount] = useState('');
  const [formCostPerDay, setFormCostPerDay] = useState('');

  // Streak Freezes Inventory
  const [freezesLeft, setFreezesLeft] = useState(2);

  const POSITIVE_EMOJIS = ['⭐', '💧', '📚', '🏃', '🧘', '🍎', '💤', '🎯', '✍️', '💪', '🧠', '🌅', '🚶', '💊', '🥗'];
  const NEGATIVE_EMOJIS = ['🚫', '🚭', '🍫', '📱', '🎮', '☕', '🍔', '💸', '🛋️', '🍺', '🍿', '⏰'];
  const COLOR_PALETTE = ['#a599ff', '#5eda9e', '#38bdf8', '#fbbf24', '#ff6961', '#c084fc', '#f472b6'];

  // Past 7 Days Array (M T W T F S S) for Interactive Strip
  const past7Days = useMemo(() => {
    const dates: { dateStr: string; dayLabel: string; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' }); // "M", "T", "W", etc.
      const dateStr = getLocalDateString(d);
      dates.push({
        dateStr,
        dayLabel: dayName,
        isToday: i === 0,
      });
    }
    return dates;
  }, []);

  // Filtered Habits
  const displayedHabits = useMemo(() => {
    return allHabits.filter((h) => {
      if (filterType === 'archived') return h.archived === true;
      if (h.archived) return false;
      if (filterType === 'negative') return h.type === 'negative';
      if (h.type === 'negative') return false; // In positive views, exclude quit trackers
      if (filterType === 'morning') return h.timeSlot === 'morning' || !h.timeSlot || h.timeSlot === 'anytime';
      if (filterType === 'daytime') return h.timeSlot === 'daytime' || !h.timeSlot || h.timeSlot === 'anytime';
      if (filterType === 'evening') return h.timeSlot === 'evening' || !h.timeSlot || h.timeSlot === 'anytime';
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

  // ── Open Modal for Create / Edit ──
  const handleOpenCreateModal = () => {
    setEditingHabit(null);
    setFormType('positive');
    setFormName('');
    setFormEmoji('⭐');
    setFormColor('#a599ff');
    setFormFrequency('daily');
    setFormTimeSlot('anytime');
    setFormTargetCount('');
    setFormCostPerDay('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setFormType(habit.type || 'positive');
    setFormName(habit.name || '');
    setFormEmoji(habit.emoji || '⭐');
    setFormColor(habit.color || '#a599ff');
    setFormFrequency(habit.frequency || 'daily');
    setFormTimeSlot(habit.timeSlot || 'anytime');
    setFormTargetCount(habit.targetCount ? String(habit.targetCount) : '');
    setFormCostPerDay(habit.costPerDay ? String(habit.costPerDay) : '');
    setIsCreateModalOpen(true);
  };

  // ── Habit Actions Handlers ──

  // 1. Toggle Positive Habit (Today or Historical Date)
  const handleTogglePositiveDate = async (habit: Habit, dateStr: string, e?: React.MouseEvent) => {
    if (!user) return;
    const isQuantitative = typeof habit.targetCount === 'number' && habit.targetCount > 0;
    const existingLog = habitLogs.find((l) => l.habitId === habit.id && l.date === dateStr);
    const logDocId = `${habit.id}_${dateStr}`;

    playPopSound();

    if (isQuantitative) {
      const currentCount = existingLog ? (existingLog.count || 1) : 0;

      if (currentCount >= habit.targetCount!) {
        // Undo / reset
        await deleteDoc(doc(db, 'habit_logs', logDocId));
        if (dateStr === todayStr) {
          await updateDoc(doc(db, 'habits', habit.id), {
            streak: Math.max(0, (habit.streak || 1) - 1),
          });
        }
        toast.info(`Unchecked ${habit.name}`);
        return;
      }

      // Increment quantitative count
      const newCount = currentCount + 1;
      const isNowComplete = newCount >= habit.targetCount!;

      if (isNowComplete && e) {
        setBurstEvent({ x: e.clientX, y: e.clientY, color: habit.color || '#5eda9e' });
      }

      await setDoc(doc(db, 'habit_logs', logDocId), {
        habitId: habit.id,
        userId: user.uid,
        date: dateStr,
        count: newCount,
        timestamp: Date.now(),
      });

      if (isNowComplete && dateStr === todayStr) {
        const newStreak = (habit.streak || 0) + 1;
        await updateDoc(doc(db, 'habits', habit.id), {
          streak: newStreak,
          longestStreak: Math.max(newStreak, habit.longestStreak || 0),
        });
        awardXP('HABIT_LOG').then(async (res) => {
          toast.success(`Completed ${habit.name}! +${res.added} XP 🔥 ${newStreak}d streak`);
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
          const todayLogs = habitLogs.filter(l => l.date === todayStr);
          await checkPerfectDay(habit.id, newCount, todayLogs);
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
      if (dateStr === todayStr) {
        await updateDoc(doc(db, 'habits', habit.id), {
          streak: Math.max(0, (habit.streak || 1) - 1),
        });
      }
      toast.info(`Unchecked ${habit.name}`);
    } else {
      // Complete
      if (e) {
        setBurstEvent({ x: e.clientX, y: e.clientY, color: habit.color || '#5eda9e' });
      }
      await setDoc(doc(db, 'habit_logs', logDocId), {
        habitId: habit.id,
        userId: user.uid,
        date: dateStr,
        count: 1,
        timestamp: Date.now(),
      });
      if (dateStr === todayStr) {
        const newStreak = (habit.streak || 0) + 1;
        await updateDoc(doc(db, 'habits', habit.id), {
          streak: newStreak,
          longestStreak: Math.max(newStreak, habit.longestStreak || 0),
        });
        awardXP('HABIT_LOG').then(async (res) => {
          toast.success(`Completed ${habit.name}! +${res.added} XP 🔥 ${newStreak}d streak`);
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
          const todayLogs = habitLogs.filter(l => l.date === todayStr);
          await checkPerfectDay(habit.id, 1, todayLogs);
        });
      } else {
        toast.success(`Logged ${habit.name} for ${formatDisplayDate(dateStr)}`);
      }
    }
  };

  // 2. Freeze Streak for Today
  const handleFreezeHabit = async (habit: Habit) => {
    if (!user) return;
    if (freezesLeft <= 0) {
      toast.error('No streak freeze shields remaining for this month!');
      return;
    }
    const logDocId = `${habit.id}_${todayStr}`;
    await setDoc(doc(db, 'habit_logs', logDocId), {
      habitId: habit.id,
      userId: user.uid,
      date: todayStr,
      isFreeze: true,
      timestamp: Date.now(),
    });
    setFreezesLeft(prev => Math.max(0, prev - 1));
    toast.success(`❄️ Streak frozen for ${habit.name}! Streak protected.`);
  };

  // 3. Toggle Negative Habit (Relapse)
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

  // 4. Create / Save Habit
  const handleSaveHabit = async () => {
    if (!user || !formName.trim()) return;
    try {
      if (editingHabit) {
        await updateDoc(doc(db, 'habits', editingHabit.id), {
          name: formName.trim(),
          emoji: formEmoji || (formType === 'positive' ? '⭐' : '🚫'),
          type: formType,
          color: formColor,
          frequency: formFrequency,
          timeSlot: formTimeSlot,
          targetCount: formType === 'positive' && formTargetCount ? parseInt(formTargetCount, 10) : null,
          costPerDay: formType === 'negative' && formCostPerDay ? parseFloat(formCostPerDay) : 0,
        });
        toast.success(`Updated habit "${formName}"`);
      } else {
        await addDoc(collection(db, 'habits'), {
          userId: user.uid,
          name: formName.trim(),
          emoji: formEmoji || (formType === 'positive' ? '⭐' : '🚫'),
          type: formType,
          color: formColor,
          frequency: formFrequency,
          timeSlot: formTimeSlot,
          streak: 0,
          longestStreak: 0,
          startDate: todayStr,
          targetCount: formType === 'positive' && formTargetCount ? parseInt(formTargetCount, 10) : null,
          costPerDay: formType === 'negative' && formCostPerDay ? parseFloat(formCostPerDay) : 0,
          archived: false,
          createdAt: serverTimestamp(),
        });
        toast.success(`Created habit "${formName}"`);
      }
      setIsCreateModalOpen(false);
      setEditingHabit(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save habit');
    }
  };

  // 5. Archive / Unarchive Habit
  const handleArchiveHabit = async (habit: Habit) => {
    await updateDoc(doc(db, 'habits', habit.id), {
      archived: !habit.archived,
    });
    toast.info(habit.archived ? `Unarchived ${habit.name}` : `Archived ${habit.name}`);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 className="hb-hero-title">Habits & Daily Routines</h1>
            <div className="analytics-live-badge">
              <span className="analytics-live-dot" />
              <span>Live Sync</span>
            </div>
          </div>
          <span className="hb-stats-subtitle">
            {metrics.completedToday} of {metrics.positiveCount} completed today ({metrics.completionRate}%) · 🔥 {metrics.bestStreak}d peak streak
          </span>
        </div>

        <div className="hb-header-actions">
          {/* Streak Freeze Indicator */}
          <div className="hb-freeze-pill" title="Streak Freeze Shields available this month">
            <Snowflake size={14} color="#89dceb" />
            <span>{freezesLeft} Freeze{freezesLeft === 1 ? '' : 's'}</span>
          </div>

          {/* New Habit Solid CTA */}
          <button
            type="button"
            className="hb-primary-add-btn"
            onClick={handleOpenCreateModal}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      {/* ── ROUTINE & CATEGORY FILTER STRIP ── */}
      <div className="hb-filter-strip">
        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          <Zap size={13} />
          <span>All Active ({allHabits.filter(h => !h.archived && h.type !== 'negative').length})</span>
        </button>

        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'morning' ? 'active' : ''}`}
          onClick={() => setFilterType('morning')}
        >
          <Sun size={13} color="#fbbf24" />
          <span>Morning Ritual</span>
        </button>

        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'daytime' ? 'active' : ''}`}
          onClick={() => setFilterType('daytime')}
        >
          <Zap size={13} color="#38bdf8" />
          <span>Daytime Focus</span>
        </button>

        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'evening' ? 'active' : ''}`}
          onClick={() => setFilterType('evening')}
        >
          <Moon size={13} color="#a599ff" />
          <span>Evening Wind-down</span>
        </button>

        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'negative' ? 'active' : ''}`}
          onClick={() => setFilterType('negative')}
        >
          <ShieldAlert size={13} color="#ff6961" />
          <span>Break Bad ({allHabits.filter(h => !h.archived && h.type === 'negative').length})</span>
        </button>

        <button
          type="button"
          className={`hb-filter-pill-btn ${filterType === 'archived' ? 'active' : ''}`}
          onClick={() => setFilterType('archived')}
          style={{ marginLeft: 'auto' }}
        >
          <Archive size={13} />
          <span>Archived ({allHabits.filter(h => h.archived).length})</span>
        </button>
      </div>

      {/* ── DAILY MOMENTUM WATCHTOWER (3-CARD GRID) ── */}
      <div className="hb-momentum-grid">
        {/* Card 1: Today's Perfect Day Progress */}
        <div className="hb-momentum-card">
          <div className="hb-momentum-card-top">
            <span className="hb-momentum-label">Today's Progress</span>
            <CheckCircle2 size={16} color="#5eda9e" />
          </div>
          <div className="hb-momentum-val-row">
            <span className="hb-momentum-value" style={{ color: '#5eda9e' }}>
              {metrics.completionRate}%
            </span>
            <span className="hb-momentum-count">
              {metrics.completedToday}/{metrics.positiveCount} Done
            </span>
          </div>
          <div className="att-progress-track" style={{ marginTop: '0.2rem' }}>
            <div className="att-progress-fill safe" style={{ width: `${metrics.completionRate}%` }} />
          </div>
        </div>

        {/* Card 2: Consistency Multiplier */}
        <div className="hb-momentum-card">
          <div className="hb-momentum-card-top">
            <span className="hb-momentum-label">Streak Multiplier</span>
            <Flame size={16} color="#ff9f4d" />
          </div>
          <div className="hb-momentum-val-row">
            <span className="hb-momentum-value" style={{ color: '#ff9f4d' }}>
              🔥 {metrics.bestStreak}d
            </span>
            <span className="hb-momentum-count">
              Top Streak
            </span>
          </div>
          <span className="hb-momentum-subtext">
            {metrics.completedToday === metrics.positiveCount && metrics.positiveCount > 0
              ? '★ Perfect Day achieved! +100 XP awarded!'
              : `${Math.max(0, metrics.positiveCount - metrics.completedToday)} more to unlock Perfect Day bonus`}
          </span>
        </div>

        {/* Card 3: Money Saved (Break Bad Habits) or Freeze Inventory */}
        <div className="hb-momentum-card">
          <div className="hb-momentum-card-top">
            <span className="hb-momentum-label">Money & Health Saved</span>
            <DollarSign size={16} color="#38bdf8" />
          </div>
          <div className="hb-momentum-val-row">
            <span className="hb-momentum-value" style={{ color: '#38bdf8' }}>
              +${metrics.totalSaved}
            </span>
            <span className="hb-momentum-count">
              Saved
            </span>
          </div>
          <span className="hb-momentum-subtext">
            Across {allHabits.filter(h => h.type === 'negative' && !h.archived).length} avoided bad habits
          </span>
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
              onClick={handleOpenCreateModal}
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
                        onClick={(e) => handleTogglePositiveDate(habit, todayStr, e)}
                        title={`Click to increment (${currentCount}/${habit.targetCount})`}
                      >
                        {currentCount}/{habit.targetCount}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`hb-check-trigger ${isCompleted ? 'completed' : ''}`}
                        onClick={(e) => handleTogglePositiveDate(habit, todayStr, e)}
                        title="Mark habit completed today"
                      >
                        {isCompleted && <Check size={18} strokeWidth={3} />}
                      </button>
                    )
                  ) : null}

                  {/* Emoji Avatar */}
                  <div
                    className="hb-avatar-box"
                    style={{
                      background: isNegative ? 'rgba(255,105,97,0.12)' : (habit.color ? `${habit.color}15` : 'rgba(165,153,255,0.12)'),
                      border: isNegative ? '1px solid rgba(255,105,97,0.3)' : `1px solid ${habit.color || '#a599ff'}35`
                    }}
                  >
                    <span>{habit.emoji}</span>
                  </div>

                  {/* Habit Details */}
                  <div className="hb-habit-details">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <h3 className={`hb-habit-name ${isCompleted && !isNegative ? 'completed' : ''}`}>
                        {habit.name}
                      </h3>
                      {habit.timeSlot && habit.timeSlot !== 'anytime' && (
                        <span className="hb-timeslot-badge">
                          {habit.timeSlot === 'morning' ? '☀️ Morning' : habit.timeSlot === 'daytime' ? '⚡ Daytime' : '🌙 Evening'}
                        </span>
                      )}
                    </div>

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
                            🔥 {habit.streak || 0}d streak
                          </span>
                          {habit.longestStreak ? (
                            <span>• Best: {habit.longestStreak}d</span>
                          ) : null}
                          {habit.frequency && habit.frequency !== 'daily' ? (
                            <span>• {habit.frequency}</span>
                          ) : null}
                          {habit.targetCount && habit.targetCount > 0 ? (
                            <span>• Target: {habit.targetCount}/day</span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: 7-Day Precision Interactive Strip & Actions */}
                <div className="hb-card-right">
                  {!isNegative ? (
                    <div className="hb-week-strip" title="7-Day History (Click node to toggle past days)">
                      {past7Days.map((d) => {
                        const dayLog = habitLogs.find((l) => l.habitId === habit.id && l.date === d.dateStr);
                        const isDone = dayLog && !dayLog.isFreeze && (habit.targetCount ? (dayLog.count || 0) >= habit.targetCount : true);
                        const isFrozen = dayLog?.isFreeze;

                        return (
                          <div
                            key={d.dateStr}
                            className={`hb-day-node ${isDone ? 'done' : ''} ${isFrozen ? 'frozen' : ''} ${d.isToday ? 'today' : ''}`}
                            onClick={() => handleTogglePositiveDate(habit, d.dateStr)}
                            title={`${formatDisplayDate(d.dateStr)}: ${isDone ? 'Completed' : isFrozen ? 'Streak Frozen' : 'Missed'} (Click to toggle)`}
                            style={{
                              backgroundColor: isDone ? (habit.color || '#5eda9e') : undefined,
                              borderColor: isDone ? (habit.color || '#5eda9e') : undefined,
                            }}
                          >
                            <span className="hb-day-node-letter">{d.dayLabel}</span>
                            {isDone && <Check size={10} strokeWidth={3} color="#000" />}
                            {isFrozen && <Snowflake size={10} color="#89dceb" />}
                          </div>
                        );
                      })}
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

                  {/* Actions: Freeze, Edit, Archive, Delete */}
                  <div className="hb-card-actions">
                    {!isNegative && !isCompleted && (
                      <button
                        type="button"
                        className="hb-card-action-icon-btn"
                        onClick={() => handleFreezeHabit(habit)}
                        title="Freeze Today's Streak"
                      >
                        <Snowflake size={13} color="#89dceb" />
                      </button>
                    )}

                    <button
                      type="button"
                      className="hb-card-action-icon-btn"
                      onClick={() => handleOpenEditModal(habit)}
                      title="Edit Habit"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      type="button"
                      className="hb-card-action-icon-btn"
                      onClick={() => handleArchiveHabit(habit)}
                      title={habit.archived ? 'Unarchive' : 'Archive'}
                    >
                      <Archive size={13} />
                    </button>

                    <button
                      type="button"
                      className="hb-card-action-icon-btn delete"
                      onClick={() => setDeleteConfirmId(habit.id)}
                      title="Delete Habit"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── CREATE / EDIT HABIT MODAL STUDIO (OBSIDIAN COSMOS GLASS) ── */}
      {isCreateModalOpen && (
        <div className="att-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="att-modal-dialog" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3 className="att-modal-title">{editingHabit ? 'Edit Habit' : 'New Habit'}</h3>
              <button type="button" className="att-modal-close-btn" onClick={() => setIsCreateModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Type Switcher: Building vs Quitting */}
              <div className="hb-type-switcher">
                <button
                  type="button"
                  className={`hb-type-choice ${formType === 'positive' ? 'active-pos' : ''}`}
                  onClick={() => {
                    setFormType('positive');
                    if (formEmoji === '🚫') setFormEmoji('⭐');
                  }}
                >
                  <Sparkles size={14} />
                  <span>Building (Do)</span>
                </button>

                <button
                  type="button"
                  className={`hb-type-choice ${formType === 'negative' ? 'active-neg' : ''}`}
                  onClick={() => {
                    setFormType('negative');
                    if (formEmoji === '⭐') setFormEmoji('🚫');
                  }}
                >
                  <ShieldAlert size={14} />
                  <span>Avoiding (Quit)</span>
                </button>
              </div>

              {/* Name Input */}
              <label className="att-input-label">
                <span>HABIT NAME</span>
                <input
                  type="text"
                  placeholder={formType === 'positive' ? 'e.g. Read 20 Pages, Meditate, Hydrate' : 'e.g. Junk Food, Smoking, Doomscrolling'}
                  className="att-modal-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </label>

              {/* Emoji Preset Chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="att-input-label"><span>CHOOSE ICON</span></span>
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

              {/* Routine Time Slot Selector (Positive Only) */}
              {formType === 'positive' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span className="att-input-label"><span>TIME OF DAY ROUTINE</span></span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                    {[
                      { id: 'anytime', label: '⚡ Anytime' },
                      { id: 'morning', label: '☀️ Morning' },
                      { id: 'daytime', label: '⚡ Daytime' },
                      { id: 'evening', label: '🌙 Evening' },
                    ].map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        className={`hb-timeslot-btn ${formTimeSlot === slot.id ? 'active' : ''}`}
                        onClick={() => setFormTimeSlot(slot.id as any)}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantitative Target Count (Positive Only) */}
              {formType === 'positive' && (
                <label className="att-input-label">
                  <span>DAILY TARGET COUNT (OPTIONAL)</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 8 (for 8 glasses of water or 20 pushups)"
                    className="att-modal-input"
                    value={formTargetCount}
                    onChange={(e) => setFormTargetCount(e.target.value)}
                  />
                </label>
              )}

              {/* Daily Cost for Money Saved (Negative Only) */}
              {formType === 'negative' && (
                <label className="att-input-label">
                  <span>ESTIMATED DAILY COST ($ / DAY)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 10 (to track $ saved while clean)"
                    className="att-modal-input"
                    value={formCostPerDay}
                    onChange={(e) => setFormCostPerDay(e.target.value)}
                  />
                </label>
              )}

              {/* Color Accent Picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="att-input-label"><span>COLOR ACCENT</span></span>
                <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: formColor === c ? '2.5px solid #ffffff' : 'none',
                        cursor: 'pointer',
                        transform: formColor === c ? 'scale(1.15)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="att-modal-footer">
              <button type="button" className="att-modal-cancel-btn" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="att-modal-save-btn" onClick={handleSaveHabit}>
                {editingHabit ? 'Save Changes' : 'Create Habit'}
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
