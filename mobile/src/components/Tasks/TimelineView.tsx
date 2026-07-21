import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Task } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

interface TimelineViewProps {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  colors: any;
}

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_HEIGHT = 80;

function parseTime(timeStr: string) {
  const parts = timeStr.trim().toLowerCase().match(/(\d+):?(\d+)?\s*(am|pm)?/);
  if (!parts) return null;
  let h = parseInt(parts[1], 10);
  const m = parts[2] ? parseInt(parts[2], 10) : 0;
  const ampm = parts[3];
  
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  
  return h + m / 60;
}

export default function TimelineView({ tasks, onTaskPress, colors }: TimelineViewProps) {
  const hours = useMemo(() => {
    const arr = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      arr.push({ hour: i, label: `${displayHour}:00 ${ampm}` });
    }
    return arr;
  }, []);

  const positionedTasks = useMemo(() => {
    return tasks.filter(t => t.timeSlot && t.status !== 'completed').map(task => {
      const startText = task.timeSlot!.split(/[-–]/)[0];
      const endText = task.timeSlot!.split(/[-–]/)[1];
      
      const startFloat = parseTime(startText);
      const endFloat = endText ? parseTime(endText) : (startFloat ? startFloat + 1 : null);
      
      if (startFloat === null || startFloat < START_HOUR || startFloat > END_HOUR) return null;
      
      const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
      const height = endFloat && endFloat > startFloat 
        ? (endFloat - startFloat) * HOUR_HEIGHT 
        : HOUR_HEIGHT * 0.75;
        
      return { task, top, height };
    }).filter(Boolean);
  }, [tasks]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Background Grid */}
      {hours.map((h, i) => (
        <View key={h.hour} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
          <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{h.label}</Text>
          <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
        </View>
      ))}
      
      {/* Absolute Positioned Tasks */}
      <View style={styles.tasksContainer}>
        {positionedTasks.map((pt, i) => {
          if (!pt) return null;
          const { task, top, height } = pt;
          return (
            <TouchableOpacity
              key={task.id}
              style={[
                styles.taskBlock,
                { 
                  top, 
                  height: height - 4, // slight margin
                  backgroundColor: task.priority === 'high' ? 'rgba(255, 105, 97, 0.15)' : 
                                   task.priority === 'medium' ? 'rgba(255, 159, 77, 0.15)' : 
                                   colors.surface,
                  borderColor: task.priority === 'high' ? '#ff6961' : 
                               task.priority === 'medium' ? '#ff9f4d' : 
                               colors.border
                }
              ]}
              onPress={() => onTaskPress(task)}
              activeOpacity={0.8}
            >
              <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {task.title}
              </Text>
              <View style={styles.taskSubtext}>
                <Ionicons name="time-outline" size={10} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.taskTime, { color: colors.textSecondary }]}>
                  {task.timeSlot}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: SPACE.sm,
  },
  content: {
    paddingBottom: 100,
    position: 'relative'
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabel: {
    width: 65,
    textAlign: 'right',
    paddingRight: SPACE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    marginTop: -7, // align text middle with the line
  },
  hourLine: {
    flex: 1,
    height: 1,
  },
  tasksContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 65,
    right: SPACE.md,
  },
  taskBlock: {
    position: 'absolute',
    left: SPACE.sm,
    right: 0,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    borderWidth: 1,
    overflow: 'hidden'
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    marginBottom: 4,
  },
  taskSubtext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTime: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  }
});
