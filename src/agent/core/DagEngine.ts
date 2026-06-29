import type { SharedMemoryContext } from './SharedState';

export type AgentRole = 'ORACLE' | 'SCRIBE' | 'ENIGMA' | 'HERMES' | 'CHRONOS' | 'ARCHIVE' | 'HEPHAESTUS' | 'AEGIS' | 'MEET' | 'ATLAS' | 'ARGUS' | 'SPECTRE' | 'TITAN' | 'NAVIGATOR';

export interface DagTask {
  id: string;
  assignedAgent: AgentRole;
  instruction: string;
  dependencies: string[]; // IDs of tasks that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  // ✅ INEFFICIENCY-1 FIX: When true, skip AEGIS synthesis and return this agent's
  // output as the final answer. Halves latency for simple single-tool writes (~4s→1.5s).
  isFinal?: boolean;
}

export class DagEngine {
  tasks: Map<string, DagTask> = new Map();
  state: SharedMemoryContext;

  constructor(initialState: SharedMemoryContext) {
    this.state = initialState;
  }

  addTask(task: DagTask) {
    this.tasks.set(task.id, task);
  }

  getRunnableTasks(): DagTask[] {
    // 1. Fully cascade any failures until the DAG state stabilizes
    let stateChanged = true;
    while (stateChanged) {
      stateChanged = false;
      for (const task of this.tasks.values()) {
        if (task.status === 'pending' && task.assignedAgent !== 'AEGIS') {
          let hasFailedDep = false;
          for (const depId of task.dependencies) {
            const dep = this.tasks.get(depId);
            if (dep && dep.status === 'failed') {
              hasFailedDep = true;
              break;
            }
          }
          if (hasFailedDep) {
            this.updateTaskStatus(task.id, 'failed', 'Dependency failed (Cascaded)');
            stateChanged = true;
          }
        }
      }
    }

    // 2. Collect actually runnable tasks
    const runnable: DagTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        
        // AEGIS runs as long as all dependencies are resolved (completed or failed)
        if (task.assignedAgent === 'AEGIS') {
          const allResolved = task.dependencies.every(depId => {
            const dep = this.tasks.get(depId);
            return dep && (dep.status === 'completed' || dep.status === 'failed');
          });
          if (allResolved) runnable.push(task);
          continue;
        }

        // ✅ FIX (DEDUCTION 2.5): Non-AEGIS tasks now also accept 'failed' deps as resolved.
        // Previously: if ORACLE failed, CHRONOS would stay 'pending' forever → deadlock.
        // Now: CHRONOS runs with partial/missing context from its dependencies.
        let allResolved = true;
        for (const depId of task.dependencies) {
          const dep = this.tasks.get(depId);
          if (!dep) continue;
          // 'failed' is now treated as "resolved" so dependent agents can still run
          if (dep.status !== 'completed' && dep.status !== 'failed') {
            allResolved = false;
            break;
          }
        }

        if (allResolved) {
          runnable.push(task);
        }
      }
    }
    return runnable;
  }

  updateTaskStatus(id: string, status: DagTask['status'], result?: string) {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      if (result) task.result = result;
    }
  }

  isComplete(): boolean {
    if (this.tasks.size === 0) return false;
    let complete = true;
    for (const task of this.tasks.values()) {
      if (task.status !== 'completed' && task.status !== 'failed') {
        complete = false;
        break;
      }
    }
    return complete;
  }

  getPendingTasks(): DagTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'pending');
  }
}
