/**
 * LearningVideoPlayer.tsx — ZenTrack Mobile
 * Extracted from LearningScreen.tsx for bundle splitting.
 * Full-screen YouTube player overlay with PiP, focus mode, controls,
 * AI chat panel, and lecture notes panel.
 */

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  sendAiMessage: () => void;
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
          initialPlayerParams={{ controls: true, modestbranding: true }}
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
            <TouchableOpacity style={s.controlBtn} onPress={() => setPlaybackRate(r => r >= 2 ? 1 : r + 0.25)}>
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
          <View style={s.panelHeader}>
            <Text style={s.panelTitle}>ZEN-GPT Tutor</Text>
            <TouchableOpacity onPress={generateQuiz} style={s.quizBtn}>
              <Text style={s.quizBtnText}>Quiz Me</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {aiHistory.map((item, i) => (
              <View key={i} style={[s.chatBubble, item.role === 'model' ? s.chatBubbleModel : s.chatBubbleUser]}>
                <Text style={{ color: item.role === 'model' ? '#000' : '#f2f2f7' }}>{item.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={[s.aiInputRow, { paddingBottom: Math.max(16, insets.bottom + 85) }]}>
            <TextInput
              style={s.aiInput}
              placeholder="Ask a question..."
              placeholderTextColor="#8e8e93"
              value={aiInput}
              onChangeText={setAiInput}
              onSubmitEditing={sendAiMessage}
            />
            <TouchableOpacity style={s.aiSendBtn} onPress={sendAiMessage} disabled={aiLoading}>
              <Ionicons name="send" size={16} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Notes Panel */}
      {!isPip && !isFocusMode && notesVisible && (
        <View style={s.notesPanel}>
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
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fullPlayerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 100 },
  pipContainer: { position: 'absolute', bottom: 100, right: 20, width: 150, height: 84, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', zIndex: 100, borderWidth: 2, borderColor: '#a599ff' },
  playerWrapper: { width: '100%', backgroundColor: '#000' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#141416', borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  controlBtn: { padding: 8, backgroundColor: '#1c1c1e', borderRadius: 6 },
  controlBtnText: { color: '#f2f2f7', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  pipRestoreBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  panelTitle: { fontFamily: FONT_FAMILY.bold, color: '#a599ff' },
  quizBtn: { backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  quizBtnText: { color: '#a599ff', fontSize: 10, fontFamily: FONT_FAMILY.bold },
  aiPanel: { flex: 1, backgroundColor: '#000' },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: '85%' },
  chatBubbleModel: { backgroundColor: '#a599ff', alignSelf: 'flex-start' },
  chatBubbleUser: { backgroundColor: '#1c1c1e', alignSelf: 'flex-end' },
  aiInputRow: { flexDirection: 'row', padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#1c1c1e' },
  aiInput: { flex: 1, backgroundColor: '#1c1c1e', borderRadius: 10, paddingHorizontal: 16, color: '#f2f2f7' },
  aiSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#a599ff', justifyContent: 'center', alignItems: 'center' },
  notesPanel: { flex: 1, backgroundColor: '#000' },
  notesInput: { flex: 1, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
});
