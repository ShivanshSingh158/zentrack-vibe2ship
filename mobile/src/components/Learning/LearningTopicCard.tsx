import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, SHADOW } from '../../theme/tokens';
import { LearningTopic, LearningSubTask } from '../../contexts/MobileDataContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import * as Haptics from 'expo-haptics';

interface LearningTopicCardProps extends RenderItemParams<LearningTopic> {
  expandedTopics: Set<string>;
  visibleLimits: Record<string, number>;
  toggleTopic: (id: string) => void;
  toggleSubtask: (topicId: string, subtaskId: string) => void;
  togglePin: (topicId: string, subtaskId: string) => void;
  showTopicOptions: (id: string) => void;
  showSubtaskOptions: (topicId: string, subtaskId: string) => void;
  loadMoreSubTasks: (topicId: string) => void;
  extractVideoId: (url?: string) => string | null;
  openVideo: (topicId: string, sub: LearningSubTask) => void;
  setActiveTopicId: (id: string) => void;
  setSubtaskModalVisible: (v: boolean) => void;
}

export default function LearningTopicCard({
  item: topic, drag, isActive,
  expandedTopics, visibleLimits,
  toggleTopic, toggleSubtask, togglePin,
  showTopicOptions, showSubtaskOptions,
  loadMoreSubTasks, extractVideoId, openVideo,
  setActiveTopicId, setSubtaskModalVisible,
}: LearningTopicCardProps) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const isExpanded = expandedTopics.has(topic.id!);
  const subTasks = topic.subTasks || [];
  const completedCount = subTasks.filter(s => s.isCompleted).length;
  const totalCount = subTasks.length;
  const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  const [scheduleSubtask, setScheduleSubtask] = useState<LearningSubTask | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const handleOpenScheduleModal = (sub: LearningSubTask) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScheduleSubtask(sub);
  };

  const handleConfirmSchedule = async (slot: 'today' | 'tomorrow' | 'task') => {
    const user = auth.currentUser;
    if (!user || !scheduleSubtask) return;
    setScheduling(true);

    const todayStr = new Date().toISOString().slice(0, 10);
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = tmrw.toISOString().slice(0, 10);

    try {
      if (slot === 'today' || slot === 'tomorrow') {
        const targetDate = slot === 'today' ? todayStr : tmrwStr;
        const dayLabel = slot === 'today' ? 'Today' : 'Tomorrow';
        await addDoc(collection(db, COLLECTION.CALENDAR_EVENTS), {
          userId: user.uid,
          title: `Study: ${scheduleSubtask.title}`,
          date: targetDate,
          startTime: '19:00',
          endTime: '20:00',
          type: 'assignment',
          notes: `Topic: ${topic.title}\nURL: ${scheduleSubtask.url || ''}`,
          createdAt: serverTimestamp(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('🎉 Scheduled!', `Added "${scheduleSubtask.title}" to ${dayLabel}'s Calendar (7:00 PM - 8:00 PM).`);
      } else {
        await addDoc(collection(db, COLLECTION.TASKS), {
          userId: user.uid,
          title: `Study: ${scheduleSubtask.title}`,
          date: todayStr,
          timeSlot: '19:00 - 20:00',
          startTime: '19:00',
          endTime: '20:00',
          priority: 'medium',
          tags: ['learning'],
          status: 'pending',
          notes: `Topic: ${topic.title}\nURL: ${scheduleSubtask.url || ''}`,
          createdAt: serverTimestamp(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('🎉 Task Created!', `Added "${scheduleSubtask.title}" to your Task timeline under #learning.`);
      }
      setScheduleSubtask(null);
    } catch (e: any) {
      Alert.alert('Scheduling Error', e?.message || 'Failed to schedule study slot.');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <ScaleDecorator>
      <View style={[s.card, isActive && { opacity: 0.7 }]}>
        <View style={[s.cardHeader, { paddingBottom: isExpanded ? 0 : 0 }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTopic(topic.id!)} onLongPress={drag} delayLongPress={200}>
            {/* Title and Chevron Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <Text style={s.cardTitle} numberOfLines={2}>{topic.title}</Text>
              <View style={s.iconButton}>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#e5e5ea" />
              </View>
            </View>
            
            {/* Stats Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.cardStats, { color: '#a599ff', fontFamily: FONT_FAMILY.bold }]}>
                {progress.toFixed(0)}% completed
              </Text>
              <Text style={s.cardStats}>
                {'  ·  '}{completedCount}/{totalCount} tasks
                {(() => {
                  let totalH = 0;
                  subTasks.forEach(s => { if (!s.isCompleted && s.estimatedHours) totalH += s.estimatedHours; });
                  if (totalH > 0) {
                    const h = Math.floor(totalH);
                    const m = Math.round((totalH - h) * 60);
                    if (h > 0 && m > 0) return `, ${h}h ${m}m left`;
                    if (h > 0) return `, ${h}h left`;
                    return `, ${m}m left`;
                  }
                  return '';
                })()}
              </Text>
            </View>

            {/* Divider */}
            <View style={s.divider} />

            {/* Actions Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity 
                style={s.primaryBtn}
                onPress={() => {
                  const firstUncompleted = subTasks.find(s => !s.isCompleted);
                  if (firstUncompleted) {
                    if (extractVideoId(firstUncompleted.url)) {
                      openVideo(topic.id!, firstUncompleted);
                    } else {
                      if (!isExpanded) toggleTopic(topic.id!);
                    }
                  } else {
                    if (!isExpanded) toggleTopic(topic.id!);
                  }
                }}
              >
                <Ionicons name="play" size={14} color="#000" />
                <Text style={s.primaryBtnText}>{progress === 0 ? 'Start Learning' : 'Resume'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => showTopicOptions(topic.id!)} style={s.iconButton}>
                <Ionicons name="ellipsis-horizontal" size={16} color="#e5e5ea" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={s.cardExpanded}>
            {(() => {
              const limit = visibleLimits[topic.id!] || 15;
              const displayedTasks = subTasks.slice(0, limit);
              return displayedTasks.map((sub, idx) => {
                const isCurrent = !sub.isCompleted && subTasks.findIndex(s => !s.isCompleted) === idx;
                return (
                  <View key={sub.id} style={s.subRow}>
                    <Text style={[s.subIndex, { color: isCurrent ? '#a599ff' : '#636366' }]}>{idx + 1}</Text>
                    <TouchableOpacity onPress={() => toggleSubtask(topic.id!, sub.id)}>
                      <View style={[s.checkbox, sub.isCompleted ? s.checkboxDone : (isCurrent ? s.checkboxActive : s.checkboxFuture)]}>
                        {sub.isCompleted && <Ionicons name="checkmark" size={12} color="#000" />}
                      </View>
                    </TouchableOpacity>
                    <Text style={[s.subTitle, sub.isCompleted ? s.subTitleDone : (isCurrent ? s.subTitleActive : undefined)]} numberOfLines={1}>
                      {sub.title}
                    </Text>
                    {!sub.isCompleted && extractVideoId(sub.url) && (
                      <TouchableOpacity style={s.watchBtn} onPress={() => openVideo(topic.id!, sub)}>
                        <Ionicons name="play" size={10} color="#a599ff" />
                        <Text style={s.watchBtnText}>Watch</Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <TouchableOpacity onPress={() => handleOpenScheduleModal(sub)} style={{ padding: 4 }}>
                        <Ionicons name="calendar-outline" size={14} color="#a599ff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => togglePin(topic.id!, sub.id)} style={{ padding: 4 }}>
                        <Ionicons name={sub.pinned ? "star" : "star-outline"} size={14} color={sub.pinned ? '#a599ff' : '#636366'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => showSubtaskOptions(topic.id!, sub.id)} style={{ padding: 4 }}>
                        <Ionicons name="ellipsis-horizontal" size={14} color="#636366" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              });
            })()}

            {(subTasks.length > (visibleLimits[topic.id!] || 15)) && (
              <TouchableOpacity style={[s.addSubBtn, { justifyContent: 'center', marginBottom: 8 }]} onPress={() => loadMoreSubTasks(topic.id!)}>
                <Text style={[s.addSubText, { color: '#8e8e93' }]}>Show more ({subTasks.length - (visibleLimits[topic.id!] || 15)} hidden)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.addSubBtn} onPress={() => { setActiveTopicId(topic.id!); setSubtaskModalVisible(true); }}>
              <Ionicons name="add" size={16} color="#a599ff" />
              <Text style={s.addSubText}>Add Checkpoint</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Custom Schedule Study Slot Bottom Sheet Modal ── */}
      <Modal
        visible={!!scheduleSubtask}
        animationType="fade"
        transparent
        onRequestClose={() => setScheduleSubtask(null)}
      >
        <TouchableOpacity
          style={s.scheduleModalOverlay}
          activeOpacity={1}
          onPress={() => setScheduleSubtask(null)}
        >
          <View
            style={s.scheduleModalCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag Handle */}
            <View style={s.dragHandle} />

            {/* Header */}
            <View style={s.scheduleHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={s.scheduleIconBadge}>
                  <Ionicons name="calendar" size={16} color="#a599ff" />
                </View>
                <Text style={s.scheduleModalTitle}>Schedule Study Slot</Text>
              </View>
              <TouchableOpacity
                style={s.scheduleCloseBtn}
                onPress={() => setScheduleSubtask(null)}
              >
                <Ionicons name="close" size={18} color="#8e8e93" />
              </TouchableOpacity>
            </View>

            {/* Checkpoint Detail Box */}
            <View style={s.scheduleCheckpointBox}>
              <Text style={s.scheduleCheckpointTopic} numberOfLines={1}>
                {topic.title}
              </Text>
              <Text style={s.scheduleCheckpointTitle} numberOfLines={2}>
                "{scheduleSubtask?.title}"
              </Text>
            </View>

            {/* Action Cards */}
            <View style={{ gap: 10, marginVertical: 12 }}>
              {/* Option 1: Today at 7 PM */}
              <TouchableOpacity
                style={s.scheduleOptionCard}
                onPress={() => handleConfirmSchedule('today')}
                disabled={scheduling}
                activeOpacity={0.7}
              >
                <View style={s.scheduleOptionIcon}>
                  <Ionicons name="calendar-outline" size={20} color="#a599ff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.scheduleOptionTitle}>Today at 7:00 PM</Text>
                  <Text style={s.scheduleOptionSub}>Calendar · 1 hour study session</Text>
                </View>
                {scheduling ? (
                  <ActivityIndicator size="small" color="#a599ff" />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#636366" />
                )}
              </TouchableOpacity>

              {/* Option 2: Tomorrow at 7 PM */}
              <TouchableOpacity
                style={s.scheduleOptionCard}
                onPress={() => handleConfirmSchedule('tomorrow')}
                disabled={scheduling}
                activeOpacity={0.7}
              >
                <View style={[s.scheduleOptionIcon, { backgroundColor: 'rgba(165,153,255,0.12)' }]}>
                  <Ionicons name="time-outline" size={20} color="#a599ff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.scheduleOptionTitle}>Tomorrow at 7:00 PM</Text>
                  <Text style={s.scheduleOptionSub}>Calendar · 1 hour study session</Text>
                </View>
                {scheduling ? (
                  <ActivityIndicator size="small" color="#a599ff" />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#636366" />
                )}
              </TouchableOpacity>

              {/* Option 3: Today's Tasks */}
              <TouchableOpacity
                style={s.scheduleOptionCard}
                onPress={() => handleConfirmSchedule('task')}
                disabled={scheduling}
                activeOpacity={0.7}
              >
                <View style={[s.scheduleOptionIcon, { backgroundColor: 'rgba(0,193,110,0.12)' }]}>
                  <Ionicons name="checkbox-outline" size={20} color="#00c16e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.scheduleOptionTitle}>Add to Today's Tasks</Text>
                  <Text style={s.scheduleOptionSub}>Tasks Timeline · Tagged #learning</Text>
                </View>
                {scheduling ? (
                  <ActivityIndicator size="small" color="#00c16e" />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#636366" />
                )}
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={s.scheduleCancelBtn}
              onPress={() => setScheduleSubtask(null)}
            >
              <Text style={s.scheduleCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScaleDecorator>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  card: { backgroundColor: colors.surface, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  cardHeader: { padding: 0 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, flex: 1, paddingRight: 16, lineHeight: 24 },
  cardStats: { color: colors.textTertiary, fontSize: 13, fontFamily: FONT_FAMILY.medium },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16, borderRadius: 1 },
  iconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2 || colors.surface, alignItems: 'center', justifyContent: 'center' },
  cardExpanded: { paddingTop: 16 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  subIndex: { fontFamily: FONT_FAMILY.body, fontSize: 10, marginRight: 8, width: 16, textAlign: 'center', color: colors.textTertiary },
  checkbox: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxDone: { backgroundColor: colors.accentPrimary },
  checkboxActive: { backgroundColor: colors.accentDim, borderWidth: 1.5, borderColor: colors.accentPrimary },
  checkboxFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  subTitle: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textPrimary, marginRight: 8 },
  subTitleActive: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary },
  subTitleDone: { color: colors.textMuted },
  watchBtn: { backgroundColor: colors.accentDim, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  watchBtnText: { color: colors.accentPrimary, fontFamily: FONT_FAMILY.medium, fontSize: 10 },
  primaryBtn: { flex: 1, marginRight: 8, justifyContent: 'center', backgroundColor: colors.accentPrimary, paddingVertical: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: '#ffffff', fontFamily: FONT_FAMILY.bold, fontSize: 14 },
  addSubBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 8 },
  addSubText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.accentPrimary },
  // Schedule Modal
  scheduleModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scheduleModalCard: { backgroundColor: colors.surfaceRaised || colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, borderWidth: 1, borderColor: colors.border },
  dragHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  scheduleIconBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  scheduleModalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
  scheduleCloseBtn: { padding: 6, backgroundColor: colors.surface2 || colors.surface, borderRadius: 14 },
  scheduleCheckpointBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  scheduleCheckpointTopic: { color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  scheduleCheckpointTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: FONT_FAMILY.bold, marginTop: 4, lineHeight: 20 },
  scheduleOptionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  scheduleOptionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  scheduleOptionTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: FONT_FAMILY.bold },
  scheduleOptionSub: { color: colors.textMuted, fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 2 },
  scheduleCancelBtn: { marginTop: 6, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 || colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  scheduleCancelText: { color: colors.textMuted, fontFamily: FONT_FAMILY.bold, fontSize: 14 },
});
