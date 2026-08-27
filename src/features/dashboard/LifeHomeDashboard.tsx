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
  X,
  Dumbbell,
  Code,
  Award,
  AlertTriangle,
  Activity,
  CheckSquare,
  Ban,
  Undo2
} from 'lucide-react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { auth, db } from '../../services/firebase';
import { doc, onSnapshot, updateDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { getLocalDateString, formatDisplayDate, formatTimeRangeDisplay, extractTaskDurationMinutes } from '../../utils/dateUtils';
import { calculateAppStreak } from '../../utils/streakUtils';
import { playPopSound } from '../../utils/sound';
import { toast } from 'sonner';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { XPConstellationModal } from './XPConstellationModal';
import { FlashcardReviewModal } from '../learning/FlashcardReviewModal';
import { LEVEL_THRESHOLDS, LEVEL_TITLES } from '../../services/xpSystem';
import { resolveSubjectDaySchedule, parseTimeToMinutes, calculateBunkMath } from '../academic/AttendanceModule';

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
    case 'Seeker':    return ['#34d399', '#10b981']; // T1 Emerald Nature
    case 'Warden':    return ['#06b6d4', '#0284c7']; // T2 Cyan Hydro Aegis
    case 'Sentinel':  return ['#14b8a6', '#0d9488']; // T3 Deep Teal Vanguard
    case 'Guardian':  return ['#3b82f6', '#1d4ed8']; // T4 Cobalt Steel Protector
    case 'Vanguard':  return ['#a855f7', '#7c3aed']; // T5 Royal Violet Knight
    case 'Luminary':  return ['#f59e0b', '#d97706']; // T6 Solar Gold Sage
    case 'Legend':    return ['#ea580c', '#c2410c']; // T7 Blazing Magma Flame
    case 'Mythic':    return ['#ec4899', '#db2777']; // T8 Mythic Rose Plasma
    case 'Paragon':   return ['#64748b', '#94a3b8']; // T9 Silver Metallic Titan
    case 'Titan':     return ['#dc2626', '#991b1b']; // T10 Blood Crimson Behemoth
    case 'Ascendant': return ['#10b981', '#047857']; // T11 Jade Transcendent
    case 'Exalted':   return ['#eab308', '#ca8a04']; // T12 Radiant Solar Dawn
    case 'Sovereign': return ['#9333ea', '#6b21a8']; // T13 Imperial Purple Monarch
    case 'Archon':    return ['#2563eb', '#06b6d4']; // T14 Electric Plasma Archon
    case 'Celestial': return ['#1e40af', '#60a5fa']; // T15 Cosmic Starfield Deep Blue
    case 'Ethereal':  return ['#818cf8', '#c084fc']; // T16 Ethereal Lavender Horizon
    case 'Empyrean':  return ['#f43f5e', '#fb923c']; // T17 Supernova Coral Flare
    case 'Astral':    return ['#0d9488', '#2dd4bf']; // T18 Astral Aurora Borealis
    case 'Zenith':    return ['#475569', '#e2e8f0']; // T19 Dark Obsidian Platinum
    case 'Apex':      return ['#ffd700', '#ff7bf0']; // T20 Supreme Singularity Rainbow Gold
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
  const {
    tasks, habits, habitLogs, attendanceSubjects, attendanceLogs,
    calendarEvents, gymLogs, learningTopics, pomodoroSessions, assignments,
    allHabits, userXP, awardXP
  } = globalData;
  const user = auth.currentUser;
  const navigate = useNavigate();
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const { startTimer } = usePomodoroContext();

  const [profileStreak, setProfileStreak] = useState<number | null>(null);
  const [isXPModalOpen, setIsXPModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'user_profiles', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data?.appStreak === 'number') setProfileStreak(data.appStreak);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const appStreak = useMemo(() => {
    const calculated = calculateAppStreak(
      tasks,
      gymLogs,
      habitLogs,
      learningTopics,
      attendanceLogs,
      pomodoroSessions,
      assignments,
      allHabits || habits
    );
    return Math.max(calculated, profileStreak || 0);
  }, [tasks, gymLogs, habitLogs, learningTopics, attendanceLogs, pomodoroSessions, assignments, allHabits, habits, profileStreak]);

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
    if (user?.displayName) {
      const raw = user.displayName.split(' ')[0];
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return 'Explorer';
  }, [user]);

  // Today Tasks (Pending tasks first, completed tasks last)
  const todayTasks = useMemo(() => {
    const raw = (tasks || []).filter(t => t.date === todayStr);
    return raw.sort((a, b) => {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) {
        return aDone - bDone; // pending (0) first, completed (1) last
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
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

  // Attendance Calculations
  const attendanceStats = useMemo(() => {
    if (!attendanceSubjects || attendanceSubjects.length === 0) return { pct: 89, isSafe: true, attended: 0, total: 0 };
    let attended = 0;
    let total = 0;
    attendanceSubjects.forEach(s => {
      attended += (s.classesAttended || 0) + (s.labsAttended || 0);
      total += (s.classesTotal || 0) + (s.labsTotal || 0);
    });
    const pct = total > 0 ? Math.round((attended / total) * 100) : 89;
    return { pct, isSafe: pct >= 75, attended, total };
  }, [attendanceSubjects]);

  // Today Timetable Sessions (Unlogged classes first, Logged/Attended/Missed/Cancelled classes last)
  const todayClasses = useMemo(() => {
    const sessions: Array<{
      id: string;
      subject: any;
      subjectId: string;
      title: string;
      time: string;
      room?: string;
      type: 'class' | 'lab';
      timeMins: number;
      idx: number;
      action?: 'attended' | 'missed' | 'cancelled';
      logId?: string;
      isAttended?: boolean;
      isMissed?: boolean;
      isCancelled?: boolean;
    }> = [];

    // Match today's attendance logs
    const todayLogsMap = new Map<string, any>();
    (attendanceLogs || []).forEach(l => {
      if (l.date === todayStr) {
        todayLogsMap.set(`${l.subjectId}_${l.type || 'class'}`, l);
        todayLogsMap.set(`${l.subjectId}_${l.type || 'class'}_${l.idx ?? 0}`, l);
      }
    });

    (attendanceSubjects || []).forEach(subj => {
      const daySched = resolveSubjectDaySchedule(subj, todayStr);
      const { classCount, labCount, classes, labs } = daySched;

      for (let i = 0; i < classCount; i++) {
        const item = classes[i];
        const time = item?.time || '';
        const room = item?.room;
        const log = todayLogsMap.get(`${subj.id}_class_${i}`) || todayLogsMap.get(`${subj.id}_class`);
        sessions.push({
          id: `${subj.id}-class-${i}`,
          subject: subj,
          subjectId: subj.id,
          title: subj.name,
          time: time || `Class #${i + 1}`,
          room,
          type: 'class',
          timeMins: parseTimeToMinutes(time),
          idx: i,
          action: log?.action,
          logId: log?.id,
          isAttended: log?.action === 'attended',
          isMissed: log?.action === 'missed' || log?.action === 'absent',
          isCancelled: log?.action === 'cancelled'
        });
      }

      for (let i = 0; i < labCount; i++) {
        const item = labs[i];
        const time = item?.time || '';
        const room = item?.room;
        const log = todayLogsMap.get(`${subj.id}_lab_${i}`) || todayLogsMap.get(`${subj.id}_lab`);
        sessions.push({
          id: `${subj.id}-lab-${i}`,
          subject: subj,
          subjectId: subj.id,
          title: subj.name,
          time: time || `Lab #${i + 1}`,
          room,
          type: 'lab',
          timeMins: parseTimeToMinutes(time),
          idx: i,
          action: log?.action,
          logId: log?.id,
          isAttended: log?.action === 'attended',
          isMissed: log?.action === 'missed' || log?.action === 'absent',
          isCancelled: log?.action === 'cancelled'
        });
      }
    });

    return sessions.sort((a, b) => {
      const aLogged = a.action ? 1 : 0;
      const bLogged = b.action ? 1 : 0;
      if (aLogged !== bLogged) {
        return aLogged - bLogged; // 0 (unlogged) first, 1 (logged) last
      }
      return a.timeMins - b.timeMins; // within same group, sort chronologically
    });
  }, [attendanceSubjects, attendanceLogs, todayStr]);

  // Log Attendance Directly from Home Screen
  const handleLogAttendance = async (
    subject: any,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    idx: number = 0
  ) => {
    if (!user || !subject?.id) return;
    try {
      playPopSound();
      const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
      const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';
      const subRef = doc(db, 'attendance_subjects', subject.id);

      const cleanToday = (todayStr || '').slice(0, 10);
      const existingLog = (attendanceLogs || []).find(
        (l: any) => (l.subjectId === subject.id || l.subjectId === subject.name || l.subjectName === subject.name) &&
                    (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
                    (l.date || '').slice(0, 10) === cleanToday &&
                    (l.idx === idx || l.idx === undefined)
      );

      if (existingLog) {
        if (existingLog.action === action) return;

        const oldAction = existingLog.action;
        const oldAtt = oldAction === 'attended' ? 1 : 0;
        const newAtt = action === 'attended' ? 1 : 0;
        const attDelta = newAtt - oldAtt;

        const oldTot = oldAction === 'cancelled' ? 0 : 1;
        const newTot = action === 'cancelled' ? 0 : 1;
        const totDelta = newTot - oldTot;

        const currentAtt = (subject[attendedKey] as number) || 0;
        const currentTot = (subject[totalKey] as number) || 0;

        await updateDoc(subRef, {
          [attendedKey]: Math.max(0, currentAtt + attDelta),
          [totalKey]: Math.max(0, currentTot + totDelta),
        });

        await updateDoc(doc(db, 'attendance_logs', existingLog.id), {
          action,
          timestamp: Date.now(),
        });
      } else {
        const newAtt = action === 'attended' ? 1 : 0;
        const newTot = action === 'cancelled' ? 0 : 1;

        const currentAtt = (subject[attendedKey] as number) || 0;
        const currentTot = (subject[totalKey] as number) || 0;

        if (newTot > 0 || newAtt > 0) {
          await updateDoc(subRef, {
            [attendedKey]: currentAtt + newAtt,
            [totalKey]: currentTot + newTot,
          });
        }

        await addDoc(collection(db, 'attendance_logs'), {
          userId: user.uid,
          subjectId: subject.id,
          subjectName: subject.name,
          type,
          idx,
          action,
          date: todayStr,
          timestamp: Date.now(),
        });
      }

      if (action === 'attended') {
        awardXP('ATTENDANCE_LOG').then((res) => {
          toast.success(`Attended ${subject.name}! +${res.added} XP 🎓`);
          if (res.leveledUp) {
            toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
          }
        });
      } else if (action === 'missed') {
        toast.info(`Marked ${subject.name} as missed`);
      } else {
        toast.info(`Marked ${subject.name} as cancelled`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to log attendance');
    }
  };

  // Undo Attendance Log
  const handleUndoAttendance = async (logId: string, subject: any, action: string, type: 'class' | 'lab') => {
    if (!user || !logId || !subject?.id) return;
    try {
      playPopSound();
      await deleteDoc(doc(db, 'attendance_logs', logId));

      if (action !== 'cancelled') {
        const subRef = doc(db, 'attendance_subjects', subject.id);
        const isAtt = action === 'attended';
        if (type === 'class') {
          await updateDoc(subRef, {
            classesTotal: Math.max(0, (subject.classesTotal || 0) - 1),
            classesAttended: Math.max(0, (subject.classesAttended || 0) - (isAtt ? 1 : 0)),
          });
        } else {
          await updateDoc(subRef, {
            labsTotal: Math.max(0, (subject.labsTotal || 0) - 1),
            labsAttended: Math.max(0, (subject.labsAttended || 0) - (isAtt ? 1 : 0)),
          });
        }
      }
      toast.info(`Attendance reset for ${subject.name}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to undo attendance');
    }
  };

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

  // Discipline Score Synthesis (0–100)
  const disciplineScore = useMemo(() => {
    const taskRatio = todayTasks.length > 0 ? (doneTasks.length / todayTasks.length) : 1;
    const habitRatio = habits.length > 0 ? (completedHabitsCount / habits.length) : 1;
    const attendRatio = (attendanceStats.pct || 85) / 100;
    const score = Math.round((taskRatio * 0.4 + habitRatio * 0.35 + attendRatio * 0.25) * 100);
    return Math.min(100, Math.max(0, score));
  }, [todayTasks, doneTasks, habits, completedHabitsCount, attendanceStats]);

  // Next Scheduled Item (Excludes classes to prevent duplicate cards in Agenda)
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

  // Unified Today's Master Flow Items (Tasks + Workouts)
  // Hard Constraint / Rule:
  // 1. ALL pending tasks ALWAYS float to the top (chronologically sorted).
  // 2. ALL completed tasks ALWAYS sink to the bottom.
  const masterFlowItems = useMemo(() => {
    const items: Array<{
      id: string;
      kind: 'task' | 'workout';
      isDone: boolean;
      timeMins: number;
      data: any;
    }> = [];

    // 1. Tasks
    (todayTasks || []).forEach(t => {
      const isDone = t.status === 'completed';
      let timeMins = 999;
      if (t.timeSlot) {
        const parts = t.timeSlot.split('-');
        timeMins = parseTimeToMinutes(parts[0]?.trim());
      }
      items.push({
        id: `task-${t.id}`,
        kind: 'task',
        isDone,
        timeMins,
        data: t,
      });
    });

    // 2. Today Workout Log (if completed on mobile/web)
    const todayGymLog = (gymLogs || []).find((g: any) => {
      if (!g) return false;
      if (g.date === todayStr) return true;
      if (g.timestamp) {
        const d = new Date(g.timestamp);
        return getLocalDateString(d) === todayStr;
      }
      return false;
    });

    if (todayGymLog) {
      items.push({
        id: `gym-${todayGymLog.id || 'today'}`,
        kind: 'workout',
        isDone: true,
        timeMins: 999,
        data: todayGymLog,
      });
    }

    return items.sort((a, b) => {
      const aDone = a.isDone ? 1 : 0;
      const bDone = b.isDone ? 1 : 0;
      if (aDone !== bDone) {
        return aDone - bDone; // 0 (Pending/Unlogged) FIRST, 1 (Completed/Logged) LAST
      }
      return a.timeMins - b.timeMins; // within same group, sort chronologically
    });
  }, [todayTasks, gymLogs, todayStr]);

  // Cumulative Real-Time XP & Level
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
    toast.success('Task scheduled for today');
  };

  // SARA Input Prompt State
  const [saraPrompt, setSaraPrompt] = useState('');
  const handleSaraSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saraPrompt.trim()) return;
    const promptText = saraPrompt.trim();
    setSaraPrompt('');
    window.dispatchEvent(new CustomEvent('open-sara-modal'));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: promptText, instruction: promptText } }));
    }, 150);
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
            <span>{appStreak} {appStreak === 1 ? 'Day' : 'Days'}</span>
          </Link>

          {/* SARA AI Copilot Launch Button */}
          <button
            type="button"
            className="life-sara-bot-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-sara-modal'))}
            title="Open SARA Voice & Copilot"
            style={{ cursor: 'pointer', border: 'none' }}
          >
            <Sparkles size={14} />
            <span>SARA AI</span>
          </button>

          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            className="life-icon-circle-btn"
            onClick={toggleTheme}
            title={`Switch to ${isDarkMode ? 'Frost Quartz (Light Mode)' : 'Obsidian Cosmos (Dark Mode)'}`}
          >
            {isDarkMode ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6c5ce7" />}
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
            {todayClasses.length > 0 ? (
              <span>
                You have <strong>{todayClasses.length} class{todayClasses.length > 1 ? 'es' : ''}</strong> scheduled today: {todayClasses.map(c => `"${c.title}" at ${c.time}`).join(', ')}.
              </span>
            ) : pendingTasks.length > 0 ? (
              <span>
                You have <strong>{pendingTasks.length} pending commitment{pendingTasks.length > 1 ? 's' : ''}</strong> today. {nextEvent ? `Next: "${nextEvent.title}" at ${formatTimeRangeDisplay(nextEvent.time)}.` : 'Stay in flow.'}
              </span>
            ) : (
              <span>
                All scheduled commitments completed for today. Peak momentum!
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="hud-banner-action-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('open-sara-modal'))}
          style={{ cursor: 'pointer' }}
        >
          <span>Voice &amp; Chat</span>
          <ArrowUpRight size={13} />
        </button>
      </div>

      {/* ── FULL-SCREEN 3-COLUMN BENTO GRID ── */}
      <div className="life-fullscreen-grid">

        {/* ── COLUMN 1: LIFE PROFILE, DISCIPLINE & VITALITY (24% Width) ── */}
        <div className="bento-column">
          
          {/* Overview & Mascot Hero Card */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Life Matrix</span>
              <Link to="/analytics" className="widget-action-link">Analytics →</Link>
            </div>

            {/* Donut & Flanking Stats */}
            <div className="matrix-donut-row">
              <div className="donut-ring-wrap" onClick={() => navigate('/tasks')} title="View Tasks">
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
                <Link to="/habits" className="matrix-metric-item" title="Daily Habits">
                  <div className="metric-left" style={{ color: '#5eda9e' }}>
                    <span>🌱</span>
                    <span>Habits</span>
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
                    <span>Water</span>
                  </div>
                  <span className="metric-val" style={{ color: '#38bdf8' }}>
                    {(waterAmount / 1000).toFixed(1)}/{(waterTarget / 1000).toFixed(1)}L
                  </span>
                </div>

                <Link to="/attendance" className="matrix-metric-item" title="Attendance Status">
                  <div className="metric-left" style={{ color: attendanceStats.isSafe ? '#5eda9e' : '#ff6961' }}>
                    <span>🎓</span>
                    <span>Classes</span>
                  </div>
                  <span className="metric-val" style={{ color: attendanceStats.isSafe ? '#5eda9e' : '#ff6961' }}>
                    {attendanceStats.pct}%
                  </span>
                </Link>
              </div>
            </div>

            {/* Floating 3D Mascot & XP Bar (Opens Constellation Modal) */}
            <div className="mascot-xp-card" onClick={() => setIsXPModalOpen(true)} title="Click to view all 20 XP Mastery Tiers">
              <div className="mascot-float-wrap">
                <img
                  src={mascotImg}
                  alt=""
                  className="mascot-glow-aura"
                  style={{ filter: `blur(14px) drop-shadow(0 0 16px ${levelGradient[0]})` }}
                />
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

          {/* WHOOP-Style Discipline & Vitality Card */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Daily Vitality</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Activity size={13} color="#5eda9e" />
                <span style={{ fontSize: '0.74rem', color: '#5eda9e', fontWeight: 700 }}>Score: {disciplineScore}%</span>
              </div>
            </div>

            {/* Hydration Interactive Logger */}
            <div className="water-tracker-compact">
              <div className="water-header-row">
                <div
                  className="water-text-wrap"
                  onClick={() => {
                    setCustomGoalInput(String(waterTarget));
                    setIsWaterTargetModalOpen(true);
                  }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  title="Click to customize daily hydration target"
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

              {/* Progress Bar */}
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

            {/* Readwise-Style Active Recall Deck Banner */}
            <div
              className="recall-banner-clean"
              style={{ marginTop: '0.35rem' }}
              onClick={() => setIsFlashcardModalOpen(true)}
              title="Open Daily Active Recall Spaced Repetition Deck"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Zap size={14} color="#a599ff" />
                <span style={{ fontSize: '0.78rem', color: '#a599ff', fontWeight: 600 }}>
                  Active Recall Deck
                </span>
              </div>
              <button
                type="button"
                className="recall-btn-clean"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlashcardModalOpen(true);
                }}
                title="Review Flashcards with SM-2 Spaced Repetition"
              >
                Review (SM-2)
              </button>
            </div>

            {/* Subtle Stoic Wisdom */}
            <div className="quote-text-clean" style={{ marginTop: '0.35rem' }}>
              "Discipline is choosing between what you want now, and what you want most."
            </div>
          </div>

        </div>

        {/* ── COLUMN 2: SARA BAR, DYNAMIC AGENDA & TASKS (52% Width - Hero Center) ── */}
        <div className="bento-column">
          
          {/* Raycast-Style SARA Command Input Bar */}
          <form onSubmit={handleSaraSubmit} style={{ width: '100%' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'var(--color-surface, #141416)',
              border: '1px solid var(--color-border, #242428)',
              borderRadius: '14px',
              padding: '0.6rem 0.95rem',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
            }}>
              <Sparkles size={16} color="var(--zen-purple, #a599ff)" />
              <input
                type="text"
                value={saraPrompt}
                onChange={e => setSaraPrompt(e.target.value)}
                placeholder="Ask SARA anything... (e.g. 'Plan my day', 'Log workout', 'Bunk risk')"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary, #ffffff)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="submit"
                style={{
                  background: 'var(--zen-purple, #a599ff)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#000000',
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Send
              </button>
            </div>
          </form>

          {/* Dynamic Interleaved Agenda & Task Command Center */}
          <div className="life-widget-card">
            <div className="widget-header">
              <div className="widget-title-group">
                <CalendarIcon size={16} color="var(--accent-cyan, #38bdf8)" />
                <span className="widget-title">Today's Master Flow</span>
              </div>
              <Link to="/tasks" className="widget-action-link">All Tasks →</Link>
            </div>

            {/* Next Scheduled Item (Excludes classes) */}
            {nextEvent && (
              <div className="agenda-schedule-block">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={15} color="#89dceb" />
                  <span className="agenda-schedule-title">{nextEvent.title}</span>
                </div>
                <span className="agenda-schedule-time">{formatTimeRangeDisplay(nextEvent.time)}</span>
              </div>
            )}

            {/* Unified Master Flow List: Pending Tasks & Unlogged Classes FIRST, Logged/Cancelled/Attended Classes & Completed Tasks LAST */}
            <div className="agenda-task-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {masterFlowItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#8e8e93', fontSize: '0.82rem' }}>
                  <CheckCircle2 size={28} color="#5eda9e" style={{ margin: '0 auto 0.5rem auto', opacity: 0.8 }} />
                  <div>Zero pending commitments for today</div>
                  <div style={{ fontSize: '0.74rem', marginTop: 2 }}>Type below to plan your day</div>
                </div>
              ) : (
                masterFlowItems.map((item) => {
                  if (item.kind === 'class') {
                    const cls = item.data;
                    return (
                      <div
                        key={cls.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: cls.isAttended
                            ? 'rgba(94, 218, 158, 0.08)'
                            : cls.isMissed
                            ? 'rgba(255, 105, 97, 0.08)'
                            : cls.isCancelled
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'rgba(56, 189, 248, 0.06)',
                          border: `1px solid ${
                            cls.isAttended
                              ? 'rgba(94, 218, 158, 0.25)'
                              : cls.isMissed
                              ? 'rgba(255, 105, 97, 0.25)'
                              : cls.isCancelled
                              ? 'rgba(255, 255, 255, 0.08)'
                              : 'rgba(56, 189, 248, 0.16)'
                          }`,
                          borderRadius: '12px',
                          padding: '0.55rem 0.85rem',
                          transition: 'all 0.2s ease',
                          opacity: cls.action ? 0.65 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: 1, minWidth: 0 }}>
                          <GraduationCap size={15} color={cls.isAttended ? '#5eda9e' : cls.isMissed ? '#ff6961' : '#38bdf8'} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: 'var(--text-primary, #ffffff)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {cls.title}
                              </span>
                              <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: cls.type === 'lab' ? 'rgba(165, 153, 255, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                color: cls.type === 'lab' ? '#a599ff' : '#38bdf8'
                              }}>
                                {cls.type?.toUpperCase()}
                              </span>
                            </div>
                            {cls.room && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #8e8e93)' }}>
                                {cls.room}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.76rem', color: '#89dceb', fontWeight: 600 }}>
                            {cls.time}
                          </span>

                          {/* Interactive Attendance Action Buttons */}
                          {cls.action ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: cls.isAttended
                                    ? 'rgba(94, 218, 158, 0.15)'
                                    : cls.isMissed
                                    ? 'rgba(255, 105, 97, 0.15)'
                                    : 'rgba(255, 255, 255, 0.08)',
                                  color: cls.isAttended
                                    ? '#5eda9e'
                                    : cls.isMissed
                                    ? '#ff6961'
                                    : '#8e8e93',
                                  border: `1px solid ${
                                    cls.isAttended
                                      ? 'rgba(94, 218, 158, 0.3)'
                                      : cls.isMissed
                                      ? 'rgba(255, 105, 97, 0.3)'
                                      : 'rgba(255, 255, 255, 0.1)'
                                  }`
                                }}
                              >
                                {cls.isAttended ? '✓ Attended' : cls.isMissed ? '✕ Missed' : '⊘ Cancelled'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUndoAttendance(cls.logId!, cls.subject, cls.action!, cls.type)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted, #8e8e93)',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  borderRadius: '4px'
                                }}
                                title="Undo attendance log"
                              >
                                <Undo2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <button
                                type="button"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'attended', cls.idx)}
                                style={{
                                  background: 'rgba(94, 218, 158, 0.15)',
                                  border: '1px solid rgba(94, 218, 158, 0.35)',
                                  color: '#5eda9e',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                                title="Mark Present"
                              >
                                <Check size={11} strokeWidth={3} />
                                <span>Present</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'missed', cls.idx)}
                                style={{
                                  background: 'rgba(255, 105, 97, 0.10)',
                                  border: '1px solid rgba(255, 105, 97, 0.25)',
                                  color: '#ff6961',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                                title="Mark Absent"
                              >
                                <span>Absent</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'cancelled', cls.idx)}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: '#8e8e93',
                                  padding: '3px 6px',
                                  borderRadius: '6px',
                                  fontSize: '0.7rem',
                                  cursor: 'pointer'
                                }}
                                title="Mark Cancelled / Off"
                              >
                                <Ban size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (item.kind === 'workout') {
                    const gym = item.data;
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(255, 105, 97, 0.06)',
                          border: '1px solid rgba(255, 105, 97, 0.18)',
                          borderRadius: '12px',
                          padding: '0.55rem 0.85rem',
                          opacity: 0.65
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                          <span style={{ fontSize: '0.9rem' }}>🏋️</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary, #ffffff)' }}>
                            {gym.routineName || gym.splitName || 'Workout Completed'}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(94, 218, 158, 0.15)',
                          color: '#5eda9e',
                          border: '1px solid rgba(94, 218, 158, 0.3)'
                        }}>
                          ✓ Logged
                        </span>
                      </div>
                    );
                  }

                  // Task Item
                  const task = item.data;
                  const isDone = task.status === 'completed';
                  return (
                    <div key={task.id} className="agenda-task-item" style={{ opacity: isDone ? 0.45 : 1 }}>
                      <button
                        type="button"
                        className={`agenda-checkbox ${isDone ? 'checked' : ''}`}
                        onClick={() => toggleTask(task)}
                        aria-label="Complete task"
                      >
                        {isDone && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span className="agenda-task-text" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
                        {task.title || task.text}
                      </span>
                      {task.timeSlot && (
                        <span className="agenda-time-tag">{formatTimeRangeDisplay(task.timeSlot)}</span>
                      )}
                      <button
                        type="button"
                        className="todo-action-icon-btn timer-btn"
                        onClick={() => {
                          const taskTitle = task.title || task.text || 'Focus Task';
                          const durationMins = extractTaskDurationMinutes(
                            task.estimatedMinutes || task.durationMinutes || task.duration,
                            task.timeSlot,
                            taskTitle
                          );
                          startTimer(task.id, taskTitle, undefined, undefined, durationMins);
                          toast.success(`Pomodoro Focus started: "${taskTitle}"`);
                        }}
                        title="Start Focus Timer"
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

        {/* ── COLUMN 3: ACADEMIC RISK WATCHTOWER & HABITS (24% Width) ── */}
        <div className="bento-column">

          {/* Academic & Attendance Health Card */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Attendance Watch</span>
              <Link to="/attendance" className="widget-action-link">Details →</Link>
            </div>

            <div className="subject-health-stack">
              {attendanceSubjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem 0', color: '#8e8e93', fontSize: '0.78rem' }}>
                  No courses enrolled yet.
                </div>
              ) : (
                attendanceSubjects.slice(0, 4).map(sub => {
                  const attended = (sub.classesAttended || 0) + (sub.labsAttended || 0);
                  const total = (sub.classesTotal || 0) + (sub.labsTotal || 0);
                  const pct = total > 0 ? Math.round((attended / total) * 100) : 100;
                  const isSafe = pct >= (sub.targetPercentage || 75);

                  return (
                    <div key={sub.id} className="subject-health-row">
                      <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>{sub.name}</span>
                      <span className={`subject-badge ${isSafe ? 'safe' : 'warning'}`}>
                        {pct}% {isSafe ? 'Safe' : 'At Risk'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Daily Habits Widget */}
          <div className="life-widget-card">
            <div className="widget-header">
              <span className="widget-title">Daily Habits</span>
              <Link to="/habits" className="widget-action-link">Streaks →</Link>
            </div>

            <div className="habit-list-compact">
              {habits.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#8e8e93', padding: '1rem 0', textAlign: 'center' }}>
                  No habits active. Add some in Habits!
                </div>
              ) : (
                habits.slice(0, 4).map(h => {
                  const isDone = todayHabitLogMap.get(h.id);
                  const habitStreak = h.streak || h.currentStreak || 0;
                  return (
                    <div key={h.id} className="habit-row-clean" onClick={() => toggleHabit(h.id)}>
                      <div className="habit-title-clean">
                        <span className="habit-emoji-box">{h.emoji || '⚡'}</span>
                        <span className="habit-name-text">{h.name || h.title}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {habitStreak > 0 && (
                          <span className="habit-streak-badge">🔥 {habitStreak}d</span>
                        )}
                        <button
                          type="button"
                          className={`habit-check-pill ${isDone ? 'completed' : ''}`}
                          aria-label={isDone ? 'Completed' : 'Mark Complete'}
                        >
                          {isDone && <Check size={11} strokeWidth={3} />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
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
              Choose a quick preset or enter your custom daily target.
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
                Custom Target (ml)
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

      {/* Interactive Active Recall Spaced Repetition Modal */}
      <FlashcardReviewModal
        isOpen={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
      />

    </div>
  );
};


