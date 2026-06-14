import { useEffect, useRef } from 'react';
import { sendSystemNotification } from '../utils/notifications';
import { auth } from '../services/firebase';

/**
 * useClassNotifications — polls every 60s to check if any class starts
 * within the next 10 minutes. Fires both a local Web Notification and an
 * FCM push so the alert works even if the device screen is locked.
 *
 * The hook is intentionally lightweight:
 *  - No Firestore reads (subjects come from GlobalDataContext, already loaded)
 *  - A ref tracks already-notified class slots per session to prevent duplicates
 *
 * Data model expected on each subject:
 *   subject.schedule[dayIndex] = {
 *     classCount: number,
 *     labCount: number,
 *     startTimes: string[],  // e.g. ["09:00", "11:00"]  — may be missing for old data
 *   }
 */
export const useClassNotifications = (subjects: any[]) => {
  // Tracks which class slots were already notified this session: "subjectId_day_slotIdx"
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!subjects || subjects.length === 0) return;

    const check = () => {
      const user = auth.currentUser;
      if (!user) return;

      const now = new Date();
      const dayIdx = now.getDay().toString();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      subjects.forEach(subject => {
        if (!subject.id || !subject.schedule) return;
        const slot = subject.schedule[dayIdx];
        if (!slot || !Array.isArray(slot.startTimes)) return;

        slot.startTimes.forEach((startTime: string, idx: number) => {
          if (!startTime) return;
          const [hStr, mStr] = startTime.split(':');
          const classMinutes = parseInt(hStr) * 60 + parseInt(mStr);
          const diff = classMinutes - nowMinutes;

          // Fire notification when class is 10–11 min away (1-min window to avoid re-trigger)
          if (diff >= 10 && diff < 11) {
            const slotKey = `${subject.id}_${dayIdx}_${idx}`;
            if (notifiedRef.current.has(slotKey)) return;
            notifiedRef.current.add(slotKey);

            const title = `📚 Class in 10 min: ${subject.name}`;
            const body = `${subject.name} starts at ${startTime}. Get ready!`;

            // Web Notification (shows when tab is open/background)
            sendSystemNotification(title, { body }, false);
          }
        });
      });
    };

    // Run immediately on mount, then every 60 seconds
    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [subjects]);
};
