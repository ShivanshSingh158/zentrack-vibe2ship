import { useMemo } from 'react';
import { getUrgencyLevel } from './useDeadlineWatcher';

interface EscalationStyles {
  border: string;
  background: string;
  accent: string;
  animation?: string;
  iconColor: string;
  label: string;
}

export const useEscalation = (dateStr: string | null): EscalationStyles => {
  return useMemo(() => {
    if (!dateStr) {
      return {
        border: 'rgba(255,255,255,0.05)',
        background: 'rgba(20,22,35,0.6)',
        accent: '#82aaff',
        iconColor: '#546e7a',
        label: 'Normal'
      };
    }

    const urgency = getUrgencyLevel(dateStr);

    switch (urgency) {
      case 'overdue':
        return {
          border: 'rgba(255, 60, 60, 0.5)',
          background: 'rgba(255, 0, 0, 0.08)',
          accent: '#ff3c3c',
          iconColor: '#ff3c3c',
          label: 'OVERDUE'
        };
      case 'critical':
        return {
          border: 'rgba(255, 60, 60, 0.3)',
          background: 'rgba(255, 60, 60, 0.05)',
          accent: '#ff5f57',
          animation: 'pulse-border 2s infinite',
          iconColor: '#ff5f57',
          label: 'CRITICAL'
        };
      case 'urgent':
        return {
          border: 'rgba(255, 165, 0, 0.3)',
          background: 'rgba(255, 165, 0, 0.04)',
          accent: '#ffa500',
          iconColor: '#ffa500',
          label: 'URGENT'
        };
      case 'upcoming':
        return {
          border: 'rgba(255, 203, 107, 0.2)',
          background: 'rgba(255, 203, 107, 0.03)',
          accent: '#ffcb6b',
          iconColor: '#ffcb6b',
          label: 'UPCOMING'
        };
      case 'normal':
      default:
        return {
          border: 'rgba(255,255,255,0.05)',
          background: 'rgba(20,22,35,0.6)',
          accent: '#82aaff',
          iconColor: '#546e7a',
          label: 'NORMAL'
        };
    }
  }, [dateStr]);
};
