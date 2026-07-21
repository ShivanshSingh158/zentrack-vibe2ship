/**
 * dagExecutor.ts — Mobile DAG Engine
 * 
 * Executes a Directed Acyclic Graph (DAG) of tasks in parallel using the Gemini proxy.
 * Uses round-robin API keys automatically through geminiProxy.ts.
 */

import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import { executeWebSearch } from '../services/webScraper';

export interface DagNode {
  id: string;
  type: 'search_web' | 'create_task' | 'create_habit' | 'create_subject' | 'delete_event' | 'analyze' | 'general_chat' | 'unknown';
  description: string;
  dependsOn?: string[]; // array of node ids
}

export interface DagResult {
  nodeId: string;
  result: string;
  error?: string;
}

/**
 * Given a list of DagNodes, executes them resolving dependencies first.
 * Nodes without dependencies or whose dependencies are met run in parallel via Promise.all.
 */
export async function executeDag(
  nodes: DagNode[],
  context: any,
  onProgress: (nodeId: string, status: string) => void
): Promise<DagResult[]> {
  const results = new Map<string, DagResult>();
  const pending = [...nodes];
  
  // Helper to check if all dependencies for a node are satisfied
  const canRun = (node: DagNode) => {
    if (!node.dependsOn || node.dependsOn.length === 0) return true;
    return node.dependsOn.every(depId => results.has(depId) && !results.get(depId)?.error);
  };

  while (pending.length > 0) {
    // Find all nodes that can run right now
    const runnable = pending.filter(canRun);
    
    if (runnable.length === 0) {
      // Circular dependency or failed dependency!
      console.warn('[DAG] Deadlock or failed dependency detected. Aborting remaining tasks.');
      break;
    }

    // Run them in parallel!
    // Since callProxy handles key rotation internally, hitting this concurrently
    // will naturally spread the requests across our 3-5 Gemini keys!
    const batchPromises = runnable.map(async (node) => {
      onProgress(node.id, `running`);
      let resultStr = '';
      
      try {
        if (node.type === 'search_web') {
          resultStr = await executeWebSearch(node.description);
        } else if (node.type === 'analyze') {
           // Provide results of dependencies to the prompt
           let depContext = '';
           if (node.dependsOn) {
             node.dependsOn.forEach(depId => {
               depContext += `\n[Result from Task ${depId}]: ${results.get(depId)?.result}\n`;
             });
           }
           
           const resp = await callProxy({
             model: 'gemini-2.5-flash',
             contents: [
               { role: 'user', parts: [{ text: `Context: ${JSON.stringify(context)}\nDependencies Data:${depContext}\nTask: ${node.description}`}] }
             ]
           });
           resultStr = parseProxyResponse(resp).text;
        } else {
           // For mutate actions (create_task, etc), we just return the raw JSON action request
           // The orchestrator will parse this later and show it in the UI.
           const resp = await callProxy({
             model: 'gemini-2.5-flash',
             contents: [
               { role: 'user', parts: [{ text: `Output the exact ACTION JSON block for this task: ${node.description}`}] }
             ]
           });
           resultStr = parseProxyResponse(resp).text;
        }
        
        onProgress(node.id, `done`);
        return { nodeId: node.id, result: resultStr };
        
      } catch (e: any) {
        console.error(`[DAG] Node ${node.id} failed:`, e);
        onProgress(node.id, `error`);
        return { nodeId: node.id, result: '', error: e.message };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    
    // Store results and remove from pending
    for (const r of batchResults) {
      results.set(r.nodeId, r);
      const idx = pending.findIndex(p => p.id === r.nodeId);
      if (idx > -1) pending.splice(idx, 1);
    }
  }

  return Array.from(results.values());
}
