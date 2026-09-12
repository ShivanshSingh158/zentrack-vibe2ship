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
  Undo2,
  Target
} from 'lucide-react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { auth, db } from '../../services/firebase';
import { doc, onSnapshot, updateDoc, addDoc, collection, deleteDoc, setDoc } from 'firebase/firestore';
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
    allHabits, goals, userXP, awardXP
  } = globalData;
  const user = auth.currentUser;
  const navigate = useNavigate();
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const { startTimer } = usePomodoroContext();

  const [profileStreak, setProfileStreak] = useState<number | null>(null);
  const [isXPModalOpen, setIsXPModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [optimisticHabits, setOptimisticHabits] = useState<Record<string, boolean>>({});
  const [showNextDaySchedule, setShowNextDaySchedule] = useState(false);

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

  // Dark / Plain Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return document.body.classList.contains('theme-dark') || localStorage.getItem('zen_theme') === 'dark';
  });

  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.theme) {
        setIsDarkMode(detail.theme === 'dark');
      }
    };
    window.addEventListener('zen-theme-toggle', handleThemeEvent);
    return () => window.removeEventListener('zen-theme-toggle', handleThemeEvent);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    const newTheme = nextDark ? 'dark' : 'light';
    localStorage.setItem('zen_theme', newTheme);
    window.dispatchEvent(new CustomEvent('zen-theme-toggle', { detail: { theme: newTheme } }));
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

  // Overdue pending tasks (tasks with date earlier than today that are still pending)
  const overdueTasks = useMemo(() => {
    return (tasks || [])
      .filter(t => t.date && t.date < todayStr && t.status !== 'completed')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [tasks, todayStr]);

  // Pending tasks with no date (Inbox tasks)
  const inboxTasks = useMemo(() => {
    return (tasks || [])
      .filter(t => !t.date && t.status !== 'completed')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [tasks]);

  // Dated tasks for today
  const todayDatedTasks = useMemo(() => {
    return (tasks || []).filter(t => t.date === todayStr);
  }, [tasks, todayStr]);

  // Today Actionable Tasks: Overdue tasks float to the top so unfinished work is never lost
  const todayTasks = useMemo(() => {
    const combined = [...overdueTasks, ...todayDatedTasks];
    return combined.sort((a, b) => {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) {
        return aDone - bDone; // pending (0) first, completed (1) last
      }
      const aOverdue = (a.date && a.date < todayStr) ? 0 : 1;
      const bOverdue = (b.date && b.date < todayStr) ? 0 : 1;
      if (aOverdue !== bOverdue) {
        return aOverdue - bOverdue; // overdue pending first
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [overdueTasks, todayDatedTasks, todayStr]);

  const doneTasks = useMemo(() => {
    return todayTasks.filter(t => t.status === 'completed');
  }, [todayTasks]);

  const pendingTasks = useMemo(() => {
    return todayTasks.filter(t => t.status !== 'completed');
  }, [todayTasks]);

  // Upcoming Tasks (Next 7+ days)
  const upcomingTasks = useMemo(() => {
    const future = (tasks || []).filter(t => t.date && t.date > todayStr && t.status !== 'completed');
    return future.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [tasks, todayStr]);

  // Active Goals for Dashboard
  const activeGoals = useMemo(() => {
    return (goals || []).filter((g: any) => g.status !== 'completed');
  }, [goals]);

  const calculateGoalProgress = (goal: any): number => {
    const krs = goal.keyResults || [];
    if (krs.length === 0) return goal.progress || (goal.status === 'completed' ? 100 : 0);
    const sum = krs.reduce((acc: number, kr: any) => {
      const val = kr.currentValue || 0;
      const target = kr.targetValue || 1;
      return acc + Math.min(val / target, 1);
    }, 0);
    return Math.round((sum / krs.length) * 100);
  };

  // Quick Scratchpad (persistent local capture)
  const [scratchpadText, setScratchpadText] = useState<string>(() => {
    return localStorage.getItem('zentrack_dashboard_scratchpad') || '';
  });
  const handleScratchpadChange = (val: string) => {
    setScratchpadText(val);
    localStorage.setItem('zentrack_dashboard_scratchpad', val);
  };

  const getRelativeDateLabel = (dateStr?: string, todayStrVal?: string) => {
    if (!dateStr) return '';
    if (!todayStrVal) return dateStr;
    try {
      const d = new Date(dateStr + 'T00:00:00');
      const t = new Date(todayStrVal + 'T00:00:00');
      const diffDays = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays === 2) return 'In 2 days';
      if (diffDays > 2 && diffDays <= 6) {
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleQuickScheduleTomorrow = async () => {
    if (!user) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);
    await addDoc(collection(db, 'todos'), {
      userId: user.uid,
      title: 'Top Priority Focus',
      text: 'Top Priority Focus',
      date: tomorrowStr,
      status: 'pending',
      priority: 'high',
      createdAt: Date.now(),
      order: 0,
    });
    playPopSound();
    toast.success('Scheduled priority focus for tomorrow');
  };

  const handleAddTemplateTask = async (templateTitle: string) => {
    if (!user) return;
    const count = todayTasks.length;
    await addDoc(collection(db, 'todos'), {
      userId: user.uid,
      title: templateTitle,
      text: templateTitle,
      date: todayStr,
      status: 'pending',
      priority: 'medium',
      createdAt: Date.now(),
      order: count,
    });
    playPopSound();
    toast.success(`Added "${templateTitle}" to today's flow`);
  };

  // Habit Logs
  const todayHabitLogMap = useMemo(() => {
    const map = new Map<string, boolean>();
    const cleanToday = (todayStr || '').slice(0, 10);
    (habitLogs || []).forEach(l => {
      const lDate = (l.date || '').slice(0, 10);
      if (lDate === cleanToday && l.habitId) {
        map.set(l.habitId, true);
      }
    });
    return map;
  }, [habitLogs, todayStr]);

  const isHabitDone = (habitId: string) => {
    if (optimisticHabits[habitId] !== undefined) {
      return optimisticHabits[habitId];
    }
    return !!todayHabitLogMap.get(habitId);
  };

  const completedHabitsCount = useMemo(() => {
    let c = 0;
    (habits || []).forEach(h => {
      if (isHabitDone(h.id)) c++;
    });
    return c;
  }, [habits, todayHabitLogMap, optimisticHabits]);

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

  // Next Upcoming Classes (if today has no scheduled classes, e.g. Weekend / Off-day)
  const nextUpcomingClassesInfo = useMemo(() => {
    if (todayClasses.length > 0 || !attendanceSubjects || attendanceSubjects.length === 0) {
      return { dayName: '', dateStr: '', classes: [] as Array<{ id: string; subject: any; title: string; time: string; room?: string; type: 'class' | 'lab'; }> };
    }

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();

    // Check the next 6 days to find the first day with scheduled classes
    for (let offset = 1; offset <= 6; offset++) {
      const candidateDate = new Date(now);
      candidateDate.setDate(candidateDate.getDate() + offset);
      const candidateStr = getLocalDateString(candidateDate);
      const candidateDayName = DAY_NAMES[candidateDate.getDay()];

      const sessions: Array<{
        id: string;
        subject: any;
        title: string;
        time: string;
        room?: string;
        type: 'class' | 'lab';
      }> = [];

      (attendanceSubjects || []).forEach(subj => {
        const daySched = resolveSubjectDaySchedule(subj, candidateStr);
        const { classCount, labCount, classes, labs } = daySched;

        for (let i = 0; i < classCount; i++) {
          const item = classes[i];
          sessions.push({
            id: `${subj.id}-next-class-${i}`,
            subject: subj,
            title: subj.name,
            time: item?.time || `Class #${i + 1}`,
            room: item?.room,
            type: 'class',
          });
        }
        for (let i = 0; i < labCount; i++) {
          const item = labs[i];
          sessions.push({
            id: `${subj.id}-next-lab-${i}`,
            subject: subj,
            title: subj.name,
            time: item?.time || `Lab #${i + 1}`,
            room: item?.room,
            type: 'lab',
          });
        }
      });

      if (sessions.length > 0) {
        return {
          dayName: candidateDayName,
          dateStr: candidateStr,
          classes: sessions,
        };
      }
    }

    return { dayName: '', dateStr: '', classes: [] as Array<{ id: string; subject: any; title: string; time: string; room?: string; type: 'class' | 'lab'; }> };
  }, [todayClasses.length, attendanceSubjects]);

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

  // Toggle Habit (Bidirectional, optimistic, syncs with habit_logs & habitLogs)
  const toggleHabit = async (habitId: string) => {
    if (!user) return;
    const isDone = isHabitDone(habitId);
    playPopSound();
    const cleanToday = (todayStr || '').slice(0, 10);
    const logDocId = `${habitId}_${cleanToday}`;

    // Optimistically toggle immediately for instant UI tick / untick
    setOptimisticHabits(prev => ({ ...prev, [habitId]: !isDone }));

    try {
      if (isDone) {
        // Unmark / Undo
        await Promise.allSettled([
          deleteDoc(doc(db, 'habit_logs', logDocId)),
          deleteDoc(doc(db, 'habitLogs', logDocId)),
        ]);
        const matched = (habitLogs || []).filter(
          (l: any) => l.habitId === habitId && (l.date || '').slice(0, 10) === cleanToday
        );
        for (const m of matched) {
          if (m.id && m.id !== logDocId) {
            deleteDoc(doc(db, 'habit_logs', m.id)).catch(() => {});
            deleteDoc(doc(db, 'habitLogs', m.id)).catch(() => {});
          }
        }
        const habitObj = (habits || []).find((h: any) => h.id === habitId);
        if (habitObj) {
          await updateDoc(doc(db, 'habits', habitId), {
            streak: Math.max(0, (habitObj.streak || 1) - 1),
          }).catch(() => {});
        }
        toast.info('Habit unmarked');
      } else {
        // Mark Completed / Log
        const logData = {
          habitId,
          userId: user.uid,
          date: cleanToday,
          count: 1,
          timestamp: Date.now(),
          createdAt: Date.now(),
        };
        await Promise.allSettled([
          setDoc(doc(db, 'habit_logs', logDocId), logData),
          setDoc(doc(db, 'habitLogs', logDocId), logData),
        ]);
        const habitObj = (habits || []).find((h: any) => h.id === habitId);
        if (habitObj) {
          const newStreak = (habitObj.streak || 0) + 1;
          await updateDoc(doc(db, 'habits', habitId), {
            streak: newStreak,
            longestStreak: Math.max(newStreak, habitObj.longestStreak || 0),
          }).catch(() => {});
        }
        const res = await awardXP('HABIT_LOG');
        toast.success(`Habit logged! +${res.added} XP 🔥`);
        if (res.leveledUp) {
          toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
        }
      }
    } catch (e) {
      console.error('Error toggling habit:', e);
      // Revert optimistic state on error
      setOptimisticHabits(prev => ({ ...prev, [habitId]: isDone }));
      toast.error('Failed to update habit');
    }
  };

  // Trigger Global Add Task Modal
  const handleTriggerAddTask = () => {
    window.dispatchEvent(new CustomEvent('open-new-task-modal', { detail: { date: todayStr } }));
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

  // Formatted date and time matching reference: "Saturday, 12 September · 3:40 PM IST"
  const formattedDateTime = useMemo(() => {
    const d = new Date();
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('en-US', { month: 'long' });
    return `${dayName}, ${dayNum} ${monthName} · ${timeStr} IST`;
  }, [timeStr]);

  // 3-6 Real Quests dynamically compiled from user's live data (Hydration, Classes, Tasks, Habits, Focus)
  const quests = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      xp: number;
      isDone: boolean;
      type: 'task' | 'class' | 'habit' | 'water';
      action: () => void;
    }> = [];

    // 1. Real Hydration Quest (tied to actual user water target)
    list.push({
      id: 'quest-water',
      title: `Drink Water (${(waterAmount / 1000).toFixed(1)} / ${(waterTarget / 1000).toFixed(1)} L)`,
      xp: 38,
      isDone: waterAmount >= waterTarget,
      type: 'water',
      action: () => logWater(250),
    });

    // 2. Real Classes Quest (today's class or preview of upcoming lecture / review notes)
    if (todayClasses.length > 0) {
      todayClasses.forEach(cls => {
        list.push({
          id: `quest-class-${cls.id}`,
          title: `Attend ${cls.title}`,
          xp: 35,
          isDone: !!cls.isAttended,
          type: 'class',
          action: () => {
            if (!cls.isAttended) {
              handleLogAttendance(cls.subject, cls.type, 'attended', cls.idx);
            } else if (cls.logId) {
              handleUndoAttendance(cls.logId, cls.subject, cls.action || 'attended', cls.type);
            }
          },
        });
      });
    } else if (nextUpcomingClassesInfo.classes.length > 0) {
      const topNext = nextUpcomingClassesInfo.classes[0];
      list.push({
        id: `quest-class-prep`,
        title: `Prep for ${topNext.title} (${nextUpcomingClassesInfo.dayName})`,
        xp: 30,
        isDone: false,
        type: 'class',
        action: () => setShowNextDaySchedule(true),
      });
    } else if ((attendanceSubjects || []).length > 0) {
      const topSubj = attendanceSubjects[0];
      list.push({
        id: `quest-academic-notes`,
        title: `Review ${topSubj.name} notes`,
        xp: 30,
        isDone: false,
        type: 'class',
        action: () => navigate('/attendance'),
      });
    }

    // 3. Real Today's Tasks Quests (today's tasks, overdue tasks, or inbox tasks)
    const actionableTasks = todayTasks.length > 0 ? todayTasks : inboxTasks;
    actionableTasks.slice(0, 3).forEach(t => {
      list.push({
        id: `quest-task-${t.id}`,
        title: t.title || t.text || 'Daily Task',
        xp: 50,
        isDone: t.status === 'completed',
        type: 'task',
        action: () => toggleTask(t),
      });
    });

    // 4. Real User Habits Quests (from user's real habits)
    (habits || []).slice(0, 3).forEach(h => {
      const done = isHabitDone(h.id);
      list.push({
        id: `quest-habit-${h.id}`,
        title: h.name || h.title || 'Daily Habit',
        xp: 40,
        isDone: done,
        type: 'habit',
        action: () => toggleHabit(h.id),
      });
    });

    // 5. Pomodoro Focus Block Quest
    if (list.length < 5) {
      const focusDone = (pomodoroSessions || []).some(s => {
        const sDate = s.date || (s.startTime ? getLocalDateString(new Date(s.startTime)) : '');
        return sDate === todayStr;
      }) || doneTasks.length > 0;

      list.push({
        id: 'quest-focus',
        title: 'Finish 25m focus block',
        xp: 25,
        isDone: focusDone,
        type: 'task',
        action: () => {
          const t = pendingTasks[0] || inboxTasks[0];
          startTimer(t?.id || 'focus-block', t?.title || 'Deep Work Focus', undefined, undefined, 25);
          toast.success('Pomodoro Focus started: 25m');
        },
      });
    }

    return list;
  }, [
    waterAmount, waterTarget, todayClasses, nextUpcomingClassesInfo, attendanceSubjects,
    todayTasks, inboxTasks, habits, habitLogs, optimisticHabits,
    pomodoroSessions, doneTasks, pendingTasks, todayStr, navigate
  ]);

  // Group upcoming tasks by relative day (Tomorrow, In 2 days, etc.)
  const upcomingGrouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    (upcomingTasks || []).forEach(task => {
      const label = getRelativeDateLabel(task.date, todayStr);
      if (!groups[label]) groups[label] = [];
      groups[label].push(task);
    });
    return Object.entries(groups).slice(0, 3);
  }, [upcomingTasks, todayStr]);

  // Donut Ring (120px)
  const RING_SIZE = 120;
  const RING_STROKE = 7;
  const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0.04, levelInfo.progress)));

  return (
    <div className="life-dashboard-root">
      
      {/* ── TOP HEADER: GREETING & RIGHT ACTIONS (SARA, STREAK, THEME) ── */}
      <header className="box-header-bar">
        <div className="box-header-left">
          <h1 className="box-greeting-title">
            {greeting}, <span className="box-greeting-name">{displayName}</span>
          </h1>
          <div className="box-date-subtitle">
            {formattedDateTime}
          </div>
        </div>

        <div className="box-header-right">
          {/* Ask SARA... Search Pill */}
          <form onSubmit={handleSaraSubmit} className="box-sara-form">
            <input
              type="text"
              value={saraPrompt}
              onChange={e => setSaraPrompt(e.target.value)}
              placeholder="Ask SARA..."
              className="box-sara-input"
            />
          </form>

          {/* SARA Voice Orb launcher button */}
          <button
            type="button"
            className="box-sara-round-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-sara-modal'))}
            title="Open SARA Voice & Terminal"
          >
            <Bot size={15} />
          </button>

          {/* Flame Streak Pill */}
          <Link to="/habits" className="box-streak-pill" title="Daily Streak">
            <span>🔥</span>
            <span>{appStreak} {appStreak === 1 ? 'Day' : 'Days'}</span>
          </Link>

          {/* Theme Toggle */}
          <button
            type="button"
            className="box-theme-btn"
            onClick={toggleTheme}
            title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} mode`}
          >
            {isDarkMode ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6b7280" />}
          </button>
        </div>
      </header>

      {/* ── 3-COLUMN BENTO BOXES CONTAINER (NO-SCROLL VIEWPORT FIT) ── */}
      <main className="box-dashboard-grid">

        {/* ══════════════════════════════════════════════════════════════
            COLUMN 1 (LEFT): YOUR PROGRESS HERO CARD
            ══════════════════════════════════════════════════════════════ */}
        <div className="box-col box-col-progress">
          <div className="card-progress">
            <div className="card-progress-header">
              <span className="card-progress-title">Your progress</span>
            </div>

            {/* Circular Progress Ring */}
            <div
              className="progress-donut-container"
              onClick={() => setIsXPModalOpen(true)}
              title="Click to view all 20 XP Mastery Constellations"
            >
              <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}>
                <defs>
                  <linearGradient id="questRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={levelGradient[0]} />
                    <stop offset="100%" stopColor={levelGradient[1]} />
                  </linearGradient>
                </defs>
                <circle
                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                  fill="none" className="ring-track-circle" strokeWidth={RING_STROKE}
                />
                <circle
                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                  fill="none" stroke="url(#questRingGrad)" strokeWidth={RING_STROKE}
                  strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={ringDashoffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="donut-text-center">
                <span className="donut-rank-title">{levelInfo.label}</span>
                <span className="donut-rank-pct">{Math.round(levelInfo.progress * 100)}% to next</span>
              </div>
            </div>

            {/* XP Statistics */}
            <div className="progress-xp-block" onClick={() => setIsXPModalOpen(true)}>
              <div className="progress-xp-value">{activeXP.toLocaleString()} XP</div>
              <div className="progress-xp-sub">
                {(levelInfo.nextXP - levelInfo.xp).toLocaleString()} XP to {levelInfo.nextLabel}
              </div>
            </div>

            {/* Today's Quests */}
            <div className="quests-section">
              <div className="quests-header-label">Today's quests</div>
              <div className="quests-list">
                {quests.map(q => (
                  <div
                    key={q.id}
                    className={`quest-item ${q.isDone ? 'done' : ''}`}
                    onClick={q.action}
                    title="Click to advance or toggle quest"
                  >
                    <div className="quest-left">
                      <div className={`quest-checkbox ${q.isDone ? 'checked' : ''}`}>
                        {q.isDone && <Check size={11} strokeWidth={3.2} />}
                      </div>
                      <span className="quest-title">{q.title}</span>
                    </div>
                    <span className="quest-xp-badge">+{q.xp} XP</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Streak Row */}
            <Link to="/habits" className="progress-streak-row" title="View Habit Streaks">
              <div className="progress-streak-left">
                <span className="streak-flame-icon">🔥</span>
                <span className="streak-label">Streak</span>
              </div>
              <span className="streak-val">{appStreak} {appStreak === 1 ? 'day' : 'days'}</span>
            </Link>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            COLUMN 2 (CENTER): TASKS & CLASSES COMMAND CENTER
            ══════════════════════════════════════════════════════════════ */}
        <div className="box-col box-col-tasks">
          <div className="card-tasks">
            <div className="card-tasks-header">
              <span className="card-tasks-title">Tasks</span>
              <div className="card-tasks-header-actions">
                {todayClasses.length > 0 && (
                  <Link to="/attendance" className="card-link">Classes ({todayClasses.length})</Link>
                )}
                <Link to="/tasks" className="card-link">View all</Link>
              </div>
            </div>

            <div className="tasks-scroll-body">
              {/* ── TODAY'S CLASSES (Only when classes scheduled) ── */}
              {todayClasses.length > 0 && (
                <div className="today-classes-block">
                  <div className="classes-subhead-row">
                    <span className="classes-subhead-title">Classes</span>
                    <span className="classes-count-badge">
                      {todayClasses.length} {todayClasses.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>
                  <div className="center-classes-list">
                    {todayClasses.map(cls => (
                      <div
                        key={cls.id}
                        className={`center-class-row ${cls.isAttended ? 'attended' : cls.isMissed ? 'missed' : cls.isCancelled ? 'cancelled' : ''}`}
                      >
                        <div className="center-class-left">
                          <GraduationCap
                            size={15}
                            className={`class-icon ${cls.isAttended ? 'text-green' : cls.isMissed ? 'text-red' : 'text-cyan'}`}
                          />
                          <div className="center-class-info">
                            <div className="center-class-title-line">
                              <span className="center-class-name">{cls.title}</span>
                              <span className={`center-class-tag ${cls.type}`}>{cls.type.toUpperCase()}</span>
                            </div>
                            <div className="center-class-meta">
                              <span className="center-class-time">{cls.time}</span>
                              {cls.room && <span className="center-class-room">• {cls.room}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="center-class-actions">
                          {cls.action ? (
                            <div className="class-logged-badge-wrap">
                              <span className={`class-status-chip ${cls.action}`}>
                                {cls.isAttended ? '✓ Attended' : cls.isMissed ? '✕ Missed' : '⊘ Cancelled'}
                              </span>
                              <button
                                type="button"
                                className="class-undo-btn"
                                onClick={() => handleUndoAttendance(cls.logId!, cls.subject, cls.action!, cls.type)}
                                title="Undo attendance"
                              >
                                <Undo2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="class-action-btns">
                              <button
                                type="button"
                                className="class-btn present"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'attended', cls.idx)}
                                title="Mark Present (+30 XP)"
                              >
                                <Check size={11} strokeWidth={3} />
                                <span>Present</span>
                              </button>
                              <button
                                type="button"
                                className="class-btn absent"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'missed', cls.idx)}
                                title="Mark Absent"
                              >
                                <span>Absent</span>
                              </button>
                              <button
                                type="button"
                                className="class-btn cancel"
                                onClick={() => handleLogAttendance(cls.subject, cls.type, 'cancelled', cls.idx)}
                                title="Mark Cancelled"
                              >
                                <Ban size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TODAY ── */}
              <div className="tasks-section-today">
                <div className="classes-subhead-row">
                  <span className="classes-subhead-title">Today</span>
                </div>

                {todayTasks.length === 0 ? (
                  <div
                    className="tasks-empty-banner"
                    onClick={handleTriggerAddTask}
                    title="Click to add a task for today"
                  >
                    <span className="tasks-empty-check">✓</span>
                    <span>Nothing due today — good time for a focus block.</span>
                  </div>
                ) : (
                  <div className="tasks-list-today">
                    {todayTasks.map(task => {
                      const isDone = task.status === 'completed';
                      const isOverdue = task.date && task.date < todayStr && !isDone;
                      return (
                        <div key={task.id} className={`task-row-today ${isDone ? 'done' : ''}`} style={{ opacity: isDone ? 0.5 : 1 }}>
                          <button
                            type="button"
                            className={`task-circle-check ${isDone ? 'checked' : ''}`}
                            onClick={() => toggleTask(task)}
                            aria-label="Toggle task"
                          >
                            {isDone && <Check size={10} strokeWidth={3} />}
                          </button>
                          <span
                            className="task-row-title"
                            style={{ textDecoration: isDone ? 'line-through' : 'none' }}
                          >
                            {task.title || task.text}
                          </span>
                          {isOverdue && (
                            <span className="task-overdue-pill">Overdue</span>
                          )}
                          {task.timeSlot && (
                            <span className="task-time-pill">{formatTimeRangeDisplay(task.timeSlot)}</span>
                          )}
                          {task.priority && (
                            <span className={`upcoming-priority-tag p-${task.priority}`}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </span>
                          )}
                          {!isDone && (
                            <button
                              type="button"
                              className="task-timer-icon-btn"
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Direct Trigger to App's Add Task Modal */}
                <button
                  type="button"
                  onClick={handleTriggerAddTask}
                  className="tasks-inline-trigger-btn"
                  title="Add a task for today (opens task creator)"
                >
                  + Add a task for today...
                </button>
              </div>

              {/* ── UPCOMING ── */}
              <div className="tasks-section-upcoming">
                <div className="classes-subhead-row">
                  <span className="classes-subhead-title">Upcoming</span>
                </div>

                {upcomingTasks.length === 0 ? (
                  <div className="upcoming-empty-note">
                    <span>No upcoming deadlines scheduled for the next 7 days.</span>
                  </div>
                ) : (
                  <div className="upcoming-groups-stack">
                    {upcomingGrouped.map(([dayLabel, dayTasks]) => (
                      <div key={dayLabel} className="upcoming-day-group">
                        <div className="upcoming-day-heading">{dayLabel}</div>
                        <div className="upcoming-day-list">
                          {dayTasks.map(task => (
                            <div
                              key={task.id}
                              className="upcoming-item-row"
                              onClick={() => navigate('/tasks')}
                              title="Open in Tasks"
                            >
                              <span className="upcoming-item-title">{task.title || task.text}</span>
                              <span className={`upcoming-priority-tag p-${task.priority || 'low'}`}>
                                {(task.priority || 'low').charAt(0).toUpperCase() + (task.priority || 'low').slice(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            COLUMN 3 (RIGHT): ATTENDANCE, HABITS & VITALITY, GOALS & NOTES
            ══════════════════════════════════════════════════════════════ */}
        <div className="box-col box-col-stack">
          
          {/* Box 3A: Attendance */}
          <div className="card-mini card-attendance">
            <div className="card-mini-header">
              <span className="card-mini-title">Attendance</span>
              <Link to="/attendance" className="card-link">Details</Link>
            </div>
            <div className="attendance-overall-sub">
              <strong>{attendanceStats.pct}%</strong> overall · min. 75%
            </div>
            <div className="attendance-subject-list">
              {attendanceSubjects.length === 0 ? (
                <div className="mini-empty-hint">No courses enrolled yet.</div>
              ) : (
                attendanceSubjects.slice(0, 4).map(sub => {
                  const attended = (sub.classesAttended || 0) + (sub.labsAttended || 0);
                  const total = (sub.classesTotal || 0) + (sub.labsTotal || 0);
                  const pct = total > 0 ? Math.round((attended / total) * 100) : 100;
                  const isSafe = pct >= (sub.targetPercentage || 75);

                  return (
                    <div key={sub.id} className="subject-bar-item">
                      <div className="subject-bar-header">
                        <span className="subject-bar-name">{sub.name}</span>
                        <span className="subject-bar-pct">{pct}%</span>
                      </div>
                      <div className="subject-bar-track">
                        <div
                          className={`subject-bar-fill ${isSafe ? 'safe' : 'risk'}`}
                          style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Box 3B: Habits & vitality */}
          <div className="card-mini card-habits-vitality">
            <div className="card-mini-header">
              <span className="card-mini-title">Habits & vitality</span>
              <Link to="/habits" className="card-link">Streaks</Link>
            </div>

            {/* Hydration Tracker */}
            <div className="water-mini-block">
              <div className="water-mini-header">
                <div
                  className="water-mini-label"
                  onClick={() => {
                    setCustomGoalInput(String(waterTarget));
                    setIsWaterTargetModalOpen(true);
                  }}
                  title="Click to customize daily water goal"
                >
                  Water — {(waterAmount / 1000).toFixed(1)}/{(waterTarget / 1000).toFixed(1)} L
                </div>
                <span className="water-mini-pct">
                  {Math.round((waterAmount / (waterTarget || 1)) * 100)}%
                </span>
              </div>
              <div className="water-mini-track">
                <div
                  className="water-mini-fill"
                  style={{ width: `${Math.min(100, Math.round((waterAmount / (waterTarget || 1)) * 100))}%` }}
                />
              </div>
              <div className="water-chips-row">
                <button type="button" className="water-btn-chip" onClick={() => logWater(250)}>+250 ml</button>
                <button type="button" className="water-btn-chip" onClick={() => logWater(500)}>+500 ml</button>
                {waterAmount > 0 && (
                  <button type="button" className="water-btn-chip reset" onClick={resetWater} title="Reset water">
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Habits List */}
            <div className="habits-mini-list">
              {habits.slice(0, 2).map(h => {
                const isDone = isHabitDone(h.id);
                const habitStreak = h.streak || h.currentStreak || 1;
                return (
                  <div key={h.id} className="habit-mini-row" onClick={() => toggleHabit(h.id)}>
                    <div className="habit-mini-left">
                      <span className="habit-mini-name">{h.name || h.title}</span>
                      <span className="habit-mini-streak-label">{habitStreak}-day streak</span>
                    </div>
                    <button
                      type="button"
                      className={`habit-circle-check ${isDone ? 'checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleHabit(h.id);
                      }}
                      aria-label="Toggle habit"
                    >
                      {isDone && <Check size={11} strokeWidth={3} />}
                    </button>
                  </div>
                );
              })}

              {/* Active Recall Deck row */}
              <div
                className="recall-mini-row"
                onClick={() => setIsFlashcardModalOpen(true)}
                title="Review Flashcards with SM-2 Spaced Repetition"
              >
                <div className="recall-mini-left">
                  <span className="recall-mini-name">Active recall deck</span>
                  <span className="recall-mini-sub">SM-2 repetition</span>
                </div>
                <button
                  type="button"
                  className="recall-review-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFlashcardModalOpen(true);
                  }}
                >
                  Review
                </button>
              </div>
            </div>
          </div>

          {/* Box 3C: Goals & notes */}
          <div className="card-mini card-goals-notes">
            <div className="card-mini-header">
              <span className="card-mini-title">Goals & notes</span>
              <Link to="/goals" className="card-link">All goals</Link>
            </div>

            {/* Active Goals */}
            <div className="goals-mini-list">
              {activeGoals.length === 0 ? (
                <div className="mini-empty-hint">Set your milestones in Goals →</div>
              ) : (
                activeGoals.slice(0, 2).map((goal: any) => {
                  const progress = calculateGoalProgress(goal);
                  return (
                    <div key={goal.id} className="goal-bar-item" onClick={() => navigate('/goals')}>
                      <div className="goal-bar-header">
                        <span className="goal-bar-name">{goal.title}</span>
                        <span className="goal-bar-pct">{progress}%</span>
                      </div>
                      <div className="goal-bar-track">
                        <div
                          className="goal-bar-fill"
                          style={{ width: `${Math.max(5, progress)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Notes */}
            <div className="quick-notes-wrap">
              <div className="quick-notes-label">Quick notes</div>
              <textarea
                value={scratchpadText}
                onChange={e => handleScratchpadChange(e.target.value)}
                placeholder="Jot down a thought, idea, or link..."
                className="quick-notes-textarea"
                rows={2}
              />
            </div>
          </div>

        </div>

      </main>

      {/* ── MODALS (XP Constellation, Water Target, Flashcards) ── */}
      <XPConstellationModal
        isOpen={isXPModalOpen}
        onClose={() => setIsXPModalOpen(false)}
        currentXP={activeXP}
      />

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


