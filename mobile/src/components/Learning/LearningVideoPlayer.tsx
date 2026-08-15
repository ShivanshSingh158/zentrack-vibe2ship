import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, KeyboardAvoidingView, Keyboard, Animated, AppState, ActivityIndicator, LayoutAnimation, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { FONT_FAMILY } from '../../theme/tokens';
import { useMobileData, LearningSubTask } from '../../contexts/MobileDataContext';
import { fetchVideoTranscript, TranscriptCue, TranscriptResult } from '../../services/youtubeTranscriptService';
import { generateFlashcardsFromContext, saveFlashcardsToFirestore } from '../../services/flashcardService';
import VsCodeSyntaxHighlighter from './VsCodeSyntaxHighlighter';
import LectureChatHistoryModal from './LectureChatHistoryModal';
import LectureMindMap from './LectureMindMap';
import InlineCodeRunner, { isRunnable } from './InlineCodeRunner';

interface LearningVideoPlayerProps {
  activeVideoSub: LearningSubTask;
  extractVideoId: (url?: string) => string | null;
  playerRef: React.RefObject<any>;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  playbackRate: number;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
  isPip: boolean;
  setIsPip: (v: boolean) => void;
  isFocusMode: boolean;
  setIsFocusMode: (v: boolean) => void;
  isNativeFullScreen: boolean;
  setIsNativeFullScreen: (v: boolean) => void;
  videoLayout: { width: number; height: number };
  setVideoLayout: (v: { width: number; height: number }) => void;
  aiChatVisible: boolean;
  setAiChatVisible: (v: boolean) => void;
  notesVisible: boolean;
  setNotesVisible: (v: boolean) => void;
  aiHistory: { role: string; text: string }[];
  aiInput: string;
  setAiInput: (v: string) => void;
  aiLoading: boolean;
  sendAiMessage: (overrideText?: string) => void;
  generateQuiz: () => void;
  currentNotes: string;
  setCurrentNotes: (v: string) => void;
  saveNotes: () => void;
  closeVideo: () => void;
  resetChatHistory?: () => void;
  onSelectLecture?: (topicId: string, sub: LearningSubTask) => void;
}

export default function LearningVideoPlayer({
  activeVideoSub, extractVideoId, playerRef, playing, setPlaying,
  playbackRate, setPlaybackRate, isPip, setIsPip,
  isFocusMode, setIsFocusMode, isNativeFullScreen, setIsNativeFullScreen,
  videoLayout, setVideoLayout, aiChatVisible, setAiChatVisible,
  notesVisible, setNotesVisible, aiHistory, aiInput, setAiInput,
  aiLoading, sendAiMessage, generateQuiz, currentNotes, setCurrentNotes,
  saveNotes, closeVideo, resetChatHistory, onSelectLecture,
}: LearningVideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [appState, setAppState] = useState(AppState.currentState);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);

  // ── Transcript State ──
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(-1);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const transcriptScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => setAppState(nextState));
    return () => sub.remove();
  }, []);

  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
  const handleSpeedChange = () => {
    const currentIndex = SPEEDS.indexOf(playbackRate);
    const nextIndex = currentIndex === -1 || currentIndex === SPEEDS.length - 1 ? 0 : currentIndex + 1;
    const nextRate = SPEEDS[nextIndex];
    setPlaybackRate(nextRate);
    try {
      if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
        playerRef.current.setPlaybackRate(nextRate);
      }
    } catch (e) {}
  };

  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isChatFullScreen, setIsChatFullScreen] = useState(false);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const chatScrollRef = useRef<ScrollView>(null);

  const videoId = extractVideoId(activeVideoSub.url);

  // Fetch transcript cues
  useEffect(() => {
    if (!videoId) return;
    let isMounted = true;
    setTranscriptLoading(true);
    fetchVideoTranscript(videoId, activeVideoSub.title).then((result: TranscriptResult) => {
      if (isMounted) {
        setTranscriptCues(result.cues);
        setTranscriptLoading(false);
        if (result.cues.length > 0) {
          console.log(`[Transcript] ✅ ${result.cues.length} cues from ${result.source} in ${result.latencyMs}ms (layers tried: ${result.layersTried})`);
        } else {
          console.warn('[Transcript] No cues returned from any layer.');
        }
      }
    }).catch(() => {
      if (isMounted) setTranscriptLoading(false);
    });
    return () => { isMounted = false; };
  }, [videoId, activeVideoSub.title]);

  // Real-time transcript playback tracker
  useEffect(() => {
    if (!playing || !transcriptVisible || transcriptCues.length === 0) return;

    const timer = setInterval(async () => {
      try {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const currentSec = await playerRef.current.getCurrentTime();
          const matchIdx = transcriptCues.findIndex((c, i) => {
            const nextStart = transcriptCues[i + 1]?.start ?? (c.start + c.duration + 5);
            return currentSec >= c.start && currentSec < nextStart;
          });

          if (matchIdx !== -1 && matchIdx !== activeCueIndex) {
            setActiveCueIndex(matchIdx);
            if (autoScrollTranscript && transcriptScrollRef.current) {
              transcriptScrollRef.current.scrollTo({ y: Math.max(0, matchIdx * 64 - 100), animated: true });
            }
          }
        }
      } catch (e) {}
    }, 500);

    return () => clearInterval(timer);
  }, [playing, transcriptVisible, transcriptCues, activeCueIndex, autoScrollTranscript]);

  const { user, learningTopics } = useMobileData();
  const [generatingCards, setGeneratingCards] = useState(false);
  const [mindMapVisible, setMindMapVisible] = useState(false);

  const handleGenerateFlashcards = async (sourceText?: string) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save flashcards.');
      return;
    }
    setGeneratingCards(true);
    try {
      const content = sourceText || currentNotes || (aiHistory.filter(h => h.role === 'model').slice(-1)[0]?.text) || activeVideoSub.title;
      const cards = await generateFlashcardsFromContext(
        activeVideoSub.title,
        'Learning Workspace',
        content
      );
      if (cards.length > 0) {
        const count = await saveFlashcardsToFirestore(
          user.uid,
          activeVideoSub.title,
          'Learning Workspace',
          cards
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '🎉 Flashcards Created!',
          `Created ${count} Active Recall Flashcards for this lecture. They are scheduled in your daily Spaced Repetition deck.`,
          [{ text: 'Great!' }]
        );
      } else {
        Alert.alert('No Cards Created', 'Could not generate flashcards from this section. Try again.');
      }
    } catch (e: any) {
      Alert.alert('Flashcard Error', e?.message || 'Failed to generate flashcards.');
    } finally {
      setGeneratingCards(false);
    }
  };

  const handleExportResponseToNotes = async (responseText: string) => {
    try {
      let timeTag = '';
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const currentSec = Math.floor(await playerRef.current.getCurrentTime());
        if (currentSec > 0) {
          const mm = Math.floor(currentSec / 60);
          const ss = String(currentSec % 60).padStart(2, '0');
          timeTag = ` [${mm}:${ss}]`;
        }
      }

      const noteBlock = `\n\n### 🤖 ZEN-GPT Breakdown${timeTag}\n${responseText.trim()}`;
      const updatedNotes = currentNotes ? currentNotes.trim() + noteBlock : noteBlock.trim();
      setCurrentNotes(updatedNotes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        '📝 Exported to Lecture Notes!',
        `This response was instantly appended to your lecture notes draft${timeTag ? ` with video timestamp ${timeTag.trim()}` : ''}.\n\nWhere would you like to go?`,
        [
          {
            text: 'View Notes Draft',
            onPress: () => {
              setAiChatVisible(false);
              setNotesVisible(true);
            },
          },
          {
            text: 'Save to Cloud Storage',
            onPress: async () => {
              if (!user) {
                Alert.alert('Sign In Required', 'Please sign in to save notes to your ZenNotes workspace.');
                return;
              }
              try {
                const topic = learningTopics?.find(t => t.subTasks?.some(s => s.id === activeVideoSub.id));
                const topicTitle = topic?.title || 'Learning';
                await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
                  userId: user.uid,
                  name: `ZEN-GPT: ${activeVideoSub.title || 'Lecture Note'}${timeTag}`,
                  content: `# 🤖 ZEN-GPT Lecture Note${timeTag}\n\n**Lecture:** ${activeVideoSub.title}\n**Topic:** ${topicTitle}\n**Video URL:** ${activeVideoSub.url || ''}\n\n---\n\n${responseText.trim()}`,
                  type: 'note',
                  folderId: null,
                  tags: ['zengpt', 'lecture-notes', topicTitle.toLowerCase().replace(/\s+/g, '-')],
                  pinned: false,
                  color: '#00c16e',
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('☁️ Saved to ZenNotes', 'A standalone note was also saved to your ZenNotes workspace!');
              } catch (err: any) {
                Alert.alert('Save Error', err?.message || 'Failed to save note to cloud.');
              }
            }
          },
          { text: 'Keep Chatting', style: 'cancel' }
        ]
      );
    } catch (e: any) {
      Alert.alert('Export Error', e?.message || 'Failed to export response to notes.');
    }
  };

  const handleSeekToCue = (cue: TranscriptCue) => {
    try {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(cue.start, true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {}
  };

  const handleCopyCueToNotes = (cue: TranscriptCue) => {
    const bookmarkText = `\n[${cue.formattedTime}] ${cue.text}`;
    const updated = currentNotes ? currentNotes + bookmarkText : bookmarkText.trim();
    setCurrentNotes(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Bookmark Added to Notes', `Added [${cue.formattedTime}] to your lecture notes.`);
  };

  const filteredCues = useMemo(() => {
    if (!transcriptSearch.trim()) return transcriptCues;
    const q = transcriptSearch.toLowerCase();
    return transcriptCues.filter(c => c.text.toLowerCase().includes(q) || c.formattedTime.includes(q));
  }, [transcriptCues, transcriptSearch]);

  // Plain-text transcript for mind map generation (from already-loaded cues)
  const transcriptPlainText = useMemo(
    () => transcriptCues.map(c => `[${c.formattedTime}] ${c.text}`).join('\n'),
    [transcriptCues]
  );

  const markdownRules = {
    fence: (node: any) => {
      const language = (node.sourceInfo || 'code').trim();
      const codeContent = (node.content || '').replace(/\n$/, '');

      // ── InlineCodeRunner for executable languages ──────────────────────────
      // JS / TS / Python get a ▶ Run button + sandboxed output panel.
      // All other languages fall back to the static copy-only block.
      if (isRunnable(language)) {
        return (
          <InlineCodeRunner
            key={node.key}
            code={codeContent}
            language={language}
            nodeKey={node.key}
          />
        );
      }

      // ── Static copy-only block for non-runnable languages ─────────────────
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <View style={s.codeBoxHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#388bfd' }} />
              <Text style={s.codeBoxLang}>{language}</Text>
            </View>
            <TouchableOpacity
              style={s.codeCopyBtn}
              onPress={() => {
                Clipboard.setStringAsync(codeContent);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="copy-outline" size={12} color="#858585" />
              <Text style={s.codeCopyText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <VsCodeSyntaxHighlighter code={codeContent} language={language} showLineNumbers={true} />
        </View>
      );
    },
    code_block: (node: any) => {
      const codeContent = (node.content || '').replace(/\n$/, '');
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <VsCodeSyntaxHighlighter code={codeContent} showLineNumbers={false} />
        </View>
      );
    },
  };

  const sanitizeMarkdownText = (raw: string): string => {
    if (!raw) return '';
    return raw
      // Fix CP437 / mojibake artifacts
      .replace(/≡ƒÆí/g, '💡')
      .replace(/┬╖|┬╥|┬─|┬/g, '·')
      .replace(/ΓåÆ/g, '→')
      // Fix copyright symbol © incorrectly rendered for option (C)
      .replace(/(^|\n|\s)©\s*/g, '$1C) ')
      // Standardize (A), (B), (C), (D) options to A), B), C), D) to prevent markdown parser bugs
      .replace(/(^|\n|\s)\(([a-zA-Z])\)\s*/g, (m, p1, p2) => `${p1}${p2.toUpperCase()}) `);
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      const h = e.endCoordinates ? e.endCoordinates.height : 280;
      Animated.timing(keyboardHeight, {
        toValue: h + 10,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 200,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setKeyboardVisible(false);
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Notes State
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('edit');
  const [exporting, setExporting] = useState(false);

  // Extract all [MM:SS] or [M:SS] timestamps in the current notes for quick jumping
  const detectedTimestamps = useMemo(() => {
    if (!currentNotes) return [];
    const matches = [...currentNotes.matchAll(/\[(\d{1,2}:\d{2})\]/g)];
    const unique = Array.from(new Set(matches.map(m => m[1])));
    return unique;
  }, [currentNotes]);

  // Insert [MM:SS] timestamp at current playback time
  const handleInsertTimestamp = async () => {
    try {
      let currentSec = 0;
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        currentSec = Math.floor(await playerRef.current.getCurrentTime());
      }
      const mm = Math.floor(currentSec / 60);
      const ss = String(currentSec % 60).padStart(2, '0');
      const timestampTag = `[${mm}:${ss}]`;
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const separator = currentNotes.trim().length > 0 ? (currentNotes.endsWith('\n') ? '' : '\n') : '';
      const updatedNotes = `${currentNotes}${separator}- ${timestampTag} `;
      setCurrentNotes(updatedNotes);
    } catch (e) {
      console.log('Error inserting timestamp', e);
    }
  };

  // Seek video player to given MM:SS timestamp
  const handleSeekToTimestamp = (tsStr: string) => {
    const match = tsStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const m = parseInt(match[1], 10);
      const s = parseInt(match[2], 10);
      const totalSec = m * 60 + s;
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(totalSec, true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  // Export lecture notes to Notes collection
  const handleExportToNotes = async () => {
    if (!currentNotes.trim()) {
      Alert.alert('Empty Notes', 'Please write some notes before exporting to ZenNotes.');
      return;
    }
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save notes to your ZenNotes workspace.');
      return;
    }

    setExporting(true);
    try {
      const topic = learningTopics?.find(t => t.subTasks?.some(s => s.id === activeVideoSub.id));
      const topicTitle = topic?.title || 'Learning';
      const formattedContent = `# 📺 Lecture Notes: ${activeVideoSub.title || 'Video Lecture'}\n\n**Topic:** ${topicTitle}\n**Video URL:** ${activeVideoSub.url || ''}\n**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n${currentNotes.trim()}`;

      await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
        userId: user.uid,
        name: `Lecture: ${activeVideoSub.title || 'Video Notes'}`,
        content: formattedContent,
        type: 'note',
        folderId: null,
        tags: ['lecture', 'learning', topicTitle.toLowerCase().replace(/\s+/g, '-')],
        pinned: false,
        color: '#a599ff',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '🎉 Exported to ZenNotes!',
        'Your lecture notes and timestamp bookmarks have been saved to your Notes & Cloud Storage workspace.',
        [{ text: 'Awesome!' }]
      );
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Could not export to Notes module.');
    } finally {
      setExporting(false);
    }
  };

  if (!videoId) return null;

  return (
    <View style={[
      isPip ? s.pipContainer : s.fullPlayerContainer,
      isFocusMode && { backgroundColor: '#000', padding: 0 },
      isNativeFullScreen && { top: -insets.top, bottom: -insets.bottom, left: -(insets.left || 0), right: -(insets.right || 0), zIndex: 9999 }
    ]}>
      <View
        style={[
          s.playerWrapper,
          isPip && { width: 150, height: 84 },
          isFocusMode && { flex: 1, justifyContent: 'center' },
          !isPip && !isFocusMode && !isNativeFullScreen && { marginTop: Math.max(insets.top, Platform.OS === 'android' ? 48 : 0) },
          isNativeFullScreen && { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
          { opacity: 0.99, overflow: 'hidden' }
        ]}
        onLayout={e => {
          if (!isPip && !isFocusMode && !isNativeFullScreen) {
            setVideoLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.width * 9 / 16 });
          }
        }}
      >
        <YoutubeIframe
          ref={playerRef}
          height={isPip ? 84 : (isNativeFullScreen ? windowHeight : (isFocusMode ? 300 : videoLayout.height))}
          width={isPip ? 150 : (isNativeFullScreen ? windowWidth : (isFocusMode ? '100%' : videoLayout.width))}
          play={playing}
          videoId={videoId}
          playbackRate={playbackRate}
          onChangeState={(state: string) => setPlaying(state === 'playing')}
          initialPlayerParams={{ controls: true, modestbranding: true, rel: false }}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            androidLayerType: 'hardware',
            customUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }}
          onFullScreenChange={(isFullScreen: boolean) => {
            setIsNativeFullScreen(isFullScreen);
            if (isFullScreen) {
              ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            } else {
              ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            }
          }}
        />
      </View>

      {/* Controls Row */}
      {!isPip && !isFocusMode && !isNativeFullScreen && (
        <View style={s.playerControls}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={s.controlBtn} onPress={handleSpeedChange}>
              <Text style={s.controlBtnText}>{playbackRate}x</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.controlBtn, aiChatVisible && { backgroundColor: '#a599ff' }]}
              onPress={() => {
                setAiChatVisible(!aiChatVisible);
                setNotesVisible(false);
                setTranscriptVisible(false);
              }}
            >
              <Ionicons name="chatbubbles" size={18} color={aiChatVisible ? '#000' : '#f2f2f7'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.controlBtn, notesVisible && { backgroundColor: '#a599ff' }]}
              onPress={() => {
                setNotesVisible(!notesVisible);
                setAiChatVisible(false);
                setTranscriptVisible(false);
              }}
            >
              <Ionicons name="document-text" size={18} color={notesVisible ? '#000' : '#f2f2f7'} />
            </TouchableOpacity>
            {/* Transcript button */}
            <TouchableOpacity
              style={[s.controlBtn, transcriptVisible && { backgroundColor: '#a599ff' }]}
              onPress={() => {
                setTranscriptVisible(!transcriptVisible);
                setAiChatVisible(false);
                setNotesVisible(false);
              }}
            >
              <Ionicons name="receipt-outline" size={18} color={transcriptVisible ? '#000' : '#f2f2f7'} />
            </TouchableOpacity>

            {/* ── Flashcard generate button ────────────────────────────────────
                Triggers ZEN-GPT to produce 5 SM-2 flashcards from transcript/notes.
                Shows a spinner while generating. Green accent when transcript ready. */}
            <TouchableOpacity
              style={[s.controlBtn, { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }]}
              onPress={() => handleGenerateFlashcards()}
              disabled={generatingCards}
            >
              {generatingCards
                ? <ActivityIndicator size="small" color="#a599ff" style={{ transform: [{ scale: 0.7 }] }} />
                : <Text style={{ fontSize: 14 }}>🃏</Text>
              }
            </TouchableOpacity>

            {/* ── Mind Map button ──────────────────────────────────────────────
                Opens LectureMindMap modal with AI-generated SVG diagram.
                Enabled once transcript cues are loaded. */}
            <TouchableOpacity
              style={[s.controlBtn, { paddingHorizontal: 8 }, mindMapVisible && { backgroundColor: '#a599ff' }]}
              onPress={() => setMindMapVisible(true)}
            >
              <Text style={{ fontSize: 14 }}>🗺️</Text>
            </TouchableOpacity>
            {aiChatVisible && (
              <TouchableOpacity
                style={[s.controlBtn, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, backgroundColor: 'rgba(165,153,255,0.1)' }]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsChatFullScreen(true);
                }}
              >
                <Ionicons name="expand" size={16} color="#a599ff" />
                <Text style={{ color: '#a599ff', fontSize: 13, fontFamily: FONT_FAMILY.bold }}>Expand</Text>
              </TouchableOpacity>
            )}
            {aiChatVisible && (
              <TouchableOpacity
                style={[s.controlBtn, { paddingHorizontal: 8 }]}
                onPress={() => setHistoryModalVisible(true)}
              >
                <Ionicons name="time-outline" size={16} color="#a599ff" />
              </TouchableOpacity>
            )}
            {aiChatVisible && resetChatHistory && (
              <TouchableOpacity
                style={[s.controlBtn, { paddingHorizontal: 8 }]}
                onPress={() => {
                  Alert.alert(
                    'Clear Lecture Chat?',
                    'This will clear your conversation history for this lecture and start fresh.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: resetChatHistory }
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.controlBtn} onPress={closeVideo}>
              <Ionicons name="close" size={18} color="#f2f2f7" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Focus Mode Exit */}
      {isFocusMode && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 50, right: 20, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 }}
          onPress={() => setIsFocusMode(false)}>
          <Ionicons name="contract" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* PiP Restore */}
      {isPip && (
        <TouchableOpacity style={s.pipRestoreBtn} onPress={() => setIsPip(false)}>
          <Ionicons name="expand" size={24} color="#f2f2f7" />
        </TouchableOpacity>
      )}

      {/* AI Chat Panel */}
      {!isPip && !isFocusMode && aiChatVisible && (
        <View style={[s.aiPanel, isChatFullScreen && { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: '#000000' }]}>
          {isChatFullScreen && (
            <View style={{ paddingTop: Math.max(insets.top, 20), paddingBottom: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', zIndex: 110, position: 'absolute', top: 0, left: 0, right: 0 }}>
              <TouchableOpacity
                style={{ position: 'absolute', left: 20, top: Math.max(insets.top, 20), backgroundColor: '#18181b', width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setHistoryModalVisible(true)}
              >
                <Ionicons name="time-outline" size={16} color="#a599ff" />
              </TouchableOpacity>
              {resetChatHistory && (
                <TouchableOpacity
                  style={{ position: 'absolute', left: 62, top: Math.max(insets.top, 20), backgroundColor: '#18181b', width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => {
                    Alert.alert(
                      'Clear Lecture Chat?',
                      'This will clear your conversation history for this lecture and start fresh.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: resetChatHistory }
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#71717a" />
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                <Text style={{ color: '#ffffff', fontSize: 12.5, fontFamily: FONT_FAMILY.bold, letterSpacing: 0.2 }}>ZEN-GPT</Text>
              </View>
              <TouchableOpacity style={{ position: 'absolute', right: 20, top: Math.max(insets.top, 20), backgroundColor: '#18181b', width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsChatFullScreen(false); }}>
                <Ionicons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
          <ScrollView 
            ref={chatScrollRef}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: isChatFullScreen ? Math.max(insets.top, 20) + 60 : 12, paddingBottom: Math.max(140, insets.bottom + 120), gap: 20 }}
          >
            {aiHistory.map((item, i) => (
              <View key={i} style={[s.chatBubble, item.role === 'model' ? s.chatBubbleModel : s.chatBubbleUser]}>
                {item.role === 'model' ? (
                  <View style={s.assistantContainer}>
                    <View style={s.assistantHeader}>
                      <View style={s.assistantAvatar}>
                        <Ionicons name="sparkles" size={11} color="#00c16e" />
                      </View>
                      <Text style={s.assistantName}>ZEN-GPT</Text>
                      <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => Clipboard.setStringAsync(item.text)}>
                        <Ionicons name="copy-outline" size={13} color="#71717a" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ marginLeft: 6, paddingVertical: 2, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,193,110,0.12)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,193,110,0.25)' }}
                        onPress={() => handleExportResponseToNotes(item.text)}
                      >
                        <Ionicons name="document-text-outline" size={11} color="#00c16e" />
                        <Text style={{ color: '#00c16e', fontSize: 10.5, fontFamily: FONT_FAMILY.bold }}>+ Notes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ marginLeft: 6, paddingVertical: 2, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(165,153,255,0.12)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)' }}
                        onPress={() => handleGenerateFlashcards(item.text)}
                      >
                        <Ionicons name="flash-outline" size={11} color="#a599ff" />
                        <Text style={{ color: '#a599ff', fontSize: 10.5, fontFamily: FONT_FAMILY.bold }}>+ Flashcards</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.markdownWrapper}>
                      <Markdown rules={markdownRules} style={mdStylesModel}>{sanitizeMarkdownText(item.text)}</Markdown>
                    </View>
                  </View>
                ) : (
                  <View style={s.userBubble}>
                    <Text style={s.userBubbleText}>{item.text}</Text>
                  </View>
                )}
              </View>
            ))}
            {aiLoading && (
              <View style={[s.chatBubble, s.chatBubbleModel]}>
                <View style={s.assistantHeader}>
                  <View style={s.assistantAvatar}>
                    <Ionicons name="sparkles" size={11} color="#00c16e" />
                  </View>
                  <Text style={s.assistantName}>ZEN-GPT</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingLeft: 4 }}>
                  <ActivityIndicator size="small" color="#00c16e" />
                  <Text style={{ color: '#71717a', fontSize: 13, fontFamily: FONT_FAMILY.body, fontStyle: 'italic' }}>Generating response...</Text>
                </View>
              </View>
            )}
          </ScrollView>
          <Animated.View style={[s.aiInputRow, { bottom: keyboardHeight, paddingBottom: isKeyboardVisible ? 8 : Math.max(16, insets.bottom) }]}>
            {!aiHistory.some(m => m.role === 'user') && (
              <View style={s.aiSuggestionsRow}>
                <TouchableOpacity
                  style={s.chatgptPill}
                  onPress={generateQuiz}
                  activeOpacity={0.7}
                >
                  <Ionicons name="sparkles" size={13} color="#a599ff" />
                  <Text style={s.chatgptPillText}>Quiz Me</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.chatgptPill, generatingCards && { opacity: 0.6 }]}
                  onPress={() => handleGenerateFlashcards()}
                  disabled={generatingCards}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flash" size={12} color="#00c16e" />
                  <Text style={[s.chatgptPillText, { color: '#00c16e' }]}>
                    {generatingCards ? 'Creating...' : '+ Flashcards'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={s.aiInputCapsule}>
              <TextInput
                style={s.aiInput}
                placeholder="Ask ZEN-GPT anything..."
                placeholderTextColor="#71717a"
                value={aiInput}
                onChangeText={setAiInput}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  sendAiMessage();
                }}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[s.aiSendBtn, (!aiInput.trim() || aiLoading) && s.aiSendBtnDisabled]}
                onPress={() => {
                  Keyboard.dismiss();
                  sendAiMessage();
                }}
                disabled={aiLoading || !aiInput.trim()}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-up" size={18} color="#000000" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Notes Panel */}
      {!isPip && !isFocusMode && notesVisible && (
        <KeyboardAvoidingView style={s.notesPanel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.panelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.panelTitle}>Notes</Text>
              <View style={s.modeToggleContainer}>
                <TouchableOpacity style={[s.modeToggleBtn, notesMode === 'edit' && s.modeToggleBtnActive]} onPress={() => setNotesMode('edit')}>
                  <Text style={[s.modeToggleText, notesMode === 'edit' && s.modeToggleTextActive]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modeToggleBtn, notesMode === 'preview' && s.modeToggleBtnActive]} onPress={() => setNotesMode('preview')}>
                  <Text style={[s.modeToggleText, notesMode === 'preview' && s.modeToggleTextActive]}>Preview</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity style={s.toolActionBtn} onPress={handleInsertTimestamp}>
                <Ionicons name="time-outline" size={13} color="#a599ff" />
                <Text style={s.toolActionText}>+ Time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.exportBtn, exporting && { opacity: 0.6 }]} onPress={handleExportToNotes} disabled={exporting}>
                {exporting ? <ActivityIndicator size="small" color="#080510" /> : (
                  <>
                    <Ionicons name="share-outline" size={12} color="#080510" />
                    <Text style={s.exportBtnText}>Export</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.saveNoteBtn} onPress={saveNotes}>
                <Text style={{ color: '#a599ff', fontFamily: FONT_FAMILY.bold, fontSize: 12.5 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
          {detectedTimestamps.length > 0 && (
            <View style={s.timestampChipsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
                <Text style={s.timestampChipsLabel}>Jump:</Text>
                {detectedTimestamps.map((ts, idx) => (
                  <TouchableOpacity key={idx} style={s.timestampChip} onPress={() => handleSeekToTimestamp(ts)}>
                    <Ionicons name="play" size={9} color="#a599ff" />
                    <Text style={s.timestampChipText}>{ts}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {notesMode === 'edit' ? (
            <TextInput
              style={s.notesInput}
              multiline textAlignVertical="top"
              placeholder="Jot down notes here... Use # headers, **bold**, and tap '+ Time' to insert clickable video timestamps."
              placeholderTextColor="#71717a"
              value={currentNotes}
              onChangeText={setCurrentNotes}
              onBlur={saveNotes}
            />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
              {currentNotes.trim() ? (
                <Markdown rules={markdownRules} style={mdStylesModel}>{currentNotes}</Markdown>
              ) : (
                <Text style={{ color: '#71717a', fontStyle: 'italic', fontFamily: FONT_FAMILY.body }}>No notes written yet. Switch to Edit mode or tap '+ Time' to start.</Text>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Interactive Transcript Panel */}
      {!isPip && !isFocusMode && transcriptVisible && (
        <View style={s.transcriptPanel}>
          {/* Transcript Header */}
          <View style={s.panelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.panelTitle}>Transcript</Text>
              <View style={s.transcriptCountBadge}>
                <Text style={s.transcriptCountText}>{filteredCues.length} Cues</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[s.toolActionBtn, autoScrollTranscript && { backgroundColor: 'rgba(0,193,110,0.15)', borderColor: 'rgba(0,193,110,0.3)' }]}
                onPress={() => setAutoScrollTranscript(!autoScrollTranscript)}
              >
                <Ionicons name="locate" size={13} color={autoScrollTranscript ? '#00c16e' : '#8e8e93'} />
                <Text style={[s.toolActionText, autoScrollTranscript && { color: '#00c16e' }]}>
                  {autoScrollTranscript ? 'Tracking' : 'Manual'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Search */}
          <View style={s.transcriptSearchBox}>
            <Ionicons name="search" size={14} color="#71717a" />
            <TextInput
              style={s.transcriptSearchInput}
              placeholder="Search words in lecture audio..."
              placeholderTextColor="#71717a"
              value={transcriptSearch}
              onChangeText={setTranscriptSearch}
              clearButtonMode="while-editing"
            />
            {transcriptSearch.length > 0 && (
              <TouchableOpacity onPress={() => setTranscriptSearch('')}>
                <Ionicons name="close-circle" size={14} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>

          {/* Cue List */}
          {transcriptLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color="#a599ff" />
              <Text style={{ color: '#8e8e93', fontSize: 13, fontFamily: FONT_FAMILY.body }}>
                Synchronizing lecture transcript...
              </Text>
            </View>
          ) : filteredCues.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Ionicons name="receipt-outline" size={36} color="#3a3a3c" />
              <Text style={{ color: '#8e8e93', fontSize: 14, fontFamily: FONT_FAMILY.body, marginTop: 12, textAlign: 'center' }}>
                {transcriptSearch ? 'No spoken words matched your search.' : 'No transcript cues found for this lecture.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={transcriptScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 100 }}
              showsVerticalScrollIndicator={true}
            >
              {filteredCues.map((cue, idx) => {
                const isActive = activeCueIndex === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.7}
                    style={[s.cueRow, isActive && s.cueRowActive]}
                    onPress={() => handleSeekToCue(cue)}
                  >
                    <View style={[s.cueTimePill, isActive && s.cueTimePillActive]}>
                      <Ionicons name={isActive ? "play" : "time-outline"} size={10} color={isActive ? "#080510" : "#a599ff"} />
                      <Text style={[s.cueTimeText, isActive && s.cueTimeTextActive]}>
                        {cue.formattedTime}
                      </Text>
                    </View>

                    <Text style={[s.cueText, isActive && s.cueTextActive]}>
                      {cue.text}
                    </Text>

                    <TouchableOpacity
                      style={s.cueAddNoteBtn}
                      onPress={() => handleCopyCueToNotes(cue)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="bookmark-outline" size={14} color="#71717a" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <LectureChatHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        currentSubId={activeVideoSub?.id}
        learningTopics={learningTopics}
        onSelectLecture={onSelectLecture}
        onClearCurrentChat={resetChatHistory}
      />

      {/* ── Mind Map Modal ───────────────────────────────────────────────────────
          Lazy-renders on first open. Transcript plain text derived from the
          already-fetched transcriptCues — no extra network call.
          Tapping a node auto-sends the concept to ZEN-GPT and closes the map.
      ─────────────────────────────────────────────────────────────────────── */}
      <LectureMindMap
        visible={mindMapVisible}
        onClose={() => setMindMapVisible(false)}
        lectureTitle={activeVideoSub?.title || 'Lecture'}
        transcript={transcriptPlainText}
        onAskQuestion={(question) => {
          setMindMapVisible(false);
          setAiChatVisible(true);
          setNotesVisible(false);
          // Small delay to let the AI panel open before auto-sending
          setTimeout(() => sendAiMessage(question), 200);
        }}
      />
    </View>
  );
}


const s = StyleSheet.create({
  fullPlayerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 100 },
  pipContainer: { position: 'absolute', bottom: 100, right: 20, width: 150, height: 84, backgroundColor: '#000000', borderRadius: 10, overflow: 'hidden', zIndex: 100, borderWidth: 2, borderColor: '#a599ff' },
  playerWrapper: { width: '100%', backgroundColor: '#000000' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', backgroundColor: '#141416', borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  controlBtn: { padding: 6, backgroundColor: '#1c1c1e', borderRadius: 6 },
  controlBtnText: { color: '#f2f2f7', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  pipRestoreBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  panelTitle: { fontFamily: FONT_FAMILY.bold, color: '#ffffff', fontSize: 16 },
  transcriptPanel: { flex: 1, backgroundColor: '#0c0c0e' },
  transcriptCountBadge: { backgroundColor: 'rgba(165,153,255,0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(165,153,255,0.25)' },
  transcriptCountText: { color: '#a599ff', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  transcriptSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141416', marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  transcriptSearchInput: { flex: 1, color: '#fff', fontSize: 13, fontFamily: FONT_FAMILY.body, marginLeft: 6, padding: 0 },
  cueRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', borderRadius: 10, marginHorizontal: 8, marginVertical: 2 },
  cueRowActive: { backgroundColor: 'rgba(165,153,255,0.12)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.35)' },
  cueTimePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(165,153,255,0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginRight: 10, marginTop: 1 },
  cueTimePillActive: { backgroundColor: '#a599ff' },
  cueTimeText: { color: '#a599ff', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  cueTimeTextActive: { color: '#080510' },
  cueText: { flex: 1, color: '#a1a1aa', fontSize: 13, lineHeight: 19, fontFamily: FONT_FAMILY.body },
  cueTextActive: { color: '#ffffff', fontFamily: FONT_FAMILY.medium },
  cueAddNoteBtn: { padding: 4, marginLeft: 6, marginTop: 1 },
  modeToggleContainer: { flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 12, padding: 2, marginLeft: 8 },
  modeToggleBtn: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  modeToggleBtnActive: { backgroundColor: 'rgba(165,153,255,0.2)' },
  modeToggleText: { fontSize: 11, color: '#8e8e93', fontFamily: FONT_FAMILY.body },
  modeToggleTextActive: { color: '#a599ff', fontFamily: FONT_FAMILY.bold },
  toolActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(165,153,255,0.12)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.25)' },
  toolActionText: { color: '#a599ff', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: '#a599ff' },
  exportBtnText: { color: '#080510', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  saveNoteBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  timestampChipsContainer: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0d0d10' },
  timestampChipsLabel: { color: '#71717a', fontSize: 11, fontFamily: FONT_FAMILY.bold, marginRight: 2 },
  timestampChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(165,153,255,0.15)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  timestampChipText: { color: '#e5e5ea', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  quizBtn: { backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  quizBtnText: { color: '#a599ff', fontSize: 10, fontFamily: FONT_FAMILY.bold },
  aiPanel: { flex: 1, backgroundColor: 'transparent' },
  chatBubble: { marginBottom: 18, width: '100%' },
  chatBubbleModel: { alignSelf: 'stretch', width: '100%' },
  chatBubbleUser: { alignItems: 'flex-end', width: '100%' },
  assistantContainer: { width: '100%' },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  assistantAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,193,110,0.15)', alignItems: 'center', justifyContent: 'center' },
  assistantName: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a1a1aa', letterSpacing: 0.3 },
  markdownWrapper: { width: '100%' },
  userBubble: { backgroundColor: '#27272a', borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10, maxWidth: '85%' },
  userBubbleText: { fontFamily: FONT_FAMILY.body, fontSize: 15, color: '#ffffff', lineHeight: 22 },
  aiInputRow: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, backgroundColor: 'transparent' },
  aiSuggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, marginBottom: 8 },
  chatgptPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(28, 28, 30, 0.75)', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  chatgptPillText: { color: '#e4e4e7', fontSize: 12, fontFamily: FONT_FAMILY.medium, letterSpacing: 0.1 },
  aiInputCapsule: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingLeft: 16, paddingRight: 6, minHeight: 48 },
  aiInput: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 14.5, color: '#ffffff', maxHeight: 100, paddingVertical: 10 },
  aiSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  aiSendBtnDisabled: { backgroundColor: 'rgba(255, 255, 255, 0.2)', opacity: 0.5 },
  quizInputBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(165,153,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  notesPanel: { flex: 1, backgroundColor: '#000000' },
  notesInput: { flex: 1, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
  codeBoxContainer: { backgroundColor: '#1e1e1e', borderRadius: 10, borderWidth: 1, borderColor: '#333333', marginVertical: 8, overflow: 'hidden' },
  codeBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#252526', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#333333' },
  codeBoxLang: { color: '#cccccc', fontSize: 11, fontFamily: FONT_FAMILY.bold, textTransform: 'uppercase' },
  codeCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  codeCopyText: { color: '#cccccc', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  codeText: { color: '#d4d4d4', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 19 },
});

const mdStylesModel = StyleSheet.create({
  body: { color: '#ececec', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 24, letterSpacing: 0.15 },
  heading1: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 12, marginBottom: 6, lineHeight: 24 },
  heading2: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 10, marginBottom: 4, lineHeight: 22 },
  heading3: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 8, marginBottom: 4, lineHeight: 20 },
  strong: { color: '#ffffff', fontFamily: 'Inter_600SemiBold' },
  em: { color: '#e5e5ea', fontStyle: 'italic' },
  bullet_list_icon: { color: '#00c16e', fontSize: 14, marginTop: 3, marginRight: 8 },
  ordered_list_icon: { color: '#00c16e', fontSize: 14, marginTop: 3, marginRight: 8 },
  code_inline: { color: '#00c16e', backgroundColor: 'transparent', fontFamily: 'Inter_600SemiBold', fontSize: 14.5 },
  code_block: { color: '#f2f2f7', backgroundColor: '#141416', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', fontSize: 13.5 },
  fence: { color: '#f2f2f7', backgroundColor: '#141416', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', fontSize: 13.5 },
  pre: { backgroundColor: '#141416', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginVertical: 6 },
  blockquote: { backgroundColor: 'rgba(0,193,110,0.08)', borderColor: '#00c16e', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4 },
  table: { borderColor: '#2c2c2e', borderWidth: 1, borderRadius: 8, backgroundColor: '#141416', marginVertical: 8 },
  tr: { borderColor: '#2c2c2e', borderBottomWidth: 1, flexDirection: 'row' },
  th: { backgroundColor: '#1c1c1e', color: '#00c16e', padding: 8, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  td: { padding: 8, color: '#f2f2f7', fontSize: 13 },
  paragraph: { marginTop: 0, marginBottom: 8 },
});

const mdStylesUser = StyleSheet.create({
  body: { color: '#ffffff', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 8, marginBottom: 4 },
  heading2: { color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 6, marginBottom: 2 },
  heading3: { color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4, marginBottom: 2 },
  strong: { color: '#ffffff', fontFamily: 'Inter_700Bold' },
  em: { color: '#ffffff', fontStyle: 'italic' },
  bullet_list_icon: { color: '#ffffff', fontSize: 16, marginTop: 1 },
  ordered_list_icon: { color: '#ffffff', fontSize: 15, marginTop: 2 },
  code_inline: { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.1)', fontFamily: 'Inter_500Medium', paddingHorizontal: 4, borderRadius: 4 },
  code_block: { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: 'Inter_400Regular', padding: 10, borderRadius: 8 },
  fence: { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: 'Inter_400Regular', padding: 10, borderRadius: 8 },
  pre: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },
  paragraph: { marginTop: 0, marginBottom: 0 },
});


