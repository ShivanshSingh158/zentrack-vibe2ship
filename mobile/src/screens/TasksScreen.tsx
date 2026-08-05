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
import MatrixView from '../components/Tasks/MatrixView';
import TaskTemplatesSheet from '../components/Tasks/TaskTemplatesSheet';
import RecurrencePickerModal from '../components/Tasks/RecurrencePickerModal';
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import { BlurView } from 'expo-blur';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import NLPTaskInput from '../components/Tasks/NLPTaskInput';
import { parseNLTask, ParsedTask, NLPToken, formatDateWithDay } from '../utils/dateUtils';
import KanbanView from '../components/Tasks/KanbanView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TaskTimeLogSheet from '../components/Tasks/TaskTimeLogSheet';
import TimeSpentSheet from '../components/Tasks/TimeSpentSheet';
import BulkRescheduleSheet from '../components/Tasks/BulkRescheduleSheet';
import { handleSyncError } from '../utils/errorUtils';


const TAG_STORAGE_KEY = 'zentrack_task_tags_v1';
const TAG_PALETTE = ['#a599ff','#60a5fa','#34d399','#f87171','#fb923c','#e879f9','#facc15','#38bdf8'];
function tagColorFor(tag: string): string {
  let h = 0; for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

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

const formatDisplayDate = (d: string) => {
  if (!d || d.length !== 10) return d;
  const [year, month, day] = d.split('-');
  return `${day}-${month}-${year.slice(2)}`;
};



// ——— TaskCard component removed to clean up code ————————————————————————————————

// ——— New Task Modal ——————————————————————————————————————————————————————————————

export const NewTaskModal = React.memo(function NewTaskModal({ visible, onClose, userId, selectedDate, listCount }: { visible: boolean, onClose: () => void, userId: string, selectedDate: string, listCount: number }) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('low');

  // NLP parsed result (live, updated on every keystroke)
  const [nlpParsed, setNlpParsed] = useState<ParsedTask | null>(null);

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagLibrary, setTagLibrary] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Load tag library on open
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

  // Reset taskDate when modal opens for a new date
  useEffect(() => { setTaskDate(selectedDate); }, [selectedDate, visible]);

  // ── NLP handler: parse on every keystroke, auto-apply detected fields ────
  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    if (text.length < 3) { setNlpParsed(null); return; }
    const parsed = parseNLTask(text);
    setNlpParsed(parsed.tokens.length > 0 ? parsed : null);
    // Auto-apply detected values to fields
    if (parsed.date && parsed.tokens.some(t => t.type === 'date')) {
      setTaskDate(parsed.date);
    }
    if (parsed.timeSlot && parsed.tokens.some(t => t.type === 'time')) {
      setStartTime(parsed.timeSlot);
      if (parsed.endTimeSlot) {
        setEndTime(parsed.endTimeSlot);
      }
    }
    if (parsed.tokens.some(t => t.type === 'priority') && parsed.priority !== priority) {
      setPriority(parsed.priority);
    }
    if (parsed.isRecurring && parsed.recurrenceRule && parsed.tokens.some(t => t.type === 'recurrence')) {
      setRecurrenceRule(parsed.recurrenceRule);
    }
  }, [priority]);

  // ── Dismiss a token type (user taps chip × to remove it) ────────────────
  const handleDismissToken = useCallback((type: NLPToken['type']) => {
    if (type === 'date')       { setTaskDate(selectedDate); }
    if (type === 'time')       { setStartTime(''); setEndTime(''); }
    if (type === 'priority')   { setPriority('low'); }
    if (type === 'recurrence') { setRecurrenceRule(null); }
    // Remove the token text from title
    if (nlpParsed) {
      const tok = nlpParsed.tokens.find(t => t.type === type);
      if (tok) {
        const cleaned = (title.slice(0, tok.start) + title.slice(tok.end))
          .replace(/\s{2,}/g, ' ').trim();
        setTitle(cleaned);
        // Re-parse without the dismissed token
        const reparsed = parseNLTask(cleaned);
        setNlpParsed(reparsed.tokens.length > 0 ? reparsed : null);
      }
    }
  }, [nlpParsed, title, selectedDate]);

  const formatTimeDisplay = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const timeLabel = startTime
    ? formatTimeDisplay(startTime)
    : 'Time';



  const dateLabel = taskDate === today ? 'Today' : taskDate === (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() ? 'Tomorrow' : formatDisplayDate(taskDate);

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
      // Always close the picker on Android — regardless of OK or Cancel
      setShowStartPicker(false);
      // Only commit the value when user tapped OK ('set'), not on every scroll tick ('change')
      if (event.type === 'set' && d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setStartTime(`${hh}:${mm}`);
      }
      // event.type === 'dismissed' → just close, no value change
    } else {
      // iOS: inline spinner, always update value as user scrolls
      if (d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setStartTime(`${hh}:${mm}`);
      }
    }
  };

  const onEndTimeChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setEndTime(`${hh}:${mm}`);
      }
    } else {
      if (d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setEndTime(`${hh}:${mm}`);
      }
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
    setRecurrenceRule(null);
    setSubtasks([]);
    setSubtaskInput('');
    setShowSubtasks(false);
    setIsCalendarOpen(false);
    setNlpParsed(null);
    setSelectedTags([]);
    setNewTagInput('');
    setShowTagInput(false);
    onClose();
  };


  const handleSave = (overrideTitle?: string) => {
    const isOverride = typeof overrideTitle === 'string';
    const rawText = isOverride ? overrideTitle : title;
    if (!rawText.trim()) return;

    // Optimistic UI update: instantly close modal and trigger haptic
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

    // Fire-and-forget network request, deferred to prevent animation frame drops
    setTimeout(async () => {
      try {
        if (finalRecurrence) {
          const batch = writeBatch(db);
          let current = new Date(finalDate);
          // If endDate provided, use it, else default to 90 days from taskDate
          const end = finalRecurrence.endDate 
            ? new Date(finalRecurrence.endDate) 
            : new Date(current.getTime() + 90 * 24 * 60 * 60 * 1000);
          
          let count = 0;
          const MAX_INSTANCES = 90; // safeguard to avoid firestore limits
          const sourceId = `rec_${Date.now()}`;
          
          while (current <= end && count < MAX_INSTANCES) {
            const dateStr = current.toISOString().slice(0, 10);
            const docRef = doc(collection(db, COLLECTION.TASKS));
            batch.set(docRef, {
              userId,
              title: finalTitle,
              text: finalTitle,
              status: 'pending',
              priority: finalPriority,
              date: dateStr,
              timeSlot: ts,
              estimatedMinutes: est,
              isRecurring: true,
              recurrenceRule: finalRecurrence,
              recurringSourceId: sourceId,
              subject: null,
              createdAt: serverTimestamp(),
              order: listCount,
              subtasks: subtaskObjects,
            });
            count++;
            
            if (finalRecurrence.type === 'daily' || finalRecurrence.type === 'custom') {
              current.setDate(current.getDate() + (finalRecurrence.interval || 1));
            } else if (finalRecurrence.type === 'weekly') {
              if (finalRecurrence.daysOfWeek && finalRecurrence.daysOfWeek.length > 0) {
                do {
                  current.setDate(current.getDate() + 1);
                } while (current <= end && !finalRecurrence.daysOfWeek.includes(current.getDay()));
              } else {
                current.setDate(current.getDate() + 7 * (finalRecurrence.interval || 1));
              }
            } else if (finalRecurrence.type === 'monthly') {
              current.setMonth(current.getMonth() + (finalRecurrence.interval || 1));
            } else {
              break;
            }
          }
          await batch.commit();
        } else {
          await addDoc(collection(db, COLLECTION.TASKS), {
            userId,
            title: finalTitle,
            text: finalTitle,
            status: 'pending',
            priority: finalPriority,
            date: finalDate,
            timeSlot: ts,
            estimatedMinutes: est,
            isRecurring: false,
            recurrenceRule: null,
            recurringSourceId: null,
            subject: null,
            tags: selectedTags,
            createdAt: serverTimestamp(),
            order: listCount,
            subtasks: subtaskObjects,
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

        {/* ── NLP-powered task title input ── */}
        <View style={[
          styles.newTaskInputLarge,
          { paddingHorizontal: 0, paddingVertical: 0, height: 'auto', backgroundColor: 'transparent', borderWidth: 0 }
        ]}>
          <NLPTaskInput
            value={title}
            onChangeText={handleTitleChange}
            parsed={nlpParsed ?? { title, date: null, timeSlot: null, priority: 'low', isRecurring: false, recurrenceRule: null, tokens: [] }}
            onDismissToken={handleDismissToken}
            autoFocus={visible}
            placeholder="Add a task... try 'report friday 3pm high'"
            onSubmitEditing={() => handleSave()}
            onAutoSubmit={(t) => handleSave(t)}
          />
        </View>

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

            {/* Repeat chip */}
            <AnimatedPressable
              style={[styles.quickChip, recurrenceRule && { borderColor: '#a599ff' }]}
              onPress={() => setShowRecurrenceModal(true)}
            >
              <Ionicons name={recurrenceRule ? 'repeat' : 'radio-button-off-outline'} size={13} color={recurrenceRule ? '#a599ff' : '#8e8e93'} />
              <Text style={[styles.quickChipText, recurrenceRule && { color: '#a599ff' }]}>
                {recurrenceRule 
                  ? (recurrenceRule.type === 'custom' ? `Every ${recurrenceRule.interval} days` : recurrenceRule.type.charAt(0).toUpperCase() + recurrenceRule.type.slice(1)) 
                  : 'Repeat'}
              </Text>
            </AnimatedPressable>

            {/* Tag chip */}
            <AnimatedPressable
              style={[styles.quickChip, selectedTags.length > 0 && { borderColor: '#60a5fa' }]}
              onPress={() => setShowTagInput(v => !v)}
            >
              <Ionicons name="pricetag-outline" size={13} color={selectedTags.length > 0 ? '#60a5fa' : '#8e8e93'} />
              <Text style={[styles.quickChipText, selectedTags.length > 0 && { color: '#60a5fa' }]}>
                {selectedTags.length > 0 ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}` : 'Labels'}
              </Text>
            </AnimatedPressable>

          </View>
        </ScrollView>

        {/* Tags panel */}
        {showTagInput && (
          <View style={styles.tagsPanel}>
            {/* Selected tags */}
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
            {/* Tag library suggestions */}
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
            {/* New tag input */}
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
          onPress={() => handleSave()}
          disabled={!title.trim() || saving}
        >
          <Text style={[styles.addTaskBtnFullText, !title.trim() && styles.addTaskBtnDisabledText]}>
            {saving ? 'Adding...' : 'Add task'}
          </Text>
        </AnimatedPressable>
      </View>
      <RecurrencePickerModal 
        visible={showRecurrenceModal}
        onClose={() => setShowRecurrenceModal(false)}
        initialRule={recurrenceRule}
        onSave={setRecurrenceRule}
      />
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
  const [recurrenceRule, setRecurrenceRule] = useState<any>(null);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
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
    setRecurrenceRule(task.recurrenceRule || null);
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
    return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const onStartChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setStartTime(`${hh}:${mm}`);
      }
    } else {
      if (d) setStartTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };
  const onEndChange = (event: any, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && d) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        setEndTime(`${hh}:${mm}`);
      }
    } else {
      if (d) setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    }
  };

  const handleDelete = async () => {
    if (task.isRecurring) {
      Alert.alert(
        'Delete Recurring Task',
        'Do you want to delete only this instance, or this and all future instances?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'This instance only',
            style: 'destructive',
            onPress: async () => {
              onClose(); // close instantly
              try {
                await deleteDoc(doc(db, COLLECTION.TASKS, task.id));
              } catch (e) { console.error(e); }
            }
          },
          {
            text: 'All future instances',
            style: 'destructive',
            onPress: async () => {
              onClose(); // close instantly
              try {
                const q = query(
                  collection(db, COLLECTION.TASKS),
                  where('userId', '==', task.userId)
                );
                const snap = await getDocs(q);

                const deleteBatch = writeBatch(db);
                snap.docs.forEach(d => {
                  const data = d.data();
                  const inSameGroup = task.recurringSourceId
                    ? data.recurringSourceId === task.recurringSourceId
                    : (data.title === task.title && data.isRecurring === true);

                  if (inSameGroup && data.date && task.date && data.date >= task.date) {
                    deleteBatch.delete(d.ref);
                  }
                });
                await deleteBatch.commit();
              } catch (e) { console.error(e); }
            }
          }
        ]
      );
    } else {
      // Close the sheet instantly, THEN show the choice dialog.
      // All Firestore writes happen in the background after the UI is already gone.
      onClose();
      setTimeout(() => {
        Alert.alert(
          'Delete Task',
          `"${task.title}"`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Today only',
              style: 'destructive',
              onPress: () => {
                deleteDoc(doc(db, COLLECTION.TASKS, task.id)).catch(handleSyncError);
              },
            },
            {
              text: 'All tasks',
              style: 'destructive',
              onPress: async () => {
                try {
                  // Batch-delete all tasks with same title for this user (any date)
                  const q = query(
                    collection(db, COLLECTION.TASKS),
                    where('userId', '==', task.userId)
                  );
                  const snap = await getDocs(q);
                  const batch = writeBatch(db);
                  snap.docs.forEach(d => {
                    if (d.data().title === task.title) {
                      batch.delete(d.ref);
                    }
                  });
                  await batch.commit();
                } catch (e) { console.error(e); }
              },
            },
          ]
        );
      }, 300); // small delay so the sheet finishes its close animation first
    }
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
      isRecurring: !!recurrenceRule,
      recurrenceRule: recurrenceRule || null,
      subtasks,
    };

    if (task.isRecurring || recurrenceRule) {
      Alert.alert(
        'Edit Task',
        'Do you want to apply these changes to this instance only, or recreate all future instances?',
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
                
                // Find and delete all future tasks with the same title and isRecurring=true
                // We only query by userId to avoid Firestore composite index errors
                const q = query(
                  collection(db, COLLECTION.TASKS),
                  where('userId', '==', task.userId)
                );
                const snap = await getDocs(q);
                
                const deleteBatch = writeBatch(db);
                snap.docs.forEach(d => {
                  const data = d.data();
                  if (data.title === task.title && data.isRecurring === true) {
                    // Only delete if the date is strictly > this task's original date
                    if (data.date && task.date && data.date > task.date) {
                       deleteBatch.delete(d.ref);
                    }
                  }
                });
                await deleteBatch.commit();

                // Re-generate new future instances based on the new recurrence rule
                if (recurrenceRule) {
                  const createBatch = writeBatch(db);
                  let current = new Date(taskDate);
                  
                  // Move to the next instance date before creating
                  if (recurrenceRule.type === 'daily' || recurrenceRule.type === 'custom') {
                    current.setDate(current.getDate() + (recurrenceRule.interval || 1));
                  } else if (recurrenceRule.type === 'weekly') {
                    if (recurrenceRule.daysOfWeek && recurrenceRule.daysOfWeek.length > 0) {
                      do {
                        current.setDate(current.getDate() + 1);
                      } while (!recurrenceRule.daysOfWeek.includes(current.getDay()));
                    } else {
                      current.setDate(current.getDate() + 7 * (recurrenceRule.interval || 1));
                    }
                  } else if (recurrenceRule.type === 'monthly') {
                    current.setMonth(current.getMonth() + (recurrenceRule.interval || 1));
                  }

                  const end = recurrenceRule.endDate 
                    ? new Date(recurrenceRule.endDate) 
                    : new Date(new Date(taskDate).getTime() + 90 * 24 * 60 * 60 * 1000);
                  
                  let count = 0;
                  const MAX_INSTANCES = 90;
                  const sourceId = task.recurringSourceId || `rec_${Date.now()}`;
                  
                  while (current <= end && count < MAX_INSTANCES) {
                    const dateStr = current.toISOString().slice(0, 10);
                    const docRef = doc(collection(db, COLLECTION.TASKS));
                    createBatch.set(docRef, {
                      ...updatePayload,
                      userId: task.userId,
                      date: dateStr,
                      recurringSourceId: sourceId,
                      createdAt: serverTimestamp(),
                      status: 'pending',
                      order: task.order || 0
                    });
                    count++;
                    
                    if (recurrenceRule.type === 'daily' || recurrenceRule.type === 'custom') {
                      current.setDate(current.getDate() + (recurrenceRule.interval || 1));
                    } else if (recurrenceRule.type === 'weekly') {
                      if (recurrenceRule.daysOfWeek && recurrenceRule.daysOfWeek.length > 0) {
                        do {
                          current.setDate(current.getDate() + 1);
                        } while (current <= end && !recurrenceRule.daysOfWeek.includes(current.getDay()));
                      } else {
                        current.setDate(current.getDate() + 7 * (recurrenceRule.interval || 1));
                      }
                    } else if (recurrenceRule.type === 'monthly') {
                      current.setMonth(current.getMonth() + (recurrenceRule.interval || 1));
                    } else {
                      break;
                    }
                  }
                  await createBatch.commit();
                }
                
                onClose();
              } catch (e) { console.error(e); }
            } 
          }
        ]
      );
    } else {
      // Non-recurring: close instantly (optimistic) then write in background
      onClose();
      updateDoc(doc(db, COLLECTION.TASKS, task.id), updatePayload).catch(handleSyncError);
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

        {/* Row 1: Date + Time chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.autoStyle5}>
          <View style={styles.quickOptionsRow}>
            <AnimatedPressable style={styles.quickChip} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={13} color="#8e8e93" />
              <Text style={styles.quickChipText}>{taskDate === today ? 'Today' : formatDisplayDate(taskDate)}</Text>
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
            <AnimatedPressable style={[styles.quickChip, recurrenceRule && { borderColor: '#a599ff' }]} onPress={() => setShowRecurrenceModal(true)}>
              <Ionicons name={recurrenceRule ? 'repeat' : 'radio-button-off-outline'} size={13} color={recurrenceRule ? '#a599ff' : '#8e8e93'} />
              <Text style={[styles.quickChipText, recurrenceRule && { color: '#a599ff' }]}>
                {recurrenceRule 
                  ? (recurrenceRule.type === 'custom' ? `Every ${recurrenceRule.interval} days` : recurrenceRule.type.charAt(0).toUpperCase() + recurrenceRule.type.slice(1)) 
                  : 'Repeat'}
              </Text>
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
      <RecurrencePickerModal 
        visible={showRecurrenceModal}
        onClose={() => setShowRecurrenceModal(false)}
        initialRule={recurrenceRule}
        onSave={setRecurrenceRule}
      />
    </BottomSheet>
  );
}
const EditTaskModal = React.memo(EditTaskModalComponent);

// â”€â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { tasks, user, optimisticUpdateTask, attendance, attendanceLogs, gymLogs, userGymPlan } = useMobileData();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'kanban'>('list');
  const [filterTag, setFilterTag] = useState<string | null>(null);

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

  // Time logging state
  const [timeLogTask, setTimeLogTask] = useState<Task | null>(null);
  const [isTimeSpentOpen, setIsTimeSpentOpen] = useState(false);

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

  // Daily Recurrence Auto-Spawn Logic
  useEffect(() => {
    if (!user || tasks.length === 0) return;

    const spawnRecurringTasks = async () => {
      const recurringTasks = tasks.filter(t => 
        t.isRecurring && 
        t.status !== 'completed' &&
        (!t.recurrenceRule || t.recurrenceRule.type === 'daily') &&
        (!t.recurrenceRule?.endDate || t.recurrenceRule.endDate >= today)
      );

      const batch = writeBatch(db);
      let spawns = 0;

      for (const src of recurringTasks) {
        const sourceId = src.recurringSourceId || src.id!;
        
        const existsForToday = tasks.some(t => 
          t.date === today && 
          (t.recurringSourceId === sourceId || t.id === sourceId)
        );

        if (!existsForToday && src.date !== today) {
          const newRef = doc(collection(db, COLLECTION.TASKS));
          batch.set(newRef, {
            ...src,
            id: undefined,
            date: today,
            recurringSourceId: sourceId,
            status: 'pending',
            completedAt: null,
            createdAt: serverTimestamp(),
          });
          spawns++;
        }
      }

      if (spawns > 0) {
        await batch.commit().catch(handleSyncError);
      }
    };

    spawnRecurringTasks();
  }, [user, tasks.length]);

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

  // Data Grouping
  const overdueTasks = React.useMemo(() => tasks.filter(t => t.date && t.date < today && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)), [tasks]);
  const inboxTasks = React.useMemo(() => tasks.filter(t => !t.date && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)), [tasks]);

  /** Parse a time string like "5:30 AM", "7:30 PM", "08:00", "14:30" → float hour (5.5, 19.5, 8, 14.5) */
  const parseTimeFloat = (timeStr?: string | null): number => {
    if (!timeStr) return Infinity;
    const t = timeStr.trim().toUpperCase();
    const isPM = t.includes('PM');
    const isAM = t.includes('AM');
    const cleaned = t.replace(/[\sAPM]+$/i, '').trim();
    const parts = cleaned.split(':');
    let h = parseInt(parts[0], 10);
    if (isNaN(h)) return Infinity;
    const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
    if (isPM || isAM) {
      if (isPM && h !== 12) h += 12;
      if (isAM && h === 12) h = 0;
    }
    return h + m / 60;
  };

  const selectedDateTasks = React.useMemo(() => {
    return tasks.filter(t => t.date === selectedDate).sort((a, b) => {
      // completed tasks always at the bottom
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      if (sortBy === 'priority') {
        const priorityScore = (p?: string) => p === 'high' || p === 'P1' ? 3 : (p === 'medium' || p === 'P2' ? 2 : (p === 'low' || p === 'P3' ? 1 : 0));
        const scoreA = priorityScore(a.priority);
        const scoreB = priorityScore(b.priority);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }

      // Default: sort by time ascending (5:30 AM → 8:00 AM → 7:30 PM → no-time tasks last)
      const startA = a.timeSlot?.split(/[-\u2013]/)[0].trim() ?? null;
      const startB = b.timeSlot?.split(/[-\u2013]/)[0].trim() ?? null;
      const timeA = parseTimeFloat(startA);
      const timeB = parseTimeFloat(startB);
      if (timeA !== timeB) return timeA - timeB;

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

  const completeTask = useCallback((task: Task, fromSwipe?: boolean) => {
    if (!task.id) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    // 1. Optimistic Update (Instant UI)
    optimisticUpdateTask(task.id, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }

    // 2. If marking complete via checkbox (not swipe), show time log sheet instead of immediate Firestore write.
    //    The sheet's onSave/onSkip callbacks do the actual Firestore write.
    if (newStatus === 'completed' && !fromSwipe) {
      setTimeLogTask(task);
      return;
    }

    // 3. Background Sync (for un-complete, or swipe-to-complete)
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

  const handleBulkReschedule = async (newDate: string, newTimeSlot?: string) => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => {
        const ref = doc(db, COLLECTION.TASKS, id);
        const updates: any = { date: newDate };
        if (newTimeSlot) updates.timeSlot = newTimeSlot;
        batch.update(ref, updates);
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
        onUpdateTask={(id, updates) => {
          optimisticUpdateTask(id, updates);
          updateDoc(doc(db, COLLECTION.TASKS, id), updates);
        }}
        onAddSubtask={() => setEditingTask(item)}
      />
    );
  }, [completeTask, isBulkEdit, selectedTaskIds, toggleTaskSelection, optimisticUpdateTask]);


  // Section data
  const sections = React.useMemo(() => {
    const arr = [];
    if (overdueTasks.length > 0) arr.push({ title: 'OVERDUE', data: overdueTasks });
    if (selectedDateTasks.length > 0 || isNewTaskOpen) arr.push({ title: selectedDate === today ? 'TODAY' : formatDateWithDay(selectedDate).toUpperCase(), data: selectedDateTasks, isSelectedDate: true });
    if (upcomingTasks.length > 0) arr.push({ title: 'UPCOMING', data: upcomingTasks });
    return arr;
  }, [overdueTasks, selectedDateTasks, upcomingTasks, selectedDate, isNewTaskOpen]);

  const sectionListExtraData = React.useMemo(
    () => ({ isBulkEdit, selectedTaskIds }),
    [isBulkEdit, selectedTaskIds]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: '#000000' }]}>
      {/* ─── PROACTIVE WIDGET (tasks-only conflicts) ─── */}
      {conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic')).length > 0 && (
        <Animated.View style={[{ paddingHorizontal: SPACE.xl, marginBottom: SPACE.md, marginTop: SPACE.sm }, headerStyle]}>
          {conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic')).map(c => (
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
            <AnimatedPressable 
              style={[
                styles.iconBtn,
                {
                  width: 34, height: 34,
                  borderRadius: 17,
                  backgroundColor: 'rgba(165,153,255,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              ]} 
              onPress={() => { setIsBulkEdit(false); setSelectedTaskIds(new Set()); }}
            >
              <Ionicons name="close" size={18} color="#A599FF" />
            </AnimatedPressable>
          ) : (
            <>
              {/* Inbox button */}
              <AnimatedPressable
                style={styles.iconBtn}
                onPress={() => {
                  if (overdueTasks.length > 0) {
                    setIsOverdueModalOpen(true);
                  } else {
                    setIsInboxModalOpen(true);
                  }
                }}
              >
                <Ionicons name="file-tray-outline" size={20} color="#FFFFFF" />
                {overdueTasks.length > 0 ? (
                  <View style={[styles.badge, { backgroundColor: '#FF6961' }]}>
                    <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>{overdueTasks.length}</Text>
                  </View>
                ) : inboxTasks.length > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{inboxTasks.length}</Text>
                  </View>
                ) : null}
              </AnimatedPressable>
              {/* ⏱ Time Spent button */}
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsTimeSpentOpen(true)}>
                <Ionicons name="timer-outline" size={20} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setViewMode(v => v === 'list' ? 'timeline' : v === 'timeline' ? 'kanban' : 'list')}>
                <Ionicons name={viewMode === 'list' ? 'time-outline' : viewMode === 'timeline' ? 'git-branch-outline' : 'list'} size={20} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsNewTaskOpen(true)}>
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* Date Selector */}
      <Animated.View style={[styles.dateSelectorContainer, dateStripStyle]}>
        <TaskDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          taskDates={taskDates}
        />
      </Animated.View>

      {/* Standard Calendar Modal for Date Strip navigation */}
      <UniversalCalendarModal
        visible={isCalendarOpen}
        onClose={handleCloseCalendar}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        title="Jump to date"
      />

      {/* Advanced Reschedule Sheet for Bulk Edit */}
      <BulkRescheduleSheet
        visible={bulkRescheduleModal}
        onClose={handleCloseBulkReschedule}
        selectedTaskIds={selectedTaskIds}
        allTasks={tasks}
        onConfirm={handleBulkReschedule}
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
            attendance={attendance}
            attendanceLogs={attendanceLogs}
            gymLogs={gymLogs}
            userGymPlan={userGymPlan}
            selectedDate={selectedDate}
          />
        </Animated.View>
      ) : viewMode === 'kanban' ? (
        <Animated.View style={[{ flex: 1 }, listStyle]}>
          <KanbanView
            tasks={tasks.filter(t => !filterTag || (t.tags ?? []).includes(filterTag))}
            onTaskPress={(t) => setEditingTask(t)}
            colors={colors}
          />
        </Animated.View>
      ) : (
      <AnimatedSectionList
        style={listStyle}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        sections={[{ title: selectedDate === today ? `Today${selectedDateTasks.length > 0 ? ` ${selectedDateTasks.length}` : ''}` : `${formatDateWithDay(selectedDate)}${selectedDateTasks.length > 0 ? ` ${selectedDateTasks.length}` : ''}`, data: selectedDateTasks } as any]}
        keyExtractor={(item: any) => item.id}
        // ── FlashList optimization pattern (2026-07-17) ──────────────────────
        // Memoized extraData prevents full re-renders when only completion/editing state changes
        extraData={sectionListExtraData}
        // Provide consistent item height for scroll position prediction
        getItemLayout={(_: any, index: number) => ({ length: 72, offset: 72 * index, index })}
        // removeClippedSubviews=false prevents the "blank scroll" flash on fast flings
        removeClippedSubviews={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        // ────────────────────────────────────────────────────────────────────
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
        renderItem={renderItem}
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
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 8, paddingTop: 10 }}>
            <Ionicons name="warning" size={24} color="#FF6961" style={{ marginRight: 12 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF' }}>Overdue Tasks</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
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
                onUpdateTask={(id, updates) => {
                  optimisticUpdateTask(id, updates);
                  updateDoc(doc(db, COLLECTION.TASKS, id), updates);
                }}
                onAddSubtask={() => {
                  setIsOverdueModalOpen(false);
                  setEditingTask(t);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BottomSheet>

      {/* INBOX MODAL */}
      <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)}>
        <View style={{ flexShrink: 1, maxHeight: 600 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 8, paddingTop: 20 }}>
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
                  onUpdateTask={(id, updates) => {
                    optimisticUpdateTask(id, updates);
                    updateDoc(doc(db, COLLECTION.TASKS, id), updates);
                  }}
                  onAddSubtask={() => {
                    setIsInboxModalOpen(false);
                    setEditingTask(t);
                  }}
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

            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsTemplatesSheetOpen(true); setIsMenuOpen(false); }}>
              <Ionicons name="copy-outline" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Task Templates</Text>
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

      {/* BULK ACTION BAR — icon-only circular buttons */}
      {isBulkEdit && (
        <Animated.View entering={FadeInUp} style={[
          styles.bulkActionBar,
          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 24 }
        ]}>
          {/* Complete */}
          <AnimatedPressable
            style={[
              styles.bulkActionCircle,
              { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(94,218,158,0.15)', borderColor: 'rgba(94,218,158,0.4)' }
            ]}
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
            <Ionicons name="checkmark" size={22} color="#5eda9e" />
          </AnimatedPressable>

          {/* Reschedule */}
          <AnimatedPressable
            style={[
              styles.bulkActionCircle,
              { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(165,153,255,0.15)', borderColor: 'rgba(165,153,255,0.4)' }
            ]}
            disabled={selectedTaskIds.size === 0}
            onPress={() => {
              if (selectedTaskIds.size === 0) return;
              setBulkRescheduleModal(true);
            }}
          >
            <Ionicons name="calendar-outline" size={22} color="#A599FF" />
          </AnimatedPressable>

          {/* Delete */}
          <AnimatedPressable
            style={[
              styles.bulkActionCircle,
              { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(255,105,97,0.15)', borderColor: 'rgba(255,105,97,0.4)' }
            ]}
            disabled={selectedTaskIds.size === 0}
            onPress={() => {
              if (selectedTaskIds.size === 0) return;
              Alert.alert('Delete Tasks', `Delete ${selectedTaskIds.size} task${selectedTaskIds.size === 1 ? '' : 's'}?`, [
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
            <Ionicons name="trash-outline" size={22} color="#ff6961" />
          </AnimatedPressable>
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

      {/* TIME LOG SHEET — appears after checkbox completion */}
      <TaskTimeLogSheet
        task={timeLogTask}
        visible={!!timeLogTask}
        onSkip={() => {
          // Complete without logging time
          if (timeLogTask?.id) {
            const completedAt = new Date().toISOString();
            (async () => {
              try {
                await awardXP('TASK_COMPLETE');
                await updateDoc(doc(db, COLLECTION.TASKS, timeLogTask.id), {
                  status: 'completed',
                  completedAt,
                });
              } catch (e) {
                console.error('[TimeLogSheet] skip write failed', e);
              }
            })();
          }
          setTimeLogTask(null);
        }}
        onSave={(taskId, actualMinutes, actualStartTime) => {
          const completedAt = new Date().toISOString();
          optimisticUpdateTask(taskId, { status: 'completed', completedAt, actualMinutes, actualStartTime });
          (async () => {
            try {
              await awardXP('TASK_COMPLETE');
              await updateDoc(doc(db, COLLECTION.TASKS, taskId), {
                status: 'completed',
                completedAt,
                actualMinutes,
                actualStartTime,
              });
            } catch (e) {
              console.error('[TimeLogSheet] save write failed', e);
            }
          })();
          setTimeLogTask(null);
        }}
      />

      {/* TIME SPENT ANALYTICS SHEET */}
      <TimeSpentSheet
        visible={isTimeSpentOpen}
        onClose={() => setIsTimeSpentOpen(false)}
        tasks={tasks}
        selectedDate={selectedDate}
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
    paddingHorizontal: 0,
    paddingTop: 0,
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
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    zIndex: 100,
  },
  bulkActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  bulkActionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
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
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 0,
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
  tagsPanel: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    gap: SPACE.sm,
  },
  tagPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  tagSuggestion: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  tagSuggestionText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  tagInputRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    alignItems: 'center',
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: FONT_SIZE.sm,
  },
  tagAddBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

