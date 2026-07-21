/**
 * LearningTopicCard.tsx — ZenTrack Mobile
 * Extracted from LearningScreen.tsx for bundle splitting.
 * Single draggable topic card with expandable subtask list.
 */

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { FONT_FAMILY, SHADOW } from '../../theme/tokens';
import { LearningTopic, LearningSubTask } from '../../contexts/MobileDataContext';

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
  const isExpanded = expandedTopics.has(topic.id!);
  const subTasks = topic.subTasks || [];
  const completedCount = subTasks.filter(s => s.isCompleted).length;
  const totalCount = subTasks.length;
  const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  return (
    <ScaleDecorator>
      <View style={[s.card, isActive && { opacity: 0.7 }]}>
        <View style={[s.cardHeader, { paddingBottom: isExpanded ? 0 : 18 }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTopic(topic.id!)} onLongPress={drag} delayLongPress={200}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={s.cardTitle} numberOfLines={2}>{topic.title}</Text>
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#8e8e93" style={{ marginTop: 2, marginLeft: 10 }} />
            </View>
            <Text style={s.cardStats}>
              {completedCount}/{totalCount}, {progress.toFixed(0)}%{(() => {
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
              <TouchableOpacity style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => showTopicOptions(topic.id!)} style={{ padding: 8, paddingRight: 0 }}>
                <Ionicons name="ellipsis-horizontal" size={16} color="#636366" />
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
    </ScaleDecorator>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: 'transparent', marginBottom: 12, borderTopWidth: 1, borderTopColor: '#1c1c1e', paddingTop: 16 },
  cardHeader: { padding: 0 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#f2f2f7', flex: 1, paddingRight: 16 },
  cardStats: { color: '#636366', fontSize: 11, fontFamily: FONT_FAMILY.body },
  cardExpanded: { paddingTop: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1c1c1e' },
  subIndex: { fontFamily: FONT_FAMILY.body, fontSize: 10, marginRight: 8, width: 16, textAlign: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxDone: { backgroundColor: '#a599ff' },
  checkboxActive: { backgroundColor: 'rgba(165,153,255,0.1)', borderWidth: 1.5, borderColor: '#a599ff' },
  checkboxFuture: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#3a3a3c' },
  subTitle: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#f2f2f7', marginRight: 8 },
  subTitleActive: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7' },
  subTitleDone: { color: '#636366' },
  watchBtn: { backgroundColor: 'rgba(165,153,255,0.1)', borderColor: 'rgba(165,153,255,0.3)', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  watchBtnText: { color: '#a599ff', fontFamily: FONT_FAMILY.medium, fontSize: 10 },
  primaryBtn: { backgroundColor: '#a599ff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  primaryBtnText: { color: '#000', fontFamily: FONT_FAMILY.bold, fontSize: 13 },
  addSubBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 8 },
  addSubText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#a599ff' },
});
