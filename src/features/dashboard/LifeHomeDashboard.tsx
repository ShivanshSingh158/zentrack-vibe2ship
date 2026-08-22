import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Bot,
  Sun,
  Moon,
  Flame,
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  Check,
  Plus,
  ArrowUpRight,
  GraduationCap,
  Droplets,
  Zap,
  ChevronRight,
  Timer,
  BookOpen,
  RotateCcw,
  Settings,
  X
} from 'lucide-react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { auth, db } from '../../services/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { playPopSound } from '../../utils/sound';
import { toast } from 'sonner';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { XPConstellationModal } from './XPConstellationModal';

import { LEVEL_THRESHOLDS, LEVEL_TITLES } from '../../services/xpSystem';

const MASCOT_FILES: Record<string, string> = {
  'Seeker': '/mascots/level0.png',
  'Warden': '/mascots/level1.png',
  'Sentinel': '/mascots/level3.png',
  'Guardian': '/mascots/level2.png',
  'Vanguard': '/mascots/level4.png',
  'Luminary': '/mascots/level5.png',
  'Legend': '/mascots/level6.png',
  'Mythic': '/mascots/level7.png',
  'Paragon': '/mascots/level8.png',
  'Titan': '/mascots/level9.png',
  'Ascendant': '/mascots/level10.png',
  'Exalted': '/mascots/level11.png',
  'Sovereign': '/mascots/level12.png',
  'Archon': '/mascots/level13.png',
  'Celestial': '/mascots/level14.png',
  'Ethereal': '/mascots/level15.png',
  'Empyrean': '/mascots/level16.png',
  'Astral': '/mascots/level17.png',
  'Zenith': '/mascots/level18.png',
  'Apex': '/mascots/level19.png',
};

const getGradientForLevel = (level: string): [string, string] => {
  switch (level) {
    case 'Seeker':    return ['#34d399', '#22d3ee'];
    case 'Warden':    return ['#22d3ee', '#3b82f6'];
    case 'Sentinel':  return ['#14b8a6', '#0ea5e9'];
    case 'Guardian':  return ['#3b82f6', '#6366f1'];
    case 'Vanguard':  return ['#a855f7', '#ec4899'];
    case 'Luminary':  return ['#f59e0b', '#fbbf24'];
    case 'Legend':    return ['#f97316', '#ef4444'];
    case 'Mythic':    return ['#ec4899', '#8b5cf6'];
    case 'Paragon':   return ['#8b5cf6', '#6366f1'];
    case 'Titan':     return ['#6366f1', '#3b82f6'];
    case 'Ascendant': return ['#3b82f6', '#06b6d4'];
    case 'Exalted':   return ['#06b6d4', '#10b981'];
    case 'Sovereign': return ['#10b981', '#84cc16'];
    case 'Archon':    return ['#84cc16', '#eab308'];
    case 'Celestial': return ['#eab308', '#f97316'];
    case 'Ethereal':  return ['#f97316', '#ef4444'];
    case 'Empyrean':  return ['#ef4444', '#ec4899'];
    case 'Astral':    return ['#ec4899', '#d946ef'];
    case 'Zenith':    return ['#d946ef', '#a855f7'];
    case 'Apex':      return ['#a855f7', '#8b5cf6'];
    default:          return ['#a599ff', '#6366f1'];
  }
};

function calculateLevel(xp: number) {
  let currentIndex = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      currentIndex = i;
    }
  }
  const currentLabel = LEVEL_TITLES[currentIndex] || 'Seeker';
  const nextIndex = Math.min(currentIndex + 1, LEVEL_THRESHOLDS.length - 1);
  const nextLabel = LEVEL_TITLES[nextIndex] || 'Warden';
  const nextXP = LEVEL_THRESHOLDS[nextIndex];
  const currentThreshold = LEVEL_THRESHOLDS[currentIndex];
  
  let progress = 1;
  if (nextXP > currentThreshold) {
    progress = (xp - currentThreshold) / (nextXP - currentThreshold);
  }
  return {
    label: currentLabel,
    nextLabel,
    progress: Math.min(Math.max(progress, 0), 1),
    xp,
    nextXP,
    levelIndex: currentIndex + 1
  };
}

export const LifeHomeDashboard: React.FC = () => {
  const globalData = useGlobalData();
  const { tasks, habits, habitLogs, attendanceSubjects, calendarEvents, userXP, xpState, awardXP } = globalData;
  const user = auth.currentUser;
  const navigate = useNavigate();
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const { startTimer } = usePomodoroContext();

  // Firestore Profile App Streak Sync
  const [appStreak, setAppStreak] = useState<number>(5);
  const [isXPModalOpen, setIsXPModalOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'user_profiles', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data?.appStreak === 'number') setAppStreak(data.appStreak);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // Dark/Light Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return !document.body.classList.contains('theme-light');
  });

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.body.classList.remove('theme-light');
      localStorage.setItem('zen_theme', 'dark');
    } else {
      document.body.classList.add('theme-light');
      localStorage.setItem('zen_theme', 'light');
    }
  };

  // Live time ticker
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  // Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName.split(' ')[0];
    return 'Explorer';
  }, [user]);

  // Today Tasks
  const todayTasks = useMemo(() => {
    return tasks.filter(t => t.date === todayStr);
  }, [tasks, todayStr]);

  const doneTasks = useMemo(() => {
    return todayTasks.filter(t => t.status === 'completed');
  }, [todayTasks]);

  const pendingTasks = useMemo(() => {
    return todayTasks.filter(t => t.status !== 'completed');
  }, [todayTasks]);

  // Habit Logs
  const todayHabitLogMap = useMemo(() => {
    const map = new Map<string, boolean>();
    (habitLogs || []).forEach(l => {
      if (l.date === todayStr) map.set(l.habitId, true);
    });
    return map;
  }, [habitLogs, todayStr]);

  const completedHabitsCount = useMemo(() => {
    let c = 0;
    (habits || []).forEach(h => {
      if (todayHabitLogMap.get(h.id)) c++;
    });
    return c;
  }, [habits, todayHabitLogMap]);

  // Attendance
  const attendanceStats = useMemo(() => {
    if (!attendanceSubjects || attendanceSubjects.length === 0) return { pct: 89, isSafe: true };
    let attended = 0;
    let total = 0;
    attendanceSubjects.forEach(s => {
      attended += (s.classesAttended || 0);
      total += (s.classesTotal || 0);
    });
    const pct = total > 0 ? Math.round((attended / total) * 100) : 89;
    return { pct, isSafe: pct >= 75 };
  }, [attendanceSubjects]);

  // Water / Hydration State (Real-time Firestore Sync with Mobile App)
  const [isWaterTargetModalOpen, setIsWaterTargetModalOpen] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState('');

  const waterTarget = globalData.waterGoalMl || 3800;

  const todayWaterLogs = useMemo(() => {
    return (globalData.waterLogs || []).filter((w: any) => {
      if (!w) return false;
      if (w.date === todayStr) return true;
      if (w.timestamp) {
        const d = new Date(w.timestamp);
        return getLocalDateString(d) === todayStr;
      }
      if (w.createdAt?.seconds) {
        const d = new Date(w.createdAt.seconds * 1000);
        return getLocalDateString(d) === todayStr;
      }
      return false;
    });
  }, [globalData.waterLogs, todayStr]);

  const waterAmount = useMemo(() => {
    const firestoreTotal = todayWaterLogs.reduce((acc: number, curr: any) => {
      const val = Number(curr.amountMl ?? curr.amount ?? 0);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    if (firestoreTotal > 0) {
      localStorage.setItem(`zen_water_${todayStr}`, firestoreTotal.toString());
      return firestoreTotal;
    }

    const saved = localStorage.getItem(`zen_water_${todayStr}`);
    return saved ? parseInt(saved, 10) : 0;
  }, [todayWaterLogs, todayStr]);

  const logWater = async (delta: number) => {
    playPopSound();
    const updated = Math.min(waterTarget * 2, waterAmount + delta);
    localStorage.setItem(`zen_water_${todayStr}`, updated.toString());

    if (user?.uid) {
      try {
        await addDoc(collection(db, 'water_logs'), {
          userId: user.uid,
          amountMl: delta,
          amount: delta,
          date: todayStr,
          timestamp: Date.now(),
        });
        toast.success(`+${delta}ml logged (${(updated / 1000).toFixed(1)}L total) 💧`);
      } catch (e) {
        console.warn('[LifeHomeDashboard] Error syncing water to Firestore:', e);
        toast.success(`+${delta}ml logged locally`);
      }
    } else {
      toast.success(`+${delta}ml logged (${(updated / 1000).toFixed(1)}L total) 💧`);
    }
  };

  const resetWater = async () => {
    localStorage.setItem(`zen_water_${todayStr}`, '0');
    if (user?.uid && todayWaterLogs.length > 0) {
      try {
        const deletePromises = todayWaterLogs.map((w: any) => {
          return deleteDoc(doc(db, 'water_logs', w.id)).catch(() => deleteDoc(doc(db, 'waterLogs', w.id)));
        });
        await Promise.all(deletePromises);
        toast.info('Hydration reset for today');
      } catch (e) {
        console.warn('Error resetting water in Firestore:', e);
        toast.info('Hydration reset locally');
      }
    } else {
      toast.info('Hydration reset for today');
    }
  };

  const handleSaveWaterTarget = async (ml: number) => {
    if (!ml || isNaN(ml) || ml <= 0) return;
    await globalData.setWaterGoal(ml);
    toast.success(`Daily water target set to ${(ml / 1000).toFixed(1)}L 💧`);
    setIsWaterTargetModalOpen(false);
  };

  // Next Event
  const nextEvent = useMemo(() => {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const todayCal = (calendarEvents || []).filter(e => e.date === todayStr && e.startTime);
    for (const ev of todayCal) {
      const parts = ev.startTime.split(':');
      const evMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
      if (evMins >= currentMins) {
        return { title: ev.title, time: `${ev.startTime} - ${ev.endTime || ''}` };
      }
    }
    const timedTask = pendingTasks.find(t => t.timeSlot);
    if (timedTask) {
      return { title: timedTask.title || timedTask.text, time: timedTask.timeSlot };
    }
    return null;
  }, [calendarEvents, todayStr, pendingTasks]);

  // Cumulative Real-Time XP & Level (Syncs directly with Mobile)
  const activeXP = userXP;
  const levelInfo = useMemo(() => calculateLevel(activeXP), [activeXP]);
  const levelGradient = useMemo(() => getGradientForLevel(levelInfo.label), [levelInfo.label]);
  const mascotImg = MASCOT_FILES[levelInfo.label] || '/mascots/level0.png';

  // Toggle Task
  const toggleTask = async (task: any) => {
    if (!task.id) return;
    const isDone = task.status === 'completed';
    playPopSound();
    try {
      await updateDoc(doc(db, 'todos', task.id), {
        status: isDone ? 'pending' : 'completed',
        completedAt: !isDone ? Date.now() : null,
      });
      if (!isDone) {
        const res = await awardXP('TASK_COMPLETE');
        if (res.bonus) {
          toast.success(`Task completed! +${res.added} XP ⚡ Dopamine Bonus! 🎉`);
        } else {
          toast.success(`Task completed! +${res.added} XP 🎉`);
        }
        if (res.leveledUp) {
          toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
        }
      } else {
        toast.info('Task marked pending');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle Habit
  const toggleHabit = async (habitId: string) => {
    if (!user) return;
    const isDone = todayHabitLogMap.get(habitId);
    playPopSound();
    try {
      if (!isDone) {
        await addDoc(collection(db, 'habitLogs'), {
          userId: user.uid,
          habitId,
          date: todayStr,
          createdAt: Date.now(),
        });
        const res = await awardXP('HABIT_LOG');
        toast.success(`Habit logged! +${res.added} XP 🔥`);
        if (res.leveledUp) {
          toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Quick Add Task
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim() || !user) return;
    const count = todayTasks.length;
    await addDoc(collection(db, 'todos'), {
      userId: user.uid,
      title: quickTaskTitle.trim(),
      text: quickTaskTitle.trim(),
      date: todayStr,
      status: 'pending',
      priority: 'medium',
      createdAt: Date.now(),
      order: count,
    });
    setQuickTaskTitle('');
    toast.success('Task scheduled');
  };

  // Donut Ring
  const RING_SIZE = 105;
  const RING_STROKE = 8;
  const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const questRatio = todayTasks.length > 0 ? doneTasks.length / todayTasks.length : (nextEvent ? 0.75 : 0);
  const questDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0.04, questRatio)));

  return (
    <div className="life-dashboard-root">
      
      {/* ── TOP GREETING HEADER (Subtle iOS Style) ── */}
      <div className="life-header-bar">
        <div className="life-header-left">
          <h1 className="life-greeting-title">
            <span>{greeting},</span>
            <span className="life-greeting-name">{displayName}</span>
          </h1>
          <div className="life-date-subtitle">
            <span>{formatDisplayDate(todayStr)}</span>
            <span className="life-date-dot" />
            <span>{timeStr} IST</span>
          </div>
        </div>

        <div className="life-header-actions">
          {/* Flame Streak Pill */}
          <Link to="/habits" className="life-streak-pill" title="Daily Streak">
            <span>🔥</span>
            <span>{appStreak} Days</span>
          </Link>

          {/* SARA Purple Bot Button */}
          <Link to="/sara" className="life-sara-bot-btn" title="Open SARA Voice Console">
            <Bot size={16} strokeWidth={2.5} />
            <span>SARA AI</span>
          </Link>

          {/* Dark / Light Mode Switcher */}
          <button
            type="button"
            className="life-icon-circle-btn"
            onClick={toggleTheme}
            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {isDarkMode ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#a599ff" />}
          </button>
        </div>
      </div>

      {/* ── PROACTIVE SARA HUD NUDGE BANNER ── */}
      <div className="life-hud-banner">
        <div className="hud-banner-left">
          <div className="hud-bot-icon-circle">
            <Sparkles size={15} />
          </div>
          <div className="hud-banner-text">
            <span className="hud-banner-badge">SARA</span>
            {pendingTasks.length > 0 ? (
              <span>
                You have <strong>{pendingTasks.length} pending commitment{pendingTasks.length > 1 ? 's' : ''}</strong> today. {nextEvent ? `Next: "${nextEvent.title}" at ${nextEvent.time}.` : 'Stay in flow.'}
              </span>
            ) : (
              <span>
                All scheduled commitments completed for today. Peak momentum!
              </span>
            )}
          </div>
        </div>
        <Link to="/sara" className="hud-banner-action-btn">
          <span>Ask SARA</span>
          <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* ── FULL-SCREEN 3-COLUMN BENTO GRID ── */}
      <div className="life-fullscreen-grid">

        {/* ── COLUMN 1: OVERVIEW & ACADEMIC HEALTH ── */}
        <div className="bento-column">
          
          {/* Overview & Mascot Card */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Overview</span>
              <Link to="/analytics" className="widget-action-link">Stats →</Link>
            </div>

            {/* Donut & Flanking Stats */}
            <div className="matrix-donut-row">
              <div className="donut-ring-wrap" onClick={() => navigate('/tasks')}>
                <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="xpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={levelGradient[0]} />
                      <stop offset="100%" stopColor={levelGradient[1]} />
                    </linearGradient>
                  </defs>
                  <circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={RING_STROKE}
                  />
                  <circle
                    cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                    fill="none" stroke="url(#xpGrad)" strokeWidth={RING_STROKE}
                    strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={questDashoffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
                <div className="donut-center-inner">
                  <span className="donut-count-text" style={{ color: levelGradient[0] }}>
                    {doneTasks.length}/{todayTasks.length}
                  </span>
                  <span className="donut-label-text">Quests</span>
                </div>
              </div>

              <div className="matrix-metrics-stack">
                <Link to="/habits" className="matrix-metric-item">
                  <div className="metric-left" style={{ color: '#5eda9e' }}>
                    <span>🌱</span>
                    <span>Momentum</span>
                  </div>
                  <span className="metric-val" style={{ color: '#5eda9e' }}>
                    {completedHabitsCount}/{habits.length}
                  </span>
                </Link>

                <div
                  className="matrix-metric-item"
                  onClick={() => {
                    setCustomGoalInput(String(waterTarget));
                    setIsWaterTargetModalOpen(true);
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Click to customize daily hydration goal"
                >
                  <div className="metric-left" style={{ color: '#38bdf8' }}>
                    <span>💧</span>
                    <span>Hydration</span>
                  </div>
                  <span className="metric-val" style={{ color: '#38bdf8' }}>
                    {(waterAmount / 1000).toFixed(1)}/{(waterTarget / 1000).toFixed(1)}L
                  </span>
                </div>

                <Link to="/attendance" className="matrix-metric-item">
                  <div className="metric-left" style={{ color: '#f59e0b' }}>
                    <span>🎓</span>
                    <span>Classes</span>
                  </div>
                  <span className="metric-val" style={{ color: '#f59e0b' }}>
                    {attendanceStats.pct}%
                  </span>
                </Link>
              </div>
            </div>

            {/* Floating 3D Mascot & XP Bar (Opens Constellation Modal) */}
            <div className="mascot-xp-card" onClick={() => setIsXPModalOpen(true)} title="Click to view all 20 XP Mastery Tiers">
              <div className="mascot-float-wrap">
                {/* Glowing Aura Layer */}
                <img
                  src={mascotImg}
                  alt=""
                  className="mascot-glow-aura"
                  style={{ filter: `blur(14px) drop-shadow(0 0 16px ${levelGradient[0]})` }}
                />
                {/* Floating Mascot Character */}
                <img
                  src={mascotImg}
                  alt={levelInfo.label}
                  className="mascot-float-img"
                />
              </div>
              <div className="xp-content-col">
                <div className="xp-title-row">
                  <span className="xp-rank-name" style={{ color: levelGradient[0] }}>
                    {levelInfo.label} • {levelInfo.xp} XP
                  </span>
                  <span className="xp-to-next">
                    {levelInfo.nextXP - levelInfo.xp} to {levelInfo.nextLabel}
                  </span>
                </div>
                <div className="xp-track">
                  <div
                    className="xp-fill"
                    style={{
                      width: `${Math.max(4, levelInfo.progress * 100)}%`,
                      background: `linear-gradient(90deg, ${levelGradient[0]}, ${levelGradient[1]})`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Academic & Course Health Card (Expands to fill Column 1) */}
          <div className="life-widget-card expand-card">
            <div className="widget-header">
              <span className="widget-title">Academic &amp; Attendance</span>
              <Link to="/attendance" className="widget-action-link">Details →</Link>
            </div>

            <div className="subject-health-stack">
              {attendanceSubjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#8e8e93', fontSize: '0.78rem' }}>
                  No courses enrolled yet.
                </div>
              ) : (
                attendanceSubjects.slice(0, 4).map(sub => {
                  const pct = sub.classesTotal > 0 ? Math.round((sub.classesAttended / sub.classesTotal) * 100) : 100;
                  const isSafe = pct >= 75;
                  return (
                    <div key={sub.id} className="subject-health-row">
                      <span style={{ fontWeight: 500 }}>{sub.name}</span>
                      <span className={`subject-badge ${isSafe ? 'safe' : 'warning'}`}>
                        {pct}% {isSafe ? 'Safe' : 'At Risk'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* ── COLUMN 2: TODAY'S FOCUS & AGENDA (Hero Center - Full Height) ── */}
        <div className="bento-column">
          
          <div className="life-widget-card expand-card">
            <div className="widget-header">
              <span className="widget-title">Today's Agenda</span>
              <Link to="/tasks" className="widget-action-link">All Tasks →</Link>
            </div>

            {/* Next Scheduled Item */}
            {nextEvent && (
              <div className="agenda-schedule-block">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={15} color="#38bdf8" />
                  <span className="agenda-schedule-title">{nextEvent.title}</span>
                </div>
                <span className="agenda-schedule-time">{nextEvent.time}</span>
              </div>
            )}

            {/* Tasks list */}
            <div className="agenda-task-list">
              {todayTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#8e8e93', fontSize: '0.82rem' }}>
                  <CheckCircle2 size={28} color="#5eda9e" style={{ margin: '0 auto 0.5rem auto', opacity: 0.8 }} />
                  <div>Zero pending commitments for today</div>
                  <div style={{ fontSize: '0.74rem', marginTop: 2 }}>Type below to plan your day</div>
                </div>
              ) : (
                todayTasks.map(task => {
                  const isDone = task.status === 'completed';
                  return (
                    <div key={task.id} className="agenda-row">
                      <button
                        type="button"
                        className={`todo-circular-checkbox ${isDone ? 'checked' : ''}`}
                        onClick={() => toggleTask(task)}
                      >
                        {isDone && <Check size={11} strokeWidth={3} />}
                      </button>
                      <span className="agenda-task-text" style={{ textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.4 : 1 }}>
                        {task.title || task.text}
                      </span>
                      {task.timeSlot && (
                        <span className="agenda-time-tag">{task.timeSlot}</span>
                      )}
                      <button
                        type="button"
                        className="todo-action-icon-btn timer-btn"
                        onClick={() => startTimer(task.id, task.title || task.text)}
                        title="Focus Timer"
                      >
                        <Timer size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Integrated Inline Add */}
            <form onSubmit={handleQuickAddTask} className="agenda-inline-add">
              <input
                type="text"
                value={quickTaskTitle}
                onChange={e => setQuickTaskTitle(e.target.value)}
                placeholder="+ Add task for today..."
                className="agenda-inline-input"
              />
            </form>
          </div>

        </div>

        {/* ── COLUMN 3: VITALITY, HABITS & MINDSET ── */}
        <div className="bento-column">

          {/* Daily Habits Widget */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Daily Habits</span>
              <Link to="/habits" className="widget-action-link">View All →</Link>
            </div>

            <div className="habit-list-compact">
              {habits.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#8e8e93', padding: '0.5rem 0' }}>
                  No habits active.
                </div>
              ) : (
                habits.slice(0, 4).map(h => {
                  const isDone = todayHabitLogMap.get(h.id);
                  return (
                    <div key={h.id} className="habit-row-clean" onClick={() => toggleHabit(h.id)}>
                      <div className="habit-title-clean">
                        <span>{h.emoji || '⚡'}</span>
                        <span>{h.name || h.title}</span>
                      </div>
                      <button
                        type="button"
                        className={`habit-check-pill ${isDone ? 'completed' : ''}`}
                      >
                        {isDone && <Check size={11} strokeWidth={3} />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Wellness & Active Recall Card */}
          <div className="life-widget-card" style={{ gap: '0.85rem' }}>
            <div className="widget-header">
              <span className="widget-title">Wellness &amp; Recall</span>
              <Link to="/learning" className="widget-action-link">Learn →</Link>
            </div>

            {/* Compact Water Logger */}
            <div className="water-tracker-compact">
              <div className="water-header-row">
                <div
                  className="water-text-wrap"
                  onClick={() => {
                    setCustomGoalInput(String(waterTarget));
                    setIsWaterTargetModalOpen(true);
                  }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  title="Click to customize daily hydration goal"
                >
                  <span>💧</span>
                  <span>{(waterAmount / 1000).toFixed(1)} / {(waterTarget / 1000).toFixed(1)} L</span>
                  <span style={{ fontSize: '0.7rem', color: '#71717a', fontWeight: 500 }}>
                    ({Math.round((waterAmount / (waterTarget || 1)) * 100)}%)
                  </span>
                  <Settings size={12} color="#71717a" style={{ opacity: 0.8 }} />
                </div>
                <div className="water-btn-group">
                  <button type="button" className="water-chip" onClick={() => logWater(250)} title="Add 250ml water">+250ml</button>
                  <button type="button" className="water-chip" onClick={() => logWater(500)} title="Add 500ml water">+500ml</button>
                  {waterAmount > 0 && (
                    <button
                      type="button"
                      className="water-chip"
                      onClick={resetWater}
                      title="Reset today's water"
                      style={{ padding: '0.2rem 0.4rem', color: '#71717a' }}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Visual Hydration Progress Bar */}
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.round((waterAmount / (waterTarget || 1)) * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
                    borderRadius: '9999px',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>
            </div>

            {/* 3-Min Active Recall banner */}
            <div className="recall-banner-clean">
              <div style={{ fontSize: '0.78rem', color: '#5eda9e', fontWeight: 600 }}>
                ⚡ 3-Min Active Recall
              </div>
              <Link to="/learning" className="recall-btn-clean">
                Review
              </Link>
            </div>

            {/* Subtle wisdom quote */}
            <div className="quote-text-clean">
              "Discipline is choosing between what you want now, and what you want most."
            </div>
          </div>

        </div>

      </div>

      {/* ── 20-TIER XP CONSTELLATION & MASTERY MODAL (Mobile Parity) ── */}
      <XPConstellationModal
        isOpen={isXPModalOpen}
        onClose={() => setIsXPModalOpen(false)}
        currentXP={activeXP}
      />

      {/* ── DAILY HYDRATION GOAL CUSTOMIZER MODAL ── */}
      {isWaterTargetModalOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsWaterTargetModalOpen(false)}>
          <div
            className="notes-modal-content"
            style={{ maxWidth: '420px', padding: '1.5rem', background: '#121215', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 16 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>💧</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>Daily Hydration Target</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWaterTargetModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              Choose a quick preset or enter your custom daily target (e.g. calculated based on 40ml per kg body weight).
            </p>

            {/* Preset Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[
                { label: '2.5 L', ml: 2500 },
                { label: '3.0 L', ml: 3000 },
                { label: '3.8 L', ml: 3800 },
                { label: '4.0 L', ml: 4000 },
              ].map(preset => (
                <button
                  key={preset.ml}
                  type="button"
                  onClick={() => handleSaveWaterTarget(preset.ml)}
                  style={{
                    padding: '0.55rem 0.25rem',
                    background: waterTarget === preset.ml ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${waterTarget === preset.ml ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                    color: waterTarget === preset.ml ? '#38bdf8' : '#fff',
                    borderRadius: 10,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Custom Target (in Millilitres / ml)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  min="500"
                  max="10000"
                  step="100"
                  value={customGoalInput}
                  onChange={e => setCustomGoalInput(e.target.value)}
                  placeholder="e.g. 3800"
                  style={{
                    flex: 1,
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveWaterTarget(parseInt(customGoalInput, 10))}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#38bdf8',
                    border: 'none',
                    borderRadius: 10,
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#52525b', textAlign: 'center' }}>
              Syncs in real-time across both mobile app and web dashboard.
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
