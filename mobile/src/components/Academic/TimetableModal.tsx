import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { AttendanceSubject as Subject } from '../../contexts/MobileDataContext';
import { useTheme } from "../../contexts/ThemeContext";
import { DAY_SHORT } from '../../screens/attendance/attendanceConstants';

interface TimetableModalProps {
  visible: boolean;
  onClose: () => void;
  subjects: Subject[];
  handleAddSubject: () => void;
  onEditSubject: (subject: Subject) => void;
  handleDeleteSubject: (id: string, name: string) => void;
  handleResetSemester: () => void;
}

export const TimetableModal = React.memo(({
  visible,
  onClose,
  subjects,
  handleAddSubject,
  onEditSubject,
  handleDeleteSubject,
  handleResetSemester,
}: TimetableModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>Timetable</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleAddSubject}
              activeOpacity={0.8}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={15} color={isDark ? "#000000" : "#FFFFFF"} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
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

            const totalAtt = clsAtt + labAtt;
            const totalHeld = clsTot + labTot;
            const totalPct = totalHeld > 0 ? Math.round((totalAtt / totalHeld) * 100) : null;

            const clsPct = clsTot > 0 ? Math.round((clsAtt / clsTot) * 100) : null;
            const labPct = labTot > 0 ? Math.round((labAtt / labTot) * 100) : null;

            const clsColor = clsPct !== null ? (clsPct >= target ? '#5eda9e' : clsPct >= target - 5 ? '#fbbf24' : '#ff6961') : colors.border;
            const labColor = labPct !== null ? (labPct >= target ? '#5eda9e' : labPct >= target - 5 ? '#fbbf24' : '#ff6961') : colors.border;
            const overallColor = totalPct !== null ? (totalPct >= target ? '#5eda9e' : totalPct >= target - 5 ? '#fbbf24' : '#ff6961') : colors.textMuted;

            // Schedule badges
            const scheduleItems: React.ReactNode[] = [];
            ['1', '2', '3', '4', '5', '6'].forEach(dKey => {
              const dayIdx = Number(dKey);
              const dSched = s.schedule?.[dKey] || s.schedule?.[dayIdx];
              const classes = Array.isArray(dSched?.classes) ? dSched.classes : [];
              const labs = Array.isArray(dSched?.labs) ? dSched.labs : [];
              const cCount = classes.length || (typeof dSched?.classCount === 'number' ? dSched.classCount : 0);
              const lCount = labs.length || (typeof dSched?.labCount === 'number' ? dSched.labCount : 0);
              const hasItems = cCount > 0 || lCount > 0;

              if (!hasItems) return;

              const parts: string[] = [];
              if (cCount > 0) parts.push(`${cCount}C`);
              if (lCount > 0) parts.push(`${lCount}L`);

              scheduleItems.push(
                <View key={dKey} style={styles.dayBadge}>
                  <Text style={styles.dayName}>{DAY_SHORT[dayIdx]}:</Text>
                  <Text style={styles.dayVal}>{parts.join(' ')}</Text>
                </View>
              );
            });

            return (
              <View style={styles.subjectCard}>
                {/* Header: Squircle Badge + Title + Target Pill + Action Icons */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.subjectBadge}>
                      <Ionicons name="school-outline" size={15} color={colors.accentPrimary} />
                    </View>
                    <View style={styles.titleCol}>
                      <View style={styles.titleRow}>
                        <Text style={styles.subjectTitle} numberOfLines={1}>{s.name}</Text>
                        <View style={styles.targetPill}>
                          <Ionicons name="locate-outline" size={10} color={colors.textMuted} />
                          <Text style={styles.targetPillText}>{target}%</Text>
                        </View>
                        {totalPct !== null && (
                          <View style={[styles.statusPctBadge, { borderColor: overallColor + '40', backgroundColor: overallColor + '18' }]}>
                            <Text style={[styles.statusPctText, { color: overallColor }]}>{totalPct}%</Text>
                          </View>
                        )}
                      </View>
                      {totalHeld > 0 && (
                        <Text style={styles.cardSubtext}>{totalAtt} of {totalHeld} attended</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardIconActions}>
                    <TouchableOpacity
                      onPress={() => onEditSubject(s)}
                      activeOpacity={0.7}
                      style={styles.iconActionBtn}
                    >
                      <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteSubject(s.id!, s.name)}
                      activeOpacity={0.7}
                      style={[styles.iconActionBtn, styles.deleteBtn]}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Infused Attendance Progress Rows (Seamlessly integrated, no cutout boxes) */}
                <View style={styles.infusedBars}>
                  <View style={styles.infusedRow}>
                    <View style={[styles.infusedTag, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(124,58,237,0.08)', borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(124,58,237,0.2)' }]}>
                      <Ionicons name="book-outline" size={11} color={colors.accentPrimary} />
                      <Text style={[styles.infusedTagText, { color: colors.accentPrimary }]}>CLASS</Text>
                    </View>
                    <View style={styles.infusedTrack}>
                      <View style={[styles.infusedFill, { width: `${Math.min(100, clsPct || 0)}%`, backgroundColor: clsColor }]} />
                    </View>
                    <View style={styles.infusedStats}>
                      <Text style={styles.infusedCountText}>{clsAtt}/{clsTot}</Text>
                      {clsPct !== null && (
                        <Text style={[styles.infusedPctText, { color: clsColor }]}>{clsPct}%</Text>
                      )}
                    </View>
                  </View>

                  {(labTot > 0 || labAtt > 0) && (
                    <View style={styles.infusedRow}>
                      <View style={[styles.infusedTag, { backgroundColor: '#38bdf818', borderColor: '#38bdf835' }]}>
                        <Ionicons name="flask-outline" size={11} color="#38bdf8" />
                        <Text style={[styles.infusedTagText, { color: '#38bdf8' }]}>LAB</Text>
                      </View>
                      <View style={styles.infusedTrack}>
                        <View style={[styles.infusedFill, { width: `${Math.min(100, labPct || 0)}%`, backgroundColor: labColor }]} />
                      </View>
                      <View style={styles.infusedStats}>
                        <Text style={styles.infusedCountText}>{labAtt}/{labTot}</Text>
                        {labPct !== null && (
                          <Text style={[styles.infusedPctText, { color: labColor }]}>{labPct}%</Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                {/* Weekly Schedule Strip */}
                <View style={styles.scheduleStrip}>
                  <View style={styles.scheduleAnchor}>
                    <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                    <Text style={styles.scheduleAnchorText}>Weekly:</Text>
                  </View>
                  <View style={styles.scheduleBadgesWrap}>
                    {scheduleItems.length > 0 ? (
                      scheduleItems
                    ) : (
                      <Text style={styles.noSchedText}>No classes scheduled</Text>
                    )}
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

  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(124,58,237,0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(124,58,237,0.2)',
  },
  countBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.accentPrimary,
  },

  listContent: {
    padding: SPACE.md,
    paddingBottom: 40,
  },
  subjectCard: {
    backgroundColor: isDark ? '#141416' : '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  subjectBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(124,58,237,0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(124,58,237,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  subjectTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: colors.textPrimary,
    maxWidth: 160,
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
  },
  targetPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  statusPctBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
  },
  statusPctText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  cardSubtext: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textMuted,
  },

  cardIconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  iconActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F4FA',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: isDark ? 'rgba(255,105,97,0.08)' : 'rgba(239,68,68,0.08)',
    borderColor: isDark ? 'rgba(255,105,97,0.2)' : 'rgba(239,68,68,0.2)',
  },

  infusedBars: {
    gap: 8,
    width: '100%',
  },
  infusedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  infusedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  infusedTagText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  infusedTrack: {
    flex: 1,
    height: 5,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  infusedFill: {
    height: '100%',
    borderRadius: 999,
  },
  infusedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 70,
    justifyContent: 'flex-end',
  },
  infusedCountText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  infusedPctText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },

  scheduleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
    flexWrap: 'wrap',
  },
  scheduleAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scheduleAnchorText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textMuted,
  },
  scheduleBadgesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0',
  },
  dayName: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9,
    color: colors.textMuted,
  },
  dayVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    color: colors.textPrimary,
  },
  noSchedText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
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
