import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

import { useTheme } from '../contexts/ThemeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, COLORS } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabType = 'to_read' | 'in_progress' | 'completed';

export default function ContentLibraryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useCoreData();
  const { contentLogs } = useCreativeData();

  const [activeTab, setActiveTab] = useState<TabType>('to_read');
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'book' | 'podcast' | 'article' | 'video'>('book');
  const [newUrl, setNewUrl] = useState('');

  // Entrance animation
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
      case 'podcast': return 'headset-outline';
      case 'article': return 'document-text-outline';
      case 'video': return 'play-circle-outline';
      default: return 'book-outline';
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Content Library</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['to_read', 'in_progress', 'completed'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              fadeAnim.setValue(0);
              slideAnim.setValue(20);
              setActiveTab(tab);
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.replace('_', ' ').toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {filteredLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={64} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyText}>No content found.</Text>
            </View>
          ) : (
            filteredLogs.map(log => (
              <AnimatedPressable key={log.id} style={styles.card} onLongPress={() => log.id && handleDelete(log.id)}>
                <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconBox}>
                      <Ionicons name={getTypeIcon(log.contentType) as any} size={20} color={COLORS.accentPrimary} />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{log.title}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    {activeTab !== 'to_read' && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => log.id && handleUpdateStatus(log.id, 'to_read')}>
                        <Ionicons name="arrow-undo-outline" size={16} color={COLORS.textTertiary} />
                      </TouchableOpacity>
                    )}
                    {activeTab !== 'in_progress' && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => log.id && handleUpdateStatus(log.id, 'in_progress')}>
                        <Text style={styles.actionText}>Start</Text>
                      </TouchableOpacity>
                    )}
                    {activeTab !== 'completed' && (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDone]} onPress={() => log.id && handleUpdateStatus(log.id, 'completed')}>
                        <Ionicons name="checkmark" size={16} color="#000" />
                        <Text style={styles.actionTextDone}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </BlurView>
              </AnimatedPressable>
            ))
          )}
        </Animated.View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Modal */}
      {modalVisible && (
        <Modal visible={modalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={80} tint="dark" style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Log Content</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </View>
              
              <TextInput
                style={styles.input}
                placeholder="Title (e.g. Atomic Habits)"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="URL (optional)"
                placeholderTextColor={COLORS.textMuted}
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
                    <Ionicons name={getTypeIcon(type) as any} size={18} color={newType === type ? '#000' : COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>Add to Library</Text>
              </TouchableOpacity>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: {
    backgroundColor: COLORS.accentPrimary,
  },
  tabText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
  },
  tabTextActive: {
    color: '#000',
    fontFamily: FONT_FAMILY.bold,
  },
  
  scrollContent: { padding: SPACE.xl, gap: SPACE.md },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { fontFamily: FONT_FAMILY.medium, color: COLORS.textMuted, marginTop: SPACE.md },

  card: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardBlur: {
    padding: SPACE.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  cardIconBox: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: 'rgba(165,153,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row', alignItems: 'center', gap: 4
  },
  actionBtnDone: {
    backgroundColor: COLORS.accentPrimary,
  },
  actionText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  actionTextDone: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: '#000' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    padding: SPACE.xl,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACE.xl,
  },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, color: COLORS.textPrimary },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.medium,
    marginBottom: SPACE.md,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.xl,
  },
  typeBtn: {
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    flex: 1, marginHorizontal: 4, alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.accentPrimary },
  
  submitBtn: {
    backgroundColor: COLORS.accentPrimary,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACE.xl,
  },
  submitBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#000' },
});
