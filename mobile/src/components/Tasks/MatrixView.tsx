import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, SHADOW } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import AnimatedPressable from '../AnimatedPressable';
import { formatLocalDateStr } from '../../utils/dateUtils';

interface MatrixViewProps {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
}

const { width } = Dimensions.get('window');
const GRID_GAP = 12;
const CARD_WIDTH = (width - 40 - GRID_GAP) / 2; // 20 padding on each side

export default function MatrixView({ tasks, onTaskPress }: MatrixViewProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);

  const todayStr = formatLocalDateStr(new Date());
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = formatLocalDateStr(tomorrowObj);

  // Helper to determine if a date is soon
  const isUrgentDate = (date?: string) => {
    if (!date) return true; // Inbox/No date = urgent
    return date <= tomorrowStr;
  };

  const isImportant = (priority: string) => {
    return priority === 'high' || priority === 'P1';
  };

  // Q1: Urgent & Important
  const q1 = tasks.filter(t => t.status !== 'completed' && isImportant(t.priority) && isUrgentDate(t.date));
  
  // Q2: Not Urgent & Important OR Medium priority
  const q2 = tasks.filter(t => t.status !== 'completed' && ((isImportant(t.priority) && !isUrgentDate(t.date)) || priorityIs(t.priority, 'medium', 'P2')));
  
  // Q3: Urgent & Not Important
  const q3 = tasks.filter(t => t.status !== 'completed' && priorityIs(t.priority, 'low', 'P3') && isUrgentDate(t.date));
  
  // Q4: Not Urgent & Not Important
  const q4 = tasks.filter(t => t.status !== 'completed' && priorityIs(t.priority, 'low', 'P3') && !isUrgentDate(t.date));

  function priorityIs(p: string, str1: string, str2: string) {
    return p === str1 || p === str2;
  }

  const renderQuadrant = (title: string, sub: string, quadrantTasks: Task[], bgColor: string, icon: any, color: string) => (
    <View style={styles.quadrant}>
      <View style={[styles.quadrantHeader, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={16} color={color} />
        <View style={styles.quadrantTitleCol}>
          <Text style={[styles.quadrantTitle, { color }]}>{title}</Text>
          <Text style={styles.quadrantSub}>{sub}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{quadrantTasks.length}</Text>
        </View>
      </View>
      
      <ScrollView style={styles.quadrantBody} showsVerticalScrollIndicator={false}>
        {quadrantTasks.length === 0 ? (
          <Text style={styles.emptyText}>Empty</Text>
        ) : (
          quadrantTasks.map(t => (
            <AnimatedPressable
              key={t.id}
              style={[
                styles.taskItem,
                {
                  borderLeftWidth: 3.5,
                  borderLeftColor: color,
                  backgroundColor: isDark ? '#000000' : colors.surfaceRaised,
                }
              ]}
              onPress={() => onTaskPress(t)}
            >
              <Text style={styles.taskTitle} numberOfLines={2}>{t.title}</Text>
              {t.date && <Text style={styles.taskDate}>{t.date === todayStr ? 'Today' : t.date === tomorrowStr ? 'Tomorrow' : t.date}</Text>}
            </AnimatedPressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.gridRow}>
        {renderQuadrant('DO FIRST', 'Urgent, Important', q1, 'rgba(255, 105, 97, 0.1)', 'flame', '#FF6961')}
        {renderQuadrant('SCHEDULE', 'Not Urgent, Important', q2, 'rgba(165, 153, 255, 0.1)', 'calendar', '#A599FF')}
      </View>
      <View style={styles.gridRow}>
        {renderQuadrant('DELEGATE', 'Urgent, Not Important', q3, 'rgba(255, 159, 77, 0.1)', 'people', '#FF9F4D')}
        {renderQuadrant('ELIMINATE', 'Not Urgent, Not Important', q4, 'rgba(94, 218, 158, 0.1)', 'trash-bin', '#5EDA9E')}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    height: 240,
  },
  quadrant: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  quadrantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quadrantTitleCol: {
    marginLeft: 8,
    flex: 1,
  },
  quadrantTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
  },
  quadrantSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: colors.textMuted,
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  countText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: colors.textSecondary,
  },
  quadrantBody: {
    padding: 8,
    backgroundColor: colors.surface,
  },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  taskItem: {
    backgroundColor: colors.surfaceRaised,
    padding: 10,
    borderRadius: RADIUS.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  taskDate: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
  },
});
