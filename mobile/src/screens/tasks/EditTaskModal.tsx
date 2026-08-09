/**
 * EditTaskModal.tsx — ZenTrack Tasks Module
 *
 * Bottom-sheet modal for editing an existing task. Extracted from TasksScreen.tsx
 * (was lines 623–1033). Heavy Firestore ops (delete recurring, getDocs) only run
 * when user explicitly taps delete — never on mount.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView,
  Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  collection, updateDoc, deleteDoc, doc,
  serverTimestamp, writeBatch, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { SPACE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../../components/ui/BottomSheet';
import RecurrencePickerModal from '../../components/Tasks/RecurrencePickerModal';
import UniversalCalendarModal from '../../components/UniversalCalendarModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import { handleSyncError } from '../../utils/errorUtils';
import { Task } from '../../contexts/MobileDataContext';
import { today, formatDisplayDate, formatTimeDisplay } from './taskConstants';
import { makeTasksStyles } from './tasksStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  task: Task | null;
}

const PRIORITY_DATA = [
  { val: 'low' as const, label: 'Low', color: '#5eda9e' },
  { val: 'medium' as const, label: 'Medium', color: '#ff9f4d' },
  { val: 'high' as const, label: 'High', color: '#ff6961' },
];

function EditTaskModalComponent({ visible, onClose, task }: Props) {
  const { colors } = useTheme();
  const styles = makeTasksStyles(colors);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDate, setTaskDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<any>(null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title || '');
    setPriority(
      (task.priority as any) === 'P1' ? 'high'
        : (task.priority as any) === 'P2' ? 'medium'
        : (task.priority as any) === 'P3' ? 'low'
        : (task.priority as 'low' | 'medium' | 'high') || 'medium'
    );
    setTaskDate(task.date || today);
    setRecurrenceRule(task.recurrenceRule || null);
    setSubtasks(task.subtasks || []);
    if (task.timeSlot) {
      const parts = task.timeSlot.split(/[-–]/).map((s: string) => s.trim());
      setStartTime(parts[0] || '');
      setEndTime(parts[1] || '');
    } else {
      setStartTime('');
      setEndTime('');
    }
  }, [task, visible]);

  if (!task) return null;

  const onStartChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && d) setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    } else {
      if (d) setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };
  const onEndChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && d) setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    } else {
      if (d) setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };

  const handleDelete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (task.isRecurring) {
      Alert.alert('Delete Recurring Task', 'Do you want to delete only this instance, or this and all future instances?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This instance only', style: 'destructive', onPress: async () => {
          onClose();
          try { await deleteDoc(doc(db, COLLECTION.TASKS, task.id)); } catch (e) { console.error(e); }
        }},
        { text: 'All future instances', style: 'destructive', onPress: async () => {
          onClose();
          try {
            const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', task.userId));
            const snap = await getDocs(q);
            const deleteBatch = writeBatch(db);
            snap.docs.forEach(d => {
              const data = d.data();
              const inSameGroup = task.recurringSourceId
                ? data.recurringSourceId === task.recurringSourceId
                : (data.title === task.title && data.isRecurring === true);
              if (inSameGroup && data.date && task.date && data.date >= task.date) deleteBatch.delete(d.ref);
            });
            await deleteBatch.commit();
          } catch (e) { console.error(e); }
        }},
      ]);
    } else {
      onClose();
      setTimeout(() => {
        Alert.alert('Delete Task', `"${task.title}"`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Today only', style: 'destructive', onPress: () => deleteDoc(doc(db, COLLECTION.TASKS, task.id)).catch(handleSyncError) },
          { text: 'All tasks', style: 'destructive', onPress: async () => {
            try {
              const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', task.userId));
              const snap = await getDocs(q);
              const batch = writeBatch(db);
              snap.docs.forEach(d => { if (d.data().title === task.title) batch.delete(d.ref); });
              await batch.commit();
            } catch (e) { console.error(e); }
          }},
        ]);
      }, 300);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    const updatePayload = { title: title.trim(), text: title.trim(), priority, date: taskDate, timeSlot: ts, isRecurring: !!recurrenceRule, recurrenceRule: recurrenceRule || null, subtasks };

    if (task.isRecurring || recurrenceRule) {
      Alert.alert('Edit Task', 'Apply changes to this instance only, or recreate all future instances?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This instance only', onPress: async () => {
          try { await updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload); onClose(); } catch (e) { console.error(e); }
        }},
        { text: 'All future instances', onPress: async () => {
          try {
            await updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload);
            const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', task.userId));
            const snap = await getDocs(q);
            const deleteBatch = writeBatch(db);
            snap.docs.forEach(d => {
              const data = d.data();
              if (data.title === task.title && data.isRecurring === true && data.date && task.date && data.date > task.date) deleteBatch.delete(d.ref);
            });
            await deleteBatch.commit();
            if (recurrenceRule) {
              const createBatch = writeBatch(db);
              let current = new Date(taskDate);
              if (recurrenceRule.type === 'daily' || recurrenceRule.type === 'custom') { current.setDate(current.getDate() + (recurrenceRule.interval || 1)); }
              else if (recurrenceRule.type === 'weekly') {
                if (recurrenceRule.daysOfWeek?.length > 0) { do { current.setDate(current.getDate() + 1); } while (!recurrenceRule.daysOfWeek.includes(current.getDay())); }
                else { current.setDate(current.getDate() + 7 * (recurrenceRule.interval || 1)); }
              } else if (recurrenceRule.type === 'monthly') { current.setMonth(current.getMonth() + (recurrenceRule.interval || 1)); }
              const end = recurrenceRule.endDate ? new Date(recurrenceRule.endDate) : new Date(new Date(taskDate).getTime() + 90 * 24 * 60 * 60 * 1000);
              let count = 0;
              const MAX_INSTANCES = 90;
              const sourceId = task.recurringSourceId || `rec_${Date.now()}`;
              while (current <= end && count < MAX_INSTANCES) {
                const docRef = doc(collection(db, COLLECTION.TASKS));
                createBatch.set(docRef, { ...updatePayload, userId: task.userId, date: current.toISOString().slice(0, 10), recurringSourceId: sourceId, createdAt: serverTimestamp(), status: 'pending', order: task.order || 0 });
                count++;
                if (recurrenceRule.type === 'daily' || recurrenceRule.type === 'custom') { current.setDate(current.getDate() + (recurrenceRule.interval || 1)); }
                else if (recurrenceRule.type === 'weekly') {
                  if (recurrenceRule.daysOfWeek?.length > 0) { do { current.setDate(current.getDate() + 1); } while (current <= end && !recurrenceRule.daysOfWeek.includes(current.getDay())); }
                  else { current.setDate(current.getDate() + 7 * (recurrenceRule.interval || 1)); }
                } else if (recurrenceRule.type === 'monthly') { current.setMonth(current.getMonth() + (recurrenceRule.interval || 1)); }
                else break;
              }
              await createBatch.commit();
            }
            onClose();
          } catch (e) { console.error(e); }
        }},
      ]);
    } else {
      onClose();
      updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload).catch(handleSyncError);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md, paddingHorizontal: SPACE.lg }}>
          <TextInput
            style={[styles.newTaskInputLarge, { flex: 1, marginBottom: 0, paddingHorizontal: 0, borderWidth: 0, backgroundColor: 'transparent' }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor="#636366"
          />
          <AnimatedPressable onPress={handleDelete} style={{ padding: SPACE.sm, marginLeft: 'auto' }}>
            <Ionicons name="trash-outline" size={20} color="#ff6961" />
          </AnimatedPressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autoStyle5}>
          <View style={styles.quickOptionsRow}>
            <AnimatedPressable
              style={[styles.quickChip, taskDate !== today && { backgroundColor: 'rgba(96, 165, 250, 0.12)', borderColor: '#60a5fa' }]}
              onPress={() => setShowCalendar(true)}
            >
              <Ionicons name="calendar-outline" size={13} color={taskDate !== today ? '#60a5fa' : colors.textMuted} />
              <Text style={[styles.quickChipText, taskDate !== today && { color: '#60a5fa', fontWeight: '600' }]}>
                {taskDate === today ? 'Today' : formatDisplayDate(taskDate)}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.quickChip, !!startTime && { backgroundColor: 'rgba(52, 211, 153, 0.12)', borderColor: '#34d399' }]}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="time-outline" size={13} color={startTime ? '#34d399' : colors.textMuted} />
              <Text style={[styles.quickChipText, startTime && { color: '#34d399', fontWeight: '600' }]}>
                {startTime ? formatTimeDisplay(startTime) : 'Start'}
              </Text>
            </AnimatedPressable>

            {startTime && (
              <AnimatedPressable
                style={[styles.quickChip, !!endTime && { backgroundColor: 'rgba(52, 211, 153, 0.12)', borderColor: '#34d399' }]}
                onPress={() => setShowEndPicker(true)}
              >
                <Ionicons name="arrow-forward" size={13} color={endTime ? '#34d399' : colors.textMuted} />
                <Text style={[styles.quickChipText, endTime && { color: '#34d399', fontWeight: '600' }]}>
                  {endTime ? formatTimeDisplay(endTime) : 'End'}
                </Text>
              </AnimatedPressable>
            )}

            <AnimatedPressable
              style={[styles.quickChip, !!recurrenceRule && { backgroundColor: 'rgba(192, 132, 252, 0.12)', borderColor: '#c084fc' }]}
              onPress={() => setShowRecurrenceModal(true)}
            >
              <Ionicons name={recurrenceRule ? 'repeat' : 'repeat-outline'} size={13} color={recurrenceRule ? '#c084fc' : colors.textMuted} />
              <Text style={[styles.quickChipText, recurrenceRule && { color: '#c084fc', fontWeight: '600' }]}>
                {recurrenceRule ? (recurrenceRule.type === 'custom' ? `Every ${recurrenceRule.interval}d` : recurrenceRule.type.charAt(0).toUpperCase() + recurrenceRule.type.slice(1)) : 'Repeat'}
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>

        <View style={styles.autoStyle6}>
          {PRIORITY_DATA.map(p => (
            <AnimatedPressable key={p.val} onPress={() => setPriority(p.val)} style={[styles.editPriorityPill, priority === p.val && { backgroundColor: p.color + '22', borderColor: p.color }]}>
              <View style={[styles.priorityDotSmall, { backgroundColor: p.color }]} />
              <Text style={[styles.editPriorityPillText, priority === p.val && { color: p.color }]}>{p.label}</Text>
            </AnimatedPressable>
          ))}
        </View>

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

        <UniversalCalendarModal
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          selectedDate={taskDate}
          onDateSelect={(d) => setTaskDate(d)}
          title="Pick a Date"
        />

        <AnimatedPressable style={styles.addTaskBtnFull} onPress={handleSave}>
          <Text style={styles.addTaskBtnFullText}>Save Changes</Text>
        </AnimatedPressable>
      </View>
      <RecurrencePickerModal visible={showRecurrenceModal} onClose={() => setShowRecurrenceModal(false)} initialRule={recurrenceRule} onSave={setRecurrenceRule} />
    </BottomSheet>
  );
}

export const EditTaskModal = React.memo(EditTaskModalComponent);
export default EditTaskModal;
