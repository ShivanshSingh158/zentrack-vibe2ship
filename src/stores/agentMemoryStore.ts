import type { AgentStep } from '../agent/runAgentLoop';

export interface AgentMessage {
  role: 'user' | 'agent';
  title: string;
  steps?: AgentStep[];
}

const INITIAL_MESSAGE: AgentMessage = {
  role: 'agent',
  title: "Hey! I'm Zen Agent — powered by the full 13-agent fleet. I can read tasks, schedule calendar, send emails, find Drive files, create meetings, and more. Try: \"Scan my inbox for hidden deadlines\" or \"I missed a deadline, help me recover.\""
};

class AgentMemoryStore {
  private messages: AgentMessage[] = [INITIAL_MESSAGE];
  private listeners: Set<() => void> = new Set();

  getSnapshot = () => {
    return this.messages;
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
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

export const agentMemoryStore = new AgentMemoryStore();
