/**
 * AgentHistoryScreen.tsx — ZenTrack Mobile
 *
 * Feature 4.15 — Sara Agent Action History Log
 *
 * Shows a timeline of every action Sara committed autonomously (Tier 1)
 * or with user confirmation (Tier 2 pill / Tier 3 card) — giving full
 * transparency into what the AI has done on the user's behalf.
 *
 * Accessible from: Settings → Sara → Action History
 */

import React, { useCallback, useEffect, useState } from 'react';
import { formatDateShort } from '../utils/dateUtils';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, SHADOW } from '../theme/tokens';
import { AgentAction, clearAgentHistory, getAgentHistory } from '../services/agentHistory';
import type { ActionTier } from '../services/agentHistory';

// ── Action type → icon + label mapping ───────────────────────────────────────

interface ActionMeta {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}

function getActionMeta(type: string, colors: any): ActionMeta {
  switch (type) {
    case 'createTask':
      return { icon: 'add-circle-outline', label: 'Task Created', color: '#34C759' };
    case 'deleteTask':
      return { icon: 'trash-outline', label: 'Task Deleted', color: '#FF3B30' };
    case 'completeTask':
      return { icon: 'checkmark-circle-outline', label: 'Task Completed', color: '#34C759' };
    case 'updateTask':
      return { icon: 'create-outline', label: 'Task Updated', color: '#FF9F0A' };
    case 'logHabit':
      return { icon: 'flame-outline', label: 'Habit Logged', color: '#FF9F0A' };
    case 'markAttendance':
      return { icon: 'clipboard-outline', label: 'Attendance Marked', color: '#5E5CE6' };
    case 'logWorkout':
    case 'logGym':
      return { icon: 'barbell-outline', label: 'Workout Logged', color: colors.accentPrimary };
    case 'createEvent':
      return { icon: 'calendar-outline', label: 'Event Created', color: '#5E5CE6' };
    case 'updateNote':
    case 'createNote':
      return { icon: 'document-text-outline', label: 'Note Updated', color: '#64D2FF' };
    default:
      return { icon: 'flash-outline', label: type, color: colors.textMuted };
  }
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: ActionTier }) {
  const { colors } = useTheme();
  const config: Record<ActionTier, { label: string; bg: string; text: string }> = {
    1: { label: 'AUTO', bg: 'rgba(52,199,89,0.15)', text: '#34C759' },
    2: { label: 'CONFIRMED', bg: 'rgba(165,153,255,0.15)', text: '#a599ff' },
    3: { label: 'APPROVED', bg: 'rgba(94,92,230,0.15)', text: '#5E5CE6' },
  };
  const c = config[tier] ?? config[3];
  return (
    <View style={[styles.tierBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.tierBadgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ActionRow({ item }: { item: AgentAction }) {
  const { colors } = useTheme();
  const meta = getActionMeta(item.type, colors);

  const relativeTime = useCallback(() => {
    const diffMs = Date.now() - item.timestampMs;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }, [item.timestampMs]);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Left: timeline dot + vertical connector */}
      <View style={styles.timelineCol}>
        <View style={[styles.timelineDot, { backgroundColor: meta.color }]} />
        <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Icon badge */}
      <View style={[styles.iconBox, { backgroundColor: `${meta.color}18` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
            {meta.label}
          </Text>
          <TierBadge tier={item.tier} />
        </View>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={[styles.rowTime, { color: colors.textTertiary }]}>
          {relativeTime()} · {new Date(item.timestamp).toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const data = await getAgentHistory();
    setHistory(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, [loadHistory]));

  const handleClear = () => {
    Alert.alert(
      'Clear Action History',
      'This will delete all logged Sara actions. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAgentHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconBox, { backgroundColor: 'rgba(165,153,255,0.12)' }]}>
            <Ionicons name="time-outline" size={18} color={colors.accentPrimary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Action History</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              {history.length > 0 ? `${history.length} committed action${history.length !== 1 ? 's' : ''}` : 'No actions yet'}
            </Text>
          </View>
        </View>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={colors.accentPrimary} />
        </View>
      ) : history.length === 0 ? (
        /* ── Empty state ── */
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBox, { backgroundColor: 'rgba(165,153,255,0.08)' }]}>
            <Ionicons name="planet-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No actions yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Every time Sara creates a task, logs a habit, or takes an action on your behalf — it will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, idx) => `${item.timestampMs}-${idx}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ActionRow item={item} />}
          ListFooterComponent={
            <Text style={[styles.footerNote, { color: colors.textTertiary }]}>
              Showing last {history.length} action{history.length !== 1 ? 's' : ''} (max 50 stored)
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconBox: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  headerSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: 2 },
  clearBtn: { padding: SPACE.xs },

  list: {
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xxl,
    gap: 0,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    gap: SPACE.md,
    ...SHADOW.sm,
  },

  timelineCol: { alignItems: 'center', paddingTop: 4 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  timelineLine: { width: 1, flex: 1, minHeight: 20, opacity: 0.3 },

  iconBox: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  rowContent: { flex: 1 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  rowLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, flex: 1, marginRight: 8 },
  rowDesc: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 18, marginBottom: 4 },
  rowTime: { fontFamily: FONT_FAMILY.mono, fontSize: 10, letterSpacing: 0.2 },

  tierBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  tierBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg },
  emptyTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, marginBottom: SPACE.sm, textAlign: 'center' },
  emptyBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 20, opacity: 0.7 },

  footerNote: { fontFamily: FONT_FAMILY.body, fontSize: 11, textAlign: 'center', marginTop: SPACE.md, opacity: 0.5 },
});
