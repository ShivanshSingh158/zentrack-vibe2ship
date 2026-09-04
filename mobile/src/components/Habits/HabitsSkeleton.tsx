/**
 * HabitsSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Pixel-Matched Skeleton Screen for HabitsScreen.
 * Perfectly mirrors the HabitCard list underneath the sticky header:
 * - 5 Habit Cards with Icon, Title, Streak pill, Action Toggle Circle, and 7-Day clean rolling mini week dots
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

export default function HabitsSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Habits List Cards ──────────────────────────────────────────────── */}
      <View style={styles.habitsList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.habitCard} borderRadius={18}>
            {/* Top row: Icon, Name, Streak, Check button */}
            <View style={styles.habitTop}>
              <SkeletonCircle size={38} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox
                  width={i === 0 ? "65%" : (i === 1 ? "80%" : (i === 2 ? "50%" : (i === 3 ? "75%" : "60%")))}
                  height={16}
                  borderRadius={4}
                />
                <SkeletonBox width="35%" height={12} borderRadius={3} style={{ marginTop: 5 }} />
              </View>
              <SkeletonCircle size={36} />
            </View>

            {/* Bottom row: 5-Week (35-Day) GitHub-Style Matrix Skeleton */}
            <View style={styles.matrixStrip}>
              <View style={styles.matrixGrid}>
                {Array.from({ length: 5 }).map((_, colIdx) => (
                  <View key={colIdx} style={styles.matrixCol}>
                    {Array.from({ length: 7 }).map((_, rowIdx) => (
                      <SkeletonBox key={rowIdx} width={15} height={15} borderRadius={3.5} />
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.matrixFooter}>
                <SkeletonBox width="35%" height={10} borderRadius={2} />
                <SkeletonBox width="20%" height={10} borderRadius={2} />
              </View>
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
  habitsList: {
    gap: 12,
  },
  habitCard: {
    padding: 16,
  },
  habitTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matrixStrip: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  matrixGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  matrixCol: {
    flexDirection: 'column',
    gap: 4,
  },
  matrixFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 2,
  },
});
