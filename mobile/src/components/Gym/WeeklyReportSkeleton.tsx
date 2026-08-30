/**
 * WeeklyReportSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for WeeklyGymReport.
 * Renders instant pulsating placeholder cards while 7-day workout analytics hydrate.
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

export default function WeeklyReportSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header Title & Date Range ─────────────────────────────────── */}
      <View style={styles.header}>
        <SkeletonPill width={90} height={24} />
        <SkeletonBox width={200} height={22} borderRadius={6} style={{ marginTop: 8 }} />
        <SkeletonBox width={150} height={13} borderRadius={4} style={{ marginTop: 5 }} />
      </View>

      {/* ── 3 Top KPI Cards (Sessions, Sets, Volume) ───────────────────────── */}
      <View style={styles.kpiRow}>
        <SkeletonCard style={styles.kpiTile}>
          <SkeletonBox width={22} height={22} borderRadius={11} />
          <SkeletonBox width={40} height={20} borderRadius={4} style={{ marginTop: 8 }} />
          <SkeletonBox width={55} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
        <SkeletonCard style={styles.kpiTile}>
          <SkeletonBox width={22} height={22} borderRadius={11} />
          <SkeletonBox width={50} height={20} borderRadius={4} style={{ marginTop: 8 }} />
          <SkeletonBox width={60} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
        <SkeletonCard style={styles.kpiTile}>
          <SkeletonBox width={22} height={22} borderRadius={11} />
          <SkeletonBox width={55} height={20} borderRadius={4} style={{ marginTop: 8 }} />
          <SkeletonBox width={65} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </SkeletonCard>
      </View>

      {/* ── Muscle Target Completion Rings Skeleton ────────────────────────── */}
      <SkeletonCard style={styles.ringsCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={160} height={16} borderRadius={4} />
          <SkeletonBox width={60} height={13} borderRadius={3} />
        </View>
        <View style={styles.ringsRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.ringCol}>
              <SkeletonCircle size={56} />
              <SkeletonBox width={40} height={10} borderRadius={3} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ── Strength Progression & Sparklines Skeleton ─────────────────────── */}
      <SkeletonCard style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={180} height={16} borderRadius={4} />
          <SkeletonBox width={70} height={13} borderRadius={3} />
        </View>
        <SkeletonBox width="100%" height={140} borderRadius={12} style={{ marginTop: 14 }} />
      </SkeletonCard>

      {/* ── Anatomical Body Map Skeleton ───────────────────────────────────── */}
      <SkeletonCard style={styles.bodyMapCard}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={150} height={16} borderRadius={4} />
          <SkeletonPill width={70} height={24} />
        </View>
        <View style={styles.bodyDualPlaceholder}>
          <SkeletonBox width="46%" height={240} borderRadius={14} />
          <SkeletonBox width="46%" height={240} borderRadius={14} />
        </View>
      </SkeletonCard>
    </ShimmerHost>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  kpiTile: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
  },
  ringsCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
  },
  ringCol: {
    alignItems: 'center',
  },
  chartCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  bodyMapCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  bodyDualPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
});
