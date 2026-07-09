export interface CompensationAction {
  tool: string;           // Tool to call to undo the action (e.g. 'delete_task')
  args: Record<string, unknown>; // Args for the undo call
  description: string;   // Human-readable description (e.g. 'Delete task created by TITAN')
}

export interface SharedMemoryContext {
  originalPrompt: string;
  extractedDeadlines: Record<string, string>;
  filesContext: Record<string, unknown>;
  emailsContext: Record<string, unknown>;
  dataContext: Record<string, unknown>;
  completedTasks: string[];
  pendingSubTasks: string[];
  finalOutput?: string;
  errors: string[];
  contextBuiltAt: string;
  contextTTLMs: number;
  // ✅ ARCH-3 FIX: Compensation log for rollback of partial multi-step actions.
  // When TITAN does create_task → schedule_calendar → send_gmail and step 3 fails,
  // the orchestrator executes compensations in reverse order to undo steps 1+2.
  compensations: CompensationAction[];
}

export const createInitialState = (prompt: string): SharedMemoryContext => ({
  originalPrompt: prompt,
  extractedDeadlines: {},
  filesContext: {},
  emailsContext: {},
  dataContext: {},
  completedTasks: [],
  pendingSubTasks: [],
  errors: [],
  compensations: [],
  contextBuiltAt: new Date().toISOString(),
  contextTTLMs: 900000 // 15 minutes max context age
});
