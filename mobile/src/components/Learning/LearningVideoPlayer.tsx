/**
 * LearningVideoPlayer.tsx — ZenTrack Mobile
 * Extracted from LearningScreen.tsx for bundle splitting.
 * Full-screen YouTube player overlay with PiP, focus mode, controls,
 * AI chat panel, and lecture notes panel.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, KeyboardAvoidingView, Keyboard, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { FONT_FAMILY } from '../../theme/tokens';
import { LearningSubTask } from '../../contexts/MobileDataContext';

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
}

export default function LearningVideoPlayer({
  activeVideoSub, extractVideoId, playerRef, playing, setPlaying,
  playbackRate, setPlaybackRate, isPip, setIsPip,
  isFocusMode, setIsFocusMode, isNativeFullScreen, setIsNativeFullScreen,
  videoLayout, setVideoLayout, aiChatVisible, setAiChatVisible,
  notesVisible, setNotesVisible, aiHistory, aiInput, setAiInput,
  aiLoading, sendAiMessage, generateQuiz, currentNotes, setCurrentNotes,
  saveNotes, closeVideo,
}: LearningVideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

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
  const keyboardHeight = useRef(new Animated.Value(0)).current;

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
  const videoId = extractVideoId(activeVideoSub.url);
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
          isNativeFullScreen && { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }
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
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity style={s.controlBtn} onPress={handleSpeedChange}>
              <Text style={s.controlBtnText}>{playbackRate}x</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.controlBtn} onPress={() => setAiChatVisible(!aiChatVisible)}>
              <Ionicons name="chatbubbles" size={18} color={aiChatVisible ? '#a599ff' : '#f2f2f7'} />
            </TouchableOpacity>
            <TouchableOpacity style={s.controlBtn} onPress={() => setNotesVisible(!notesVisible)}>
              <Ionicons name="document-text" size={18} color={notesVisible ? '#a599ff' : '#f2f2f7'} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity style={s.controlBtn} onPress={() => setIsFocusMode(true)}>
              <Ionicons name="scan-outline" size={18} color="#f2f2f7" />
            </TouchableOpacity>
            <TouchableOpacity style={s.controlBtn} onPress={() => setIsPip(true)}>
              <Ionicons name="copy-outline" size={18} color="#f2f2f7" />
            </TouchableOpacity>
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
        <View style={s.aiPanel}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(100, insets.bottom + 80), gap: 12 }}>
            {aiHistory.map((item, i) => (
              <View key={i} style={[s.chatBubble, item.role === 'model' ? s.chatBubbleModel : s.chatBubbleUser]}>
                {item.role === 'model' ? (
                  <Markdown style={mdStylesModel}>{item.text}</Markdown>
                ) : (
                  <Markdown style={mdStylesUser}>{item.text}</Markdown>
                )}
              </View>
            ))}
          </ScrollView>
          <Animated.View style={[s.aiInputRow, { bottom: keyboardHeight, paddingBottom: isKeyboardVisible ? 8 : Math.max(16, insets.bottom) }]}>
            <TextInput
              style={s.aiInput}
              placeholder="Ask a question..."
              placeholderTextColor="#8e8e93"
              value={aiInput}
              onChangeText={setAiInput}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                sendAiMessage();
              }}
            />
            <TouchableOpacity
              style={s.aiSendBtn}
              onPress={() => {
                Keyboard.dismiss();
                sendAiMessage();
              }}
              disabled={aiLoading}
            >
              <Ionicons name="send" size={16} color="#000" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Notes Panel */}
      {!isPip && !isFocusMode && notesVisible && (
        <KeyboardAvoidingView style={s.notesPanel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.panelHeader}>
            <Text style={s.panelTitle}>Lecture Notes</Text>
            <TouchableOpacity onPress={saveNotes}>
              <Text style={{ color: '#a599ff', fontFamily: FONT_FAMILY.bold }}>Save</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.notesInput}
            multiline textAlignVertical="top"
            placeholder="Jot down notes here..."
            placeholderTextColor="#8e8e93"
            value={currentNotes}
            onChangeText={setCurrentNotes}
            onBlur={saveNotes}
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fullPlayerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 100 },
  pipContainer: { position: 'absolute', bottom: 100, right: 20, width: 150, height: 84, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', zIndex: 100, borderWidth: 2, borderColor: '#a599ff' },
  playerWrapper: { width: '100%', backgroundColor: '#000' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', backgroundColor: '#141416', borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  controlBtn: { padding: 8, backgroundColor: '#1c1c1e', borderRadius: 6 },
  controlBtnText: { color: '#f2f2f7', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  pipRestoreBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  panelTitle: { fontFamily: FONT_FAMILY.bold, color: '#a599ff' },
  quizBtn: { backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  quizBtnText: { color: '#a599ff', fontSize: 10, fontFamily: FONT_FAMILY.bold },
  aiPanel: { flex: 1, backgroundColor: 'transparent' },
  chatBubble: { marginBottom: 16 },
  chatBubbleModel: { backgroundColor: 'transparent', alignSelf: 'stretch', width: '100%' },
  chatBubbleUser: { backgroundColor: '#2f2f2f', alignSelf: 'flex-end', padding: 12, paddingHorizontal: 16, borderRadius: 20, maxWidth: '85%' },
  aiInputRow: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 8, backgroundColor: 'transparent' },
  aiInput: { flex: 1, backgroundColor: '#1c1c1e', borderRadius: 22, paddingHorizontal: 16, color: '#f2f2f7' },
  aiSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#a599ff', justifyContent: 'center', alignItems: 'center' },
  quizInputBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(165,153,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  notesPanel: { flex: 1, backgroundColor: '#000' },
  notesInput: { flex: 1, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
});

const mdStylesModel = StyleSheet.create({
  body: { color: '#f2f2f7', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, letterSpacing: 0.15 },
  heading1: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 20, marginTop: 14, marginBottom: 6, lineHeight: 26 },
  heading2: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 10, marginBottom: 4, lineHeight: 24 },
  heading3: { color: '#ffffff', fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 8, marginBottom: 4, lineHeight: 22 },
  strong: { color: '#ffffff', fontFamily: 'Inter_600SemiBold' },
  em: { color: '#e5e5ea', fontStyle: 'italic' },
  bullet_list_icon: { color: '#a599ff', fontSize: 14, marginTop: 3, marginRight: 8 },
  ordered_list_icon: { color: '#a599ff', fontSize: 14, marginTop: 3, marginRight: 8 },
  code_inline: { color: '#a599ff', backgroundColor: 'rgba(165,153,255,0.12)', fontFamily: 'Inter_500Medium', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 13.5 },
  code_block: { color: '#f2f2f7', backgroundColor: '#1c1c1e', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: '#2c2c2e', fontSize: 13.5 },
  fence: { color: '#f2f2f7', backgroundColor: '#1c1c1e', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: '#2c2c2e', fontSize: 13.5 },
  pre: { backgroundColor: '#1c1c1e', borderRadius: 10, borderWidth: 1, borderColor: '#2c2c2e', marginVertical: 6 },
  blockquote: { backgroundColor: 'rgba(165,153,255,0.08)', borderColor: '#a599ff', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4 },
  table: { borderColor: '#2c2c2e', borderWidth: 1, borderRadius: 8, backgroundColor: '#141416', marginVertical: 8 },
  tr: { borderColor: '#2c2c2e', borderBottomWidth: 1, flexDirection: 'row' },
  th: { backgroundColor: '#1c1c1e', color: '#a599ff', padding: 8, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  td: { padding: 8, color: '#f2f2f7', fontSize: 13 },
  paragraph: { marginTop: 0, marginBottom: 10 },
});

const mdStylesUser = StyleSheet.create({
  body: { color: '#f2f2f7', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#f2f2f7', fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 8, marginBottom: 4 },
  heading2: { color: '#f2f2f7', fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 6, marginBottom: 2 },
  heading3: { color: '#f2f2f7', fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4, marginBottom: 2 },
  strong: { color: '#f2f2f7', fontFamily: 'Inter_700Bold' },
  em: { color: '#f2f2f7', fontStyle: 'italic' },
  bullet_list_icon: { color: '#f2f2f7', fontSize: 16, marginTop: 1 },
  ordered_list_icon: { color: '#f2f2f7', fontSize: 15, marginTop: 2 },
  code_inline: { color: '#f2f2f7', backgroundColor: 'rgba(255,255,255,0.1)', fontFamily: 'Inter_500Medium', paddingHorizontal: 4, borderRadius: 4 },
  code_block: { color: '#f2f2f7', backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: 'Inter_400Regular', padding: 10, borderRadius: 8 },
  fence: { color: '#f2f2f7', backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: 'Inter_400Regular', padding: 10, borderRadius: 8 },
  pre: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },
  paragraph: { marginTop: 0, marginBottom: 0 },
});

