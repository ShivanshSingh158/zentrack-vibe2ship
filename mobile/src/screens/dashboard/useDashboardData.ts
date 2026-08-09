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

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'quote', hidden: false },
  { id: 'stats', hidden: false },
  { id: 'xp', hidden: false },
  { id: 'agenda', hidden: false },
];

export function useDashboardData() {
  const {
    user, tasks, gymLogs, userGymPlan, habitLogs, allHabits,
    attendance, attendanceLogs, assignments, waterLogs, sleepLogs, customEvents,
  } = useMobileData();

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [quote, setQuote] = useState(BRUTAL_QUOTES[0]);
  const [xp, setXp] = useState(0);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [layoutSheetVisible, setLayoutSheetVisible] = useState(false);
  const [waterLogVisible, setWaterLogVisible] = useState(false);
  const [sleepLogVisible, setSleepLogVisible] = useState(false);
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
          if (Array.isArray(parsed) && parsed.length === 4) {
            if (typeof parsed[0] === 'string') {
              setLayout(parsed.map((id: string) => ({ id, hidden: false })));
            } else if (parsed[0] && typeof parsed[0].id === 'string') {
              setLayout(parsed);
            } else { setLayout(DEFAULT_LAYOUT); }
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
            setQuote(getDailyQuote(fp.streakPersonality as QuotePersonality));
          } else {
            setQuote(getDailyQuote());
          }
        } catch { setQuote(getDailyQuote()); }
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

  return {
    // Data
    user, tasks, gymLogs, userGymPlan, habitLogs, allHabits,
    attendance, attendanceLogs, assignments, waterLogs, sleepLogs,
    // Derived
    todayStr, timeGreeting, avatarLetter, hour,
    nowDate, // expose raw Date for .getDay()/.getMinutes() in stats useMemo
    // State
    quote, xp, xpGain, captureVisible, layout, layoutSheetVisible,
    waterLogVisible, sleepLogVisible, waterTotal,
    // Sara surface
    surfaceMessage, surfaceActionLabel, dismissBanner,
    // Setters
    setXpGain, setCaptureVisible, setLayout, setLayoutSheetVisible,
    setWaterLogVisible, setSleepLogVisible, setWaterTotal,
  };
}
