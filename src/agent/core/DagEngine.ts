import type { SharedMemoryContext } from './SharedState';

export type AgentRole = 'SEARCH' | 'DOCS' | 'DATA' | 'COMMS' | 'SCHEDULER' | 'DRIVE' | 'CODING' | 'QA' | 'MEET' | 'PLANNER' | 'MONITOR' | 'GHOST_DETECTOR' | 'EXECUTOR';

export interface DagTask {
  id: string;
  assignedAgent: AgentRole;
  instruction: string;
  dependencies: string[]; // IDs of tasks that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
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
    const runnable: DagTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        
        // QA runs as long as all dependencies are resolved (completed or failed)
        if (task.assignedAgent === 'QA') {
          const allResolved = task.dependencies.every(depId => {
            const dep = this.tasks.get(depId);
            return dep && (dep.status === 'completed' || dep.status === 'failed');
          });
          if (allResolved) runnable.push(task);
          continue;
        }

        let hasFailedDep = false;
        let allCompleted = true;

        for (const depId of task.dependencies) {
          const dep = this.tasks.get(depId);
          if (!dep) continue;
          if (dep.status === 'failed') {
            hasFailedDep = true;
          }
          if (dep.status !== 'completed') {
            allCompleted = false;
          }
        }

        if (hasFailedDep) {
          this.updateTaskStatus(task.id, 'failed', 'Dependency failed (Cascaded)');
        } else if (allCompleted) {
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
