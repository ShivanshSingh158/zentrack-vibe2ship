import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, Assignment } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';

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
  const { assignments, user } = useMobileData();
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
        updateDoc(doc(db, 'assignments', editingId), data).catch(console.error);
      } else {
        addDoc(collection(db, 'assignments'), { ...data, createdAt: Date.now() }).catch(console.error);
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
          await deleteDoc(doc(db, 'assignments', id));
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
              <TouchableOpacity
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(item as any)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{label}</Text>
              </TouchableOpacity>
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
          let urgencyColor = COLORS.textMuted;
          let urgencyText = '';
          
          if (item.status === 'submitted' || item.status === 'graded') {
            urgencyText = 'Done';
          } else if (daysLeft < 0) {
            urgencyColor = COLORS.error;
            urgencyText = `Overdue by ${Math.abs(daysLeft)}d`;
          } else if (daysLeft === 0) {
            urgencyColor = COLORS.accentAmber;
            urgencyText = 'Due Today';
          } else {
            urgencyColor = daysLeft <= 3 ? COLORS.accentAmber : COLORS.accentGreen;
            urgencyText = `${daysLeft}d left`;
          }

          return (
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} onLongPress={() => confirmDelete(item.id!)}>
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
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📚</Text>
            <Text style={styles.emptyText}>No assignments found.</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { resetForm(); setModalVisible(true); }}>
        <Ionicons name="add" size={26} color="#1a110a" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Assignment' : 'New Assignment'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Math Homework"
              placeholderTextColor={COLORS.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Mathematics"
              placeholderTextColor={COLORS.textMuted}
              value={subjectName}
              onChangeText={setSubjectName}
            />

            <Text style={styles.inputLabel}>Due Date</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.accentPrimary} />
              <Text style={styles.dateBtnText}>{dueDate.toISOString().split('T')[0]}</Text>
            </TouchableOpacity>

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
                <TouchableOpacity 
                  key={k} 
                  style={[styles.statusChip, status === k && { backgroundColor: STATUS_CONFIG[k].color, borderColor: STATUS_CONFIG[k].color }]}
                  onPress={() => setStatus(k as any)}
                >
                  <Text style={[styles.statusChipText, status === k && { color: COLORS.background }]}>
                    {STATUS_CONFIG[k].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: SPACE.md },
  headerLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary },
  
  filterScroll: { paddingHorizontal: SPACE.xl, marginBottom: SPACE.md, height: 40 },
  filterChip: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.surface2, marginRight: SPACE.sm },
  filterChipActive: { backgroundColor: COLORS.accentPrimary },
  filterChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  filterChipTextActive: { color: COLORS.background },

  list: { padding: SPACE.xl, gap: SPACE.md, paddingBottom: 100 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.md, color: COLORS.textPrimary },
  cardSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  urgencyText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, marginBottom: 2 },
  dueDateText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textMuted },

  empty: { padding: SPACE.xl, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: COLORS.textMuted, fontSize: FONT_SIZE.md },

  fab: { position: 'absolute', bottom: 100, right: SPACE.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accentPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: COLORS.textPrimary },
  
  inputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACE.xs, marginTop: SPACE.md },
  input: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: SPACE.md, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md },
  
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: COLORS.surface2, padding: SPACE.md, borderRadius: RADIUS.md },
  dateBtnText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.textPrimary },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  statusChip: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  statusChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary },

  saveBtn: { backgroundColor: COLORS.accentPrimary, padding: SPACE.md, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACE.xl },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, color: '#1a110a', fontSize: FONT_SIZE.md },
});
