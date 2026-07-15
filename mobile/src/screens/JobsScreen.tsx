import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Linking, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, JobApplication } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';

const STATUS_CONFIG = {
  wishlist: { label: 'Wishlist', color: '#8b5cf6', icon: 'star-outline' as const },
  applied: { label: 'Applied', color: '#3b82f6', icon: 'paper-plane-outline' as const },
  interviewing: { label: 'Interviewing', color: '#f59e0b', icon: 'chatbubbles-outline' as const },
  offer: { label: 'Offer', color: '#10b981', icon: 'trophy-outline' as const },
  rejected: { label: 'Rejected', color: '#ef4444', icon: 'close-circle-outline' as const },
};

export default function JobsScreen() {
  const { jobs, user } = useMobileData();
  const [filter, setFilter] = useState<JobApplication['status'] | 'all'>('all');
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<JobApplication['status']>('wishlist');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCompany('');
    setRole('');
    setStatus('wishlist');
    setLocation('');
    setSalary('');
    setUrl('');
    setEditingId(null);
  };

  const handleSave = () => {
    if (!company.trim() || !role.trim() || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    const data: Partial<JobApplication> = {
      userId: user.uid,
      company: company.trim(),
      role: role.trim(),
      status,
      location: location.trim(),
      salary: salary.trim(),
      url: url.trim(),
      dateApplied: new Date().toISOString().split('T')[0],
    };

    setTimeout(() => {
      if (editingId) {
        updateDoc(doc(db, 'job_applications', editingId), data).catch(console.error);
      } else {
        addDoc(collection(db, 'job_applications'), { ...data, createdAt: Date.now() }).catch(console.error);
      }
    }, 150);
    
    setModalVisible(false);
    resetForm();
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete', 'Are you sure you want to delete this job?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'job_applications', id));
        } catch (e) {
          console.error(e);
        }
      }}
    ]);
  };

  const openEdit = (job: JobApplication) => {
    setEditingId(job.id!);
    setCompany(job.company);
    setRole(job.role);
    setStatus(job.status);
    setLocation(job.location || '');
    setSalary(job.salary || job.expectedSalary || '');
    setUrl(job.url || '');
    setModalVisible(true);
  };

  const filteredData = useMemo(() => {
    let list = [...jobs];
    if (filter !== 'all') {
      list = list.filter(j => j.status === filter);
    }
    list.sort((a, b) => b.dateApplied.localeCompare(a.dateApplied));
    return list;
  }, [jobs, filter]);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>CAREER</Text>
          <Text style={styles.headerTitle}>Job Tracker</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterScroll}>
        <FlashList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'wishlist', 'applied', 'interviewing', 'offer', 'rejected']}
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
        keyExtractor={j => j.id!}

        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const conf = STATUS_CONFIG[item.status];
          
          return (
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} onLongPress={() => confirmDelete(item.id!)}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.statusIcon, { backgroundColor: conf.color + '20' }]}>
                    <Ionicons name={conf.icon} size={16} color={conf.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.role}</Text>
                    <Text style={styles.cardSub}>{item.company}</Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.cardFooter}>
                <View style={styles.pillRow}>
                  {item.location ? (
                    <View style={styles.pill}>
                      <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                      <Text style={styles.pillText}>{item.location}</Text>
                    </View>
                  ) : null}
                  {item.salary ? (
                    <View style={styles.pill}>
                      <Ionicons name="cash-outline" size={12} color={COLORS.accentGreen} />
                      <Text style={[styles.pillText, { color: COLORS.accentGreen }]}>{item.salary}</Text>
                    </View>
                  ) : null}
                </View>
                
                {item.url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(item.url!)} style={{ padding: 4 }}>
                    <Ionicons name="link-outline" size={20} color={COLORS.accentPrimary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>💼</Text>
            <Text style={styles.emptyText}>No jobs found in this stage.</Text>
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
              <Text style={styles.modalTitle}>{editingId ? 'Edit Job' : 'Add Job'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Company</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="E.g., Google"
                    placeholderTextColor={COLORS.textMuted}
                    value={company}
                    onChangeText={setCompany}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Role</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="E.g., SWE"
                    placeholderTextColor={COLORS.textMuted}
                    value={role}
                    onChangeText={setRole}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusRow}>
                {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(k => (
                  <TouchableOpacity 
                    key={k} 
                    style={[styles.statusChip, status === k && { backgroundColor: STATUS_CONFIG[k].color, borderColor: STATUS_CONFIG[k].color }]}
                    onPress={() => setStatus(k)}
                  >
                    <Text style={[styles.statusChipText, status === k && { color: COLORS.background }]}>
                      {STATUS_CONFIG[k].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Location (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., San Francisco, CA"
                placeholderTextColor={COLORS.textMuted}
                value={location}
                onChangeText={setLocation}
              />

              <Text style={styles.inputLabel}>Salary (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., $150k"
                placeholderTextColor={COLORS.textMuted}
                value={salary}
                onChangeText={setSalary}
              />

              <Text style={styles.inputLabel}>Link (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://..."
                placeholderTextColor={COLORS.textMuted}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Job'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
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
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, flex: 1 },
  statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: COLORS.textPrimary },
  cardSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  pillRow: { flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap', flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surface2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.md },
  pillText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: COLORS.textMuted },

  empty: { padding: SPACE.xl, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: COLORS.textMuted, fontSize: FONT_SIZE.md },

  fab: { position: 'absolute', bottom: SPACE.xl, right: SPACE.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accentPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: COLORS.textPrimary },
  
  inputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACE.xs, marginTop: SPACE.md },
  input: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: SPACE.md, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md },
  
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  statusChip: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  statusChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary },

  saveBtn: { backgroundColor: COLORS.accentPrimary, padding: SPACE.md, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACE.xl },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, color: '#1a110a', fontSize: FONT_SIZE.md },
});
