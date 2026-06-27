export interface SavedMissionReport {
  id: string;
  timestamp: string;
  content: string;
  summary: string;
}

const STORAGE_KEY = 'zentrack_mission_reports';

class MissionReportStore {
  private reports: SavedMissionReport[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.reports = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load mission reports', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports));
    } catch (e) {
      console.error('Failed to save mission reports', e);
    }
  }

  getSnapshot = () => {
    return this.reports;
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

  addReport(content: string) {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const titleLine = lines.find(l => l.includes('Mission Title:'));
    const summaryLine = lines.find(l => l.includes('Mission Complete:'));
    
    let summary = 'Mission Report';
    if (titleLine) {
      summary = titleLine.replace(/#+ /g, '').replace(/🏷️ /g, '').replace(/Mission Title: /g, '').trim();
    } else if (summaryLine) {
      summary = summaryLine.replace(/#+ /g, '').replace(/🎯 /g, '').replace(/Mission Complete: /g, '').trim();
    } else if (lines.length > 0) {
      summary = lines[0];
    }

    // Safety fallback: ensure the title is actually short as a title should be.
    const words = summary.split(' ');
    if (words.length > 6) {
      summary = words.slice(0, 5).join(' ') + '...';
    }
    
    const newReport: SavedMissionReport = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      content,
      summary, 
    };

    this.reports = [newReport, ...this.reports];
    this.saveToStorage();
    this.emit();
  }

  clearReports() {
    this.reports = [];
    this.saveToStorage();
    this.emit();
  }
}

const store = (globalThis as any).__missionReportStore || new MissionReportStore();
(globalThis as any).__missionReportStore = store;

export const missionReportStore = store;
