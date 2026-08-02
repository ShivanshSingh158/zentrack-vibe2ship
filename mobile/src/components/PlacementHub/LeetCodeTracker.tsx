/**
 * LeetCodeTracker.tsx — LeetCode-style Difficulty Tracker
 *
 * Shows Easy / Medium / Hard breakdown with:
 * - Target counts per difficulty (industry placement benchmarks)
 * - Progress rings for each tier
 * - Smart recommendation: which difficulty to prioritize next
 * - Topic gap analysis: which topics are weakest by difficulty
 * - Streak by difficulty: "7 days without a Hard problem"
 * - Acceptance rate proxy (clean solves / total attempts per tier)
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { DSALog, DSADifficulty, DSATopic, usePlacementData } from '../../hooks/usePlacementData';
import { fetchLeetCodeStats } from '../../services/leetcode';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';

// ─── Targets (industry benchmark for placements) ──────────────────────────────

export const DIFFICULTY_TARGETS: Record<DSADifficulty, number> = {
  Easy:   75,   // ~18% of 420 total — warm-up, concept validation
  Medium: 260,  // ~62% of 420 total — bread and butter of interviews
  Hard:   85,   // ~20% of 420 total — differentiator for top companies
};

// Optimal weekly distribution
const WEEKLY_TARGETS: Record<DSADifficulty, number> = {
  Easy:   3,
  Medium: 12,
  Hard:   6,
};

// ─── Colors ───────────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<DSADifficulty, string> = {
  Easy:   '#22c55e',
  Medium: '#f59e0b',
  Hard:   '#ef4444',
};

const DIFF_ICON: Record<DSADifficulty, string> = {
  Easy:   'leaf-outline',
  Medium: 'flash-outline',
  Hard:   'skull-outline',
};

// ─── Circular Progress Ring (SVG) ─────────────────────────────────────────────

const RING = { size: 88, stroke: 7 };
const RING_RADIUS = (RING.size - RING.stroke) / 2;
const RING_CIRC   = 2 * Math.PI * RING_RADIUS;

function DiffRing({ difficulty, done, colors }: {
  difficulty: DSADifficulty;
  done: number;
  colors: any;
}) {
  const color = DIFF_COLOR[difficulty];

  return (
    <View style={styles.ringWrapper}>
      <Svg width={RING.size} height={RING.size} style={styles.ringSvg}>
        <Circle
          cx={RING.size / 2} cy={RING.size / 2} r={RING_RADIUS}
          strokeWidth={RING.stroke}
          stroke={color}
          fill="none"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringCount, { color }]}>{done}</Text>
      </View>
    </View>
  );
}

// ─── Difficulty Card ──────────────────────────────────────────────────────────

function DifficultyCard({
  difficulty, done, weekDone, weekTarget, acceptanceRate, colors, delay,
}: {
  difficulty: DSADifficulty;
  done: number;
  weekDone: number;
  weekTarget: number;
  acceptanceRate: number;
  colors: any;
  delay: number;
}) {
  const color     = DIFF_COLOR[difficulty];
  const weekPct   = weekTarget > 0 ? Math.min((weekDone / weekTarget) * 100, 100) : 0;

  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(400)}>
      <View style={[styles.diffCard, { backgroundColor: colors.surface2, borderColor: `${color}30` }]}>
        {/* Header */}
        <View style={styles.diffHeader}>
          <View style={[styles.diffBadge, { backgroundColor: `${color}18` }]}>
            <Ionicons name={DIFF_ICON[difficulty] as any} size={14} color={color} />
            <Text style={[styles.diffLabel, { color }]}>{difficulty}</Text>
          </View>
        </View>

        {/* Ring + Stats */}
        <View style={styles.diffBody}>
          <DiffRing difficulty={difficulty} done={done} colors={colors} />
          <View style={styles.diffStats}>
            <StatLine label="This week" value={`${weekDone}/${weekTarget}`} color={color} colors={colors} />
            <StatLine label="Clean rate" value={`${acceptanceRate}%`} color={acceptanceRate >= 60 ? '#22c55e' : '#f59e0b'} colors={colors} />
          </View>
        </View>

        {/* Weekly progress bar */}
        <View style={styles.weekSection}>
          <Text style={[styles.weekLabel, { color: colors.textMuted }]}>Weekly target</Text>
          <View style={[styles.weekTrack, { backgroundColor: `${color}15` }]}>
            <View style={[styles.weekFill, { width: `${weekPct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={[styles.weekCount, { color }]}>{weekDone} / {weekTarget} this week</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function StatLine({ label, value, color, colors }: any) {
  return (
    <View style={styles.statLine}>
      <Text style={[styles.statLineLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statLineValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Smart Recommendation Engine ─────────────────────────────────────────────

interface Recommendation {
  title: string;
  reason: string;
  action: string;
  urgency: 'critical' | 'warning' | 'tip';
  icon: string;
}

function buildRecommendation(
  counts: Record<DSADifficulty, number>,
  weekCounts: Record<DSADifficulty, number>,
  daysSinceHard: number,
  acceptanceRates: Record<DSADifficulty, number>,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Rule 1: No Hard in 7+ days
  if (daysSinceHard >= 7) {
    recs.push({
      title: `${daysSinceHard} days without a Hard`,
      reason: 'Hard problems build pattern recognition for FAANG interviews.',
      action: 'Solve 1 Hard problem today — Trees or Graphs.',
      urgency: 'critical',
      icon: 'skull',
    });
  }

  // Rule 2: Easy over-indexing
  const totalSolved = counts.Easy + counts.Medium + counts.Hard;
  const easyRatio = totalSolved > 10 ? counts.Easy / totalSolved : 0;
  if (easyRatio > 0.35 && totalSolved > 20) {
    recs.push({
      title: 'Too many Easy problems',
      reason: `${Math.round(easyRatio * 100)}% of your problems are Easy. Interviewers rarely ask Easy-level questions.`,
      action: 'Next 3 sessions: Medium or Hard only.',
      urgency: 'warning',
      icon: 'trending-up',
    });
  }

  // Rule 3: Medium behind weekly target
  const mediumBehind = WEEKLY_TARGETS.Medium - weekCounts.Medium;
  if (mediumBehind >= 5) {
    recs.push({
      title: `${mediumBehind} Mediums behind this week`,
      reason: 'Medium problems are the bread and butter of technical interviews.',
      action: `Solve ${Math.min(mediumBehind, 3)} Mediums today to get back on track.`,
      urgency: mediumBehind >= 8 ? 'critical' : 'warning',
      icon: 'flash',
    });
  }

  // Rule 4: Low clean rate on Medium (struggling)
  if (acceptanceRates.Medium < 50 && counts.Medium > 10) {
    recs.push({
      title: 'Medium clean rate below 50%',
      reason: 'You\'re solving with hints too often. This suggests pattern gaps.',
      action: 'Revisit Arrays + HashMap + Sliding Window — the most common Medium patterns.',
      urgency: 'warning',
      icon: 'bulb',
    });
  }

  // Rule 5: Almost at Easy target
  if (counts.Easy >= DIFFICULTY_TARGETS.Easy * 0.9) {
    recs.push({
      title: 'Easy target almost complete',
      reason: `${counts.Easy}/${DIFFICULTY_TARGETS.Easy} Easy done. Shift focus to Medium + Hard now.`,
      action: 'Stop solving Easy problems. Allocate that time to Medium.',
      urgency: 'tip',
      icon: 'checkmark-circle',
    });
  }

  // Rule 6: Good Hard progress — positive reinforcement
  if (counts.Hard >= 20 && daysSinceHard < 3) {
    recs.push({
      title: 'Strong Hard problem momentum',
      reason: `${counts.Hard} Hard problems solved. You are in the top tier.`,
      action: 'Keep going. Add company tags to Hard problems for targeted prep.',
      urgency: 'tip',
      icon: 'trophy',
    });
  }

  // Default: keep going
  if (recs.length === 0) {
    recs.push({
      title: 'On track',
      reason: 'Your difficulty balance looks good.',
      action: 'Maintain the pace. Focus on Medium + Hard mix this week.',
      urgency: 'tip',
      icon: 'checkmark-done',
    });
  }

  return recs.slice(0, 3); // Max 3 at a time
}

function RecommendationCard({ rec, colors }: { rec: Recommendation; colors: any }) {
  const urgencyConfig = {
    critical: { color: '#ef4444', bg: '#ef444410', icon: 'alert-circle' },
    warning:  { color: '#f59e0b', bg: '#f59e0b10', icon: 'warning' },
    tip:      { color: '#22c55e', bg: '#22c55e10', icon: 'bulb' },
  };
  const cfg = urgencyConfig[rec.urgency];

  return (
    <View style={[styles.recCard, { backgroundColor: cfg.bg, borderColor: `${cfg.color}30` }]}>
      <View style={styles.recHeader}>
        <Ionicons name={rec.icon as any} size={16} color={cfg.color} />
        <Text style={[styles.recTitle, { color: cfg.color }]}>{rec.title}</Text>
      </View>
      <Text style={[styles.recReason, { color: colors.textSecondary }]}>{rec.reason}</Text>
      <View style={[styles.recActionRow, { borderTopColor: `${cfg.color}20` }]}>
        <Ionicons name="arrow-forward-circle-outline" size={13} color={cfg.color} />
        <Text style={[styles.recAction, { color: colors.textPrimary }]}>{rec.action}</Text>
      </View>
    </View>
  );
}

// ─── Topic Gap Analysis ───────────────────────────────────────────────────────

function TopicGapPanel({ logs, colors }: { logs: DSALog[]; colors: any }) {
  // For each topic, count Hard problems solved
  const hardByTopic = useMemo(() => {
    const map: Partial<Record<DSATopic, number>> = {};
    logs.filter(l => l.difficulty === 'Hard').forEach(l => {
      map[l.topic] = (map[l.topic] || 0) + 1;
    });
    return map;
  }, [logs]);

  // Topics with 0 Hard problems (gaps)
  const KEY_TOPICS: DSATopic[] = ['Graphs', 'DP', 'Trees', 'BST', 'Heaps', 'Tries', 'Backtracking'];
  const gaps = KEY_TOPICS.filter(t => !hardByTopic[t] || (hardByTopic[t] || 0) < 2);

  if (gaps.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(400)}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>HARD PROBLEM GAPS</Text>
      <View style={[styles.gapCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Text style={[styles.gapSubtitle, { color: colors.textSecondary }]}>
          Topics with {'<'} 2 Hard problems solved — most commonly tested at top companies:
        </Text>
        <View style={styles.gapPills}>
          {gaps.map(t => (
            <View key={t} style={[styles.gapPill, { backgroundColor: '#ef444415', borderColor: '#ef444435' }]}>
              <Text style={[styles.gapPillText, { color: '#ef4444' }]}>{t}</Text>
              <Text style={[styles.gapPillCount, { color: '#ef4444' }]}>
                {hardByTopic[t] || 0} Hard
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LeetCodeTrackerProps {
  logs: DSALog[];
  onLogProblem: () => void;
}

export default function LeetCodeTracker({ logs, onLogProblem }: LeetCodeTrackerProps) {
  const { colors } = useTheme();
  const { config, updateConfig } = usePlacementData();
  const [lcStats, setLcStats] = React.useState<Record<DSADifficulty, number> | null>(null);
  const [usernameInput, setUsernameInput] = React.useState(config.leetCodeUsername || '');
  
  const [aiRecommendations, setAiRecommendations] = React.useState<Recommendation[] | null>(null);
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const aiFetchedRef = React.useRef(false);

  const handleSaveUsername = () => {
    if (usernameInput.trim() !== config.leetCodeUsername) {
      updateConfig({ leetCodeUsername: usernameInput.trim() }).catch(() => {});
    }
  };

  // Auto-sync with LeetCode
  React.useEffect(() => {
    if (config.leetCodeUsername) {
      fetchLeetCodeStats(config.leetCodeUsername).then(stats => {
        if (stats) {
          setLcStats({
            Easy: stats.easySolved,
            Medium: stats.mediumSolved,
            Hard: stats.hardSolved,
          });
          // Dynamically bump target if they exceeded it
          if (stats.totalSolved > config.phase1Target) {
            updateConfig({ phase1Target: stats.totalSolved + 50 }).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  }, [config.leetCodeUsername, config.phase1Target, updateConfig]);

  // ── Computed stats ───────────────────────────────────────────────────────────

  const { counts, weekCounts, acceptanceRates, daysSinceHard } = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const manualCounts: Record<DSADifficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
    const weekCounts: Record<DSADifficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
    const cleanCounts: Record<DSADifficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };

    logs.forEach(l => {
      manualCounts[l.difficulty]++;
      if (l.solvedAt >= weekStart) weekCounts[l.difficulty]++;
      if (l.outcome === 'clean') cleanCounts[l.difficulty]++;
    });
    
    // Merge LeetCode synced stats if available (take the max)
    const counts = {
      Easy: Math.max(manualCounts.Easy, lcStats?.Easy || 0),
      Medium: Math.max(manualCounts.Medium, lcStats?.Medium || 0),
      Hard: Math.max(manualCounts.Hard, lcStats?.Hard || 0),
    };

    const acceptanceRates: Record<DSADifficulty, number> = {
      Easy:   manualCounts.Easy   > 0 ? Math.round((cleanCounts.Easy   / manualCounts.Easy)   * 100) : 0,
      Medium: manualCounts.Medium > 0 ? Math.round((cleanCounts.Medium / manualCounts.Medium) * 100) : 0,
      Hard:   manualCounts.Hard   > 0 ? Math.round((cleanCounts.Hard   / manualCounts.Hard)   * 100) : 0,
    };

    // Days since last Hard
    const hardLogs = logs.filter(l => l.difficulty === 'Hard');
    const lastHard = hardLogs.length > 0
      ? hardLogs.reduce((a, b) => a.solvedAt > b.solvedAt ? a : b).solvedAt
      : null;
    const daysSinceHard = lastHard
      ? Math.floor((now.getTime() - lastHard.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    return { counts, weekCounts, acceptanceRates, daysSinceHard };
  }, [logs, lcStats]);

  const totalSolved = counts.Easy + counts.Medium + counts.Hard;

  const recommendations = useMemo(
    () => buildRecommendation(counts, weekCounts, daysSinceHard, acceptanceRates),
    [counts, weekCounts, daysSinceHard, acceptanceRates],
  );

  React.useEffect(() => {
    // Only fetch once per open, let local state settle first
    if (aiFetchedRef.current) return;
    
    const timer = setTimeout(() => {
      if (aiFetchedRef.current) return;
      aiFetchedRef.current = true;
      setIsAiLoading(true);

      const prompt = `You are S.A.R.A, an elite technical interview AI coach.
Analyze the user's DSA (Data Structures & Algorithms) progress and provide 1 to 3 actionable recommendations.
Current Stats:
- Total Solved: Easy=${counts.Easy}, Medium=${counts.Medium}, Hard=${counts.Hard}
- This Week: Easy=${weekCounts.Easy}, Medium=${weekCounts.Medium}, Hard=${weekCounts.Hard}
- Acceptance Rates (clean rate without hints): Easy=${acceptanceRates.Easy}%, Medium=${acceptanceRates.Medium}%, Hard=${acceptanceRates.Hard}%
- Days since last Hard problem: ${daysSinceHard === 999 ? 'Never' : daysSinceHard}

Return a raw JSON array (no markdown blocks, no text before or after) of objects with the following schema:
[{
  "title": "Short title",
  "reason": "Why this matters for FAANG interviews",
  "action": "Specific action to take today/this week",
  "urgency": "critical" | "warning" | "tip",
  "icon": "skull" | "trending-up" | "warning" | "checkmark-circle" | "flash"
}]`;

      callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
      })
      .then(data => {
        const { text } = parseProxyResponse(data);
        if (text) setAiRecommendations(JSON.parse(text));
      })
      .catch(err => {
        console.error('[SARA] DSA Recommendation failed:', err);
      })
      .finally(() => {
        setIsAiLoading(false);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [counts, weekCounts, daysSinceHard, acceptanceRates]);

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

      {/* ── Username & Overview ── */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md }}>
          <Ionicons name="logo-github" size={20} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={{ flex: 1, backgroundColor: colors.surface2, color: colors.textPrimary, padding: 12, borderRadius: RADIUS.md }}
            placeholder="Enter LeetCode username to auto-sync"
            placeholderTextColor={colors.textMuted}
            value={usernameInput}
            onChangeText={setUsernameInput}
            autoCapitalize="none"
          />
          {usernameInput.trim() !== config.leetCodeUsername && (
            <TouchableOpacity onPress={handleSaveUsername} style={{ backgroundColor: colors.accentPrimary, padding: 12, borderRadius: RADIUS.md, marginLeft: 8 }}>
              <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bold }}>Sync</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.totalBanner, { backgroundColor: `${colors.accentPrimary}10`, borderColor: `${colors.accentPrimary}25` }]}>
          <View>
            <Text style={[styles.totalCount, { color: colors.accentPrimary }]}>{totalSolved}</Text>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>total problems solved</Text>
          </View>
          <View style={styles.totalRight}>
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: colors.accentPrimary, alignSelf: 'flex-end' }]}
              onPress={onLogProblem}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.logBtnText}>Log</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── Difficulty cards ── */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>BREAKDOWN BY DIFFICULTY</Text>
      <View style={styles.diffCards}>
        {(['Easy', 'Medium', 'Hard'] as DSADifficulty[]).map((d, i) => (
          <DifficultyCard
            key={d}
            difficulty={d}
            done={counts[d]}
            weekDone={weekCounts[d]}
            weekTarget={WEEKLY_TARGETS[d]}
            acceptanceRate={acceptanceRates[d]}
            colors={colors}
            delay={i * 80}
          />
        ))}
      </View>

      {/* ── Difficulty ratio bar (Easy : Med : Hard) ── */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DIFFICULTY RATIO</Text>
        <View style={[styles.ratioCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={styles.ratioBar}>
            {(['Easy', 'Medium', 'Hard'] as DSADifficulty[]).map(d => {
              const pct = totalSolved > 0 ? (counts[d] / totalSolved) * 100 : 0;
              return (
                <View
                  key={d}
                  style={[styles.ratioSegment, { width: `${pct}%` as any, backgroundColor: DIFF_COLOR[d] }]}
                />
              );
            })}
          </View>
          <View style={styles.ratioLegend}>
            {(['Easy', 'Medium', 'Hard'] as DSADifficulty[]).map(d => {
              const pct = totalSolved > 0 ? Math.round((counts[d] / totalSolved) * 100) : 0;
              return (
                <View key={d} style={styles.ratioLegendItem}>
                  <View style={[styles.ratioLegendDot, { backgroundColor: DIFF_COLOR[d] }]} />
                  <Text style={[styles.ratioLegendText, { color: colors.textSecondary }]}>
                    {d}: {pct}%
                  </Text>
                </View>
              );
            })}
            <Text style={[styles.ratioIdeal, { color: colors.textMuted }]}>Ideal: 18% / 62% / 20%</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Smart recommendations ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.sm, marginTop: SPACE.sm }}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 0, marginTop: 0 }]}>AI RECOMMENDATIONS</Text>
        {isAiLoading && <ActivityIndicator size="small" color={colors.accentPrimary} />}
      </View>
      <View style={styles.recList}>
        {(aiRecommendations || recommendations).map((rec, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(i * 60).duration(400)}>
            <RecommendationCard rec={rec} colors={colors} />
          </Animated.View>
        ))}
      </View>

      {/* ── Topic gap analysis ── */}
      <TopicGapPanel logs={logs} colors={colors} />

      {/* ── Hard problem timeline ── */}
      {daysSinceHard < 999 && (
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={[styles.hardTimeline, {
            backgroundColor: daysSinceHard >= 7 ? '#ef444412' : '#22c55e10',
            borderColor: daysSinceHard >= 7 ? '#ef444435' : '#22c55e30',
          }]}>
            <Ionicons
              name={daysSinceHard >= 7 ? 'warning-outline' : 'checkmark-circle-outline'}
              size={16}
              color={daysSinceHard >= 7 ? '#ef4444' : '#22c55e'}
            />
            <Text style={[styles.hardTimelineText, {
              color: daysSinceHard >= 7 ? '#ef4444' : '#22c55e',
            }]}>
              {daysSinceHard === 0
                ? 'Solved a Hard problem today 🔥'
                : daysSinceHard === 1
                ? 'Last Hard was yesterday'
                : `Last Hard: ${daysSinceHard} days ago`}
            </Text>
          </View>
        </Animated.View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Total banner
  totalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, marginBottom: SPACE.lg,
  },
  totalCount: { fontFamily: FONT_FAMILY.bold, fontSize: 32 },
  totalLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  totalRight: { flex: 1 },
  totalTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  totalFill: { height: '100%', borderRadius: 3 },
  totalPct: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACE.md, paddingVertical: 7,
    borderRadius: RADIUS.lg,
  },
  logBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: '#fff' },
  // Section label
  sectionLabel: {
    fontFamily: FONT_FAMILY.bold, fontSize: 9, letterSpacing: 2,
    marginBottom: SPACE.sm, marginTop: SPACE.sm,
  },
  // Difficulty cards
  diffCards: { gap: SPACE.sm, marginBottom: SPACE.lg },
  diffCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg },
  diffHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  diffBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  diffLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm },
  diffPct: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm },
  diffBody: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.md },
  // Ring
  ringWrapper: { position: 'relative', width: RING.size, height: RING.size, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },
  ringCenter: { alignItems: 'center', flexDirection: 'row', alignSelf: 'center' },
  ringCount: { fontFamily: FONT_FAMILY.bold, fontSize: 22 },
  ringTotal: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, marginTop: 4 },
  // Stat lines
  diffStats: { flex: 1, gap: 6 },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLineLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  statLineValue: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs },
  // Week bar
  weekSection: { gap: 4 },
  weekLabel: { fontFamily: FONT_FAMILY.body, fontSize: 10 },
  weekTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  weekFill: { height: '100%', borderRadius: 2 },
  weekCount: { fontFamily: FONT_FAMILY.medium, fontSize: 10 },
  // Ratio
  ratioCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, marginBottom: SPACE.lg },
  ratioBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1, marginBottom: SPACE.md },
  ratioSegment: { height: '100%' },
  ratioLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, alignItems: 'center' },
  ratioLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratioLegendDot: { width: 8, height: 8, borderRadius: 4 },
  ratioLegendText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  ratioIdeal: { fontFamily: FONT_FAMILY.body, fontSize: 10, width: '100%', marginTop: 2 },
  // Recommendations
  recList: { gap: SPACE.sm, marginBottom: SPACE.lg },
  recCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
  recTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, flex: 1 },
  recReason: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 18, marginBottom: SPACE.sm },
  recActionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    borderTopWidth: 1, paddingTop: SPACE.sm,
  },
  recAction: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs, flex: 1, lineHeight: 18 },
  // Topic gaps
  gapCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, marginBottom: SPACE.lg },
  gapSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 18, marginBottom: SPACE.md },
  gapPills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  gapPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  gapPillText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs },
  gapPillCount: { fontFamily: FONT_FAMILY.body, fontSize: 10 },
  // Hard timeline
  hardTimeline: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.md, marginBottom: SPACE.md,
  },
  hardTimelineText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm },
});
