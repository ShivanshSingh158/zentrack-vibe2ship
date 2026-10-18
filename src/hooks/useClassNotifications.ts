import { useEffect, useRef } from 'react';
import { sendSystemNotification } from '../utils/notifications';
import { auth } from '../services/firebase';

/**
 * useClassNotifications — polls every 60s to check if any class starts
 * within the next 10 minutes. Fires a local Web Notification alert.
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
      const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      subjects.forEach(subject => {
        if (!subject.id || !subject.schedule) return;
        const slot = subject.schedule[dayIdx];
        if (!slot) return;

        // Collect all sessions: modern slot.classes/slot.labs or legacy slot.startTimes
        const sessions: Array<{ time: string; type: 'Class' | 'Lab'; idx: number }> = [];

        if (Array.isArray(slot.classes)) {
          slot.classes.forEach((c: any, idx: number) => {
            const t = typeof c === 'string' ? c : c?.time;
            if (t) sessions.push({ time: t, type: 'Class', idx });
          });
        }
        if (Array.isArray(slot.labs)) {
          slot.labs.forEach((l: any, idx: number) => {
            const t = typeof l === 'string' ? l : l?.time;
            if (t) sessions.push({ time: t, type: 'Lab', idx: 100 + idx });
          });
        }
        if (sessions.length === 0 && Array.isArray(slot.startTimes)) {
          slot.startTimes.forEach((t: string, idx: number) => {
            if (t) sessions.push({ time: t, type: 'Class', idx });
          });
        }

        sessions.forEach(({ time: startTime, type, idx }) => {
          if (!startTime) return;
          const [hStr, mStr] = startTime.split(':');
          const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr || '0', 10);
          if (isNaN(classMinutes)) return;
          const diff = classMinutes - nowMinutes;

          // Fire notification when class is 10–12 min away (safe 2-min window with slotKey deduplication)
          if (diff >= 10 && diff <= 12) {
            const slotKey = `${subject.id}_${todayStr}_${type}_${idx}`;
            if (notifiedRef.current.has(slotKey)) return;
            notifiedRef.current.add(slotKey);

            const title = `📚 ${type} in 10 min: ${subject.name}`;
            const body = `${subject.name} ${type.toLowerCase()} starts at ${startTime}. Get ready!`;

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
