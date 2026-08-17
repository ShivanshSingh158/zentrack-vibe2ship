import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import type { CustomEvent } from '../../contexts/MobileDataContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { usePlannerData } from '../../contexts/domains/PlannerContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { COLLECTION } from '../../config/constants';
import { useTheme } from "../../contexts/ThemeContext";

import { parseNLEvent, ParsedEvent } from '../../utils/dateUtils';

const EVENT_TYPES = [
  { id: 'exam', label: 'Exam', icon: '📝', color: '#ef4444' },
  { id: 'assignment_due', label: 'Assignment', icon: '📋', color: '#8b5cf6' },
  { id: 'holiday', label: 'Holiday', icon: '🌴', color: '#10b981' },
  { id: 'todo', label: 'Task', icon: '✅', color: '#7c3aed' },
  { id: 'job', label: 'Interview', icon: '💼', color: '#fbbf24' },
];

const ACADEMIC_PRESETS = [
  { label: 'Internal Exam', type: 'exam', icon: '📝' },
  { label: 'Lab Viva', type: 'exam', icon: '🔬' },
  { label: 'Project Submission', type: 'assignment_due', icon: '📤' },
  { label: 'Placement Drive', type: 'job', icon: '💼' },
];

function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export function AddEventModal({ visible, onClose, selectedDate, initialStartTime, existingEvent }: { 
  visible: boolean; 
  onClose: () => void; 
  selectedDate: string;
  initialStartTime?: string;
  existingEvent?: CustomEvent | null;
}) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const { user } = useCoreData();
  const { customEvents } = usePlannerData();
  const { attendance } = useAcademicData();
  const { gymLogs } = useWellnessData();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('exam');
  const [eventDate, setEventDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);

  const targetDate = eventDate || existingEvent?.date || selectedDate;

  // Live NLP parse
  const parsedNLEvent: ParsedEvent | null = useMemo(() => {
    if (existingEvent || !title.trim() || title.trim().length < 3) return null;
    return parseNLEvent(title.trim());
  }, [title, existingEvent]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!existingEvent && newTitle.trim().length >= 3) {
      const p = parseNLEvent(newTitle.trim());
      if (p.date) setEventDate(p.date);
      if (p.startTime) setStartTime(p.startTime);
      if (p.endTime) setEndTime(p.endTime);
      if (p.type) setType(p.type);
    }
  };

  React.useEffect(() => {
    if (visible) {
      if (existingEvent) {
        setTitle(existingEvent.title);
        setType(existingEvent.type);
        setEventDate(existingEvent.date);
        setStartTime(existingEvent.startTime || '');
        setEndTime(existingEvent.endTime || '');
      } else {
        setTitle('');
        setType('exam');
        setEventDate(selectedDate);
        setStartTime(initialStartTime || '');
        setEndTime('');
      }
    }
  }, [visible, existingEvent, initialStartTime, selectedDate]);

  // Real-time Schedule Conflict Detection
  const conflictMessage = useMemo(() => {
    if (!startTime || !targetDate) return null;
    const startMin = parseTimeToMinutes(startTime);
    if (startMin === null) return null;
    let endMin = parseTimeToMinutes(endTime);
    if (endMin === null || endMin <= startMin) endMin = startMin + 60;

    const eventDateObj = new Date(targetDate + 'T00:00:00');
    const dayIdx = eventDateObj.getDay();
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = DAY_NAMES[dayIdx];

    // 1. Check Classes & Labs
    if (attendance && attendance.length > 0) {
      for (const subj of attendance) {
        const sch = subj.schedule?.[dayIdx.toString()] || subj.schedule?.[dayIdx] || subj.schedule?.[dayName] || subj.schedule?.[dayName.toLowerCase()];
        if (!sch) continue;

        if (sch.classes && Array.isArray(sch.classes)) {
          for (const cls of sch.classes) {
            const clsStart = parseTimeToMinutes(cls.time || cls.startTime);
            if (clsStart !== null) {
              const clsEnd = clsStart + (cls.duration || 60);
              if (startMin < clsEnd && endMin > clsStart) {
                const formattedTime = cls.time || `${Math.floor(clsStart/60)}:${(clsStart%60).toString().padStart(2,'0')}`;
                return `Clashes with ${subj.name} (${formattedTime})`;
              }
            }
          }
        }

        if (sch.labs && Array.isArray(sch.labs)) {
          for (const lab of sch.labs) {
            const labStart = parseTimeToMinutes(lab.time || lab.startTime);
            if (labStart !== null) {
              const labEnd = labStart + (lab.duration || 120);
              if (startMin < labEnd && endMin > labStart) {
                const formattedTime = lab.time || `${Math.floor(labStart/60)}:${(labStart%60).toString().padStart(2,'0')}`;
                return `Clashes with ${subj.name} Lab (${formattedTime})`;
              }
            }
          }
        }
      }
    }

    // 2. Check Gym Sessions
    if (gymLogs && gymLogs.length > 0) {
      const todayGym = gymLogs.find((g: any) => g.date === targetDate);
      if (todayGym && todayGym.startTime) {
        const gymStart = parseTimeToMinutes(todayGym.startTime);
        if (gymStart !== null) {
          const rawEnd = parseTimeToMinutes(todayGym.endTime);
          let gymEnd: number = rawEnd !== null ? rawEnd : (gymStart + (todayGym.workoutDurationMinutes || 60));
          
          if (rawEnd !== null && rawEnd <= gymStart) {
            if ((todayGym as any).completed || (todayGym as any).status === 'completed') {
              gymEnd = gymStart;
            } else {
              gymEnd = gymStart + ((todayGym as any).workoutDurationMinutes || 60);
            }
          }

          // True overlap check
          if (gymEnd > gymStart ? (startMin < gymEnd && endMin > gymStart) : (startMin === gymStart)) {
            const endH = Math.floor(gymEnd / 60);
            const endM = (gymEnd % 60).toString().padStart(2, '0');
            const endFormatted = `${endH.toString().padStart(2, '0')}:${endM}`;
            return `Clashes with Gym Session (${todayGym.startTime}${gymEnd > gymStart ? ' - ' + endFormatted : ''})`;
          }
        }
      }
    }

    // 3. Check Other Custom Events
    if (customEvents && customEvents.length > 0) {
      for (const ev of customEvents) {
        if (ev.id === existingEvent?.id || ev.date !== targetDate || !ev.startTime) continue;
        const evStart = parseTimeToMinutes(ev.startTime);
        let evEnd = parseTimeToMinutes(ev.endTime);
        if (evStart !== null) {
          if (evEnd === null || evEnd <= evStart) evEnd = evStart + 60;
          if (startMin < evEnd && endMin > evStart) {
            return `Clashes with "${ev.title}" (${ev.startTime}${ev.endTime ? ' - ' + ev.endTime : ''})`;
          }
        }
      }
    }

    return null;
  }, [startTime, endTime, targetDate, attendance, gymLogs, customEvents, existingEvent]);

  const handleApplyPreset = (preset: typeof ACADEMIC_PRESETS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTitle(preset.label);
    setType(preset.type);
  };

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const cleanTitle = parsedNLEvent?.title || title.trim();
      const payload: any = {
        title: cleanTitle,
        type,
        date: targetDate,
        userId: user.uid,
        updatedAt: Date.now(),
      };
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;

      if (existingEvent) {
        await updateDoc(doc(db, COLLECTION.CALENDAR_EVENTS, existingEvent.id), payload);
      } else {
        payload.createdAt = Date.now();
        await addDoc(collection(db, COLLECTION.CALENDAR_EVENTS), payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      console.error(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{existingEvent ? 'Edit Event' : 'Add New Event'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Academic Quick-Event Presets */}
          {!existingEvent && (
            <View style={styles.presetsContainer}>
              <Text style={styles.presetHeading}>QUICK PRESETS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
                {ACADEMIC_PRESETS.map((p) => {
                  const isSelected = title === p.label;
                  return (
                    <TouchableOpacity
                      key={p.label}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => handleApplyPreset(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.presetIcon}>{p.icon}</Text>
                      <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Event Title with S.A.R.A NLP */}
          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.label}>Event Title</Text>
              <View style={styles.nlpIndicator}>
                <Text style={styles.sparkleEmoji}>✨</Text>
                <Text style={styles.nlpIndicatorText}>S.A.R.A NLP Active</Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Physics Lab Exam Friday 10am-12pm"
              placeholderTextColor={colors.textMuted || '#8e8e93'}
              value={title}
              onChangeText={handleTitleChange}
              autoFocus={!existingEvent}
            />

            {/* Live NLP Detected Attributes Preview */}
            {parsedNLEvent && (parsedNLEvent.date || parsedNLEvent.startTime || parsedNLEvent.type) && (
              <View style={styles.liveNlpPreview}>
                {parsedNLEvent.date && (
                  <View style={styles.nlpPill}>
                    <Ionicons name="calendar-outline" size={11} color="#a599ff" />
                    <Text style={[styles.nlpPillText, { color: '#a599ff' }]}>
                      {new Date(parsedNLEvent.date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
                {parsedNLEvent.startTime && (
                  <View style={styles.nlpPill}>
                    <Ionicons name="time-outline" size={11} color="#38bdf8" />
                    <Text style={[styles.nlpPillText, { color: '#38bdf8' }]}>
                      {parsedNLEvent.startTime}{parsedNLEvent.endTime ? ` - ${parsedNLEvent.endTime}` : ''}
                    </Text>
                  </View>
                )}
                {parsedNLEvent.type && (
                  <View style={[styles.nlpPill, { borderColor: `${parsedNLEvent.typeColor}40`, backgroundColor: `${parsedNLEvent.typeColor}15` }]}>
                    <Text style={{ fontSize: 10 }}>{parsedNLEvent.typeIcon}</Text>
                    <Text style={[styles.nlpPillText, { color: parsedNLEvent.typeColor }]}>
                      {parsedNLEvent.typeLabel}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Event Type */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Event Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity 
                  key={t.id} 
                  style={[styles.typeChip, type === t.id && { backgroundColor: t.color, borderColor: t.color }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setType(t.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, type === t.id && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.readOnlyField}>
              <Ionicons name="calendar-outline" size={16} color={colors.accentPrimary || '#a599ff'} />
              <Text style={styles.readOnlyText}>
                {new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>

          {/* Time Pickers */}
          <View style={{ flexDirection: 'row', gap: SPACE.md, marginBottom: conflictMessage ? SPACE.sm : SPACE.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Start Time</Text>
              <TextInput
                style={styles.input}
                placeholder="09:00"
                placeholderTextColor={colors.textMuted || '#8e8e93'}
                value={startTime}
                onChangeText={setStartTime}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Time</Text>
              <TextInput
                style={styles.input}
                placeholder="10:00"
                placeholderTextColor={colors.textMuted || '#8e8e93'}
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          </View>

          {/* Visual Conflict Warning Banner */}
          {conflictMessage && (
            <View style={styles.conflictBanner}>
              <Ionicons name="warning" size={16} color="#fbbf24" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.conflictTitle}>Schedule Conflict Detected</Text>
                <Text style={styles.conflictMessage}>⚠️ {conflictMessage}</Text>
              </View>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, (!title.trim() || loading) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!title.trim() || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>
              {loading ? 'Saving...' : (existingEvent ? 'Save Changes' : 'Add Event')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACE.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  presetsContainer: {
    marginBottom: SPACE.md,
  },
  presetHeading: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textTertiary || '#8e8e93',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  presetsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  },
  presetChipActive: {
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.2)' : 'rgba(165, 153, 255, 0.15)',
    borderColor: colors.accentPrimary || '#a599ff',
  },
  presetIcon: {
    fontSize: 13,
  },
  presetLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textSecondary || colors.textPrimary,
  },
  presetLabelActive: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.accentPrimary || '#a599ff',
  },
  inputGroup: {
    marginBottom: SPACE.md,
  },
  label: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.textMuted || '#8e8e93',
    marginBottom: 6,
  },
  nlpIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(165, 153, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165, 153, 255, 0.3)' : 'rgba(165, 153, 255, 0.25)',
  },
  sparkleEmoji: {
    fontSize: 10,
  },
  nlpIndicatorText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.accentPrimary || '#a599ff',
    letterSpacing: 0.2,
  },
  liveNlpPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  nlpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
  },
  nlpPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.base,
  },
  typeScroll: {
    flexDirection: 'row',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    marginRight: SPACE.sm,
    backgroundColor: colors.surface,
  },
  typeIcon: {
    fontSize: 13,
  },
  typeLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  readOnlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    paddingHorizontal: SPACE.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: RADIUS.md,
  },
  readOnlyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: RADIUS.md,
    padding: SPACE.sm + 2,
    marginBottom: SPACE.md,
  },
  conflictTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: isDark ? '#fbbf24' : '#B45309',
    letterSpacing: 0.3,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  conflictMessage: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: isDark ? '#fef3c7' : '#78350F',
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary || '#a599ff',
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACE.xs,
    shadowColor: colors.accentPrimary || '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
  },
  saveBtnText: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
  },
});

