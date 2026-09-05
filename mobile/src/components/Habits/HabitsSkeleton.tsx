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
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.habitCard} borderRadius={18}>
            {/* Top row: Icon, Name, Streak, Check button */}
            <View style={styles.habitTop}>
              <SkeletonCircle size={36} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox
                  width={i === 0 ? "65%" : (i === 1 ? "80%" : (i === 2 ? "50%" : "70%"))}
                  height={15}
                  borderRadius={4}
                />
                <SkeletonBox width="35%" height={11} borderRadius={3} style={{ marginTop: 4 }} />
              </View>
              <SkeletonCircle size={34} />
            </View>

            {/* Bottom row: Compact Contribution Heatmap Tray Skeleton */}
            <View style={styles.matrixStrip}>
              <View style={styles.matrixGrid}>
                {Array.from({ length: 18 }).map((_, colIdx) => (
                  <View key={colIdx} style={styles.matrixCol}>
                    {Array.from({ length: 7 }).map((_, rowIdx) => (
                      <SkeletonBox key={rowIdx} width={10} height={10} borderRadius={2.5} />
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.matrixFooter}>
                <SkeletonBox width="30%" height={8} borderRadius={2} />
                <SkeletonBox width="15%" height={8} borderRadius={2} />
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
    gap: 10,
  },
  habitCard: {
    padding: 13,
  },
  habitTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matrixStrip: {
    marginTop: 8,
    padding: 8,
    paddingBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  matrixGrid: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 2.5,
  },
  matrixCol: {
    flexDirection: 'column',
    gap: 2.5,
  },
  matrixFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 2,
  },
});
