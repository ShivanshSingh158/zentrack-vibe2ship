/**
 * useQuickActions.ts — ZenTrack Android & iOS App Icon Quick Actions Engine
 * Enables instant launcher shortcuts: New Task, Log Attendance, Quick Workout, Upload to Vault.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';
import { navigationRef } from '../navigation/AppNavigator';

export const QUICK_ACTIONS_CONFIG: QuickActions.Action[] = [
  {
    id: 'quick_add_task',
    title: 'New Task',
    subtitle: 'Instant task capture',
    icon: Platform.OS === 'ios' ? 'symbol:checkmark.circle' : 'shortcut_task',
    params: { screen: 'Tasks', openAddTask: true },
  },
  {
    id: 'quick_log_attendance',
    title: 'Log Attendance',
    subtitle: 'Timetable & radar',
    icon: Platform.OS === 'ios' ? 'symbol:person.text.rectangle' : 'shortcut_attendance',
    params: { screen: 'Attendance' },
  },
  {
    id: 'quick_workout',
    title: 'Quick Workout',
    subtitle: "Today's gym split",
    icon: Platform.OS === 'ios' ? 'symbol:figure.strengthtraining.traditional' : 'shortcut_gym',
    params: { screen: 'Gym' },
  },
  {
    id: 'quick_upload_notes',
    title: 'Upload to Vault',
    subtitle: 'Cloud notes & files',
    icon: Platform.OS === 'ios' ? 'symbol:folder' : 'shortcut_notes',
    params: { screen: 'Notes', openUpload: true },
  },
];

export function handleQuickActionNavigation(action: QuickActions.Action) {
  if (!action || !action.params) return;

  const screen = action.params.screen as string;
  if (!screen) return;

  if (!navigationRef.isReady()) {
    // Retry shortly after navigator mounts
    setTimeout(() => handleQuickActionNavigation(action), 150);
    return;
  }

  if (screen === 'Tasks') {
    navigationRef.navigate('MainTabs', {
      screen: 'Tasks',
      params: { openAddTask: true, timestamp: Date.now() },
    });
  } else if (screen === 'Attendance') {
    navigationRef.navigate('Attendance');
  } else if (screen === 'Gym') {
    navigationRef.navigate('Gym');
  } else if (screen === 'Notes') {
    navigationRef.navigate('Notes', {
      openUpload: true,
      timestamp: Date.now(),
    });
  }
}

export function useQuickActions() {
  useEffect(() => {
    // 1. Register the 4 Quick Action items on device launcher
    QuickActions.setItems(QUICK_ACTIONS_CONFIG).catch(() => {});

    // 2. Check if app was cold-booted via a launcher shortcut
    if (QuickActions.initial) {
      handleQuickActionNavigation(QuickActions.initial);
    }

    // 3. Listen for runtime shortcut taps
    const subscription = QuickActions.addListener((action) => {
      handleQuickActionNavigation(action);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
