/**
 * @file analytics.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../../services/googleCalendar';
import { sendPushNotification } from '../../services/fcm';
import { getLocalDateString } from '../../utils/dateUtils';
import { logApi, logWebSocket } from '../../utils/networkLogger';
import { recordApprovalRejection, recordApprovalTimeout, recordApprovalGrant, recordEmailSent, recordGhostTaskCreated } from '../../services/agentMemoryPersistence';
import { userLearningStore } from '../../services/userLearningStore';
import {
  fetchUnreadEmails,
  fetchEmailThread,
  sendEmail,
  replyToEmail,
  archiveEmail,
  trashEmail,
  createGoogleDoc,
  writeToGoogleDoc,
  readGoogleDoc,
  searchGoogleDrive,
  trashDriveFile,
  listDriveFiles,
  openDriveFile,
  getFilePdfLink,
  createGoogleMeet,
  createDraftEmail,
  listCalendarEventsOnDate,
  updateCalendarEvent,
} from '../../services/googleWorkspace';
import { requireGoogleAuth, requestApproval } from './shared';
import type { ToolResult } from './shared';


export const executeAnalyticsTools = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult | null> => {
  const user = auth.currentUser;
  if (!user) return { success: false, data: null, message: "Not authenticated. User is not logged in." };
  const today = getLocalDateString(new Date());

  switch (toolName) {
case 'get_habit_stats': {
      const habits = (appContext.habits || []) as any[];
      const habitLogs = (appContext.habitLogs || []) as any[];
      const today30 = getLocalDateString(new Date());
      const thirtyDaysAgo30 = getLocalDateString(new Date(Date.now() - 30 * 86400_000));

      const stats = habits.map((h: any) => {
        const logs = habitLogs.filter((l: any) => l.habitId === h.id && l.date >= thirtyDaysAgo30);
        const completionRate = Math.round((logs.length / 30) * 100);

        // Compute current streak
        let streak = 0;
        const checkDate = new Date();
        while (streak < 365) {
          const dateStr = getLocalDateString(checkDate);
          const logged = habitLogs.some((l: any) => l.habitId === h.id && l.date === dateStr && l.completed);
          if (!logged) break;
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        }

        const completedToday = habitLogs.some((l: any) =>
          l.habitId === h.id && l.date === today30 && l.completed
        );

        return {
          id: h.id,
          name: h.name || h.title,
          frequency: h.frequency || 'daily',
          currentStreak: streak,
          longestStreak: h.longestStreak || streak,
          completionRate30d: completionRate,
          logsLast30Days: logs.length,
          completedToday,
          icon: h.icon || '✅',
        };
      });

      const avgRate = stats.length > 0
        ? Math.round(stats.reduce((s: number, h: any) => s + h.completionRate30d, 0) / stats.length)
        : 0;
      const topHabit = stats.sort((a: any, b: any) => b.currentStreak - a.currentStreak)[0];

      logApi('GET', '/api/v1/habits/stats', {}, 'success');
      return {
        success: true,
        data: { habits: stats, avgCompletionRate30d: avgRate, topHabit: topHabit?.name || 'N/A', totalHabits: habits.length },
        message: `📊 Habit stats: ${habits.length} habits tracked. Avg 30-day completion: ${avgRate}%. Top streak: ${topHabit?.name || 'N/A'} (${topHabit?.currentStreak || 0} days).`
      };
    }

case 'generate_weekly_review': {
      // Fixes blindspot: /review module was entirely manual. Zero agent integration.
      // This tool synthesizes all available data into a structured weekly review.
      const now = new Date();
      const weekStart = args.weekStartDate
        ? new Date(args.weekStartDate)
        : (() => {
            const d = new Date(now);
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // last Monday
            return d;
          })();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekStartStr = getLocalDateString(weekStart);
      const weekEndStr = getLocalDateString(weekEnd);

      // ── Collect data from appContext ───────────────────────────────────────
      const allTasks = (appContext.tasks || []) as any[];
      const completedTasks = allTasks.filter((t: any) =>
        t.status === 'completed' && t.date && t.date >= weekStartStr && t.date <= weekEndStr
      );
      const overdueTasks = allTasks.filter((t: any) =>
        t.status !== 'completed' && t.date && t.date < weekEndStr && t.date >= weekStartStr
      );
      const allHabitLogs = (appContext.habitLogs || []) as any[];
      const weekHabitLogs = allHabitLogs.filter((l: any) => l.date >= weekStartStr && l.date <= weekEndStr);
      const habitCompletionRate = appContext.habits?.length > 0
        ? Math.round((weekHabitLogs.length / (appContext.habits.length * 7)) * 100)
        : 0;
      const allGymLogs = (appContext.gymLogs || []) as any[];
      const weekGymSessions = allGymLogs.filter((l: any) => l.date >= weekStartStr && l.date <= weekEndStr).length;
      const goals = (appContext.goals || []) as any[];
      const activeGoals = goals.filter((g: any) => g.status === 'active');

      // ── Build review document ──────────────────────────────────────────────
      const reviewData = {
        userId: user.uid,
        weekStartDate: weekStartStr,
        weekEndDate: weekEndStr,
        generatedAt: Date.now(),
        generatedBy: 'agent:ENIGMA',
        metrics: {
          tasksCompleted: completedTasks.length,
          tasksOverdue: overdueTasks.length,
          taskCompletionRate: allTasks.length > 0 ? Math.round((completedTasks.length / (completedTasks.length + overdueTasks.length || 1)) * 100) : 0,
          habitCompletionRate,
          gymSessionsCompleted: weekGymSessions,
          activeGoalsCount: activeGoals.length,
        },
        highlights: {
          completedTaskTitles: completedTasks.slice(0, 5).map((t: any) => t.title || t.text),
          overdueTitles: overdueTasks.slice(0, 3).map((t: any) => t.title || t.text),
        },
        source: 'agent',
      };

      const reviewRef = await addDoc(collection(db, 'weekly_reviews'), reviewData);

      // ── Dispatch event so WeeklyReviewModule can display the result ────────
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-weekly-review-ready', {
          detail: { reviewId: reviewRef.id, data: reviewData }
        }));
      }

      logApi('POST', '/api/v1/reviews/weekly', { weekStartDate: weekStartStr }, 'success');
      return {
        success: true,
        data: reviewData,
        message: `📊 **Weekly Review — ${weekStartStr} to ${weekEndStr}**\n\n` +
          `✅ **Tasks Completed:** ${completedTasks.length}\n` +
          `⚠️ **Tasks Overdue:** ${overdueTasks.length}\n` +
          `🎯 **Completion Rate:** ${reviewData.metrics.taskCompletionRate}%\n` +
          `🔄 **Habit Compliance:** ${habitCompletionRate}%\n` +
          `💪 **Gym Sessions:** ${weekGymSessions}\n` +
          `🏆 **Active Goals:** ${activeGoals.length}\n\n` +
          `Review saved and visible in the Weekly Review module.`,
      };
    }

case 'get_day_review': {
      const reviewDate = (args.date as string) || today;
      const allTasks = appContext.tasks || [];
      const todaysTasks = allTasks.filter((t: any) => t.date === reviewDate);
      const completedToday = todaysTasks.filter((t: any) => t.status === 'completed');
      const dayScore = todaysTasks.length > 0 ? Math.round((completedToday.length / todaysTasks.length) * 100) : 0;
      const events = appContext.calendarEvents || [];
      const todaysEvents = events.filter((e: any) => (e.date || e.start?.split('T')[0]) === reviewDate);
      const overdueFromToday = todaysTasks.filter((t: any) => t.status !== 'completed');
      // Top 3 tasks for tomorrow by priority
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);
      const tomorrowTasks = allTasks
        .filter((t: any) => t.status !== 'completed' && (t.date === tomorrowStr || (!t.date && overdueFromToday.find((o: any) => o.id === t.id))))
        .sort((a: any, b: any) => { const p: any = { high: 0, medium: 1, low: 2 }; return (p[a.priority] || 1) - (p[b.priority] || 1); })
        .slice(0, 3);
      const scoreEmoji = dayScore >= 80 ? '🔥' : dayScore >= 60 ? '✅' : dayScore >= 40 ? '⚠️' : '🆘';
      const scoreMsg = dayScore >= 80 ? 'Outstanding day!' : dayScore >= 60 ? 'Solid effort.' : dayScore >= 40 ? 'Room to improve.' : 'Tough day — reset tomorrow.';
      return {
        success: true,
        data: { reviewDate, dayScore, tasksPlanned: todaysTasks.length, tasksCompleted: completedToday.length, meetingsHeld: todaysEvents.length, tomorrowTasks },
        message: `${scoreEmoji} **Day Review — ${reviewDate}**\n📊 Day Score: **${dayScore}%** — ${scoreMsg}\n✅ Completed: ${completedToday.length}/${todaysTasks.length} tasks\n📅 Meetings: ${todaysEvents.length} held\n⏭️ Tomorrow's top 3: ${tomorrowTasks.map((t: any, i: number) => `${i+1}. "${t.title || t.text}"`).join(' | ') || 'Nothing scheduled yet'}`
      };
    }

case 'get_meeting_prep_brief': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const meetingDate = today;
      const events = await listCalendarEventsOnDate(meetingDate, signal);
      const targetEvent = args.eventTitle
        ? events.find((e: any) => (e.summary || '').toLowerCase().includes((args.eventTitle as string).toLowerCase()))
        : events[0];
      if (!targetEvent && !args.attendeeEmails) return { success: false, data: null, message: 'No meeting found today. Provide eventTitle or attendeeEmails to generate a brief.' };
      const attendees: string[] = args.attendeeEmails
        ? (args.attendeeEmails as string).split(',').map(e => e.trim())
        : (targetEvent?.attendees || []).map((a: any) => a.email).filter(Boolean);
      // Pull tasks tagged to attendees
      const relatedTasks = (appContext.tasks || []).filter((t: any) => {
        const title = (t.title || t.text || '').toLowerCase();
        return attendees.some(email => {
          const name = email.split('@')[0].toLowerCase();
          return title.includes(name);
        });
      }).slice(0, 5);
      return {
        success: true,
        data: { event: targetEvent?.summary, attendees, relatedTasks, date: meetingDate },
        message: `📋 **Meeting Prep Brief: ${targetEvent?.summary || 'Upcoming Meeting'}**\n👥 Attendees: ${attendees.join(', ') || 'Unknown'}\n📌 Open action items: ${relatedTasks.length > 0 ? relatedTasks.map((t: any) => `"${t.title || t.text}"`).join(', ') : 'None tracked'}\n💡 Tip: Call get_email_thread for each attendee to surface recent promises.`
      };
    }

    default:
      return null; // Tool not handled by this executor
  }
};
