/**
 * AnalyticsSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for Redesigned AnalyticsScreen.
 * Perfectly mirrors the real Analytics screen scroll body:
 * - Overall Zen Score Hero Card with Concentric Progress Ring & 4-Pillar Life Balance tracks
 * - 2x2 High-Signal Telemetry Grid (Task Velocity, Active Streak, Attendance Safety, Deep Work)
 * - Task Velocity Bar Chart Card with capsule bars and legend
 * - Habit Momentum Wave Chart Card with spline area wave placeholder
 * - 35-Day Discipline Grid (5 rows x 7 days)
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import {
  ShimmerHost,
  SkeletonBox,
  SkeletonCircle,
  SkeletonCard,
  SkeletonPill,
} from '../ui/ShimmerHost';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 16;

export default function AnalyticsSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── 1. Hero Zen Score Card with Concentric Progress Ring & 4 Pillars ── */}
      <SkeletonCard style={styles.heroCard} borderRadius={24}>
        {/* Top title + Delta pill */}
        <View style={styles.heroCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SkeletonCircle size={16} />
            <SkeletonBox width={140} height={14} borderRadius={4} />
          </View>
          <SkeletonPill width={58} height={22} />
        </View>

        {/* Centered Large Circular Score Ring */}
        <View style={styles.ringCenterContainer}>
          <SkeletonCircle size={140} />
        </View>

        {/* 4-Pillar Life Balance 2x2 Grid (Tasks, Habits, Gym, Focus) */}
        <View style={styles.pillarsGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.pillarCell}>
              <View style={styles.pillarLabelRow}>
                <SkeletonBox width={34} height={11} borderRadius={3} />
                <SkeletonBox width={26} height={11} borderRadius={3} />
              </View>
              <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ── 2. 2x2 High-Signal Telemetry Grid ── */}
      <View style={styles.statGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.statTile} borderRadius={20}>
            <View style={styles.statTileHeader}>
              <SkeletonBox width={32} height={32} borderRadius={10} />
              <SkeletonPill width={48} height={18} />
            </View>
            <SkeletonBox width={50} height={22} borderRadius={4} style={{ marginTop: 6 }} />
            <SkeletonBox width={70} height={12} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
        ))}
      </View>

      {/* ── 3. Task Velocity Bar Chart Card ── */}
      <SkeletonCard style={styles.chartCard} borderRadius={22}>
        <View style={styles.chartHeader}>
          <View>
            <SkeletonBox width={120} height={16} borderRadius={4} />
            <SkeletonBox width={80} height={12} borderRadius={3} style={{ marginTop: 4 }} />
          </View>
          <SkeletonPill width={65} height={18} />
        </View>
        {/* 7 Vertical Capsule Bars */}
        <View style={styles.barsContainer}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.barCol}>
              <SkeletonBox
                width={14}
                height={25 + ((i * 13) % 65)}
                borderRadius={7}
              />
              <SkeletonBox width={16} height={10} borderRadius={2} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ── 4. Habit Momentum Wave Chart Card ── */}
      <SkeletonCard style={styles.chartCard} borderRadius={22}>
        <View style={styles.chartHeader}>
          <View>
            <SkeletonBox width={130} height={16} borderRadius={4} />
            <SkeletonBox width={90} height={12} borderRadius={3} style={{ marginTop: 4 }} />
          </View>
          <SkeletonPill width={70} height={18} />
        </View>
        <SkeletonBox width="100%" height={90} borderRadius={12} style={{ marginTop: 8 }} />
      </SkeletonCard>

      {/* ── 5. 35-Day Discipline Grid (Heatmap Matrix) ── */}
      <SkeletonCard style={styles.chartCard} borderRadius={22}>
        <View style={styles.chartHeader}>
          <View>
            <SkeletonBox width={140} height={16} borderRadius={4} />
            <SkeletonBox width={100} height={12} borderRadius={3} style={{ marginTop: 4 }} />
          </View>
          <SkeletonPill width={60} height={18} />
        </View>

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
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 40,
  },
  heroCard: {
    marginHorizontal: CARD_MARGIN,
    padding: 18,
    marginBottom: 14,
  },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ringCenterContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  pillarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  pillarCell: {
    width: (SCREEN_WIDTH - CARD_MARGIN * 2 - 18 * 2 - 12) / 2,
  },
  pillarLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: CARD_MARGIN,
    marginBottom: 14,
  },
  statTile: {
    width: (SCREEN_WIDTH - CARD_MARGIN * 2 - 10) / 2,
    padding: 14,
  },
  statTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartCard: {
    marginHorizontal: CARD_MARGIN,
    padding: 16,
    marginBottom: 14,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  barsContainer: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  heatmapDaysHeader: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
});
