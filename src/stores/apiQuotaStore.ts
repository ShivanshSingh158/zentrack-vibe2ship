import { useState, useEffect } from 'react';
import { getActiveGeminiKey } from '../services/userGeminiAuth';
import { getActiveKeyPool } from '../services/gemini/core';

const RPM_PER_KEY = 15; // Gemini standard free tier limit

class ApiQuotaStore {
  private requestTimestamps: number[] = [];
  private listeners: Set<() => void> = new Set();
  private maxCapacity: number = 15; // fallback
  private timer: any = null;

  constructor() {
    // Avoid calling recalculateCapacity() here to prevent circular dependency TDZ crash with core.ts
    // ✅ Listen for runtime key additions/removals and recalculate live
    if (typeof window !== 'undefined') {
      window.addEventListener('zen-api-keys-changed', () => {
        this.recalculateCapacity();
        this.emit();
      });
    }
  }

  private recalculateCapacity() {
    let keyCount = getActiveKeyPool().length;
    if (getActiveGeminiKey()) {
      keyCount += 1; // personal OAuth key also contributes capacity
    }
    this.maxCapacity = Math.max(1, keyCount) * RPM_PER_KEY;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public recordRequest() {
    this.recalculateCapacity();
    this.requestTimestamps.push(Date.now());
    this.pruneOldRequests();
    this.emit();

    if (!this.timer && typeof window !== 'undefined') {
      this.timer = setInterval(() => {
        const changed = this.pruneOldRequests();
        if (changed) this.emit();
        if (this.requestTimestamps.length === 0) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }, 1000);
    }
  }

  private pruneOldRequests(): boolean {
    const oneMinuteAgo = Date.now() - 60_000;
    const initialLength = this.requestTimestamps.length;
    // Keep only timestamps within the last 60 seconds
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    return this.requestTimestamps.length !== initialLength;
  }

  public getSnapshot = () => {
    this.recalculateCapacity();
    const activeRequests = this.requestTimestamps.length;
    const percentage = Math.max(0, 100 - Math.round((activeRequests / this.maxCapacity) * 100));
    return percentage;
  };

  public getKeyCount = () => {
    this.recalculateCapacity();
    return this.maxCapacity / RPM_PER_KEY;
  };

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const apiQuotaStore = new ApiQuotaStore();

// React hook for UI components
export function useApiQuota() {
  const [capacityPercent, setCapacityPercent] = useState(() => apiQuotaStore.getSnapshot());

  useEffect(() => {
    // initial fetch to be safe
    setCapacityPercent(apiQuotaStore.getSnapshot());
    
    const unsubscribe = apiQuotaStore.subscribe(() => {
      setCapacityPercent(apiQuotaStore.getSnapshot());
    });
    return unsubscribe;
  }, []);

  return capacityPercent;
}
