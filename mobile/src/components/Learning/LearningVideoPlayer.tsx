import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, Keyboard, Animated, AppState, ActivityIndicator, LayoutAnimation, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useCreativeData } from '../../contexts/domains/CreativeContext';
import { LearningSubTask } from '../../contexts/MobileDataContext';
import { fetchVideoTranscript, TranscriptCue, TranscriptResult } from '../../services/youtubeTranscriptService';
import { generateFlashcardsFromContext, saveFlashcardsToFirestore } from '../../services/flashcardService';
import LectureChatHistoryModal from './LectureChatHistoryModal';
import LectureMindMap from './LectureMindMap';
import AiChatPanel from './AiChatPanel';
import NotesPanel from './NotesPanel';

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
  selectedModel?: string;
  onToggleModel?: () => void;
}

export default function LearningVideoPlayer({
  activeVideoSub, extractVideoId, playerRef, playing, setPlaying,
  playbackRate, setPlaybackRate, isPip, setIsPip,
  isFocusMode, setIsFocusMode, isNativeFullScreen, setIsNativeFullScreen,
  videoLayout, setVideoLayout, aiChatVisible, setAiChatVisible,
  notesVisible, setNotesVisible, aiHistory, aiInput, setAiInput,
  aiLoading, sendAiMessage, generateQuiz, currentNotes, setCurrentNotes,
  saveNotes, closeVideo, resetChatHistory, onSelectLecture,
  selectedModel = 'gemini-3.7-flash', onToggleModel,
}: LearningVideoPlayerProps) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [isChatFullScreen, setIsChatFullScreen] = useState(false);
  const [mindMapVisible, setMindMapVisible] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(-1);
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const transcriptScrollRef = useRef<ScrollView>(null);
  const { user } = useCoreData();
  const { learningTopics } = useCreativeData();
  const videoId = extractVideoId(activeVideoSub.url);

  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {});
    return () => {
      sub.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      const h = e.endCoordinates ? e.endCoordinates.height : 280;
      Animated.timing(keyboardHeight, { toValue: h + 10, duration: Platform.OS === 'ios' ? (e.duration || 250) : 200, useNativeDriver: false }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setKeyboardVisible(false);
      Animated.timing(keyboardHeight, { toValue: 0, duration: Platform.OS === 'ios' ? (e.duration || 250) : 200, useNativeDriver: false }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (!videoId) return;
    let isMounted = true;
    setTranscriptLoading(true);
    fetchVideoTranscript(videoId, activeVideoSub.title).then((result: TranscriptResult) => {
      if (isMounted) { setTranscriptCues(result.cues); setTranscriptLoading(false); }
    }).catch(() => { if (isMounted) setTranscriptLoading(false); });
    return () => { isMounted = false; };
  }, [videoId, activeVideoSub.title]);

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

  const transcriptPlainText = useMemo(
    () => transcriptCues.map(c => `[${c.formattedTime}] ${c.text}`).join('\n'),
    [transcriptCues]
  );

  const filteredCues = useMemo(() => transcriptCues, [transcriptCues]);

  const detectedTimestamps = useMemo(() => {
    if (!currentNotes) return [];
    const matches = [...currentNotes.matchAll(/\[(\d{1,2}:\d{2})\]/g)];
    return Array.from(new Set(matches.map(m => m[1])));
  }, [currentNotes]);

  const handleInsertTimestamp = async () => {
    try {
      let currentSec = 0;
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        currentSec = Math.floor(await playerRef.current.getCurrentTime());
      }
      const mm = Math.floor(currentSec / 60);
      const ss = String(currentSec % 60).padStart(2, '0');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const sep = currentNotes.trim().length > 0 ? (currentNotes.endsWith('\n') ? '' : '\n') : '';
      setCurrentNotes(`${currentNotes}${sep}- [${mm}:${ss}] `);
    } catch (e) {}
  };

  const handleSeekToTimestamp = (tsStr: string) => {
    const match = tsStr.match(/(\d{1,2}):(\d{2})/);
    if (match && playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(parseInt(match[1], 10) * 60 + parseInt(match[2], 10), true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleExportToNotes = async () => {
    if (!currentNotes.trim()) { Alert.alert('Empty Notes', 'Please write some notes before exporting to ZenNotes.'); return; }
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to save notes.'); return; }
    setExporting(true);
    try {
      const topic = learningTopics?.find(t => t.subTasks?.some(s => s.id === activeVideoSub.id));
      const topicTitle = topic?.title || 'Learning';
      const cleanTitle = activeVideoSub.title || 'Lecture Notes';
      const pdfFileName = `${cleanTitle.replace(/[/\\?%*:|"<>]/g, '_').trim()}.pdf`;
      const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const fmtContent = (text: string) => {
        return text.split('\n').map(line => {
          let p = escHtml(line).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
          if (/^### /.test(line)) return `<h3>${p.replace(/^### /, '')}</h3>`;
          if (/^## /.test(line)) return `<h2>${p.replace(/^## /, '')}</h2>`;
          if (/^# /.test(line)) return `<h1>${p.replace(/^# /, '')}</h1>`;
          if (/^- /.test(line)) return `<li>${p.replace(/^- /, '')}</li>`;
          if (line.trim() === '') return '<br>';
          return `<p>${p}</p>`;
        }).join('\n');
      };
      const htmlContent = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"/><style>body{font-family:sans-serif;padding:36px 44px;color:#1c1c1e;line-height:1.7;}h1{font-size:22px;font-weight:700;color:#000;margin:22px 0 10px;}h2{font-size:18px;font-weight:600;margin:18px 0 8px;}h3{font-size:15px;font-weight:600;margin:14px 0 6px;}p{margin-bottom:12px;font-size:14px;}li{margin-left:22px;margin-bottom:6px;font-size:14px;}code{font-family:monospace;font-size:13px;background:#f2f2f7;padding:2px 4px;border-radius:4px;}</style></head><body><h1>${escHtml(cleanTitle)}</h1><p><strong>Topic:</strong> ${escHtml(topicTitle)} &bull; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p><hr/>${fmtContent(currentNotes)}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      let pdfUrl = uri; let pdfSize = 50000;
      try {
        const uploadRes = await uploadFileToCloudinary(uri, 'application/pdf', pdfFileName);
        if (uploadRes?.url) { pdfUrl = uploadRes.url; pdfSize = uploadRes.size || 50000; }
      } catch (_) {}
      await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
        userId: user.uid, name: pdfFileName, type: 'file', fileType: 'pdf',
        url: pdfUrl, size: pdfSize, parentId: null, tags: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('🎉 PDF Exported!', `"${pdfFileName}" saved to ZenNotes.`, [
        { text: 'Awesome!', style: 'cancel' },
        { text: 'Share', onPress: async () => { try { await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' }); } catch (_) {} } }
      ]);
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Could not export PDF.');
    } finally { setExporting(false); }
  };

  const handleGenerateFlashcards = async (sourceText?: string) => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to save flashcards.'); return; }
    setGeneratingCards(true);
    try {
      const content = sourceText || currentNotes || (aiHistory.filter(h => h.role === 'model').slice(-1)[0]?.text) || activeVideoSub.title;
      const cards = await generateFlashcardsFromContext(activeVideoSub.title, 'Learning Workspace', content);
      if (cards.length > 0) {
        const count = await saveFlashcardsToFirestore(user.uid, activeVideoSub.title, 'Learning Workspace', cards);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('🎉 Flashcards Created!', `${count} Active Recall Flashcards scheduled in your Spaced Repetition deck.`, [{ text: 'Great!' }]);
      } else {
        Alert.alert('No Cards Created', 'Could not generate flashcards from this section. Try again.');
      }
    } catch (e: any) {
      Alert.alert('Flashcard Error', e?.message || 'Failed to generate flashcards.');
    } finally { setGeneratingCards(false); }
  };

  const handleExportResponseToNotes = async (responseText: string) => {
    try {
      let timeTag = '';
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const s = Math.floor(await playerRef.current.getCurrentTime());
        if (s > 0) { timeTag = ` [${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}]`; }
      }
      const noteBlock = `\n\n### 🤖 ZEN-GPT Breakdown${timeTag}\n${responseText.trim()}`;
      setCurrentNotes(currentNotes ? currentNotes.trim() + noteBlock : noteBlock.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('📝 Exported to Lecture Notes!', `Appended${timeTag ? ` with timestamp ${timeTag.trim()}` : ''}.`, [
        { text: 'View Notes', onPress: () => { setAiChatVisible(false); setNotesVisible(true); } },
        {
          text: 'Save to Cloud',
          onPress: async () => {
            if (!user) { Alert.alert('Sign In Required'); return; }
            try {
              const topic = learningTopics?.find(t => t.subTasks?.some(s => s.id === activeVideoSub.id));
              await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
                userId: user.uid, name: `ZEN-GPT: ${activeVideoSub.title || 'Lecture Note'}${timeTag}`,
                content: `# 🤖 ZEN-GPT${timeTag}\n\n**Lecture:** ${activeVideoSub.title}\n**Topic:** ${topic?.title || 'Learning'}\n\n---\n\n${responseText.trim()}`,
                type: 'note', parentId: null, tags: [], pinned: false, color: '#00c16e',
                createdAt: Date.now(), updatedAt: Date.now(),
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('☁️ Saved to ZenNotes');
            } catch (err: any) { Alert.alert('Save Error', err?.message); }
          }
        },
        { text: 'Keep Chatting', style: 'cancel' }
      ]);
    } catch (e: any) { Alert.alert('Export Error', e?.message); }
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
    setCurrentNotes(currentNotes ? `${currentNotes}\n[${cue.formattedTime}] ${cue.text}` : `[${cue.formattedTime}] ${cue.text}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Bookmark Added', `Added [${cue.formattedTime}] to your lecture notes.`);
  };

  if (!videoId) return null;

  return (
    <View style={[
      isPip ? s.pipContainer : s.fullPlayerContainer,
      isFocusMode && { backgroundColor: '#000', padding: 0 },
      isNativeFullScreen && { top: -insets.top, bottom: -insets.bottom, left: -(insets.left || 0), right: -(insets.right || 0), zIndex: 9999 }
    ]}>
      {/* Video Player */}
      <View
        style={[s.playerWrapper, isPip && { width: 150, height: 84 }, isFocusMode && { flex: 1, justifyContent: 'center' },
          !isPip && !isFocusMode && !isNativeFullScreen && { marginTop: Math.max(insets.top, Platform.OS === 'android' ? 48 : 0) },
          isNativeFullScreen && { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
          { opacity: 0.99, overflow: 'hidden' }
        ]}
        onLayout={e => {
          if (!isPip && !isFocusMode && !isNativeFullScreen)
            setVideoLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.width * 9 / 16 });
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
          webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false, androidLayerType: 'hardware', customUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }}
          onFullScreenChange={(isFullScreen: boolean) => {
            setIsNativeFullScreen(isFullScreen);
            if (isFullScreen) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            else ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          }}
        />
      </View>

      {/* Controls Row */}
      {!isPip && !isFocusMode && !isNativeFullScreen && (
        <View style={s.playerControls}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={[s.controlBtn, aiChatVisible && { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary }]}
              onPress={() => { setAiChatVisible(!aiChatVisible); setNotesVisible(false); setTranscriptVisible(false); }}>
              <Ionicons name="chatbubbles" size={18} color={aiChatVisible ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary} />
            </TouchableOpacity>
            {aiChatVisible && onToggleModel && (
              <TouchableOpacity style={[s.controlBtn, { paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3 }]} onPress={onToggleModel} accessibilityLabel="Toggle Gemini Model">
                <Text style={{ fontSize: 10, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>{selectedModel === 'gemini-3.7-flash' ? '👑 3.7' : '⚡ 2.5'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.controlBtn, notesVisible && { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary }]}
              onPress={() => { setNotesVisible(!notesVisible); setAiChatVisible(false); setTranscriptVisible(false); }}>
              <Ionicons name="document-text" size={18} color={notesVisible ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }]}
              onPress={() => handleGenerateFlashcards()} disabled={generatingCards}>
              {generatingCards ? <ActivityIndicator size="small" color={colors.accentPrimary} style={{ transform: [{ scale: 0.7 }] }} /> : <Text style={{ fontSize: 14 }}>🃏</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, { paddingHorizontal: 8 }, mindMapVisible && { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary }]}
              onPress={() => setMindMapVisible(true)}>
              <Text style={{ fontSize: 14 }}>🗺️</Text>
            </TouchableOpacity>
            {aiChatVisible && (
              <TouchableOpacity style={[s.controlBtn, { paddingHorizontal: 8 }]}
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsChatFullScreen(true); }}>
                <Ionicons name="expand" size={16} color={colors.accentPrimary} />
              </TouchableOpacity>
            )}
            {aiChatVisible && (
              <TouchableOpacity style={[s.controlBtn, { paddingHorizontal: 8 }]} onPress={() => setHistoryModalVisible(true)}>
                <Ionicons name="time-outline" size={16} color={colors.accentPrimary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.controlBtn} onPress={closeVideo}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isFocusMode && (
        <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 }} onPress={() => setIsFocusMode(false)}>
          <Ionicons name="contract" size={24} color="#fff" />
        </TouchableOpacity>
      )}
      {isPip && (
        <TouchableOpacity style={s.pipRestoreBtn} onPress={() => setIsPip(false)}>
          <Ionicons name="expand" size={24} color="#f2f2f7" />
        </TouchableOpacity>
      )}

      {/* AI Chat Panel — lazy mounted */}
      {!isPip && !isFocusMode && aiChatVisible && (
        <AiChatPanel
          aiHistory={aiHistory} aiInput={aiInput} setAiInput={setAiInput}
          aiLoading={aiLoading} sendAiMessage={sendAiMessage} generateQuiz={generateQuiz}
          generatingCards={generatingCards} isChatFullScreen={isChatFullScreen}
          setIsChatFullScreen={setIsChatFullScreen} keyboardHeight={keyboardHeight}
          isKeyboardVisible={isKeyboardVisible} selectedModel={selectedModel}
          onToggleModel={onToggleModel} resetChatHistory={resetChatHistory}
          onOpenHistory={() => setHistoryModalVisible(true)}
          onExportResponseToNotes={handleExportResponseToNotes}
          onGenerateFlashcardsFromText={handleGenerateFlashcards}
          onGenerateFlashcards={() => handleGenerateFlashcards()}
        />
      )}

      {/* Notes Panel — lazy mounted */}
      {!isPip && !isFocusMode && notesVisible && (
        <NotesPanel
          currentNotes={currentNotes} setCurrentNotes={setCurrentNotes} saveNotes={saveNotes}
          detectedTimestamps={detectedTimestamps} handleInsertTimestamp={handleInsertTimestamp}
          handleSeekToTimestamp={handleSeekToTimestamp} handleExportToNotes={handleExportToNotes}
          exporting={exporting}
        />
      )}

      {/* Transcript Panel — lazy mounted */}
      {!isPip && !isFocusMode && transcriptVisible && (
        <View style={s.transcriptPanel}>
          <View style={s.panelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.panelTitle}>Transcript</Text>
              <View style={s.transcriptCountBadge}><Text style={s.transcriptCountText}>{filteredCues.length} Cues</Text></View>
            </View>
            <TouchableOpacity
              style={[s.toolActionBtn, autoScrollTranscript && { backgroundColor: isDark ? 'rgba(0,193,110,0.15)' : 'rgba(5,150,105,0.10)', borderColor: isDark ? 'rgba(0,193,110,0.3)' : 'rgba(5,150,105,0.25)' }]}
              onPress={() => setAutoScrollTranscript(!autoScrollTranscript)}>
              <Ionicons name="locate" size={13} color={autoScrollTranscript ? (isDark ? '#00c16e' : '#059669') : colors.textMuted} />
              <Text style={[s.toolActionText, autoScrollTranscript && { color: isDark ? '#00c16e' : '#059669' }]}>{autoScrollTranscript ? 'Tracking' : 'Manual'}</Text>
            </TouchableOpacity>
          </View>
          {transcriptLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color={colors.accentPrimary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: FONT_FAMILY.body }}>Synchronizing lecture transcript...</Text>
            </View>
          ) : filteredCues.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Ionicons name="receipt-outline" size={36} color={colors.border} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: FONT_FAMILY.body, marginTop: 12, textAlign: 'center' }}>No transcript cues found for this lecture.</Text>
            </View>
          ) : (
            <ScrollView ref={transcriptScrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8, paddingBottom: 100 }}>
              {filteredCues.map((cue, idx) => {
                const isActive = activeCueIndex === idx;
                return (
                  <TouchableOpacity key={idx} activeOpacity={0.7} style={[s.cueRow, isActive && s.cueRowActive]} onPress={() => handleSeekToCue(cue)}>
                    <View style={[s.cueTimePill, isActive && s.cueTimePillActive]}>
                      <Ionicons name={isActive ? 'play' : 'time-outline'} size={10} color={isActive ? (isDark ? '#080510' : '#FFFFFF') : colors.accentPrimary} />
                      <Text style={[s.cueTimeText, isActive && s.cueTimeTextActive]}>{cue.formattedTime}</Text>
                    </View>
                    <Text style={[s.cueText, isActive && s.cueTextActive]}>{cue.text}</Text>
                    <TouchableOpacity style={s.cueAddNoteBtn} onPress={() => handleCopyCueToNotes(cue)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="bookmark-outline" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Study Hub — shown when no panel is open */}
      {!isPip && !isFocusMode && !aiChatVisible && !notesVisible && !transcriptVisible && (
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#22c55e' : '#059669' }} />
              <Text style={{ color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold, letterSpacing: 0.4 }}>ACTIVE LECTURE</Text>
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontFamily: FONT_FAMILY.bold, lineHeight: 22, marginBottom: 6 }}>{activeVideoSub.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: FONT_FAMILY.body }}>Tap any study tool below or in the toolbar above to engage with AI.</Text>
          </View>
          <View style={{ gap: 10 }}>
            {([
              { icon: 'sparkles', iconColor: isDark ? '#00c16e' : '#059669', bg: isDark ? 'rgba(0,193,110,0.12)' : 'rgba(5,150,105,0.10)', title: 'ZEN-GPT AI Tutor', desc: 'Ask questions, get step-by-step breakdowns, and quiz yourself.', onPress: () => { setAiChatVisible(true); setNotesVisible(false); setTranscriptVisible(false); } },
              { icon: 'document-text', iconColor: colors.accentPrimary, bg: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', title: 'Timestamped Notes', desc: 'Jot insights, insert video timestamps, and export to Vault.', onPress: () => { setNotesVisible(true); setAiChatVisible(false); setTranscriptVisible(false); } },
              { icon: 'receipt-outline', iconColor: isDark ? '#38bdf8' : '#0284C7', bg: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(2,132,199,0.10)', title: 'Synchronized Transcript', desc: 'Follow spoken dialogue in real-time and jump to any moment.', onPress: () => { setTranscriptVisible(true); setAiChatVisible(false); setNotesVisible(false); } },
            ] as any[]).map((item: any, idx: number) => (
              <TouchableOpacity key={idx} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 12 }} onPress={item.onPress}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: FONT_FAMILY.bold }}>{item.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 1 }}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, gap: 12 }} onPress={() => setMindMapVisible(true)}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? 'rgba(251,191,36,0.12)' : 'rgba(217,119,6,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>🗺️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: FONT_FAMILY.bold }}>360° Concept Mind Map</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 1 }}>Explore interactive spatial graph with pinch & pan.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <LectureChatHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        currentSubId={activeVideoSub?.id}
        learningTopics={learningTopics}
        onSelectLecture={onSelectLecture}
        onClearCurrentChat={resetChatHistory}
      />

      <LectureMindMap
        visible={mindMapVisible}
        onClose={() => setMindMapVisible(false)}
        lectureTitle={activeVideoSub?.title || 'Lecture'}
        transcript={transcriptPlainText}
        onAskQuestion={(question) => {
          setMindMapVisible(false);
          setAiChatVisible(true);
          setNotesVisible(false);
          setTimeout(() => sendAiMessage(question), 200);
        }}
      />
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  fullPlayerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background, zIndex: 100 },
  pipContainer: { position: 'absolute', bottom: 100, right: 20, width: 150, height: 84, backgroundColor: isDark ? '#000000' : colors.surface, borderRadius: 10, overflow: 'hidden', zIndex: 100, borderWidth: 2, borderColor: colors.accentPrimary },
  playerWrapper: { width: '100%', backgroundColor: '#000000' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  controlBtn: { padding: 6, backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA', borderRadius: 6 },
  pipRestoreBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  panelTitle: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 16 },
  transcriptPanel: { flex: 1, backgroundColor: colors.background },
  transcriptCountBadge: { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)' },
  transcriptCountText: { color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  toolActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)' },
  toolActionText: { color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  cueRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.03)' : '#ECEBF2', borderRadius: 10, marginHorizontal: 8, marginVertical: 2 },
  cueRowActive: { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.35)' : colors.accentPrimary },
  cueTimePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginRight: 10, marginTop: 1 },
  cueTimePillActive: { backgroundColor: colors.accentPrimary },
  cueTimeText: { color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  cueTimeTextActive: { color: isDark ? '#080510' : '#FFFFFF' },
  cueText: { flex: 1, color: isDark ? '#a1a1aa' : '#4B5563', fontSize: 13, lineHeight: 19, fontFamily: FONT_FAMILY.body },
  cueTextActive: { color: colors.textPrimary, fontFamily: FONT_FAMILY.medium },
  cueAddNoteBtn: { padding: 4, marginLeft: 6, marginTop: 1 },
});
