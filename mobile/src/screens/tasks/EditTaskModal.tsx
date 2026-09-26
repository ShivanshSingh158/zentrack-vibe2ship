/**
 * EditTaskModal.tsx — ZenTrack Tasks Module
 *
 * Apple Reminders iOS 18 "Grouped Inspector" design.
 * Features:
 *  - Header bar with "Cancel", "Details", "Done"
 *  - Grouped Card 1: Title input with live NLP parsing + multiline Notes/Details field
 *  - Grouped Card 2: Schedule (Date with 1-tap shortcuts, Time range picker, Reminder switch, Repeat rule)
 *  - Grouped Card 3: Priority segmented control (None, Low, Med, High) + interactive Tag selector with tag creation
 *  - Grouped Card 4: Subtasks checklist with completion toggles, title editing, and chained "+ Add step" entry
 *  - Grouped Card 5: Focus target duration chips (15m, 25m, 45m, 60m)
 *  - Bottom action section: Full-width Save CTA + non-destructive red Delete Task button
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  Alert, Platform, Keyboard, Switch, StyleSheet,
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
import { safeUpdate, safeDelete } from '../../utils/safeWrite';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../../components/ui/BottomSheet';
import NLPTaskInput from '../../components/Tasks/NLPTaskInput';
import RecurrencePickerModal from '../../components/Tasks/RecurrencePickerModal';
import UniversalCalendarModal from '../../components/UniversalCalendarModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import { scheduleSingleTaskReminder } from '../../services/notifications';
import { parseNLTask, ParsedTask, NLPToken, cleanTaskTitle } from '../../utils/dateUtils';
import { isSilenceOrNoise } from '../../services/voiceEngine';
import { Task } from '../../contexts/MobileDataContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import {
  TAG_STORAGE_KEY,
  today, formatDisplayDate, formatTimeDisplay,
} from './taskConstants';

interface Props {
  visible: boolean;
  onClose: () => void;
  task: Task | null;
}

const DEFAULT_TAGS = ['college', 'work', 'gym', 'placement', 'finance', 'errand', 'personal'];

const getTagColor = (tag: string, colors: any) => {
  const cleanTag = tag.toLowerCase().replace(/^#/, '').trim();
  const map: Record<string, string> = {
    high: colors.error,
    work: colors.accentBlue,
    personal: colors.accentGreen,
    errand: colors.accentAmber,
    gym: colors.accentPrimary,
    college: '#a599ff',
    finance: '#5eda9e',
    placement: '#ff9f4d',
  };
  return map[cleanTag] || colors.accentPrimary;
};

function EditTaskModalComponent({ visible, onClose, task }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeEditModalStyles(colors, isDark), [colors, isDark]);

  const lastTaskRef = useRef<Task | null>(task);
  if (task) {
    lastTaskRef.current = task;
  }
  const currentTask = task || lastTaskRef.current;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | null>('medium');
  const [taskDate, setTaskDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<any>(null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [isReminder, setIsReminder] = useState(false);

  // Chained new step entry
  const [newStepText, setNewStepText] = useState('');
  const newStepInputRef = useRef<TextInput>(null);

  // NLP States
  const [nlpParsed, setNlpParsed] = useState<ParsedTask | null>(null);
  const [nlpDuration, setNlpDuration] = useState<number | null>(null);
  const nlpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLibrary, setTagLibrary] = useState<string[]>([]);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Date shortcut helpers
  const tomorrowDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const weekendDate = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }, []);

  const allAvailableTags = useMemo(() => {
    return Array.from(new Set([...DEFAULT_TAGS, ...tagLibrary, ...selectedTags]));
  }, [tagLibrary, selectedTags]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(TAG_STORAGE_KEY).then(raw => {
      if (raw) setTagLibrary(JSON.parse(raw));
    });
  }, [visible]);

  const addTag = useCallback((tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-').replace(/^#/, '');
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
    setNotes(currentTask.notes || '');
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
    setIsReminder(!!currentTask.isReminder);
    setNlpDuration(currentTask.estimatedMinutes || null);
    setNlpParsed(null);
    setNewStepText('');
    setIsAddingTag(false);
    setNewTagInput('');
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
        const parts = trimmed.split(/[-–—]/).map((s: string) => s.trim());
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
      if (parsed.date && parsed.tokens.some(t => t.type === 'date')) {
        setTaskDate(parsed.date);
      }
      if (parsed.timeSlot && parsed.tokens.some(t => t.type === 'time')) {
        setStartTime(parsed.timeSlot);
        if (parsed.endTimeSlot) setEndTime(parsed.endTimeSlot);
        setIsReminder(true);
      }
      if (parsed.tokens.some(t => t.type === 'priority')) {
        setPriority(parsed.priority);
      }
      if (parsed.isRecurring && parsed.recurrenceRule && parsed.tokens.some(t => t.type === 'recurrence')) {
        setRecurrenceRule(parsed.recurrenceRule);
      }
      if (parsed.isReminder) {
        setIsReminder(true);
      }
      if (parsed.tokens.some(t => t.type === 'tag') && parsed.tags && parsed.tags.length > 0) {
        parsed.tags.forEach(tg => addTag(tg));
      }
      if (parsed.durationMinutes != null) setNlpDuration(parsed.durationMinutes);
    }, 60);
  }, [addTag]);

  const handleDismissToken = useCallback((token: NLPToken) => {
    const { type, start, end, display } = token;
    if (type === 'date')       { setTaskDate(task?.date || today); }
    if (type === 'time')       {
      if (task?.timeSlot) {
        const parts = task.timeSlot.split(/[-–—]/).map((s: string) => s.trim());
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
    if (type === 'reminder')   { setIsReminder(false); }
    if (type === 'tag')        { removeSelectedTag(display.replace(/^#/, '')); }

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
      if (event.type === 'set' && d) {
        setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
        setIsReminder(true);
      }
    } else {
      if (d) {
        setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
        setIsReminder(true);
      }
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

  const handleAddSubtask = useCallback(() => {
    const trimmed = newStepText.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubtasks(prev => [
      ...prev,
      {
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: trimmed,
        completed: false,
      },
    ]);
    setNewStepText('');
  }, [newStepText]);

  const { optimisticDeleteTask, optimisticUpdateTask } = useCoreData();

  if (!currentTask) return null;

  const handleDelete = () => {
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (currentTask.isRecurring) {
      Alert.alert('Delete Recurring Task', 'Do you want to delete only this instance, or this and all future instances?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This instance only', style: 'destructive', onPress: () => {
          onClose();
          optimisticDeleteTask(currentTask.id);
          safeDelete(
            currentTask.id,
            COLLECTION.TASKS,
            () => deleteDoc(doc(db, COLLECTION.TASKS, currentTask.id))
          );
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
      Alert.alert('Delete Task', 'Are you sure you want to permanently delete this task?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onClose();
            optimisticDeleteTask(currentTask.id);
            safeDelete(
              currentTask.id,
              COLLECTION.TASKS,
              () => deleteDoc(doc(db, COLLECTION.TASKS, currentTask.id))
            );
          },
        },
      ]);
    }
  };

  const handleSave = async (overrideTitle?: string) => {
    Keyboard.dismiss();
    const isOverride = typeof overrideTitle === 'string';
    const rawText = isOverride ? overrideTitle : title;
    if (!rawText.trim() || isSilenceOrNoise(rawText)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const rawForParse = isOverride ? rawText : title;
    const saveParsed = rawForParse.trim().length >= 2 ? parseNLTask(rawForParse) : null;

    let finalTitle = cleanTaskTitle(saveParsed?.title?.trim() || nlpParsed?.title?.trim() || rawForParse.trim());
    let ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    let est = calcEstMinutes(startTime, endTime) || nlpDuration || saveParsed?.durationMinutes || currentTask.estimatedMinutes || 0;
    let finalPriority = priority || 'low';
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

    const finalIsReminder = saveParsed?.isReminder ?? isReminder;

    const updatePayload = {
      title: finalTitle,
      text: finalTitle,
      notes: notes.trim() || undefined,
      priority: finalPriority,
      date: finalDate,
      timeSlot: ts || undefined,
      estimatedMinutes: est,
      isRecurring: !!finalRecurrence,
      recurrenceRule: finalRecurrence || undefined,
      tags: selectedTags,
      subtasks,
      isReminder: finalIsReminder || undefined,
    };

    const firestorePayload = {
      ...updatePayload,
      notes: notes.trim() || null,
      timeSlot: ts || null,
      recurrenceRule: finalRecurrence || null,
      isReminder: finalIsReminder || false,
    };

    optimisticUpdateTask(currentTask.id, updatePayload);

    if (finalIsReminder || ts) {
      scheduleSingleTaskReminder({
        id: currentTask.id,
        ...updatePayload,
      } as any).catch(console.warn);
    }

    if (currentTask.isRecurring || finalRecurrence) {
      Alert.alert('Edit Recurring Task', 'Apply changes to this instance only, or recreate all future instances?', [
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
      safeUpdate(
        currentTask.id,
        COLLECTION.TASKS,
        firestorePayload,
        () => updateDoc(doc(db, COLLECTION.TASKS, currentTask.id), firestorePayload)
      );
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} fullHeight={false} avoidKeyboard={true}>
      <View style={styles.container}>
        {/* iOS 18 Navigation Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Details</Text>
          <TouchableOpacity
            onPress={() => handleSave()}
            disabled={!title.trim()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.doneBtnText, !title.trim() && { opacity: 0.35 }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── GROUP 1: Title ── */}
          <View style={styles.groupedCard}>
            <NLPTaskInput
              value={title}
              onChangeText={handleTitleChange}
              parsed={nlpParsed ?? { title, date: null, timeSlot: null, priority: 'low', isRecurring: false, recurrenceRule: null, tokens: [] }}
              onDismissToken={handleDismissToken}
              autoFocus={false}
              placeholder="Task Title"
              onSubmitEditing={() => Keyboard.dismiss()}
              hideMic={true}
            />
          </View>

          {/* ── GROUP 2: Schedule & Timing ── */}
          <Text style={styles.sectionHeader}>SCHEDULE</Text>
          <View style={styles.groupedCard}>
            {/* Date Row */}
            <TouchableOpacity style={styles.rowItem} onPress={() => setShowCalendar(true)} activeOpacity={0.7}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(96, 165, 250, 0.16)' }]}>
                  <Ionicons name="calendar" size={15} color="#60a5fa" />
                </View>
                <Text style={styles.rowLabel}>Date</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowValue, taskDate !== today && { color: colors.accentPrimary, fontFamily: 'Inter_600SemiBold' }]}>
                  {taskDate === today ? 'Today' : formatDisplayDate(taskDate)}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
              </View>
            </TouchableOpacity>

            {/* Quick Date Shortcuts (Today / Tomorrow / Weekend) */}
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={[styles.quickDateChip, taskDate === today && styles.quickDateChipActive]}
                onPress={() => { Haptics.selectionAsync(); setTaskDate(today); }}
              >
                <Text style={[styles.quickDateChipText, taskDate === today && styles.quickDateChipTextActive]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickDateChip, taskDate === tomorrowDate && styles.quickDateChipActive]}
                onPress={() => { Haptics.selectionAsync(); setTaskDate(tomorrowDate); }}
              >
                <Text style={[styles.quickDateChipText, taskDate === tomorrowDate && styles.quickDateChipTextActive]}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickDateChip, taskDate === weekendDate && styles.quickDateChipActive]}
                onPress={() => { Haptics.selectionAsync(); setTaskDate(weekendDate); }}
              >
                <Text style={[styles.quickDateChipText, taskDate === weekendDate && styles.quickDateChipTextActive]}>This Weekend</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Properly Structured Time Slot */}
            {startTime ? (
              <View style={styles.timeSlotBlock}>
                <View style={styles.timeSlotHeaderRow}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.iconBadge, { backgroundColor: 'rgba(52, 211, 153, 0.16)' }]}>
                      <Ionicons name="time" size={15} color="#34d399" />
                    </View>
                    <Text style={styles.rowLabel}>Time Slot</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.clearTimeBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setStartTime('');
                      setEndTime('');
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.clearTimeBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.timeSlotCardsRow}>
                  <TouchableOpacity
                    style={styles.timeSlotCard}
                    onPress={() => setShowStartPicker(true)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.timeSlotCardLabel}>STARTS</Text>
                    <Text style={styles.timeSlotCardValue}>{formatTimeDisplay(startTime)}</Text>
                  </TouchableOpacity>

                  <View style={styles.timeSlotCardArrow}>
                    <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
                  </View>

                  <TouchableOpacity
                    style={[styles.timeSlotCard, !endTime && styles.timeSlotCardUnset]}
                    onPress={() => setShowEndPicker(true)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.timeSlotCardLabel}>ENDS</Text>
                    <Text style={[styles.timeSlotCardValue, !endTime && styles.timeSlotCardValueUnset]}>
                      {endTime ? formatTimeDisplay(endTime) : '+ Set End'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.rowItem}
                onPress={() => setShowStartPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBadge, { backgroundColor: 'rgba(52, 211, 153, 0.16)' }]}>
                    <Ionicons name="time" size={15} color="#34d399" />
                  </View>
                  <Text style={styles.rowLabel}>Time Slot</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowValue, { color: colors.accentPrimary }]}>+ Set Time</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            {/* Reminder Switch */}
            <View style={styles.rowItem}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.16)' }]}>
                  <Ionicons name="notifications" size={15} color="#f59e0b" />
                </View>
                <Text style={styles.rowLabel}>Reminder Notification</Text>
              </View>
              <Switch
                value={isReminder}
                onValueChange={(val) => {
                  Haptics.selectionAsync();
                  setIsReminder(val);
                  if (val && !startTime) setShowStartPicker(true);
                }}
                trackColor={{ false: isDark ? '#2c2c2e' : '#e5e7eb', true: colors.accentPrimary }}
                thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
              />
            </View>

            <View style={styles.divider} />

            {/* Repeat Row */}
            <TouchableOpacity style={styles.rowItem} onPress={() => setShowRecurrenceModal(true)} activeOpacity={0.7}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconBadge, { backgroundColor: 'rgba(192, 132, 252, 0.16)' }]}>
                  <Ionicons name="repeat" size={15} color="#c084fc" />
                </View>
                <Text style={styles.rowLabel}>Repeat</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.rowValue, recurrenceRule && { color: colors.accentPrimary, fontFamily: 'Inter_600SemiBold' }]}>
                  {recurrenceRule
                    ? (recurrenceRule.type === 'custom' ? `Every ${recurrenceRule.interval}d` : recurrenceRule.type.charAt(0).toUpperCase() + recurrenceRule.type.slice(1))
                    : 'Never'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── GROUP 3: Priority & Tags ── */}
          <Text style={styles.sectionHeader}>PRIORITY & TAGS</Text>
          <View style={styles.groupedCard}>
            {/* Priority Segmented Control */}
            <View style={styles.rowItem}>
              <Text style={styles.rowLabel}>Priority</Text>
              <View style={styles.prioritySegments}>
                {[
                  { val: 'none' as const, label: 'None', color: colors.textTertiary },
                  { val: 'low' as const, label: 'Low', color: '#5eda9e' },
                  { val: 'medium' as const, label: 'Med', color: '#ff9f4d' },
                  { val: 'high' as const, label: 'High', color: '#ff6961' },
                ].map((p) => {
                  const isActive = (priority === p.val) || (p.val === 'none' && !priority);
                  return (
                    <TouchableOpacity
                      key={p.val}
                      style={[
                        styles.prioritySegment,
                        isActive && styles.prioritySegmentActive,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPriority(p.val === 'none' ? null : p.val);
                      }}
                    >
                      {p.val !== 'none' && (
                        <View style={[styles.priorityDot, { backgroundColor: p.color }]} />
                      )}
                      <Text style={[
                        styles.prioritySegmentText,
                        isActive && styles.prioritySegmentTextActive,
                      ]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Tags Selector: Only show chips if tags are present */}
            {selectedTags.length > 0 ? (
              <View style={styles.tagsContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={styles.rowLabel}>Tags</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>{selectedTags.length} active</Text>
                </View>
                <View style={styles.tagsWrap}>
                  {selectedTags.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={styles.activeTagChip}
                      onPress={() => { Haptics.selectionAsync(); removeSelectedTag(tag); }}
                    >
                      <View style={[styles.tagDot, { backgroundColor: getTagColor(tag, colors) }]} />
                      <Text style={styles.activeTagText}>{tag}</Text>
                      <Ionicons name="close" size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  ))}

                  {isAddingTag ? (
                    <View style={styles.inlineAddTagBox}>
                      <TextInput
                        style={styles.inlineAddTagInput}
                        value={newTagInput}
                        onChangeText={setNewTagInput}
                        placeholder="tag..."
                        placeholderTextColor={colors.textTertiary}
                        autoFocus
                        onSubmitEditing={() => {
                          if (newTagInput.trim()) {
                            addTag(newTagInput);
                            setNewTagInput('');
                            setIsAddingTag(false);
                          }
                        }}
                        onBlur={() => {
                          if (newTagInput.trim()) addTag(newTagInput);
                          setNewTagInput('');
                          setIsAddingTag(false);
                        }}
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.newTagBtn}
                      onPress={() => { Haptics.selectionAsync(); setIsAddingTag(true); }}
                    >
                      <Ionicons name="add" size={13} color={colors.accentPrimary} />
                      <Text style={styles.newTagBtnText}>Tag</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : isAddingTag ? (
              <View style={styles.tagsContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={styles.rowLabel}>Tags</Text>
                </View>
                <View style={styles.tagsWrap}>
                  <View style={styles.inlineAddTagBox}>
                    <TextInput
                      style={styles.inlineAddTagInput}
                      value={newTagInput}
                      onChangeText={setNewTagInput}
                      placeholder="tag..."
                      placeholderTextColor={colors.textTertiary}
                      autoFocus
                      onSubmitEditing={() => {
                        if (newTagInput.trim()) {
                          addTag(newTagInput);
                          setNewTagInput('');
                          setIsAddingTag(false);
                        }
                      }}
                      onBlur={() => {
                        if (newTagInput.trim()) addTag(newTagInput);
                        setNewTagInput('');
                        setIsAddingTag(false);
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.rowItem}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>Tags</Text>
                </View>
                <TouchableOpacity
                  style={styles.addTagTextBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setIsAddingTag(true);
                  }}
                >
                  <Ionicons name="add" size={14} color={colors.accentPrimary} />
                  <Text style={styles.addTagTextBtnLabel}>Add Tag</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── GROUP 4: Subtasks Checklist ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 8, marginRight: 8, marginTop: 18, marginBottom: 6 }}>
            <Text style={styles.sectionHeaderInline}>SUBTASKS</Text>
            {subtasks.length > 0 && (
              <Text style={styles.subtaskProgressBadge}>
                {subtasks.filter(s => s.completed).length}/{subtasks.length} completed
              </Text>
            )}
          </View>
          <View style={styles.groupedCard}>
            {subtasks.map((st, i) => (
              <React.Fragment key={st.id || i}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.subtaskItemRow}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, completed: !s.completed } : s));
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.subtaskCheckbox, st.completed && styles.subtaskCheckboxDone]}>
                      {st.completed && <Ionicons name="checkmark" size={11} color="#ffffff" />}
                    </View>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.subtaskInputText, st.completed && styles.subtaskInputTextDone]}
                    value={st.title}
                    onChangeText={(newTitle) => {
                      setSubtasks(prev => prev.map((s, idx) => idx === i ? { ...s, title: newTitle } : s));
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSubtasks(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </React.Fragment>
            ))}

            {subtasks.length > 0 && <View style={styles.divider} />}

            {/* Inline "+ Add Step" Chained Entry */}
            <View style={styles.newStepRow}>
              <Ionicons name="add-circle-outline" size={18} color={colors.accentPrimary} style={{ marginRight: 10 }} />
              <TextInput
                ref={newStepInputRef}
                style={styles.newStepInput}
                value={newStepText}
                onChangeText={setNewStepText}
                placeholder="Add step..."
                placeholderTextColor={colors.textTertiary}
                returnKeyType="done"
                onSubmitEditing={handleAddSubtask}
                blurOnSubmit={false}
              />
              {newStepText.trim().length > 0 && (
                <TouchableOpacity onPress={handleAddSubtask} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="arrow-up-circle" size={24} color={colors.accentPrimary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Bottom Action & Destruction ── */}
          <View style={styles.bottomActionSection}>
            <AnimatedPressable
              style={[styles.saveBtn, !title.trim() && styles.saveBtnDisabled]}
              onPress={() => handleSave()}
              disabled={!title.trim()}
              variant="cta"
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={isDark ? '#000000' : '#ffffff'} style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </AnimatedPressable>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#FF453A" style={{ marginRight: 6 }} />
              <Text style={styles.deleteBtnText}>Delete Task</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Date & Time Modals */}
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
            mode="time"
            display="default"
            onChange={onStartChange}
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
            mode="time"
            display="default"
            onChange={onEndChange}
          />
        )}

        <UniversalCalendarModal
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          selectedDate={taskDate}
          onDateSelect={(d) => setTaskDate(d)}
          title="Pick a Date"
        />

        <RecurrencePickerModal
          visible={showRecurrenceModal}
          onClose={() => setShowRecurrenceModal(false)}
          initialRule={recurrenceRule}
          onSave={setRecurrenceRule}
        />
      </View>
    </BottomSheet>
  );
}

export const EditTaskModal = React.memo(EditTaskModalComponent);
export default EditTaskModal;

const makeEditModalStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
  },
  cancelBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: colors.textPrimary,
  },
  doneBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.accentPrimary,
  },
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginLeft: 8,
    marginTop: 18,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sectionHeaderInline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  subtaskProgressBadge: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: colors.accentPrimary,
  },
  groupedCard: {
    backgroundColor: isDark ? '#121216' : colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    marginLeft: 16,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    color: colors.textSecondary,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  quickDateChip: {
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  quickDateChipActive: {
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.18)' : 'rgba(108, 92, 231, 0.14)',
    borderColor: colors.accentPrimary,
  },
  quickDateChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.textTertiary,
  },
  quickDateChipTextActive: {
    color: colors.accentPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  timeSlotBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  timeSlotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearTimeBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(255, 69, 58, 0.12)' : 'rgba(239, 68, 68, 0.08)',
  },
  clearTimeBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#FF453A',
  },
  timeSlotCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeSlotCard: {
    flex: 1,
    backgroundColor: isDark ? '#1a1a20' : '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  timeSlotCardUnset: {
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  timeSlotCardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  timeSlotCardValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#34d399',
  },
  timeSlotCardValueUnset: {
    color: colors.textTertiary,
    fontFamily: 'Inter_400Regular',
  },
  timeSlotCardArrow: {
    paddingHorizontal: 8,
  },
  addTagTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.12)' : 'rgba(108, 92, 231, 0.08)',
  },
  addTagTextBtnLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.accentPrimary,
  },
  prioritySegments: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.4)' : '#EAE9F2',
    borderRadius: 9,
    padding: 2.5,
  },
  prioritySegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 4,
  },
  prioritySegmentActive: {
    backgroundColor: isDark ? '#26262c' : '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  prioritySegmentText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.textTertiary,
  },
  prioritySegmentTextActive: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tagsContainer: {
    padding: 16,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  activeTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)',
    gap: 4,
  },
  activeTagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.textPrimary,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  newTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.12)' : 'rgba(108, 92, 231, 0.08)',
    gap: 3,
  },
  newTagBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.accentPrimary,
  },
  inlineAddTagBox: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1,
    borderColor: colors.accentPrimary,
  },
  inlineAddTagInput: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.textPrimary,
    padding: 0,
    minWidth: 50,
  },
  subtaskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  subtaskCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  subtaskCheckboxDone: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  subtaskInputText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  subtaskInputTextDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  newStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  newStepInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  bottomActionSection: {
    marginTop: 22,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 12,
  },
  saveBtn: {
    width: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: isDark ? '#000000' : '#ffffff',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  deleteBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#FF453A',
  },
});
