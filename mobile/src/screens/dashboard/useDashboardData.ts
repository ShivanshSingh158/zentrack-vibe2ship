/**
 * useDashboardData.ts — ZenTrack Dashboard Module
 *
 * All useState, useEffect, useFocusEffect, and useMemo data logic
 * extracted from DashboardScreen.tsx (was spread across lines 167–380).
 *
 * The screen coordinator just calls this hook and renders.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileData } from '../../contexts/MobileDataContext';
import { useSaraSurface } from '../../hooks/useSaraSurface';
import { BRUTAL_QUOTES, getDailyQuote, QuotePersonality } from '../../data/brutalQuotes';
import { getFingerprint } from '../../services/saraMemory';
import { LayoutItem } from '../../components/Dashboard/DashboardLayoutSheet';
import { NextClassData } from '../../components/Dashboard/UnifiedLifeWidget';
import { calculateAppStreak } from '../../utils/streakUtils';

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'quote', hidden: false },
  { id: 'stats', hidden: false },
  { id: 'xp', hidden: false },
  { id: 'capture', hidden: false },
  { id: 'agenda', hidden: false },
];

export function useDashboardData() {
  const {
    user, tasks, gymLogs, userGymPlan, habitLogs, allHabits,
    attendance, attendanceLogs, assignments, waterLogs, contentLogs, customEvents,
  } = useMobileData();

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [quote, setQuote] = useState(BRUTAL_QUOTES[0]);
  const [xp, setXp] = useState(0);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [layoutSheetVisible, setLayoutSheetVisible] = useState(false);
  const [waterLogVisible, setWaterLogVisible] = useState(false);
  const [waterTotal, setWaterTotal] = useState(2500);
  const [nowDate, setNowDate] = useState(new Date());

  // ── Clock tick (1min) ─────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNowDate(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── AsyncStorage loads (deferred) ─────────────────────────────────────────
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      AsyncStorage.getItem('@zentrack_dashboard_layout').then(val => {
        if (!val) return;
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            let loaded = parsed;
            if (typeof parsed[0] === 'string') {
              loaded = parsed.map((id: string) => ({ id, hidden: false }));
            }
            // Merge with defaults to ensure new items like 'capture' exist
            const merged = DEFAULT_LAYOUT.map(def => {
              const found = loaded.find((l: any) => l.id === def.id);
              return found ? found : def;
            });
            setLayout(merged);
          } else { setLayout(DEFAULT_LAYOUT); }
        } catch { setLayout(DEFAULT_LAYOUT); }
      });
      AsyncStorage.getItem('zentrack_water_goal_ml').then(val => {
        if (val) {
          setWaterTotal(parseInt(val, 10));
        } else {
          AsyncStorage.getItem('@zentrack_water_target').then(legacy => {
            if (legacy) setWaterTotal(parseInt(legacy, 10));
          });
        }
      });
    });
    return () => handle.cancel();
  }, []);

  // ── Quote + XP load on focus ───────────────────────────────────────────────
  useFocusEffect(
    React.useCallback(() => {
      const loadBFEQuote = async () => {
        try {
          if (user?.uid) {
            const fp = await getFingerprint(user.uid);
            setQuote(await getDailyQuote(fp.streakPersonality as QuotePersonality));
          } else {
            setQuote(await getDailyQuote());
          }
        } catch { setQuote(await getDailyQuote()); }
      };
      loadBFEQuote();
      AsyncStorage.getItem('zentrack_xp_v1').then(v => {
        const newXp = parseInt(v || '0', 10);
        setXp(cur => {
          if (cur > 0 && newXp > cur) setXpGain(newXp - cur);
          return newXp;
        });
      });
    }, [user?.uid])
  );

  // ── Time / greeting ────────────────────────────────────────────────────────
  const hour = nowDate.getHours();
  const effectiveDate = new Date(nowDate);
  if (hour < 2) effectiveDate.setDate(effectiveDate.getDate() - 1);
  const todayStr = [
    effectiveDate.getFullYear(),
    String(effectiveDate.getMonth() + 1).padStart(2, '0'),
    String(effectiveDate.getDate()).padStart(2, '0'),
  ].join('-');

  let timeGreeting = 'evening.';
  if (hour >= 21 || hour < 2) timeGreeting = 'night.';
  else if (hour < 12) timeGreeting = 'morning.';
  else if (hour < 17) timeGreeting = 'afternoon.';

// ── Next Class Logic ───────────────────────────────────────────────────────
  const nextClass = useMemo<NextClassData | null>(() => {
    if (!attendance || attendance.length === 0) return null;
    const dayOfWeek  = nowDate.getDay().toString();
    const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayClasses = attendance.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()]]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()].toLowerCase()];
      if (!sch) return [];
      const cls: any[] = [];
      if (sch.classes) sch.classes.forEach((c: any, idx: number) => c.time && cls.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Class`, time: c.time, type: 'class', subjectId: subj.id, subject: subj, sessionIdx: idx }));
      if (sch.labs)    sch.labs.forEach((l: any, idx: number) => l.time && cls.push({ id: `${subj.id}-lab-${l.time}`,   title: `${subj.name} Lab`,   time: l.time, type: 'lab', subjectId: subj.id, subject: subj, sessionIdx: idx }));
      return cls;
    });

    if (todayClasses.length === 0) return null;

    const parseTimeToMins = (tStr: string): number => {
      if (!tStr) return 9999;
      const startStr = tStr.split('-')[0].trim().toLowerCase();
      let h = 0; let m = 0;
      const isPM = startStr.includes('pm');
      const isAM = startStr.includes('am');
      const cleanStr = startStr.replace(/[a-z\s]/g, '');
      const parts = cleanStr.split(':');
      if (parts.length >= 2) { h = parseInt(parts[0], 10) || 0; m = parseInt(parts[1], 10) || 0; } 
      else { h = parseInt(parts[0], 10) || 0; }
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    const getEndTimeMins = (tStr: string, type: string): number => {
      if (!tStr) return 9999;
      const parts = tStr.split('-');
      const hasExplicitEnd = parts.length > 1;
      const endStr = (hasExplicitEnd ? parts[1] : parts[0]).trim().toLowerCase();
      let h = 0; let m = 0;
      const isPM = endStr.includes('pm');
      const isAM = endStr.includes('am');
      const cleanStr = endStr.replace(/[a-z\s]/g, '');
      const timeParts = cleanStr.split(':');
      if (timeParts.length >= 2) { h = parseInt(timeParts[0], 10) || 0; m = parseInt(timeParts[1], 10) || 0; } 
      else { h = parseInt(timeParts[0], 10) || 0; }
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      let totalMins = h * 60 + m;
      if (!hasExplicitEnd) {
        totalMins += type === 'lab' ? 120 : 60; // 2 hour default for labs, 1 hour for classes
      }
      return totalMins;
    };

    const formatTimeStr = (tStr: string): string => {
      if (!tStr) return '';
      if (tStr.includes('-')) return tStr.split('-').map(s => formatTimeStr(s.trim())).join(' - ');
      const lower = tStr.toLowerCase();
      if (lower.includes('am') || lower.includes('pm')) return lower.replace(/\s+/g, '');
      const parts = tStr.split(':');
      if (parts.length < 2) return tStr;
      const h = parseInt(parts[0], 10); const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return tStr;
      const ampm = h >= 12 ? 'pm' : 'am';
      const hr   = h % 12 || 12;
      return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();

    // Filter out cancelled classes
    const validClasses = todayClasses.filter(c => {
      const subLogs = (attendanceLogs || []).filter(l => 
        l.subjectId === c.subjectId && 
        l.date === todayStr && 
        !l.isExtra && 
        (c.type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type))
      ).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      const log = subLogs[c.sessionIdx];
      return !(log && log.action === 'cancelled');
    });

    validClasses.sort((a, b) => parseTimeToMins(a.time) - parseTimeToMins(b.time));

    const upcoming = validClasses.find(c => getEndTimeMins(c.time, c.type) > nowMins);
    if (!upcoming) return null;

    const startMins = parseTimeToMins(upcoming.time);
    const endMins = getEndTimeMins(upcoming.time, upcoming.type);
    const isOngoing = nowMins >= startMins && nowMins < endMins;

    const attended = upcoming.type === 'lab' ? (upcoming.subject.labsAttended || 0) : (upcoming.subject.classesAttended || 0);
    const total = upcoming.type === 'lab' ? (upcoming.subject.labsTotal || 0) : (upcoming.subject.classesTotal || 0);

    return {
      ...upcoming,
      time: formatTimeStr(upcoming.time),
      attended,
      total,
      isOngoing,
      startTimeMins: startMins,
      endTimeMins: endMins,
      nowMins
    };
  }, [attendance, nowDate, attendanceLogs, todayStr]);

  const avatarLetter = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A';

  // ── Sara PSI Surface ───────────────────────────────────────────────────────
  const psiCtx = useMemo(() => ({
    tasks: tasks as any[],
    attendance: attendance as any[],
    habits: [],
    habitLogs,
    gymLogs,
  }), [tasks, attendance, habitLogs, gymLogs]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface(
    'DashboardScreen', psiCtx as any, user?.uid
  );

  const appStreak = useMemo(() => {
    return calculateAppStreak(tasks, gymLogs, habitLogs);
  }, [tasks, gymLogs, habitLogs]);

  // ── Today's Class & Overall Attendance Stats ──────────────────────────────
  const { classesAttendedToday, classesTotalToday, overallAttendancePct } = useMemo(() => {
    if (!attendance || attendance.length === 0) {
      return { classesAttendedToday: 0, classesTotalToday: 0, overallAttendancePct: 0 };
    }

    const dayOfWeek = nowDate.getDay().toString();
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayClasses = attendance.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()]]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()].toLowerCase()];
      if (!sch) return [];
      const cls: any[] = [];
      if (sch.classes) sch.classes.forEach((c: any) => c.time && cls.push({ subjectId: subj.id, type: 'class', ...c }));
      if (sch.labs) sch.labs.forEach((l: any) => l.time && cls.push({ subjectId: subj.id, type: 'lab', ...l }));
      return cls;
    });

    const attendedCount = (attendanceLogs || []).filter(l => 
      l.date === todayStr && (l.action === 'attended' || l.action === 'present')
    ).length;

    let totalAttendedAll = 0;
    let totalClassesAll = 0;
    attendance.forEach(subj => {
      totalAttendedAll += (subj.classesAttended || 0) + (subj.labsAttended || 0);
      totalClassesAll += (subj.classesTotal || 0) + (subj.labsTotal || 0);
    });

    const overallPct = totalClassesAll > 0 ? Math.round((totalAttendedAll / totalClassesAll) * 100) : 0;

    return {
      classesAttendedToday: attendedCount,
      classesTotalToday: todayClasses.length,
      overallAttendancePct: overallPct,
    };
  }, [attendance, attendanceLogs, todayStr, nowDate]);

  return {
    // Data
    user, tasks, gymLogs, userGymPlan, habitLogs, allHabits,
    attendance, attendanceLogs, assignments, waterLogs, contentLogs,
    // Derived
    todayStr, timeGreeting, avatarLetter, hour,
    nowDate, nextClass, appStreak,
    classesAttendedToday, classesTotalToday, overallAttendancePct,
    // State
    quote, xp, xpGain, captureVisible, layout, layoutSheetVisible,
    waterLogVisible, waterTotal,
    // Sara surface
    surfaceMessage, surfaceActionLabel, dismissBanner,
    // Setters
    setXpGain, setCaptureVisible, setLayout, setLayoutSheetVisible,
    setWaterLogVisible, setWaterTotal,
  };
}
