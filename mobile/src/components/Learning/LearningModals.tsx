import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
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
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

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
Create 4 to 6 progressive modules. Each module must have 2 to 4 actionable checkpoint lectures/subtasks with realistic estimated study hours (e.g., 1.0 to 4.0 hours per checkpoint depending on complexity).

Format strictly as JSON with this exact schema:
{
  "curriculumTitle": "Comprehensive ${promptToUse} Mastery",
  "description": "Progressive curriculum covering fundamentals to real-world advanced applications.",
  "totalEstimatedHours": 54,
  "level": "Beginner to Advanced",
  "modules": [
    {
      "title": "Module 1: Foundations & Core Architecture",
      "estimatedHours": 10,
      "subtasks": [
        { "title": "1.1 Introduction & Setup", "estimatedHours": 2.5, "searchQuery": "${promptToUse} tutorial for beginners youtube" },
        { "title": "1.2 Core Syntax & Mental Models", "estimatedHours": 3.0, "searchQuery": "${promptToUse} core fundamentals deep dive youtube" }
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
      const totalSubtaskCount = (generatedSyllabus.modules || []).reduce((sum, mod) => sum + (mod.subtasks?.length || 0), 0);
      const totalSyllabusHours = generatedSyllabus.totalEstimatedHours || (generatedSyllabus.modules || []).reduce((sum, mod) => sum + (mod.estimatedHours || 0), 0);

      for (const [i, mod] of (generatedSyllabus.modules || []).entries()) {
        const modTitle = mod.title || `Module ${i + 1}`;
        const modSubCount = (mod.subtasks || []).length || 1;
        const modHours = mod.estimatedHours || (totalSyllabusHours > 0 && totalSubtaskCount > 0 ? (totalSyllabusHours / totalSubtaskCount) * modSubCount : 0);

        for (const [idx, s] of (mod.subtasks || []).entries()) {
          const rawSubHours = (s as any).estimatedHours && Number((s as any).estimatedHours) > 0
            ? Number((s as any).estimatedHours)
            : (modHours > 0 ? modHours / modSubCount : (totalSyllabusHours > 0 && totalSubtaskCount > 0 ? totalSyllabusHours / totalSubtaskCount : 2.5));

          const finalSubHours = Math.round(rawSubHours * 10) / 10;

          allSubTasks.push({
            id: `${Date.now()}-${i}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            title: s.title,
            url: s.searchQuery ? `https://www.youtube.com/results?search_query=${encodeURIComponent(s.searchQuery)}` : '',
            isCompleted: false,
            estimatedHours: finalSubHours,
            notes: `📚 ${modTitle}\nKey checkpoint: ${s.title}\nSearch query: ${s.searchQuery || ''}`,
          });
        }
      }

      await addDoc(collection(db, COLLECTION.LEARNING_TOPICS), {
        userId: user.uid,
        title: generatedSyllabus.curriculumTitle || 'AI Learning Roadmap',
        description: generatedSyllabus.description || '',
        totalEstimatedHours: totalSyllabusHours || allSubTasks.reduce((sum, s) => sum + (s.estimatedHours || 0), 0),
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
      <Modal visible={topicModalVisible} transparent animationType="fade" onRequestClose={() => setTopicModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTopicModalVisible(false)} />
          <View style={s.card}>
            <Text style={s.title}>New Topic</Text>
            <TextInput
              style={s.input}
              placeholder="E.g., Quantum Computing Basics"
              placeholderTextColor={colors.textMuted}
              value={topicTitle}
              onChangeText={setTopicTitle}
              autoFocus
            />
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
      <Modal visible={subtaskModalVisible} transparent animationType="fade" onRequestClose={() => setSubtaskModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubtaskModalVisible(false)} />
          <View style={s.card}>
            <Text style={s.title}>Add Checkpoint</Text>
            <TextInput
              style={s.input}
              placeholder="E.g., Watch Lecture 1"
              placeholderTextColor={colors.textMuted}
              value={subTitle}
              onChangeText={setSubTitle}
              autoFocus
            />
            <TextInput
              style={[s.input, { marginTop: 16 }]}
              placeholder="YouTube URL (Optional)"
              placeholderTextColor={colors.textMuted}
              value={subUrl}
              onChangeText={setSubUrl}
            />
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
      <Modal visible={roadmapModalVisible} transparent animationType="slide" onRequestClose={() => { setRoadmapModalVisible(false); setGeneratedSyllabus(null); }}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setRoadmapModalVisible(false); setGeneratedSyllabus(null); }} />
          <View style={[s.card, { flex: 0.9 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={20} color={colors.accentPrimary} />
                <Text style={s.title}>Curriculum Architect</Text>
              </View>
              <TouchableOpacity 
                onPress={() => { setRoadmapModalVisible(false); setGeneratedSyllabus(null); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Segment Tabs */}
            <View style={s.tabBar}>
              <TouchableOpacity
                style={[s.tabBtn, activeImportTab === 'ai' && s.tabBtnActive]}
                onPress={() => setActiveImportTab('ai')}
              >
                <Ionicons name="sparkles-outline" size={14} color={activeImportTab === 'ai' ? (isDark ? '#080510' : '#FFFFFF') : colors.textSecondary} />
                <Text style={[s.tabBtnText, activeImportTab === 'ai' && s.tabBtnTextActive]}>S.A.R.A AI Syllabus</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tabBtn, activeImportTab === 'playlist' && s.tabBtnActive]}
                onPress={() => setActiveImportTab('playlist')}
              >
                <Ionicons name="logo-youtube" size={14} color={activeImportTab === 'playlist' ? (isDark ? '#080510' : '#FFFFFF') : colors.textSecondary} />
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
                      placeholderTextColor={colors.textSecondary || '#71717a'}
                      value={aiPrompt}
                      onChangeText={setAiPrompt}
                    />
                    <TouchableOpacity
                      style={[s.generateBtn, (!aiPrompt.trim() || generatingAi) && { opacity: 0.5 }]}
                      onPress={() => handleGenerateAiSyllabus()}
                      disabled={!aiPrompt.trim() || generatingAi}
                    >
                      {generatingAi ? (
                        <ActivityIndicator size="small" color={isDark ? '#080510' : '#FFFFFF'} />
                      ) : (
                        <Text style={s.generateBtnText}>Architect ✨</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Starter Chips */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: FONT_FAMILY.bold, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
                      <ActivityIndicator size="large" color={colors.accentPrimary} />
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
                            <Ionicons name="layers-outline" size={12} color={colors.accentPrimary} />
                            <Text style={s.metaPillText}>{generatedSyllabus.modules.length} Modules</Text>
                          </View>
                          {generatedSyllabus.totalEstimatedHours && (
                            <View style={s.metaPill}>
                              <Ionicons name="time-outline" size={12} color={colors.accentPrimary} />
                              <Text style={s.metaPillText}>~{generatedSyllabus.totalEstimatedHours}h Study Time</Text>
                            </View>
                          )}
                          {generatedSyllabus.level && (
                            <View style={s.metaPill}>
                              <Ionicons name="ribbon-outline" size={12} color={isDark ? '#00c16e' : '#059669'} />
                              <Text style={[s.metaPillText, { color: isDark ? '#00c16e' : '#059669' }]}>{generatedSyllabus.level}</Text>
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
                              <Ionicons name="checkmark-circle-outline" size={14} color={colors.accentPrimary} />
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
                          <ActivityIndicator size="small" color={isDark ? '#080510' : '#FFFFFF'} />
                        ) : (
                          <>
                            <Ionicons name="cloud-download" size={16} color={isDark ? '#080510' : '#FFFFFF'} />
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
                      placeholderTextColor={colors.textSecondary || '#71717a'}
                      value={playlistUrl}
                      onChangeText={setPlaylistUrl}
                    />
                    <TouchableOpacity
                      style={[s.generateBtn, (!playlistUrl.trim() || saving) && { opacity: 0.6 }]}
                      onPress={importYoutubePlaylist}
                      disabled={!playlistUrl.trim() || saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={isDark ? '#080510' : '#FFFFFF'} />
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
            <View style={{ width: 40, height: 4, backgroundColor: isDark ? '#2c2c2e' : '#D1D1D6', borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />
            <Text style={[s.title, { textAlign: 'center' }]}>Options</Text>
            <TouchableOpacity
              style={{ backgroundColor: isDark ? '#1c1c1e' : '#FEE2E2', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onPress={handleOptionDelete}>
              <Ionicons name="trash-outline" size={18} color="#ff453a" />
              <Text style={{ fontFamily: FONT_FAMILY.bold, color: '#ff453a', fontSize: 15 }}>
                {activeOptionsData?.type === 'topic' ? 'Delete Path' : 'Delete Checkpoint'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12, padding: 16, alignItems: 'center' }} onPress={() => setOptionsModalVisible(false)}>
              <Text style={{ fontFamily: FONT_FAMILY.body, color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: isDark ? (colors.surfaceRaised || '#18181b') : '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F5F4FA',
    borderRadius: 10,
    padding: 16,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#ECEBF2',
  },
  cancelText: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
  },
  saveText: {
    fontFamily: FONT_FAMILY.bold,
    color: isDark ? '#000000' : '#FFFFFF',
    fontSize: 14,
  },
  roadmapSub: {
    fontFamily: FONT_FAMILY.body,
    color: colors.textSecondary,
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: colors.accentPrimary,
  },
  tabBtnText: {
    fontFamily: FONT_FAMILY.medium,
    color: colors.textSecondary,
    fontSize: 12.5,
  },
  tabBtnTextActive: {
    color: isDark ? '#080510' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  generateBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateBtnText: {
    color: isDark ? '#080510' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  generatedPreviewCard: {
    backgroundColor: isDark ? '#1a1a1e' : '#F8F7FC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.20)',
    marginTop: 8,
    marginBottom: 20,
  },
  previewTitle: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  previewDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    marginTop: 4,
    lineHeight: 18,
  },
  previewCount: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.2)',
  },
  metaPillText: {
    color: colors.accentPrimary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
  modulePreviewBox: {
    backgroundColor: isDark ? '#141416' : '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moduleTitle: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
    fontSize: 13,
    flex: 1,
  },
  moduleHoursText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
  subtaskPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  subtaskPreviewText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    flex: 1,
  },
  importFullBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  importFullBtnText: {
    color: isDark ? '#080510' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13.5,
  },
  suggestChip: {
    backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestChipText: {
    color: colors.textPrimary,
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.medium,
  },
  generatingBox: {
    backgroundColor: isDark ? '#141416' : '#F8F7FC',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.2)',
  },
  generatingTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    marginTop: 12,
    textAlign: 'center',
  },
  generatingSub: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    marginTop: 4,
    textAlign: 'center',
  },
});
