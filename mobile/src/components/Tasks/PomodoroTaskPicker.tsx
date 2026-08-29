import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calculateTaskDurationSeconds } from './pomodoroTimeMath';

interface PomodoroTaskPickerProps {
  s: any;
  colors: any;
  currentAccent: string;
  calculatedTaskDurationText: string | null;
  linkedTask: any | null;
  linkedTaskId: string | null;
  showTaskPicker: boolean;
  setShowTaskPicker: React.Dispatch<React.SetStateAction<boolean>>;
  handleUnlinkTask: () => void;
  handleSelectTask: (taskId: string) => void;
  pendingTasks: any[];
  formatDurationLabel: (secs: number) => string;
}

export const PomodoroTaskPicker: React.FC<PomodoroTaskPickerProps> = React.memo(({
  s,
  colors,
  currentAccent,
  calculatedTaskDurationText,
  linkedTask,
  linkedTaskId,
  showTaskPicker,
  setShowTaskPicker,
  handleUnlinkTask,
  handleSelectTask,
  pendingTasks,
  formatDurationLabel,
}) => {
  return (
    <View style={s.linkedTaskCard}>
      <View style={s.linkedTaskHeaderRow}>
        <Text style={s.linkedTaskHeader}>LINKED TASK</Text>
        {calculatedTaskDurationText && (
          <View style={s.autoCalcBadge}>
            <Ionicons name="flash" size={10} color={currentAccent} style={{ marginRight: 2 }} />
            <Text style={[s.autoCalcText, { color: currentAccent }]}>
              Auto: {calculatedTaskDurationText}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        style={[s.linkedTaskChip, linkedTask && { borderColor: currentAccent + '40', backgroundColor: currentAccent + '0F' }]}
        onPress={() => setShowTaskPicker(p => !p)}
      >
        <Ionicons
          name={linkedTask ? 'checkmark-circle' : 'add-circle-outline'}
          size={16}
          color={linkedTask ? currentAccent : colors.textMuted}
        />
        <Text style={[s.linkedTaskTitle, linkedTask && { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {linkedTask ? linkedTask.title : 'Link a task to auto-set timer...'}
        </Text>
        {linkedTask ? (
          <Pressable onPress={handleUnlinkTask} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        )}
      </Pressable>

      {/* Task Picker Dropdown */}
      {showTaskPicker && (
        <View style={s.taskPickerList}>
          {pendingTasks.length === 0 ? (
            <View style={{ paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12.5 }}>
                No pending tasks for today.
              </Text>
            </View>
          ) : (
            pendingTasks.slice(0, 10).map(t => {
              const itemSecs = calculateTaskDurationSeconds(t);
              const isSelected = t.id === linkedTaskId;
              return (
                <Pressable
                  key={t.id}
                  style={[s.taskPickerItem, isSelected && { backgroundColor: currentAccent + '15' }]}
                  onPress={() => handleSelectTask(t.id!)}
                >
                  <View style={[s.taskPickerBullet, isSelected && { backgroundColor: currentAccent }]} />
                  <Text style={[s.taskPickerLabel, isSelected && { color: currentAccent, fontWeight: '600' }]} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={s.taskDurationPill}>
                    <Text style={s.taskDurationPillText}>{formatDurationLabel(itemSecs)}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
});

export default PomodoroTaskPicker;
