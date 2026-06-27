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
  contextBuiltAt: new Date().toISOString(),
  contextTTLMs: 900000 // 15 minutes max context age
});
