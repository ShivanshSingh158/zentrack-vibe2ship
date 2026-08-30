/**
 * GymProgressSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for GymProgressScreen.
 * Renders instant pulsating placeholder cards while historical workout logs hydrate.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  ShimmerHost,
  SkeletonBox,
  SkeletonCard,
  SkeletonPill,
} from '../ui/ShimmerHost';

export default function GymProgressSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header Title & Subtitle ───────────────────────────────────── */}
      <View style={styles.header}>
        <SkeletonBox width={140} height={24} borderRadius={6} />
        <SkeletonBox width={210} height={13} borderRadius={4} style={{ marginTop: 6 }} />
      </View>

      {/* ── Time Filter Capsule Bar ────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <SkeletonPill width={54} height={32} />
        <SkeletonPill width={54} height={32} />
        <SkeletonPill width={54} height={32} />
        <SkeletonPill width={54} height={32} />
        <SkeletonPill width={54} height={32} />
      </View>

      {/* ── 4 Top KPI Metric Tiles ────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={24} height={24} borderRadius={12} />
            <SkeletonBox width={50} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={65} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={24} height={24} borderRadius={12} />
            <SkeletonBox width={60} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={70} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
        </View>

        <View style={styles.kpiRow}>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={24} height={24} borderRadius={12} />
            <SkeletonBox width={45} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={60} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
          <SkeletonCard style={styles.kpiTile}>
            <SkeletonBox width={24} height={24} borderRadius={12} />
            <SkeletonBox width={55} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            <SkeletonBox width={65} height={11} borderRadius={3} style={{ marginTop: 4 }} />
          </SkeletonCard>
        </View>
      </View>

      {/* ── Volume Progression Area Chart Placeholder ───────────────────────── */}
      <SkeletonCard style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={150} height={18} borderRadius={5} />
          <SkeletonBox width={70} height={14} borderRadius={4} />
        </View>
        <SkeletonBox width="100%" height={160} borderRadius={12} style={{ marginTop: 16 }} />
      </SkeletonCard>

      {/* ── Anatomical Body Map Placeholder ─────────────────────────────────── */}
      <SkeletonCard style={styles.bodyMapCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={170} height={18} borderRadius={5} />
          <SkeletonBox width={80} height={26} borderRadius={8} />
        </View>
        <View style={styles.bodyDualPlaceholder}>
          <SkeletonBox width="46%" height={260} borderRadius={14} />
          <SkeletonBox width="46%" height={260} borderRadius={14} />
        </View>
        <SkeletonBox width="100%" height={24} borderRadius={6} style={{ marginTop: 12 }} />
      </SkeletonCard>

      {/* ── Hypertrophy Volume Bars Placeholder ─────────────────────────────── */}
      <SkeletonCard style={styles.hypertrophyCard}>
        <SkeletonBox width={180} height={18} borderRadius={5} />
        <View style={{ marginTop: 14, gap: 10 }}>
          <SkeletonBox width="100%" height={28} borderRadius={8} />
          <SkeletonBox width="100%" height={28} borderRadius={8} />
          <SkeletonBox width="100%" height={28} borderRadius={8} />
          <SkeletonBox width="100%" height={28} borderRadius={8} />
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
  header: {
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiGrid: {
    gap: 10,
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bodyMapCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  bodyDualPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  hypertrophyCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
});
