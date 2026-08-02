/**
 * WorkoutInsightCard.tsx — ZenTrack Mobile
 *
 * A dismissable floating coach card that slides up once per workout day
 * when the rest timer first fires. Shows fatigue, load trends,
 * warm-up suggestions, cool-down, and the day's top coaching tip.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY } from '../../theme/tokens';
import { WorkoutInsight } from '../../services/gymInsightEngine';
import { feedback } from '../../utils/haptics';

interface Props {
  visible: boolean;
  insight: WorkoutInsight | null;
  loading: boolean;
  onDismiss: () => void;
}

const FATIGUE_COLORS: Record<string, string> = {
  Fresh: '#34C759',
  Recovered: '#30D158',
  'Moderate Fatigue': '#FF9F0A',
  Fatigued: '#FF6B6B',
  Overtrained: '#FF3B30',
};

const TREND_META: Record<string, { icon: string; color: string; label: string }> = {
  increasing: { icon: 'trending-up', color: '#34C759', label: 'Trending ↑' },
  plateau: { icon: 'remove', color: '#FF9F0A', label: 'Plateau →' },
  declining: { icon: 'trending-down', color: '#FF6B6B', label: 'Declining ↓' },
};

export function WorkoutInsightCard({ visible, insight, loading, onDismiss }: Props) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const [tab, setTab] = useState<'overview' | 'warmup' | 'cooldown'>('overview');

  useEffect(() => {
    if (visible) {
      feedback.commit();
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const fatigueColor = insight ? (FATIGUE_COLORS[insight.fatigueLabel] || '#a599ff') : '#a599ff';
  const fatigueBarWidth = insight ? Math.min(100, (insight.fatigueScore / 10) * 100) : 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={c.overlay}>
        <TouchableOpacity style={c.backdrop} activeOpacity={1} onPress={onDismiss} />
        <Animated.View style={[c.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* Header */}
          <View style={c.header}>
            <View style={c.headerLeft}>
              <View style={c.badge}>
                <Ionicons name="flash" size={16} color="#a599ff" />
              </View>
              <View>
                <Text style={c.headerTitle}>{insight?.headline || 'Session Insight'}</Text>
                <Text style={c.headerSub}>Powered by GYM-GPT · Today only</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => { feedback.tap(); onDismiss(); }} style={c.closeBtn}>
              <Ionicons name="close" size={20} color="#636366" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={c.loadingRow}>
              <Ionicons name="hourglass-outline" size={20} color="#a599ff" />
              <Text style={c.loadingText}>Coach is analysing your last sessions...</Text>
            </View>
          ) : !insight ? (
            <Text style={[c.loadingText, { padding: 20 }]}>Could not generate insight. Try again later.</Text>
          ) : (
            <>
              {/* Fatigue Score Bar */}
              <View style={c.fatigueSection}>
                <View style={c.fatigueRow}>
                  <Text style={c.fatigueLabel}>FATIGUE LEVEL</Text>
                  <Text style={[c.fatigueBadge, { color: fatigueColor }]}>
                    {insight.fatigueLabel} · {insight.fatigueScore}/10
                  </Text>
                </View>
                <View style={c.fatigueTrack}>
                  <View style={[c.fatigueBar, { width: `${fatigueBarWidth}%` as any, backgroundColor: fatigueColor }]} />
                </View>
              </View>

              {/* Coaching Tip */}
              <View style={c.tipCard}>
                <Ionicons name="bulb-outline" size={18} color="#FF9F0A" />
                <Text style={c.tipText}>{insight.coachingTip}</Text>
              </View>

              {/* Tab Switcher */}
              <View style={c.tabs}>
                {(['overview', 'warmup', 'cooldown'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { feedback.tap(); setTab(t); }}
                    style={[c.tab, tab === t && c.tabActive]}
                  >
                    <Text style={[c.tabText, tab === t && c.tabTextActive]}>
                      {t === 'overview' ? '📊 Load Trends' : t === 'warmup' ? '🔥 Warm-Up' : '🧘 Cool-Down'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={c.tabContent} showsVerticalScrollIndicator={false}>
                {/* Load Trends */}
                {tab === 'overview' && (
                  <View style={{ gap: 8 }}>
                    {insight.loadTrends.length === 0 ? (
                      <Text style={c.emptyText}>No trend data yet — keep logging!</Text>
                    ) : insight.loadTrends.map((lt, i) => {
                      const meta = TREND_META[lt.trend] || TREND_META.plateau;
                      return (
                        <View key={i} style={c.trendRow}>
                          <View style={[c.trendIcon, { backgroundColor: meta.color + '22' }]}>
                            <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={c.trendName}>{lt.name}</Text>
                            <Text style={c.trendNote}>{lt.note}</Text>
                          </View>
                          <Text style={[c.trendLabel, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Warm-Up */}
                {tab === 'warmup' && (
                  <View style={{ gap: 8 }}>
                    <Text style={c.sectionHint}>Do these before your first heavy set:</Text>
                    {insight.warmup.map((wu, i) => (
                      <View key={i} style={c.warmupRow}>
                        <View style={c.warmupNum}>
                          <Text style={c.warmupNumText}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={c.warmupName}>{wu.exercise}</Text>
                          <Text style={c.warmupSets}>{wu.sets} sets × {wu.reps}</Text>
                          <Text style={c.warmupNote}>{wu.note}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Cool-Down */}
                {tab === 'cooldown' && (
                  <View style={{ gap: 8 }}>
                    <Text style={c.sectionHint}>Hold each stretch after your last set:</Text>
                    {insight.cooldown.map((cd, i) => (
                      <View key={i} style={c.warmupRow}>
                        <View style={[c.warmupNum, { backgroundColor: 'rgba(52,199,89,0.15)' }]}>
                          <Ionicons name="body-outline" size={14} color="#34C759" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={c.warmupName}>{cd.stretch}</Text>
                          <Text style={c.warmupSets}>{cd.duration}{cd.side ? ` · ${cd.side}` : ''}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </>
          )}

          {/* Dismiss CTA */}
          <TouchableOpacity style={c.dismissBtn} onPress={() => { feedback.tap(); onDismiss(); }} activeOpacity={0.85}>
            <Text style={c.dismissText}>Got it — Let's Train 💪</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const c = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#121214',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 18,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(165,153,255,0.12)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#f2f2f7', flexShrink: 1 },
  headerSub: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: '#636366' },
  closeBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, paddingHorizontal: 4 },
  loadingText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: '#8e8e93', flexShrink: 1 },
  fatigueSection: { marginBottom: 14 },
  fatigueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fatigueLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#636366', letterSpacing: 1 },
  fatigueBadge: { fontFamily: FONT_FAMILY.bold, fontSize: 13 },
  fatigueTrack: { height: 6, backgroundColor: '#2c2c2e', borderRadius: 3, overflow: 'hidden' },
  fatigueBar: { height: 6, borderRadius: 3 },
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,159,10,0.08)', borderWidth: 1, borderColor: 'rgba(255,159,10,0.25)', borderRadius: 14, padding: 12, marginBottom: 14 },
  tipText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#f2f2f7', lineHeight: 19, flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: '#1c1c1e', alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(165,153,255,0.15)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)' },
  tabText: { fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#636366' },
  tabTextActive: { color: '#a599ff' },
  tabContent: { maxHeight: 200, marginBottom: 8 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1c1c1e', borderRadius: 14, padding: 12 },
  trendIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  trendName: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#f2f2f7' },
  trendNote: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93', marginTop: 2 },
  trendLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11 },
  warmupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#1c1c1e', borderRadius: 14, padding: 12 },
  warmupNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(165,153,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  warmupNumText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a599ff' },
  warmupName: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#f2f2f7' },
  warmupSets: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#a599ff', marginTop: 2 },
  warmupNote: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: '#8e8e93', marginTop: 3 },
  sectionHint: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#636366', marginBottom: 4 },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#636366', textAlign: 'center', paddingVertical: 12 },
  dismissBtn: { backgroundColor: '#a599ff', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 28 },
  dismissText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#000' },
});
