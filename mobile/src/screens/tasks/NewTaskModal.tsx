/**
 * NewTaskModal.tsx — ZenTrack Tasks Module
 *
 * Bottom-sheet modal for creating a new task. Extracted from TasksScreen.tsx
 * (was lines 83–620). By living in its own file, the react-native-calendars
 * import (Calendar inside UniversalCalendarModal) is only parsed when this
 * modal is first opened — not at Tasks screen mount.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, addDoc, serverTimestamp, writeBatch, doc,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../../components/ui/BottomSheet';
import NLPTaskInput from '../../components/Tasks/NLPTaskInput';
import VoiceDictationOverlay from '../../components/Tasks/VoiceDictationOverlay';
import RecurrencePickerModal from '../../components/Tasks/RecurrencePickerModal';
import UniversalCalendarModal from '../../components/UniversalCalendarModal';
import AnimatedPressable from '../../components/AnimatedPressable';
import { parseNLTask, ParsedTask, NLPToken } from '../../utils/dateUtils';
import {
  TAG_STORAGE_KEY, TAG_PALETTE, tagColorFor,
  today, formatDisplayDate, formatTimeDisplay,
  Priority,
} from './taskConstants';
import { makeTasksStyles } from './tasksStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  selectedDate: string;
  listCount: number;
}

export const NewTaskModal = React.memo(function NewTaskModal({
  visible, onClose, userId, selectedDate, listCount,
}: Props) {
  const { colors } = useTheme();
  const styles = makeTasksStyles(colors);

  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<Priority>('low');
  const [nlpParsed, setNlpParsed] = useState<ParsedTask | null>(null);

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLibrary, setTagLibrary] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  useEffect(() => {
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
    setNewTagInput('');
    setShowTagInput(false);
  }, []);

  const removeSelectedTag = useCallback((tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  }, []);

  // Time pickers
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Recurrence
  const [recurrenceRule, setRecurrenceRule] = useState<any>(null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);

  // Subtasks
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [showSubtasks, setShowSubtasks] = useState(false);

  // Date selection
  const [taskDate, setTaskDate] = useState(selectedDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => { setTaskDate(selectedDate); }, [selectedDate, visible]);

  const nlpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = useCallback((text: string) => {
    // Update title immediately on every keystroke — no lag
    setTitle(text);

    // Debounce the NLP parse so it only runs when user pauses typing
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
      if (parsed.tokens.some(t => t.type === 'priority') && parsed.priority !== priority) setPriority(parsed.priority);
      if (parsed.isRecurring && parsed.recurrenceRule && parsed.tokens.some(t => t.type === 'recurrence')) setRecurrenceRule(parsed.recurrenceRule);
    }, 400);
  }, [priority]);

  const handleDismissToken = useCallback((type: NLPToken['type']) => {
    if (type === 'date')       { setTaskDate(selectedDate); }
    if (type === 'time')       { setStartTime(''); setEndTime(''); }
    if (type === 'priority')   { setPriority('low'); }
    if (type === 'recurrence') { setRecurrenceRule(null); }
    if (nlpParsed) {
      const tok = nlpParsed.tokens.find(t => t.type === type);
      if (tok) {
        const cleaned = (title.slice(0, tok.start) + title.slice(tok.end)).replace(/\s{2,}/g, ' ').trim();
        setTitle(cleaned);
        const reparsed = parseNLTask(cleaned);
        setNlpParsed(reparsed.tokens.length > 0 ? reparsed : null);
      }
    }
  }, [nlpParsed, title, selectedDate]);

  const timeLabel = startTime ? formatTimeDisplay(startTime) : 'Time';
  const dateLabel = taskDate === today ? 'Today'
    : taskDate === (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })()
      ? 'Tomorrow'
      : formatDisplayDate(taskDate);

  const calcEstMinutes = (s: string, e: string) => {
    if (!s || !e) return 0;
    const [sH, sM] = s.split(':').map(Number);
    const [eH, eM] = e.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  const onStartTimeChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && d) {
        setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
      }
    } else {
      if (d) setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };

  const onEndTimeChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && d) {
        setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
      }
    } else {
      if (d) setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };

  const addSubtask = () => {
    if (!subtaskInput.trim()) return;
    setSubtasks(prev => [...prev, subtaskInput.trim()]);
    setSubtaskInput('');
  };
  const removeSubtask = (i: number) => setSubtasks(prev => prev.filter((_, idx) => idx !== i));

  const resetAndClose = () => {
    setTitle(''); setSaving(false); setPriority('low');
    setStartTime(''); setEndTime(''); setRecurrenceRule(null);
    setSubtasks([]); setSubtaskInput(''); setShowSubtasks(false);
    setIsCalendarOpen(false); setNlpParsed(null);
    setSelectedTags([]); setNewTagInput(''); setShowTagInput(false);
    onClose();
  };

  const [showDictationOverlay, setShowDictationOverlay] = useState(false);

  const handleVoiceTasksExtracted = async (extractedTasks: any[]) => {
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    if (extractedTasks.length > 0) {
      const pt = extractedTasks[0];
      
      // Populate preview fields
      if (pt.title) setTitle(pt.title);
      if (pt.priority) setPriority(pt.priority);
      if (pt.timeSlot) setStartTime(pt.timeSlot);
      if (pt.recurrenceRule) setRecurrenceRule(pt.recurrenceRule);
      
      // Don't auto-save, let the user tap "Add task"
    }
  };

  const handleSave = (overrideTitle?: string) => {
    const isOverride = typeof overrideTitle === 'string';
    const rawText = isOverride ? overrideTitle : title;
    if (!rawText.trim()) return;

    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

    let finalTitle = nlpParsed?.title?.trim() || title.trim();
    let ts = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : null;
    let est = calcEstMinutes(startTime, endTime);
    let finalPriority = priority;
    let finalDate = taskDate;
    let finalRecurrence = recurrenceRule;

    if (isOverride) {
      const p = parseNLTask(rawText);
      finalTitle = p.title.trim() || rawText.trim();
      if (p.timeSlot) ts = p.endTimeSlot ? `${p.timeSlot} - ${p.endTimeSlot}` : p.timeSlot;
      if (p.priority !== 'low') finalPriority = p.priority;
      if (p.date) finalDate = p.date;
      if (p.recurrenceRule) finalRecurrence = p.recurrenceRule;
    }

    const subtaskObjects = subtasks.map((s, i) => ({ id: `st-${i}`, title: s, completed: false }));

    setTimeout(async () => {
      try {
        if (finalRecurrence) {
          const batch = writeBatch(db);
          let current = new Date(finalDate);
          const end = finalRecurrence.endDate
            ? new Date(finalRecurrence.endDate)
            : new Date(current.getTime() + 90 * 24 * 60 * 60 * 1000);
          let count = 0;
          const MAX_INSTANCES = 90;
          const sourceId = `rec_${Date.now()}`;
          while (current <= end && count < MAX_INSTANCES) {
            const dateStr = current.toISOString().slice(0, 10);
            const docRef = doc(collection(db, COLLECTION.TASKS));
            batch.set(docRef, {
              userId, title: finalTitle, text: finalTitle, status: 'pending',
              priority: finalPriority, date: dateStr, timeSlot: ts,
              estimatedMinutes: est, isRecurring: true, recurrenceRule: finalRecurrence,
              recurringSourceId: sourceId, subject: null, createdAt: serverTimestamp(),
              order: listCount, subtasks: subtaskObjects,
            });
            count++;
            if (finalRecurrence.type === 'daily' || finalRecurrence.type === 'custom') {
              current.setDate(current.getDate() + (finalRecurrence.interval || 1));
            } else if (finalRecurrence.type === 'weekly') {
              if (finalRecurrence.daysOfWeek?.length > 0) {
                do { current.setDate(current.getDate() + 1); }
                while (current <= end && !finalRecurrence.daysOfWeek.includes(current.getDay()));
              } else {
                current.setDate(current.getDate() + 7 * (finalRecurrence.interval || 1));
              }
            } else if (finalRecurrence.type === 'monthly') {
              current.setMonth(current.getMonth() + (finalRecurrence.interval || 1));
            } else { break; }
          }
          await batch.commit();
        } else {
          await addDoc(collection(db, COLLECTION.TASKS), {
            userId, title: finalTitle, text: finalTitle, status: 'pending',
            priority: finalPriority, date: finalDate, timeSlot: ts,
            estimatedMinutes: est, isRecurring: false, recurrenceRule: null,
            recurringSourceId: null, subject: null, tags: selectedTags,
            createdAt: serverTimestamp(), order: listCount, subtasks: subtaskObjects,
          });
        }
      } catch (e) {
        console.error('Error creating task(s):', e);
      }
    }, 150);

    resetAndClose();
  };

  return (
    <BottomSheet visible={visible} onClose={resetAndClose}>
      <View>
        <View style={[styles.newTaskInputLarge, { paddingHorizontal: 0, paddingVertical: 0, height: 'auto', backgroundColor: 'transparent', borderWidth: 0 }]}>
          <NLPTaskInput
            value={title}
            onChangeText={handleTitleChange}
            parsed={nlpParsed ?? { title, date: null, timeSlot: null, priority: 'low', isRecurring: false, recurrenceRule: null, tokens: [] }}
            onDismissToken={handleDismissToken}
            autoFocus={visible}
            placeholder="Add a task... try 'report friday 3pm high'"
            onSubmitEditing={() => handleSave()}
            onAutoSubmit={(t) => handleSave(t)}
            onMicPress={() => setShowDictationOverlay(true)}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autoStyle1}>
          <View style={styles.quickOptionsRow}>
            <AnimatedPressable
              style={[
                styles.quickChip,
                taskDate !== today && { backgroundColor: 'rgba(96, 165, 250, 0.08)', borderColor: 'rgba(96, 165, 250, 0.3)' }
              ]}
              onPress={() => setIsCalendarOpen(true)}
            >
              <Ionicons name="calendar-outline" size={13} color={taskDate !== today ? '#60a5fa' : '#8e8e93'} />
              <Text style={[styles.quickChipText, taskDate !== today && { color: '#60a5fa', fontWeight: '500' }]}>
                {dateLabel}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[
                styles.quickChip,
                !!startTime && { backgroundColor: 'rgba(52, 211, 153, 0.08)', borderColor: 'rgba(52, 211, 153, 0.3)' }
              ]}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="time-outline" size={13} color={startTime ? '#34d399' : '#8e8e93'} />
              <Text style={[styles.quickChipText, startTime && { color: '#34d399', fontWeight: '500' }]}>
                {timeLabel}
              </Text>
            </AnimatedPressable>

            {startTime !== '' && (
              <AnimatedPressable
                style={[
                  styles.quickChip,
                  !!endTime && { backgroundColor: 'rgba(52, 211, 153, 0.08)', borderColor: 'rgba(52, 211, 153, 0.3)' }
                ]}
                onPress={() => setShowEndPicker(true)}
              >
                <Ionicons name="arrow-forward" size={13} color={endTime ? '#34d399' : '#8e8e93'} />
                <Text style={[styles.quickChipText, endTime && { color: '#34d399', fontWeight: '500' }]}>
                  {endTime ? formatTimeDisplay(endTime) : 'End time'}
                </Text>
              </AnimatedPressable>
            )}

            <AnimatedPressable
              style={[
                styles.quickChip,
                priority !== 'low' && {
                  backgroundColor: priority === 'high' ? 'rgba(248, 113, 113, 0.08)' : 'rgba(251, 146, 60, 0.08)',
                  borderColor: priority === 'high' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(251, 146, 60, 0.3)',
                }
              ]}
              onPress={() => setPriority(priority === 'low' ? 'medium' : priority === 'medium' ? 'high' : 'low')}
            >
              <View style={[
                styles.priorityDot,
                {
                  backgroundColor: priority === 'high' ? '#f87171' : priority === 'medium' ? '#fb923c' : 'transparent',
                  borderWidth: priority === 'low' ? 1.2 : 0,
                  borderColor: '#8e8e93',
                }
              ]} />
              <Text style={[
                styles.quickChipText,
                priority !== 'low' && { color: priority === 'high' ? '#f87171' : '#fb923c', fontWeight: '500' }
              ]}>
                {priority === 'low' ? 'Priority' : priority === 'medium' ? 'Medium' : 'High'}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[
                styles.quickChip,
                (showSubtasks || subtasks.length > 0) && { backgroundColor: 'rgba(165, 153, 255, 0.08)', borderColor: 'rgba(165, 153, 255, 0.3)' }
              ]}
              onPress={() => setShowSubtasks(v => !v)}
            >
              <Ionicons name="list-outline" size={13} color={showSubtasks || subtasks.length > 0 ? '#a599ff' : '#8e8e93'} />
              <Text style={[styles.quickChipText, (showSubtasks || subtasks.length > 0) && { color: '#a599ff', fontWeight: '500' }]}>
                Subtask{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[
                styles.quickChip,
                !!recurrenceRule && { backgroundColor: 'rgba(192, 132, 252, 0.08)', borderColor: 'rgba(192, 132, 252, 0.3)' }
              ]}
              onPress={() => setShowRecurrenceModal(true)}
            >
              <Ionicons name={recurrenceRule ? 'repeat' : 'repeat-outline'} size={13} color={recurrenceRule ? '#c084fc' : '#8e8e93'} />
              <Text style={[styles.quickChipText, recurrenceRule && { color: '#c084fc', fontWeight: '500' }]}>
                {recurrenceRule ? (recurrenceRule.type === 'custom' ? `Every ${recurrenceRule.interval}d` : recurrenceRule.type.charAt(0).toUpperCase() + recurrenceRule.type.slice(1)) : 'Repeat'}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[
                styles.quickChip,
                (showTagInput || selectedTags.length > 0) && { backgroundColor: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.3)' }
              ]}
              onPress={() => setShowTagInput(v => !v)}
            >
              <Ionicons name="pricetag-outline" size={13} color={showTagInput || selectedTags.length > 0 ? '#38bdf8' : '#8e8e93'} />
              <Text style={[styles.quickChipText, (showTagInput || selectedTags.length > 0) && { color: '#38bdf8', fontWeight: '500' }]}>
                {selectedTags.length > 0 ? `${selectedTags.length} label${selectedTags.length > 1 ? 's' : ''}` : 'Labels'}
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>

        {showTagInput && (
          <View style={styles.tagsPanel}>
            {selectedTags.length > 0 && (
              <View style={styles.tagPillsRow}>
                {selectedTags.map(tag => (
                  <TouchableOpacity key={tag} style={[styles.tagChip, { backgroundColor: tagColorFor(tag) + '22', borderColor: tagColorFor(tag) + '55' }]} onPress={() => removeSelectedTag(tag)}>
                    <Text style={[styles.tagChipText, { color: tagColorFor(tag) }]}>{tag}</Text>
                    <Ionicons name="close" size={10} color={tagColorFor(tag)} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {tagLibrary.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {tagLibrary.filter(t => !selectedTags.includes(t)).slice(0, 8).map(tag => (
                    <TouchableOpacity key={tag} style={styles.tagSuggestion} onPress={() => addTag(tag)}>
                      <Text style={[styles.tagSuggestionText, { color: tagColorFor(tag) }]}>#{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.tagInput, { color: '#fff', borderColor: '#2c2c2e', backgroundColor: '#1c1c1e' }]}
                placeholder="New label..."
                placeholderTextColor="#636366"
                value={newTagInput}
                onChangeText={setNewTagInput}
                onSubmitEditing={() => addTag(newTagInput)}
                returnKeyType="done"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.tagAddBtn} onPress={() => addTag(newTagInput)}>
                <Ionicons name="add" size={18} color="#60a5fa" />
              </TouchableOpacity>
            </View>
          </View>
        )}

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

        {showStartPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (startTime) { const [h, m] = startTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time" display="default" onChange={onStartTimeChange}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={(() => { const d = new Date(); if (endTime) { const [h, m] = endTime.split(':'); d.setHours(+h, +m); } return d; })()}
            mode="time" display="default" onChange={onEndTimeChange}
          />
        )}

        <UniversalCalendarModal
          visible={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          selectedDate={taskDate}
          onDateSelect={(d) => setTaskDate(d)}
          title="Pick a Date"
        />

        <AnimatedPressable
          style={[styles.addTaskBtnFull, !title.trim() && styles.addTaskBtnDisabled]}
          onPress={() => handleSave()}
          disabled={!title.trim() || saving}
        >
          <Ionicons
            name={saving ? 'hourglass-outline' : 'add-circle-outline'}
            size={16}
            color={title.trim() ? '#000000' : '#636366'}
          />
          <Text style={[styles.addTaskBtnFullText, !title.trim() && styles.addTaskBtnDisabledText]}>
            {saving ? 'Adding Task...' : 'Add task'}
          </Text>
        </AnimatedPressable>
      </View>
      <RecurrencePickerModal
        visible={showRecurrenceModal}
        onClose={() => setShowRecurrenceModal(false)}
        initialRule={recurrenceRule}
        onSave={setRecurrenceRule}
      />
      <VoiceDictationOverlay 
        visible={showDictationOverlay}
        onClose={() => setShowDictationOverlay(false)}
        onTasksExtracted={handleVoiceTasksExtracted}
      />
    </BottomSheet>
  );
});

export default NewTaskModal;
