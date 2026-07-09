/**
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
import { executeWebTools } from './tools/web.executor';
import { executeGymTools } from './tools/gym.executor';
import type { ToolResult } from './tools/shared';
// Also re-export shared requestApproval and executeTool
export { requestApproval } from './tools/shared';
// MISSING-008: Agent action audit logging
import { logAgentAction, isWriteTool } from '../services/agentActionLog';

export const executeTool = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult> => {

  let result: ToolResult | null = null;

  result = await executeTaskTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeCalendarTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeGmailTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeDriveTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeMeetTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeNotificationTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeAnalyticsTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeLearningTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeContentTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeSystemTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  result = await executeNavigationTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeWebTools(toolName, args, appContext, signal, depth);
  if (result) return result;

  result = await executeGymTools(toolName, args, appContext, signal, depth);
  if (result) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gym-log-updated'));
    if (result.success && isWriteTool(toolName)) logAgentAction(toolName, args, result).catch(() => {});
    return result;
  }

  return { success: false, data: null, message: `Unknown tool: "${toolName}"` };
};
