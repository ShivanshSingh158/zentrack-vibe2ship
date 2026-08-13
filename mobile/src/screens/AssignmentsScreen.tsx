import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/ui/BottomSheet';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, Assignment } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import { useSaraSurface } from '../hooks/useSaraSurface';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';


const STATUS_CONFIG = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: 'time-outline' as const },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: 'create-outline' as const },
  submitted: { label: 'Submitted', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: 'document-text-outline' as const },
  graded: { label: 'Graded', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: 'checkmark-circle-outline' as const },
};

const getDaysUntilDue = (dueDateStr: string) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const due = new Date(dueDateStr + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export default function AssignmentsScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { assignments, user } = useMobileData();

  // Cap 5: PSI surface injection — 48h deadline alert
  const psiCtx = useMemo(() => ({ assignments: assignments as any[] }), [assignments]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('Assignments', psiCtx as any, user?.uid);

  const [filter, setFilter] = useState<'all' | 'not_started' | 'in_progress' | 'submitted' | 'graded'>('all');
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [status, setStatus] = useState<Assignment['status']>('not_started');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setSubjectName('');
    setDueDate(new Date());
    setStatus('not_started');
    setEditingId(null);
  };

  const handleSave = () => {
    if (!title.trim() || !subjectName.trim() || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    const dueDateStr = dueDate.toISOString().split('T')[0];
    const data = {
      userId: user.uid,
      title: title.trim(),
      subjectName: subjectName.trim(),
      dueDate: dueDateStr,
      status,
      updatedAt: Date.now(),
    };

    setTimeout(() => {
      if (editingId) {
        updateDoc(doc(db, COLLECTION.ASSIGNMENTS, editingId), data).catch(handleSyncError);
      } else {
        addDoc(collection(db, COLLECTION.ASSIGNMENTS), { ...data, createdAt: Date.now() }).catch(handleSyncError);
      }
    }, 150);
    
    setModalVisible(false);
    resetForm();
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete', 'Are you sure you want to delete this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, COLLECTION.ASSIGNMENTS, id));
        } catch (e) {
          console.error(e);
        }
      }}
    ]);
  };

  const openEdit = (a: Assignment) => {
    setEditingId(a.id!);
    setTitle(a.title);
    setSubjectName(a.subjectName);
    setStatus(a.status);
    setDueDate(new Date(a.dueDate + 'T00:00:00'));
    setModalVisible(true);
  };

  const filteredData = useMemo(() => {
    let list = [...assignments];
    if (filter !== 'all') {
      list = list.filter(a => a.status === filter);
    }
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return list;
  }, [assignments, filter]);

  return (
    <SafeAreaView style={styles.root}>
      {/* Cap 5: PSI surface banner — fires when any assignment is due within 48h */}
      <SaraHUDBanner
        message={surfaceMessage || ''}
        visible={!!surfaceMessage}
        onDismiss={dismissBanner}
        actionLabel={surfaceActionLabel || undefined}
      />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>ACADEMICS</Text>
          <Text style={styles.headerTitle}>Assignments</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterScroll}>
        <FlashList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'not_started', 'in_progress', 'submitted', 'graded']}
          keyExtractor={i => i}

          renderItem={({ item }) => {
            const label = item === 'all' ? 'All' : STATUS_CONFIG[item as keyof typeof STATUS_CONFIG].label;
            const isActive = filter === item;
            return (
              <AnimatedPressable
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(item as any)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{label}</Text>
              </AnimatedPressable>
            );
          }}
        />
      </View>

      {/* List */}
      <FlashList
        data={filteredData}
        keyExtractor={a => a.id!}

        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const conf = STATUS_CONFIG[item.status];
          const daysLeft = getDaysUntilDue(item.dueDate);
          let urgencyColor = colors.textMuted;
          let urgencyText = '';
          
          if (item.status === 'submitted' || item.status === 'graded') {
            urgencyText = 'Done';
          } else if (daysLeft < 0) {
            urgencyColor = colors.error;
            urgencyText = `Overdue by ${Math.abs(daysLeft)}d`;
          } else if (daysLeft === 0) {
            urgencyColor = colors.accentAmber;
            urgencyText = 'Due Today';
          } else {
            urgencyColor = daysLeft <= 3 ? colors.accentAmber : colors.accentGreen;
            urgencyText = `${daysLeft}d left`;
          }

          return (
            <AnimatedPressable style={styles.card} onPress={() => openEdit(item)} onLongPress={() => confirmDelete(item.id!)}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.statusIcon, { backgroundColor: conf.bg }]}>
                    <Ionicons name={conf.icon} size={16} color={conf.color} />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSub}>{item.subjectName}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.urgencyText, { color: urgencyColor }]}>{urgencyText}</Text>
                  <Text style={styles.dueDateText}>{item.dueDate}</Text>
                </View>
              </View>
            </AnimatedPressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="All caught up!"
            subtitle="No pending assignments right now."
          />
        }
      />

      {/* FAB */}
      <AnimatedPressable style={styles.fab} onPress={() => { resetForm(); setModalVisible(true); }}>
        <Ionicons name="add" size={26} color="#1a110a" />
      </AnimatedPressable>

      {/* Add/Edit Modal */}
      <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Assignment' : 'New Assignment'}</Text>
              <AnimatedPressable onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Math Homework"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Mathematics"
              placeholderTextColor={colors.textMuted}
              value={subjectName}
              onChangeText={setSubjectName}
            />

            <Text style={styles.inputLabel}>Due Date</Text>
            <AnimatedPressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.accentPrimary} />
              <Text style={styles.dateBtnText}>{dueDate.toISOString().split('T')[0]}</Text>
            </AnimatedPressable>

            {showPicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (selectedDate) setDueDate(selectedDate);
                }}
              />
            )}

            <Text style={styles.inputLabel}>Status</Text>
            <View style={styles.statusRow}>
              {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(k => (
                <AnimatedPressable 
                  key={k} 
                  style={[styles.statusChip, status === k && { backgroundColor: STATUS_CONFIG[k].color, borderColor: STATUS_CONFIG[k].color }]}
                  onPress={() => setStatus(k as any)}
                >
                  <Text style={[styles.statusChipText, status === k && { color: colors.background }]}>
                    {STATUS_CONFIG[k].label}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>

            <AnimatedPressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </AnimatedPressable>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.md },
      headerLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textMuted, letterSpacing: 2, marginBottom: 2 },
      headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xxl, color: colors.textPrimary },
      
      filterScroll: { paddingHorizontal: SPACE.xl, marginBottom: SPACE.md, height: 40 },
      filterChip: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, backgroundColor: colors.surface2, marginRight: SPACE.sm },
      filterChipActive: { backgroundColor: colors.accentPrimary },
      filterChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textMuted },
      filterChipTextActive: { color: colors.background },

      list: { padding: SPACE.xl, gap: SPACE.md, paddingBottom: 100 },
      card: { backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1, borderColor: colors.border, ...SHADOW.sm },
      cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
      statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
      cardTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.md, color: colors.textPrimary },
      cardSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      urgencyText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, marginBottom: 2 },
      dueDateText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted },

      empty: { padding: SPACE.xl, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
      emptyText: { fontFamily: FONT_FAMILY.body, color: colors.textMuted, fontSize: FONT_SIZE.md },

      fab: { position: 'absolute', bottom: 100, right: SPACE.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW.md },

      modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl },
      modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
      modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: colors.textPrimary },
      
      inputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: SPACE.xs, marginTop: SPACE.md },
      input: { backgroundColor: colors.surface2, borderRadius: RADIUS.md, padding: SPACE.md, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md },
      
      dateBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: colors.surface2, padding: SPACE.md, borderRadius: RADIUS.md },
      dateBtnText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textPrimary },

      statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
      statusChip: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
      statusChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textPrimary },

      saveBtn: { backgroundColor: colors.accentPrimary, padding: SPACE.md, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACE.xl },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, color: '#1a110a', fontSize: FONT_SIZE.md },
    });
