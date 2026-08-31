/**
 * TasksSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for TasksScreen.
 * Renders instant pulsating task rows, date strip, and progress ring.
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

export default function TasksSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header (Title + Action Buttons) ─────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <SkeletonBox width={100} height={26} borderRadius={6} />
          <SkeletonBox width={130} height={13} borderRadius={4} style={{ marginTop: 5 }} />
        </View>
        <View style={styles.headerRight}>
          <SkeletonCircle size={36} />
          <SkeletonCircle size={36} style={{ marginLeft: 8 }} />
          <SkeletonCircle size={36} style={{ marginLeft: 8 }} />
        </View>
      </View>

      {/* ── 7-Day Date Pager Strip ──────────────────────────────────────────── */}
      <View style={styles.dateStrip}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={[styles.dayCol, i === 3 && styles.dayColActive]}>
            <SkeletonBox width={14} height={11} borderRadius={3} />
            <SkeletonCircle size={28} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* ── Daily Progress Ring Summary Box ─────────────────────────────────── */}
      <SkeletonCard style={styles.progressSummaryCard} borderRadius={16}>
        <SkeletonCircle size={44} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <SkeletonBox width="60%" height={16} borderRadius={4} />
          <SkeletonBox width="40%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
        </View>
        <SkeletonPill width={55} height={24} />
      </SkeletonCard>

      {/* ── Task Checklist Cards List ──────────────────────────────────────── */}
      <View style={styles.tasksList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.taskCard} borderRadius={16}>
            <View style={styles.taskCardInner}>
              <SkeletonBox width={22} height={22} borderRadius={7} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <SkeletonBox width={i === 0 ? "80%" : (i === 1 ? "65%" : "75%")} height={16} borderRadius={4} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <SkeletonPill width={42} height={18} />
                  <SkeletonBox width={70} height={12} borderRadius={3} />
                  <SkeletonPill width={50} height={18} />
                </View>
              </View>
              <SkeletonCircle size={20} />
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
  },
  dateStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 12,
  },
  dayCol: {
    alignItems: 'center',
    width: 36,
  },
  dayColActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 4,
  },
  progressSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 14,
  },
  tasksList: {
    gap: 10,
  },
  taskCard: {
    padding: 14,
  },
  taskCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
