/**
 * AnalyticsSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for AnalyticsScreen.
 * Renders instant pulsating placeholder cards while historical multi-domain analytics hydrate.
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
      {/* ── Top Header Title & Period Filter Pills ─────────────────────────── */}
      <View style={styles.headerRow}>
        <SkeletonBox width={120} height={24} borderRadius={6} />
        <View style={styles.filterRow}>
          <SkeletonPill width={58} height={28} />
          <SkeletonPill width={64} height={28} />
          <SkeletonPill width={76} height={28} />
        </View>
      </View>

      {/* ── Main Discipline & Overall Performance Score Card ───────────────── */}
      <SkeletonCard style={styles.scoreCard} borderRadius={22}>
        <View style={styles.scoreCardInner}>
          <View style={{ flex: 1 }}>
            <SkeletonPill width={85} height={22} />
            <SkeletonBox width={110} height={32} borderRadius={6} style={{ marginTop: 10 }} />
            <SkeletonBox width={160} height={13} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <SkeletonCircle size={76} />
        </View>
      </SkeletonCard>

      {/* ── 4 KPI Mini Tiles ───────────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={20} height={20} borderRadius={10} />
            <SkeletonBox width={45} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={60} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={20} height={20} borderRadius={10} />
            <SkeletonBox width={55} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={70} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
        </View>
      </View>

      {/* ── Productivity Progression Area Chart Card ───────────────────────── */}
      <SkeletonCard style={styles.chartCard} borderRadius={20}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={140} height={16} borderRadius={4} />
          <SkeletonBox width={60} height={13} borderRadius={3} />
        </View>
        <SkeletonBox width="100%" height={120} borderRadius={12} style={{ marginTop: 16 }} />
      </SkeletonCard>

      {/* ── Multi-Domain Time & Effort Breakdown ────────────────────────────── */}
      <SkeletonCard style={styles.breakdownCard} borderRadius={20}>
        <SkeletonBox width={150} height={16} borderRadius={4} />
        <View style={{ marginTop: 16, gap: 10 }}>
          <SkeletonBox width="100%" height={24} borderRadius={6} />
          <SkeletonBox width="100%" height={24} borderRadius={6} />
          <SkeletonBox width="100%" height={24} borderRadius={6} />
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
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  scoreCard: {
    padding: 18,
    marginBottom: 16,
  },
  scoreCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiGrid: {
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiTile: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
  },
  chartCard: {
    padding: 18,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownCard: {
    padding: 18,
    marginBottom: 20,
  },
});
