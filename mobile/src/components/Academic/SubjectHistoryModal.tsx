import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatAttendanceHistoryDate } from '../../screens/attendance/attendanceConstants';
import { FONT_FAMILY, SPACE } from '../../theme/tokens';
import type { AttendanceSubject } from '../../contexts/MobileDataContext';

// ── Pure Memoized History Log Row ─────────────────────────────────────────────
interface HistoryRowProps {
  log: any;
  colors: any;
  isDark: boolean;
  styles: any;
  onUndo: (logId: string) => void;
}

export const AttendanceHistoryRow = React.memo(function AttendanceHistoryRow({
  log,
  colors,
  isDark,
  styles,
  onUndo,
}: HistoryRowProps) {
  const isAttended = log.action === 'attended';
  const isMissed = log.action === 'missed';
  const isLab = log.type === 'lab';
  const isExtra = !!log.isExtra;

  const dateInfo = formatAttendanceHistoryDate(log.date, log.timestamp);

  const statusColor = isAttended
    ? (isDark ? '#34D399' : '#059669')
    : isMissed
    ? (isDark ? '#F87171' : '#DC2626')
    : (isDark ? '#FBBF24' : '#D97706');

  const statusBg = isAttended
    ? (isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(5, 150, 105, 0.10)')
    : isMissed
    ? (isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(220, 38, 38, 0.10)')
    : (isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(217, 119, 6, 0.10)');

  const statusBorder = isAttended
    ? (isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(5, 150, 105, 0.20)')
    : isMissed
    ? (isDark ? 'rgba(248, 113, 113, 0.25)' : 'rgba(220, 38, 38, 0.20)')
    : (isDark ? 'rgba(251, 191, 36, 0.25)' : 'rgba(217, 119, 6, 0.20)');

  const iconName = isAttended
    ? 'checkmark-circle'
    : isMissed
    ? 'close-circle'
    : 'ban';

  const actionText = isAttended
    ? 'Attended'
    : isMissed
    ? 'Missed'
    : 'Cancelled';

  return (
    <View style={styles.historyCard}>
      <View style={{ flex: 1, marginRight: 12 }}>
        {/* Top: Status Badge + Type Badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
          <View style={[styles.historyStatusPill, { backgroundColor: statusBg, borderColor: statusBorder }]}>
            <Ionicons name={iconName} size={13} color={statusColor} style={{ marginRight: 4 }} />
            <Text style={[styles.historyStatusText, { color: statusColor }]}>{actionText}</Text>
          </View>

          {/* Class / Lab Badge */}
          <View style={[styles.historyTypePill, isLab ? styles.historyTypePillLab : styles.historyTypePillClass]}>
            <Text style={[styles.historyTypeText, isLab ? styles.historyTypeTextLab : styles.historyTypeTextClass]}>
              {isLab ? 'LAB' : 'CLASS'}
            </Text>
          </View>

          {/* Extra Badge if extra */}
          {isExtra && (
            <View style={styles.historyExtraPill}>
              <Text style={styles.historyExtraText}>EXTRA</Text>
            </View>
          )}
        </View>

        {/* Bottom: Date with Today/Yesterday badge and Time */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {dateInfo.dayLabel ? (
            <View style={[styles.historyDayBadge, dateInfo.isToday && styles.historyDayBadgeToday]}>
              <Text style={[styles.historyDayBadgeText, dateInfo.isToday && styles.historyDayBadgeTextToday]}>
                {dateInfo.dayLabel}
              </Text>
            </View>
          ) : null}

          <Text style={styles.historyDateText}>
            {dateInfo.fullDateStr}
          </Text>

          {dateInfo.timeStr ? (
            <Text style={styles.historyTimeText}>
              • {dateInfo.timeStr}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Undo Button */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (log.id) onUndo(log.id);
        }}
        style={styles.historyUndoBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="refresh" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
});

// ── Dedicated Memoized Subject History Modal ─────────────────────────────────
export interface SubjectHistoryModalProps {
  visible: boolean;
  subject: AttendanceSubject;
  logs: any[];
  subjects: AttendanceSubject[];
  colors: any;
  isDark: boolean;
  styles: any;
  onClose: () => void;
  onUndo: (logId: string) => void;
}

export const SubjectHistoryModal = React.memo(function SubjectHistoryModal({
  visible,
  subject,
  logs,
  subjects,
  colors,
  isDark,
  styles,
  onClose,
  onUndo,
}: SubjectHistoryModalProps) {
  const [historyFilterType, setHistoryFilterType] = useState<'all' | 'class' | 'lab'>('all');

  useEffect(() => {
    setHistoryFilterType('all');
  }, [subject?.id]);

  const sortedHistoryLogs = useMemo(() => {
    if (!subject) return [];
    const filtered = logs.filter(l =>
      (subject.id && l.subjectId === subject.id) ||
      (subject.name && (l.subjectName === subject.name || l.subjectId === subject.name))
    );

    const sorted = [...filtered].sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : 0;
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : 0;
      return timeB - timeA;
    });

    const seen = new Set<string>();
    const deduplicated: typeof sorted = [];

    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i];
      if (l.isExtra) {
        deduplicated.push(l);
      } else {
        const slotKey = `${(l.date || '').slice(0, 10)}_${l.type === 'lab' ? 'lab' : 'class'}_${l.idx ?? 0}`;
        if (!seen.has(slotKey)) {
          seen.add(slotKey);
          deduplicated.push(l);
        }
      }
    }

    return deduplicated;
  }, [subject, logs]);

  const classHistoryLogs = useMemo(
    () => sortedHistoryLogs.filter(l => l.type !== 'lab'),
    [sortedHistoryLogs]
  );
  const labHistoryLogs = useMemo(
    () => sortedHistoryLogs.filter(l => l.type === 'lab'),
    [sortedHistoryLogs]
  );

  const historySections = useMemo(() => {
    if (historyFilterType === 'class') {
      return [{ title: 'Classes', type: 'class' as const, count: classHistoryLogs.length, data: classHistoryLogs }];
    }
    if (historyFilterType === 'lab') {
      return [{ title: 'Labs', type: 'lab' as const, count: labHistoryLogs.length, data: labHistoryLogs }];
    }
    const list: { title: string; type: 'class' | 'lab'; count: number; data: typeof sortedHistoryLogs }[] = [];
    if (classHistoryLogs.length > 0) {
      list.push({ title: 'Classes', type: 'class', count: classHistoryLogs.length, data: classHistoryLogs });
    }
    if (labHistoryLogs.length > 0) {
      list.push({ title: 'Labs', type: 'lab', count: labHistoryLogs.length, data: labHistoryLogs });
    }
    return list;
  }, [historyFilterType, classHistoryLogs, labHistoryLogs, sortedHistoryLogs]);

  const sub = useMemo(() => {
    return subjects.find(s => (subject.id && s.id === subject.id) || s.name === subject.name) || subject;
  }, [subjects, subject]);

  const att = (sub.classesAttended || 0) + (sub.labsAttended || 0);
  const tot = (sub.classesTotal || 0) + (sub.labsTotal || 0);
  const pct = tot > 0 ? (att / tot) * 100 : 100;
  const target = sub.targetPercentage || 75;
  const isSafe = pct >= target;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {subject.name} History
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
              {sortedHistoryLogs.length} {sortedHistoryLogs.length === 1 ? 'log' : 'logs'} recorded • Newest first
            </Text>
          </View>
          <TouchableOpacity style={styles.modalHeaderBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Subject Attendance Stats Overview Strip */}
        <View style={styles.historyStatsBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
                Overall: {att}/{tot} attended
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                (Target: {target}%)
              </Text>
            </View>
            <Text style={{ fontSize: 15, fontFamily: FONT_FAMILY.bold, color: isSafe ? (isDark ? '#34D399' : '#059669') : (isDark ? '#F87171' : '#DC2626') }}>
              {tot > 0 ? `${Math.round(pct)}%` : '--%'}
            </Text>
          </View>

          {/* Class vs Lab split if applicable */}
          {((sub.labsTotal || 0) > 0 || (sub.classesTotal || 0) > 0) && (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
              {(sub.classesTotal || 0) > 0 && (
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Class: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>{sub.classesAttended || 0}/{sub.classesTotal || 0}</Text>
                </Text>
              )}
              {(sub.labsTotal || 0) > 0 && (
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Lab: <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>{sub.labsAttended || 0}/{sub.labsTotal || 0}</Text>
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Filter Tabs if both classes and labs exist */}
        {classHistoryLogs.length > 0 && labHistoryLogs.length > 0 && (
          <View style={styles.historyFilterTabs}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setHistoryFilterType('all');
              }}
              style={[
                styles.historyFilterPill,
                historyFilterType === 'all' && styles.historyFilterPillActive,
              ]}
            >
              <Text style={[
                styles.historyFilterPillText,
                historyFilterType === 'all' && styles.historyFilterPillTextActive,
              ]}>
                All ({sortedHistoryLogs.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setHistoryFilterType('class');
              }}
              style={[
                styles.historyFilterPill,
                historyFilterType === 'class' && styles.historyFilterPillActiveClass,
              ]}
            >
              <Ionicons 
                name="book-outline" 
                size={12} 
                color={historyFilterType === 'class' ? (isDark ? '#a5b4fc' : '#4f46e5') : colors.textMuted} 
                style={{ marginRight: 4 }} 
              />
              <Text style={[
                styles.historyFilterPillText,
                historyFilterType === 'class' && styles.historyFilterPillTextActiveClass,
              ]}>
                Classes ({classHistoryLogs.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setHistoryFilterType('lab');
              }}
              style={[
                styles.historyFilterPill,
                historyFilterType === 'lab' && styles.historyFilterPillActiveLab,
              ]}
            >
              <Ionicons 
                name="flask-outline" 
                size={12} 
                color={historyFilterType === 'lab' ? (isDark ? '#fcd34d' : '#d97706') : colors.textMuted} 
                style={{ marginRight: 4 }} 
              />
              <Text style={[
                styles.historyFilterPillText,
                historyFilterType === 'lab' && styles.historyFilterPillTextActiveLab,
              ]}>
                Labs ({labHistoryLogs.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* List with Dedicated Classes & Labs Sections */}
        <SectionList
          sections={historySections}
          keyExtractor={l => l.id || `${l.date}_${l.timestamp}_${l.action}_${l.type}`}
          contentContainerStyle={{ padding: SPACE.md, paddingBottom: 60 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            if (classHistoryLogs.length === 0 || labHistoryLogs.length === 0) return null;
            const isLab = section.type === 'lab';
            return (
              <View style={[styles.historySectionHeader, isLab && { marginTop: 14 }]}>
                <Ionicons
                  name={isLab ? 'flask' : 'book'}
                  size={13}
                  color={isLab ? (isDark ? '#fcd34d' : '#d97706') : (isDark ? '#a5b4fc' : '#4f46e5')}
                />
                <Text style={[
                  styles.historySectionTitle,
                  { color: isLab ? (isDark ? '#fcd34d' : '#d97706') : (isDark ? '#a5b4fc' : '#4f46e5') }
                ]}>
                  {section.title} ({section.count})
                </Text>
              </View>
            );
          }}
          renderItem={({ item: l }) => (
            <AttendanceHistoryRow
              log={l}
              colors={colors}
              isDark={isDark}
              styles={styles}
              onUndo={onUndo}
            />
          )}
          ListEmptyComponent={
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={40} color={colors.textMuted} style={{ marginBottom: 12, opacity: 0.6 }} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontFamily: FONT_FAMILY.bold, textAlign: 'center' }}>
                No Logs Found
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                {historyFilterType === 'class'
                  ? 'No class logs recorded for this subject.'
                  : historyFilterType === 'lab'
                  ? 'No lab logs recorded for this subject.'
                  : 'Classes and labs you mark will appear here sorted from newest to oldest.'}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
});

export default SubjectHistoryModal;
