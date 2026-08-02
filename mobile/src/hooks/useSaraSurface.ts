/**
 * useSaraSurface.ts — ZenTrack Mobile SARA Engine v2
 *
 * Capability 5 — Predictive Surface Injection (PSI) Hook
 *
 * Computes a contextual AI surface message for the current screen.
 * Fires ONLY when:
 *   1. The user navigates to a new screen (useFocusEffect)
 *   2. At least 60 seconds have passed since the last injection on this screen
 *   3. The user hasn't already dismissed the banner for this screen in this session
 *
 * The Gemini call is batched and cached — it does NOT fire on every render.
 * All cooldown logic uses refs + AsyncStorage, so it survives re-renders.
 *
 * Usage:
 *   const { surfaceMessage, surfaceAction, dismissBanner } = useSaraSurface('AttendanceScreen', appCtx);
 *   // Render <SaraHUDBanner message={surfaceMessage} visible={!!surfaceMessage} onDismiss={dismissBanner} />
 */

import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppContext } from '../agent/intentClassifier';
import { callGeminiProxy } from '../services/geminiProxy';
import { getFingerprint } from '../services/saraMemory';
import { STORAGE_KEYS } from '../config/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfaceResult {
  surfaceMessage: string | null;
  surfaceActionLabel: string | null;
  dismissBanner: () => void;
  isLoading: boolean;
}

// Minimum interval between PSI injections per screen (60 seconds)
const PSI_COOLDOWN_MS = 60_000;

// ─── Screen-specific context builders ─────────────────────────────────────────
// These are compact prompts — NOT the full buildSystemPrompt() dump.

function buildScreenContext(screen: string, ctx: AppContext): string | null {
  const today = new Date().toISOString().slice(0, 10);

  switch (screen) {
    case 'AttendanceScreen': {
      if (!ctx.attendance?.length) return null;
      const atRisk = ctx.attendance.filter(
        s => s.classesTotal > 0 && (s.classesAttended / s.classesTotal) < 0.75
      ).map(s => ({
        name: s.name,
        pct: Math.round((s.classesAttended / s.classesTotal) * 100),
        attended: s.classesAttended,
        total: s.classesTotal,
      }));
      if (atRisk.length === 0) return null;
      return `User opened Attendance screen. At-risk subjects (< 75%): ${JSON.stringify(atRisk)}`;
    }

    case 'Home':
    case 'DashboardScreen': {
      const pendingTasks = (ctx.tasks || []).filter(t => t.status !== 'completed' && t.date === today);
      const todayHabitsTotal = (ctx.habits || []).filter(h => !h.archived).length;
      const todayHabitsDone = (ctx.habitLogs || []).filter(l => l.date === today).length;
      if (pendingTasks.length === 0 && todayHabitsDone >= todayHabitsTotal) return null;
      return `User opened Dashboard. Today: ${pendingTasks.length} pending tasks, ${todayHabitsDone}/${todayHabitsTotal} habits done.`;
    }

    case 'GymHome':
    case 'Gym': {
      if (!ctx.gymLogs) return null;
      const recentLogs = ctx.gymLogs.filter(g => {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return g.date >= threeDaysAgo;
      });
      if (recentLogs.length > 0) return null; // Recently active — no nudge needed
      const daysSinceLast = ctx.gymLogs.length > 0
        ? Math.round((Date.now() - new Date(ctx.gymLogs[ctx.gymLogs.length - 1].date).getTime()) / 86400000)
        : 7;
      return `User opened Gym screen. Last workout was ${daysSinceLast} days ago.`;
    }

    case 'Tasks': {
      const overdue = (ctx.tasks || []).filter(
        t => t.status !== 'completed' && t.date < today
      );
      if (overdue.length === 0) return null;
      return `User opened Tasks screen. ${overdue.length} overdue task(s).`;
    }

    case 'Goals': {
      const stalled = (ctx.goals || []).filter(
        g => g.status === 'active' && g.progress < 10
      );
      if (stalled.length === 0) return null;
      return `User opened Goals. ${stalled.length} active goal(s) with < 10% progress.`;
    }

    case 'AssignmentsScreen':
    case 'Assignments': {
      if (!ctx.assignments?.length) return null;
      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const urgent = ctx.assignments.filter(a => {
        if (a.status === 'submitted' || a.status === 'graded') return false;
        if (!a.dueDate) return false;
        const due = new Date(a.dueDate + 'T23:59:00');
        return due >= now && due <= in48h;
      });
      if (urgent.length === 0) return null;
      const top = urgent[0];
      const hoursLeft = Math.round((new Date(top.dueDate + 'T23:59:00').getTime() - now.getTime()) / 3600000);
      return `User opened Assignments. "${top.title}" (${top.subjectName ?? 'unknown subject'}) is due in ${hoursLeft}h.`;
    }

    default:
      return null;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSaraSurface(
  screenName: string,
  appContext: AppContext,
  userId?: string
): SurfaceResult {
  const [surfaceMessage, setSurfaceMessage] = useState<string | null>(null);
  const [surfaceActionLabel, setSurfaceActionLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastInjectionRef = useRef<number>(0);
  const isDismissedRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const dismissBanner = useCallback(() => {
    setSurfaceMessage(null);
    setSurfaceActionLabel(null);
    isDismissedRef.current = true;

    // Persist dismiss per screen for this session
    if (userId) {
      AsyncStorage.getItem(STORAGE_KEYS.SARA_SURFACE_DISMISSED).then(raw => {
        const dismissed: string[] = raw ? JSON.parse(raw) : [];
        if (!dismissed.includes(screenName)) {
          AsyncStorage.setItem(
            STORAGE_KEYS.SARA_SURFACE_DISMISSED,
            JSON.stringify([...dismissed, screenName])
          );
        }
      }).catch(() => {});
    }
  }, [screenName, userId]);

  useFocusEffect(
    useCallback(() => {
      // Gate 1: Already dismissed by user in this session
      if (isDismissedRef.current) return;

      // Gate 2: Cooldown — must be 60s since last injection on this screen
      const now = Date.now();
      if (now - lastInjectionRef.current < PSI_COOLDOWN_MS) return;

      // Gate 3: Another fetch already in progress
      if (isFetchingRef.current) return;

      // Gate 4: Detect stalled goals (F4 override)
      if (screenName === 'Goals' && appContext.goals) {
        const stalledGoals = appContext.goals.filter(g => 
          g.status === 'active' && 
          g.updatedAt && 
          (g.progress || 0) < 100 &&
          (Date.now() - g.updatedAt) > 14 * 24 * 60 * 60 * 1000
        );
        if (stalledGoals.length > 0) {
          setSurfaceMessage(`"${stalledGoals[0].title}" hasn't moved in 2 weeks. Should we break it down?`);
          setSurfaceActionLabel('Open Goal');
          setIsLoading(false);
          return; // Short-circuit Gemini
        }
      }

      // Gate 4b: Assignments — urgent deadline within 48h (short-circuit, no Gemini call)
      if ((screenName === 'AssignmentsScreen' || screenName === 'Assignments') && appContext.assignments?.length) {
        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const urgent = (appContext.assignments as any[]).filter(a => {
          if (a.status === 'submitted' || a.status === 'graded') return false;
          if (!a.dueDate) return false;
          const due = new Date(a.dueDate + 'T23:59:00');
          return due >= now && due <= in48h;
        });
        if (urgent.length > 0) {
          const top = urgent[0];
          const hoursLeft = Math.round((new Date(top.dueDate + 'T23:59:00').getTime() - now.getTime()) / 3600000);
          const label = top.subjectName ? `${top.subjectName}` : '';
          const msg = hoursLeft <= 12
            ? `🚨 Due in ${hoursLeft}h: "${top.title}"${label ? ` — ${label}` : ''}. Submit now!`
            : `⏰ "${top.title}" is due in ${hoursLeft}h${label ? ` (${label})` : ''}. Don't miss it.`;
          setSurfaceMessage(msg);
          setSurfaceActionLabel('View Assignment');
          setIsLoading(false);
          lastInjectionRef.current = Date.now();
          return; // Short-circuit Gemini
        }
      }

      // Gate 5: Screen must have meaningful context to analyze
      const screenContext = buildScreenContext(screenName, appContext);
      if (!screenContext) return;

      // All gates passed — trigger PSI
      const triggerPSI = async () => {
        isFetchingRef.current = true;
        setIsLoading(true);

        try {
          // Check persistent dismiss state
          const dismissedRaw = await AsyncStorage.getItem(STORAGE_KEYS.SARA_SURFACE_DISMISSED);
          const dismissedScreens: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
          if (dismissedScreens.includes(screenName)) {
            isDismissedRef.current = true;
            return;
          }

          // Get fingerprint for tone adaptation
          const fingerprint = userId ? await getFingerprint(userId).catch(() => null) : null;
          const toneHint = fingerprint?.dominantStressPattern === 'deadline-driven'
            ? 'Be direct and brief.'
            : 'Be warm and helpful.';

          const prompt = `You are SARA, ZenTrack's AI assistant. A user just opened the ${screenName} screen.

Context: ${screenContext}

Generate a single, SHORT, contextually-aware insight or nudge (max 12 words) for the user.
${toneHint}
If there's an obvious 1-tap action, also output: ACTION:<short label> (max 3 words)

Examples:
"⚠️ DSA at 68% — need 4 more classes to avoid detain." ACTION:View Details
"📋 3 overdue tasks. Reschedule now?" ACTION:See Tasks
"You skipped 3 gym sessions. Want to adjust this week's plan?" ACTION:Adjust Plan

Output ONLY the message, and optionally ACTION: on a new line. Nothing else.`;

          const response = await callGeminiProxy(
            [{ role: 'user', parts: [{ text: prompt }] }],
            { model: 'gemini-2.0-flash-lite', temperature: 0.4, maxOutputTokens: 80 }
          );

          if (!response || response.length < 10) return;

          // Parse message + optional action
          const lines = response.trim().split('\n');
          const message = lines[0].trim();
          const actionLine = lines.find(l => l.startsWith('ACTION:'));
          const action = actionLine ? actionLine.replace('ACTION:', '').trim() : null;

          if (message) {
            setSurfaceMessage(message);
            setSurfaceActionLabel(action);
            lastInjectionRef.current = Date.now();

            // Persist last injection time
            const times: Record<string, number> = {};
            const timesRaw = await AsyncStorage.getItem(STORAGE_KEYS.SARA_SURFACE_LAST).catch(() => null);
            if (timesRaw) Object.assign(times, JSON.parse(timesRaw));
            times[screenName] = Date.now();
            AsyncStorage.setItem(STORAGE_KEYS.SARA_SURFACE_LAST, JSON.stringify(times)).catch(() => {});
          }
        } catch (e) {
          // Silent fail — PSI is best-effort
          console.warn('[PSI] Surface injection failed (non-critical):', e);
        } finally {
          setIsLoading(false);
          isFetchingRef.current = false;
        }
      };

      // Restore last injection time from storage
      AsyncStorage.getItem(STORAGE_KEYS.SARA_SURFACE_LAST).then(raw => {
        if (raw) {
          const times: Record<string, number> = JSON.parse(raw);
          if (times[screenName]) lastInjectionRef.current = times[screenName];
        }

        // Re-check cooldown after restoring
        if (Date.now() - lastInjectionRef.current >= PSI_COOLDOWN_MS) {
          triggerPSI();
        }
      }).catch(() => {
        // If storage read fails, just trigger normally
        triggerPSI();
      });
    }, [screenName, appContext, userId])
  );

  return { surfaceMessage, surfaceActionLabel, dismissBanner, isLoading };
}
