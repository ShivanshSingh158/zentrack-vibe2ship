/**
 * AgentMemoryStore — In-memory conversation history for the Zen Agent panel.
 *
 * Uses the React useSyncExternalStore pattern so the panel re-renders
 * reactively whenever the store is mutated by the orchestrator.
 */
import type { AgentStep } from '../runAgentLoop';

export interface AgentMessage {
  role: 'user' | 'agent';
  title: string;
  steps?: AgentStep[];
}

const INITIAL_MESSAGE: AgentMessage = {
  role: 'agent',
  title:
    "Hey! I'm Zen Agent — powered by the full 13-agent fleet. I can read tasks, schedule " +
    'calendar, send emails, find Drive files, create meetings, and more. Try: ' +
    '"Scan my inbox for hidden deadlines" or "I missed a deadline, help me recover."',
};

class AgentMemoryStore {
  private messages: AgentMessage[] = [INITIAL_MESSAGE];
  private listeners: Set<() => void> = new Set();

  /** React useSyncExternalStore-compatible snapshot getter */
  getSnapshot = (): AgentMessage[] => this.messages;

  /** React useSyncExternalStore-compatible subscribe */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.listeners.forEach(l => l());
  }

  appendMessage(msg: AgentMessage) {
    this.messages = [...this.messages, msg];
    this.emit();
  }

  clear() {
    this.messages = [INITIAL_MESSAGE];
    this.emit();
  }
}

/** Singleton store — shared across the entire app */
export const agentMemoryStore = new AgentMemoryStore();
