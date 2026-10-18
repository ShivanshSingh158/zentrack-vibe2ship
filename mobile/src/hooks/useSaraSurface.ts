/**
 * useSaraSurface.ts — ZenTrack Mobile SARA Engine v2
 *
 * Capability 5 — Instant Zero-Timer Local Surface Hook
 *
 * Computes deterministic, contextually-aware insights instantly from local memory.
 * - 0ms execution (Frame 0 synchronous evaluation)
 * - 0 timers (Zero setTimeout / background interval collisions)
 * - 0 network calls (Zero Gemini API latency or socket blocking)
 */

import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppContext } from '../agent/intentClassifier';
import { STORAGE_KEYS } from '../config/constants';
import { formatLocalDateStr } from '../utils/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfaceResult {
  surfaceMessage: string | null;
  surfaceActionLabel: string | null;
  dismissBanner: () => void;
  isLoading: boolean;
}

// ─── Pure Local Rule Evaluator (0ms, Zero Network) ───────────────────────────

function evaluateLocalSurfaceInsight(
  screenName: string,
  ctx: AppContext
): { message: string; action: string | null } | null {
  const today = formatLocalDateStr(new Date());

  switch (screenName) {
    case 'AttendanceScreen': {
      // AttendanceScreen already features its own dismissible in-page Low Attendance card,
      // avoiding duplicate and intrusive upper status-bar HUD banners.
      return null;
    }

    case 'Home':
    case 'DashboardScreen': {
      const overdue = (ctx.tasks || []).filter(t => t.status !== 'completed' && t.date && t.date < today);
      if (overdue.length > 0) {
        return {
          message: `📋 ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Reschedule now?`,
          action: 'See Tasks',
        };
      }
      return null;
    }

    case 'Tasks': {
      const overdue = (ctx.tasks || []).filter(t => t.status !== 'completed' && t.date && t.date < today);
      if (overdue.length > 0) {
        return {
          message: `📋 ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Reschedule now?`,
          action: 'Reschedule',
        };
      }
      return null;
    }

    case 'Assignments': {
      if (!ctx.assignments?.length) return null;
      const urgent = ctx.assignments.filter(
        a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate && a.dueDate <= today
      );
      if (urgent.length > 0) {
        return {
          message: `⚠️ "${urgent[0].title || 'Assignment'}" is due today!`,
          action: 'View',
        };
      }
      return null;
    }

    case 'Goals': {
      if (!ctx.goals?.length) return null;
      const stalled = ctx.goals.filter(
        g =>
          (g.status === 'active' || g.status === 'in_progress') &&
          g.updatedAt &&
          (g.progress || 0) < 100 &&
          (Date.now() - g.updatedAt) > 14 * 86400000
      );
      if (stalled.length > 0) {
        return {
          message: `"${stalled[0].title}" hasn't moved in 2 weeks. Should we break it down?`,
          action: 'Open Goal',
        };
      }
      return null;
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
  const isDismissedRef = useRef<boolean>(false);

  const dismissBanner = useCallback(() => {
    setSurfaceMessage(null);
    setSurfaceActionLabel(null);
    isDismissedRef.current = true;

    if (userId) {
      AsyncStorage.getItem(STORAGE_KEYS.SARA_SURFACE_DISMISSED).then(raw => {
        const dismissed: string[] = raw ? JSON.parse(raw) : [];
        if (!dismissed.includes(screenName)) {
          AsyncStorage.setItem(
            STORAGE_KEYS.SARA_SURFACE_DISMISSED,
            JSON.stringify([...dismissed, screenName])
          ).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [screenName, userId]);

  useFocusEffect(
    useCallback(() => {
      if (isDismissedRef.current) return;

      // ⚡ Frame 0 Instant Local Evaluation (0ms, 0 Network Calls, 0 Timers)
      const insight = evaluateLocalSurfaceInsight(screenName, appContext);
      if (insight) {
        setSurfaceMessage(insight.message);
        setSurfaceActionLabel(insight.action);
      } else {
        setSurfaceMessage(null);
        setSurfaceActionLabel(null);
      }
    }, [screenName, appContext])
  );

  return { surfaceMessage, surfaceActionLabel, dismissBanner, isLoading: false };
}
