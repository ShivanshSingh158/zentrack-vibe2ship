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
      {/* ── Top Header (Title, Date, Progress Ring, Add Button) ─────────────── */}
      <View style={styles.headerRow}>
        <View>
          <SkeletonBox width={90} height={24} borderRadius={6} />
          <SkeletonBox width={140} height={14} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.headerRight}>
          <SkeletonCircle size={44} />
          <SkeletonCircle size={38} style={{ marginLeft: 10 }} />
        </View>
      </View>

      {/* ── 7-Day Date Pager Strip ──────────────────────────────────────────── */}
      <View style={styles.dateStrip}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.dayCol}>
            <SkeletonBox width={20} height={10} borderRadius={3} />
            <SkeletonCircle size={32} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* ── View Mode Filter Pills (List, Timeline, Matrix) ────────────────── */}
      <View style={styles.filterRow}>
        <SkeletonPill width={70} height={30} />
        <SkeletonPill width={85} height={30} />
        <SkeletonPill width={75} height={30} />
      </View>

      {/* ── Task Checklist Cards List ──────────────────────────────────────── */}
      <View style={styles.tasksList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.taskCard} borderRadius={16}>
            <View style={styles.taskCardInner}>
              <SkeletonBox width={22} height={22} borderRadius={7} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <SkeletonBox width="80%" height={16} borderRadius={4} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <SkeletonPill width={55} height={18} />
                  <SkeletonBox width={60} height={12} borderRadius={3} />
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
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    marginBottom: 16,
  },
  dayCol: {
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
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
