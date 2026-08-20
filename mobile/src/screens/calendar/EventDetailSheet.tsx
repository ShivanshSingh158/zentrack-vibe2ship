/**
 * EventDetailSheet.tsx
 * Modal showing details for a selected calendar event.
 *
 * Enhanced with Fix 5.4: When a timetable class/lab is tapped,
 * renders subject attendance stats and quick action buttons
 * (Present, Absent, Cancelled) so users can log attendance
 * directly from the Calendar view!
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { CustomEvent } from '../../contexts/MobileDataContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';

interface EventDetailSheetProps {
  visible: boolean;
  selectedEvent: any;
  selectedDate: string;
  styles: any;
  colors: any;
  isDark?: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function EventDetailSheet({
  visible, selectedEvent, selectedDate, styles, colors, isDark = true, onClose, onEdit
}: EventDetailSheetProps) {
  const { attendance, attendanceLogs, optimisticUpdateAttendance, optimisticAddAttendanceLog } = useAcademicData();
  const { user } = useCoreData();

  const isClassOrLab = selectedEvent?.type === 'class' || selectedEvent?.type === 'lab' || selectedEvent?.sessionType === 'class' || selectedEvent?.sessionType === 'lab';

  // Find the subject doc matching this event
  const subject = useMemo(() => {
    if (!selectedEvent || !isClassOrLab) return null;
    if (selectedEvent.subjectId) {
      return attendance.find(s => s.id === selectedEvent.subjectId) || null;
    }
    // Fallback: match by title prefix
    const cleanTitle = (selectedEvent.title || '').replace(/\s*\((Class|Lab)\)\s*/i, '').trim().toLowerCase();
    return attendance.find(s => s.name.toLowerCase() === cleanTitle) || null;
  }, [selectedEvent, isClassOrLab, attendance]);

  // Attendance stats
  const stats = useMemo(() => {
    if (!subject) return null;
    const isLab = selectedEvent?.sessionType === 'lab' || selectedEvent?.type === 'lab';
    const attended = isLab ? (subject.labsAttended || 0) : (subject.classesAttended || 0);
    const total = isLab ? (subject.labsTotal || 0) : (subject.classesTotal || 0);
    const pct = total > 0 ? Math.round((attended / total) * 100) : 100;
    return { attended, total, pct, isLab };
  }, [subject, selectedEvent]);

  // Check if already logged for this date
  const existingLog = useMemo(() => {
    if (!subject) return null;
    return (attendanceLogs || []).find(
      l => l.subjectId === subject.id && l.date === selectedDate
    );
  }, [subject, attendanceLogs, selectedDate]);

  const handleLogAttendance = async (action: 'attended' | 'missed' | 'cancelled') => {
    if (!subject || !user) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const isLab = selectedEvent?.sessionType === 'lab' || selectedEvent?.type === 'lab';
    const isAttended = action === 'attended';
    const isMissed = action === 'missed';

    // 1. Optimistic update
    const deltaTotal = (isAttended || isMissed) ? 1 : 0;
    const deltaAttended = isAttended ? 1 : 0;

    const partialUpdate = isLab
      ? {
          labsTotal: (subject.labsTotal || 0) + deltaTotal,
          labsAttended: (subject.labsAttended || 0) + deltaAttended,
        }
      : {
          classesTotal: (subject.classesTotal || 0) + deltaTotal,
          classesAttended: (subject.classesAttended || 0) + deltaAttended,
        };

    optimisticUpdateAttendance(subject.id!, partialUpdate);

    const logPayload = {
      id: `local-${Date.now()}`,
      userId: user.uid,
      subjectId: subject.id!,
      subjectName: subject.name,
      date: selectedDate,
      action,
      type: isLab ? ('lab' as const) : ('class' as const),
      isExtra: false,
      timestamp: Date.now(),
      createdAt: Date.now(),
    };

    optimisticAddAttendanceLog(logPayload);
    onClose();

    // 2. Persist to Firestore in background
    try {
      await addDoc(collection(db, COLLECTION.ATTENDANCE_LOGS), {
        userId: user.uid,
        subjectId: subject.id!,
        subjectName: subject.name,
        date: selectedDate,
        action,
        type: isLab ? 'lab' : 'class',
        createdAt: Date.now(),
      });
      await updateDoc(doc(db, COLLECTION.ATTENDANCE, subject.id!), partialUpdate);
    } catch (e: any) {
      console.warn('[EventDetailSheet] Failed to log attendance:', e);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              {!isClassOrLab && (
                <TouchableOpacity onPress={onEdit}>
                  <Ionicons name="pencil" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          
          <Text style={styles.modalTitle}>{selectedEvent?.title}</Text>
          
          <View style={styles.modalRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
            <Text style={styles.modalText}>{selectedDate}</Text>
          </View>
          
          {selectedEvent?.startTime && (
            <View style={styles.modalRow}>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <Text style={styles.modalText}>
                {selectedEvent.startTime} {selectedEvent.endTime ? `- ${selectedEvent.endTime}` : ''}
              </Text>
            </View>
          )}
          
          {selectedEvent?.location && (
            <View style={styles.modalRow}>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
              <Text style={styles.modalText}>{selectedEvent.location}</Text>
            </View>
          )}

          {/* FIX 5.4: Timetable Class Quick Attendance Logging */}
          {isClassOrLab && subject && stats && (
            <View style={localStyles.attendanceBox}>
              <View style={localStyles.statsRow}>
                <View>
                  <Text style={[localStyles.statsLabel, { color: colors.textMuted }]}>
                    CURRENT ATTENDANCE
                  </Text>
                  <Text style={[localStyles.statsValue, { color: colors.textPrimary }]}>
                    {stats.attended}/{stats.total} {stats.isLab ? 'labs' : 'classes'}
                  </Text>
                </View>
                <View style={[
                  localStyles.pctBadge,
                  { backgroundColor: stats.pct >= 75 ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.12)') : 'rgba(239, 68, 68, 0.15)' }
                ]}>
                  <Text style={[
                    localStyles.pctText,
                    { color: stats.pct >= 75 ? (isDark ? '#10b981' : '#059669') : '#ef4444' }
                  ]}>
                    {stats.pct}%
                  </Text>
                </View>
              </View>

              {existingLog ? (
                <View style={localStyles.loggedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.accentPrimary} />
                  <Text style={[localStyles.loggedText, { color: colors.textPrimary }]}>
                    Already logged as <Text style={{ textTransform: 'capitalize', fontFamily: FONT_FAMILY.bold }}>{existingLog.action}</Text>
                  </Text>
                </View>
              ) : (
                <View style={localStyles.buttonRow}>
                  <TouchableOpacity
                    style={[localStyles.actionBtn, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(5, 150, 105, 0.15)', borderColor: '#10b981' }]}
                    onPress={() => handleLogAttendance('attended')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="checkmark" size={16} color={isDark ? '#10b981' : '#059669'} />
                    <Text style={[localStyles.actionBtnText, { color: isDark ? '#10b981' : '#059669' }]}>Present</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[localStyles.actionBtn, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(220, 38, 38, 0.15)', borderColor: '#ef4444' }]}
                    onPress={() => handleLogAttendance('missed')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="close" size={16} color="#ef4444" />
                    <Text style={[localStyles.actionBtnText, { color: '#ef4444' }]}>Absent</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[localStyles.actionBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', borderColor: colors.border }]}
                    onPress={() => handleLogAttendance('cancelled')}
                    activeOpacity={0.75}
                  >
                    <Text style={[localStyles.actionBtnText, { color: colors.textMuted }]}>Off</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  attendanceBox: {
    marginTop: SPACE.lg,
    paddingTop: SPACE.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: SPACE.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  statsValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    marginTop: 2,
  },
  pctBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  pctText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  loggedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(165, 153, 255, 0.1)',
  },
  loggedText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
  },
});
