import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY } from '../../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { LearningTopic, LearningSubTask } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import * as Haptics from 'expo-haptics';

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
  const [saving, setSaving] = useState(false);
  const [activeImportTab, setActiveImportTab] = useState<'ai' | 'playlist'>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatedSyllabus, setGeneratedSyllabus] = useState<{
    curriculumTitle: string;
    description?: string;
    totalEstimatedHours?: number;
    level?: string;
    modules: { title: string; estimatedHours?: number; subtasks: { title: string; searchQuery?: string }[] }[];
  } | null>(null);

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

  const SUGGESTED_TOPICS = [
    '⚡ Complete JavaScript',
    '🚀 Full-Stack React & Node',
    '🤖 Python & Machine Learning',
    '🏛️ System Design & Architecture',
    '📊 Data Structures & Algorithms',
    '📐 Differential Equations (Sem 3)',
  ];

  const handleGenerateAiSyllabus = async (overridePrompt?: string) => {
    const promptToUse = (overridePrompt || aiPrompt).trim();
    if (!promptToUse) return;
    setGeneratingAi(true);
    setGeneratedSyllabus(null);
    if (overridePrompt) setAiPrompt(overridePrompt);

    try {
      const response = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [{
            text: `You are S.A.R.A — an elite academic curriculum architect, senior software engineer, and university professor.
The student wants to learn and master: "${promptToUse}".

Generate a comprehensive, highly structured, progressive learning roadmap from fundamental concepts to advanced mastery.
Create 4 to 6 progressive modules. Each module must have 2 to 4 actionable checkpoint lectures/subtasks.

Format strictly as JSON with this exact schema:
{
  "curriculumTitle": "Comprehensive ${promptToUse} Mastery",
  "description": "Progressive curriculum covering fundamentals to real-world advanced applications.",
  "totalEstimatedHours": 24,
  "level": "Beginner to Advanced",
  "modules": [
    {
      "title": "Module 1: Foundations & Core Architecture",
      "estimatedHours": 4,
      "subtasks": [
        { "title": "1.1 Introduction & Setup", "searchQuery": "${promptToUse} tutorial for beginners youtube" },
        { "title": "1.2 Core Syntax & Mental Models", "searchQuery": "${promptToUse} core fundamentals deep dive youtube" }
      ]
    }
  ]
}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        }
      });

      const { text } = parseProxyResponse(response);
      if (!text) throw new Error('AI response was empty. Please check your connection.');

      // Robust JSON extraction
      let jsonText = text.trim();
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonText);
      if (parsed.modules && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
        setGeneratedSyllabus(parsed);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error('AI generated an incomplete roadmap. Please try again.');
      }
    } catch (e: any) {
      console.error('[AI Syllabus]', e);
      Alert.alert('AI Generation Failed', e?.message || 'Could not generate syllabus. Please try again.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleImportAiSyllabus = async () => {
    if (!generatedSyllabus || !user) return;
    setSaving(true);
    try {
      const allSubTasks: LearningSubTask[] = [];
      for (const [i, mod] of generatedSyllabus.modules.entries()) {
        const modTitle = mod.title || `Module ${i + 1}`;
        for (const [idx, s] of (mod.subtasks || []).entries()) {
          allSubTasks.push({
            id: `${Date.now()}-${i}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            title: s.title,
            url: s.searchQuery ? `https://www.youtube.com/results?search_query=${encodeURIComponent(s.searchQuery)}` : '',
            isCompleted: false,
            estimatedHours: 1.5,
            notes: `📚 ${modTitle}\nKey checkpoint: ${s.title}\nSearch query: ${s.searchQuery || ''}`,
          });
        }
      }

      await addDoc(collection(db, COLLECTION.LEARNING_TOPICS), {
        userId: user.uid,
        title: generatedSyllabus.curriculumTitle || 'AI Learning Roadmap',
        description: generatedSyllabus.description || '',
        subTasks: allSubTasks,
        order: learningTopics.length,
        createdAt: Date.now(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '🎉 Curriculum Ready!',
        `Successfully created "${generatedSyllabus.curriculumTitle}" with ${allSubTasks.length} checkpoints in 1 structured roadmap. Happy learning!`,
        [{ text: 'Let\'s Go!' }]
      );
      setRoadmapModalVisible(false);
      setGeneratedSyllabus(null);
      setAiPrompt('');
    } catch (e: any) {
      Alert.alert('Import Failed', e?.message || 'Could not save curriculum.');
    } finally {
      setSaving(false);
    }
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

      {/* S.A.R.A AI Syllabus & Playlist Import Modal */}
      <Modal visible={roadmapModalVisible} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.card, { flex: 0.9 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={20} color="#a599ff" />
                <Text style={s.title}>Curriculum Architect</Text>
              </View>
              <TouchableOpacity onPress={() => { setRoadmapModalVisible(false); setGeneratedSyllabus(null); }}>
                <Ionicons name="close" size={24} color="#8e8e93" />
              </TouchableOpacity>
            </View>

            {/* Segment Tabs */}
            <View style={s.tabBar}>
              <TouchableOpacity
                style={[s.tabBtn, activeImportTab === 'ai' && s.tabBtnActive]}
                onPress={() => setActiveImportTab('ai')}
              >
                <Ionicons name="sparkles-outline" size={14} color={activeImportTab === 'ai' ? '#080510' : '#8e8e93'} />
                <Text style={[s.tabBtnText, activeImportTab === 'ai' && s.tabBtnTextActive]}>S.A.R.A AI Syllabus</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tabBtn, activeImportTab === 'playlist' && s.tabBtnActive]}
                onPress={() => setActiveImportTab('playlist')}
              >
                <Ionicons name="logo-youtube" size={14} color={activeImportTab === 'playlist' ? '#080510' : '#8e8e93'} />
                <Text style={[s.tabBtnText, activeImportTab === 'playlist' && s.tabBtnTextActive]}>YouTube Playlist</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {activeImportTab === 'ai' ? (
                <View>
                  <Text style={s.roadmapSub}>What do you want to learn or master?</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 }}>
                    <TextInput
                      style={[s.input, { flex: 1, paddingVertical: 12 }]}
                      placeholder="e.g. Complete JavaScript, Golang, Linear Algebra..."
                      placeholderTextColor="#71717a"
                      value={aiPrompt}
                      onChangeText={setAiPrompt}
                    />
                    <TouchableOpacity
                      style={[s.generateBtn, (!aiPrompt.trim() || generatingAi) && { opacity: 0.5 }]}
                      onPress={() => handleGenerateAiSyllabus()}
                      disabled={!aiPrompt.trim() || generatingAi}
                    >
                      {generatingAi ? (
                        <ActivityIndicator size="small" color="#080510" />
                      ) : (
                        <Text style={s.generateBtnText}>Architect ✨</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Starter Chips */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: '#71717a', fontSize: 11, fontFamily: FONT_FAMILY.bold, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Popular Roadmaps:
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {SUGGESTED_TOPICS.map((topic, tIdx) => (
                        <TouchableOpacity
                          key={tIdx}
                          style={s.suggestChip}
                          onPress={() => handleGenerateAiSyllabus(topic)}
                          disabled={generatingAi}
                        >
                          <Text style={s.suggestChipText}>{topic}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Loading State */}
                  {generatingAi && (
                    <View style={s.generatingBox}>
                      <ActivityIndicator size="large" color="#a599ff" />
                      <Text style={s.generatingTitle}>S.A.R.A is designing your curriculum...</Text>
                      <Text style={s.generatingSub}>Structuring progressive modules, checkpoints, and video links.</Text>
                    </View>
                  )}

                  {/* AI Generated Curriculum Preview */}
                  {generatedSyllabus && !generatingAi && (
                    <View style={s.generatedPreviewCard}>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={s.previewTitle}>{generatedSyllabus.curriculumTitle}</Text>
                        {generatedSyllabus.description && (
                          <Text style={s.previewDesc}>{generatedSyllabus.description}</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <View style={s.metaPill}>
                            <Ionicons name="layers-outline" size={12} color="#a599ff" />
                            <Text style={s.metaPillText}>{generatedSyllabus.modules.length} Modules</Text>
                          </View>
                          {generatedSyllabus.totalEstimatedHours && (
                            <View style={s.metaPill}>
                              <Ionicons name="time-outline" size={12} color="#a599ff" />
                              <Text style={s.metaPillText}>~{generatedSyllabus.totalEstimatedHours}h Study Time</Text>
                            </View>
                          )}
                          {generatedSyllabus.level && (
                            <View style={s.metaPill}>
                              <Ionicons name="ribbon-outline" size={12} color="#00c16e" />
                              <Text style={[s.metaPillText, { color: '#00c16e' }]}>{generatedSyllabus.level}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {generatedSyllabus.modules.map((m, mIdx) => (
                        <View key={mIdx} style={s.modulePreviewBox}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={s.moduleTitle}>{m.title}</Text>
                            {m.estimatedHours && (
                              <Text style={s.moduleHoursText}>{m.estimatedHours}h</Text>
                            )}
                          </View>
                          {(m.subtasks || []).map((sub, sIdx) => (
                            <View key={sIdx} style={s.subtaskPreviewRow}>
                              <Ionicons name="checkmark-circle-outline" size={14} color="#a599ff" />
                              <Text style={s.subtaskPreviewText}>{sub.title}</Text>
                            </View>
                          ))}
                        </View>
                      ))}

                      <TouchableOpacity
                        style={[s.importFullBtn, saving && { opacity: 0.6 }]}
                        onPress={handleImportAiSyllabus}
                        disabled={saving}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color="#080510" />
                        ) : (
                          <>
                            <Ionicons name="cloud-download" size={16} color="#080510" />
                            <Text style={s.importFullBtnText}>Import Full Curriculum into Workspace</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <Text style={s.roadmapSub}>Paste a public YouTube Playlist URL:</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 24 }}>
                    <TextInput
                      style={[s.input, { flex: 1, paddingVertical: 12 }]}
                      placeholder="https://youtube.com/playlist?list=..."
                      placeholderTextColor="#71717a"
                      value={playlistUrl}
                      onChangeText={setPlaylistUrl}
                    />
                    <TouchableOpacity
                      style={[s.generateBtn, (!playlistUrl.trim() || saving) && { opacity: 0.6 }]}
                      onPress={importYoutubePlaylist}
                      disabled={!playlistUrl.trim() || saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#080510" />
                      ) : (
                        <Text style={s.generateBtnText}>Import</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
  title: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#f2f2f7' },
  input: { backgroundColor: '#1c1c1e', borderRadius: 10, padding: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.body, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#1c1c1e' },
  cancelText: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 14 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#a599ff' },
  saveText: { fontFamily: FONT_FAMILY.bold, color: '#000', fontSize: 14 },
  roadmapSub: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },
  tabBar: { flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 12, padding: 3, marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
  tabBtnActive: { backgroundColor: '#a599ff' },
  tabBtnText: { fontFamily: FONT_FAMILY.medium, color: '#8e8e93', fontSize: 12.5 },
  tabBtnTextActive: { color: '#080510', fontFamily: FONT_FAMILY.bold },
  generateBtn: { backgroundColor: '#a599ff', paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  generateBtnText: { color: '#080510', fontFamily: FONT_FAMILY.bold, fontSize: 13 },
  generatedPreviewCard: { backgroundColor: '#1a1a1e', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(165,153,255,0.25)', marginTop: 8, marginBottom: 20 },
  previewTitle: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 16, lineHeight: 22 },
  previewDesc: { color: '#8e8e93', fontSize: 12, fontFamily: FONT_FAMILY.body, marginTop: 4, lineHeight: 18 },
  previewCount: { color: '#a599ff', fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(165,153,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)' },
  metaPillText: { color: '#a599ff', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  modulePreviewBox: { backgroundColor: '#141416', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  moduleTitle: { fontFamily: FONT_FAMILY.bold, color: '#e5e5ea', fontSize: 13, flex: 1 },
  moduleHoursText: { color: '#71717a', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  subtaskPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  subtaskPreviewText: { color: '#a1a1aa', fontSize: 12, fontFamily: FONT_FAMILY.body, flex: 1 },
  importFullBtn: { backgroundColor: '#a599ff', borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  importFullBtnText: { color: '#080510', fontFamily: FONT_FAMILY.bold, fontSize: 13.5 },
  suggestChip: { backgroundColor: '#1c1c1e', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  suggestChipText: { color: '#e5e5ea', fontSize: 11.5, fontFamily: FONT_FAMILY.medium },
  generatingBox: { backgroundColor: '#141416', borderRadius: 14, padding: 24, alignItems: 'center', justifyContent: 'center', marginVertical: 16, borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)' },
  generatingTitle: { color: '#f2f2f7', fontSize: 14, fontFamily: FONT_FAMILY.bold, marginTop: 12, textAlign: 'center' },
  generatingSub: { color: '#71717a', fontSize: 12, fontFamily: FONT_FAMILY.body, marginTop: 4, textAlign: 'center' },
});
