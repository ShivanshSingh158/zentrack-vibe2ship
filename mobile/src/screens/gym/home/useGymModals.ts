/**
 * useGymModals.ts — ZenTrack Gym Module
 *
 * All 9 modal boolean states and their open/close handlers,
 * extracted from GymHomeScreen.tsx.
 * Also contains the gym notification scheduler callback.
 */
import { useState, useCallback } from 'react';
import { GymCardioLog } from '../../../types/gym.types';
import { clearScheduleCache, scheduleAllNotifications } from '../../../services/notifications';

interface NotifDeps {
  tasks: any[];
  customEvents: any[];
  gymLogs: any[];
  attendance: any[];
  habitLogs: any[];
  allHabits: any[];
  assignments: any[];
  waterLogs: any[];
  sleepLogs: any[];
}

export function useGymModals(notifDeps: NotifDeps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showScheduleSettingsModal, setShowScheduleSettingsModal] = useState(false);
  const [showSwapRoutineModal, setShowSwapRoutineModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [logCardioFor, setLogCardioFor] = useState<GymCardioLog | null>(null);
  const [showBodyMetrics, setShowBodyMetrics] = useState(false);
  const [showPRHallOfFame, setShowPRHallOfFame] = useState(false);

  // Gym notification reschedule — called after user saves gym reminder time
  const handleGymNotifSaved = useCallback(() => {
    clearScheduleCache();
    scheduleAllNotifications(notifDeps).catch(console.warn);
  }, [notifDeps]);

  return {
    showAddModal, setShowAddModal,
    showCardioModal, setShowCardioModal,
    showAiModal, setShowAiModal,
    showScheduleSettingsModal, setShowScheduleSettingsModal,
    showSwapRoutineModal,      setShowSwapRoutineModal,
    showTemplateModal,         setShowTemplateModal,
    showProfileModal,          setShowProfileModal,
    historyFor,                setHistoryFor,
    logCardioFor, setLogCardioFor,
    showBodyMetrics, setShowBodyMetrics,
    showPRHallOfFame, setShowPRHallOfFame,
    handleGymNotifSaved,
  };
}
