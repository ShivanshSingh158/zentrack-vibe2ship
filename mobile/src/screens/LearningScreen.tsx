/**
 * LearningScreen.tsx — ZenTrack Mobile (Refactored Orchestrator)
 * 
 * This file is now a thin orchestrator (~220 lines).
 * Heavy sub-components have been extracted to:
 *   - components/Learning/LearningTopicCard.tsx   (topic cards + subtask list)
 *   - components/Learning/LearningVideoPlayer.tsx  (YouTube player + AI chat + notes)
 *   - components/Learning/LearningModals.tsx       (add/edit/import modals)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  DeviceEventEmitter, Alert, LayoutAnimation, UIManager, Platform, InteractionManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { LearningTopic, LearningSubTask } from '../contexts/MobileDataContext';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { FONT_FAMILY, SHADOW, RADIUS } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { collection, updateDoc, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useNavigation } from '@react-navigation/native';
import LearningTopicCard from '../components/Learning/LearningTopicCard';
import LearningVideoPlayer from '../components/Learning/LearningVideoPlayer';
import LearningModals from '../components/Learning/LearningModals';
import { COLLECTION, GEMINI_PROXY_BASE } from '../config/constants';
import EmptyState from '../components/ui/EmptyState';
import { awardXP } from '../services/xpSystem';
import * as Haptics from 'expo-haptics';
import { fetchVideoTranscript, transcriptToPlainText } from '../services/youtubeTranscriptService';

// ── System Prompt Builders ─────────────────────────────────────────────────
// PERF FIX: Split into two functions:
// 1. buildZenGptBasePrompt — expensive, built ONCE when transcript arrives.
//    Includes the full 50k+ char transcript. Cached in tutorBasePromptRef.
// 2. buildZenGptSystemPrompt — cheap per-message wrapper that injects only
//    the current video timestamp (~5 lines). Never re-concatenates the transcript.
const buildZenGptBasePrompt = (
  videoTitle: string,
  topicName: string,
  transcript: string,
): string => {
  return `You are ZEN-GPT — a world-class expert educator and AI tutor embedded inside ZenTrack mobile.
The student is watching: 📺 "${videoTitle}" — 📚 Topic: "${topicName}"

== THE 8 LAWS OF ZEN TUTORING (NEVER BREAK) ==

1. RICHARD FEYNMAN TECHNIQUE: Explain concepts simply, as if teaching a beginner. Strip away all jargon. Use clear, vivid, everyday analogies. Never give a dense academic explanation when a simple analogy works better.

2. CODE = WORKING + EXPLAINED: For any code question:
   a) A minimal working code example (< 30 lines if possible)
   b) A line-by-line explanation of the key parts
   c) One common mistake beginners make
   Use triple backtick code blocks always.
   ADAPTIVE LANGUAGE: Always use the coding language the student asks for, or detect it from the transcript/lecture title. If unsure, ask which language before writing code.

3. ANALOGIES ARE MANDATORY: For abstract concepts, ALWAYS provide a real-world analogy BEFORE the technical explanation. e.g., "Think of a pointer like a sticky note with someone's address — the note isn't the house, it just tells you where the house is."

4. CONFUSION DETECTION: If the student says "I don't get it", "confused", "explain again" — NEVER repeat the same explanation. Instead:
   a) Ask: "Which specific part is unclear — [A] or [B]?"
   b) Break it into the smallest possible step
   c) Use a completely different analogy

5. CROSS-TOPIC CONNECTIONS: Actively connect new concepts to fundamentals. "This is the same idea as X, which you've likely seen before..."

6. FOLLOW-UP QUESTIONS: End EVERY response with 2 specific, intellectually curious follow-up questions:
   💡 **Ask next:** "Question 1?" · "Question 2?"
   Must be specific to THIS lecture's content — not generic.

7. QUIZ MODE (triggered by "quiz me", "test me", "quiz"):
   - Exactly 3 MCQ questions labeled Q1, Q2, Q3
   - Each tests understanding, not memorization
   - Difficulty: Q1 = conceptual, Q2 = applied, Q3 = tricky edge case
   - Options format strictly as:
     A) Option A
     B) Option B
     C) Option C
     D) Option D
   - Do NOT reveal answers until student responds
   - After response, explain WHY each option is right/wrong

8. NOTES MODE (triggered by "save this", "make notes", "summarize for notes"):
   - Start with ## [Clear Title]
   - Structure: Key concept → How it works → Code example → When to use it
   - Make it a self-contained reference the student can study from later
   - Include timestamps if available

== RESPONSE FORMAT ==
- **bold** for key terms, \`inline code\` for snippets, fenced code blocks for all code
- Numbered lists for steps, bullets for features/options/comparisons
- Use ## and ### headers to organize detailed responses
- Write as deeply as the topic demands — NEVER artificially truncate a response
- Complex topics deserve full explanations with multiple examples, edge cases, and analogies
- NEVER start with "Sure!", "Of course!", "Great question!" — get directly to the explanation
- Always finish every thought completely

${transcript
  ? `=== VIDEO TRANSCRIPT (with timestamps) ===
Reference timestamps precisely when answering: "At 4:32, she explains..." — quote directly from the transcript when relevant.

${transcript}
=== END TRANSCRIPT ===`
  : '(No transcript available — answer from the video title, topic, and your deep expert knowledge of this subject.)'}`.trimEnd();
};

/**
 * Per-message wrapper — injects only the current playback second.
 * The base prompt (with 50k+ char transcript) is passed by reference from the
 * cached ref, so no re-concatenation of the transcript happens per message.
 */
const buildZenGptSystemPrompt = (
  basePrompt: string,
  currentVideoSecond?: number,
): string => {
  if (currentVideoSecond === undefined) return basePrompt;
  return `${basePrompt}\nStudent is currently at: ${formatSeconds(currentVideoSecond)} in the video.`;
};

const formatSeconds = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function LearningScreen() {
  const { learningTopics, optimisticToggleSubtask, ensureSubscribed } = useCreativeData();
  const { user } = useCoreData();
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  // ΓöÇΓöÇ Modal state ΓöÇΓöÇ
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [subtaskModalVisible, setSubtaskModalVisible] = useState(false);
  const [roadmapModalVisible, setRoadmapModalVisible] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [activeOptionsData, setActiveOptionsData] = useState<{ type: 'topic' | 'subtask'; topicId: string; subtaskId?: string } | null>(null);

  // ΓöÇΓöÇ UI state ΓöÇΓöÇ
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});

  // ΓöÇΓöÇ Video state ΓöÇΓöÇ
  const [activeVideoSub, setActiveVideoSub] = useState<LearningSubTask | null>(null);
  const [activeVideoTopicId, setActiveVideoTopicId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPip, setIsPip] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNativeFullScreen, setIsNativeFullScreen] = useState(false);
  const playerRef = useRef<any>(null);
  const [videoLayout, setVideoLayout] = useState({ width: 300, height: 200 });

  // ── AI chat state ──
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ role: string; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.6-flash');

  useEffect(() => {
    AsyncStorage.getItem('zen_preferred_learning_model').then(m => {
      if (m) setSelectedModel(m);
    });
  }, []);

  const toggleModel = () => {
    Haptics.selectionAsync().catch(() => {});
    const nextModel = selectedModel === 'gemini-3.6-flash' ? 'gemini-2.5-flash' : 'gemini-3.6-flash';
    setSelectedModel(nextModel);
    AsyncStorage.setItem('zen_preferred_learning_model', nextModel).catch(console.error);
  };

  // ── ZEN-GPT Tutor context (persisted for full session) ──
  const tutorSystemPromptRef = useRef<string>('');
  // PERF FIX: base prompt (with full transcript) is cached separately.
  // Per-message, only the ~5-line timestamp header is recalculated on top.
  const tutorBasePromptRef = useRef<string>('');
  const tutorConversationRef = useRef<{ role: string; parts: { text: string }[] }[]>([]);
  const tutorTranscriptRef = useRef<string>('');
  const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  // ΓöÇΓöÇ Notes state ΓöÇΓöÇ
  const [notesVisible, setNotesVisible] = useState(false);
  const [currentNotes, setCurrentNotes] = useState('');

  // ΓöÇΓöÇ Sara voice event listener ΓöÇΓöÇ
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('agent-play-video', () => {
      const firstTopic = learningTopics[0];
      if (!firstTopic) return;
      const firstSub = firstTopic.subTasks?.find(s => !s.isCompleted && s.url && s.url.includes('youtu'));
      if (firstSub) openVideo(firstTopic.id!, firstSub);
      else Alert.alert('Sara', 'Could not find an uncompleted lecture to play.');
    });
    return () => sub.remove();
  }, [learningTopics]);

  // ── Hide tab bar only when a video lecture is open ──
  useEffect(() => {
    const baseTabBarStyle = {
      position: 'absolute' as const,
      bottom: 20,
      left: 20,
      right: 20,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.borderHover,
      elevation: 20,
      height: 70,
      overflow: 'hidden' as const,
      paddingBottom: 0,
    };

    if (activeVideoSub && !isPip) {
      navigation.setOptions({ tabBarStyle: { display: 'none' } });
    } else {
      navigation.setOptions({ tabBarStyle: baseTabBarStyle });
    }
    return () => navigation.setOptions({ tabBarStyle: baseTabBarStyle });
  }, [activeVideoSub, isPip, navigation]);

  // ΓöÇΓöÇ Helpers ΓöÇΓöÇ
  const extractVideoId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const toggleTopic = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSet = new Set(expandedTopics);
    if (newSet.has(id)) {
      newSet.delete(id);
      setVisibleLimits(prev => ({ ...prev, [id]: 15 }));
    } else {
      newSet.add(id);
    }
    setExpandedTopics(newSet);
  };

  const loadMoreSubTasks = (topicId: string) => {
    setVisibleLimits(prev => ({ ...prev, [topicId]: (prev[topicId] || 15) + 30 }));
  };

  const toggleSubtask = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const subtask = topic.subTasks?.find(s => s.id === subtaskId);
    if (!subtask) return;
    const willBeCompleted = !subtask.isCompleted;

    // 1. 0ms Instant Optimistic UI Update
    optimisticToggleSubtask(topicId, subtaskId, willBeCompleted);

    // 2. Tactical Haptic & XP Feedback
    if (willBeCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      awardXP('LECTURE_COMPLETE').catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    // 3. Clean Firestore Payload (NEVER pass undefined inside array elements)
    const todayIso = new Date().toISOString().slice(0, 10);
    const updatedSubtasks = (topic.subTasks || []).map(s => {
      if (s.id !== subtaskId) return s;
      const cleanSub: any = {
        ...s,
        isCompleted: willBeCompleted,
      };
      if (willBeCompleted) {
        cleanSub.completedDate = todayIso;
      } else {
        delete cleanSub.completedDate;
      }
      return cleanSub;
    });

    try {
      await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, topicId), { subTasks: updatedSubtasks });
    } catch (e) {
      console.warn('[LearningScreen] toggleSubtask Firestore sync error:', e);
    }
  };

  const togglePin = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, pinned: !s.pinned } : s
    );
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, topicId), { subTasks: updatedSubtasks }); } catch (e) {}
  };

  const showTopicOptions = (id: string) => {
    setActiveOptionsData({ type: 'topic', topicId: id });
    setOptionsModalVisible(true);
  };

  const showSubtaskOptions = (topicId: string, subtaskId: string) => {
    setActiveOptionsData({ type: 'subtask', topicId, subtaskId });
    setOptionsModalVisible(true);
  };

  const onDragEnd = async ({ data }: { data: LearningTopic[] }) => {
    Haptics.selectionAsync();
    try {
      const batch = writeBatch(db);
      data.forEach((topic, index) => {
        if (topic.id) {
          batch.update(doc(db, COLLECTION.LEARNING_TOPICS, topic.id), { order: index });
        }
      });
      await batch.commit();
    } catch (error) {
      console.warn('[LearningScreen] Topic reorder offline sync pending:', error);
    }
  };



  const openVideo = async (topicId: string, sub: LearningSubTask) => {
    const vidId = extractVideoId(sub.url);
    if (!vidId) { Alert.alert('Invalid URL', 'Only YouTube links are supported.'); return; }

    // ── INSTANT: Show video player immediately, don't wait for context ────────
    setActiveVideoTopicId(topicId);
    setActiveVideoSub(sub);
    setPlaying(true);
    setIsPip(false);
    setIsFocusMode(false);
    setAiChatVisible(true);
    setNotesVisible(false);
    setCurrentNotes(sub.notes || '');

    const videoTitle = sub.title?.trim() || 'this lecture';
    const topic = learningTopics.find(t => t.id === topicId);
    const topicName = topic?.title || 'your learning path';

    // Set placeholder UI state while context loads in background
    tutorConversationRef.current = [];
    tutorTranscriptRef.current = '';
    const emptyBase = buildZenGptBasePrompt(videoTitle, topicName, '');
    tutorBasePromptRef.current = emptyBase;
    tutorSystemPromptRef.current = emptyBase;
    setAiHistory([{ role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}**. ⏳ Loading context...` }]);
    setTranscriptStatus('loading');

    // ── BACKGROUND: Load all context in parallel ───────────────────────────
    const [localNotes, chatRaw, cachedTranscript, videoTimeStr] = await Promise.all([
      AsyncStorage.getItem(`@lecture_notes_${sub.id}`).catch(() => null),
      AsyncStorage.getItem(`@lecture_chat_${sub.id}`).catch(() => null),
      AsyncStorage.getItem(`@lecture_transcript_${vidId}`).catch(() => null),
      AsyncStorage.getItem(`@video_time_${sub.id}`).catch(() => null),
    ]);

    // 1. Apply notes (prefer local draft if longer)
    const bestNotes = (localNotes && localNotes.trim().length > (sub.notes || '').trim().length)
      ? localNotes : (sub.notes || '');
    setCurrentNotes(bestNotes);

    // 2. Restore saved video position
    if (videoTimeStr && playerRef.current) {
      playerRef.current.seekTo(parseInt(videoTimeStr, 10), true);
    }

    // 3. Parse saved chat
    let savedChat: { role: string; text: string }[] | null = null;
    if (chatRaw) {
      try {
        const parsed = JSON.parse(chatRaw);
        if (Array.isArray(parsed) && parsed.length > 0) savedChat = parsed;
      } catch { /* ignore */ }
    }

    // 4. Build system prompt from transcript (cached or fetched)
    const resolveTranscript = async (): Promise<string> => {
      if (cachedTranscript) return cachedTranscript;
      try {
        const res = await fetchVideoTranscript(vidId, videoTitle);
        const content = transcriptToPlainText(res.cues);
        if (content) AsyncStorage.setItem(`@lecture_transcript_${vidId}`, content).catch(() => {});
        return content;
      } catch {
        return '';
      }
    };

    const transcript = await resolveTranscript();
    tutorTranscriptRef.current = transcript;
    const basePrompt = buildZenGptBasePrompt(videoTitle, topicName, transcript);
    tutorBasePromptRef.current = basePrompt;
    tutorSystemPromptRef.current = basePrompt;
    setTranscriptStatus(transcript ? 'ready' : 'unavailable');

    // 5. Restore chat or show fresh welcome
    if (savedChat) {
      setAiHistory(savedChat);
      tutorConversationRef.current = savedChat
        .filter(m => m.text && !m.text.startsWith('⚠️'))
        .map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
    } else {
      const statusMsg = transcript
        ? `✅ **Lecture transcript loaded** (~${transcript.split('\n').length} cues). I know this lecture in precise detail. Ask me anything!`
        : `🎓 I am ready to tutor you on **${videoTitle}** (${topicName}). Ask me any concept, code explanation, or quiz!`;
      const welcomeHistory = [
        { role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}** (${topicName}). 🎓` },
        { role: 'model', text: statusMsg },
      ];
      setAiHistory(welcomeHistory);
      AsyncStorage.setItem(`@lecture_chat_${sub.id}`, JSON.stringify(welcomeHistory)).catch(() => {});
    }
  };

  const closeVideo = async () => {
    if (activeVideoSub) {
      try {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const time = await playerRef.current.getCurrentTime();
          if (time > 0) {
            await AsyncStorage.setItem(`@video_time_${activeVideoSub.id}`, Math.floor(time).toString());
          }
        }
        if (currentNotes) {
          await AsyncStorage.setItem(`@lecture_notes_${activeVideoSub.id}`, currentNotes);
        }
      } catch (e) {}

      // Auto-save notes to Firestore
      if (activeVideoTopicId && currentNotes) {
        const topic = learningTopics.find(t => t.id === activeVideoTopicId);
        if (topic) {
          const updated = (topic.subTasks || []).map(s =>
            s.id === activeVideoSub.id ? { ...s, notes: currentNotes } : s
          );
          updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeVideoTopicId), { subTasks: updated }).catch(() => {});
        }
      }
    }
    setActiveVideoSub(null);
    setAiChatVisible(false);
    setNotesVisible(false);
    setIsFocusMode(false);
  };

  const saveNotes = async () => {
    if (!activeVideoTopicId || !activeVideoSub) return;
    const topic = learningTopics.find(t => t.id === activeVideoTopicId);
    if (!topic) return;
    const updated = (topic.subTasks || []).map(s =>
      s.id === activeVideoSub.id ? { ...s, notes: currentNotes } : s
    );
    try {
      await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeVideoTopicId), { subTasks: updated });
      await AsyncStorage.setItem(`@lecture_notes_${activeVideoSub.id}`, currentNotes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Notes Saved', 'Your lecture notes have been saved.');
    } catch (e) {}
  };

  const generateQuiz = async () => {
    await sendAiMessage('Quiz me on this lecture. Give me 3 multiple-choice questions (A/B/C/D). Label them Q1, Q2, Q3. Do NOT reveal the answers yet.');
  };

  const sendAiMessage = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? aiInput).trim();
    if (!msg || aiLoading) return;
    if (!overrideText) setAiInput('');

    const userMsg = { role: 'user', text: msg };
    const newHistory = [...aiHistory, userMsg];
    setAiHistory(newHistory);
    setAiLoading(true);

    // Build context: inject current playback second so AI can reference timestamps precisely
    let currentSecond: number | undefined;
    try {
      if (playerRef.current?.getCurrentTime) {
        currentSecond = Math.floor(await playerRef.current.getCurrentTime());
      }
    } catch { /* ignore */ }

    // Refresh system prompt with current playback position.
    // PERF FIX: Only recalculates the ~5-line timestamp header on top of the
    // cached base prompt — never re-concatenates the full transcript string.
    if (activeVideoSub) {
      tutorSystemPromptRef.current = buildZenGptSystemPrompt(
        tutorBasePromptRef.current,
        currentSecond,
      );
    }

    // Build full multi-turn conversation for Gemini
    const userTurn = { role: 'user', parts: [{ text: msg }] };
    const conversationHistory = [...tutorConversationRef.current, userTurn];

    try {
      const data = await callProxy({
        model: selectedModel || 'gemini-3.7-flash',
        // PERF FIX: Build conversation array in-place. userTurn is pushed onto
        // the ref array directly — no O(n) spread copy. The ref array IS the
        // contents array, so Gemini always sees the full history.
        contents: (() => {
          tutorConversationRef.current.push({ role: 'user', parts: [{ text: msg }] });
          return tutorConversationRef.current;
        })(),
        systemInstruction: tutorSystemPromptRef.current,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 32768,
        },
      });

      const { text: reply } = parseProxyResponse(data);
      if (!reply) throw new Error('Empty response from ZEN-GPT');

      // Persist conversation history for multi-turn memory — push in-place (O(1))
      tutorConversationRef.current.push({ role: 'model', parts: [{ text: reply }] });

      const updatedAiHistory = [...newHistory, { role: 'model', text: reply }];
      setAiHistory(updatedAiHistory);

      // Persist to local storage & Firestore cloud per subtask
      if (activeVideoSub) {
        AsyncStorage.setItem(`@lecture_chat_${activeVideoSub.id}`, JSON.stringify(updatedAiHistory)).catch(() => {});
        if (user?.uid) {
          setDoc(doc(db, 'lectureChats', user.uid, 'videos', activeVideoSub.id), {
            messages: updatedAiHistory,
            updatedAt: Date.now(),
            videoTitle: activeVideoSub.title || '',
            topicId: activeVideoTopicId || '',
          }, { merge: true }).catch(() => {});
        }

        // PERF FIX: Chat pruning — cap total stored lecture chats to 5.
        // Old approach: getAllKeys → multiGet(all) → JSON.parse all → sort by length. O(n) I/O.
        // New approach: getAllKeys → count only → if > 5, sort by key ID substring (no I/O).
        // The key format is @lecture_chat_<subId>. We can compare IDs lexicographically
        // as a proxy for age (older subtask IDs are lexicographically earlier when
        // using timestamp-based IDs). No value reads needed.
        AsyncStorage.getAllKeys().then(keys => {
          const chatKeys = keys.filter(k => k.startsWith('@lecture_chat_'));
          // Fast path: under the limit, skip all I/O
          if (chatKeys.length <= 5) return;

          const currentKey = `@lecture_chat_${activeVideoSub.id}`;
          const otherKeys = chatKeys.filter(k => k !== currentKey);
          // Sort oldest-first by key ID suffix (lexicographic ≈ creation order for timestamp IDs)
          otherKeys.sort();
          // Remove all excess keys beyond slot 4 (keep 4 others + current = 5 total)
          const excessKeys = otherKeys.slice(4);
          for (const k of excessKeys) {
            AsyncStorage.removeItem(k).catch(() => {});
          }
        }).catch(() => {});
      }

      // Deep Work XP: Detect 3/3 perfect quiz evaluation
      if (
        /(\b3\/3\b|\b3 out of 3\b|\bscore:\s*3\/3\b|\bperfect score\b|\ball 3 correct\b)/i.test(reply)
      ) {
        await awardXP('QUIZ_PERFECT');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      const errHistory = [...newHistory, { role: 'model', text: `⚠️ Error connecting to ZEN-GPT: ${e?.message || 'Please try again.'}` }];
      setAiHistory(errHistory);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiHistory, activeVideoSub, activeVideoTopicId, learningTopics, playerRef, user]);

  const resetChatHistory = useCallback(async () => {
    if (!activeVideoSub) return;
    const videoTitle = activeVideoSub.title || 'this lecture';
    const topic = learningTopics.find(t => t.id === activeVideoTopicId);
    const topicName = topic?.title || 'your learning path';

    tutorConversationRef.current = [];
    const freshWelcome = [
      { role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}** (${topicName}). 🎓` },
      { role: 'model', text: tutorTranscriptRef.current ? `✅ **Lecture transcript loaded**. I know this lecture in detail with exact timestamps. Ask me anything!` : `🎓 I am ready to tutor you on **${videoTitle}**. Ask me anything!` },
    ];
    setAiHistory(freshWelcome);
    await AsyncStorage.removeItem(`@lecture_chat_${activeVideoSub.id}`).catch(() => {});
    if (user?.uid) {
      await setDoc(doc(db, 'lectureChats', user.uid, 'videos', activeVideoSub.id), {
        messages: freshWelcome,
        updatedAt: Date.now(),
      }, { merge: true }).catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [activeVideoSub, activeVideoTopicId, learningTopics, user]);

  const sortedTopics = [...learningTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

  const renderListHeader = () => (
    <View style={{ marginBottom: 24, paddingHorizontal: 10 }}>
      {/* Single header row: icon + title LEFT, "+ Quick import" RIGHT */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <View style={s.headerIconWrapper}>
          <Ionicons name="book" size={20} color={colors.accentPrimary} />
        </View>
        <Text style={[s.screenTitle, { marginLeft: 12, flex: 1 }]}>Learn</Text>
        <TouchableOpacity
          onPress={() => setRoadmapModalVisible(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 20,
            backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.10)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)',
          }}
        >
          <Ionicons name="sparkles" size={14} color={colors.accentPrimary} />
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>Quick import</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTopicModalVisible(true)}
          style={{
            marginLeft: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.accentPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="add" size={22} color={isDark ? '#080510' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  function renderTopicCard(params: any) {
    return (
      <LearningTopicCard
        {...params}
        expandedTopics={expandedTopics}
        visibleLimits={visibleLimits}
        toggleTopic={toggleTopic}
        toggleSubtask={toggleSubtask}
        togglePin={togglePin}
        showTopicOptions={showTopicOptions}
        showSubtaskOptions={showSubtaskOptions}
        loadMoreSubTasks={loadMoreSubTasks}
        extractVideoId={extractVideoId}
        openVideo={openVideo}
        setActiveTopicId={setActiveTopicId}
        setSubtaskModalVisible={setSubtaskModalVisible}
      />
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <DraggableFlatList
        data={sortedTopics}
        keyExtractor={t => t.id!}
        contentContainerStyle={s.list}
        ListHeaderComponent={renderListHeader}
        renderItem={renderTopicCard}
        onDragEnd={onDragEnd}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="Expand your mind"
            subtitle="No learning topics yet. Add a video or topic to start."
            action={{
              label: "New Topic",
              onPress: () => {
                setTopicTitle('');
                setTopicModalVisible(true);
              }
            }}
          />
        }
      />

      {activeVideoSub && extractVideoId(activeVideoSub.url) && (
        <LearningVideoPlayer
          activeVideoSub={activeVideoSub}
          extractVideoId={extractVideoId}
          playerRef={playerRef}
          playing={playing}
          setPlaying={setPlaying}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          isPip={isPip}
          setIsPip={setIsPip}
          isFocusMode={isFocusMode}
          setIsFocusMode={setIsFocusMode}
          isNativeFullScreen={isNativeFullScreen}
          setIsNativeFullScreen={setIsNativeFullScreen}
          videoLayout={videoLayout}
          setVideoLayout={setVideoLayout}
          aiChatVisible={aiChatVisible}
          setAiChatVisible={setAiChatVisible}
          notesVisible={notesVisible}
          setNotesVisible={setNotesVisible}
          aiHistory={aiHistory}
          aiInput={aiInput}
          setAiInput={setAiInput}
          aiLoading={aiLoading}
          sendAiMessage={sendAiMessage}
          generateQuiz={generateQuiz}
          currentNotes={currentNotes}
          setCurrentNotes={setCurrentNotes}
          saveNotes={saveNotes}
          closeVideo={closeVideo}
          resetChatHistory={resetChatHistory}
          onSelectLecture={openVideo}
          selectedModel={selectedModel}
          onToggleModel={toggleModel}
        />
      )}

      {(topicModalVisible || subtaskModalVisible || roadmapModalVisible || optionsModalVisible) && (
        <LearningModals
          user={user}
          learningTopics={learningTopics}
          topicModalVisible={topicModalVisible}
          setTopicModalVisible={setTopicModalVisible}
          topicTitle={topicTitle}
          setTopicTitle={setTopicTitle}
          subtaskModalVisible={subtaskModalVisible}
          setSubtaskModalVisible={setSubtaskModalVisible}
          activeTopicId={activeTopicId}
          subTitle={subTitle}
          setSubTitle={setSubTitle}
          subUrl={subUrl}
          setSubUrl={setSubUrl}
          roadmapModalVisible={roadmapModalVisible}
          setRoadmapModalVisible={setRoadmapModalVisible}
          playlistUrl={playlistUrl}
          setPlaylistUrl={setPlaylistUrl}
          optionsModalVisible={optionsModalVisible}
          setOptionsModalVisible={setOptionsModalVisible}
          activeOptionsData={activeOptionsData}
          setActiveOptionsData={setActiveOptionsData}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 8, paddingTop: 18, paddingBottom: 100 },
  headerIconWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? colors.accentDim : 'rgba(108,92,231,0.12)', justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
  searchBar: { backgroundColor: colors.surface2 || colors.surface, borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  searchText: { fontFamily: FONT_FAMILY.body, color: colors.textMuted, fontSize: 13 },
  primaryBlockBtn: { backgroundColor: colors.accentPrimary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  empty: { padding: 24, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: colors.textMuted, fontSize: 13 },
});
