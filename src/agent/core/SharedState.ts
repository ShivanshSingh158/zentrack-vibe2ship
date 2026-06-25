export interface SharedMemoryContext {
  originalPrompt: string;
  extractedDeadlines: Record<string, string>;
  filesContext: Record<string, any>;
  emailsContext: Record<string, any>;
  dataContext: Record<string, any>;
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
  contextTTLMs: 120000 // 2 minutes max context age
});
