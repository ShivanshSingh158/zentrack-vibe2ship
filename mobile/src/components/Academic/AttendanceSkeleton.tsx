/**
 * AttendanceSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for AttendanceScreen.
 * Renders instant pulsating placeholder cards while semester subjects and attendance logs hydrate.
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

export default function AttendanceSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header Row ─────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <SkeletonBox width={130} height={24} borderRadius={6} />
          <SkeletonBox width={180} height={14} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.headerRight}>
          <SkeletonPill width={60} height={28} />
          <SkeletonCircle size={36} />
        </View>
      </View>

      {/* ── Global Overall Attendance KPI Card with Progress Ring ──────────── */}
      <SkeletonCard style={styles.overviewCard} borderRadius={20}>
        <View style={styles.overviewInner}>
          <View style={{ flex: 1 }}>
            <SkeletonPill width={80} height={22} />
            <SkeletonBox width={120} height={26} borderRadius={6} style={{ marginTop: 10 }} />
            <SkeletonBox width={160} height={13} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <SkeletonCircle size={70} />
        </View>
      </SkeletonCard>

      {/* ── 7-Day Horizontal Week Strip ────────────────────────────────────── */}
      <View style={styles.weekStrip}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.dayCol}>
            <SkeletonBox width={22} height={11} borderRadius={3} />
            <SkeletonCircle size={34} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* ── Today's Scheduled Classes List ─────────────────────────────────── */}
      <View style={styles.classesList}>
        <View style={styles.sectionHeader}>
          <SkeletonBox width={130} height={14} borderRadius={4} />
          <SkeletonBox width={75} height={14} borderRadius={4} />
        </View>

        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.classCard} borderRadius={16}>
            <View style={styles.classTop}>
              <View style={{ flex: 1 }}>
                <SkeletonBox width="70%" height={16} borderRadius={4} />
                <SkeletonBox width="45%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
              </View>
              <SkeletonPill width={65} height={24} />
            </View>
            <View style={styles.classActions}>
              <SkeletonBox width="30%" height={32} borderRadius={8} />
              <SkeletonBox width="30%" height={32} borderRadius={8} />
              <SkeletonBox width="30%" height={32} borderRadius={8} />
            </View>
          </SkeletonCard>
        ))}
      </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewCard: {
    padding: 18,
    marginBottom: 16,
  },
  overviewInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    marginBottom: 16,
  },
  dayCol: {
    alignItems: 'center',
  },
  classesList: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  classCard: {
    padding: 14,
  },
  classTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  classActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
});
