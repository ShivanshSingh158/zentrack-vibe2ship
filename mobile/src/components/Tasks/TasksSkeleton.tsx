/**
 * TasksSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Pixel-Matched Skeleton Screen for TasksScreen.
 * Renders underneath the persistent Date Strip & Progress Summary Card:
 * - "TODAY" Section Header label
 * - 6 Hairline-divided task item rows with circular checkbox, title bar, and time chip
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  ShimmerHost,
  SkeletonBox,
  SkeletonCircle,
} from '../ui/ShimmerHost';

export default function TasksSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── 1. "TODAY" Section Header Label ─────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <SkeletonBox width={52} height={11} borderRadius={2} />
      </View>

      {/* ── 2. Task Item Rows with Hairline Dividers ────────────────────────── */}
      <View style={styles.taskList}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.taskRow}>
            {/* Left Checkbox Circle */}
            <SkeletonCircle size={20} />

            {/* Middle Title & Subtext */}
            <View style={styles.taskContent}>
              <SkeletonBox
                width={i === 0 ? "75%" : (i === 1 ? "55%" : (i === 2 ? "85%" : (i === 3 ? "60%" : (i === 4 ? "70%" : "50%"))))}
                height={15}
                borderRadius={3}
              />
            </View>

            {/* Right Time Chip (on some rows) */}
            {(i === 0 || i === 2 || i === 4) && (
              <SkeletonBox width={64} height={13} borderRadius={3} style={{ marginLeft: 8 }} />
            )}
          </View>
        ))}
      </View>
    </ShimmerHost>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
  },
  taskList: {
    width: '100%',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  taskContent: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
});
