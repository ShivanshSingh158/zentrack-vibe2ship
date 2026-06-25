import { useEffect, useState } from 'react';
import { useGlobalData } from '../contexts/GlobalDataContext';

export type UrgencyLevel = 'normal' | 'upcoming' | 'urgent' | 'critical' | 'overdue';

export const getUrgencyLevel = (dateStr: string): UrgencyLevel => {
  if (!dateStr) return 'normal';
  const deadlineMs = new Date(dateStr).getTime() + 23.5 * 3600 * 1000;
  const hoursLeft = (deadlineMs - Date.now()) / 3600000;
  if (hoursLeft < 0) return 'overdue';
  if (hoursLeft < 6) return 'critical';
  if (hoursLeft < 24) return 'urgent';
  if (hoursLeft < 72) return 'upcoming';
  return 'normal';
};

export const getCountdownText = (dateStr: string): string => {
  const deadlineMs = new Date(dateStr).getTime() + 23.5 * 3600 * 1000;
  const diff = deadlineMs - Date.now();
  if (diff < 0) return 'Overdue';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  return `${h}h ${m}m`;
};

// Forces component re-render every 60s for live countdown updates
export const useLiveTick = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
};

export const useDeadlineWatcher = () => {
  const { tasks, userPreferences } = useGlobalData();

  useEffect(() => {
    // Demo-friendly: Check every 10 seconds instead of 15 minutes
    const interval = setInterval(() => {
      if (!tasks || tasks.length === 0) return;
      
      const now = new Date();
      const currentHour = now.getHours();
      let hasCriticalTasks = false;
      let criticalTaskTitle = '';

      tasks.forEach((task) => {
        if (task.status === 'completed' || !task.date) return;
        
        // Basic 24h fallback if no exact time is set
        const deadline = new Date(task.date).getTime() + (23 * 60 + 59) * 60000;
        const timeRemaining = deadline - now.getTime();
        const hoursRemaining = timeRemaining / (1000 * 60 * 60);

        if (hoursRemaining > 0 && hoursRemaining <= 3) {
          hasCriticalTasks = true;
          criticalTaskTitle = task.text;
        }
      });

      // 1. Crisis Triage Intervention
      if (hasCriticalTasks) {
        // Prevent spamming if already shown
        const lastTriage = localStorage.getItem('lastCrisisTriage');
        if (!lastTriage || Date.now() - parseInt(lastTriage) > 60000 * 60) { // Only show once per hour max
          console.log('[Guardian] Detected critical tasks within 3h threshold. Activating Autonomous Protocol.');
          window.dispatchEvent(new CustomEvent('guardian-autonomous-corrector', { detail: { title: criticalTaskTitle } }));
          localStorage.setItem('lastCrisisTriage', Date.now().toString());
        }
      }

      // 2. Proactive Gym Accountability
      if (currentHour >= 20 && userPreferences?.isGymDay && !userPreferences?.gymLogged) {
        const lastGymAlert = localStorage.getItem('lastGymAlertDate');
        const todayStr = now.toISOString().split('T')[0];
        if (lastGymAlert !== todayStr) {
          console.log('[Guardian] Detected missed gym session.');
          window.dispatchEvent(new CustomEvent('guardian-gym-alert'));
          localStorage.setItem('lastGymAlertDate', todayStr);
        }
      }

      // 3. Proactive 9 PM Accountability
      if (currentHour >= 21) {
        const lastAccountability = localStorage.getItem('lastAccountabilityDate');
        const todayStr = now.toISOString().split('T')[0];
        if (lastAccountability !== todayStr) {
          console.log('[Guardian] 9 PM Accountability Check.');
          window.dispatchEvent(new CustomEvent('simulate-accountability')); // Reuse the exact simulation event
          localStorage.setItem('lastAccountabilityDate', todayStr);
        }
      }

    }, 10000); // 10 seconds for demo

    return () => clearInterval(interval);
  }, [tasks, userPreferences]);
};
