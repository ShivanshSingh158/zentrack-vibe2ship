/**
 * @file content.executor.ts
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


export const executeContentTools = async (
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
case 'create_note': {
      // Fixes blindspot: agents could read notes (via query_internal_app_data)
      // but had no way to write them. This closes the read/write asymmetry.
      if (!args.title || !args.content) {
        return { success: false, data: null, message: 'title and content are required for create_note' };
      }
      const tags = args.tags
        ? (args.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];
      const noteRef = await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        title: args.title,
        content: args.content,
        tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/notes', { title: args.title, tags }, 'success');
      return {
        success: true,
        data: { id: noteRef.id, title: args.title },
        message: `📝 Note saved: **"${args.title}"**${tags.length > 0 ? ` — tagged: ${tags.join(', ')}` : ''}`,
      };
    }

case 'search_notes': {
      // Fixes blindspot: query_internal_app_data('notes') returned ALL notes (token-expensive).
      // This tool does targeted content search with relevance excerpts.
      if (!args.query) return { success: false, data: null, message: 'query is required for search_notes' };
      const maxResults = args.maxResults || 5;
      const lowerQuery = (args.query as string).toLowerCase();
      const allNotes = (appContext.notes || []) as any[];

      const matches = allNotes
        .filter((note: any) => {
          const titleMatch = (note.title || '').toLowerCase().includes(lowerQuery);
          const contentMatch = (note.content || '').toLowerCase().includes(lowerQuery);
          return titleMatch || contentMatch;
        })
        .slice(0, maxResults)
        .map((note: any) => {
          // Extract relevant excerpt around the match
          const content = note.content || '';
          const matchIdx = content.toLowerCase().indexOf(lowerQuery);
          const excerpt = matchIdx >= 0
            ? '...' + content.slice(Math.max(0, matchIdx - 60), matchIdx + 120) + '...'
            : content.slice(0, 150) + (content.length > 150 ? '...' : '');
          return {
            id: note.id,
            title: note.title,
            excerpt,
            tags: note.tags || [],
            createdAt: note.createdAt,
          };
        });

      logApi('GET', `/api/v1/notes/search?q=${args.query}`, {}, 'success');
      return {
        success: true,
        data: matches,
        message: `Found ${matches.length} note(s) matching "${args.query}"`,
      };
    }

case 'create_goal': {
      // Fixes blindspot: ATLAS was creating tasks in the todos collection with goal-like
      // names (e.g. "Achieve fitness goal") instead of writing to the actual goals collection.
      // Goals are now properly persisted and visible in the /goals module.
      if (!args.title) return { success: false, data: null, message: 'title is required for create_goal' };
      const milestones = args.milestones
        ? (args.milestones as string).split(',').map((m: string) => ({ text: m.trim(), completed: false })).filter(m => m.text)
        : [];
      const goalRef = await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title: args.title,
        description: args.description || '',
        targetDate: args.targetDate || null,
        category: args.category || 'personal',
        milestones,
        progress: 0,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/goals', { title: args.title, category: args.category }, 'success');
      return {
        success: true,
        data: { id: goalRef.id, title: args.title },
        message: `🎯 Goal created: **"${args.title}"**${args.targetDate ? ` — target: ${args.targetDate}` : ''}${milestones.length > 0 ? `. ${milestones.length} milestones set.` : ''}`,
      };
    }

case 'create_habit': {
      // Fixes blindspot: complete_habit existed but create_habit did not.
      // Users could ask the agent to track habits but new habits were never created.
      if (!args.name) return { success: false, data: null, message: 'name is required for create_habit' };
      const habitRef = await addDoc(collection(db, 'habits'), {
        userId: user.uid,
        name: args.name,
        description: args.description || '',
        frequency: args.frequency || 'daily',
        reminderTime: args.reminderTime || null,
        icon: args.icon || '✅',
        streak: 0,
        longestStreak: 0,
        completedDates: [],
        createdAt: Date.now(),
        source: 'agent',
      });
      logApi('POST', '/api/v1/habits', { name: args.name, frequency: args.frequency }, 'success');
      return {
        success: true,
        data: { id: habitRef.id, name: args.name },
        message: `${args.icon || '✅'} Habit created: **"${args.name}"** (${args.frequency || 'daily'})${args.reminderTime ? ` — reminder at ${args.reminderTime}` : ''}`,
      };
    }

case 'generate_script': {
      if (!args.language || !args.code) {
        return { success: false, data: null, message: 'language and code are required for generate_script' };
      }
      const scriptLang = (args.language as string).toLowerCase();
      const scriptCode = args.code as string;
      const scriptExplanation = (args.explanation as string) || 'Script generated by HEPHAESTUS.';
      const lineCount = scriptCode.split('\n').length;

      // Dispatch to ZenAgentPanel UI to render a Script Card with syntax highlighting
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zen-script', {
          detail: { language: scriptLang, code: scriptCode, explanation: scriptExplanation, generatedAt: Date.now() }
        }));
      }

      // Persist to Firestore so user can retrieve scripts later
      try {
        await addDoc(collection(db, 'generated_scripts'), {
          userId: user.uid,
          language: scriptLang,
          code: scriptCode,
          explanation: scriptExplanation,
          createdAt: Date.now(),
          source: 'agent:HEPHAESTUS',
        });
      } catch (persistErr) {
        console.warn('[generate_script] Firestore persist failed (non-blocking):', persistErr);
      }

      logApi('POST', '/api/v1/agent/scripts', { language: scriptLang, lines: lineCount }, 'success');
      return {
        success: true,
        data: { language: scriptLang, lines: lineCount, explanation: scriptExplanation },
        message: `🔧 **Script Card generated** (${scriptLang.toUpperCase()}, ${lineCount} lines)\n\n${scriptExplanation}\n\n✅ The code card has appeared above in the chat. Click **Copy** to grab the code, then run it in your terminal.`
      };
    }

    default:
      return null; // Tool not handled by this executor
  }
};
