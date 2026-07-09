/**
 * @file learning.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from '../../services/firebase';
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


export const executeLearningTools = async (
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
case 'calculate_bunk_capacity': {
      if (!args.subject) return { success: false, data: null, message: 'subject is required' };
      const targetPct = (args.targetPercentage as number) || 75;
      const subjects: any[] = appContext.attendanceSubjects || [];
      const subj = subjects.find((s: any) => (s.name || s.subject || '').toLowerCase().includes((args.subject as string).toLowerCase()));
      if (!subj) {
        const available = subjects.map((s: any) => s.name || s.subject).join(', ');
        return { success: false, data: null, message: `Subject "${args.subject}" not found. Available: ${available || 'No subjects tracked yet — add attendance data first.'}` };
      }
      const attended = subj.attended || subj.present || 0;
      const total    = subj.total   || subj.conducted || 0;
      if (total === 0) return { success: false, data: null, message: `No attendance data found for ${subj.name}` };
      const currentPct = ((attended / total) * 100).toFixed(1);
      const target = targetPct / 100;
      // Formula: attended - target*(total+x) >= 0 where x = classes to miss
      // Solving: safeToMiss = floor((attended - target*total) / target)
      const safeToMiss = Math.floor((attended - target * total) / target);
      const canMiss = Math.max(0, safeToMiss);
      // Classes needed to recover if already below target
      const classesNeededToRecover = attended / total < target
        ? Math.ceil((target * total - attended) / (1 - target))
        : 0;
      return {
        success: true,
        data: { subject: subj.name, attended, total, currentPct: parseFloat(currentPct), targetPct, canMiss, classesNeededToRecover },
        message: canMiss > 0
          ? `📊 ${subj.name}: ${currentPct}% attendance (${attended}/${total}). You can safely miss **${canMiss} more class${canMiss > 1 ? 'es' : ''}** before falling below ${targetPct}%.`
          : `🚨 ${subj.name}: ${currentPct}% attendance — already below ${targetPct}%! You need to attend **${classesNeededToRecover} consecutive class${classesNeededToRecover > 1 ? 'es' : ''}** to recover.`
      };
    }

case 'plan_study_schedule': {
      if (!args.subject || !args.examDate) return { success: false, data: null, message: 'subject and examDate are required' };
      const dailyHours = (args.dailyHours as number) || 2;
      const examDate = new Date(args.examDate as string);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1); // start tomorrow
      const daysUntilExam = Math.floor((examDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExam <= 0) return { success: false, data: null, message: `Exam date ${args.examDate} is today or in the past. Cannot schedule study sessions.` };
      const topics = args.syllabusTopics ? (args.syllabusTopics as string).split(',').map(t => t.trim()) : [];
      const studyDays = Math.min(daysUntilExam, 14); // cap at 2 weeks
      const sessionsPerDay = topics.length > 0 ? Math.ceil(topics.length / studyDays) : 1;
      const createdTasks: string[] = [];
      // Create high-priority exam task first
      const examRef = await addDoc(collection(db, 'todos'), {
        userId: user.uid, title: `📝 EXAM: ${args.subject}`, text: `📝 EXAM: ${args.subject}`,
        priority: 'high', date: args.examDate, status: 'pending',
        estimatedMinutes: 180, createdAt: Date.now(), order: Date.now(),
      });
      createdTasks.push(`Exam task: ${args.subject} on ${args.examDate}`);
      // Create daily study session tasks
      for (let day = 0; day < studyDays; day++) {
        const sessionDate = new Date(startDate);
        sessionDate.setDate(startDate.getDate() + day);
        const dateStr = getLocalDateString(sessionDate);
        const topicStart = day * sessionsPerDay;
        const dayTopics = topics.slice(topicStart, topicStart + sessionsPerDay);
        const sessionTitle = dayTopics.length > 0
          ? `Study: ${args.subject} — ${dayTopics.join(' + ')}`
          : `Study: ${args.subject} — Session ${day + 1}`;
        await addDoc(collection(db, 'todos'), {
          userId: user.uid, title: sessionTitle, text: sessionTitle,
          priority: day < 3 ? 'high' : 'medium',
          date: dateStr, status: 'pending',
          estimatedMinutes: dailyHours * 60,
          createdAt: Date.now(), order: Date.now() + day,
          linkedExamId: examRef.id,
        });
        createdTasks.push(`${dateStr}: ${sessionTitle}`);
      }
      logApi('POST', '/api/v1/tasks/bulk', { subject: args.subject, count: createdTasks.length }, 'success');

      // ✅ ISSUE-T4 FIX: Auto-block calendar slots internally instead of instructing the agent
      // to make additional get_free_calendar_slots + schedule_task_in_calendar calls.
      // The old approach hit the 6-iteration max — only the first 6 of 14 sessions got calendar
      // blocks, and the rest were silently skipped. Now we do up to 5 blocks in-line.
      const calendarBlockResults: string[] = [];
      try {
        if (isSignedInToGoogle()) {
          const studyStartDate = new Date();
          studyStartDate.setDate(studyStartDate.getDate() + 1);
          const slotsToBlock = Math.min(studyDays, 5); // block first 5 days' sessions in-line
          for (let day = 0; day < slotsToBlock; day++) {
            const sessionDate = new Date(studyStartDate);
            sessionDate.setDate(studyStartDate.getDate() + day);
            const dateStr = getLocalDateString(sessionDate);
            const liveEvents = await listCalendarEventsOnDate(dateStr, signal);
            // Find first free 2-hour slot between 8am-10pm
            let blocked = false;
            for (let hour = 8; hour <= 20; hour++) {
              const slotStart = new Date(dateStr + 'T00:00:00');
              slotStart.setHours(hour, 0, 0, 0);
              const slotEnd = new Date(slotStart.getTime() + dailyHours * 3600000);
              const hasConflict = liveEvents.some((e: any) => {
                const es = e.start?.dateTime ? new Date(e.start.dateTime) : null;
                const ee = e.end?.dateTime ? new Date(e.end.dateTime) : null;
                return es && ee && es < slotEnd && ee > slotStart;
              });
              if (!hasConflict) {
                await addEventToGoogleCalendar({
                  title: `📚 Study: ${args.subject}`,
                  date: dateStr,
                  startDateTime: slotStart.toISOString(),
                  endDateTime: slotEnd.toISOString(),
                  description: `Auto-scheduled study session for ${args.subject} exam on ${args.examDate}`,
                }, signal);
                calendarBlockResults.push(`${dateStr} @ ${String(hour).padStart(2,'0')}:00`);
                blocked = true;
                break;
              }
            }
            if (!blocked) calendarBlockResults.push(`${dateStr} (no free slot found)`);
          }
        }
      } catch (calErr) {
        console.warn('[plan_study_schedule] Calendar auto-block failed (non-blocking):', calErr);
      }

      const calMsg = calendarBlockResults.length > 0
        ? `\n📅 Auto-blocked calendar slots: ${calendarBlockResults.join(' | ')}${studyDays > 5 ? ` (+ ${studyDays - 5} more — connect Google Calendar for full blocking)` : ''}`
        : `\n💡 Connect Google Calendar to auto-block daily study windows.`;

      return {
        success: true,
        data: { examId: examRef.id, sessionsCreated: studyDays, daysUntilExam, dailyHours, calendarBlockResults },
        message: `✅ Study schedule created for **${args.subject}** exam on ${args.examDate}!\n📅 ${studyDays} study sessions (${dailyHours}h/day) scheduled from tomorrow.\n📋 Sessions: ${createdTasks.slice(1, 4).join(' | ')}${studyDays > 3 ? ` + ${studyDays - 3} more` : ''}${calMsg}`
      };
    }

case 'create_assignment': {
      if (!args.title || !args.subject || !args.dueDate) return { success: false, data: null, message: 'title, subject, and dueDate are required for create_assignment' };
      const assignmentRef = await addDoc(collection(db, 'assignments'), {
        userId: user.uid,
        title: args.title,
        subject: args.subject,
        dueDate: args.dueDate,
        priority: args.priority || 'medium',
        notes: args.notes || null,
        completed: false,
        createdAt: Date.now(),
      });
      logApi('POST', '/api/v1/assignments', { title: args.title, subject: args.subject, dueDate: args.dueDate }, 'success');

      // ✅ PART-4 STUDENT FIX: Assignment Reminder Chain.
      // Schedule T-1day, T-0 morning, T-2h push notifications via localStorage.
      // The watchdog in useProactiveAgent reads these and fires at the right moment.
      try {
        const dueMs = new Date(args.dueDate + 'T23:59:00').getTime();
        const reminders = [
          { fireAt: dueMs - 24 * 60 * 60 * 1000, message: `📚 Assignment due tomorrow: "${args.title}" for ${args.subject}` },
          { fireAt: dueMs - 8 * 60 * 60 * 1000,  message: `⏰ 8 hours left — "${args.title}" for ${args.subject}. Have you started?` },
          { fireAt: dueMs - 2 * 60 * 60 * 1000,  message: `🚨 2 HOURS LEFT — Submit "${args.title}" for ${args.subject} NOW!` },
        ];
        const existingRaw = localStorage.getItem('zen_assignment_reminders') || '[]';
        const existing = JSON.parse(existingRaw);
        const updated = [...existing, ...reminders.map(r => ({ ...r, assignmentId: assignmentRef.id, title: args.title }))];
        localStorage.setItem('zen_assignment_reminders', JSON.stringify(updated));
      } catch (reminderErr) {
        console.warn('[ToolExecutor] Reminder scheduling failed (non-blocking):', reminderErr);
      }

      return { success: true, data: { id: assignmentRef.id }, message: `✅ Assignment added: "${args.title}" for ${args.subject} due ${args.dueDate}. ⏰ 3 reminder notifications scheduled (T-1day, T-8h, T-2h).` };
    }

    default:
      return null; // Tool not handled by this executor
  }
};
