import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

import { useTheme } from '../contexts/ThemeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import * as Haptics from 'expo-haptics';

type TabType = 'to_read' | 'in_progress' | 'completed';

export default function ContentLibraryScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const { user } = useCoreData();
  const { contentLogs } = useCreativeData();

  const [activeTab, setActiveTab] = useState<TabType>('to_read');
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'book' | 'podcast' | 'article' | 'video'>('book');
  const [newUrl, setNewUrl] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [activeTab]);

  const filteredLogs = useMemo(() => {
    return (contentLogs || []).filter(log => log.status === activeTab).sort((a, b) => {
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });
  }, [contentLogs, activeTab]);

  const handleAdd = async () => {
    if (!newTitle.trim() || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await addDoc(collection(db, COLLECTION.CONTENT_LOGS), {
        userId: user.uid,
        title: newTitle.trim(),
        contentType: newType,
        status: 'to_read',
        url: newUrl.trim() || null,
        progressPercentage: 0,
        dateAdded: new Date().toISOString(),
      });
      setModalVisible(false);
      setNewTitle('');
      setNewUrl('');
      setNewType('book');
      setActiveTab('to_read');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add content log');
    }
  };

  const handleUpdateStatus = async (logId: string, newStatus: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'completed') {
        updateData.dateCompleted = new Date().toISOString();
        updateData.progressPercentage = 100;
      }
      await updateDoc(doc(db, COLLECTION.CONTENT_LOGS, logId), updateData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (logId: string) => {
    Alert.alert('Delete', 'Are you sure you want to delete this log?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try { await deleteDoc(doc(db, COLLECTION.CONTENT_LOGS, logId)); } catch (e) { console.error(e); }
      }}
    ]);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'book': return 'book-outline';
      case 'podcast': return 'mic-outline';
      case 'article': return 'newspaper-outline';
      case 'video': return 'play-circle-outline';
      default: return 'bookmark-outline';
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Content Library</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.backBtn}>
          <Ionicons name="add-circle" size={28} color={colors.accentPrimary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['to_read', 'in_progress', 'completed'] as const).map(tab => {
          const isActive = activeTab === tab;
          const labels = { to_read: 'Want to Read', in_progress: 'In Progress', completed: 'Finished' };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content List */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], gap: SPACE.md }}>
          {filteredLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>No items here yet.</Text>
            </View>
          ) : (
            filteredLogs.map(item => (
              <AnimatedPressable key={item.id} style={styles.card} onLongPress={() => item.id && handleDelete(item.id)}>
                <View style={styles.cardInner}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconBox}>
                      <Ionicons name={getTypeIcon(item.contentType) as any} size={20} color={colors.accentPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                      {item.url && (
                        <Text style={{ color: colors.accentPrimary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                          {item.url}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    {activeTab === 'to_read' && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => item.id && handleUpdateStatus(item.id, 'in_progress')}
                      >
                        <Text style={styles.actionText}>Start</Text>
                      </TouchableOpacity>
                    )}
                    {activeTab === 'in_progress' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnDone]}
                        onPress={() => item.id && handleUpdateStatus(item.id, 'completed')}
                      >
                        <Ionicons name="checkmark" size={14} color={isDark ? '#000000' : '#FFFFFF'} />
                        <Text style={styles.actionTextDone}>Finish</Text>
                      </TouchableOpacity>
                    )}
                    {activeTab === 'completed' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.accentGreen} />
                        <Text style={{ color: colors.accentGreen, fontSize: 12, fontFamily: FONT_FAMILY.bold }}>Completed</Text>
                      </View>
                    )}
                  </View>
                </View>
              </AnimatedPressable>
            ))
          )}
        </Animated.View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Modal */}
      {modalVisible && (
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Log Content</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              
              <TextInput
                style={styles.input}
                placeholder="Title (e.g. Atomic Habits)"
                placeholderTextColor={colors.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="URL (optional)"
                placeholderTextColor={colors.textMuted}
                value={newUrl}
                onChangeText={setNewUrl}
                autoCapitalize="none"
                keyboardType="url"
              />

              <View style={styles.typeSelector}>
                {(['book', 'podcast', 'article', 'video'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, newType === type && styles.typeBtnActive]}
                    onPress={() => setNewType(type)}
                  >
                    <Ionicons name={getTypeIcon(type) as any} size={18} color={newType === type ? (isDark ? '#000000' : '#FFFFFF') : colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>Add to Library</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: SPACE.xs, marginLeft: -SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
    gap: SPACE.sm,
  },
  tab: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F0EFF7',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  tabText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  
  scrollContent: { padding: SPACE.xl, gap: SPACE.md },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { fontFamily: FONT_FAMILY.medium, color: colors.textMuted, marginTop: SPACE.md },

  card: {
    borderRadius: RADIUS.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardInner: {
    padding: SPACE.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  cardIconBox: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACE.sm,
    gap: SPACE.sm,
  },
  actionBtn: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#EAE9F2',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  actionBtnDone: {
    backgroundColor: colors.accentPrimary,
  },
  actionText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.textPrimary },
  actionTextDone: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: isDark ? '#000000' : '#FFFFFF' },

  modalOverlay: {
    flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    padding: SPACE.xl,
    backgroundColor: isDark ? (colors.surfaceRaised || '#18181b') : '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACE.xl,
  },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, color: colors.textPrimary },
  input: {
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F5F4FA',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.medium,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.xl,
  },
  typeBtn: {
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F5F4FA',
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1, marginHorizontal: 4, alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  
  submitBtn: {
    backgroundColor: colors.accentPrimary,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACE.xl,
  },
  submitBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: isDark ? '#000000' : '#FFFFFF' },
});
