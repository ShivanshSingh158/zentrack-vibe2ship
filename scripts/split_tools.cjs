const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');
const path = require('path');

const project = new Project();
const sourceFile = project.addSourceFileAtPath('src/agent/toolExecutor.ts');

const executeToolFunc = sourceFile.getVariableDeclaration('executeTool').getInitializer();
const switchStatement = executeToolFunc.getBody().getStatements().find(s => s.getKind() === SyntaxKind.SwitchStatement);

const cases = switchStatement.getClauses();

const mappings = {
  task: ['get_tasks', 'create_task', 'update_task', 'delete_task', 'complete_task', 'search_tasks', 'snooze_task', 'update_task_priority', 'complete_habit', 'mark_attendance'],
  calendar: ['schedule_task_in_calendar', 'get_free_calendar_slots', 'list_calendar_events', 'update_calendar_event', 'block_calendar', 'delete_calendar_event', 'delete_calendar_events', 'auto_reschedule'],
  gmail: ['read_gmail', 'send_gmail', 'reply_gmail', 'archive_gmail', 'draft_email', 'trash_email', 'smart_email_triage', 'get_email_thread'],
  drive: ['search_google_drive', 'list_drive_files', 'open_drive_file', 'create_google_doc', 'write_google_doc', 'read_google_doc', 'trash_drive_file'],
  meet: ['create_google_meet', 'schedule_google_meet'],
  notification: ['send_reminder', 'send_notification', 'notify_accountability_partner'],
  analytics: ['get_habit_stats', 'generate_weekly_review', 'get_day_review', 'get_meeting_prep_brief'],
  learning: ['calculate_bunk_capacity', 'plan_study_schedule', 'create_assignment'],
  content: ['create_note', 'search_notes', 'create_goal', 'create_habit', 'generate_script'],
  system: ['connect_google_workspace', 'delete_internal_app_data', 'query_internal_app_data', 'panic_mode', 'focus_lock', 'rebuild_day', 'deadline_negotiator', 'execute_system_task'],
  navigation: ['navigate_to_module', 'open_gym_workout', 'search_and_play_youtube', 'start_pomodoro', 'delegate_task']
};

const defaultImports = `import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent, listCalendarEventsOnDate, updateCalendarEvent } from '../../services/googleCalendar';
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
} from '../../services/googleWorkspace';
import { ToolResult, requireGoogleAuth, requestApproval } from './shared';
`;

for (const [moduleName, toolNames] of Object.entries(mappings)) {
  let fileContent = `/**\n * @file ${moduleName}.executor.ts\n */\n${defaultImports}\n\n`;
  fileContent += `export const execute${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Tools = async (\n`;
  fileContent += `  toolName: string,\n  args: any,\n  appContext: any,\n  signal?: AbortSignal,\n  depth: number = 0\n): Promise<ToolResult | null> => {\n`;
  fileContent += `  const user = auth.currentUser;\n  if (!user) return { success: false, data: null, message: "Not authenticated. User is not logged in." };\n`;
  fileContent += `  const today = getLocalDateString(new Date());\n\n`;
  fileContent += `  switch (toolName) {\n`;

  for (const toolName of toolNames) {
    const clause = cases.find(c => {
      if (c.getKind() === SyntaxKind.CaseClause) {
        return c.getExpression().getText() === "'" + toolName + "'";
      }
      return false;
    });

    if (clause) {
      fileContent += clause.getText() + '\n\n';
    } else {
      console.warn('Warning: Tool ' + toolName + ' not found in switch statement.');
    }
  }

  fileContent += `    default:\n      return null; // Tool not handled by this executor\n  }\n};\n`;
  
  // NOTE: do NOT run replace(/\\n/g, '\n') as it breaks string literals in code!
  
  fs.writeFileSync(path.join(process.cwd(), 'src/agent/tools', moduleName + '.executor.ts'), fileContent);
  console.log('Created ' + moduleName + '.executor.ts');
}

// Generate the new dispatcher for toolExecutor.ts
let dispatcherContent = `/**
 * @file toolExecutor.ts
 * @module src/agent/toolExecutor
 */

import { executeTaskTools } from './tools/task.executor';
import { executeCalendarTools } from './tools/calendar.executor';
import { executeGmailTools } from './tools/gmail.executor';
import { executeDriveTools } from './tools/drive.executor';
import { executeMeetTools } from './tools/meet.executor';
import { executeNotificationTools } from './tools/notification.executor';
import { executeAnalyticsTools } from './tools/analytics.executor';
import { executeLearningTools } from './tools/learning.executor';
import { executeContentTools } from './tools/content.executor';
import { executeSystemTools } from './tools/system.executor';
import { executeNavigationTools } from './tools/navigation.executor';
import { ToolResult } from './tools/shared';
// Also re-export shared requestApproval and executeTool
export { requestApproval } from './tools/shared';

export const executeTool = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult> => {

  let result: ToolResult | null = null;

  result = await executeTaskTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeCalendarTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeGmailTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeDriveTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeMeetTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeNotificationTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeAnalyticsTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeLearningTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeContentTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeSystemTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeNavigationTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  return { success: false, data: null, message: \`Unknown tool: "\${toolName}"\` };
};
`;

fs.writeFileSync(path.join(process.cwd(), 'src/agent/toolExecutor.ts'), dispatcherContent);
console.log('Updated toolExecutor.ts dispatcher');
