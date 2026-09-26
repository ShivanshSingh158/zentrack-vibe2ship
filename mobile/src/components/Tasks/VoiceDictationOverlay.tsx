import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  FadeIn, FadeOut, FadeInRight, FadeInDown, withRepeat, withTiming, withSequence, withDelay,
  withSpring, useSharedValue, useAnimatedStyle, Easing, cancelAnimation
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isSilenceOrNoise,
  VoiceState,
  startVADRecording,
  stopAndTranscribe,
  cancelVoiceRecording,
} from '../../services/voiceEngine';
import {
  startNativeStt,
  stopNativeStt,
  abortNativeStt,
  isNativeSttAvailable,
} from '../../services/nativeStt';
import {
  parseNLTasks,
  parseNLTask,
  parseLocalDate,
  toYMD,
  ParsedTask,
  cleanTaskTitle,
  formatRecurrenceLabel,
  normalizeVoiceTranscript,
} from '../../utils/dateUtils';
import { today, formatTimeDisplay, formatDisplayDate, Priority, TAG_STORAGE_KEY, tagColorFor } from '../../screens/tasks/taskConstants';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { scheduleSingleTaskReminder } from '../../services/notifications';
import { safeWrite } from '../../utils/safeWrite';
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
  rawSegment?: string;
}

const QUICK_TEMPLATES = [
  { icon: 'barbell-outline', text: 'Gym workout at 6pm', color: '#FF6961' },
  { icon: 'code-slash-outline', text: 'Study DSA tomorrow 4pm p1', color: '#60A5FA' },
  { icon: 'briefcase-outline', text: 'Team sync meeting tomorrow 10am', color: '#FBBF24' },
  { icon: 'cart-outline', text: 'Buy groceries: milk, eggs, bread', color: '#34D399' },
  { icon: 'school-outline', text: 'Submit lab report Friday 5pm', color: '#C084FC' },
];

// Sub-component: Fluid Dynamic Soundwave Equalizer Bars (Apple iOS Voice Memo style)
function SoundWaveBars({ active }: { active: boolean }) {
  const bar1 = useSharedValue(6);
  const bar2 = useSharedValue(9);
  const bar3 = useSharedValue(14);
  const bar4 = useSharedValue(18);
  const bar5 = useSharedValue(22);
  const bar6 = useSharedValue(18);
  const bar7 = useSharedValue(14);
  const bar8 = useSharedValue(9);
  const bar9 = useSharedValue(6);

  useEffect(() => {
    if (active) {
      const ease = Easing.bezier(0.33, 1, 0.68, 1);
      bar1.value = withRepeat(withSequence(withTiming(18, { duration: 340, easing: ease }), withTiming(6, { duration: 340, easing: ease })), -1, true);
      bar2.value = withDelay(60, withRepeat(withSequence(withTiming(26, { duration: 380, easing: ease }), withTiming(8, { duration: 380, easing: ease })), -1, true));
      bar3.value = withDelay(120, withRepeat(withSequence(withTiming(34, { duration: 310, easing: ease }), withTiming(10, { duration: 310, easing: ease })), -1, true));
      bar4.value = withDelay(180, withRepeat(withSequence(withTiming(40, { duration: 360, easing: ease }), withTiming(14, { duration: 360, easing: ease })), -1, true));
      bar5.value = withDelay(100, withRepeat(withSequence(withTiming(44, { duration: 320, easing: ease }), withTiming(16, { duration: 320, easing: ease })), -1, true));
      bar6.value = withDelay(220, withRepeat(withSequence(withTiming(38, { duration: 370, easing: ease }), withTiming(12, { duration: 370, easing: ease })), -1, true));
      bar7.value = withDelay(140, withRepeat(withSequence(withTiming(32, { duration: 330, easing: ease }), withTiming(10, { duration: 330, easing: ease })), -1, true));
      bar8.value = withDelay(80, withRepeat(withSequence(withTiming(24, { duration: 390, easing: ease }), withTiming(8, { duration: 390, easing: ease })), -1, true));
      bar9.value = withDelay(40, withRepeat(withSequence(withTiming(18, { duration: 350, easing: ease }), withTiming(6, { duration: 350, easing: ease })), -1, true));
    } else {
      cancelAnimation(bar1);
      cancelAnimation(bar2);
      cancelAnimation(bar3);
      cancelAnimation(bar4);
      cancelAnimation(bar5);
      cancelAnimation(bar6);
      cancelAnimation(bar7);
      cancelAnimation(bar8);
      cancelAnimation(bar9);
      const easeOut = Easing.out(Easing.quad);
      bar1.value = withTiming(6, { duration: 250, easing: easeOut });
      bar2.value = withTiming(9, { duration: 250, easing: easeOut });
      bar3.value = withTiming(14, { duration: 250, easing: easeOut });
      bar4.value = withTiming(18, { duration: 250, easing: easeOut });
      bar5.value = withTiming(22, { duration: 250, easing: easeOut });
      bar6.value = withTiming(18, { duration: 250, easing: easeOut });
      bar7.value = withTiming(14, { duration: 250, easing: easeOut });
      bar8.value = withTiming(9, { duration: 250, easing: easeOut });
      bar9.value = withTiming(6, { duration: 250, easing: easeOut });
    }
  }, [active]);

  const style1 = useAnimatedStyle(() => ({ height: bar1.value }));
  const style2 = useAnimatedStyle(() => ({ height: bar2.value }));
  const style3 = useAnimatedStyle(() => ({ height: bar3.value }));
  const style4 = useAnimatedStyle(() => ({ height: bar4.value }));
  const style5 = useAnimatedStyle(() => ({ height: bar5.value }));
  const style6 = useAnimatedStyle(() => ({ height: bar6.value }));
  const style7 = useAnimatedStyle(() => ({ height: bar7.value }));
  const style8 = useAnimatedStyle(() => ({ height: bar8.value }));
  const style9 = useAnimatedStyle(() => ({ height: bar9.value }));

  return (
    <View style={visualizerStyles.waveContainer}>
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#818CF8' }, style1]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style2]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#C084FC' }, style3]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#DDD6FE' }, style4]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FFFFFF' }, style5]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#DDD6FE' }, style6]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#C084FC' }, style7]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style8]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#818CF8' }, style9]} />
    </View>
  );
}

const visualizerStyles = StyleSheet.create({
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4.5,
    height: 48,
    marginTop: 16,
  },
  bar: {
    width: 4.5,
    borderRadius: 3,
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

  const [offlineNLPMode, setOfflineNLPMode] = useState(false);
  const nlpDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: prevents handleParsedSpokenText from firing more than once per recording
  const hasProcessedRef = useRef(false);

  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  // Apple Intelligence / Siri-style dual breathing radial aura
  const auraScale1 = useSharedValue(1);
  const auraScale2 = useSharedValue(1);
  const auraOpacity1 = useSharedValue(0);
  const auraOpacity2 = useSharedValue(0);

  // ── Section 7: Orb open/close morph ──────────────────────────────────────
  // orbScale: 0.88 (closed) → 1.0 (open) via overshoot spring
  // orbOpacity: 0 → 1 on open, 0 on close
  // pulseRing: 1.0 ↔ 1.35 sinusoidal while listening
  const orbScale   = useSharedValue(0.88);
  const orbOpacity = useSharedValue(0);
  const pulseRing  = useSharedValue(1);

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toYMD(d);
  })();

  // Real-time live NLP token detection as user rambles
  const liveTokens = useMemo(() => {
    if (!rawTranscript || rawTranscript.trim().length < 2) return [];
    try {
      const allParsed = parseNLTasks(normalizeVoiceTranscript(rawTranscript));
      const first = allParsed[0];
      const tokens: { icon: string; label: string; color: string; bgColor: string }[] = [];

      if (allParsed.length > 1) {
        tokens.push({
          icon: 'list-circle-outline',
          label: `${allParsed.length} Tasks Detected`,
          color: '#34D399',
          bgColor: 'rgba(52, 211, 153, 0.15)',
        });
      }

      if (first?.date) {
        tokens.push({
          icon: 'calendar-outline',
          label: first.date === today ? 'Today' : first.date === tomorrowStr ? 'Tomorrow' : formatDisplayDate(first.date),
          color: '#60A5FA',
          bgColor: 'rgba(96, 165, 250, 0.15)',
        });
      }

      if (first?.timeSlot) {
        tokens.push({
          icon: 'time-outline',
          label: formatTimeDisplay(first.timeSlot),
          color: '#34D399',
          bgColor: 'rgba(52, 211, 153, 0.15)',
        });
      }

      if (first?.priority && first.priority !== 'low') {
        tokens.push({
          icon: 'flag',
          label: first.priority.toUpperCase(),
          color: first.priority === 'high' ? '#F87171' : '#FBBF24',
          bgColor: first.priority === 'high' ? 'rgba(248, 113, 113, 0.15)' : 'rgba(251, 191, 36, 0.15)',
        });
      }

      if (first?.subtasks && first.subtasks.length > 0) {
        tokens.push({
          icon: 'checkbox-outline',
          label: `${first.subtasks.length} Subtasks`,
          color: '#C084FC',
          bgColor: 'rgba(192, 132, 252, 0.15)',
        });
      }

      if (first?.tags && first.tags.length > 0) {
        first.tags.forEach(t => {
          tokens.push({
            icon: 'pricetag-outline',
            label: `#${t}`,
            color: '#A599FF',
            bgColor: 'rgba(165, 153, 255, 0.15)',
          });
        });
      }

      return tokens;
    } catch {
      return [];
    }
  }, [rawTranscript, tomorrowStr]);

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
      // Orb morph: scale from 0.88 → 1.0 with an overshoot spring
      orbScale.value   = withSpring(1,   { damping: 20, stiffness: 260, mass: 0.8 });
      orbOpacity.value = withTiming(1,   { duration: 180 });

      // Pulse ring: starts after orb settles (250ms)
      const pulseTimer = setTimeout(() => {
        pulseRing.value = withRepeat(
          withSequence(
            withTiming(1.35, { duration: 700, easing: Easing.out(Easing.sin) }),
            withTiming(1.0,  { duration: 700, easing: Easing.in(Easing.sin) }),
          ),
          -1,
          false,
        );
      }, 250);

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
      // 100ms delay: allows the modal fade-in animation to complete before
      // native speech recognition starts. Without this, the recognizer
      // can fail to initialize on some devices.
      const armTimer = setTimeout(() => {
        handleStartRecording();
      }, 100);
      return () => { clearTimeout(armTimer); clearTimeout(pulseTimer); };
    } else {
      // Orb close: collapse back + fade
      orbScale.value   = withTiming(0.88, { duration: 220, easing: Easing.in(Easing.quad) });
      orbOpacity.value = withTiming(0, { duration: 180 });
      cancelAnimation(pulseRing);
      pulseRing.value  = withTiming(1, { duration: 100 });
      cleanup();
    }
  }, [visible]);

  // Siri-style multi-layered breathing radial aura animation
  useEffect(() => {
    if (visible && state === 'recording') {
      const ease = Easing.bezier(0.35, 0, 0.25, 1);
      auraScale1.value = withRepeat(
        withTiming(1.5, { duration: 1500, easing: ease }),
        -1,
        true
      );
      auraOpacity1.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.12, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      auraScale2.value = withDelay(
        350,
        withRepeat(
          withTiming(1.85, { duration: 1700, easing: ease }),
          -1,
          true
        )
      );
      auraOpacity2.value = withDelay(
        350,
        withRepeat(
          withSequence(
            withTiming(0.25, { duration: 850, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.06, { duration: 850, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(auraScale1);
      cancelAnimation(auraScale2);
      cancelAnimation(auraOpacity1);
      cancelAnimation(auraOpacity2);
      auraScale1.value = withTiming(1, { duration: 250 });
      auraScale2.value = withTiming(1, { duration: 250 });
      auraOpacity1.value = withTiming(0, { duration: 250 });
      auraOpacity2.value = withTiming(0, { duration: 250 });
    }
  }, [visible, state]);

  const cleanup = () => {
    abortNativeStt();
    cancelVoiceRecording().catch(() => {});
    setState('idle');
    setErrorMsg('');
    setRawTranscript('');
    setTasks([]);
    setActiveTaskIdx(0);
    setOfflineNLPMode(false);
    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);
    closeAllModals();
  };

  const resetState = () => {
    setState('idle');
    setErrorMsg('');
    setRawTranscript('');
    setTasks([]);
    setActiveTaskIdx(0);
    setOfflineNLPMode(false);
    hasProcessedRef.current = false; // reset guard for new recording
    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);
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

  // ─── Live NLP Parser for Title Input (Matches NewTaskModal Behavior) ─────────
  const handleTitleChange = useCallback((text: string) => {
    updateActiveTask({ title: text });

    if (nlpDebounceRef.current) clearTimeout(nlpDebounceRef.current);

    if (text.trim().length < 2) return;

    nlpDebounceRef.current = setTimeout(() => {
      const normalized = normalizeVoiceTranscript(text);
      const parsed = parseNLTask(normalized);
      const updates: Partial<EditableVoiceTask> = {};

      if (parsed.date && parsed.tokens.some(t => t.type === 'date')) {
        updates.date = parsed.date;
      }
      if (parsed.timeSlot && parsed.tokens.some(t => t.type === 'time')) {
        const timeParts = parsed.timeSlot.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
        updates.timeSlot = timeParts[0] || parsed.timeSlot;
        updates.endTimeSlot = parsed.endTimeSlot || (timeParts.length > 1 ? timeParts[timeParts.length - 1] : null);
      }
      if (parsed.tokens.some(t => t.type === 'priority')) {
        updates.priority = parsed.priority as Priority;
      }
      if (parsed.isRecurring && parsed.recurrenceRule && parsed.tokens.some(t => t.type === 'recurrence')) {
        updates.isRecurring = true;
        updates.recurrenceRule = parsed.recurrenceRule as any;
      }
      if (parsed.isReminder) {
        updates.isReminder = true;
      }
      if (parsed.durationMinutes != null) {
        updates.durationMinutes = parsed.durationMinutes;
      }
      if (parsed.subtasks && parsed.subtasks.length > 0) {
        updates.subtasks = parsed.subtasks;
      }

      setTasks(prev => {
        if (prev.length === 0) return prev;
        const idx = activeTaskIdx >= prev.length ? 0 : activeTaskIdx;
        const current = prev[idx];
        const newTags = (parsed.tags && parsed.tags.length > 0)
          ? Array.from(new Set([...current.tags, ...parsed.tags]))
          : current.tags;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...updates, tags: newTags };
        return updated;
      });
    }, 250);
  }, [activeTaskIdx, updateActiveTask]);

  // ─── Instant Switch to Manual/Offline NLP Mode ───────────────────────────
  const handleSwitchToManualNLP = () => {
    setErrorMsg('');
    setOfflineNLPMode(true);
    setTasks([{
      id: `voice_${Date.now()}_0`,
      title: '',
      date: selectedDate || today,
      timeSlot: null,
      endTimeSlot: null,
      priority: 'low',
      isRecurring: false,
      recurrenceRule: null,
      tags: [],
      subtasks: [],
      durationMinutes: 0,
      isReminder: false,
    }]);
    setActiveTaskIdx(0);
    setState('preview');
  };

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
    const normalized = normalizeVoiceTranscript(spokenText);
    setRawTranscript(spokenText);
    const parsedList: ParsedTask[] = parseNLTasks(normalized);

    if (parsedList.length === 0) {
      setErrorMsg("Couldn't recognize any task speech. Tap mic to try again or type below.");
      setState('idle');
      return;
    }

    const mappedTasks: EditableVoiceTask[] = parsedList.map((pt, idx) => {
      const timeParts = pt.timeSlot ? pt.timeSlot.split(/[-–—]/).map((s: string) => s.trim()).filter(Boolean) : [];
      const cleanStart = timeParts[0] || pt.timeSlot || null;
      const cleanEnd = pt.endTimeSlot || (timeParts.length > 1 ? timeParts[timeParts.length - 1] : null);
      return {
        id: `voice_${Date.now()}_${idx}`,
        title: cleanTaskTitle(pt.title?.trim() || normalized.trim()),
        date: pt.date || selectedDate || today,
        timeSlot: cleanStart,
        endTimeSlot: cleanEnd,
        priority: (pt.priority as Priority) || 'low',
        isRecurring: pt.isRecurring || false,
        recurrenceRule: pt.recurrenceRule ? (pt.recurrenceRule as any) : null,
        tags: pt.tags || [],
        subtasks: pt.subtasks || [],
        durationMinutes: pt.durationMinutes || 0,
        isReminder: !!pt.isReminder,
      };
    });

    setTasks(mappedTasks);
    setActiveTaskIdx(0);
    setOfflineNLPMode(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState('preview');
  };

  const handleApplyTemplate = (tmplText: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleParsedSpokenText(tmplText);
  };

  // ─── Recording Controls (Native OS SpeechRecognizer + Gemini VAD Fallback) ──
  const handleStartRecording = async (clearPrevious: boolean = true) => {
    if (clearPrevious) {
      resetState();
    } else {
      setErrorMsg('');
    }

    const nativeAvailable = await isNativeSttAvailable();
    if (!nativeAvailable) {
      console.log('[VoiceDictationOverlay] Native STT module unlinked in current binary, falling back to Gemini VAD');
      setState('recording');
      try {
        await startVADRecording({
          onStateChange: (newState) => {
            setState(newState);
          },
          onTranscript: (text) => {
            if (!text || !text.trim()) return;
            if (isSilenceOrNoise(text)) {
              setErrorMsg('No clear speech detected. Please tap the mic and try again.');
              setState('idle');
              return;
            }
            setState('processing');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setRawTranscript(text.trim());
            handleParsedSpokenText(text.trim());
          },
          onError: (err) => {
            setErrorMsg(err);
            setState('idle');
          },
        });
      } catch (err: any) {
        setErrorMsg(err?.message || 'Microphone error');
        setState('idle');
      }
      return;
    }

    setState('recording');
    await startNativeStt(
      {
        onStateChange: (newState) => {
          if (newState === 'listening') {
            setState('recording');
          } else if (newState === 'idle') {
            // Check if we captured spoken words: if so, auto-parse instead of dropping back to idle!
            setRawTranscript((currentTranscript) => {
              if (currentTranscript && currentTranscript.trim().length > 1 && !hasProcessedRef.current) {
                hasProcessedRef.current = true;
                setState('processing');
                handleParsedSpokenText(currentTranscript.trim());
              } else {
                setState((prev) => (prev === 'processing' || prev === 'preview' || prev === 'saving' || prev === 'success' ? prev : 'idle'));
              }
              return currentTranscript;
            });
          }
        },
        onResult: (text, isFinal) => {
          if (!text || !text.trim()) return;
          // Show interim and final text live as user speaks!
          setRawTranscript(text);
          if (isFinal && !hasProcessedRef.current) {
            if (isSilenceOrNoise(text)) {
              setErrorMsg('No clear speech detected. Please tap the mic and try again.');
              setState('idle');
              return;
            }
            hasProcessedRef.current = true;
            setState('processing');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleParsedSpokenText(text.trim());
          }
        },
        onError: (err) => {
          // If we already have captured speech, don't show error, just process!
          setRawTranscript((currentTranscript) => {
            if (currentTranscript && currentTranscript.trim().length > 1) {
              setState('processing');
              handleParsedSpokenText(currentTranscript.trim());
            } else {
              setErrorMsg(err);
              setState('idle');
            }
            return currentTranscript;
          });
        },
      },
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleStopAndProcess = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopNativeStt();

    // Trigger voiceEngine stop in case Gemini VAD fallback was active
    try {
      await stopAndTranscribe({
        onStateChange: (s) => setState(s),
        onTranscript: (t) => {
          if (t && t.trim() && !isSilenceOrNoise(t)) {
            setRawTranscript(t.trim());
            handleParsedSpokenText(t.trim());
          }
        },
        onError: (err) => {
          if (!rawTranscript || rawTranscript.trim().length <= 1) {
            setErrorMsg(err);
            setState('idle');
          }
        },
      });
    } catch (_) {}

    // Immediate fallback: if rawTranscript has content and nothing has been parsed yet, commit directly
    if (rawTranscript && rawTranscript.trim().length > 1 && state !== 'preview' && state !== 'saving' && !hasProcessedRef.current) {
      hasProcessedRef.current = true;
      setState('processing');
      handleParsedSpokenText(rawTranscript.trim());
    }
  };

  const handleToggleMic = () => {
    if (state === 'recording') {
      handleStopAndProcess();
    } else {
      handleStartRecording(true);
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
        // Re-parse with parseNLTask on save to ensure any manual edits or late-typed priority/time tokens are captured
        const parsedAgain = parseNLTask(normalizeVoiceTranscript(t.title));
        const cleanTitle = cleanTaskTitle(parsedAgain.title || t.title);
        if (!cleanTitle) continue;

        const finalDate = t.date || parsedAgain.date || selectedDate || today;
        const timeSlotToUse = t.timeSlot || parsedAgain.timeSlot;
        const endTimeSlotToUse = t.endTimeSlot || parsedAgain.endTimeSlot;
        const cleanStart = timeSlotToUse ? timeSlotToUse.split(/[-–—]/)[0].trim() : '';
        const cleanEnd = endTimeSlotToUse ? endTimeSlotToUse.split(/[-–—]/).pop()?.trim() : (timeSlotToUse && timeSlotToUse.includes('-') ? timeSlotToUse.split(/[-–—]/).pop()?.trim() : '');
        const finalTime = cleanStart ? (cleanEnd && cleanEnd !== cleanStart ? `${cleanStart} - ${cleanEnd}` : cleanStart) : null;
        const finalPriority = (t.priority && t.priority !== 'low') ? t.priority : (parsedAgain.priority || t.priority || 'low');
        const estMinutes = t.durationMinutes || parsedAgain.durationMinutes || (timeSlotToUse && endTimeSlotToUse ? calcEstMinutes(timeSlotToUse, endTimeSlotToUse) : 0);
        const subtasksList = (t.subtasks && t.subtasks.length > 0) ? t.subtasks : (parsedAgain.subtasks || []);
        const subtaskObjects = subtasksList.map((st, i) => ({ id: `st-${i}`, title: st, completed: false }));
        const tagsCombined = Array.from(new Set([...(t.tags || []), ...(parsedAgain.tags || [])]));
        const isRecur = t.isRecurring || parsedAgain.isRecurring || false;
        const recurRule = t.recurrenceRule || parsedAgain.recurrenceRule || null;
        const isReminderFinal = t.isReminder || parsedAgain.isReminder || false;

        if (isRecur && recurRule) {
          // Recurring task series creation
          let startRecurrenceDate = parseLocalDate(finalDate);
          if (recurRule.type === 'weekly' && recurRule.daysOfWeek && recurRule.daysOfWeek.length > 0) {
            while (!recurRule.daysOfWeek.includes(startRecurrenceDate.getDay())) {
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
              recurrenceRule: recurRule,
              recurringSourceId: sourceId,
              order: 0,
              subtasks: subtaskObjects,
              tags: tagsCombined,
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
              recurrenceRule: recurRule,
              recurringSourceId: sourceId,
              createdAt: serverTimestamp(),
              order: 0,
              subtasks: subtaskObjects,
              tags: tagsCombined,
            });

            count++;
            if (recurRule.type === 'daily' || (recurRule as any).type === 'custom') {
              current.setDate(current.getDate() + (recurRule.interval || 1));
            } else if (recurRule.type === 'weekly') {
              if (recurRule.daysOfWeek && recurRule.daysOfWeek.length > 0) {
                do { current.setDate(current.getDate() + 1); }
                while (current <= end && !recurRule.daysOfWeek.includes(current.getDay()));
              } else {
                current.setDate(current.getDate() + 7 * (recurRule.interval || 1));
              }
            } else if (recurRule.type === 'monthly') {
              current.setMonth(current.getMonth() + (recurRule.interval || 1));
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
            tags: tagsCombined,
            isReminder: isReminderFinal,
          };

          optimisticAddTask(newTaskPayload);

          if (finalTime || isReminderFinal) {
            scheduleSingleTaskReminder(newTaskPayload).catch(e => console.warn('[VoiceDictation] Reminder schedule error:', e));
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
            tags: tagsCombined,
            isReminder: isReminderFinal || false,
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
    transform: [{ scale: state === 'recording' ? glowScale.value : 1 }],
    opacity: state === 'recording' ? glowOpacity.value : 0,
  }));

  const aura1AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: auraScale1.value }],
    opacity: auraOpacity1.value,
  }));

  const aura2AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: auraScale2.value }],
    opacity: auraOpacity2.value,
  }));

  // Orb morph animated style — wraps the entire Modal content
  const orbMorphStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: orbScale.value }],
    opacity:   orbOpacity.value,
  }));

  // Pulse ring style — applies to the outer aura ring during listening
  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: state === 'recording' ? pulseRing.value : 1 }],
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* orbMorphStyle wraps the entire content — drives the open/close morph */}
      <Animated.View style={orbMorphStyle}>
        <View style={[styles.backdrop, { paddingTop: insets.top }]}>
          {/* Deep Obsidian Canvas Background */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#090B10' }]} />

          {/* Ambient Subtle Violet Cosmic Glow */}
          <LinearGradient
            colors={['rgba(165, 153, 255, 0.08)', 'rgba(99, 102, 241, 0.03)', 'transparent', '#090B10']}
            style={StyleSheet.absoluteFillObject}
            locations={[0, 0.25, 0.6, 1]}
          />

          {/* Clean Top Header Bar */}
          <View style={styles.topHeader}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerStatusDot, state === 'recording' && styles.headerStatusDotActive]} />
              <Text style={styles.headerTitle}>
                {state === 'preview'
                  ? tasks.length > 1
                    ? `${tasks.length} Tasks Detected`
                    : 'Review Task'
                  : 'Voice Task'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>

          {/* ═══════════════════════════════════════════════════════════════
              MODE A: REVIEW & EDIT CANVAS (when task(s) detected)
             ═══════════════════════════════════════════════════════════════ */}
          {state === 'preview' ? (
            <View style={styles.previewContainer}>
              {/* Multi-Task Selector Tabs (only shown when multiple tasks extracted) */}
              {tasks.length > 1 && (
                <View style={styles.multiTaskPillsWrapper}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.multiTaskPillsRow}
                  >
                    {tasks.map((t, idx) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.taskSelectorPill,
                          activeTaskIdx === idx && styles.taskSelectorPillActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveTaskIdx(idx);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.taskSelectorPillText,
                            activeTaskIdx === idx && styles.taskSelectorPillTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {idx + 1}. {t.title || 'Task'}
                        </Text>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            removeTaskAt(idx);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name="close-circle"
                            size={14}
                            color={activeTaskIdx === idx ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'}
                          />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Main Task Card Scrollable Area */}
              <ScrollView
                style={styles.reviewScroll}
                contentContainerStyle={styles.reviewContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.reviewCard}>
                  {/* Editable Task Title Input */}
                  <TextInput
                    style={styles.reviewTitleInput}
                    value={currentTask?.title || ''}
                    onChangeText={handleTitleChange}
                    placeholder="Task title..."
                    placeholderTextColor="rgba(255, 255, 255, 0.35)"
                    multiline
                    blurOnSubmit
                  />

                  {/* Horizontal Scrollable Attribute Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsScrollContent}
                  >
                    {/* Due Date Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, styles.attrChipActive]}
                      onPress={() => setShowCalendar(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={13} color="#60A5FA" />
                      <Text style={styles.attrChipText}>{activeDateLabel}</Text>
                      {currentTask?.date !== today && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            updateActiveTask({ date: today });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={12} color="#60A5FA" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* Start Time Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask?.timeSlot ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={() => setShowStartTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="time-outline"
                        size={13}
                        color={currentTask?.timeSlot ? '#34D399' : 'rgba(255,255,255,0.45)'}
                      />
                      <Text style={[styles.attrChipText, !currentTask?.timeSlot && styles.attrChipTextEmpty]}>
                        {currentTask?.timeSlot ? formatTimeDisplay(currentTask.timeSlot) : 'Time'}
                      </Text>
                      {!!currentTask?.timeSlot && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            updateActiveTask({ timeSlot: null });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={12} color="#34D399" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* End Time Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask?.endTimeSlot ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={() => setShowEndTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="arrow-forward-outline"
                        size={13}
                        color={currentTask?.endTimeSlot ? '#34D399' : 'rgba(255,255,255,0.45)'}
                      />
                      <Text style={[styles.attrChipText, !currentTask?.endTimeSlot && styles.attrChipTextEmpty]}>
                        {currentTask?.endTimeSlot ? formatTimeDisplay(currentTask.endTimeSlot) : 'End Time'}
                      </Text>
                      {!!currentTask?.endTimeSlot && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            updateActiveTask({ endTimeSlot: null });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={12} color="#34D399" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* Duration Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask && currentTask.durationMinutes > 0 ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={cycleDuration}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="hourglass-outline"
                        size={13}
                        color={currentTask && currentTask.durationMinutes > 0 ? '#FBBF24' : 'rgba(255,255,255,0.45)'}
                      />
                      <Text style={[styles.attrChipText, (!currentTask || currentTask.durationMinutes <= 0) && styles.attrChipTextEmpty]}>
                        {currentTask ? formatDurationText(currentTask.durationMinutes) : 'Duration'}
                      </Text>
                    </TouchableOpacity>

                    {/* Priority Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask?.priority !== 'low' ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={cyclePriority}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flag" size={13} color={priorityColor} />
                      <Text style={[styles.attrChipText, { color: priorityColor }]}>
                        {currentTask?.priority === 'high' ? 'High' : currentTask?.priority === 'medium' ? 'Medium' : 'Priority'}
                      </Text>
                    </TouchableOpacity>

                    {/* Recurrence Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask?.isRecurring ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={() => setShowRecurrenceModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="repeat-outline"
                        size={13}
                        color={currentTask?.isRecurring ? '#C084FC' : 'rgba(255,255,255,0.45)'}
                      />
                      <Text style={[styles.attrChipText, !currentTask?.isRecurring && styles.attrChipTextEmpty]}>
                        {activeRecurrenceLabel || 'Repeat'}
                      </Text>
                      {currentTask?.isRecurring && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            updateActiveTask({ isRecurring: false, recurrenceRule: null });
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={12} color="#C084FC" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {/* Reminder / Alarm Chip */}
                    <TouchableOpacity
                      style={[styles.attrChip, currentTask?.isReminder ? styles.attrChipActive : styles.attrChipEmpty]}
                      onPress={toggleReminder}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={currentTask?.isReminder ? 'notifications' : 'notifications-outline'}
                        size={13}
                        color={currentTask?.isReminder ? '#FBBF24' : 'rgba(255,255,255,0.45)'}
                      />
                      <Text style={[styles.attrChipText, !currentTask?.isReminder && styles.attrChipTextEmpty]}>
                        {currentTask?.isReminder ? 'Alarm ON' : 'Reminder'}
                      </Text>
                    </TouchableOpacity>

                    {/* Tags */}
                    {currentTask?.tags.map((tag) => (
                      <View key={tag} style={[styles.attrChip, styles.tagChip]}>
                        <Ionicons name="pricetag-outline" size={11} color="#A599FF" />
                        <Text style={[styles.attrChipText, { color: '#A599FF' }]}>#{tag}</Text>
                        <TouchableOpacity onPress={() => removeTag(tag)}>
                          <Ionicons name="close" size={11} color="#A599FF" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Add Tag Button */}
                    <TouchableOpacity
                      style={[styles.attrChip, styles.attrChipEmpty]}
                      onPress={() => setShowTagInput(v => !v)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={13} color="rgba(255,255,255,0.45)" />
                      <Text style={[styles.attrChipText, styles.attrChipTextEmpty]}>Tag</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {/* Subtasks Section */}
                  {currentTask && (
                    <View style={styles.subtasksCard}>
                      <View style={styles.subtasksHeaderRow}>
                        <Text style={styles.subtasksTitle}>
                          Subtasks {currentTask.subtasks.length > 0 ? `(${currentTask.subtasks.length})` : ''}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowSubtaskInput(v => !v)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.subtaskAddLink}>
                            {showSubtaskInput ? 'Done' : '+ Add Subtask'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {currentTask.subtasks.map((st, i) => (
                        <View key={i} style={styles.subtaskItem}>
                          <Ionicons name="radio-button-off" size={14} color="#A599FF" />
                          <Text style={styles.subtaskItemText}>{st}</Text>
                          <TouchableOpacity onPress={() => removeSubtask(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="close" size={14} color="rgba(255,255,255,0.4)" />
                          </TouchableOpacity>
                        </View>
                      ))}

                      {showSubtaskInput && (
                        <View style={styles.subtaskInputRow}>
                          <TextInput
                            style={styles.subtaskTextInput}
                            placeholder="Add subtask..."
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={newSubtaskText}
                            onChangeText={setNewSubtaskText}
                            onSubmitEditing={handleAddSubtask}
                            returnKeyType="done"
                            autoFocus
                          />
                          <TouchableOpacity style={styles.subtaskSubmitBtn} onPress={handleAddSubtask}>
                            <Ionicons name="checkmark" size={15} color="#090B10" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Inline Tag Input */}
                  {showTagInput && currentTask && (
                    <View style={styles.tagInputSection}>
                      <View style={styles.tagInputRow}>
                        <TextInput
                          style={styles.tagTextInput}
                          placeholder="New label..."
                          placeholderTextColor="rgba(255,255,255,0.35)"
                          value={newTagText}
                          onChangeText={setNewTagText}
                          onSubmitEditing={() => addTag(newTagText)}
                          returnKeyType="done"
                          autoCapitalize="none"
                          autoFocus
                        />
                        <TouchableOpacity style={styles.tagSubmitBtn} onPress={() => addTag(newTagText)}>
                          <Ionicons name="add" size={16} color="#090B10" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Review Bottom Action Area */}
              <View style={[styles.reviewFooter, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => handleConfirmSaveTasks(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>
                      {tasks.length > 1 ? `Create All ${tasks.length} Tasks` : 'Create Task'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.secondaryActionRow}>
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => handleConfirmSaveTasks(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="mic-outline" size={15} color="#A599FF" />
                    <Text style={styles.secondaryActionText}>Dictate Another</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => handleStartRecording(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={15} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.secondaryActionText}>Re-record</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* ═══════════════════════════════════════════════════════════════
               MODE B: DICTATION / LISTENING CANVAS (clean & spacious)
               ═══════════════════════════════════════════════════════════════ */
            <View style={styles.dictateContainer}>
              {/* Upper Canvas: Transcript / Prompt */}
              <View style={styles.stageArea}>
                {state === 'processing' ? (
                  <Animated.View entering={FadeIn} style={styles.processingCenter}>
                    <ActivityIndicator size="large" color="#A599FF" style={{ marginBottom: 14 }} />
                    <Text style={styles.processingTitle}>Structuring your tasks...</Text>
                    <Text style={styles.processingSubtitle}>Extracting dates, times, and subtasks</Text>
                  </Animated.View>
                ) : errorMsg ? (
                  <Animated.View entering={FadeIn} style={styles.errorCenter}>
                    <View style={styles.errorIconWrap}>
                      <Ionicons name="mic-off-outline" size={24} color="#F87171" />
                    </View>
                    <Text style={styles.errorTitle}>Didn't catch that</Text>
                    <Text style={styles.errorSubtitle}>{errorMsg}</Text>
                    <TouchableOpacity
                      style={styles.typeInsteadButton}
                      onPress={handleSwitchToManualNLP}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={13} color="#A599FF" />
                      <Text style={styles.typeInsteadText}>Type task manually</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ) : rawTranscript.trim().length > 0 ? (
                  <Animated.View entering={FadeIn.duration(150)} style={styles.transcriptContainer}>
                    <ScrollView style={styles.transcriptScroll} showsVerticalScrollIndicator={false}>
                      <Text style={styles.transcriptText}>
                        “{rawTranscript}”
                        {state === 'recording' && <Text style={styles.blinkingCursor}> ▌</Text>}
                      </Text>
                    </ScrollView>

                    {/* Subtle Live Token Badges */}
                    {liveTokens.length > 0 && (
                      <View style={styles.liveTokensStrip}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.liveTokensRow}
                        >
                          {liveTokens.map((token, i) => (
                            <View key={i} style={[styles.liveTokenChip, { borderColor: token.color }]}>
                              <Ionicons name={token.icon as any} size={11} color={token.color} />
                              <Text style={[styles.liveTokenChipText, { color: token.color }]}>
                                {token.label}
                              </Text>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </Animated.View>
                ) : (
                  /* Initial Calm Prompt */
                  <Animated.View entering={FadeIn} style={styles.promptContainer}>
                    <Text style={styles.promptHeadline}>
                      {state === 'recording' ? 'Listening...' : 'What would you like to do?'}
                    </Text>
                    <Text style={styles.promptExample}>
                      “{currentExample.prefix}{currentExample.highlight1}{currentExample.mid}{currentExample.highlight2}”
                    </Text>
                    <TouchableOpacity
                      style={styles.typeInsteadButton}
                      onPress={handleSwitchToManualNLP}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.typeInsteadText}>Or tap to type</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>

              {/* Center: Glowing Violet Orb & Equalizer */}
              <View style={styles.orbSection}>
                <TouchableOpacity
                  onPress={handleToggleMic}
                  activeOpacity={0.85}
                  disabled={state === 'processing' || state === 'saving'}
                  style={styles.orbTouchable}
                >
                  <Animated.View style={[styles.auraOuter, aura2AnimatedStyle]} />
                  <Animated.View style={[styles.auraInner, aura1AnimatedStyle]} />
                  <LinearGradient
                    colors={state === 'recording' ? ['#A599FF', '#6366F1'] : ['#1E202B', '#141620']}
                    style={[
                      styles.micOrbCircle,
                      state === 'recording' ? styles.micOrbActive : styles.micOrbIdle,
                    ]}
                  >
                    <Ionicons
                      name={state === 'recording' ? 'mic' : 'mic-outline'}
                      size={30}
                      color={state === 'recording' ? '#090B10' : '#FFFFFF'}
                    />
                  </LinearGradient>
                </TouchableOpacity>

                {/* Animated Sound Wave Equalizer Bars */}
                <SoundWaveBars active={state === 'recording'} />

                {/* Subtle Status Label */}
                <View style={styles.statusIndicator}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          state === 'recording'
                            ? '#A599FF'
                            : state === 'processing'
                            ? '#818CF8'
                            : 'rgba(255,255,255,0.35)',
                      },
                    ]}
                  />
                  <Text style={styles.statusLabel}>
                    {state === 'recording'
                      ? 'Listening...'
                      : state === 'processing'
                      ? 'Processing...'
                      : 'Tap mic to speak'}
                  </Text>
                </View>
              </View>

              {/* Bottom Action Footer */}
              <View style={[styles.footerArea, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                {state === 'recording' ? (
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={handleStopAndProcess}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Done Dictating</Text>
                  </TouchableOpacity>
                ) : rawTranscript.trim().length > 0 ? (
                  <View style={{ width: '100%', gap: 10 }}>
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => handleParsedSpokenText(rawTranscript.trim())}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Create Task</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryActionBtnFull}
                      onPress={() => handleStartRecording(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.secondaryActionText}>Speak Again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.secondaryActionBtnFull}
                    onPress={() => handleStartRecording(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="mic" size={18} color="#FFFFFF" />
                    <Text style={styles.secondaryActionBtnFullText}>Tap Mic to Dictate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

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
        </View>
      </Animated.View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#090B10',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  headerStatusDotActive: {
    backgroundColor: '#A599FF',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Mode A: Review Mode Styles ── */
  previewContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  multiTaskPillsWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  multiTaskPillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  taskSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  taskSelectorPillActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.15)',
    borderColor: '#A599FF',
  },
  taskSelectorPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  taskSelectorPillTextActive: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  reviewScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  reviewContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  reviewCard: {
    borderRadius: 22,
    padding: 20,
    backgroundColor: '#11141C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  reviewTitleInput: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 19,
    lineHeight: 26,
    color: '#FFFFFF',
    marginBottom: 16,
    padding: 0,
  },
  chipsScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 12,
  },
  attrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  attrChipActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  attrChipEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  attrChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
  attrChipTextEmpty: {
    color: 'rgba(255, 255, 255, 0.45)',
  },
  tagChip: {
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderColor: 'rgba(165, 153, 255, 0.25)',
  },
  subtasksCard: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  subtasksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subtasksTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.2,
  },
  subtaskAddLink: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    color: '#A599FF',
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  subtaskItemText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  subtaskTextInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: '#FFFFFF',
  },
  subtaskSubmitBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#A599FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagInputSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagTextInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: '#FFFFFF',
  },
  tagSubmitBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#A599FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  primaryActionButton: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: '#7C67FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#7C67FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryButtonGradient: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryActionText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  /* ── Mode B: Dictation Mode Styles ── */
  dictateContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  stageArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  processingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  processingTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 19,
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  processingSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  errorCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  errorSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 16,
  },
  transcriptContainer: {
    width: '100%',
    maxHeight: 220,
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#11141C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  transcriptScroll: {
    maxHeight: 140,
  },
  transcriptText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    lineHeight: 28,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  blinkingCursor: {
    color: '#A599FF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
  },
  liveTokensStrip: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  liveTokensRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  liveTokenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  liveTokenChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
  },
  promptContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  promptHeadline: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
  },
  promptExample: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    maxWidth: 300,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  typeInsteadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeInsteadText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  orbSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  orbTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
  },
  auraOuter: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  auraInner: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(165, 153, 255, 0.22)',
  },
  micOrbCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A599FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  micOrbActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  micOrbIdle: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  footerArea: {
    width: '100%',
    paddingTop: 8,
  },
  secondaryActionBtnFull: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(165, 153, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: '#A599FF',
  },
  secondaryActionBtnFullText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
