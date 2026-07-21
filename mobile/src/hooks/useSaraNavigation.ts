/**
 * useSaraNavigation.ts
 *
 * Intercepts navigation commands from Sara's agent responses.
 * When the GAINS/CHRONOS/ATLAS agent returns a navigate token,
 * this hook triggers navigation to the correct screen.
 *
 * Supported patterns:
 *   [NAVIGATE:Gym]        → main Gym stack
 *   [NAVIGATE:Tasks]      → Tasks screen
 *   [NAVIGATE:Habits]     → Habits screen
 *   [NAVIGATE:Calendar]   → Calendar screen
 *   [NAVIGATE:Goals]      → Goals screen
 *   [NAVIGATE:Notes]      → Notes screen
 *   [NAVIGATE:GymProgress]→ GymProgress screen (inside Gym stack)
 *   [NAVIGATE:GymHistory] → GymHistory screen (inside Gym stack)
 */

import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

// Maps route tokens to real screen names in the AppNavigator
const ROUTE_MAP: Record<string, { stack: string; screen?: string; nested?: string }> = {
  gym:          { stack: 'Gym' },
  gymhome:      { stack: 'Gym' },
  gymtracker:   { stack: 'Gym' },
  gymprogress:  { stack: 'Gym', screen: 'GymProgress' },
  gymhistory:   { stack: 'Gym', screen: 'GymHistory' },
  tasks:        { stack: 'Tasks' },
  habits:       { stack: 'Habits' },
  calendar:     { stack: 'Calendar' },
  goals:        { stack: 'Goals' },
  notes:        { stack: 'Notes' },
  analytics:    { stack: 'Analytics' },
  attendance:   { stack: 'Attendance' },
  focus:        { stack: 'MoreStack', screen: 'Focus' },
  settings:     { stack: 'MoreStack', screen: 'Settings' },
};

/**
 * Extracts a [NAVIGATE:X] token from an agent response string.
 */
export function extractNavigateToken(text: string): string | null {
  const match = text.match(/\[NAVIGATE:([A-Za-z]+)\]/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Hook: call `navigateTo(screenKey)` with a route token like "gym" or "tasks".
 * Also processes raw answer text for embedded [NAVIGATE:X] tokens.
 */
export function useSaraNavigation() {
  const navigation = useNavigation<any>();

  const navigateTo = useCallback(
    (routeToken: string) => {
      const key = routeToken.toLowerCase().replace(/\s+/g, '');
      const route = ROUTE_MAP[key];

      if (!route) {
        console.warn('[Sara] Unknown route token:', routeToken);
        return false;
      }

      try {
        if (!route.screen) {
          navigation.navigate(route.stack);
        } else {
          navigation.navigate(route.stack, {
            screen: route.screen,
            ...(route.nested ? { params: { screen: route.nested } } : {}),
          });
        }
        return true;
      } catch (e) {
        console.warn('[Sara] Navigation error:', e);
        return false;
      }
    },
    [navigation]
  );

  /**
   * Processes an agent answer string:
   * — Extracts [NAVIGATE:X] tokens and calls navigateTo()
   * — Returns the answer text with navigate tokens stripped (clean for display/TTS)
   */
  const processAnswerForNavigation = useCallback(
    (answer: string): { cleanText: string; navigated: boolean } => {
      const token = extractNavigateToken(answer);
      let navigated = false;

      if (token) {
        navigated = navigateTo(token);
      }

      const cleanText = answer.replace(/\[NAVIGATE:[A-Za-z]+\]/gi, '').trim();
      return { cleanText, navigated };
    },
    [navigateTo]
  );

  return { navigateTo, processAnswerForNavigation };
}
