/**
 * GymHomeSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Pixel-Matched Skeleton Screen for GymHomeScreen.
 * Perfectly mirrors the exact layout geometry, spacing, and component heights:
 * - 7-Day Calendar Strip with left/right nav chevrons, day letters, and day number circle pills
 * - Workout Banner (Hero card with title, duration/streak subtitle, and action pill)
 * - "EXERCISES" section header
 * - 5 Draggable Exercise rows with checkbox circle, title & sets/reps bars, and clock/menu icons
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
      {/* ── 1. 7-Day Calendar Strip (M T W T F S S) ─────────────────────────── */}
      <View style={styles.weekStrip}>
        <SkeletonCircle size={16} />
        <View style={styles.weekDaysContainer}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.dayCol}>
              <SkeletonBox width={10} height={10} borderRadius={2} style={{ marginBottom: 3 }} />
              <View style={[styles.dayPill, i === 1 && styles.dayPillActive]}>
                <SkeletonBox width={14} height={14} borderRadius={3} />
              </View>
            </View>
          ))}
        </View>
        <SkeletonCircle size={16} />
      </View>

      {/* ── 2. Workout Action / Status Hero Banner ──────────────────────────── */}
      <View style={styles.workoutSection}>
        <SkeletonCard style={styles.bannerCard} borderRadius={16}>
          <View style={styles.bannerLeft}>
            <SkeletonBox width={140} height={16} borderRadius={4} />
            <SkeletonBox width={90} height={12} borderRadius={3} style={{ marginTop: 5 }} />
          </View>
          <SkeletonPill width={80} height={34} />
        </SkeletonCard>
      </View>

      {/* ── 3. "EXERCISES" Section Label ────────────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <SkeletonBox width={75} height={11} borderRadius={3} />
      </View>

      {/* ── 4. Exercise Rows (Checkbox + Title/Subtitle + Clock/Menu) ────────── */}
      <View style={styles.exercisesSection}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.exerciseRow} borderRadius={16}>
            {/* Left Checkbox Circle */}
            <SkeletonCircle size={20} />

            {/* Title & Sets/Reps Subtitle */}
            <View style={styles.exerciseTextCol}>
              <SkeletonBox
                width={i === 0 ? "70%" : (i === 1 ? "85%" : (i === 2 ? "60%" : (i === 3 ? "75%" : "65%")))}
                height={15}
                borderRadius={4}
              />
              <SkeletonBox width="45%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
            </View>

            {/* Right Action Icons (Clock + 3-Dot Menu) */}
            <View style={styles.exerciseActions}>
              <SkeletonCircle size={18} />
              <SkeletonCircle size={18} />
            </View>
          </SkeletonCard>
        ))}
      </View>
    </ShimmerHost>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 40,
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 8,
  },
  weekDaysContainer: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  dayCol: {
    alignItems: 'center',
    gap: 2,
  },
  dayPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.16)',
  },
  workoutSection: {
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    height: 68,
  },
  bannerLeft: {
    gap: 2,
  },
  sectionHeaderRow: {
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 10,
  },
  exercisesSection: {
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  exerciseTextCol: {
    flex: 1,
    marginLeft: 16,
    marginRight: 12,
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
