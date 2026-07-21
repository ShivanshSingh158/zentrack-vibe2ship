/**
 * LearningScreen.tsx — ZenTrack Mobile (Refactored Orchestrator)
 * 
 * This file is now a thin orchestrator (~220 lines).
 * Heavy sub-components have been extracted to:
 *   - components/Learning/LearningTopicCard.tsx   (topic cards + subtask list)
 *   - components/Learning/LearningVideoPlayer.tsx  (YouTube player + AI chat + notes)
 *   - components/Learning/LearningModals.tsx       (add/edit/import modals)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  DeviceEventEmitter, Alert, LayoutAnimation, UIManager, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, LearningTopic, LearningSubTask } from '../contexts/MobileDataContext';
import { FONT_FAMILY, SHADOW } from '../theme/tokens';
import { collection, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callGeminiProxy } from '../services/geminiProxy';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import LearningTopicCard from '../components/Learning/LearningTopicCard';
import LearningVideoPlayer from '../components/Learning/LearningVideoPlayer';
import LearningModals from '../components/Learning/LearningModals';
import { COLLECTION } from '../config/constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function LearningScreen() {
  const { learningTopics, user } = useMobileData();

  // ── Modal state ──
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

  // ── UI state ──
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});

  // ── Video state ──
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

  // ── Notes state ──
  const [notesVisible, setNotesVisible] = useState(false);
  const [currentNotes, setCurrentNotes] = useState('');

  // ── Sara voice event listener ──
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

  // ── Helpers ──
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
    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, isCompleted: !s.isCompleted } : s
    );
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, topicId), { subTasks: updatedSubtasks }); } catch (e) {}
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
    try {
      const batch = writeBatch(db);
      data.forEach((topic, index) => {
        batch.update(doc(db, COLLECTION.LEARNING_TOPICS, topic.id!), { order: index });
      });
      await batch.commit();
    } catch (error) { console.error('Failed to reorder topics:', error); }
  };

  const openVideo = async (topicId: string, sub: LearningSubTask) => {
    const vidId = extractVideoId(sub.url);
    if (!vidId) { Alert.alert('Invalid URL', 'Only YouTube links are supported.'); return; }
    setActiveVideoTopicId(topicId);
    setActiveVideoSub(sub);
    setPlaying(true);
    setIsPip(false);
    setIsFocusMode(false);
    setCurrentNotes(sub.notes || '');
    setAiHistory([{ role: 'model', text: `I'm ZEN-GPT, your AI tutor. I'm watching "${sub.title}" with you. Ask me anything or type "quiz" to test your knowledge.` }]);
    try {
      const timeStr = await AsyncStorage.getItem(`@video_time_${sub.id}`);
      if (timeStr && playerRef.current) {
        playerRef.current.seekTo(parseInt(timeStr, 10), true);
      }
    } catch (e) {}
  };

  const closeVideo = async () => {
    if (activeVideoSub && playerRef.current) {
      try {
        const time = await playerRef.current.getCurrentTime();
        await AsyncStorage.setItem(`@video_time_${activeVideoSub.id}`, Math.floor(time).toString());
      } catch (e) {}
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
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeVideoTopicId), { subTasks: updated }); } catch (e) {}
  };

  const generateQuiz = async () => {
    const msg = 'quiz';
    const newHistory = [...aiHistory, { role: 'user', text: msg }];
    setAiHistory(newHistory);
    setAiLoading(true);
    try {
      const prompt = `You are ZEN-GPT, an AI tutor. Generate a quick 3-question quiz on "${activeVideoSub?.title}". Format clearly.`;
      const reply = await callGeminiProxy([{ parts: [{ text: prompt }] }]);
      setAiHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e) {
      setAiHistory([...newHistory, { role: 'model', text: 'Error connecting to ZEN-GPT.' }]);
    } finally { setAiLoading(false); }
  };

  const sendAiMessage = async () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim();
    setAiInput('');
    const newHistory = [...aiHistory, { role: 'user', text: msg }];
    setAiHistory(newHistory);
    setAiLoading(true);
    try {
      const prompt = `You are ZEN-GPT, an AI tutor helping a student learn "${activeVideoSub?.title}".\nUser: ${msg}\nKeep responses short and directly helpful.`;
      const reply = await callGeminiProxy([{ parts: [{ text: prompt }] }]);
      setAiHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e) {
      setAiHistory([...newHistory, { role: 'model', text: 'Error connecting to ZEN-GPT.' }]);
    } finally { setAiLoading(false); }
  };

  const sortedTopics = [...learningTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

  const renderListHeader = () => (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <View style={s.headerIconWrapper}>
          <Ionicons name="book" size={20} color="#a599ff" />
        </View>
        <Text style={s.screenTitle}>Learning paths</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 12 }}>
        <TouchableOpacity onPress={() => setRoadmapModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="add" size={16} color="#a599ff" />
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#f2f2f7' }}>Quick import</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
        <View style={[s.searchBar, { flex: 1, marginBottom: 0 }]}>
          <Ionicons name="search" size={16} color="#8e8e93" />
          <Text style={s.searchText}>Search</Text>
        </View>
        <TouchableOpacity style={[s.primaryBlockBtn, { width: 48, paddingVertical: 0, justifyContent: 'center', alignItems: 'center' }]} onPress={() => setTopicModalVisible(true)}>
          <Ionicons name="add" size={24} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTopicCard = (params: RenderItemParams<LearningTopic>) => (
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

  return (
    <SafeAreaView style={s.root}>
      <DraggableFlatList
        data={sortedTopics}
        keyExtractor={t => t.id!}
        contentContainerStyle={s.list}
        ListHeaderComponent={renderListHeader}
        renderItem={renderTopicCard}
        onDragEnd={onDragEnd}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No learning topics yet.</Text>
          </View>
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
        />
      )}

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  list: { padding: 18, paddingBottom: 100 },
  headerIconWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(165,153,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: '#fff' },
  searchBar: { backgroundColor: '#141416', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, marginBottom: 24, borderWidth: 1, borderColor: '#2c2c2e' },
  searchText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },
  primaryBlockBtn: { backgroundColor: '#a599ff', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  empty: { padding: 24, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },
});
