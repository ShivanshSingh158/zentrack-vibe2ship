import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Modal, KeyboardAvoidingView,
  Platform, Pressable, SectionList, ScrollView, Alert
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, FadeInUp } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { Swipeable } from 'react-native-gesture-handler';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, query, where, getDocs
} from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMobileData, Task } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import * as Haptics from 'expo-haptics';
import { awardXP } from '../services/xpSystem';
import { animateFadeInUp, triggerLayoutAnimation } from '../theme/animations';
import { useProactiveAgent } from '../hooks/useProactiveAgent';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/ui/BottomSheet';

import UniversalCalendarModal from '../components/UniversalCalendarModal';
import TaskRow from '../components/Tasks/TaskRow';
import TimelineView from '../components/Tasks/TimelineView';
import TaskTemplatesSheet from '../components/Tasks/TaskTemplatesSheet';
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import { BlurView } from 'expo-blur';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList);

const _t = new Date();
const today = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', P1: 'High', P2: 'Medium', P3: 'Low' } as const;
type Priority = 'high' | 'medium' | 'low';

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ff6961',
  medium: '#ff9f4d',
  low: '#5eda9e',
  P1: '#ff6961',
  P2: '#ff9f4d',
  P3: '#5eda9e',
};



// â”€â”€â”€ TaskCard component removed to clean up code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ New Task Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const NewTaskModal = React.memo(function NewTaskModal({ visible, onClose, userId, selectedDate, listCount }: { visible: boolean, onClose: () => void, userId: string, selectedDate: string, listCount: number }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('low');

  // Time pickers
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Recurrence
  const [recurrence, setRecurrence] = useState<'once' | 'daily'>('once');

  // Subtasks
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [showSubtasks, setShowSubtasks] = useState(false);

  // Date selection
  const [taskDate, setTaskDate] = useState(selectedDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Reset taskDate when modal opens for a new date
  useEffect(() => { setTaskDate(selectedDate); }, [selectedDate, visible]);

  const formatTimeDisplay = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const timeLabel = startTime
    ? (endTime ? `${formatTimeDisplay(startTime)} â€“ ${formatTimeDisplay(endTime)}` : formatTimeDisplay(startTime))
    : 'Time';

  const dateLabel = taskDate === today ? 'Today' : taskDate === (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() ? 'Tomorrow' : taskDate;

  const calcEstMinutes = (s: string, e: string) => {
    if (!s || !e) return 0;
    const [sH, sM] = s.split(':').map(Number);
    const [eH, eM] = e.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  const onStartTimeChange = (_: any, d?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (d) {
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      setStartTime(`${hh}:${mm}`);
    }
  };

  const onEndTimeChange = (_: any, d?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (d) {
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      setEndTime(`${hh}:${mm}`);
    }
  };

  const addSubtask = () => {
    if (!subtaskInput.trim()) return;
    setSubtasks(prev => [...prev, subtaskInput.trim()]);
    setSubtaskInput('');
  };

  const removeSubtask = (i: number) => setSubtasks(prev => prev.filter((_, idx) => idx !== i));

  const resetAndClose = () => {
    setTitle('');
    setSaving(false);
    setPriority('low');
    setStartTime('');
    setEndTime('');
    setRecurrence('once');
    setSubtasks([]);
    setSubtaskInput('');
    setShowSubtasks(false);
    setIsCalendarOpen(false);
    onClose();
  };

  const handleSave = () => {
    if (!title.trim()) return;

    // Optimistic UI update: instantly close modal and trigger haptic
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

    const ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    const est = calcEstMinutes(startTime, endTime);
    const subtaskObjects = subtasks.map((s, i) => ({ id: `st-${i}`, title: s, completed: false }));

    // Fire-and-forget network request, deferred to prevent animation frame drops
    setTimeout(() => {
      addDoc(collection(db, COLLECTION.TASKS), {
        userId,
        title: title.trim(),
        text: title.trim(),
        status: 'pending',
        priority,
        date: taskDate,
        timeSlot: ts,
        estimatedMinutes: est,
        isRecurring: recurrence === 'daily',
        subject: null,
        createdAt: serverTimestamp(),
        order: listCount,
        subtasks: subtaskObjects,
      }).catch(console.error);
    }, 150);

    resetAndClose();
  };



  return (
    <BottomSheet visible={visible} onClose={resetAndClose}>
      <View>

        {/* Task title input */}
        <TextInput
          style={styles.newTaskInputLarge}
          placeholder="Add a task..."
          placeholderTextColor="#636366"
          value={title}
          onChangeText={setTitle}
          autoFocus={visible}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        {/* Quick chips row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autoStyle1}>
          <View style={styles.quickOptionsRow}>

            {/* Date chip â†’ opens calendar */}
            <AnimatedPressable
              style={[styles.quickChip, taskDate !== today && { borderColor: '#c9c2ff' }]}
              onPress={() => setIsCalendarOpen(true)}
            >
              <Ionicons name="calendar-outline" size={13} color={taskDate !== today ? '#c9c2ff' : '#5a5a5f'} />
              <Text style={[styles.quickChipText, taskDate !== today && { color: '#c9c2ff' }]}>{dateLabel}</Text>
            </AnimatedPressable>

            {/* Time chip â†’ opens start time picker */}
            <AnimatedPressable
              style={[styles.quickChip, startTime ? { borderColor: '#c9c2ff' } : {}]}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="time-outline" size={13} color={startTime ? '#c9c2ff' : '#5a5a5f'} />
              <Text style={[styles.quickChipText, startTime ? { color: '#c9c2ff' } : {}]}>{timeLabel}</Text>
            </AnimatedPressable>

            {/* End time (only visible once start is set) */}
            {startTime !== '' && (
              <AnimatedPressable
                style={[styles.quickChip, endTime ? { borderColor: '#c9c2ff' } : {}]}
                onPress={() => setShowEndPicker(true)}
              >
                <Ionicons name="arrow-forward" size={13} color={endTime ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, endTime ? { color: '#c9c2ff' } : {}]}>
                  {endTime ? formatTimeDisplay(endTime) : 'End time'}
                </Text>
              </AnimatedPressable>
            )}

            {/* Priority chip */}
            <AnimatedPressable
              style={[styles.quickChip, priority !== 'low' ? { borderColor: priority === 'high' ? '#ff6961' : '#ff9f4d' } : {}]}
              onPress={() => setPriority(priority === 'low' ? 'medium' : priority === 'medium' ? 'high' : 'low')}
            >
              <View style={[styles.priorityDot, {
                backgroundColor: priority === 'high' ? '#ff6961' : priority === 'medium' ? '#ff9f4d' : 'transparent',
                borderWidth: priority === 'low' ? 1.5 : 0,
                borderColor: '#636366',
              }]} />
              <Text style={[styles.quickChipText, priority !== 'low' && { color: priority === 'high' ? '#ff6961' : '#ff9f4d' }]}>
                {priority === 'low' ? 'Priority' : priority === 'medium' ? 'Medium' : 'High'}
              </Text>
            </AnimatedPressable>

            {/* Subtask chip */}
            <AnimatedPressable
              style={[styles.quickChip, showSubtasks && { borderColor: '#a599ff' }]}
              onPress={() => setShowSubtasks(v => !v)}
            >
              <Ionicons name="list-outline" size={13} color={showSubtasks ? '#c9c2ff' : '#5a5a5f'} />
              <Text style={[styles.quickChipText, showSubtasks && { color: '#a599ff' }]}>
                Subtask{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
              </Text>
            </AnimatedPressable>

            {/* Once / Daily chip */}
            <AnimatedPressable
              style={[styles.quickChip, recurrence === 'daily' && { borderColor: '#a599ff' }]}
              onPress={() => setRecurrence(r => r === 'once' ? 'daily' : 'once')}
            >
              <Ionicons name={recurrence === 'daily' ? 'repeat' : 'radio-button-off-outline'} size={13} color={recurrence === 'daily' ? '#a599ff' : '#8e8e93'} />
              <Text style={[styles.quickChipText, recurrence === 'daily' && { color: '#a599ff' }]}>
                {recurrence === 'daily' ? 'Daily' : 'Once'}
              </Text>
            </AnimatedPressable>

          </View>
        </ScrollView>

        {/* Subtasks panel */}
        {showSubtasks && (
          <View style={styles.subtasksPanel}>
            {subtasks.map((st, i) => (
              <View key={i} style={styles.subtaskRow}>
                <Ionicons name="ellipse-outline" size={14} color="#636366" />
                <Text style={styles.subtaskRowText}>{st}</Text>
                <AnimatedPressable onPress={() => removeSubtask(i)} style={styles.autoStyle2}>
                  <Ionicons name="close" size={14} color="#636366" />
                </AnimatedPressable>
              </View>
            ))}
            <View style={styles.subtaskInputRow}>
              <TextInput
                style={styles.subtaskInput}
                placeholder="Add subtask..."
                placeholderTextColor="#636366"
                value={subtaskInput}
                onChangeText={setSubtaskInput}
                onSubmitEditing={addSubtask}
                returnKeyType="done"
              />
              <AnimatedPressable onPress={addSubtask} style={styles.subtaskAddBtn}>
                <Ionicons name="add" size={16} color="#a599ff" />
              </AnimatedPressable>
            </View>
          </View>
        )}

        {/* Native time pickers */}
        {showStartPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (startTime) { const [h, m] = startTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time"
            display="default"
            onChange={onStartTimeChange}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (endTime) { const [h, m] = endTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time"
            display="default"
            onChange={onEndTimeChange}
          />
        )}

        {/* Calendar modal for date */}
        <UniversalCalendarModal
          visible={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          selectedDate={taskDate}
          onDateSelect={(d) => setTaskDate(d)}
          title="Pick a Date"
        />

        {/* Add task button */}
        <AnimatedPressable
          style={[styles.addTaskBtnFull, !title.trim() && styles.addTaskBtnDisabled]}
          onPress={handleSave}
          disabled={!title.trim() || saving}
        >
          <Text style={[styles.addTaskBtnFullText, !title.trim() && styles.addTaskBtnDisabledText]}>
            {saving ? 'Adding...' : 'Add task'}
          </Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
});
// â”€â”€â”€ Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EditTaskModalComponent({ visible, onClose, task }: { visible: boolean, onClose: () => void, task: Task | null }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDate, setTaskDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);

  // Sync with task when modal opens
  useEffect(() => {
    if (!task) return;
    setTitle(task.title || '');
    setPriority((task.priority as any) === 'P1' ? 'high' : (task.priority as any) === 'P2' ? 'medium' : (task.priority as any) === 'P3' ? 'low' : (task.priority as 'low' | 'medium' | 'high') || 'medium');
    setTaskDate(task.date || today);
    setIsRecurring(task.isRecurring || false);
    setSubtasks(task.subtasks || []);
    // Parse existing timeSlot
    if (task.timeSlot) {
      const parts = task.timeSlot.split(/[-â€“]/).map((s: string) => s.trim());
      setStartTime(parts[0] || '');
      setEndTime(parts[1] || '');
    } else {
      setStartTime('');
      setEndTime('');
    }
  }, [task, visible]);

  if (!task) return null;

  const formatTimeDisplay = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const onStartChange = (_: any, d?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (d) setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
  };
  const onEndChange = (_: any, d?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (d) setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
  };

  const handleDelete = async () => {
    Alert.alert('Delete task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, COLLECTION.TASKS, task.id)).catch(console.error);
          onClose();
        }
      },
    ]);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    
    const updatePayload = {
      title: title.trim(),
      text: title.trim(),
      priority,
      date: taskDate,
      timeSlot: ts,
      isRecurring,
      subtasks,
    };

    if (task.isRecurring) {
      Alert.alert(
        'Edit Recurring Task',
        'Do you want to apply these changes to this task only, or all future instances?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'This instance only', 
            onPress: async () => {
              try {
                await updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload);
                onClose();
              } catch (e) { console.error(e); }
            } 
          },
          { 
            text: 'All future instances', 
            onPress: async () => {
              try {
                // Update this one
                await updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload);
                
                // Find all future tasks with the same title and isRecurring=true
                const q = query(
                  collection(db, COLLECTION.TASKS),
                  where('userId', '==', task.userId),
                  where('title', '==', task.title),
                  where('isRecurring', '==', true)
                );
                const snap = await getDocs(q);
                
                const batch = writeBatch(db);
                snap.docs.forEach(d => {
                  const data = d.data();
                  // Only update if the date is >= this task's original date
                  if (data.date && task.date && data.date > task.date) {
                     batch.update(d.ref, {
                       title: updatePayload.title,
                       text: updatePayload.text,
                       priority: updatePayload.priority,
                       timeSlot: updatePayload.timeSlot,
                       subtasks: updatePayload.subtasks
                     });
                  }
                });
                await batch.commit();
                onClose();
              } catch (e) { console.error(e); }
            } 
          }
        ]
      );
    } else {
      try {
        await updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload);
        onClose();
      } catch (e) { console.error(e); }
    }
  };

  const PRIORITY_DATA = [
    { val: 'low' as const, label: 'Low', color: '#5eda9e' },
    { val: 'medium' as const, label: 'Medium', color: '#ff9f4d' },
    { val: 'high' as const, label: 'High', color: '#ff6961' },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>

        {/* Title + delete */}
        <View style={styles.autoStyle13}>
          <TextInput
            style={[styles.newTaskInputLarge, { flex: 1, marginBottom: 0 }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor="#636366"
          />
          <AnimatedPressable onPress={handleDelete} style={styles.autoStyle113}>
            <Ionicons name="trash-outline" size={18} color="#ff6961" />
          </AnimatedPressable>
        </View>

        {/* Row 1: Date + Time chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autoStyle5}>
          <View style={styles.quickOptionsRow}>
            <AnimatedPressable style={styles.quickChip} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={13} color="#8e8e93" />
              <Text style={styles.quickChipText}>{taskDate === today ? 'Today' : taskDate}</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.quickChip, startTime ? { borderColor: '#c9c2ff' } : {}]} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="time-outline" size={13} color={startTime ? '#c9c2ff' : '#5a5a5f'} />
              <Text style={[styles.quickChipText, startTime ? { color: '#c9c2ff' } : {}]}>{startTime ? formatTimeDisplay(startTime) : 'Start'}</Text>
            </AnimatedPressable>
            {startTime && (
              <AnimatedPressable style={[styles.quickChip, endTime ? { borderColor: '#c9c2ff' } : {}]} onPress={() => setShowEndPicker(true)}>
                <Ionicons name="arrow-forward" size={13} color={endTime ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, endTime ? { color: '#c9c2ff' } : {}]}>{endTime ? formatTimeDisplay(endTime) : 'End'}</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable style={[styles.quickChip, isRecurring && { borderColor: '#a599ff' }]} onPress={() => setIsRecurring(v => !v)}>
              <Ionicons name={isRecurring ? 'repeat' : 'radio-button-off-outline'} size={13} color={isRecurring ? '#a599ff' : '#8e8e93'} />
              <Text style={[styles.quickChipText, isRecurring && { color: '#a599ff' }]}>{isRecurring ? 'Daily' : 'Once'}</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>

        {/* Priority pills */}
        <View style={styles.autoStyle6}>
          {PRIORITY_DATA.map(p => (
            <AnimatedPressable
              key={p.val}
              onPress={() => setPriority(p.val)}
              style={[styles.editPriorityPill, priority === p.val && { backgroundColor: p.color + '22', borderColor: p.color }]}
            >
              <View style={[styles.priorityDotSmall, { backgroundColor: p.color }]} />
              <Text style={[styles.editPriorityPillText, priority === p.val && { color: p.color }]}>{p.label}</Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <View style={styles.subtasksPanel}>
            {subtasks.map((st, i) => (
              <View key={st.id || i} style={styles.subtaskRow}>
                <AnimatedPressable onPress={() => setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s))}>
                  <Ionicons name={st.completed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={st.completed ? '#5eda9e' : '#636366'} />
                </AnimatedPressable>
                <Text style={[styles.subtaskRowText, st.completed && { textDecorationLine: 'line-through', color: '#636366' }]}>{st.title}</Text>
                <AnimatedPressable onPress={() => setSubtasks(prev => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close" size={14} color="#636366" />
                </AnimatedPressable>
              </View>
            ))}
          </View>
        )}

        {/* Time pickers */}
        {showStartPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (startTime) { const [h, m] = startTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time" display="default" onChange={onStartChange}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (endTime) { const [h, m] = endTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time" display="default" onChange={onEndChange}
          />
        )}

        {/* Calendar */}
        <UniversalCalendarModal
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          selectedDate={taskDate}
          onDateSelect={(d) => setTaskDate(d)}
          title="Pick a Date"
        />

        {/* Save */}
        <AnimatedPressable style={styles.addTaskBtnFull} onPress={handleSave}>
          <Text style={styles.addTaskBtnFullText}>Save Changes</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}
const EditTaskModal = React.memo(EditTaskModalComponent);

// â”€â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { tasks, user, optimisticUpdateTask } = useMobileData();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTemplatesSheetOpen, setIsTemplatesSheetOpen] = useState(false);

  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkRescheduleModal, setBulkRescheduleModal] = useState(false);

  // New Modals State
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [isInboxModalOpen, setIsInboxModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'priority'>('default');

  // Memoized handlers
  const handleCloseNewTask = useCallback(() => setIsNewTaskOpen(false), []);
  const handleCloseEditTask = useCallback(() => setEditingTask(null), []);
  const handleCloseCalendar = useCallback(() => setIsCalendarOpen(false), []);
  const handleCloseBulkReschedule = useCallback(() => setBulkRescheduleModal(false), []);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const navigation = useNavigation<any>();

  const animHeader = useSharedValue(0);
  const animDateStrip = useSharedValue(0);
  const animList = useSharedValue(0);

  // Proactive Intelligence
  const { conflicts } = useProactiveAgent();

  useEffect(() => {
    animHeader.value = withTiming(1, { duration: 300 });
    animDateStrip.value = withDelay(100, withTiming(1, { duration: 300 }));
    animList.value = withDelay(200, withTiming(1, { duration: 300 }));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: animHeader.value,
    transform: [{ translateY: -20 * (1 - animHeader.value) }]
  }));

  const dateStripStyle = useAnimatedStyle(() => ({
    opacity: animDateStrip.value,
    transform: [{ translateY: 20 * (1 - animDateStrip.value) }]
  }));

  const listStyle = useAnimatedStyle(() => ({
    opacity: animList.value,
    transform: [{ translateY: 40 * (1 - animList.value) }],
    flex: 1
  }));

  const todaysTasks = React.useMemo(() => {
    const list = tasks.filter(t => t.date === selectedDate || t.status === 'pending');
    return list.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [tasks, selectedDate]);

  // Data Grouping
  const overdueTasks = React.useMemo(() => tasks.filter(t => t.date && t.date < today && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)), [tasks]);
  const inboxTasks = React.useMemo(() => tasks.filter(t => !t.date && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)), [tasks]);
  const selectedDateTasks = React.useMemo(() => {
    return tasks.filter(t => t.date === selectedDate).sort((a, b) => {
      // completed tasks at the bottom
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      if (sortBy === 'priority') {
        const priorityScore = (p?: string) => p === 'high' || p === 'P1' ? 3 : (p === 'medium' || p === 'P2' ? 2 : (p === 'low' || p === 'P3' ? 1 : 0));
        const scoreA = priorityScore(a.priority);
        const scoreB = priorityScore(b.priority);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }

      return (a.order || 0) - (b.order || 0);
    });
  }, [tasks, selectedDate, sortBy]);
  
  const upcomingTasks = React.useMemo(() => {
    return tasks
      .filter(t => t.date && t.date > selectedDate && t.status !== 'completed' && (t.priority === 'high' || t.priority === 'P1'))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [tasks, selectedDate]);

  const doneCount = React.useMemo(() => selectedDateTasks.filter((t) => t.status === 'completed').length, [selectedDateTasks]);

  const taskDates = React.useMemo(() => {
    const dates = new Set<string>();
    tasks.forEach(t => {
      if (t.date && t.status !== 'completed') {
        dates.add(t.date);
      }
    });
    return dates;
  }, [tasks]);
  const estimatedTotal = selectedDateTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
  const estimatedHours = Math.round(estimatedTotal / 60 * 10) / 10;

  const completeTask = useCallback((task: Task) => {
    if (!task.id) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    // 1. Optimistic Update (Instant UI)
    optimisticUpdateTask(task.id, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }

    // 2. Background Sync
    (async () => {
      try {
        if (newStatus === 'completed') {
          await awardXP('TASK_COMPLETE');
        }
        await updateDoc(doc(db, COLLECTION.TASKS, task.id), {
          status: newStatus,
          completedAt,
        });
      } catch (error) {
        console.error('[TasksScreen] Error syncing task completion', error);
      }
    })();
  }, [optimisticUpdateTask]);

  const clearCompletedTasks = async () => {
    try {
      const completedTasks = tasks.filter(t => t.status === 'completed');
      if (completedTasks.length === 0) return;
      const batch = writeBatch(db);
      completedTasks.forEach(t => {
        batch.delete(doc(db, COLLECTION.TASKS, t.id!));
      });
      await batch.commit();
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } catch (error) {
      console.error('[TasksScreen] Error clearing completed tasks', error);
    }
  };

  const handleBulkReschedule = async (newDate: string) => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        const ref = doc(db, COLLECTION.TASKS, id);
        batch.update(ref, { date: newDate });
      });
      await batch.commit();
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
      setBulkRescheduleModal(false);
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        batch.delete(doc(db, COLLECTION.TASKS, id));
      });
      await batch.commit();
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTaskSelection = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const renderItem = useCallback(({ item }: any) => {
    return (
      <TaskRow
        task={item}
        isOverdue={false}
        onComplete={() => completeTask(item)}
        onReschedule={() => {
          setSelectedTaskIds(new Set([item.id]));
          setBulkRescheduleModal(true);
        }}
        onPress={() => setEditingTask(item)}
        onLongPress={() => { setIsBulkEdit(true); toggleTaskSelection(item.id); }}
        isBulkEdit={isBulkEdit}
        isSelected={selectedTaskIds.has(item.id)}
        onToggleSelect={() => toggleTaskSelection(item.id)}
      />
    );
  }, [completeTask, isBulkEdit, selectedTaskIds, toggleTaskSelection]);


  // Section data
  const sections = React.useMemo(() => {
    const arr = [];
    if (overdueTasks.length > 0) arr.push({ title: 'OVERDUE', data: overdueTasks });
    if (selectedDateTasks.length > 0 || isNewTaskOpen) arr.push({ title: selectedDate === today ? 'TODAY' : new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(), data: selectedDateTasks, isSelectedDate: true });
    if (upcomingTasks.length > 0) arr.push({ title: 'UPCOMING', data: upcomingTasks });
    return arr;
  }, [overdueTasks, selectedDateTasks, upcomingTasks, selectedDate, isNewTaskOpen]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: '#000000' }]}>
      {/* ─── PROACTIVE WIDGET ─── */}
      {conflicts.length > 0 && (
        <Animated.View style={[{ paddingHorizontal: SPACE.xl, marginBottom: SPACE.md, marginTop: SPACE.sm }, headerStyle]}>
          {conflicts.map(c => (
            <View key={c.id} style={styles.autoStyle8}>
              <View style={styles.autoStyle9}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={styles.autoStyle10}>Conflict Detected</Text>
              </View>
              <Text style={styles.autoStyle11}>{c.message} {c.suggestion}</Text>
            </View>
          ))}
        </Animated.View>
      )}

      {/* HEADER */}
      <View style={styles.topHeader}>
        <Text style={styles.topHeaderTitle}>{isBulkEdit ? `${selectedTaskIds.size} Selected` : 'Tasks'}</Text>
        <View style={styles.topHeaderIcons}>
          {isBulkEdit ? (
            <AnimatedPressable style={styles.iconBtn} onPress={() => { setIsBulkEdit(false); setSelectedTaskIds(new Set()); }}>
              <Text style={{ color: '#A599FF', fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Cancel</Text>
            </AnimatedPressable>
          ) : (
            <>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsInboxModalOpen(true)}>
                <Ionicons name="file-tray-outline" size={20} color="#FFFFFF" />
                {inboxTasks.length > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{inboxTasks.length}</Text></View>
                )}
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setViewMode(v => v === 'list' ? 'timeline' : 'list')}>
                <Ionicons name={viewMode === 'list' ? 'time-outline' : 'list'} size={20} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsNewTaskOpen(true)}>
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsTemplatesSheetOpen(true)}>
                <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* OVERDUE BANNER */}
      {overdueTasks.length > 0 && (
        <AnimatedPressable style={styles.overdueBanner} onPress={() => setIsOverdueModalOpen(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="warning" size={16} color="#FF6961" style={{ marginRight: 8 }} />
            <Text style={styles.overdueText}>{overdueTasks.length} overdue tasks</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#FF6961" />
        </AnimatedPressable>
      )}

      {/* Date Selector */}
      <Animated.View style={[styles.dateSelectorContainer, dateStripStyle]}>
        <TaskDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          taskDates={taskDates}
        />
      </Animated.View>

      {/* Calendar Modal */}
      <UniversalCalendarModal
        visible={isCalendarOpen || bulkRescheduleModal}
        onClose={() => {
          if (bulkRescheduleModal) handleCloseBulkReschedule();
          else handleCloseCalendar();
        }}
        selectedDate={selectedDate}
        onDateSelect={(d) => {
          if (bulkRescheduleModal) {
            handleBulkReschedule(d);
          } else {
            setSelectedDate(d);
          }
        }}
        title={bulkRescheduleModal ? 'Select new date' : 'Jump to date'}
      />

      <EditTaskModal visible={!!editingTask} onClose={handleCloseEditTask} task={editingTask} />
      {user && <NewTaskModal visible={isNewTaskOpen} onClose={handleCloseNewTask} userId={user.uid} selectedDate={selectedDate} listCount={selectedDateTasks.length} />}

      {/* TIMELINE VIEW */}
      {viewMode === 'timeline' ? (
        <Animated.View style={[{ flex: 1 }, listStyle]}>
          <TimelineView 
            tasks={selectedDateTasks} 
            onTaskPress={(t) => setEditingTask(t)} 
            colors={colors} 
          />
        </Animated.View>
      ) : (
      <AnimatedSectionList
        style={listStyle}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        sections={[{ title: selectedDate === today ? `Today${selectedDateTasks.length > 0 ? ` ${selectedDateTasks.length}` : ''}` : `${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${selectedDateTasks.length > 0 ? ` ${selectedDateTasks.length}` : ''}`, data: selectedDateTasks } as any]}
        keyExtractor={(item: any) => item.id}
        removeClippedSubviews={true}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={'#8E8E93'} />
            <Text style={styles.emptyText}>Nothing here yet</Text>
          </View>
        }
        renderSectionHeader={({ section: { title } }: any) => (
          <View style={styles.listSectionHeader}>
            <Text style={styles.listSectionTitle}>
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }: any) => (
          <TaskRow
            task={item}
            isOverdue={item.date ? item.date < today : false}
            onComplete={() => completeTask(item)}
            onReschedule={() => {
              setSelectedTaskIds(new Set([item.id]));
              setBulkRescheduleModal(true);
            }}
            onPress={() => setEditingTask(item)}
            onLongPress={() => {
              setEditingTask(item);
            }}
          />
        )}
      />
      )}

      {/* FLOATING ADD TASK PILL */}
      <View style={styles.floatingAddContainer}>
        <AnimatedPressable style={styles.floatingAddBtn} onPress={() => setIsNewTaskOpen(true)}>
          <Ionicons name="add" size={18} color="#000000" style={{ marginRight: 4 }} />
          <Text style={styles.floatingAddText}>Add task</Text>
        </AnimatedPressable>
      </View>

      {/* OVERDUE MODAL */}
      <BottomSheet visible={isOverdueModalOpen} onClose={() => setIsOverdueModalOpen(false)}>
        <View style={{ flexShrink: 1, maxHeight: 600 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 }}>
            <Ionicons name="warning" size={24} color="#FF6961" style={{ marginRight: 12 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF' }}>Overdue Tasks</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {overdueTasks.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                isOverdue={true}
                onComplete={() => completeTask(t)}
                onReschedule={() => {
                  setIsOverdueModalOpen(false);
                  setSelectedTaskIds(new Set([t.id!]));
                  setBulkRescheduleModal(true);
                }}
                onPress={() => { setIsOverdueModalOpen(false); setEditingTask(t); }}
                onLongPress={() => { setIsOverdueModalOpen(false); setEditingTask(t); }}
              />
            ))}
          </ScrollView>
        </View>
      </BottomSheet>

      {/* INBOX MODAL */}
      <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)}>
        <View style={{ flexShrink: 1, maxHeight: 600 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 }}>
            <Ionicons name="file-tray" size={24} color="#A599FF" style={{ marginRight: 12 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF' }}>Inbox</Text>
          </View>
          {inboxTasks.length === 0 ? (
            <Text style={{ color: '#8E8E93', fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 20, paddingBottom: 40 }}>No tasks in your inbox.</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {inboxTasks.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  isOverdue={false}
                  onComplete={() => completeTask(t)}
                  onReschedule={() => {
                    setIsInboxModalOpen(false);
                    setSelectedTaskIds(new Set([t.id!]));
                    setBulkRescheduleModal(true);
                  }}
                  onPress={() => { setIsInboxModalOpen(false); setEditingTask(t); }}
                  onLongPress={() => { setIsInboxModalOpen(false); setEditingTask(t); }}
                  isBulkEdit={isBulkEdit}
                  isSelected={selectedTaskIds.has(t.id!)}
                  onToggleSelect={() => toggleTaskSelection(t.id!)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </BottomSheet>

      {/* OVERFLOW MENU MODAL */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setIsMenuOpen(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setSortBy('priority'); setIsMenuOpen(false); }}>
              <Ionicons name="filter" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Sort by Priority</Text>
              {sortBy === 'priority' && <Ionicons name="checkmark" size={16} color="#A599FF" style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsBulkEdit(true); setIsMenuOpen(false); }}>
              <Ionicons name="checkbox-outline" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Select Multiple</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { clearCompletedTasks(); setIsMenuOpen(false); }}>
              <Ionicons name="trash-bin-outline" size={18} color="#FF6961" style={{ marginRight: 12 }} />
              <Text style={[styles.menuItemText, { color: '#FF6961' }]}>Clear Completed</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* BULK ACTION BAR */}
      {isBulkEdit && (
        <Animated.View entering={FadeInUp} style={styles.bulkActionBar}>
          <TouchableOpacity 
            style={[styles.bulkActionBtn, { opacity: selectedTaskIds.size === 0 ? 0.5 : 1 }]} 
            disabled={selectedTaskIds.size === 0}
            onPress={async () => {
              if (selectedTaskIds.size === 0) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const batch = writeBatch(db);
              selectedTaskIds.forEach(id => {
                const ref = doc(db, COLLECTION.TASKS, id);
                batch.update(ref, { status: 'completed', completedAt: serverTimestamp() });
              });
              try {
                await batch.commit();
                setIsBulkEdit(false);
                setSelectedTaskIds(new Set());
              } catch (e) {
                console.error('Bulk complete failed', e);
              }
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={24} color="#A599FF" />
            <Text style={styles.bulkActionText}>Complete</Text>
          </TouchableOpacity>
          <View style={styles.bulkActionDivider} />
          <TouchableOpacity 
            style={[styles.bulkActionBtn, { opacity: selectedTaskIds.size === 0 ? 0.5 : 1 }]}
            disabled={selectedTaskIds.size === 0}
            onPress={() => {
              if (selectedTaskIds.size === 0) return;
              Alert.alert('Delete Tasks', `Are you sure you want to delete ${selectedTaskIds.size} tasks?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  const batch = writeBatch(db);
                  selectedTaskIds.forEach(id => {
                    const ref = doc(db, COLLECTION.TASKS, id);
                    batch.delete(ref);
                  });
                  await batch.commit();
                  setIsBulkEdit(false);
                  setSelectedTaskIds(new Set());
                }}
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={24} color="#FF6961" />
            <Text style={[styles.bulkActionText, { color: '#FF6961' }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      <TaskTemplatesSheet 
        visible={isTemplatesSheetOpen} 
        onClose={() => setIsTemplatesSheetOpen(false)} 
        userId={user?.uid!} 
        onApplyTemplate={(template) => {
          addDoc(collection(db, COLLECTION.TASKS), {
            userId: user?.uid!,
            title: template.title,
            text: template.title,
            status: 'pending',
            priority: template.priority || 'medium',
            date: selectedDate,
            timeSlot: template.timeSlot || null,
            estimatedMinutes: template.estimatedMinutes || null,
            isRecurring: template.isRecurring || false,
            recurringDays: template.recurringDays || null,
            subject: null,
            createdAt: serverTimestamp(),
            order: tasks.length,
            subtasks: template.subtasks || [],
          });
        }}
      />
    </SafeAreaView>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  captureBar: {
    backgroundColor: '#141416',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  captureText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13.5, color: '#5a5a5f', marginHorizontal: 12 },

  // Date Selector
  jumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  jumpBtnText: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '500',
  },
  dateSelectorContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateItem: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    width: 44,
  },
  dateItemActive: {
    backgroundColor: '#a599ff',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderRadius: RADIUS.full,
    padding: 2,
  },
  viewToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  viewToggleBtnActive: {
    backgroundColor: '#3a3a3c',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listSectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginTop: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#1c1c1e',
    marginTop: 10,
    borderRadius: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#a599ff',
    borderRadius: 2,
  },
  dateItemToday: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  dateMonthActive: { color: '#000000', fontWeight: '600' },
  dateMonth: {
    fontSize: 10,
    fontWeight: '400',
    color: '#5a5a5f',
    marginBottom: 2,
  },
  dateNum: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8e8e93',
  },
  dateNumActive: { color: '#000000', fontWeight: '700' },
  dateDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentPrimary,
    marginLeft: 4,
  },
  dateDay: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.sm,
  },
  emptyTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.lg, color: colors.textPrimary, marginTop: SPACE.lg },
  emptySub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginTop: SPACE.xs, textAlign: 'center' },

  subtaskPrepopulated: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 8,
  },
  subtaskPrepopulatedText: {
    fontFamily: FONT_FAMILY.body, fontSize: 11,
    color: colors.textSecondary, textDecorationLine: 'line-through'
  },

  xpPopup: {
    position: 'absolute', right: 20, top: -10,
    backgroundColor: colors.accentGreen,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: RADIUS.full,
    ...SHADOW.md,
  },
  xpPopupText: {
    fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.background
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5a5a5f',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#1c1c1e',
    marginTop: 18,
    marginBottom: 24,
  },
  bulkEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bulkActionBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1c1c1e',
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: '#2c2c2e'
  },
  bulkActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  bulkActionText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: '#A599FF'
  },
  bulkActionDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#2c2c2e'
  },
  bulkEditText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.textPrimary,
  },
  list: { paddingHorizontal: 0, paddingTop: SPACE.xl, paddingBottom: 120, gap: 0 },

  // New Task Form
  newTaskCard: {
    backgroundColor: 'rgba(203, 166, 247, 0.05)',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(203, 166, 247, 0.2)',
    padding: SPACE.lg,
    marginBottom: SPACE.xl,
    marginTop: SPACE.sm,
  },
  newTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  newTaskIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(203, 166, 247, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTaskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  newTaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  newTaskInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  optionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 14,
  },
  optionsBtnText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textMuted,
  },
  addTaskBtn: {
    backgroundColor: 'rgba(203, 166, 247, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(203, 166, 247, 0.3)',
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.xl,
  },
  addTaskBtnText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: '#cba6f7',
  },

  // Options Panel
  optionsPanel: {
    backgroundColor: '#121014',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginTop: SPACE.md,
    gap: SPACE.md,
  },
  optRow: { flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityPillText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted },

  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeInput: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textPrimary, minWidth: 40, textAlign: 'center' },
  estTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  estInput: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textPrimary, minWidth: 40 },
  recurPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recurPillText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.accentPrimary,
    backgroundColor: 'rgba(203, 166, 247, 0.05)',
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.md,
    gap: SPACE.sm,
  },
  dragHandle: {
    width: 12,
    height: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.3,
  },
  dragDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },
  customCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCheckboxDone: {
    backgroundColor: colors.textMuted,
    borderColor: colors.textMuted,
  },
  bulkCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckboxSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  taskMeta: { flex: 1, gap: 4 },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  taskDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  taskFooter: { flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  pillText: { fontFamily: FONT_FAMILY.body, fontSize: 11 },

  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  empty: { alignItems: 'center', paddingVertical: 40, gap: SPACE.md },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#3a3a3c', textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACE.xl,
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    backgroundColor: '#0d0d0f',
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: 24,
    paddingBottom: 48,
    ...SHADOW.lg,
  },
  modalCard: {
    backgroundColor: colors.background, // Pure opaque black
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: colors.borderHover, // Slightly brighter border so it pops out
    padding: SPACE.xxl,
    gap: SPACE.md,
    ...SHADOW.accent(), // Adds a glow to further isolate it from the background
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
    marginBottom: SPACE.sm,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: colors.textMuted },
  saveBtn: {
    flex: 2,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#1a110a' },

  // Bulk Edit Bar
  rescheduleBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  rescheduleBtnText: {
    color: '#1a110a',
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
  },

  // â”€â”€ New Task Modal (Exact Spec) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  newTaskInputLarge: {
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '400',
    color: '#f2f2f7',
    marginBottom: 20,
  },
  quickOptionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 0,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: '#1c1c1e',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#5a5a5f',
  },
  addTaskBtnFull: {
    backgroundColor: '#a599ff',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addTaskBtnDisabled: {
    backgroundColor: '#2c2c2e',
  },
  addTaskBtnFullText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  addTaskBtnDisabledText: {
    color: '#5a5a5f',
  },

  // â”€â”€ Subtasks panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  subtasksPanel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtaskRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#f2f2f7',
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    paddingTop: 8,
  },
  subtaskInput: {
    flex: 1,
    fontSize: 13,
    color: '#f2f2f7',
    paddingVertical: 4,
  },
  subtaskAddBtn: {
    padding: 4,
  },

  // â”€â”€ Edit modal priority pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  editPriorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2c2c2e',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  editPriorityPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8e8e93',
  },

  // Extracted styles
  autoStyle1: { flexGrow: 0, marginBottom: 14 },
  autoStyle2: { padding: 4 },
  autoStyle116: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // --- NEW STYLES FOR LIGHT THEME REDESIGN ---
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#000000',
  },
  topHeaderTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: '#FFFFFF',
  },
  topHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141416',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#A599FF',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#000000',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  overdueBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 105, 97, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  overdueText: {
    color: '#FF6961',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  floatingAddContainer: {
    position: 'absolute',
    bottom: 110, // Increased to clear the bottom nav bar
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)', // Slightly lighter overlay for cleaner look
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 65, // Positioned exactly below the 3-dot button
    paddingRight: 20,
  },
  menuContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12, // slightly tighter border radius for smaller box
    width: 200, // smaller width
    paddingVertical: 4, // tighter vertical padding
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: '#FFFFFF',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginHorizontal: 16,
  },
  floatingAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A599FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#A599FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  floatingAddText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#000000',
  },
  autoStyle113: { padding: 8 },
  listContent: { paddingBottom: 140 },
  autoStyle5: { flexGrow: 0, marginBottom: 12 },
  autoStyle6: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  priorityDotSmall: { width: 6, height: 6, borderRadius: 3 },
  autoStyle8: { backgroundColor: '#fee2e2', padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: '#fca5a5' },
  autoStyle9: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  autoStyle10: { fontFamily: FONT_FAMILY.bold, color: '#b91c1c', fontSize: FONT_SIZE.sm },
  autoStyle11: { fontFamily: FONT_FAMILY.body, color: '#991b1b', fontSize: FONT_SIZE.xs },
  autoStyle12: { paddingHorizontal: 24, marginTop: 12 },
  autoStyle13: { paddingHorizontal: 24 },
});

