/**
 * AnalyticsSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for AnalyticsScreen.
 * Exactly mirrors the real Analytics screen structure:
 * - Top header with title & "Live" sync indicator
 * - 3-Segment period pill selector [ 7D | 30D | 90D ]
 * - Overall Zen Score Hero Card with centered Progress Ring and 3-stat summary row (Tasks, Gym Days, Focus Time)
 * - 3-Column Quick Stat Cards (Best Streak, Habits Done, Attended)
 * - Task Completion Dual-Bar Chart Card with legend
 * - Habit Consistency Chart Card
 * - 35-Day Discipline Activity Heatmap (5 rows x 7 days)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  ShimmerHost,
  SkeletonBox,
  SkeletonCircle,
  SkeletonCard,
  SkeletonPill,
} from '../ui/ShimmerHost';

export default function AnalyticsSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── 1. Top Header Title & Live Indicator ─────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <SkeletonBox width={130} height={26} borderRadius={6} />
          <SkeletonBox width={90} height={13} borderRadius={4} style={{ marginTop: 5 }} />
        </View>
        <SkeletonPill width={58} height={26} />
      </View>

      {/* ── 2. iOS Segmented Control [ 7D | 30D | 90D ] ────────────────────── */}
      <View style={styles.periodSegmentContainer}>
        <SkeletonBox width="31%" height={32} borderRadius={10} />
        <SkeletonBox width="31%" height={32} borderRadius={10} />
        <SkeletonBox width="31%" height={32} borderRadius={10} />
      </View>

      {/* ── 3. Main Overall Zen Score Card with Centered Progress Ring ───────── */}
      <SkeletonCard style={styles.heroCard} borderRadius={22}>
        {/* Top title + Delta pill */}
        <View style={styles.heroCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SkeletonCircle size={16} />
            <SkeletonBox width={140} height={14} borderRadius={4} />
          </View>
          <SkeletonPill width={60} height={22} />
        </View>

        {/* Centered Large Circular Score Ring */}
        <View style={styles.ringCenterContainer}>
          <SkeletonCircle size={135} />
        </View>

        {/* 3 Summary Stats (Tasks | Gym Days | Focus Time) */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <SkeletonBox width={36} height={20} borderRadius={4} />
            <SkeletonBox width={45} height={12} borderRadius={3} style={{ marginTop: 4 }} />
            <SkeletonPill width={48} height={16} style={{ marginTop: 4 }} />
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <SkeletonBox width={36} height={20} borderRadius={4} />
            <SkeletonBox width={55} height={12} borderRadius={3} style={{ marginTop: 4 }} />
            <SkeletonPill width={48} height={16} style={{ marginTop: 4 }} />
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <SkeletonBox width={45} height={20} borderRadius={4} />
            <SkeletonBox width={60} height={12} borderRadius={3} style={{ marginTop: 4 }} />
            <SkeletonPill width={48} height={16} style={{ marginTop: 4 }} />
          </View>
        </View>
      </SkeletonCard>

      {/* ── 4. 3-Column Stat Cards Row ───────────────────────────────────────── */}
      <View style={styles.statCardsRow}>
        <SkeletonCard style={styles.statCard} borderRadius={16}>
          <SkeletonBox width={32} height={32} borderRadius={8} />
          <SkeletonBox width={45} height={18} borderRadius={4} style={{ marginTop: 10 }} />
          <SkeletonBox width={60} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
        <SkeletonCard style={styles.statCard} borderRadius={16}>
          <SkeletonBox width={32} height={32} borderRadius={8} />
          <SkeletonBox width={45} height={18} borderRadius={4} style={{ marginTop: 10 }} />
          <SkeletonBox width={65} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
        <SkeletonCard style={styles.statCard} borderRadius={16}>
          <SkeletonBox width={32} height={32} borderRadius={8} />
          <SkeletonBox width={45} height={18} borderRadius={4} style={{ marginTop: 10 }} />
          <SkeletonBox width={55} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
      </View>

      {/* ── 5. Task Completion Bar Chart Card ───────────────────────────────── */}
      <SkeletonCard style={styles.chartCard} borderRadius={20}>
        <View style={styles.chartHeader}>
          <View>
            <SkeletonBox width={130} height={16} borderRadius={4} />
            <SkeletonBox width={85} height={12} borderRadius={3} style={{ marginTop: 4 }} />
          </View>
          <View style={styles.legendRow}>
            <SkeletonBox width={36} height={12} borderRadius={3} />
            <SkeletonBox width={36} height={12} borderRadius={3} style={{ marginLeft: 6 }} />
          </View>
        </View>
        {/* 7 Vertical Bar Columns */}
        <View style={styles.barsContainer}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.dualBars}>
                <SkeletonBox width={8} height={20 + (i * 9) % 55} borderRadius={4} />
                <SkeletonBox width={8} height={15 + (i * 11) % 70} borderRadius={4} />
              </View>
              <SkeletonBox width={16} height={10} borderRadius={2} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ── 6. 35-Day Consistency Heatmap Grid ──────────────────────────────── */}
      <SkeletonCard style={styles.heatmapCard} borderRadius={20}>
        <SkeletonBox width={140} height={16} borderRadius={4} />
        {/* Days Header */}
        <View style={styles.heatmapDaysHeader}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <SkeletonBox width={12} height={10} borderRadius={2} />
            </View>
          ))}
        </View>
        {/* 5 Rows of 7 Cells */}
        <View style={{ gap: 6 }}>
          {Array.from({ length: 5 }).map((_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: 7 }).map((_, c) => (
                <View key={c} style={{ flex: 1, aspectRatio: 1 }}>
                  <SkeletonBox width="100%" height="100%" borderRadius={8} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </SkeletonCard>
    </ShimmerHost>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  periodSegmentContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 14,
  },
  heroCard: {
    padding: 16,
    marginBottom: 12,
  },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ringCenterContainer: {
    alignItems: 'center',
    marginVertical: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  statCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  chartCard: {
    padding: 16,
    marginBottom: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barsContainer: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  dualBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  heatmapCard: {
    padding: 16,
    marginBottom: 20,
  },
  heatmapDaysHeader: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    marginBottom: 8,
  },
});

