import React from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { AttendanceSubject as Subject } from '../../contexts/MobileDataContext';
import { useTheme } from "../../contexts/ThemeContext";

interface TimetableModalProps {
  visible: boolean;
  onClose: () => void;
  subjects: Subject[];
  handleAddSubject: () => void;
  setEditSubject: (subject: Subject) => void;
  setShowAddModal: (show: boolean) => void;
  handleDeleteSubject: (id: string, name: string) => void;
  handleResetSemester: () => void;
}

export const TimetableModal = React.memo(({
  visible,
  onClose,
  subjects,
  handleAddSubject,
  setEditSubject,
  setShowAddModal,
  handleDeleteSubject,
  handleResetSemester,
}: TimetableModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Timetable</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleAddSubject}
              activeOpacity={0.8}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={16} color={isDark ? "#000000" : "#FFFFFF"} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subjects List */}
        <FlatList
          data={subjects}
          keyExtractor={s => s.id!}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: s }) => {
            const target = s.targetPercentage || 75;
            const clsAtt = s.classesAttended || 0;
            const clsTot = s.classesTotal || 0;
            const labAtt = s.labsAttended || 0;
            const labTot = s.labsTotal || 0;

            return (
              <View style={styles.subjectCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.subjectTitle} numberOfLines={1}>{s.name}</Text>
                  <View style={styles.cardIconActions}>
                    <TouchableOpacity
                      onPress={() => { setEditSubject(s); setShowAddModal(true); }}
                      activeOpacity={0.7}
                      style={styles.iconActionBtn}
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteSubject(s.id!, s.name)}
                      activeOpacity={0.7}
                      style={styles.iconActionBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Subtitle / Target info */}
                <View style={styles.metaRow}>
                  <View style={styles.targetBadge}>
                    <Text style={styles.targetBadgeLabel}>Target:</Text>
                    <Text style={styles.targetBadgeVal}>{target}%</Text>
                  </View>
                </View>

                {/* Metrics chips */}
                <View style={styles.metricsRow}>
                  <View style={styles.metricChip}>
                    <Text style={styles.metricChipLabel}>Classes</Text>
                    <Text style={styles.metricChipVal}>{clsAtt}/{clsTot}</Text>
                  </View>
                  <View style={styles.metricChip}>
                    <Text style={styles.metricChipLabel}>Labs</Text>
                    <Text style={styles.metricChipVal}>{labAtt}/{labTot}</Text>
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            subjects.length > 0 ? (
              <View style={styles.footerRow}>
                <TouchableOpacity
                  onPress={handleResetSemester}
                  activeOpacity={0.8}
                  style={[styles.footerActionBtn, styles.resetBtn]}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.error} />
                  <Text style={styles.resetBtnText}>Reset Semester</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.lg,
  },
  addBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: isDark ? '#000000' : '#FFFFFF',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#EAE9F2',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E2E1EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  listContent: {
    padding: SPACE.lg,
    paddingBottom: 40,
  },
  subjectCard: {
    backgroundColor: isDark ? '#141416' : '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.xs,
  },
  subjectTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginRight: SPACE.sm,
  },
  cardIconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F4FA',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E2E1EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  targetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  targetBadgeLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  targetBadgeVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  metricChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F5F4FA',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricChipLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  metricChipVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: colors.textPrimary,
  },

  footerRow: {
    flexDirection: 'row',
    gap: SPACE.md,
    marginTop: SPACE.md,
    marginBottom: SPACE.xl,
  },
  footerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  resetBtn: {
    backgroundColor: isDark ? 'rgba(255,105,97,0.08)' : 'rgba(239,68,68,0.10)',
    borderColor: isDark ? 'rgba(255,105,97,0.2)' : 'rgba(239,68,68,0.25)',
  },
  resetBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: colors.error,
  },
});
