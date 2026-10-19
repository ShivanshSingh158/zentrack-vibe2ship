import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateShort } from '../../utils/dateUtils';

export interface ExercisePastSessionsProps {
  history: Array<{
    date: string;
    ex?: any;
  }>;
  colors: any;
  styles: any;
}

export const ExercisePastSessions: React.FC<ExercisePastSessionsProps> = React.memo(({
  history,
  colors,
  styles,
}) => {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const cleanDate = dateStr.slice(0, 10);
    return `${formatDateShort(cleanDate)} ${cleanDate.slice(0, 4)}`;
  };

  if (history.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={32} color={colors.textMuted} />
        <Text style={styles.emptyText}>No previous logs found for this exercise.</Text>
      </View>
    );
  }

  return (
    <>
      {history.map((item, index) => {
        const ex = item.ex;
        if (!ex) return null;
        const setsLog = ex.setsLog || [];
        const maxWeight = Math.max(
          0,
          ...setsLog
            .filter((s: any) => s.completed && s.weight)
            .map((s: any) => Number(s.weight) || 0)
        );
        const completedSets = setsLog.filter((s: any) => s.completed).length;

        return (
          <View key={index} style={styles.historyItem}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
              <Text style={styles.historySummary}>
                {completedSets} sets {maxWeight > 0 ? `· Max ${maxWeight}kg` : ''}
              </Text>
            </View>
            <View style={styles.setsList}>
              {setsLog.map((s: any, idx: number) => (
                <View
                  key={idx}
                  style={[
                    styles.setBubble,
                    s.completed ? styles.setBubbleCompleted : styles.setBubbleMissed,
                  ]}
                >
                  <Text style={[styles.setBubbleText, !s.completed && { opacity: 0.5 }]}>
                    {s.reps || '--'} {s.weight ? `@ ${s.weight}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
});

export default ExercisePastSessions;
