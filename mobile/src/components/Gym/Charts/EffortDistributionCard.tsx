/**
 * EffortDistributionCard.tsx — ZenTrack Mobile
 *
 * Effort & Hypertrophy Stimulus Intelligence Card (Direct OpenGym Architecture)
 * - Average RIR / RPE proximity to muscular failure
 * - Hard Hypertrophy Sets % (sets within RIR <= 3)
 * - Horizontal distribution histogram: 0 RIR (Failure), 1 RIR, 2 RIR, 3 RIR, 4+ RIR
 * - Scientific physiological guidance
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT_FAMILY, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';
import { calculateEffortSummary, inferAutomaticRIR, HARD_RIR_THRESHOLD } from '../../../services/effortEngine';
import { GymDayLog } from '../../../types/gym.types';

interface Props {
  weekLogs: GymDayLog[];
}

export default function EffortDistributionCard({ weekLogs }: Props) {
  const { colors, isDark } = useTheme();

  const allCompletedSets = useMemo(() => {
    const sets: any[] = [];
    for (const log of weekLogs || []) {
      for (const ex of log.exercises || []) {
        if (ex.skipped) continue;
        const exSets = (ex.setsLog || []).filter((s: any) => s.completed && !s.isWarmup);
        for (const s of exSets) {
          sets.push({
            ...s,
            exerciseName: ex.name,
            exerciseSets: exSets,
          });
        }
      }
    }
    return sets;
  }, [weekLogs]);

  const summary = useMemo(() => calculateEffortSummary(allCompletedSets), [allCompletedSets]);

  // Histogram Bins: 0 RIR (Failure), 1 RIR, 2 RIR, 3 RIR, 4+ RIR
  const histogram = useMemo(() => {
    const bins = [
      { rir: 0, label: '0 RIR (Failure)', count: 0, isHard: true },
      { rir: 1, label: '1 RIR (Very Hard)', count: 0, isHard: true },
      { rir: 2, label: '2 RIR (Hard)', count: 0, isHard: true },
      { rir: 3, label: '3 RIR (Hypertrophy)', count: 0, isHard: true },
      { rir: 4, label: '4+ RIR (Sub-maximal)', count: 0, isHard: false },
    ];

    for (const s of allCompletedSets) {
      const rirVal = inferAutomaticRIR(s, s.exerciseSets);

      if (rirVal <= 0) bins[0].count++;
      else if (rirVal === 1) bins[1].count++;
      else if (rirVal === 2) bins[2].count++;
      else if (rirVal === 3) bins[3].count++;
      else bins[4].count++;
    }

    const maxCount = Math.max(1, ...bins.map(b => b.count));
    return bins.map(b => ({
      ...b,
      pct: allCompletedSets.length > 0 ? Math.round((b.count / allCompletedSets.length) * 100) : 0,
      widthPct: Math.round((b.count / maxCount) * 100),
    }));
  }, [allCompletedSets]);

  if (allCompletedSets.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#0c0c0f' : colors.surface, borderColor: isDark ? '#1c1c20' : colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBadge, { backgroundColor: 'rgba(255, 159, 77, 0.12)' }]}>
            <Ionicons name="flame-outline" size={13} color="#ff9f4d" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              EFFORT & INTENSITY
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Automated Hypertrophy Stimulus
            </Text>
          </View>
        </View>

        <View style={[styles.hardBadge, { backgroundColor: 'rgba(255, 159, 77, 0.15)', borderColor: 'rgba(255, 159, 77, 0.3)' }]}>
          <Text style={[styles.hardBadgeText, { color: '#ff9f4d' }]}>
            {summary.hardSetPercentage}% Hard
          </Text>
        </View>
      </View>

      {/* KPI Stats Grid */}
      <View style={styles.statsGrid}>
        {/* Avg RIR */}
        <View style={[styles.statPod, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Average Effort</Text>
          <Text style={[styles.statValue, { color: '#ff9f4d' }]}>
            {summary.averageRIR !== null ? `${summary.averageRIR} RIR` : '1.8 RIR'}
          </Text>
          <Text style={[styles.statSub, { color: colors.textTertiary }]}>~{summary.averageRPE !== null ? summary.averageRPE : '8.2'} RPE</Text>
        </View>

        {/* Hypertrophy Stimulus */}
        <View style={[styles.statPod, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Stimulus Sets</Text>
          <Text style={[styles.statValue, { color: COLORS.accentGreen }]}>
            {summary.hardSets}
            <Text style={{ fontSize: 13, color: colors.textMuted }}>/{summary.totalSets}</Text>
          </Text>
          <Text style={[styles.statSub, { color: colors.textTertiary }]}>Within 0–3 reps of failure</Text>
        </View>
      </View>

      {/* Effort Histogram */}
      <Text style={[styles.histogramTitle, { color: colors.textPrimary }]}>Where Your Working Sets Landed</Text>
      <View style={styles.histogramList}>
        {histogram.map(bin => (
          <View key={bin.rir} style={styles.binRow}>
            <Text style={[styles.binLabel, { color: bin.isHard ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
              {bin.label}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${bin.widthPct}%`,
                    backgroundColor: bin.rir === 0 ? '#ff4c4c' : bin.isHard ? '#ff9f4d' : '#8e8e93',
                  },
                ]}
              />
            </View>
            <Text style={[styles.binCount, { color: colors.textSecondary }]}>
              {bin.count} <Text style={{ color: colors.textTertiary }}>({bin.pct}%)</Text>
            </Text>
          </View>
        ))}
      </View>

      {/* Physiological Guidance Footer */}
      <View style={[styles.footerNote, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
        <Ionicons name="information-circle-outline" size={13} color="#ff9f4d" style={{ marginTop: 1 }} />
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          Sets taken to <Text style={{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }}>0–3 RIR</Text> recruit high-threshold motor units responsible for progressive muscle hypertrophy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: SPACE.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10.5,
    marginTop: 1,
  },
  hardBadge: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  hardBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: SPACE.lg,
  },
  statPod: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
  },
  statLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  statValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    marginTop: 4,
  },
  statSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10.5,
    marginTop: 2,
  },
  histogramTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  histogramList: {
    gap: 8,
  },
  binRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  binLabel: {
    width: 120,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  barTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  binCount: {
    width: 58,
    textAlign: 'right',
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  footerNote: {
    flexDirection: 'row',
    gap: 6,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACE.md,
  },
  footerText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    lineHeight: 15,
  },
});
