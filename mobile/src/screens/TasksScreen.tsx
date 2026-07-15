import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, TextInput, Modal, KeyboardAvoidingView,
  Platform, Pressable, ScrollView, Alert
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { Swipeable } from 'react-native-gesture-handler';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMobileData, Task } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import * as Haptics from 'expo-haptics';
import { awardXP } from '../services/xpSystem';
import { animateFadeInUp, triggerLayoutAnimation } from '../theme/animations';
import { useProactiveAgent } from '../hooks/useProactiveAgent';


import UniversalCalendarModal from '../components/UniversalCalendarModal';
import TaskRow from '../components/Tasks/TaskRow';
import { BlurView } from 'expo-blur';

const today = new Date().toISOString().slice(0, 10);
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', P1: 'High', P2: 'Medium', P3: 'Low' } as const;
type Priority = 'high' | 'medium' | 'low';

const PRIORITY_COLORS: Record<string, string> = {
  high:   '#ff6961',
  medium: '#ff9f4d',
  low:    '#5eda9e',
  P1: '#ff6961',
  P2: '#ff9f4d',
  P3: '#5eda9e',
};

const generateDates = (baseDateStr: string = today) => {
  const dates = [];
  const base = new Date(baseDateStr + 'T00:00:00');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Show 5 days: 2 before selected, selected, 2 after
  for (let i = -2; i <= 2; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    dates.push({
      dateStr,
      month: months[d.getMonth()],
      dateNum: d.getDate().toString(),
      day: days[d.getDay()],
      active: i === 0,
      isToday: dateStr === today
    });
  }
  return dates;
};

// ─── TaskCard component removed to clean up code ──────────────────────────────

// ─── New Task Modal ─────────────────────────────────────────────────────────────

export function NewTaskModal({ visible, onClose, userId, selectedDate, listCount }: { visible: boolean, onClose: () => void, userId: string, selectedDate: string, listCount: number }) {
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
    ? (endTime ? `${formatTimeDisplay(startTime)} – ${formatTimeDisplay(endTime)}` : formatTimeDisplay(startTime))
    : 'Time';

  const dateLabel = taskDate === today ? 'Today' : taskDate === (() => { const d = new Date(today); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })() ? 'Tomorrow' : taskDate;

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
      addDoc(collection(db, 'todos'), {
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayBottom}>
        
          <Pressable style={StyleSheet.absoluteFill} onPress={resetAndClose} />
        <View style={styles.bottomSheetCard}>

          {/* Drag handle */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' }} />
          </View>

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }}>
            <View style={styles.quickOptionsRow}>

              {/* Date chip → opens calendar */}
              <TouchableOpacity
                style={[styles.quickChip, taskDate !== today && { borderColor: '#c9c2ff' }]}
                onPress={() => setIsCalendarOpen(true)}
              >
                <Ionicons name="calendar-outline" size={13} color={taskDate !== today ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, taskDate !== today && { color: '#c9c2ff' }]}>{dateLabel}</Text>
              </TouchableOpacity>

              {/* Time chip → opens start time picker */}
              <TouchableOpacity
                style={[styles.quickChip, startTime ? { borderColor: '#c9c2ff' } : {}]}
                onPress={() => setShowStartPicker(true)}
              >
                <Ionicons name="time-outline" size={13} color={startTime ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, startTime ? { color: '#c9c2ff' } : {}]}>{timeLabel}</Text>
              </TouchableOpacity>

              {/* End time (only visible once start is set) */}
              {startTime !== '' && (
                <TouchableOpacity
                  style={[styles.quickChip, endTime ? { borderColor: '#c9c2ff' } : {}]}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Ionicons name="arrow-forward" size={13} color={endTime ? '#c9c2ff' : '#5a5a5f'} />
                  <Text style={[styles.quickChipText, endTime ? { color: '#c9c2ff' } : {}]}>
                    {endTime ? formatTimeDisplay(endTime) : 'End time'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Priority chip */}
              <TouchableOpacity
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
              </TouchableOpacity>

              {/* Subtask chip */}
              <TouchableOpacity
                style={[styles.quickChip, showSubtasks && { borderColor: '#a599ff' }]}
                onPress={() => setShowSubtasks(v => !v)}
              >
                <Ionicons name="list-outline" size={13} color={showSubtasks ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, showSubtasks && { color: '#a599ff' }]}>
                  Subtask{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
                </Text>
              </TouchableOpacity>

              {/* Once / Daily chip */}
              <TouchableOpacity
                style={[styles.quickChip, recurrence === 'daily' && { borderColor: '#a599ff' }]}
                onPress={() => setRecurrence(r => r === 'once' ? 'daily' : 'once')}
              >
                <Ionicons name={recurrence === 'daily' ? 'repeat' : 'radio-button-off-outline'} size={13} color={recurrence === 'daily' ? '#a599ff' : '#8e8e93'} />
                <Text style={[styles.quickChipText, recurrence === 'daily' && { color: '#a599ff' }]}>
                  {recurrence === 'daily' ? 'Daily' : 'Once'}
                </Text>
              </TouchableOpacity>

            </View>
          </ScrollView>

          {/* Subtasks panel */}
          {showSubtasks && (
            <View style={styles.subtasksPanel}>
              {subtasks.map((st, i) => (
                <View key={i} style={styles.subtaskRow}>
                  <Ionicons name="ellipse-outline" size={14} color="#636366" />
                  <Text style={styles.subtaskRowText}>{st}</Text>
                  <TouchableOpacity onPress={() => removeSubtask(i)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={14} color="#636366" />
                  </TouchableOpacity>
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
                <TouchableOpacity onPress={addSubtask} style={styles.subtaskAddBtn}>
                  <Ionicons name="add" size={16} color="#a599ff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Native time pickers */}
          {showStartPicker && (
            <DateTimePicker
              value={(() => { const d = new Date(); if (startTime) { const [h,m] = startTime.split(':'); d.setHours(+h, +m); } return d; })()}
              mode="time"
              display="default"
              onChange={onStartTimeChange}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={(() => { const d = new Date(); if (endTime) { const [h,m] = endTime.split(':'); d.setHours(+h, +m); } return d; })()}
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
          <TouchableOpacity
            style={[styles.addTaskBtnFull, !title.trim() && styles.addTaskBtnDisabled]}
            onPress={handleSave}
            disabled={!title.trim() || saving}
          >
            <Text style={[styles.addTaskBtnFullText, !title.trim() && styles.addTaskBtnDisabledText]}>
              {saving ? 'Adding...' : 'Add task'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditTaskModal({ visible, onClose, task }: { visible: boolean, onClose: () => void, task: Task | null }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDate, setTaskDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [subtasks, setSubtasks] = useState<{id: string; title: string; completed: boolean}[]>([]);

  // Sync with task when modal opens
  useEffect(() => {
    if (!task) return;
    setTitle(task.title || '');
    setPriority((task.priority as any) === 'P1' ? 'high' : (task.priority as any) === 'P2' ? 'medium' : (task.priority as any) === 'P3' ? 'low' : (task.priority as 'low'|'medium'|'high') || 'medium');
    setTaskDate(task.date || today);
    setIsRecurring(task.isRecurring || false);
    setSubtasks(task.subtasks || []);
    // Parse existing timeSlot
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

  const formatTimeDisplay = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2,'0')}${ampm}`;
  };

  const onStartChange = (_: any, d?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (d) setStartTime(`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`);
  };
  const onEndChange = (_: any, d?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (d) setEndTime(`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`);
  };

  const handleDelete = async () => {
    Alert.alert('Delete task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'todos', task.id)).catch(console.error);
        onClose();
      }},
    ]);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    try {
      await updateDoc(doc(db, 'todos', task.id), {
        title: title.trim(),
        text: title.trim(),
        priority,
        date: taskDate,
        timeSlot: ts,
        isRecurring,
        subtasks,
      });
      onClose();
    } catch (e) { console.error(e); }
  };

  const PRIORITY_DATA = [
    { val: 'low' as const, label: 'Low', color: '#5eda9e' },
    { val: 'medium' as const, label: 'Medium', color: '#ff9f4d' },
    { val: 'high' as const, label: 'High', color: '#ff6961' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayBottom}>
        
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.bottomSheetCard, { paddingBottom: 32 }]}>
          {/* Handle */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' }} />
          </View>

          {/* Title + delete */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <TextInput
              style={[styles.newTaskInputLarge, { flex: 1, marginBottom: 0 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor="#636366"
            />
            <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#ff6961" />
            </TouchableOpacity>
          </View>

          {/* Row 1: Date + Time chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
            <View style={styles.quickOptionsRow}>
              <TouchableOpacity style={styles.quickChip} onPress={() => setShowCalendar(true)}>
                <Ionicons name="calendar-outline" size={13} color="#8e8e93" />
                <Text style={styles.quickChipText}>{taskDate === today ? 'Today' : taskDate}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickChip, startTime ? { borderColor: '#c9c2ff' } : {}]} onPress={() => setShowStartPicker(true)}>
                <Ionicons name="time-outline" size={13} color={startTime ? '#c9c2ff' : '#5a5a5f'} />
                <Text style={[styles.quickChipText, startTime ? { color: '#c9c2ff' } : {}]}>{startTime ? formatTimeDisplay(startTime) : 'Start'}</Text>
              </TouchableOpacity>
              {startTime && (
                <TouchableOpacity style={[styles.quickChip, endTime ? { borderColor: '#c9c2ff' } : {}]} onPress={() => setShowEndPicker(true)}>
                  <Ionicons name="arrow-forward" size={13} color={endTime ? '#c9c2ff' : '#5a5a5f'} />
                  <Text style={[styles.quickChipText, endTime ? { color: '#c9c2ff' } : {}]}>{endTime ? formatTimeDisplay(endTime) : 'End'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.quickChip, isRecurring && { borderColor: '#a599ff' }]} onPress={() => setIsRecurring(v => !v)}>
                <Ionicons name={isRecurring ? 'repeat' : 'radio-button-off-outline'} size={13} color={isRecurring ? '#a599ff' : '#8e8e93'} />
                <Text style={[styles.quickChipText, isRecurring && { color: '#a599ff' }]}>{isRecurring ? 'Daily' : 'Once'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Priority pills */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {PRIORITY_DATA.map(p => (
              <TouchableOpacity
                key={p.val}
                onPress={() => setPriority(p.val)}
                style={[styles.editPriorityPill, priority === p.val && { backgroundColor: p.color + '22', borderColor: p.color }]}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.color }} />
                <Text style={[styles.editPriorityPillText, priority === p.val && { color: p.color }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <View style={styles.subtasksPanel}>
              {subtasks.map((st, i) => (
                <View key={st.id || i} style={styles.subtaskRow}>
                  <TouchableOpacity onPress={() => setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s))}>
                    <Ionicons name={st.completed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={st.completed ? '#5eda9e' : '#636366'} />
                  </TouchableOpacity>
                  <Text style={[styles.subtaskRowText, st.completed && { textDecorationLine: 'line-through', color: '#636366' }]}>{st.title}</Text>
                  <TouchableOpacity onPress={() => setSubtasks(prev => prev.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close" size={14} color="#636366" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Time pickers */}
          {showStartPicker && (
            <DateTimePicker
              value={(() => { const d = new Date(); if (startTime) { const [h,m]=startTime.split(':'); d.setHours(+h,+m); } return d; })()}
              mode="time" display="default" onChange={onStartChange}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={(() => { const d = new Date(); if (endTime) { const [h,m]=endTime.split(':'); d.setHours(+h,+m); } return d; })()}
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
          <TouchableOpacity style={styles.addTaskBtnFull} onPress={handleSave}>
            <Text style={styles.addTaskBtnFullText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const { tasks, user } = useMobileData();
  const [selectedDate, setSelectedDate] = useState(today);
  const [dates, setDates] = useState(generateDates(selectedDate));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkRescheduleModal, setBulkRescheduleModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const navigation = useNavigation<any>();

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;

  // Proactive Intelligence
  const { conflicts } = useProactiveAgent();

  useEffect(() => {
    animateFadeInUp(headerFade, headerSlide, 0).start();
  }, []);

  useEffect(() => {
    setDates(generateDates(selectedDate));
  }, [selectedDate]);

  const todaysTasks = tasks.filter(t => t.date === selectedDate || t.status === 'pending');
  todaysTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

  // Data Grouping
  const overdueTasks = tasks.filter(t => t.date && t.date < today && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0));
  const selectedDateTasks = tasks.filter(t => t.date === selectedDate).sort((a, b) => {
    // completed tasks at the bottom
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return (a.order || 0) - (b.order || 0);
  });
  // UPCOMING: only show HIGH priority tasks to avoid noise
  const upcomingTasks = tasks
    .filter(t => t.date && t.date > selectedDate && t.status !== 'completed' && (t.priority === 'high' || t.priority === 'P1'))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const doneCount = selectedDateTasks.filter((t) => t.status === 'completed').length;
  const estimatedTotal = selectedDateTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
  const estimatedHours = Math.round(estimatedTotal / 60 * 10) / 10;

  const completeTask = async (task: Task) => {
    if (!task.id) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    
    if (newStatus === 'completed') {
      await awardXP('TASK_COMPLETE');
    }
    await updateDoc(doc(db, 'todos', task.id), {
      status: newStatus,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
    }).catch(console.error);
  };

  const handleBulkReschedule = async (newDate: string) => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        const ref = doc(db, 'todos', id);
        batch.update(ref, { date: newDate });
      });
      await batch.commit();
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
      setBulkRescheduleModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  // Section data
  const sections = [];
  if (overdueTasks.length > 0) sections.push({ title: 'OVERDUE', data: overdueTasks });
  if (selectedDateTasks.length > 0 || isNewTaskOpen) sections.push({ title: selectedDate === today ? 'TODAY' : new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(), data: selectedDateTasks, isSelectedDate: true });
  if (upcomingTasks.length > 0) sections.push({ title: 'UPCOMING', data: upcomingTasks });

  return (
    <SafeAreaView style={styles.root}>
      {/* ─── PROACTIVE WIDGET ─── */}
      <View style={{ paddingHorizontal: SPACE.xl, marginBottom: SPACE.md, marginTop: SPACE.sm }}>
        {conflicts.map(c => (
          <View key={c.id} style={{ backgroundColor: '#fee2e2', padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: '#fca5a5' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="warning" size={16} color="#ef4444" />
              <Text style={{ fontFamily: FONT_FAMILY.bold, color: '#b91c1c', fontSize: FONT_SIZE.sm }}>Conflict Detected</Text>
            </View>
            <Text style={{ fontFamily: FONT_FAMILY.body, color: '#991b1b', fontSize: FONT_SIZE.xs }}>{c.message} {c.suggestion}</Text>
          </View>
        ))}
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelectorContainer}>
        <View style={styles.dateRow}>
          {dates.map((d, i) => {
            const isActive = d.active;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.dateItem, isActive && styles.dateItemActive]}
                onPress={() => setSelectedDate(d.dateStr)}
              >
                <Text style={[styles.dateMonth, isActive && styles.dateMonthActive]}>
                  {d.month}
                </Text>
                <Text style={[styles.dateNum, isActive && styles.dateNumActive]}>
                  {d.dateNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        
      </View>

      {/* Calendar Modal */}
      <UniversalCalendarModal
        visible={isCalendarOpen || bulkRescheduleModal}
        onClose={() => {
          setIsCalendarOpen(false);
          setBulkRescheduleModal(false);
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

      <EditTaskModal visible={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} />
      {user && <NewTaskModal visible={isNewTaskOpen} onClose={() => setIsNewTaskOpen(false)} userId={user.uid} selectedDate={selectedDate} listCount={selectedDateTasks.length} />}

      
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Date Jump */}
        <View style={{ paddingHorizontal: 24, marginTop: 12 }}>
          <TouchableOpacity style={styles.jumpBtn} onPress={() => setIsCalendarOpen(true)}>
            <Ionicons name="calendar-outline" size={14} color="#3a3a3c" />
            <Text style={styles.jumpBtnText}>Jump to date</Text>
          </TouchableOpacity>
        </View>

        {/* Main Header */}
        <View style={{ paddingHorizontal: 24 }}>
          <Text style={styles.sectionTitle}>{selectedDate === today ? "Today's tasks" : "Tasks"}</Text>
          <Text style={styles.sectionSub}>{doneCount} of {selectedDateTasks.length} done</Text>
          <View style={styles.sectionDivider} />
          
          {/* Capture Bar */}
          <TouchableOpacity 
            style={{
              backgroundColor: '#141416',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#2c2c2e',
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginBottom: 20,
            }}
            activeOpacity={0.8}
            onPress={() => {
              import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
              setIsNewTaskOpen(true);
            }}
          >
            <Ionicons name="add" size={18} color="#a599ff" />
            <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13.5, color: '#5a5a5f', marginHorizontal: 12 }}>
              Add a task
            </Text>
          </TouchableOpacity>
        </View>
        {sections.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Nothing here yet</Text>
          </View>
        ) : (
          sections.map((section, idx) => (
            <View key={section.title}>
              <View style={styles.listSectionHeader}>
                <Text style={[
                  styles.listSectionTitle,
                  section.title === 'OVERDUE' && { color: '#ff6961' },
                  section.title === 'UPCOMING' && { color: '#636366' },
                ]}>
                  {section.title}
                </Text>
              </View>
              {section.data.map(item => (
                <TaskRow
                  key={item.id}
                  task={item}
                  isOverdue={item.date ? item.date < today : false}
                  onComplete={() => completeTask(item)}
                  onReschedule={() => {
                    setSelectedTaskIds(new Set([item.id]));
                    setBulkRescheduleModal(true);
                  }}
                  onPress={() => setEditingTask(item)}
                  onLongPress={() => {
                    // Could implement overlay context menu here, currently opens edit
                    setEditingTask(item);
                  }}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Date Selector
  dateSelectorContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    backgroundColor: COLORS.accentPrimary,
    marginLeft: 4,
  },
  dateDay: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  jumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    gap: 8,
    marginTop: 20,
    marginBottom: 32,
  },
  jumpBtnText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: '#3a3a3c',
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
  emptyTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, marginTop: SPACE.lg },
  emptySub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: SPACE.xs, textAlign: 'center' },

  subtaskPrepopulated: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 8,
  },
  subtaskPrepopulatedText: {
    fontFamily: FONT_FAMILY.body, fontSize: 11,
    color: COLORS.textSecondary, textDecorationLine: 'line-through'
  },
  
  xpPopup: {
    position: 'absolute', right: 20, top: -10,
    backgroundColor: COLORS.accentGreen,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: RADIUS.full,
    ...SHADOW.md,
  },
  xpPopupText: {
    fontFamily: FONT_FAMILY.bold, fontSize: 12, color: COLORS.background
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
    borderColor: COLORS.border,
  },
  bulkEditText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
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
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  optionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 14,
  },
  optionsBtnText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityPillText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  timeInput: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, minWidth: 40, textAlign: 'center' },
  estTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  estInput: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, minWidth: 40 },
  recurPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  recurPillText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textMuted },

  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: COLORS.accentPrimary,
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
    backgroundColor: COLORS.textMuted,
  },
  customCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCheckboxDone: {
    backgroundColor: COLORS.textMuted,
    borderColor: COLORS.textMuted,
  },
  bulkCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkCheckboxSelected: {
    backgroundColor: COLORS.accentPrimary,
    borderColor: COLORS.accentPrimary,
  },
  taskMeta: { flex: 1, gap: 4 },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  taskDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
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
    backgroundColor: COLORS.background, // Pure opaque black
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.borderHover, // Slightly brighter border so it pops out
    padding: SPACE.xxl,
    gap: SPACE.md,
    ...SHADOW.accent(), // Adds a glow to further isolate it from the background
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.lg,
    color: COLORS.textPrimary,
    marginBottom: SPACE.sm,
  },
  modalInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  saveBtn: {
    flex: 2,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentPrimary,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#1a110a' },

  // Bulk Edit Bar
  bulkActionBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accentPrimary,
    ...SHADOW.accent()
  },
  rescheduleBtn: {
    backgroundColor: COLORS.accentPrimary,
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

  // ── New Task Modal (Exact Spec) ─────────────────────────────────────────
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

  // ── Subtasks panel ─────────────────────────────────────────────────────
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

  // ── Edit modal priority pills ───────────────────────────────────────────
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
});
