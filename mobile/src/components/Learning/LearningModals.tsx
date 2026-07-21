/**
 * LearningModals.tsx — ZenTrack Mobile
 * Extracted from LearningScreen.tsx for bundle splitting.
 * Contains: AddTopic, AddSubtask, ImportRoadmap, and Options modals.
 */

import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY } from '../../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { LearningTopic, LearningSubTask } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';

// ─── ROADMAPS constant lives here since it's only used in modals ──────────────
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

interface LearningModalsProps {
  user: any;
  learningTopics: LearningTopic[];

  topicModalVisible: boolean;
  setTopicModalVisible: (v: boolean) => void;
  topicTitle: string;
  setTopicTitle: (v: string) => void;

  subtaskModalVisible: boolean;
  setSubtaskModalVisible: (v: boolean) => void;
  activeTopicId: string | null;
  subTitle: string;
  setSubTitle: (v: string) => void;
  subUrl: string;
  setSubUrl: (v: string) => void;

  roadmapModalVisible: boolean;
  setRoadmapModalVisible: (v: boolean) => void;
  playlistUrl: string;
  setPlaylistUrl: (v: string) => void;

  optionsModalVisible: boolean;
  setOptionsModalVisible: (v: boolean) => void;
  activeOptionsData: { type: 'topic' | 'subtask'; topicId: string; subtaskId?: string } | null;
  setActiveOptionsData: (v: any) => void;
}

export default function LearningModals({
  user, learningTopics,
  topicModalVisible, setTopicModalVisible, topicTitle, setTopicTitle,
  subtaskModalVisible, setSubtaskModalVisible, activeTopicId, subTitle, setSubTitle, subUrl, setSubUrl,
  roadmapModalVisible, setRoadmapModalVisible, playlistUrl, setPlaylistUrl,
  optionsModalVisible, setOptionsModalVisible, activeOptionsData, setActiveOptionsData,
}: LearningModalsProps) {
  const [saving, setSaving] = React.useState(false);

  const handleAddTopic = async () => {
    if (!topicTitle.trim() || !user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, COLLECTION.LEARNING_TOPICS), {
        userId: user.uid,
        title: topicTitle.trim(),
        subTasks: [],
        order: learningTopics.length,
        createdAt: Date.now()
      });
      setTopicModalVisible(false);
      setTopicTitle('');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
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
      await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeTopicId), {
        subTasks: [...(topic.subTasks || []), newSubtask]
      });
      setSubtaskModalVisible(false);
      setSubTitle('');
      setSubUrl('');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const importRoadmap = async (roadmap: typeof ROADMAPS[0]) => {
    if (!user) return;
    setRoadmapModalVisible(false);
    try {
      for (const [i, topic] of roadmap.topics.entries()) {
        const subTasks: LearningSubTask[] = topic.subs.map((s, idx) => ({
          id: `${Date.now()}-${idx}`, title: s, isCompleted: false
        }));
        await addDoc(collection(db, COLLECTION.LEARNING_TOPICS), {
          userId: user.uid, title: topic.title, subTasks,
          order: learningTopics.length + i, createdAt: Date.now()
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
      await addDoc(collection(db, COLLECTION.LEARNING_TOPICS), {
        userId: user.uid, title: data.title || 'YouTube Playlist',
        subTasks, order: learningTopics.length, createdAt: Date.now()
      });
      Alert.alert('Success', `Imported ${data.videos.length} videos!`);
      setRoadmapModalVisible(false);
      setPlaylistUrl('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to import playlist');
    } finally { setSaving(false); }
  };

  const handleOptionDelete = async () => {
    if (!activeOptionsData) return;
    try {
      if (activeOptionsData.type === 'topic') {
        await deleteDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeOptionsData.topicId));
      } else if (activeOptionsData.subtaskId) {
        const topic = learningTopics.find(t => t.id === activeOptionsData.topicId);
        if (topic) {
          const updated = (topic.subTasks || []).filter(s => s.id !== activeOptionsData.subtaskId);
          await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeOptionsData.topicId), { subTasks: updated });
        }
      }
    } catch (e) { console.error(e); }
    finally { setOptionsModalVisible(false); setActiveOptionsData(null); }
  };

  return (
    <>
      {/* Add Topic Modal */}
      <Modal visible={topicModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <View style={s.card}>
            <Text style={s.title}>New Topic</Text>
            <TextInput style={s.input} placeholder="E.g., Quantum Computing Basics"
              placeholderTextColor="#8e8e93" value={topicTitle} onChangeText={setTopicTitle} autoFocus />
            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setTopicModalVisible(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleAddTopic} disabled={saving}>
                <Text style={s.saveText}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Subtask Modal */}
      <Modal visible={subtaskModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <View style={s.card}>
            <Text style={s.title}>Add Checkpoint</Text>
            <TextInput style={s.input} placeholder="E.g., Watch Lecture 1"
              placeholderTextColor="#8e8e93" value={subTitle} onChangeText={setSubTitle} autoFocus />
            <TextInput style={[s.input, { marginTop: 16 }]} placeholder="YouTube URL (Optional)"
              placeholderTextColor="#8e8e93" value={subUrl} onChangeText={setSubUrl} />
            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSubtaskModalVisible(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleAddSubtask} disabled={saving}>
                <Text style={s.saveText}>{saving ? 'Saving...' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Roadmap / Import Modal */}
      <Modal visible={roadmapModalVisible} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.card, { flex: 0.8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={s.title}>Import Curriculum</Text>
              <TouchableOpacity onPress={() => setRoadmapModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8e8e93" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              <Text style={s.roadmapSub}>YouTube Playlist Link (Full Import)</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24, marginTop: 8 }}>
                <TextInput style={[s.input, { flex: 1, paddingVertical: 12 }]}
                  placeholder="https://youtube.com/playlist?list=..."
                  placeholderTextColor="#8e8e93" value={playlistUrl} onChangeText={setPlaylistUrl} />
                <TouchableOpacity
                  style={{ backgroundColor: '#a599ff', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, opacity: saving ? 0.7 : 1 }}
                  onPress={importYoutubePlaylist} disabled={saving}>
                  <Text style={{ color: '#000', fontFamily: FONT_FAMILY.bold }}>{saving ? 'Importing...' : 'Import'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.roadmapSub, { marginBottom: 12 }]}>Premade Roadmaps</Text>
              {ROADMAPS.map(rm => (
                <TouchableOpacity key={rm.id} style={s.roadmapCard} onPress={() => importRoadmap(rm)}>
                  <Text style={s.roadmapTitle}>{rm.title}</Text>
                  <Text style={s.roadmapSub}>{rm.topics.length} Modules</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Options (Delete) Modal */}
      <Modal visible={optionsModalVisible} animationType="fade" transparent onRequestClose={() => setOptionsModalVisible(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOptionsModalVisible(false)}>
          <View style={[s.card, { paddingBottom: 32 }]} onStartShouldSetResponder={() => true}>
            <View style={{ width: 40, height: 4, backgroundColor: '#2c2c2e', borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />
            <Text style={[s.title, { textAlign: 'center' }]}>Options</Text>
            <TouchableOpacity
              style={{ backgroundColor: '#1c1c1e', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onPress={handleOptionDelete}>
              <Ionicons name="trash-outline" size={18} color="#ff453a" />
              <Text style={{ fontFamily: FONT_FAMILY.bold, color: '#ff453a', fontSize: 15 }}>
                {activeOptionsData?.type === 'topic' ? 'Delete Path' : 'Delete Checkpoint'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12, padding: 16, alignItems: 'center' }} onPress={() => setOptionsModalVisible(false)}>
              <Text style={{ fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#141416', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#f2f2f7', marginBottom: 16 },
  input: { backgroundColor: '#1c1c1e', borderRadius: 10, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#1c1c1e' },
  cancelText: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 14 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#a599ff' },
  saveText: { fontFamily: FONT_FAMILY.bold, color: '#000', fontSize: 14 },
  roadmapCard: { backgroundColor: '#1c1c1e', padding: 16, borderRadius: 10, marginBottom: 12 },
  roadmapTitle: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 15 },
  roadmapSub: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 12, marginTop: 4 },
});
