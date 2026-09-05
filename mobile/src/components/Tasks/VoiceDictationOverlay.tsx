import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeOut, withRepeat, withTiming, withSequence, withDelay,
  useSharedValue, useAnimatedStyle, Easing, cancelAnimation
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startVADRecording,
  stopAndGetBase64,
  cancelVoiceRecording,
  isSilenceOrNoise,
  VoiceState
} from '../../services/voiceEngine';
import { transcribeAudioViaProxy } from '../../services/geminiProxy';
import { parseNLTasks, parseLocalDate, toYMD, ParsedTask, cleanTaskTitle, formatRecurrenceLabel } from '../../utils/dateUtils';
import { today, formatTimeDisplay, formatDisplayDate, Priority, TAG_STORAGE_KEY, tagColorFor } from '../../screens/tasks/taskConstants';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { scheduleSingleTaskReminder } from '../../services/notifications';
import { safeWrite } from '../../utils/safeWrite';
import { saveTaskLocationReminder } from '../../services/geofenceService';
import { LocationPickerModal } from './LocationPickerModal';
import { collection, doc, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { COLORS, FONT_FAMILY } from '../../theme/tokens';
import type { Task, RecurrenceRule } from '../../contexts/MobileDataContext';
import UniversalCalendarModal from '../UniversalCalendarModal';
import RecurrencePickerModal from './RecurrencePickerModal';

export interface VoiceDictationOverlayProps {
  visible: boolean;
  onClose: () => void;
  onTasksExtracted?: (tasks: any[]) => void;
  onTaskCreated?: (task: any) => void;
  selectedDate?: string;
  userId?: string;
}

export interface EditableVoiceTask {
  id: string;
  title: string;
  date: string;
  timeSlot: string | null;
  endTimeSlot: string | null;
  priority: Priority;
  isRecurring: boolean;
  recurrenceRule: RecurrenceRule | null;
  tags: string[];
  subtasks: string[];
  durationMinutes: number;
  isReminder: boolean;
  locationReminder?: any | null;
  locationName?: string;
  rawSegment?: string;
}

// Sub-component: Soundwave Equalizer Bars for voice visualizer
function SoundWaveBars({ active }: { active: boolean }) {
  const bar1 = useSharedValue(6);
  const bar2 = useSharedValue(10);
  const bar3 = useSharedValue(16);
  const bar4 = useSharedValue(22);
  const bar5 = useSharedValue(16);
  const bar6 = useSharedValue(10);
  const bar7 = useSharedValue(6);

  useEffect(() => {
    if (active) {
      bar1.value = withRepeat(withSequence(withTiming(20, { duration: 320 }), withTiming(6, { duration: 320 })), -1, true);
      bar2.value = withDelay(80, withRepeat(withSequence(withTiming(28, { duration: 380 }), withTiming(8, { duration: 380 })), -1, true));
      bar3.value = withDelay(160, withRepeat(withSequence(withTiming(36, { duration: 300 }), withTiming(10, { duration: 300 })), -1, true));
      bar4.value = withDelay(240, withRepeat(withSequence(withTiming(42, { duration: 350 }), withTiming(14, { duration: 350 })), -1, true));
      bar5.value = withDelay(120, withRepeat(withSequence(withTiming(34, { duration: 400 }), withTiming(10, { duration: 400 })), -1, true));
      bar6.value = withDelay(180, withRepeat(withSequence(withTiming(28, { duration: 340 }), withTiming(8, { duration: 340 })), -1, true));
      bar7.value = withDelay(60, withRepeat(withSequence(withTiming(20, { duration: 360 }), withTiming(6, { duration: 360 })), -1, true));
    } else {
      cancelAnimation(bar1);
      cancelAnimation(bar2);
      cancelAnimation(bar3);
      cancelAnimation(bar4);
      cancelAnimation(bar5);
      cancelAnimation(bar6);
      cancelAnimation(bar7);
      bar1.value = withTiming(6);
      bar2.value = withTiming(10);
      bar3.value = withTiming(16);
      bar4.value = withTiming(22);
      bar5.value = withTiming(16);
      bar6.value = withTiming(10);
      bar7.value = withTiming(6);
    }
  }, [active]);

  const style1 = useAnimatedStyle(() => ({ height: bar1.value }));
  const style2 = useAnimatedStyle(() => ({ height: bar2.value }));
  const style3 = useAnimatedStyle(() => ({ height: bar3.value }));
  const style4 = useAnimatedStyle(() => ({ height: bar4.value }));
  const style5 = useAnimatedStyle(() => ({ height: bar5.value }));
  const style6 = useAnimatedStyle(() => ({ height: bar6.value }));
  const style7 = useAnimatedStyle(() => ({ height: bar7.value }));

  return (
    <View style={visualizerStyles.waveContainer}>
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF6961' }, style1]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style2]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style3]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style4]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style5]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style6]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF6961' }, style7]} />
    </View>
  );
}

const visualizerStyles = StyleSheet.create({
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 44,
    marginTop: 20,
  },
  bar: {
    width: 5,
    borderRadius: 4,
  },
});

const EXAMPLE_PHRASES = [
  {
    prefix: 'Submit lab report ',
    highlight1: 'tomorrow 5pm high priority',
    mid: ' with subtasks ',
    highlight2: 'intro, code, slides #college',
  },
  {
    prefix: 'Chest workout ',
    highlight1: 'every Monday, Wed, Fri at 7:00 AM',
    mid: ' for ',
    highlight2: '1.5 hours',
  },
  {
    prefix: 'Remind me to ',
    highlight1: 'call mentor today at 4:30 PM',
    mid: ' with ',
    highlight2: 'alarm',
  },
  {
    prefix: 'Study physics at 9am, ',
    highlight1: 'also hit the gym at 6pm,',
    mid: ' and ',
    highlight2: 'pay electricity bill by Friday',
  },
];

const DURATION_CYCLE = [0, 15, 30, 45, 60, 90, 120, 180];

export default function VoiceDictationOverlay({
  visible,
  onClose,
  onTasksExtracted,
  onTaskCreated,
  selectedDate,
  userId,
}: VoiceDictationOverlayProps) {
  const insets = useSafeAreaInsets();
  const { user, optimisticAddTask } = useCoreData();
  const [state, setState] = useState<VoiceState | 'preview' | 'saving' | 'success'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [rawTranscript, setRawTranscript] = useState('');
  const [exampleIndex, setExampleIndex] = useState(0);

  // Multi-task state
  const [tasks, setTasks] = useState<EditableVoiceTask[]>([]);
  const [activeTaskIdx, setActiveTaskIdx] = useState(0);

  // Sub-modals for active task editing
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [tagLibrary, setTagLibrary] = useState<string[]>([]);

  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toYMD(d);
  })();

  // Load tag library for quick chips
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(TAG_STORAGE_KEY).then(raw => {
      if (raw) {
        try { setTagLibrary(JSON.parse(raw)); } catch (_) {}
      }
    });
  }, [visible]);

  // Cycle example phrases
  useEffect(() => {
    if (!visible || state === 'preview' || state === 'processing' || state === 'saving' || state === 'success') return;
    const interval = setInterval(() => {
      setExampleIndex(prev => (prev + 1) % EXAMPLE_PHRASES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [visible, state]);

  // Main lifecycle when modal opens / closes
  useEffect(() => {
    if (visible) {
      glowScale.value = withRepeat(
        withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      resetState();
      handleStartRecording();
    } else {
      cleanup();
    }
  }, [visible]);

  const cleanup = () => {
    cancelVoiceRecording().catch(() => {});
    setState('idle');
    setErrorMsg('');
    setRawTranscript('');
    setTasks([]);
    setActiveTaskIdx(0);
    closeAllModals();
  };

  const resetState = () => {
    setState('idle');
    setErrorMsg('');
    setRawTranscript('');
    setTasks([]);
    setActiveTaskIdx(0);
    closeAllModals();
  };

  const closeAllModals = () => {
    setShowCalendar(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
    setShowRecurrenceModal(false);
    setShowLocationPicker(false);
    setShowSubtaskInput(false);
    setNewSubtaskText('');
    setShowTagInput(false);
    setNewTagText('');
  };

  // Helper for active task
  const currentTask: EditableVoiceTask | undefined = tasks[activeTaskIdx] || tasks[0];

  const updateActiveTask = useCallback((partial: Partial<EditableVoiceTask>) => {
    setTasks(prev => {
      if (prev.length === 0) return prev;
      const idx = activeTaskIdx >= prev.length ? 0 : activeTaskIdx;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...partial };
      return updated;
    });
  }, [activeTaskIdx]);

  const removeTaskAt = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTasks(prev => {
      const filtered = prev.filter((_, i) => i !== idx);
      if (filtered.length === 0) {
        setState('idle');
        return [];
      }
      if (activeTaskIdx >= filtered.length) {
        setActiveTaskIdx(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  // ─── Parsing & Multi-Task Setup ──────────────────────────────────────────
  const handleParsedSpokenText = (spokenText: string) => {
    setRawTranscript(spokenText);
    const parsedList: ParsedTask[] = parseNLTasks(spokenText);

    if (parsedList.length === 0) {
      setErrorMsg("Couldn't extract tasks. Tap mic to try again.");
      setState('idle');
      return;
    }

    const mappedTasks: EditableVoiceTask[] = parsedList.map((pt, idx) => {
      return {
        id: `voice_${Date.now()}_${idx}`,
        title: cleanTaskTitle(pt.title?.trim() || spokenText.trim()),
        date: pt.date || selectedDate || today,
        timeSlot: pt.timeSlot || null,
        endTimeSlot: pt.endTimeSlot || null,
        priority: (pt.priority as Priority) || 'low',
        isRecurring: pt.isRecurring || false,
        recurrenceRule: pt.recurrenceRule ? (pt.recurrenceRule as any) : null,
        tags: pt.tags || [],
        subtasks: pt.subtasks || [],
        durationMinutes: pt.durationMinutes || 0,
        isReminder: !!pt.isReminder,
        locationReminder: pt.locationReminder || null,
        locationName: pt.locationName,
      };
    });

    setTasks(mappedTasks);
    setActiveTaskIdx(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState('preview');
  };

  // ─── High-Speed Direct Voice Extraction (Fast STT + Instant Local NLP) ─────
  const handleAudioPayload = async (base64Audio: string) => {
    setState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // 1. Fast Single-Shot Transcription via Gemini Proxy (< 1s)
      const transcribedText = await transcribeAudioViaProxy(base64Audio);
      if (!transcribedText || isSilenceOrNoise(transcribedText)) {
        setErrorMsg("Couldn't recognize any task speech. Please tap the mic and try again.");
        setState('idle');
        return;
      }

      // 2. Instant (0ms) Deterministic Local NLP Parser: title, date, time, priority, recurrence, tags
      handleParsedSpokenText(transcribedText.trim());

    } catch (err) {
      console.error('[VoiceDictation] Audio processing error:', err);
      setErrorMsg('Failed to process voice audio. Please try again.');
      setState('idle');
    }
  };

  // ─── Recording Controls ───────────────────────────────────────────────────
  const handleStartRecording = async () => {
    resetState();
    await startVADRecording(
      {
        onStateChange: (newState) => {
          if (newState === 'recording' || newState === 'idle') {
            setState(newState);
          }
        },
        onAudioReady: (base64) => {
          handleAudioPayload(base64);
        },
        onTranscript: async (spokenText) => {
          if (!spokenText || isSilenceOrNoise(spokenText)) {
            setErrorMsg('No clear speech detected. Please tap the mic and try again.');
            setState('idle');
            return;
          }
          setState('processing');
          handleParsedSpokenText(spokenText.trim());
        },
        onError: (err) => {
          setErrorMsg(err);
          setState('idle');
        },
      },
      () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    );
  };

  const handleStopAndProcess = async () => {
    setState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const base64 = await stopAndGetBase64();
    if (!base64) {
      setState('idle');
      return;
    }

    await handleAudioPayload(base64);
  };

  const handleToggleMic = () => {
    if (state === 'recording') {
      handleStopAndProcess();
    } else {
      handleStartRecording();
    }
  };

  // ─── User Editing Helpers ─────────────────────────────────────────────────
  const cyclePriority = () => {
    if (!currentTask) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next: Priority = currentTask.priority === 'low' ? 'medium' : currentTask.priority === 'medium' ? 'high' : 'low';
    updateActiveTask({ priority: next });
  };

  const cycleDuration = () => {
    if (!currentTask) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = currentTask.durationMinutes || 0;
    const currIdx = DURATION_CYCLE.indexOf(current);
    const nextIdx = (currIdx + 1) % DURATION_CYCLE.length;
    updateActiveTask({ durationMinutes: DURATION_CYCLE[nextIdx] });
  };

  const toggleReminder = () => {
    if (!currentTask) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextVal = !currentTask.isReminder;
    updateActiveTask({ isReminder: nextVal });
    if (nextVal && !currentTask.timeSlot) {
      setShowStartTimePicker(true);
    }
  };

  const removeTag = (tagToRemove: string) => {
    if (!currentTask) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateActiveTask({ tags: currentTask.tags.filter(t => t !== tagToRemove) });
  };

  const addTag = (tagToAdd: string) => {
    if (!currentTask) return;
    const clean = tagToAdd.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (!clean || currentTask.tags.includes(clean)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateActiveTask({ tags: [...currentTask.tags, clean] });
    setNewTagText('');
    setShowTagInput(false);
  };

  const removeSubtask = (subtaskIdx: number) => {
    if (!currentTask) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateActiveTask({ subtasks: currentTask.subtasks.filter((_, i) => i !== subtaskIdx) });
  };

  const handleAddSubtask = () => {
    if (!currentTask || !newSubtaskText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateActiveTask({ subtasks: [...currentTask.subtasks, newSubtaskText.trim()] });
    setNewSubtaskText('');
  };

  const calcEstMinutes = (s: string, e: string) => {
    if (!s || !e || !s.includes(':') || !e.includes(':')) return 0;
    const [sH, sM] = s.split(':').map(Number);
    const [eH, eM] = e.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return diff;
  };

  const formatDurationText = (mins: number) => {
    if (!mins || mins <= 0) return 'Duration';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  // ─── Task Commit Engine ───────────────────────────────────────────────────
  const handleConfirmSaveTasks = async (keepDictating: boolean = false) => {
    if (tasks.length === 0) return;
    setState('saving');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const activeUserId = userId || user?.uid || auth.currentUser?.uid;
      if (!activeUserId) {
        setErrorMsg('User not signed in. Tasks cannot be saved.');
        setState('preview');
        return;
      }

      const savedTasksForCallback: any[] = [];

      for (const t of tasks) {
        const cleanTitle = cleanTaskTitle(t.title);
        if (!cleanTitle) continue;

        const finalDate = t.date || selectedDate || today;
        const finalTime = t.timeSlot ? (t.endTimeSlot ? `${t.timeSlot} - ${t.endTimeSlot}` : t.timeSlot) : null;
        const finalPriority = t.priority;
        const estMinutes = t.durationMinutes || (t.timeSlot && t.endTimeSlot ? calcEstMinutes(t.timeSlot, t.endTimeSlot) : 0);
        const subtaskObjects = t.subtasks.map((st, i) => ({ id: `st-${i}`, title: st, completed: false }));

        if (t.isRecurring && t.recurrenceRule) {
          // Recurring task series creation
          let startRecurrenceDate = parseLocalDate(finalDate);
          if (t.recurrenceRule.type === 'weekly' && t.recurrenceRule.daysOfWeek && t.recurrenceRule.daysOfWeek.length > 0) {
            while (!t.recurrenceRule.daysOfWeek.includes(startRecurrenceDate.getDay())) {
              startRecurrenceDate.setDate(startRecurrenceDate.getDate() + 1);
            }
          }

          let current = new Date(startRecurrenceDate.getTime());
          const end = new Date(current.getTime() + 90 * 24 * 60 * 60 * 1000);
          let count = 0;
          const MAX_INSTANCES = 90;
          const sourceId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const batch = writeBatch(db);

          while (current <= end && count < MAX_INSTANCES) {
            const docRef = doc(collection(db, COLLECTION.TASKS));
            const taskId = docRef.id;
            const dateStr = toYMD(current);

            optimisticAddTask({
              id: taskId,
              userId: activeUserId,
              title: cleanTitle,
              status: 'pending',
              priority: finalPriority,
              date: dateStr,
              timeSlot: finalTime || undefined,
              estimatedMinutes: estMinutes,
              isRecurring: true,
              recurrenceRule: t.recurrenceRule,
              recurringSourceId: sourceId,
              order: 0,
              subtasks: subtaskObjects,
              tags: t.tags,
            });

            batch.set(docRef, {
              userId: activeUserId,
              title: cleanTitle,
              text: cleanTitle,
              status: 'pending',
              priority: finalPriority,
              date: dateStr,
              timeSlot: finalTime || null,
              estimatedMinutes: estMinutes,
              isRecurring: true,
              recurrenceRule: t.recurrenceRule,
              recurringSourceId: sourceId,
              createdAt: serverTimestamp(),
              order: 0,
              subtasks: subtaskObjects,
              tags: t.tags,
            });

            count++;
            if (t.recurrenceRule.type === 'daily' || (t.recurrenceRule as any).type === 'custom') {
              current.setDate(current.getDate() + (t.recurrenceRule.interval || 1));
            } else if (t.recurrenceRule.type === 'weekly') {
              if (t.recurrenceRule.daysOfWeek && t.recurrenceRule.daysOfWeek.length > 0) {
                do { current.setDate(current.getDate() + 1); }
                while (current <= end && !t.recurrenceRule.daysOfWeek.includes(current.getDay()));
              } else {
                current.setDate(current.getDate() + 7 * (t.recurrenceRule.interval || 1));
              }
            } else if (t.recurrenceRule.type === 'monthly') {
              current.setMonth(current.getMonth() + (t.recurrenceRule.interval || 1));
            } else {
              current.setDate(current.getDate() + 1);
            }
          }
          await batch.commit().catch(e => console.warn('[VoiceDictation] Batch write failed:', e));
        } else {
          // Single task creation
          const docRef = doc(collection(db, COLLECTION.TASKS));
          const taskId = docRef.id;

          const newTaskPayload: Task = {
            id: taskId,
            userId: activeUserId,
            title: cleanTitle,
            status: 'pending',
            priority: finalPriority,
            date: finalDate,
            timeSlot: finalTime || undefined,
            estimatedMinutes: estMinutes,
            isRecurring: false,
            order: 0,
            subtasks: subtaskObjects,
            tags: t.tags,
            isReminder: t.isReminder,
            locationReminder: t.locationReminder || undefined,
          };

          optimisticAddTask(newTaskPayload);

          if (finalTime || t.isReminder) {
            scheduleSingleTaskReminder(newTaskPayload).catch(e => console.warn('[VoiceDictation] Reminder schedule error:', e));
          }

          if (t.locationReminder) {
            saveTaskLocationReminder({
              taskId,
              taskTitle: cleanTitle,
              placeName: t.locationReminder.placeName,
              latitude: t.locationReminder.latitude,
              longitude: t.locationReminder.longitude,
              radius: t.locationReminder.radius,
              triggerType: t.locationReminder.triggerType,
            }).catch(console.warn);
          }

          const taskDocData = {
            userId: activeUserId,
            title: cleanTitle,
            text: cleanTitle,
            status: 'pending',
            priority: finalPriority,
            date: finalDate,
            timeSlot: finalTime || null,
            estimatedMinutes: estMinutes,
            isRecurring: false,
            recurrenceRule: null,
            recurringSourceId: null,
            subject: null,
            createdAt: serverTimestamp(),
            order: 0,
            subtasks: subtaskObjects,
            tags: t.tags,
            isReminder: t.isReminder || false,
            locationReminder: t.locationReminder || null,
          };

          await safeWrite(
            () => setDoc(doc(db, COLLECTION.TASKS, taskId), taskDocData),
            COLLECTION.TASKS,
            'set',
            taskDocData,
            taskId
          );
        }

        savedTasksForCallback.push({
          title: cleanTitle,
          date: finalDate,
          timeSlot: finalTime,
          priority: finalPriority,
          isRecurring: t.isRecurring,
          recurrenceRule: t.recurrenceRule,
          tags: t.tags,
          subtasks: t.subtasks,
          isReminder: t.isReminder,
          durationMinutes: estMinutes,
          locationReminder: t.locationReminder,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onTasksExtracted?.(savedTasksForCallback);
      if (savedTasksForCallback.length > 0) {
        onTaskCreated?.(savedTasksForCallback[0]);
      }

      if (keepDictating) {
        // Continuous Voice NLP mode: clear tasks and immediately arm mic again
        resetState();
        handleStartRecording();
      } else {
        setState('success');
        setTimeout(() => {
          onClose();
        }, 400);
      }

    } catch (err: any) {
      console.error('[VoiceDictation] Execution error:', err);
      setErrorMsg('Failed to create task(s). Please try again.');
      setState('preview');
    }
  };

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: state === 'recording' ? glowOpacity.value : 0.2,
  }));

  if (!visible) return null;

  const currentExample = EXAMPLE_PHRASES[exampleIndex];

  // Derived labels for active task
  const activeDateLabel = currentTask?.date === today
    ? 'Today'
    : currentTask?.date === tomorrowStr
    ? 'Tomorrow'
    : currentTask?.date ? formatDisplayDate(currentTask.date) : 'Today';

  const activeRecurrenceLabel = currentTask?.isRecurring
    ? formatRecurrenceLabel(currentTask.recurrenceRule)
    : null;

  const priorityColor = currentTask?.priority === 'high' ? '#f87171' : currentTask?.priority === 'medium' ? '#fb923c' : '#8e8e93';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top }]}>
        {/* Ambient Dark Gradient Background — starts BELOW status bar so clock/icons stay visible */}
        <LinearGradient
          colors={['transparent', '#18090C', '#0B0B0E', '#050507']}
          style={StyleSheet.absoluteFillObject}
          locations={[0, 0.08, 0.45, 1]}
        />

        {/* Top Header Bar */}
        <View style={[styles.topHeader, { paddingTop: Platform.OS === 'ios' ? 5 : 5 }]}>
          <View style={styles.badgePill}>
            <Image
              source={require('../../../assets/images/sara-idle.png')}
              style={styles.mascotBadgeIcon}
            />
            <Text style={styles.badgePillText}>ZENTRACK VOICE NLP</Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.container}>
          {/* Main Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.mainTitle}>
              {state === 'preview'
                ? tasks.length > 1
                  ? `${tasks.length} Tasks Detected`
                  : 'Review & Edit Task'
                : 'Talk to create tasks'}
            </Text>
            <Text style={styles.subTitle}>
              {state === 'preview'
                ? tasks.length > 1
                  ? 'All tasks extracted from your speech. Review, edit any, or add all at once.'
                  : 'Everything connected: subtasks, start-end times, alarms, duration & tags.'
                : 'Extracts subtasks, deadlines, time ranges, recurrence & alarms instantly.'}
            </Text>
          </View>

          {/* Dynamic NLP & Status Card */}
          <View style={styles.cardContainer}>
            <LinearGradient
              colors={
                state === 'preview'
                  ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']
                  : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']
              }
              style={[
                styles.glassCard,
                state === 'preview' && { borderColor: 'rgba(255, 105, 97, 0.3)' }
              ]}
            >
              {/* Card Header */}
              <View style={styles.cardHeaderRow}>
                {state === 'processing' ? (
                  <>
                    <ActivityIndicator size="small" color="#FF6961" style={{ marginRight: 4 }} />
                    <Text style={[styles.cardHeaderText, { color: '#FF6961' }]}>TRANSCRIBING & EXTRACTING NLP...</Text>
                  </>
                ) : state === 'preview' ? (
                  <>
                    <Image
                      source={require('../../../assets/images/sara-idle.png')}
                      style={styles.mascotCardIcon}
                    />
                    <Text style={[styles.cardHeaderText, { color: '#FF6961' }]}>
                      {tasks.length > 1 ? `${tasks.length} TASKS DETECTED · TAP TO EDIT` : 'DETECTED TASK · ALL NLP CONNECTED'}
                    </Text>
                  </>
                ) : errorMsg ? (
                  <>
                    <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                    <Text style={[styles.cardHeaderText, { color: COLORS.error }]}>COULD NOT DETECT TASK</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={16} color="#A599FF" />
                    <Text style={styles.cardHeaderText}>TRY SAYING</Text>
                  </>
                )}
              </View>

              {/* Card Body Content */}
              {errorMsg ? (
                <Animated.View entering={FadeIn} exiting={FadeOut}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                  <Text style={styles.errorHint}>Tap the microphone below to speak again.</Text>
                </Animated.View>
              ) : state === 'processing' ? (
                <Animated.View entering={FadeIn} style={styles.processingContent}>
                  <Text style={styles.processingText}>Listening and parsing all tasks, subtasks, times and tags...</Text>
                </Animated.View>
              ) : state === 'preview' ? (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.previewContent}>
                  
                  {/* Multi-Task Selector Header if > 1 task */}
                  {tasks.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.multiTaskPillsRow}>
                      {tasks.map((t, idx) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.taskSelectorPill,
                            activeTaskIdx === idx && styles.taskSelectorPillActive
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setActiveTaskIdx(idx);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[
                            styles.taskSelectorPillText,
                            activeTaskIdx === idx && styles.taskSelectorPillTextActive
                          ]} numberOfLines={1}>
                            {idx + 1}. {t.title || 'Task'}
                          </Text>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              removeTaskAt(idx);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={13} color={activeTaskIdx === idx ? '#FFFFFF' : 'rgba(255,255,255,0.4)'} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* Editable Task Title Input */}
                  {currentTask && (
                    <TextInput
                      style={styles.detectedTitleInput}
                      value={currentTask.title}
                      onChangeText={(val) => updateActiveTask({ title: val })}
                      placeholder="Task title..."
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      multiline={false}
                      returnKeyType="done"
                    />
                  )}

                  {/* Todoist-Style Complete NLP Interactive Attribute Chips */}
                  {currentTask && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                    >
                      {/* Date Chip */}
                      <TouchableOpacity
                        style={[styles.nlpChip, styles.dateChip]}
                        onPress={() => setShowCalendar(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="calendar-outline" size={13} color="#60a5fa" />
                        <Text style={styles.dateChipText}>{activeDateLabel}</Text>
                      </TouchableOpacity>

                      {/* Recurrence Chip (Prominent position right next to Date) */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.isRecurring ? styles.recurrenceChip : styles.emptyChip
                        ]}
                        onPress={() => setShowRecurrenceModal(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="repeat-outline" size={13} color={currentTask.isRecurring ? '#c084fc' : '#8e8e93'} />
                        <Text style={[styles.recurrenceChipText, !currentTask.isRecurring && { color: '#8e8e93' }]}>
                          {activeRecurrenceLabel || 'Repeat'}
                        </Text>
                        {currentTask.isRecurring && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              updateActiveTask({ isRecurring: false, recurrenceRule: null });
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={13} color="#c084fc" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {/* Start Time Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.timeSlot ? styles.timeChip : styles.emptyChip
                        ]}
                        onPress={() => setShowStartTimePicker(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={13} color={currentTask.timeSlot ? '#34d399' : '#8e8e93'} />
                        <Text style={[styles.timeChipText, !currentTask.timeSlot && { color: '#8e8e93' }]}>
                          {currentTask.timeSlot ? formatTimeDisplay(currentTask.timeSlot) : 'Start Time'}
                        </Text>
                        {!!currentTask.timeSlot && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              updateActiveTask({ timeSlot: null });
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={13} color="#34d399" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {/* End Time Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.endTimeSlot ? styles.timeChip : styles.emptyChip
                        ]}
                        onPress={() => setShowEndTimePicker(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="arrow-forward-outline" size={13} color={currentTask.endTimeSlot ? '#34d399' : '#8e8e93'} />
                        <Text style={[styles.timeChipText, !currentTask.endTimeSlot && { color: '#8e8e93' }]}>
                          {currentTask.endTimeSlot ? formatTimeDisplay(currentTask.endTimeSlot) : 'End Time'}
                        </Text>
                        {!!currentTask.endTimeSlot && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              updateActiveTask({ endTimeSlot: null });
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={13} color="#34d399" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {/* Duration Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.durationMinutes > 0 ? styles.durationChip : styles.emptyChip
                        ]}
                        onPress={cycleDuration}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="hourglass-outline" size={13} color={currentTask.durationMinutes > 0 ? '#fbbf24' : '#8e8e93'} />
                        <Text style={[styles.durationChipText, currentTask.durationMinutes <= 0 && { color: '#8e8e93' }]}>
                          {formatDurationText(currentTask.durationMinutes)}
                        </Text>
                      </TouchableOpacity>

                      {/* Priority Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.priority !== 'low' ? styles.priorityChip : styles.emptyChip
                        ]}
                        onPress={cyclePriority}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="flag" size={12} color={priorityColor} />
                        <Text style={[styles.priorityChipText, { color: priorityColor }]}>
                          {currentTask.priority === 'high' ? 'P1 High' : currentTask.priority === 'medium' ? 'P2 Medium' : 'Priority'}
                        </Text>
                      </TouchableOpacity>

                      {/* Reminder / Alarm Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.isReminder ? styles.reminderChip : styles.emptyChip
                        ]}
                        onPress={toggleReminder}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={currentTask.isReminder ? "notifications" : "notifications-outline"} size={13} color={currentTask.isReminder ? '#f59e0b' : '#8e8e93'} />
                        <Text style={[styles.reminderChipText, !currentTask.isReminder && { color: '#8e8e93' }]}>
                          {currentTask.isReminder ? (currentTask.timeSlot ? `Alarm ${formatTimeDisplay(currentTask.timeSlot)}` : 'Alarm ON') : 'Reminder'}
                        </Text>
                      </TouchableOpacity>

                      {/* Location Chip */}
                      <TouchableOpacity
                        style={[
                          styles.nlpChip,
                          currentTask.locationReminder ? styles.locationChip : styles.emptyChip
                        ]}
                        onPress={() => setShowLocationPicker(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="location-outline" size={13} color={currentTask.locationReminder ? '#34d399' : '#8e8e93'} />
                        <Text style={[styles.locationChipText, !currentTask.locationReminder && { color: '#8e8e93' }]}>
                          {currentTask.locationReminder ? `📍 ${currentTask.locationReminder.placeName}` : 'Location'}
                        </Text>
                        {!!currentTask.locationReminder && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              updateActiveTask({ locationReminder: null, locationName: undefined });
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={13} color="#34d399" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {/* Tags Chips */}
                      {currentTask.tags.map(tag => (
                        <View key={tag} style={[styles.nlpChip, styles.tagChip]}>
                          <Ionicons name="pricetag-outline" size={11} color="#38bdf8" />
                          <Text style={styles.tagChipText}>#{tag}</Text>
                          <TouchableOpacity onPress={() => removeTag(tag)}>
                            <Ionicons name="close" size={11} color="#38bdf8" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        </View>
                      ))}

                      {/* Add Tag Quick Trigger */}
                      <TouchableOpacity
                        style={[styles.nlpChip, styles.emptyChip]}
                        onPress={() => setShowTagInput(v => !v)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={12} color="#8e8e93" />
                        <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#8e8e93' }}>Tag</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  )}

                  {/* Subtask Section */}
                  {currentTask && (
                    <View style={styles.subtasksContainer}>
                      <View style={styles.subtasksHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="list-outline" size={14} color="#a599ff" />
                          <Text style={styles.subtasksHeaderTitle}>
                            Subtasks ({currentTask.subtasks.length})
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowSubtaskInput(v => !v)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.subtaskToggleText}>
                            {showSubtaskInput ? 'Done' : '+ Add Subtask'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {currentTask.subtasks.map((st, i) => (
                        <View key={i} style={styles.subtaskRow}>
                          <Ionicons name="ellipse-outline" size={12} color="#a599ff" />
                          <Text style={styles.subtaskRowText}>{st}</Text>
                          <TouchableOpacity onPress={() => removeSubtask(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="close" size={14} color="rgba(255,255,255,0.45)" />
                          </TouchableOpacity>
                        </View>
                      ))}

                      {showSubtaskInput && (
                        <View style={styles.subtaskInputRow}>
                          <TextInput
                            style={styles.subtaskInput}
                            placeholder="Add subtask..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={newSubtaskText}
                            onChangeText={setNewSubtaskText}
                            onSubmitEditing={handleAddSubtask}
                            returnKeyType="done"
                            autoFocus
                          />
                          <TouchableOpacity style={styles.subtaskAddBtn} onPress={handleAddSubtask}>
                            <Ionicons name="add" size={16} color="#FF6961" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Inline Tag Input */}
                  {showTagInput && currentTask && (
                    <View style={styles.tagInputPanel}>
                      {tagLibrary.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {tagLibrary.filter(t => !currentTask.tags.includes(t)).slice(0, 6).map(tag => (
                              <TouchableOpacity key={tag} style={styles.tagSuggestion} onPress={() => addTag(tag)}>
                                <Text style={[styles.tagSuggestionText, { color: tagColorFor(tag) }]}>#{tag}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      )}
                      <View style={styles.tagInputRow}>
                        <TextInput
                          style={styles.tagInput}
                          placeholder="New label..."
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          value={newTagText}
                          onChangeText={setNewTagText}
                          onSubmitEditing={() => addTag(newTagText)}
                          returnKeyType="done"
                          autoCapitalize="none"
                        />
                        <TouchableOpacity style={styles.tagAddBtn} onPress={() => addTag(newTagText)}>
                          <Ionicons name="add" size={16} color="#FF6961" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Spoken Quote */}
                  {!!rawTranscript && (
                    <Text style={styles.spokenCaption} numberOfLines={1}>
                      Spoke: “{rawTranscript}”
                    </Text>
                  )}
                </Animated.View>
              ) : (
                /* Initial Rotating Examples with highlighted tokens */
                <Animated.View entering={FadeIn} exiting={FadeOut}>
                  <Text style={styles.exampleText}>
                    "{currentExample.prefix}
                    <Text style={styles.highlightText}>{currentExample.highlight1}</Text>
                    {currentExample.mid}
                    <Text style={styles.highlightText}>{currentExample.highlight2}</Text>"
                  </Text>
                </Animated.View>
              )}
            </LinearGradient>
          </View>

          {/* Sleek Voice Waveform & Mic Orb Container */}
          <View style={styles.orbArea}>
            <View style={styles.listeningContainer}>
              {/* Interactive Glow Mic Orb */}
              <TouchableOpacity
                onPress={handleToggleMic}
                activeOpacity={0.85}
                disabled={state === 'processing' || state === 'saving'}
              >
                <Animated.View style={[styles.micGlow, glowAnimatedStyle]} />
                <LinearGradient
                  colors={state === 'recording' ? ['#FF453A', '#B30006'] : ['#3A3A3C', '#2C2C2E']}
                  style={styles.micOrb}
                >
                  <Ionicons
                    name={state === 'recording' ? 'mic' : 'mic-outline'}
                    size={28}
                    color="#FFFFFF"
                  />
                </LinearGradient>
              </TouchableOpacity>

              {/* Animated Equalizer Waveform */}
              <SoundWaveBars active={state === 'recording'} />

              {/* Live Status Dot — compact, no text label */}
              <View style={styles.statusDotRow}>
                <View
                  style={[
                    styles.liveDot,
                    {
                      backgroundColor:
                        state === 'recording'
                          ? '#FF453A'
                          : state === 'processing'
                          ? '#A599FF'
                          : state === 'preview'
                          ? '#34D399'
                          : '#8E8E93',
                    },
                  ]}
                />
                <Text style={styles.statusDotLabel}>
                  {state === 'recording'
                    ? 'Listening'
                    : state === 'processing'
                    ? 'Processing'
                    : state === 'preview'
                    ? tasks.length > 1
                      ? `${tasks.length} tasks ready`
                      : 'Task ready'
                    : state === 'saving'
                    ? 'Saving'
                    : 'Idle'}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
            {state === 'recording' && (
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleStopAndProcess}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#FF453A', '#D70015']}
                  style={styles.doneBtnGradient}
                >
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                  <Text style={styles.doneBtnText}>Done Dictating</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {state === 'preview' && (
              <View style={styles.previewActionsContainer}>
                {/* Primary Action: Add Task / Add All Tasks */}
                <TouchableOpacity
                  style={styles.addTaskBtnFull}
                  onPress={() => handleConfirmSaveTasks(false)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#FF453A', '#D70015']}
                    style={styles.addTaskGradient}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.addTaskText}>
                      {tasks.length > 1 ? `Add All ${tasks.length} Tasks` : 'Add Task'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Secondary Action: Full-Width Continuous Voice Dictation */}
                <TouchableOpacity
                  style={styles.continuousBtnFull}
                  onPress={() => handleConfirmSaveTasks(true)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['rgba(255, 69, 58, 0.16)', 'rgba(255, 69, 58, 0.08)']}
                    style={styles.continuousBtnGradient}
                  >
                    <Ionicons name="mic" size={17} color="#FF6961" />
                    <Text style={styles.continuousBtnText}>
                      Add & Dictate Next Task
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Utility Actions: Re-record & Cancel Side-by-Side */}
                <View style={styles.utilityActionsRow}>
                  <TouchableOpacity
                    style={styles.utilityBtn}
                    onPress={handleStartRecording}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={15} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.utilityBtnText}>Re-record</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.utilityBtn}
                    onPress={onClose}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-outline" size={15} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.utilityBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {(state === 'idle' || state === 'error') && (
              <TouchableOpacity
                style={styles.retryPill}
                onPress={handleStartRecording}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={18} color="#FFFFFF" />
                <Text style={styles.retryPillText}>Start Voice Dictation</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Universal Date Picker Modal */}
        <UniversalCalendarModal
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          selectedDate={currentTask?.date || today}
          onDateSelect={(d) => {
            updateActiveTask({ date: d });
            setShowCalendar(false);
          }}
          title="Pick Due Date"
        />

        {/* Start Time Picker */}
        {showStartTimePicker && (
          <DateTimePicker
            value={(() => {
              const d = new Date();
              if (currentTask?.timeSlot && currentTask.timeSlot.includes(':')) {
                const [h, m] = currentTask.timeSlot.split(':');
                const parsedH = parseInt(h, 10);
                const parsedM = parseInt(m, 10);
                if (!isNaN(parsedH)) d.setHours(parsedH, isNaN(parsedM) ? 0 : parsedM);
              }
              return d;
            })()}
            mode="time"
            display="default"
            onChange={(event, d) => {
              if (Platform.OS === 'android') {
                setShowStartTimePicker(false);
                if (event.type === 'set' && d) {
                  updateActiveTask({
                    timeSlot: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
                    isReminder: true,
                  });
                }
              } else {
                if (d) {
                  updateActiveTask({
                    timeSlot: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
                    isReminder: true,
                  });
                }
              }
            }}
          />
        )}

        {/* End Time Picker */}
        {showEndTimePicker && (
          <DateTimePicker
            value={(() => {
              const d = new Date();
              if (currentTask?.endTimeSlot && currentTask.endTimeSlot.includes(':')) {
                const [h, m] = currentTask.endTimeSlot.split(':');
                const parsedH = parseInt(h, 10);
                const parsedM = parseInt(m, 10);
                if (!isNaN(parsedH)) d.setHours(parsedH, isNaN(parsedM) ? 0 : parsedM);
              }
              return d;
            })()}
            mode="time"
            display="default"
            onChange={(event, d) => {
              if (Platform.OS === 'android') {
                setShowEndTimePicker(false);
                if (event.type === 'set' && d) {
                  updateActiveTask({
                    endTimeSlot: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
                  });
                }
              } else {
                if (d) {
                  updateActiveTask({
                    endTimeSlot: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
                  });
                }
              }
            }}
          />
        )}

        {/* Recurrence Rule Modal */}
        <RecurrencePickerModal
          visible={showRecurrenceModal}
          onClose={() => setShowRecurrenceModal(false)}
          initialRule={currentTask?.recurrenceRule || null}
          onSave={(rule) => {
            updateActiveTask({
              recurrenceRule: rule,
              isRecurring: !!rule,
            });
            setShowRecurrenceModal(false);
          }}
        />

        {/* Location Picker Modal */}
        {showLocationPicker && (
          <LocationPickerModal
            visible={showLocationPicker}
            onClose={() => setShowLocationPicker(false)}
            initialValue={currentTask?.locationReminder || null}
            onSelect={(trigger) => {
              updateActiveTask({
                locationReminder: trigger,
                locationName: trigger ? trigger.placeName : undefined,
              });
              setShowLocationPicker(false);
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
  },
  badgePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#FF6961',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: 6,
    justifyContent: 'space-between',
  },
  titleSection: {
    marginTop: 0,
    marginBottom: 0,
    alignItems: 'center',
  },
  mainTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  subTitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 17,
  },
  cardContainer: {
    marginTop: 6,
  },
  glassCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardHeaderText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#A599FF',
    letterSpacing: 1,
  },
  exampleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 23,
  },
  highlightText: {
    color: '#FF6961',
    fontWeight: '700',
  },
  processingContent: {
    paddingVertical: 8,
  },
  processingText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  previewContent: {
    gap: 8,
  },
  multiTaskPillsRow: {
    marginBottom: 6,
    flexDirection: 'row',
  },
  taskSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 6,
  },
  taskSelectorPillActive: {
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
    borderColor: 'rgba(255, 69, 58, 0.5)',
  },
  taskSelectorPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    maxWidth: 130,
  },
  taskSelectorPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  detectedTitleInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  nlpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: 1,
  },
  emptyChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dateChip: {
    backgroundColor: 'rgba(96, 165, 250, 0.14)',
    borderColor: 'rgba(96, 165, 250, 0.35)',
  },
  dateChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#60a5fa',
  },
  timeChip: {
    backgroundColor: 'rgba(52, 211, 153, 0.14)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  timeChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#34d399',
  },
  durationChip: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  durationChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#fbbf24',
  },
  recurrenceChip: {
    backgroundColor: 'rgba(192, 132, 252, 0.14)',
    borderColor: 'rgba(192, 132, 252, 0.35)',
  },
  recurrenceChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#c084fc',
  },
  priorityChip: {
    backgroundColor: 'rgba(248, 113, 113, 0.14)',
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  priorityChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  reminderChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  reminderChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#f59e0b',
  },
  locationChip: {
    backgroundColor: 'rgba(52, 211, 153, 0.14)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  locationChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#34d399',
  },
  tagChip: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  tagChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#38bdf8',
  },
  subtasksContainer: {
    backgroundColor: 'rgba(165, 153, 255, 0.05)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.15)',
    gap: 4,
    marginTop: 2,
  },
  subtasksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subtasksHeaderTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#a599ff',
  },
  subtaskToggleText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#FF6961',
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  subtaskRowText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 4,
  },
  subtaskInput: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: '#FFFFFF',
    paddingVertical: 2,
  },
  subtaskAddBtn: {
    padding: 2,
  },
  tagInputPanel: {
    marginTop: 2,
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tagSuggestion: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tagSuggestionText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagInput: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: '#FFFFFF',
    paddingVertical: 2,
  },
  tagAddBtn: {
    padding: 2,
  },
  spokenCaption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
    marginTop: 2,
  },
  errorText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    color: COLORS.error,
    lineHeight: 20,
  },
  errorHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 6,
  },
  micGlow: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#FF453A',
    top: -4,
    left: -4,
  },
  micOrb: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 0,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.3,
  },
  mascotBadgeIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  mascotCardIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  doneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  doneBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  previewActionsContainer: {
    width: '100%',
    gap: 8,
  },
  addTaskBtnFull: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  addTaskGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  addTaskText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  continuousBtnFull: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  continuousBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  continuousBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#FF6961',
  },
  utilityActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  utilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  utilityBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  retryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  retryPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
