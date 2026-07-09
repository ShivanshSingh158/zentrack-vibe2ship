/**
 * @file AgentApprovalToast.tsx
 * @module src/components/AgentApprovalToast
 *
 * MISSING-005: Non-blocking agent approval notification.
 *
 * Per the original design decision (AGENTS.md), all agent actions auto-approve
 * to eliminate friction. This component implements a "3-second undo toast" pattern:
 * - The action proceeds immediately (no blocking wait)
 * - A toast appears briefly showing what the agent is doing
 * - The user has 3 seconds to click "Cancel" if they want to stop it
 *
 * This gives visibility without blocking the agent's execution flow.
 *
 * Usage:
 *   dispatchEvent(new CustomEvent('agent-approval-request', {
 *     detail: { toolName: 'delete_task', summary: 'Delete "Write report" task permanently?', id: 'uuid' }
 *   }));
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

// Tool name → user-friendly display label
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  delete_internal_app_data: '🗑️ Deleting item',
  delete_task: '🗑️ Deleting task',
  delete_calendar_event: '📅 Removing calendar event',
  delete_calendar_events: '📅 Removing calendar events',
  send_gmail: '📧 Sending email',
  send_notification: '🔔 Sending notification',
  schedule_task_in_calendar: '📅 Scheduling in calendar',
  block_calendar: '📅 Blocking calendar time',
  create_google_meet: '🎥 Creating meeting',
  rebuild_day: '🗓️ Rebuilding your day',
  panic_mode: '🚨 Activating Panic Mode',
  focus_lock: '🔒 Activating Focus Lock',
  auto_reschedule: '📅 Rescheduling tasks',
  draft_email: '📧 Drafting email',
  create_task: '✅ Creating task',
  create_goal: '🎯 Creating goal',
};

interface ApprovalRequest {
  toolName: string;
  summary: string;
  id: string;
}

// Track active cancellation signals by approval ID
const _cancellationMap = new Map<string, () => void>();

export function AgentApprovalToastListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const { toolName, summary, id } = (e as CustomEvent<ApprovalRequest>).detail;
      const label = TOOL_DISPLAY_NAMES[toolName] || `🤖 ${toolName}`;

      toast(`${label}`, {
        description: summary.slice(0, 120),
        duration: 3500,
        action: {
          label: 'Cancel',
          onClick: () => {
            const cancel = _cancellationMap.get(id);
            if (cancel) {
              cancel();
              toast.warning(`Action cancelled: ${label}`, { duration: 3000 });
            }
          },
        },
      });
    };

    window.addEventListener('agent-approval-request', handler as EventListener);
    return () => window.removeEventListener('agent-approval-request', handler as EventListener);
  }, []);

  return null; // purely event-driven, no DOM output
}

/**
 * Register a cancellation callback for a specific approval request.
 * Call this before dispatching the approval event so the toast can wire Cancel.
 */
export function registerApprovalCancellation(id: string, cancel: () => void) {
  _cancellationMap.set(id, cancel);
  // Auto-clean after 10s (3.5s toast + buffer)
  setTimeout(() => _cancellationMap.delete(id), 10_000);
}
