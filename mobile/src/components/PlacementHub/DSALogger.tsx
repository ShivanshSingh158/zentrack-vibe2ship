/**
 * DSALogger.tsx — DSA Problem Logger
 *
 * Full DSA tab: heatmap + stats + problem list + add sheet.
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import {
  DSALog, DSADifficulty, DSAOutcome, DSATopic,
  usePlacementData,
} from '../../hooks/usePlacementData';
import DSAHeatmap from './DSAHeatmap';
import LeetCodeTracker from './LeetCodeTracker';
import { feedback } from '../../utils/haptics';

const DSA_TOPICS: DSATopic[] = [
  'Arrays', 'Strings', 'HashMap', 'Sorting', 'LinkedList',
  'Stack', 'Queue', 'Recursion', 'BinarySearch', 'Trees',
  'BST', 'Heaps', 'Graphs', 'DP', 'Tries', 'Backtracking', 'Mixed',
];

const DIFFICULTY_COLOR: Record<DSADifficulty, string> = {
  Easy: '#22c55e',
  Medium: '#f59e0b',
  Hard: '#ef4444',
};

const OUTCOME_ICONS: Record<DSAOutcome, { icon: string; label: string; color: string }> = {
  clean: { icon: 'checkmark-circle', label: 'Clean ✓', color: '#22c55e' },
  hints: { icon: 'flash', label: 'Hints ⚡', color: '#f59e0b' },
  failed: { icon: 'close-circle', label: 'Failed ✗', color: '#ef4444' },
};

// ─── Add Problem Sheet ────────────────────────────────────────────────────────

interface AddProblemSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<DSALog, 'id' | 'userId' | 'solvedAt'>) => Promise<void>;
}

function AddProblemSheet({ visible, onClose, onSave }: AddProblemSheetProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<DSADifficulty>('Medium');
  const [topic, setTopic] = useState<DSATopic>('Arrays');
  const [timeTaken, setTimeTaken] = useState('');
  const [outcome, setOutcome] = useState<DSAOutcome>('clean');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(''); setDifficulty('Medium'); setTopic('Arrays');
    setTimeTaken(''); setOutcome('clean'); setCompany(''); setNotes('');
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        problemName: name.trim(),
        difficulty, topic,
        timeTaken: parseInt(timeTaken) || 0,
        outcome,
        companyTag: company.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      feedback.success();
      reset();
      onClose();
    } catch (e) {
      feedback.warning();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrapper}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Log Problem</Text>

          {/* Problem name */}
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="Problem name or LeetCode #"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          {/* Difficulty */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Difficulty</Text>
          <View style={styles.chips}>
            {(['Easy', 'Medium', 'Hard'] as DSADifficulty[]).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, {
                  backgroundColor: difficulty === d ? `${DIFFICULTY_COLOR[d]}30` : colors.surface2,
                  borderColor: difficulty === d ? DIFFICULTY_COLOR[d] : colors.border,
                }]}
                onPress={() => { setDifficulty(d); feedback.tap(); }}
              >
                <Text style={[styles.chipText, { color: difficulty === d ? DIFFICULTY_COLOR[d] : colors.textMuted }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Topic */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Topic</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACE.md }}>
            <View style={styles.chips}>
              {DSA_TOPICS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, {
                    backgroundColor: topic === t ? `${colors.accentPrimary}25` : colors.surface2,
                    borderColor: topic === t ? colors.accentPrimary : colors.border,
                  }]}
                  onPress={() => { setTopic(t); feedback.tap(); }}
                >
                  <Text style={[styles.chipText, { color: topic === t ? colors.accentPrimary : colors.textMuted }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Time taken */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Time Taken (minutes)</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="e.g. 25"
            placeholderTextColor={colors.textMuted}
            value={timeTaken}
            onChangeText={setTimeTaken}
            keyboardType="number-pad"
          />

          {/* Outcome */}
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Outcome</Text>
          <View style={styles.chips}>
            {(Object.entries(OUTCOME_ICONS) as [DSAOutcome, any][]).map(([key, { label, color }]) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, {
                  backgroundColor: outcome === key ? `${color}25` : colors.surface2,
                  borderColor: outcome === key ? color : colors.border,
                }]}
                onPress={() => { setOutcome(key); feedback.tap(); }}
              >
                <Text style={[styles.chipText, { color: outcome === key ? color : colors.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Optional fields */}
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="Company tag (optional, e.g. Amazon)"
            placeholderTextColor={colors.textMuted}
            value={company}
            onChangeText={setCompany}
          />
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="Notes — what pattern did this use?"
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
          />

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.accentPrimary, opacity: saving || !name.trim() ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving || !name.trim()}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Log Problem'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ logs, weeklyTarget, totalTarget }: { logs: DSALog[]; weeklyTarget: number; totalTarget: number }) {
  const { colors } = useTheme();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = logs.filter(l => l.solvedAt >= weekStart).length;
  const thisMonth = logs.filter(l => l.solvedAt.getMonth() === now.getMonth()).length;

  const diffCount = { Easy: 0, Medium: 0, Hard: 0 };
  logs.forEach(l => diffCount[l.difficulty]++);

  const weekPct = Math.min((thisWeek / weeklyTarget) * 100, 100);
  const totalPct = Math.min((logs.length / totalTarget) * 100, 100);

  return (
    <View style={styles.statsGrid}>
      <StatCard label="This Week" value={`${thisWeek}/${weeklyTarget}`} pct={weekPct} color={colors.accentPrimary} colors={colors} />
      <StatCard label="This Month" value={`${thisMonth}`} pct={null} color="#34d399" colors={colors} />
      <StatCard label="Total" value={`${logs.length}/${totalTarget}`} pct={totalPct} color="#f59e0b" colors={colors} />
      <StatCard label="Hard" value={`${diffCount.Hard}`} pct={null} color="#ef4444" colors={colors} />
    </View>
  );
}

function StatCard({ label, value, pct, color, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      {pct !== null && (
        <View style={[styles.miniTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.miniFill, { width: `${pct}%` as any, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

// ─── Problem Row ──────────────────────────────────────────────────────────────

function ProblemRow({ log, colors }: { log: DSALog; colors: any }) {
  const outcome = OUTCOME_ICONS[log.outcome];
  return (
    <View style={[styles.problemRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <View style={[styles.diffDot, { backgroundColor: DIFFICULTY_COLOR[log.difficulty] }]} />
      <View style={styles.problemInfo}>
        <Text style={[styles.problemName, { color: colors.textPrimary }]} numberOfLines={1}>{log.problemName}</Text>
        <Text style={[styles.problemMeta, { color: colors.textMuted }]}>
          {log.topic} · {log.timeTaken > 0 ? `${log.timeTaken}m` : '—'} · {log.companyTag || ''}
        </Text>
      </View>
      <Ionicons name={outcome.icon as any} size={16} color={outcome.color} />
    </View>
  );
}

// ─── Main DSALogger Component ─────────────────────────────────────────────────

type DSASubTab = 'logger' | 'leetcode';

export default function DSALogger() {
  const { colors } = useTheme();
  const { dsaLogs, addDSALog, dsaStreak, dsaThisWeek, config } = usePlacementData();
  const [showAdd, setShowAdd] = useState(false);
  const [subTab, setSubTab] = useState<DSASubTab>('leetcode');

  const recentLogs = useMemo(() => dsaLogs.slice(0, 30), [dsaLogs]);

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tab switcher */}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'leetcode' && styles.subTabActive, subTab === 'leetcode' && { borderBottomColor: colors.accentPrimary }]}
          onPress={() => { setSubTab('leetcode'); feedback.tap(); }}
        >
          <Ionicons name="logo-github" size={13} color={subTab === 'leetcode' ? colors.accentPrimary : colors.textMuted} />
          <Text style={[styles.subTabText, { color: subTab === 'leetcode' ? colors.accentPrimary : colors.textMuted }]}>LeetCode Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, subTab === 'logger' && styles.subTabActive, subTab === 'logger' && { borderBottomColor: colors.accentPrimary }]}
          onPress={() => { setSubTab('logger'); feedback.tap(); }}
        >
          <Ionicons name="list-outline" size={13} color={subTab === 'logger' ? colors.accentPrimary : colors.textMuted} />
          <Text style={[styles.subTabText, { color: subTab === 'logger' ? colors.accentPrimary : colors.textMuted }]}>Problem Log</Text>
        </TouchableOpacity>
      </View>

      {/* LeetCode tracker */}
      {subTab === 'leetcode' && (
        <LeetCodeTracker
          logs={dsaLogs}
          onLogProblem={() => { feedback.commit(); setShowAdd(true); }}
        />
      )}

      {/* Logger view */}
      {subTab === 'logger' && (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      {/* Heatmap */}
      <DSAHeatmap logs={dsaLogs} />

      {/* Stats */}
      <StatsRow logs={dsaLogs} weeklyTarget={config.weeklyDSATarget} totalTarget={config.phase1Target} />

      {/* Streak */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={[styles.streakBadge, { backgroundColor: `${colors.accentPrimary}15`, borderColor: `${colors.accentPrimary}40` }]}>
          <Ionicons name="flame" size={18} color="#f59e0b" />
          <Text style={[styles.streakText, { color: colors.textPrimary }]}>
            {dsaStreak > 0 ? `Day ${dsaStreak} — solved every day 🔥` : 'No streak yet. Solve a problem today!'}
          </Text>
        </View>
      </Animated.View>

      {/* Log list */}
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.textPrimary }]}>Recent Problems</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.accentPrimary }]}
          onPress={() => { feedback.commit(); setShowAdd(true); }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Log Problem</Text>
        </TouchableOpacity>
      </View>

      {recentLogs.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Ionicons name="code-slash-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No problems logged yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Log your first problem to start your streak</Text>
        </View>
      ) : (
        <View style={styles.problemList}>
          {recentLogs.map(log => (
            <ProblemRow key={log.id} log={log} colors={colors} />
          ))}
        </View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
      )}

      <AddProblemSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={addDSALog}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 70, borderRadius: RADIUS.lg, borderWidth: 1,
    padding: SPACE.md, alignItems: 'center',
  },
  statValue: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  statLabel: { fontFamily: FONT_FAMILY.body, fontSize: 9, marginTop: 2 },
  miniTrack: { height: 3, width: '100%', borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  miniFill: { height: '100%', borderRadius: 2 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.md, marginBottom: SPACE.md,
  },
  streakText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  listTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACE.md, paddingVertical: 6, borderRadius: RADIUS.md },
  addBtnText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs, color: '#fff' },
  problemList: { gap: SPACE.xs },
  problemRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.md,
  },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  problemInfo: { flex: 1 },
  problemName: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm },
  problemMeta: { fontFamily: FONT_FAMILY.body, fontSize: 10, marginTop: 1 },
  empty: {
    alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl,
    borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed',
    marginVertical: SPACE.lg,
  },
  emptyText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.md, marginTop: SPACE.md },
  emptySubtext: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, marginTop: SPACE.xs, textAlign: 'center' },
  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACE.xl, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACE.lg },
  sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, marginBottom: SPACE.lg },
  fieldLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1, marginBottom: SPACE.xs },
  chips: { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.md, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.xl, borderWidth: 1 },
  chipText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs },
  input: {
    borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm,
    marginBottom: SPACE.md,
  },
  saveBtn: { borderRadius: RADIUS.xl, padding: SPACE.md, alignItems: 'center', marginTop: SPACE.sm },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#fff' },
  // Sub-tab switcher
  subTabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', marginBottom: SPACE.md },
  subTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: SPACE.sm, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  subTabActive: { /* borderBottomColor set inline via color from theme */ },
  subTabText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs },
});

