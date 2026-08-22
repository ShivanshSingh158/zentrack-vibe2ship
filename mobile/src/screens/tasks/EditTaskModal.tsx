/**
 * EditTaskModal.tsx — ZenTrack Tasks Module
 *
 * Bottom-sheet modal for editing an existing task. Extracted from TasksScreen.tsx
 * (was lines 623–1033). Heavy Firestore ops (delete recurring, getDocs) only run
 * when user explicitly taps delete — never on mount.
 *
 * Features full NLP natural language parsing, live token chips & highlights,
 * voice dictation overlay, and synchronous re-parsing on save.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView,
  Alert, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, updateDoc, deleteDoc, doc,
  serverTimestamp, writeBatch, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { SPACE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../../components/ui/BottomSheet';
import NLPTaskInput from '../../components/Tasks/NLPTaskInput';
import RecurrencePickerModal from '../../components/Tasks/RecurrencePickerModal';
import UniversalCalendarModal from '../../components/UniversalCalendarModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import { parseNLTask, ParsedTask, NLPToken, parseLocalDate, toYMD } from '../../utils/dateUtils';
import { isSilenceOrNoise } from '../../services/voiceEngine';
import { handleSyncError } from '../../utils/errorUtils';
import { Task } from '../../contexts/MobileDataContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import {
  TAG_STORAGE_KEY,
  today, formatDisplayDate, formatTimeDisplay,
} from './taskConstants';
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
  const { colors, isDark } = useTheme();
  const styles = makeTasksStyles(colors, isDark);

  const lastTaskRef = useRef<Task | null>(task);
  if (task) {
    lastTaskRef.current = task;
  }
  const currentTask = task || lastTaskRef.current;

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

  // NLP States
  const [nlpParsed, setNlpParsed] = useState<ParsedTask | null>(null);
  const [nlpDuration, setNlpDuration] = useState<number | null>(null);
  const nlpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLibrary, setTagLibrary] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(TAG_STORAGE_KEY).then(raw => {
      if (raw) setTagLibrary(JSON.parse(raw));
    });
  }, [visible]);

  const addTag = useCallback((tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!clean) return;
    setSelectedTags(prev => prev.includes(clean) ? prev : [...prev, clean]);
    setTagLibrary(prev => {
      const next = prev.includes(clean) ? prev : [clean, ...prev];
      AsyncStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeSelectedTag = useCallback((tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  }, []);

  useEffect(() => {
    if (!currentTask) return;
    setTitle(currentTask.title || '');
    setPriority(
      (currentTask.priority as any) === 'P1' ? 'high'
        : (currentTask.priority as any) === 'P2' ? 'medium'
        : (currentTask.priority as any) === 'P3' ? 'low'
        : (currentTask.priority as 'low' | 'medium' | 'high') || 'medium'
    );
    setTaskDate(currentTask.date || today);
    setRecurrenceRule(currentTask.recurrenceRule || null);
    setSubtasks(currentTask.subtasks || []);
    setSelectedTags(currentTask.tags || []);
    setNlpParsed(null);
    setNlpDuration(null);
    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);

    if (currentTask.timeSlot) {
      const trimmed = currentTask.timeSlot.trim();
      const lower = trimmed.toLowerCase();
      if (lower === 'morning') {
        setStartTime('09:00');
        setEndTime('10:00');
      } else if (lower === 'afternoon') {
        setStartTime('14:00');
        setEndTime('15:00');
      } else if (lower === 'evening') {
        setStartTime('19:00');
        setEndTime('20:00');
      } else if (lower === 'night') {
        setStartTime('21:00');
        setEndTime('22:00');
      } else {
        const parts = trimmed.split(/[-–]/).map((s: string) => s.trim());
        setStartTime(parts[0] || '');
        setEndTime(parts[1] || '');
      }
    } else {
      setStartTime('');
      setEndTime('');
    }
  }, [task, visible]);

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);

    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);

    if (text.length < 3) {
      setNlpParsed(null);
      return;
    }

    nlpDebounceRef.current = setTimeout(() => {
      const parsed = parseNLTask(text);
      setNlpParsed(parsed.tokens.length > 0 ? parsed : null);
      if (parsed.date && parsed.tokens.some(t => t.type === 'date')) setTaskDate(parsed.date);
      if (parsed.timeSlot && parsed.tokens.some(t => t.type === 'time')) {
        setStartTime(parsed.timeSlot);
        if (parsed.endTimeSlot) setEndTime(parsed.endTimeSlot);
      }
      if (parsed.tokens.some(t => t.type === 'priority')) setPriority(parsed.priority);
      if (parsed.isRecurring && parsed.recurrenceRule && parsed.tokens.some(t => t.type === 'recurrence')) setRecurrenceRule(parsed.recurrenceRule);
      if (parsed.tags && parsed.tags.length > 0) {
        parsed.tags.forEach(tag => addTag(tag));
      }
      if (parsed.durationMinutes != null) setNlpDuration(parsed.durationMinutes);
    }, 300);
  }, [addTag]);

  const handleDismissToken = useCallback((token: NLPToken) => {
    const { type, start, end, display } = token;
    if (type === 'date')       { setTaskDate(task?.date || today); }
    if (type === 'time')       {
      if (task?.timeSlot) {
        const parts = task.timeSlot.split(/[-–]/).map((s: string) => s.trim());
        setStartTime(parts[0] || '');
        setEndTime(parts[1] || '');
      } else {
        setStartTime('');
        setEndTime('');
      }
    }
    if (type === 'priority')   {
      setPriority(
        (task?.priority as any) === 'P1' ? 'high'
          : (task?.priority as any) === 'P2' ? 'medium'
          : (task?.priority as any) === 'P3' ? 'low'
          : (task?.priority as 'low' | 'medium' | 'high') || 'medium'
      );
    }
    if (type === 'recurrence') { setRecurrenceRule(task?.recurrenceRule || null); }
    if (type === 'duration')   { setNlpDuration(null); }
    if (type === 'tag')        { removeSelectedTag(display.replace(/^#/, '')); }

    // Splice the matched span out of the raw title and re-parse
    const cleaned = (title.slice(0, start) + title.slice(end)).replace(/\s{2,}/g, ' ').trim();
    setTitle(cleaned);
    const reparsed = parseNLTask(cleaned);
    setNlpParsed(reparsed.tokens.length > 0 ? reparsed : null);
  }, [title, task, removeSelectedTag]);

  const calcEstMinutes = (s: string, e: string) => {
    if (!s || !e || !s.includes(':') || !e.includes(':')) return 0;
    const [sH, sM] = s.split(':').map(Number);
    const [eH, eM] = e.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

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

  const { optimisticDeleteTask, optimisticUpdateTask } = useCoreData();

  if (!currentTask) return null;

  const handleDelete = async () => {
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (currentTask.isRecurring) {
      Alert.alert('Delete Recurring Task', 'Do you want to delete only this instance, or this and all future instances?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This instance only', style: 'destructive', onPress: async () => {
          onClose();
          optimisticDeleteTask(currentTask.id);
          try { await deleteDoc(doc(db, COLLECTION.TASKS, currentTask.id)); } catch (e) { console.error(e); }
        }},
        { text: 'All future instances', style: 'destructive', onPress: async () => {
          onClose();
          optimisticDeleteTask(currentTask.id);
          try {
            const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', currentTask.userId));
            const snap = await getDocs(q);
            const deleteBatch = writeBatch(db);
            snap.docs.forEach(d => {
              const data = d.data();
              const inSameGroup = currentTask.recurringSourceId
                ? data.recurringSourceId === currentTask.recurringSourceId
                : (data.title === currentTask.title && data.isRecurring === true);
              if (inSameGroup && data.date && currentTask.date && data.date >= currentTask.date) {
                optimisticDeleteTask(d.id);
                deleteBatch.delete(d.ref);
              }
            });
            await deleteBatch.commit();
          } catch (e) { console.error(e); }
        }},
      ]);
    } else {
      onClose();
      setTimeout(() => {
        Alert.alert('Delete Task', `"${currentTask.title}"`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Today only', style: 'destructive', onPress: () => {
            optimisticDeleteTask(currentTask.id);
            deleteDoc(doc(db, COLLECTION.TASKS, currentTask.id)).catch(handleSyncError);
          }},
          { text: 'All tasks', style: 'destructive', onPress: async () => {
            try {
              const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', currentTask.userId));
              const snap = await getDocs(q);
              const batch = writeBatch(db);
              snap.docs.forEach(d => { 
                if (d.data().title === currentTask.title) {
                  optimisticDeleteTask(d.id);
                  batch.delete(d.ref); 
                }
              });
              await batch.commit();
            } catch (e) { console.error(e); }
          }},
        ]);
      }, 300);
    }
  };

  const handleSave = async (overrideTitle?: string) => {
    Keyboard.dismiss();
    const isOverride = typeof overrideTitle === 'string';
    const rawText = isOverride ? overrideTitle : title;
    if (!rawText.trim() || isSilenceOrNoise(rawText)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Synchronous re-parse at save time
    const rawForParse = isOverride ? rawText : title;
    const saveParsed = rawForParse.trim().length >= 2 ? parseNLTask(rawForParse) : null;

    let finalTitle = saveParsed?.title?.trim() || nlpParsed?.title?.trim() || rawForParse.trim();
    let ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    let est = calcEstMinutes(startTime, endTime) || nlpDuration || saveParsed?.durationMinutes || currentTask.estimatedMinutes || 0;
    let finalPriority = priority;
    let finalDate = taskDate;
    let finalRecurrence = recurrenceRule;

    if (saveParsed?.tokens.length) {
      if (!ts && saveParsed.timeSlot) {
        ts = saveParsed.endTimeSlot ? `${saveParsed.timeSlot} - ${saveParsed.endTimeSlot}` : saveParsed.timeSlot;
      }
      if (saveParsed.tokens.some(t => t.type === 'priority')) finalPriority = saveParsed.priority;
      if (saveParsed.date && saveParsed.tokens.some(t => t.type === 'date')) finalDate = saveParsed.date;
      if (saveParsed.isRecurring && saveParsed.recurrenceRule && saveParsed.tokens.some(t => t.type === 'recurrence')) finalRecurrence = saveParsed.recurrenceRule;
    }

    const updatePayload = {
      title: finalTitle,
      text: finalTitle,
      priority: finalPriority,
      date: finalDate,
      timeSlot: ts || undefined,
      estimatedMinutes: est,
      isRecurring: !!finalRecurrence,
      recurrenceRule: finalRecurrence || undefined,
      tags: selectedTags,
      subtasks,
    };

    const firestorePayload = {
      ...updatePayload,
      timeSlot: ts || null,
      recurrenceRule: finalRecurrence || null,
    };

    optimisticUpdateTask(currentTask.id, updatePayload);

    if (currentTask.isRecurring || finalRecurrence) {
      Alert.alert('Edit Task', 'Apply changes to this instance only, or recreate all future instances?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This instance only', onPress: async () => {
          try { await updateDoc(doc(db, COLLECTION.TASKS, currentTask.id), firestorePayload); onClose(); } catch (e) { console.error(e); }
        }},
        { text: 'All future instances', onPress: async () => {
          try {
            await updateDoc(doc(db, COLLECTION.TASKS, currentTask.id), firestorePayload);
            const q = query(collection(db, COLLECTION.TASKS), where('userId', '==', currentTask.userId));
            const snap = await getDocs(q);
            const deleteBatch = writeBatch(db);
            snap.docs.forEach(d => {
              const data = d.data();
              if (data.title === currentTask.title && data.isRecurring === true && data.date && currentTask.date && data.date > currentTask.date) deleteBatch.delete(d.ref);
            });
            await deleteBatch.commit();
            if (finalRecurrence) {
              const createBatch = writeBatch(db);
              let current = new Date(finalDate);
              if (finalRecurrence.type === 'daily' || finalRecurrence.type === 'custom') { current.setDate(current.getDate() + (finalRecurrence.interval || 1)); }
              else if (finalRecurrence.type === 'weekly') {
                if (finalRecurrence.daysOfWeek?.length > 0) { do { current.setDate(current.getDate() + 1); } while (!finalRecurrence.daysOfWeek.includes(current.getDay())); }
                else { current.setDate(current.getDate() + 7 * (finalRecurrence.interval || 1)); }
              } else if (finalRecurrence.type === 'monthly') { current.setMonth(current.getMonth() + (finalRecurrence.interval || 1)); }
              const end = finalRecurrence.endDate ? new Date(finalRecurrence.endDate) : new Date(new Date(finalDate).getTime() + 90 * 24 * 60 * 60 * 1000);
              let count = 0;
              const MAX_INSTANCES = 90;
              const sourceId = currentTask.recurringSourceId || `rec_${Date.now()}`;
              while (current <= end && count < MAX_INSTANCES) {
                const docRef = doc(collection(db, COLLECTION.TASKS));
                createBatch.set(docRef, { ...firestorePayload, userId: currentTask.userId, date: current.toISOString().slice(0, 10), recurringSourceId: sourceId, createdAt: serverTimestamp(), status: 'pending', order: currentTask.order || 0 });
                count++;
                if (finalRecurrence.type === 'daily' || finalRecurrence.type === 'custom') { current.setDate(current.getDate() + (finalRecurrence.interval || 1)); }
                else if (finalRecurrence.type === 'weekly') {
                  if (finalRecurrence.daysOfWeek?.length > 0) { do { current.setDate(current.getDate() + 1); } while (!finalRecurrence.daysOfWeek.includes(current.getDay())); }
                  else { current.setDate(current.getDate() + 7 * (finalRecurrence.interval || 1)); }
                } else if (finalRecurrence.type === 'monthly') { current.setMonth(current.getMonth() + (finalRecurrence.interval || 1)); }
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
      updateDoc(doc(db, COLLECTION.TASKS, currentTask.id), firestorePayload).catch(handleSyncError);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACE.xs, paddingHorizontal: 0 }}>
          <View style={{ flex: 1 }}>
            <NLPTaskInput
              value={title}
              onChangeText={handleTitleChange}
              parsed={nlpParsed ?? { title, date: null, timeSlot: null, priority: 'low', isRecurring: false, recurrenceRule: null, tokens: [] }}
              onDismissToken={handleDismissToken}
              autoFocus={visible}
              placeholder="Task title... try 'tomorrow 5pm high'"
              onSubmitEditing={() => handleSave()}
              hideMic={true}
            />
          </View>
          <AnimatedPressable
            onPress={handleDelete}
            style={{ padding: SPACE.sm, marginTop: 4, marginLeft: SPACE.xs }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
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

            {startTime !== '' && (
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
                  <Ionicons name={st.completed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={st.completed ? '#5eda9e' : colors.textMuted} />
                </AnimatedPressable>
                <Text style={[styles.subtaskRowText, st.completed && { textDecorationLine: 'line-through', color: colors.textMuted }]}>{st.title}</Text>
                <AnimatedPressable onPress={() => setSubtasks(prev => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            ))}
          </View>
        )}

        {showStartPicker && (
          <DateTimePicker
            value={(() => {
              const d = new Date();
              if (startTime && startTime.includes(':')) {
                const [h, m] = startTime.split(':');
                const parsedH = parseInt(h, 10);
                const parsedM = parseInt(m, 10);
                if (!isNaN(parsedH)) d.setHours(parsedH, isNaN(parsedM) ? 0 : parsedM);
              }
              return d;
            })()}
            mode="time" display="default" onChange={onStartChange}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={(() => {
              const d = new Date();
              if (endTime && endTime.includes(':')) {
                const [h, m] = endTime.split(':');
                const parsedH = parseInt(h, 10);
                const parsedM = parseInt(m, 10);
                if (!isNaN(parsedH)) d.setHours(parsedH, isNaN(parsedM) ? 0 : parsedM);
              }
              return d;
            })()}
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

        <AnimatedPressable
          style={[styles.addTaskBtnFull, !title.trim() && styles.addTaskBtnDisabled]}
          onPress={() => handleSave()}
          disabled={!title.trim()}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={title.trim() ? (isDark ? '#000000' : '#ffffff') : colors.textMuted}
          />
          <Text style={[styles.addTaskBtnFullText, !title.trim() && styles.addTaskBtnDisabledText]}>
            Save Changes
          </Text>
        </AnimatedPressable>
      </View>
      <RecurrencePickerModal visible={showRecurrenceModal} onClose={() => setShowRecurrenceModal(false)} initialRule={recurrenceRule} onSave={setRecurrenceRule} />
    </BottomSheet>
  );
}

export const EditTaskModal = React.memo(EditTaskModalComponent);
export default EditTaskModal;

