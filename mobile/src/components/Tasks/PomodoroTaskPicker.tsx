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
      {/* Grouped Header Row */}
      <View style={s.linkedTaskHeaderRow}>
        <Text style={s.linkedTaskHeader}>LINKED TASK</Text>
        {calculatedTaskDurationText && (
          <View style={s.autoCalcBadge}>
            <Ionicons name="flash" size={10} color={currentAccent} style={{ marginRight: 3 }} />
            <Text style={[s.autoCalcText, { color: currentAccent }]}>
              Auto: {calculatedTaskDurationText}
            </Text>
          </View>
        )}
      </View>

      {/* Linked Task Interactive Card */}
      <Pressable
        style={[
          s.linkedTaskChip,
          linkedTask && {
            borderColor: currentAccent + '45',
            backgroundColor: currentAccent + '0D',
          },
        ]}
        onPress={() => setShowTaskPicker(p => !p)}
        accessibilityRole="button"
        accessibilityLabel={linkedTask ? `Linked to ${linkedTask.title}` : 'Link a task to auto-set timer'}
      >
        <Ionicons
          name={linkedTask ? 'checkmark-circle' : 'add-circle-outline'}
          size={18}
          color={linkedTask ? currentAccent : colors.textMuted}
        />

        <Text
          style={[
            s.linkedTaskTitle,
            linkedTask && {
              color: colors.textPrimary,
              fontFamily: 'Inter_600SemiBold',
              fontSize: 13.5,
            },
          ]}
          numberOfLines={1}
        >
          {linkedTask ? (linkedTask.title || (linkedTask as any).text) : 'Link a task to auto-set focus cadence...'}
        </Text>

        {linkedTask ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleUnlinkTask();
            }}
            hitSlop={12}
            accessibilityLabel="Unlink task"
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        )}
      </Pressable>

      {/* Task Picker Dropdown */}
      {showTaskPicker && (
        <View style={s.taskPickerList}>
          {pendingTasks.length === 0 ? (
            <View style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12.5 }}>
                No pending tasks scheduled for today.
              </Text>
            </View>
          ) : (
            pendingTasks.slice(0, 10).map((t) => {
              const itemSecs = calculateTaskDurationSeconds(t);
              const isSelected = t.id === linkedTaskId;
              const taskTitle = t.title || (t as any).text || 'Untitled Task';
              return (
                <Pressable
                  key={t.id}
                  style={[
                    s.taskPickerItem,
                    isSelected && { backgroundColor: currentAccent + '15' },
                  ]}
                  onPress={() => handleSelectTask(t.id!)}
                >
                  <View
                    style={[
                      s.taskPickerBullet,
                      isSelected && { backgroundColor: currentAccent, width: 7, height: 7, borderRadius: 3.5 },
                    ]}
                  />
                  <Text
                    style={[
                      s.taskPickerLabel,
                      isSelected && {
                        color: currentAccent,
                        fontFamily: 'Inter_600SemiBold',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {taskTitle}
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
