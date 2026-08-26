/**
 * useDashboardData.ts — ZenTrack Dashboard Module
 *
 * All useState, useEffect, useFocusEffect, and useMemo data logic
 * extracted from DashboardScreen.tsx (was spread across lines 167–380).
 *
 * The screen coordinator just calls this hook and renders.
 *
 * PERF: Uses granular domain hooks instead of useMobileData() so Dashboard
 * only re-renders when its own data slices change — not on every gym log,
 * note, or academic update. Eliminates 6–8 spurious useMemo recomputes per
 * unrelated Firestore update.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { usePlannerData } from '../../contexts/domains/PlannerContext';
import { useSaraSurface } from '../../hooks/useSaraSurface';
import { BRUTAL_QUOTES, getDailyQuote, QuotePersonality } from '../../data/brutalQuotes';
import { getFingerprint } from '../../services/saraMemory';
import { LayoutItem } from '../../components/Dashboard/DashboardLayoutSheet';
import { NextClassData } from '../../components/Dashboard/UnifiedLifeWidget';
import { calculateAppStreak } from '../../utils/streakUtils';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { getBootManifestSync, loadBootManifest, updateL1Cache } from '../../utils/bootManifest';
import { subscribeXPChanges } from '../../services/xpSystem';

import { queueWrite } from '../../services/offlineSync';
import { COLLECTION } from '../../config/constants';

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'quote', hidden: false },
  { id: 'stats', hidden: false },
  { id: 'xp', hidden: false },
  { id: 'capture', hidden: true },
  { id: 'agenda', hidden: false },
];

// ── AsyncStorage keys batched into a single multiGet ─────────────────────────
const DASH_STORAGE_KEYS = [
  '@zentrack_dashboard_layout',
  'zentrack_water_goal_ml',
  '@zentrack_dashboard_layout_v2_migrated',
  '@zentrack_water_target', // legacy key — checked only when canonical key is absent
] as const;

export function useDashboardData() {
  // ── Granular domain hooks (replaces useMobileData() monolith) ─────────────
  // Dashboard only re-renders when these specific slices change.
  const { user, tasks, habitLogs, allHabits } = useCoreData();
  const { attendance, attendanceLogs, assignments } = useAcademicData();
  const { gymLogs, userGymPlan, waterLogs } = useWellnessData();
  const { customEvents } = usePlannerData();

  // ── UI State (Seeded synchronously from L1 Cache for 0.00ms cold paint) ──────
  const initialManifest = getBootManifestSync();
  const [quote, setQuote] = useState(BRUTAL_QUOTES[0]);
  const [xp, setXp] = useState(initialManifest?.xp ?? 0);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [layout, setLayoutState] = useState<LayoutItem[]>(initialManifest?.dashboardLayout ?? DEFAULT_LAYOUT);
  const [layoutSheetVisible, setLayoutSheetVisible] = useState(false);
  const [waterLogVisible, setWaterLogVisible] = useState(false);
  const [waterTotal, setWaterTotalState] = useState(initialManifest?.waterGoalMl ?? 2500);
  const [nowDate, setNowDate] = useState(new Date());

  // PERF: Quote cache — only re-fetch once per day, not on every tab switch.
  // Stores {date: YYYY-MM-DD, quote: QuoteItem} so returning to Dashboard is instant.
  const quoteCacheRef = React.useRef<{ date: string; quote: typeof BRUTAL_QUOTES[0] } | null>(null);

  // PERF FIX (Issue A): Fingerprint cache — getFingerprint(uid) does AsyncStorage.getItem
  // on every Dashboard focus. Streak personality changes at most once per day.
  // Cache it per-UID for the entire app session (cleared when user changes).
  const fingerprintCacheRef = React.useRef<{ uid: string; fp: any } | null>(null);

  const setLayout = (newLayout: LayoutItem[]) => {
    setLayoutState(newLayout);
    updateL1Cache('dashboardLayout', newLayout);
    AsyncStorage.setItem('@zentrack_dashboard_layout', JSON.stringify(newLayout)).catch(() => {});
  };

  const setWaterTotal = (val: number) => {
    setWaterTotalState(val);
    updateL1Cache('waterGoalMl', val);
    AsyncStorage.setItem('zentrack_water_goal_ml', String(val)).catch(() => {});
    if (user?.uid) {
      queueWrite(COLLECTION.USER_PROFILES, 'update', {
        id: user.uid,
        waterGoalMl: val,
        waterTarget: val,
        updatedAt: Date.now(),
      }).catch(() => {});
    }
  };

  // ── Clock tick (1min) ─────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNowDate(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── AsyncStorage loads (deferred, single multiGet) ────────────────────────
  // PERF: Skip entirely if the boot manifest already seeded layout + water goal.
  // Only run on cold boot (no L1 cache) or first install. On a warm boot with cache,
  // initialManifest already has the correct values — reading AsyncStorage again
  // just causes spurious setState() calls with identical values → extra re-render.
  useEffect(() => {
    const manifestHasLayout = initialManifest?.dashboardLayout != null && initialManifest.dashboardLayout.length > 0;
    const manifestHasWater = initialManifest?.waterGoalMl != null;
    if (manifestHasLayout && manifestHasWater) {
      // Boot manifest already seeded both values — nothing to do
      return;
    }
    const handle = InteractionManager.runAfterInteractions(async () => {
      try {
        const pairs = await AsyncStorage.multiGet([...DASH_STORAGE_KEYS]);
        const kv: Record<string, string | null> = {};
        pairs.forEach(([k, v]) => { kv[k] = v; });

        const layoutStr = kv['@zentrack_dashboard_layout'];
        const migrated  = kv['@zentrack_dashboard_layout_v2_migrated'];
        const waterStr  = kv['zentrack_water_goal_ml'];
        const legacyWater = kv['@zentrack_water_target'];

        // ── Dashboard layout ─────────────────────────────────────────────────
        if (!manifestHasLayout) {
          if (!layoutStr) {
            setLayout(DEFAULT_LAYOUT);
          } else {
            try {
              const parsed = JSON.parse(layoutStr);
              if (Array.isArray(parsed)) {
                let loaded = parsed;
                if (typeof parsed[0] === 'string') {
                  loaded = parsed.map((id: string) => ({ id, hidden: id === 'capture' }));
                }
                const merged = DEFAULT_LAYOUT.map(def => {
                  const found = loaded.find((l: any) => l.id === def.id);
                  if (!migrated && def.id === 'capture') {
                    return { ...def, hidden: true };
                  }
                  return found ? found : def;
                });
                setLayout(merged);
                if (!migrated) {
                  // One-time migration — fire-and-forget, non-blocking
                  AsyncStorage.setItem('@zentrack_dashboard_layout_v2_migrated', 'true');
                  AsyncStorage.setItem('@zentrack_dashboard_layout', JSON.stringify(merged));
                }
              } else {
                setLayout(DEFAULT_LAYOUT);
              }
            } catch {
              setLayout(DEFAULT_LAYOUT);
            }
          }
        }

        // ── Water goal (canonical key, with one-time legacy migration) ────────
        if (!manifestHasWater) {
          if (waterStr) {
            setWaterTotal(parseInt(waterStr, 10));
          } else if (legacyWater) {
            const parsed = parseInt(legacyWater, 10);
            setWaterTotal(parsed);
            // Migrate to canonical key — fire-and-forget
            AsyncStorage.setItem('zentrack_water_goal_ml', legacyWater);
            AsyncStorage.removeItem('@zentrack_water_target');
          }
        }
      } catch {
        // Silently fall back to defaults — non-critical
        if (!manifestHasLayout) setLayout(DEFAULT_LAYOUT);
      }
    });
    return () => handle.cancel();
  }, []);

  const shuffleQuote = React.useCallback(async () => {
    // PERF FIX (P3): Cache quote by date. Quote only changes once per day.
    // Previously called on every tab focus → getFingerprint + getDailyQuote async
    // on every Dashboard visit. Now skipped if already fetched today.
    const todayKey = new Date().toISOString().slice(0, 10);
    if (quoteCacheRef.current?.date === todayKey) {
      setQuote(quoteCacheRef.current.quote);
      return;
    }
    try {
      let newQuote;
      if (user?.uid) {
        // PERF FIX (Issue A): Cache the fingerprint per-session.
        // getFingerprint() does AsyncStorage.getItem on every call — now cached.
        let fp: any;
        if (fingerprintCacheRef.current?.uid === user.uid) {
          fp = fingerprintCacheRef.current.fp;
        } else {
          fp = await getFingerprint(user.uid);
          fingerprintCacheRef.current = { uid: user.uid, fp };
        }
        newQuote = await getDailyQuote(fp.streakPersonality as QuotePersonality);
      } else {
        newQuote = await getDailyQuote();
      }
      quoteCacheRef.current = { date: todayKey, quote: newQuote };
      setQuote(newQuote);
    } catch {
      const fallback = await getDailyQuote();
      quoteCacheRef.current = { date: todayKey, quote: fallback };
      setQuote(fallback);
    }
  }, [user?.uid]);

  // ── Real-time XP sync across all screens ──────────────────────────────────
  useEffect(() => {
    const unsub = subscribeXPChanges(({ xp: newXp, added }) => {
      setXp(cur => {
        if (added > 0) setXpGain(added);
        return newXp;
      });
    });
    return unsub;
  }, []);

  // ── Quote load on focus ────────────────────────────────────────────────────
  // PERF FIX (P4): Removed redundant AsyncStorage.getItem('zentrack_xp_v1') on every
  // focus. XP is already seeded from L1 cache via `useState(initialManifest?.xp ?? 0)`
  // and kept live by `subscribeXPChanges` below. Reading AsyncStorage again on every
  // tab switch was a duplicate bridge call (2–5ms) that never changed the displayed value.
  useFocusEffect(
    React.useCallback(() => {
      shuffleQuote();
    }, [shuffleQuote])
  );

  // ── Time / greeting ────────────────────────────────────────────────────────
  const hour = nowDate.getHours();
  const todayStr = formatLocalDateStr(nowDate);

  let timeGreeting = 'evening.';
  if (hour >= 21 || hour < 5) timeGreeting = 'night.';
  else if (hour < 12) timeGreeting = 'morning.';
  else if (hour < 17) timeGreeting = 'afternoon.';

  // ── Unified Today's Scheduled Classes ──────────────────────────────────────
  const todayClasses = useMemo(() => {
    if (!attendance || attendance.length === 0) return [];
    const dayOfWeek = nowDate.getDay().toString();
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return attendance.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()]]
        || subj.schedule?.[DAY_NAMES[nowDate.getDay()].toLowerCase()];
      if (!sch) return [];
      const cls: any[] = [];
      if (sch.classes) sch.classes.forEach((c: any, idx: number) => c.time && cls.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Class`, time: c.time, type: 'class', subjectId: subj.id, subject: subj, sessionIdx: idx }));
      if (sch.labs)    sch.labs.forEach((l: any, idx: number) => l.time && cls.push({ id: `${subj.id}-lab-${l.time}`,   title: `${subj.name} Lab`,   time: l.time, type: 'lab', subjectId: subj.id, subject: subj, sessionIdx: idx }));
      return cls;
    });
  }, [attendance, nowDate]);

  // ── Next Class Logic ───────────────────────────────────────────────────────
  const nextClass = useMemo<NextClassData | null>(() => {
    if (todayClasses.length === 0) return null;

    const parseTimeToMins = (tStr: string): number => {
      if (!tStr) return 9999;
      const startStr = tStr.split(/[-–—•]| to /i)[0].trim().toLowerCase();
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
      const parts = tStr.split(/[-–—•]| to /i);
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
      if (tStr.search(/[-–—•]| to /i) !== -1) {
        return tStr.split(/[-–—•]| to /i).map(s => formatTimeStr(s.trim())).join(' - ');
      }
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

    // Pre-group today's relevant attendance logs by subjectId for fast O(1) indexed access
    const todayLogsBySubject = new Map<string, any[]>();
    for (const l of attendanceLogs || []) {
      if (l.date === todayStr && !l.isExtra) {
        const arr = todayLogsBySubject.get(l.subjectId) || [];
        arr.push(l);
        todayLogsBySubject.set(l.subjectId, arr);
      }
    }

    // Filter out cancelled classes
    const validClasses = todayClasses.filter(c => {
      const subLogs = (todayLogsBySubject.get(c.subjectId) || [])
        .filter(l => (c.type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

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
  }, [todayClasses, nowDate, attendanceLogs, todayStr]);

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

    const attendedCount = (attendanceLogs || []).filter(l => 
      l.date === todayStr && (l.action === 'attended' || (l.action as any) === 'present')
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
  }, [attendance, attendanceLogs, todayClasses, todayStr]);

  return {
    // Data
    user, tasks, gymLogs, userGymPlan, habitLogs, allHabits,
    attendance, attendanceLogs, assignments, waterLogs, customEvents,
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
    shuffleQuote,
    setXpGain, setCaptureVisible, setLayout, setLayoutSheetVisible,
    setWaterLogVisible, setWaterTotal,
  };
}

