/**
 * GymHomeSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for GymHomeScreen.
 * Renders instant pulsating placeholder cards while active split routines and calendar logs hydrate.
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

export default function GymHomeSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header Row (Greeting + AI Coach FAB + Streak) ──────────────── */}
      <View style={styles.topHeaderRow}>
        <View>
          <SkeletonBox width={120} height={20} borderRadius={5} />
          <SkeletonBox width={170} height={14} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.topHeaderRight}>
          <SkeletonPill width={60} height={28} />
          <SkeletonCircle size={36} />
        </View>
      </View>

      {/* ── 7-Day Calendar Strip ───────────────────────────────────────────── */}
      <View style={styles.weekStrip}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.dayCol}>
            <SkeletonBox width={22} height={11} borderRadius={3} />
            <SkeletonCircle size={32} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* ── Main Active Workout Hero Banner ─────────────────────────────────── */}
      <SkeletonCard style={styles.heroCard} borderRadius={22}>
        <View style={styles.heroTop}>
          <SkeletonPill width={80} height={22} />
          <SkeletonBox width={60} height={14} borderRadius={4} />
        </View>
        <SkeletonBox width={200} height={24} borderRadius={6} style={{ marginTop: 12 }} />
        <SkeletonBox width={150} height={13} borderRadius={4} style={{ marginTop: 6 }} />

        {/* Muscle Focus Tags */}
        <View style={styles.tagsRow}>
          <SkeletonPill width={60} height={24} />
          <SkeletonPill width={70} height={24} />
          <SkeletonPill width={55} height={24} />
        </View>

        {/* Big Start Button */}
        <SkeletonBox width="100%" height={46} borderRadius={14} style={{ marginTop: 16 }} />
      </SkeletonCard>

      {/* ── Quick Action Pills Row ─────────────────────────────────────────── */}
      <View style={styles.quickPillsRow}>
        <SkeletonPill width={95} height={34} />
        <SkeletonPill width={90} height={34} />
        <SkeletonPill width={105} height={34} />
      </View>

      {/* ── Exercise Rows List Skeleton ────────────────────────────────────── */}
      <View style={styles.exercisesList}>
        <View style={styles.sectionHeader}>
          <SkeletonBox width={140} height={16} borderRadius={4} />
          <SkeletonBox width={60} height={14} borderRadius={4} />
        </View>

        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.exerciseCard} borderRadius={16}>
            <View style={styles.exerciseHeader}>
              <SkeletonBox width={40} height={40} borderRadius={10} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox width={160} height={16} borderRadius={4} />
                <SkeletonBox width={90} height={12} borderRadius={3} style={{ marginTop: 5 }} />
              </View>
              <SkeletonCircle size={24} />
            </View>
            <View style={{ marginTop: 12, gap: 8 }}>
              <SkeletonBox width="100%" height={32} borderRadius={8} />
              <SkeletonBox width="100%" height={32} borderRadius={8} />
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
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  heroCard: {
    padding: 18,
    marginBottom: 16,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  quickPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  exercisesList: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exerciseCard: {
    padding: 14,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
