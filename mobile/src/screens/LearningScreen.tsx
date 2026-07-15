import { BlurView } from 'expo-blur';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView, Keyboard, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, LearningTopic, LearningSubTask } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import YoutubeIframe from 'react-native-youtube-iframe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callGeminiProxy } from '../services/geminiProxy';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';

const ROADMAPS = [
  {
    id: 'fullstack',
    title: 'Full-Stack Web Development',
    topics: [
      { title: 'Frontend Basics', subs: ['HTML Semantics', 'CSS Grid & Flexbox'] },
      { title: 'React', subs: ['Hooks Deep Dive', 'State Management'] },
    ]
  },
  {
    id: 'ai',
    title: 'AI & Machine Learning',
    topics: [
      { title: 'Python Basics', subs: ['Data Structures', 'NumPy & Pandas'] },
      { title: 'Neural Nets', subs: ['Forward Propagation', 'PyTorch Basics'] },
    ]
  }
];

export default function LearningScreen() {
  const { learningTopics, user } = useMobileData();

  // Modals
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [subtaskModalVisible, setSubtaskModalVisible] = useState(false);
  const [roadmapModalVisible, setRoadmapModalVisible] = useState(false);
  
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  // Forms
  const [topicTitle, setTopicTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // UI State
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // Video State
  const [activeVideoSub, setActiveVideoSub] = useState<LearningSubTask | null>(null);
  const [activeVideoTopicId, setActiveVideoTopicId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPip, setIsPip] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const playerRef = useRef<any>(null);
  const [videoLayout, setVideoLayout] = useState<{width: number, height: number}>({width: 300, height: 200});
  
  // AI State
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [aiHistory, setAiHistory] = useState<{role: string, text: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Notes State
  const [notesVisible, setNotesVisible] = useState(false);
  const [currentNotes, setCurrentNotes] = useState('');

  const checkinTimer = useRef<any>(null);

  useEffect(() => {
    // SARA Voice Integration
    const sub = DeviceEventEmitter.addListener('agent-play-video', (payload: { query: string }) => {
      // Find the best match or just the first uncompleted video
      const firstTopic = learningTopics[0];
      if (!firstTopic) return;
      const firstSub = firstTopic.subTasks?.find(s => !s.isCompleted && s.url && s.url.includes('youtu'));
      if (firstSub) {
        openVideo(firstTopic.id!, firstSub);
      } else {
        Alert.alert('Sara', 'Could not find an uncompleted lecture to play.');
      }
    });
    return () => sub.remove();
  }, [learningTopics]);

  useEffect(() => {
    if (activeVideoSub && playing && !isPip) {
      checkinTimer.current = setTimeout(() => {
        if (!isFocusMode) {
          setAiChatVisible(true);
          setAiHistory(prev => [...prev, {role: 'model', text: 'Hey, you\'ve been watching for 5 minutes. Need me to summarize anything so far or generate a quick quiz?'}]);
        }
      }, 5 * 60 * 1000);
    } else {
      if (checkinTimer.current) clearTimeout(checkinTimer.current);
    }
    return () => { if (checkinTimer.current) clearTimeout(checkinTimer.current); };
  }, [activeVideoSub, playing, isPip, isFocusMode]);

  const toggleTopic = (id: string) => {
    const newSet = new Set(expandedTopics);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedTopics(newSet);
  };

  const handleAddTopic = async () => {
    if (!topicTitle.trim() || !user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'learning_topics'), {
        userId: user.uid,
        title: topicTitle.trim(),
        subTasks: [],
        order: learningTopics.length,
        createdAt: Date.now()
      });
      setTopicModalVisible(false);
      setTopicTitle('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtask = async () => {
    if (!subTitle.trim() || !activeTopicId || !user) return;
    setSaving(true);
    try {
      const topic = learningTopics.find(t => t.id === activeTopicId);
      if (!topic) return;
      const newSubtask: LearningSubTask = {
        id: Date.now().toString(),
        title: subTitle.trim(),
        url: subUrl.trim(),
        isCompleted: false,
      };
      await updateDoc(doc(db, 'learning_topics', activeTopicId), {
        subTasks: [...(topic.subTasks || []), newSubtask]
      });
      setSubtaskModalVisible(false);
      setSubTitle('');
      setSubUrl('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const importRoadmap = async (roadmap: typeof ROADMAPS[0]) => {
    if (!user) return;
    setRoadmapModalVisible(false);
    try {
      for (const [i, topic] of roadmap.topics.entries()) {
        const subTasks: LearningSubTask[] = topic.subs.map((s, idx) => ({
          id: `${Date.now()}-${idx}`,
          title: s,
          isCompleted: false
        }));
        await addDoc(collection(db, 'learning_topics'), {
          userId: user.uid,
          title: topic.title,
          subTasks,
          order: learningTopics.length + i,
          createdAt: Date.now()
        });
      }
      Alert.alert('Success', `Imported ${roadmap.title}`);
    } catch (e) {}
  };

  const importYoutubePlaylist = async () => {
    if (!playlistUrl.trim() || !user) return;
    setSaving(true);
    try {
      const match = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      const pid = match ? match[1] : null;
      if (!pid) { Alert.alert('Invalid URL', 'Please enter a valid YouTube Playlist URL.'); return; }
      
      const res = await fetch(`https://myzentrack.vercel.app/api/youtube?playlistId=${encodeURIComponent(pid)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch playlist');
      if (!data.videos || data.videos.length === 0) throw new Error('No videos found');
      
      const subTasks: LearningSubTask[] = data.videos.map((v: any, idx: number) => ({
        id: `${Date.now()}-${idx}`,
        title: v.title,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        isCompleted: false
      }));
      
      await addDoc(collection(db, 'learning_topics'), {
        userId: user.uid,
        title: data.title || 'YouTube Playlist',
        subTasks,
        order: learningTopics.length,
        createdAt: Date.now()
      });
      
      Alert.alert('Success', `Imported ${data.videos.length} videos!`);
      setRoadmapModalVisible(false);
      setPlaylistUrl('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to import playlist');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubtask = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const updatedSubtasks = (topic.subTasks || []).map(s => 
      s.id === subtaskId ? { ...s, isCompleted: !s.isCompleted } : s
    );
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: updatedSubtasks });
    } catch (e) {}
  };

  const togglePin = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const updatedSubtasks = (topic.subTasks || []).map(s => 
      s.id === subtaskId ? { ...s, pinned: !s.pinned } : s
    );
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: updatedSubtasks });
    } catch (e) {}
  };

  const showTopicOptions = (id: string) => {
    Alert.alert('Options', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Topic', style: 'destructive', onPress: () => deleteDoc(doc(db, 'learning_topics', id)) }
    ]);
  };

  const showSubtaskOptions = (topicId: string, subtaskId: string) => {
    Alert.alert('Options', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Checkpoint', style: 'destructive', onPress: async () => {
        const topic = learningTopics.find(t => t.id === topicId);
        if (!topic) return;
        const updated = (topic.subTasks || []).filter(s => s.id !== subtaskId);
        await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: updated });
      }}
    ]);
  };

  const onDragEnd = async ({ data }: { data: LearningTopic[] }) => {
    // Reorder the frontend list optimistically
    // We update Firestore using a batch to sync the 'order' field
    try {
      const batch = writeBatch(db);
      data.forEach((topic, index) => {
        const ref = doc(db, 'learning_topics', topic.id!);
        batch.update(ref, { order: index });
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to reorder topics:", error);
    }
  };

  // Video
  const extractVideoId = (url?: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const openVideo = async (topicId: string, sub: LearningSubTask) => {
    const vidId = extractVideoId(sub.url);
    if (!vidId) {
      Alert.alert('Invalid URL', 'Only YouTube links are supported for the built-in player.');
      return;
    }
    setActiveVideoTopicId(topicId);
    setActiveVideoSub(sub);
    setIsPip(false);
    setIsFocusMode(false);
    setCurrentNotes(sub.notes || '');
    setAiHistory([{role: 'model', text: `I'm ZEN-GPT, your AI tutor. I'm watching "${sub.title}" with you. Ask me anything or type "quiz" to test your knowledge.`}]);
    
    // Resume memory
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
    try {
      await updateDoc(doc(db, 'learning_topics', activeVideoTopicId), { subTasks: updated });
    } catch (e) {}
  };

  const generateQuiz = async () => {
    Keyboard.dismiss();
    const msg = "quiz";
    const newHistory = [...aiHistory, { role: 'user', text: msg }];
    setAiHistory(newHistory);
    setAiLoading(true);
    try {
      const prompt = `You are ZEN-GPT, an AI tutor. Generate a quick 3-question quiz on "${activeVideoSub?.title}". Format clearly.`;
      const reply = await callGeminiProxy([{ parts: [{ text: prompt }] }]);
      setAiHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e) {
      setAiHistory([...newHistory, { role: 'model', text: 'Error connecting to ZEN-GPT.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  const sendAiMessage = async () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim();
    setAiInput('');
    Keyboard.dismiss();
    
    const newHistory = [...aiHistory, { role: 'user', text: msg }];
    setAiHistory(newHistory);
    setAiLoading(true);

    try {
      const prompt = `You are ZEN-GPT, an AI tutor helping a student learn "${activeVideoSub?.title}".
User's message: ${msg}
If they ask for a quiz, generate a quick 3-question quiz. Keep responses short and directly helpful.`;

      const reply = await callGeminiProxy([{ parts: [{ text: prompt }] }]);
      setAiHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e) {
      setAiHistory([...newHistory, { role: 'model', text: 'Error connecting to ZEN-GPT.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  const sortedTopics = [...learningTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

  const renderListHeader = () => (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="book" size={20} color="#ffffff" />
        <Text style={styles.screenTitle}>Learning paths</Text>
      </View>
      <Text style={styles.screenSubtitle}>
        Build your own curriculum from any playlist
      </Text>

      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16, marginTop: 24 }}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setRoadmapModalVisible(true)}>
          <Ionicons name="add" size={16} color="#a599ff" />
          <Text style={styles.headerBtnText}>Quick import</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="eye-outline" size={18} color="#8e8e93" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#8e8e93" />
        <Text style={styles.searchText}>Search</Text>
      </View>

      {/* New Topic */}
      <View style={styles.newTopicCard}>
        <Text style={styles.newTopicText}>New topic, e.g. System Design</Text>
        <TouchableOpacity style={styles.primaryBlockBtn} onPress={() => setTopicModalVisible(true)}>
          <Text style={styles.primaryBlockBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTopicCard = ({ item: topic, drag, isActive }: RenderItemParams<LearningTopic>) => {
    const isExpanded = expandedTopics.has(topic.id!);
    const subTasks = topic.subTasks || [];
    const completedCount = subTasks.filter(s => s.isCompleted).length;
    const totalCount = subTasks.length;
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

    return (
      <ScaleDecorator>
        <View style={[styles.card, isActive && { shadowColor: '#a599ff', shadowOpacity: 0.2, shadowRadius: 10 }]}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          
          <View style={[styles.cardHeader, { paddingBottom: isExpanded ? 0 : 18 }]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTopic(topic.id!)} onLongPress={drag} delayLongPress={200}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                  <Ionicons name="menu" size={16} color="#636366" />
                  <Text style={styles.cardTitle} numberOfLines={2}>{topic.title}</Text>
                </View>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#8e8e93" style={{ marginTop: 2, marginLeft: 10 }} />
              </View>
              <Text style={styles.cardStats}>
                {completedCount}/{totalCount}, {progress.toFixed(0)}%{(() => {
                  let totalH = 0;
                  subTasks.forEach(s => { if (!s.isCompleted && s.estimatedHours) totalH += s.estimatedHours; });
                  if (totalH > 0) {
                    const h = Math.floor(totalH);
                    const m = Math.round((totalH - h) * 60);
                    if (h > 0 && m > 0) return `, ${h}h ${m}m left`;
                    if (h > 0) return `, ${h}h left`;
                    return `, ${m}m left`;
                  }
                  return '';
                })()}
              </Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <TouchableOpacity style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => showTopicOptions(topic.id!)} style={{ padding: 8 }}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#8e8e93" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>

          {isExpanded && (
            <View style={styles.cardExpanded}>
              {subTasks.map((sub, idx) => {
                const isReview = sub.masteryLevel === 'revising';
                const isCurrent = !sub.isCompleted && subTasks.findIndex(s => !s.isCompleted) === idx;

                return (
                  <View key={sub.id} style={styles.subRow}>
                    <Text style={[styles.subIndex, { color: isCurrent ? '#a599ff' : '#636366' }]}>
                      #{idx + 1}
                    </Text>
                    
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <TouchableOpacity onPress={() => toggleSubtask(topic.id!, sub.id)}>
                          <View style={[styles.checkbox, 
                            sub.isCompleted ? styles.checkboxDone : (isCurrent ? styles.checkboxActive : styles.checkboxFuture)
                          ]}>
                            {sub.isCompleted && <Ionicons name="checkmark" size={20} color="#000" />}
                          </View>
                        </TouchableOpacity>
                        
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subTitle, sub.isCompleted ? styles.subTitleDone : (isCurrent ? styles.subTitleActive : undefined)]} numberOfLines={2}>
                            {sub.title}
                          </Text>
                          
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8, gap: 8 }}>
                            {!sub.isCompleted && extractVideoId(sub.url) && (
                              <TouchableOpacity style={styles.primaryBtn} onPress={() => openVideo(topic.id!, sub)}>
                                <Text style={styles.primaryBtnText}>Watch</Text>
                              </TouchableOpacity>
                            )}
                            {!sub.isCompleted && sub.estimatedHours ? (
                              <View style={styles.durationBadge}>
                                <Text style={styles.durationText}>
                                  {(() => {
                                    const h = Math.floor(sub.estimatedHours);
                                    const m = Math.round((sub.estimatedHours - h) * 60);
                                    if (h > 0 && m > 0) return `${h}h ${m}m left`;
                                    if (h > 0) return `${h}h left`;
                                    return `${m}m left`;
                                  })()}
                                </Text>
                              </View>
                            ) : null}
                            {isReview && (
                              <View style={styles.reviewBadge}>
                                <Text style={styles.reviewText}>Needs review</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TouchableOpacity onPress={() => togglePin(topic.id!, sub.id)} style={{ padding: 4 }}>
                            <Ionicons name={sub.pinned ? "star" : "star-outline"} size={18} color={sub.pinned ? '#a599ff' : '#636366'} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => showSubtaskOptions(topic.id!, sub.id)} style={{ padding: 4 }}>
                            <Ionicons name="ellipsis-horizontal" size={18} color="#636366" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity 
                style={styles.addSubBtn}
                onPress={() => { setActiveTopicId(topic.id!); setSubtaskModalVisible(true); }}
              >
                <Ionicons name="add" size={16} color="#a599ff" />
                <Text style={styles.addSubText}>Add Checkpoint</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <DraggableFlatList
        data={sortedTopics}
        keyExtractor={t => t.id!}
        contentContainerStyle={styles.list}
        ListHeaderComponent={renderListHeader}
        renderItem={renderTopicCard}
        onDragEnd={onDragEnd}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No learning topics yet.</Text>
          </View>
        }
      />

      {/* Video Player Overlay */}
      {activeVideoSub && extractVideoId(activeVideoSub.url) && (
        <View style={[isPip ? styles.pipContainer : styles.fullPlayerContainer, isFocusMode && { backgroundColor: '#000', padding: 0 }]}>
          <View 
            style={[styles.playerWrapper, isPip && { width: 150, height: 84 }, isFocusMode && { flex: 1, justifyContent: 'center' }]}
            onLayout={e => !isPip && !isFocusMode && setVideoLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.width * 9 / 16 })}
          >
            <YoutubeIframe
              ref={playerRef}
              height={isPip ? 84 : (isFocusMode ? 300 : videoLayout.height)}
              width={isPip ? 150 : (isFocusMode ? '100%' : videoLayout.width)}
              play={playing}
              videoId={extractVideoId(activeVideoSub.url)!}
              playbackRate={playbackRate}
              onChangeState={(s: string) => setPlaying(s === 'playing')}
              initialPlayerParams={{ controls: true, modestbranding: true }}
            />
          </View>
          
          {!isPip && !isFocusMode && (
            <View style={styles.playerControls}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity style={styles.controlBtn} onPress={() => setPlaybackRate(r => r >= 2 ? 1 : r + 0.25)}>
                  <Text style={styles.controlBtnText}>{playbackRate}x</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn} onPress={() => setAiChatVisible(!aiChatVisible)}>
                  <Ionicons name="chatbubbles" size={18} color={aiChatVisible ? '#a599ff' : '#f2f2f7'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn} onPress={() => setNotesVisible(!notesVisible)}>
                  <Ionicons name="document-text" size={18} color={notesVisible ? '#a599ff' : '#f2f2f7'} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity style={styles.controlBtn} onPress={() => setIsFocusMode(true)}>
                  <Ionicons name="scan-outline" size={18} color="#f2f2f7" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn} onPress={() => setIsPip(true)}>
                  <Ionicons name="copy-outline" size={18} color="#f2f2f7" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn} onPress={closeVideo}>
                  <Ionicons name="close" size={18} color="#f2f2f7" />
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
            <TouchableOpacity style={styles.pipRestoreBtn} onPress={() => setIsPip(false)}>
              <Ionicons name="expand" size={24} color="#f2f2f7" />
            </TouchableOpacity>
          )}

          {!isPip && !isFocusMode && aiChatVisible && (
            <View style={styles.aiPanel}>
              <View style={styles.aiHeader}>
                <Text style={styles.aiTitle}>ZEN-GPT Tutor</Text>
                <TouchableOpacity onPress={generateQuiz} style={styles.quizBtn}>
                  <Text style={styles.quizBtnText}>Quiz Me</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                {aiHistory.map((item, i) => (
                  <View key={i} style={[styles.chatBubble, item.role === 'model' ? styles.chatBubbleModel : styles.chatBubbleUser]}>
                    <Text style={{ color: item.role === 'model' ? '#000' : '#f2f2f7' }}>{item.text}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Ask a question..."
                  placeholderTextColor="#8e8e93"
                  value={aiInput}
                  onChangeText={setAiInput}
                  onSubmitEditing={sendAiMessage}
                />
                <TouchableOpacity style={styles.aiSendBtn} onPress={sendAiMessage} disabled={aiLoading}>
                  <Ionicons name="send" size={16} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!isPip && !isFocusMode && notesVisible && (
            <View style={styles.notesPanel}>
              <View style={styles.aiHeader}>
                <Text style={styles.aiTitle}>Lecture Notes</Text>
                <TouchableOpacity onPress={saveNotes}>
                  <Text style={{ color: '#a599ff', fontFamily: FONT_FAMILY.bold }}>Save</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.notesInput}
                multiline
                textAlignVertical="top"
                placeholder="Jot down notes here..."
                placeholderTextColor="#8e8e93"
                value={currentNotes}
                onChangeText={setCurrentNotes}
                onBlur={saveNotes}
              />
            </View>
          )}
        </View>
      )}

      {/* Topic Modal */}
      <Modal visible={topicModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Topic</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Quantum Computing Basics"
              placeholderTextColor="#8e8e93"
              value={topicTitle}
              onChangeText={setTopicTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTopicModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddTopic} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Subtask Modal */}
      <Modal visible={subtaskModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Checkpoint</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Watch Lecture 1"
              placeholderTextColor="#8e8e93"
              value={subTitle}
              onChangeText={setSubTitle}
              autoFocus
            />
            <TextInput
              style={[styles.input, { marginTop: 16 }]}
              placeholder="YouTube URL (Optional)"
              placeholderTextColor="#8e8e93"
              value={subUrl}
              onChangeText={setSubUrl}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubtaskModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddSubtask} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Roadmap/Import Modal */}
      <Modal visible={roadmapModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
        
          <View style={[styles.modalCard, { flex: 0.8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={styles.modalTitle}>Import Curriculum</Text>
              <TouchableOpacity onPress={() => setRoadmapModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8e8e93" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              
              <Text style={styles.roadmapSub}>YouTube Playlist Link (Full Import)</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24, marginTop: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingVertical: 12 }]}
                  placeholder="https://youtube.com/playlist?list=..."
                  placeholderTextColor="#8e8e93"
                  value={playlistUrl}
                  onChangeText={setPlaylistUrl}
                />
                <TouchableOpacity style={{ backgroundColor: '#a599ff', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10 }} onPress={importYoutubePlaylist} disabled={saving}>
                  <Text style={{ color: '#000', fontFamily: FONT_FAMILY.bold }}>Import</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.roadmapSub, { marginBottom: 12 }]}>Premade Roadmaps</Text>
              {ROADMAPS.map(rm => (
                <TouchableOpacity key={rm.id} style={styles.roadmapCard} onPress={() => importRoadmap(rm)}>
                  <Text style={styles.roadmapTitle}>{rm.title}</Text>
                  <Text style={styles.roadmapSub}>{rm.topics.length} Modules</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  list: { padding: 18, paddingBottom: 100 },
  
  // Header Elements
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: '#ffffff' },
  screenSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93' },
  headerBtn: { flex: 1, backgroundColor: '#141416', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  headerBtnText: { fontFamily: FONT_FAMILY.body, color: '#f2f2f7', fontSize: 13 },
  headerIconBtn: { width: 48, backgroundColor: '#141416', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  searchBar: { backgroundColor: '#141416', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8, marginBottom: 24 },
  searchText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },

  // New Topic Card
  newTopicCard: { backgroundColor: '#141416', borderRadius: 18, padding: 16, marginBottom: 24 },
  newTopicText: { color: '#636366', fontFamily: FONT_FAMILY.body, fontSize: 13, marginBottom: 12 },
  
  // Buttons
  primaryBtn: { backgroundColor: '#a599ff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  primaryBtnText: { color: '#000000', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  primaryBlockBtn: { backgroundColor: '#a599ff', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBlockBtnText: { color: '#000000', fontFamily: FONT_FAMILY.bold, fontSize: 13 },

  // Topic Cards
  card: { backgroundColor: '#141416', borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  progressTrack: { height: 3, backgroundColor: '#2c2c2e', width: '100%', position: 'absolute', top: 0, left: 0 },
  progressFill: { height: '100%', backgroundColor: '#a599ff' },
  cardHeader: { padding: 18 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#f2f2f7', flex: 1, paddingRight: 16 },
  cardStats: { color: '#636366', fontSize: 11, fontFamily: FONT_FAMILY.body },
  
  // Expanded Card
  cardExpanded: { padding: 18, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#1c1c1e' },
  subRow: { flexDirection: 'row', paddingTop: 16 },
  subIndex: { fontFamily: FONT_FAMILY.body, fontSize: 10, marginTop: 4, marginRight: 12, width: 16 },
  
  // Checkboxes
  checkbox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkboxDone: { backgroundColor: '#a599ff' },
  checkboxActive: { backgroundColor: '#1c1c1e', borderWidth: 2, borderColor: '#a599ff' },
  checkboxFuture: { backgroundColor: '#1c1c1e', borderWidth: 2, borderColor: '#3a3a3c' },
  
  // Subtitles
  subTitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#f2f2f7' },
  subTitleActive: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7' },
  subTitleDone: { color: '#636366' },
  
  // Badges
  durationBadge: { backgroundColor: '#2c2c2e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  durationText: { color: '#8e8e93', fontSize: 9.5, fontFamily: FONT_FAMILY.body },
  reviewBadge: { backgroundColor: 'rgba(255,159,77,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  reviewText: { color: '#ff9f4d', fontSize: 9, fontFamily: FONT_FAMILY.bold },
  
  addSubBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 8 },
  addSubText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#a599ff' },

  empty: { padding: 24, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#141416', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#f2f2f7', marginBottom: 16 },
  input: { backgroundColor: '#1c1c1e', borderRadius: 10, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
  
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#1c1c1e' },
  cancelBtnText: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 14 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#a599ff' },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, color: '#000000', fontSize: 14 },

  roadmapCard: { backgroundColor: '#1c1c1e', padding: 16, borderRadius: 10, marginBottom: 12 },
  roadmapTitle: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 15 },
  roadmapSub: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 12, marginTop: 4 },

  // Video Player Overlays
  fullPlayerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 100 },
  pipContainer: { position: 'absolute', bottom: 100, right: 20, width: 150, height: 84, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', zIndex: 100, ...SHADOW.md, borderWidth: 2, borderColor: '#a599ff' },
  playerWrapper: { width: '100%', backgroundColor: '#000' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#141416', borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  controlBtn: { padding: 8, backgroundColor: '#1c1c1e', borderRadius: 6 },
  controlBtnText: { color: '#f2f2f7', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  pipRestoreBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },

  aiPanel: { flex: 1, backgroundColor: '#000000' },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  aiTitle: { fontFamily: FONT_FAMILY.bold, color: '#a599ff' },
  quizBtn: { backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  quizBtnText: { color: '#a599ff', fontSize: 10, fontFamily: FONT_FAMILY.bold },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: '85%' },
  chatBubbleModel: { backgroundColor: '#a599ff', alignSelf: 'flex-start' },
  chatBubbleUser: { backgroundColor: '#1c1c1e', alignSelf: 'flex-end' },
  aiInputRow: { flexDirection: 'row', padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#1c1c1e' },
  aiInput: { flex: 1, backgroundColor: '#1c1c1e', borderRadius: 10, paddingHorizontal: 16, color: '#f2f2f7' },
  aiSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#a599ff', justifyContent: 'center', alignItems: 'center' },

  notesPanel: { flex: 1, backgroundColor: '#000000' },
  notesInput: { flex: 1, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
});

