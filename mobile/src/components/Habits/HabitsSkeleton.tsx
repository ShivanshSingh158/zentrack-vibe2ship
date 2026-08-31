/**
 * HabitsSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for HabitsScreen.
 * Renders instant pulsating placeholder cards while user habits and streak logs hydrate.
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
      {/* ── Top Header Title & Action Badge ────────────────────────────────── */}
      <View style={styles.headerRow}>
        <SkeletonBox width={100} height={24} borderRadius={6} />
        <View style={styles.headerRight}>
          <SkeletonCircle size={36} />
          <SkeletonPill width={55} height={28} />
        </View>
      </View>

      {/* ── Streak & Overview Banner ───────────────────────────────────────── */}
      <SkeletonCard style={styles.overviewCard} borderRadius={20}>
        <View style={styles.overviewInner}>
          <View style={{ flex: 1 }}>
            <SkeletonPill width={70} height={20} />
            <SkeletonBox width={140} height={22} borderRadius={5} style={{ marginTop: 8 }} />
            <SkeletonBox width={110} height={12} borderRadius={3} style={{ marginTop: 6 }} />
          </View>
          <SkeletonCircle size={52} />
        </View>
      </SkeletonCard>

      {/* ── Habits List Cards ──────────────────────────────────────────────── */}
      <View style={styles.habitsList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.habitCard} borderRadius={18}>
            {/* Top row: Icon, Name, Streak, Check button */}
            <View style={styles.habitTop}>
              <SkeletonCircle size={38} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox width="60%" height={16} borderRadius={4} />
                <SkeletonBox width="35%" height={12} borderRadius={3} style={{ marginTop: 5 }} />
              </View>
              <SkeletonCircle size={36} />
            </View>

            {/* Bottom row: 7-Day clean rolling mini week strip */}
            <View style={styles.weekStrip}>
              {Array.from({ length: 7 }).map((_, dayIdx) => (
                <View key={dayIdx} style={styles.dayCol}>
                  <SkeletonBox width={16} height={9} borderRadius={2} />
                  <SkeletonCircle size={22} style={{ marginTop: 5 }} />
                </View>
              ))}
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
    padding: 16,
    marginBottom: 16,
  },
  overviewInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  dayCol: {
    alignItems: 'center',
  },
});
