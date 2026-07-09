/**
 * @file index.ts — Agent module barrel export
 * @module src/agent
 *
 * Re-exports the public API of the ZenTrack agent layer.
 * Internal implementation files (fleet/, core/, memory/) are intentionally
 * not re-exported here — consumers should import from the orchestrator only.
 */
export { orchestrateAgent } from './orchestrator';
export { runAgentLoop } from './runAgentLoop';
export type { AgentStep } from './runAgentLoop';
export { executeTool } from './toolExecutor';
export type { ToolResult } from './toolExecutor';
export { TOOL_DECLARATIONS, TOOL_NAMES } from './toolDeclarations';
export { tryAcquireLock, releaseLock } from './orchestrationLock';
