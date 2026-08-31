/**
 * GymHomeSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for GymHomeScreen.
 * Exactly mirrors the real ZenGym Home screen structure:
 * - Top header with title & action buttons (AI Coach, Settings, Profile)
 * - 7-Day Calendar Strip with left/right chevrons, day letters, and day number capsules
 * - START WORKOUT hero banner / Active workout timer banner
 * - "EXERCISES" section header
 * - Draggable exercise rows with checkbox circles, exercise titles, sets/reps subtitles, and history/menu icon buttons
 * - "CARDIO" section header and cardio activity rows
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
      {/* ── 1. Top Header Row (Greeting + AI Coach FAB + Profile) ─────────────── */}
      <View style={styles.topHeaderRow}>
        <View>
          <SkeletonBox width={110} height={26} borderRadius={6} />
          <SkeletonBox width={140} height={13} borderRadius={4} style={{ marginTop: 5 }} />
        </View>
        <View style={styles.topHeaderRight}>
          <SkeletonPill width={70} height={32} />
          <SkeletonCircle size={36} />
          <SkeletonCircle size={36} />
        </View>
      </View>

      {/* ── 2. 7-Day Calendar Strip with Nav Chevrons ────────────────────────── */}
      <View style={styles.weekStrip}>
        <SkeletonCircle size={24} />
        <View style={styles.weekDaysRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.dayCol}>
              <SkeletonBox width={12} height={11} borderRadius={3} />
              <View style={[styles.dayPillPlaceholder, i === 3 && styles.dayPillActive]}>
                <SkeletonBox width={16} height={14} borderRadius={3} />
              </View>
            </View>
          ))}
        </View>
        <SkeletonCircle size={24} />
      </View>

      {/* ── 3. Main START WORKOUT Hero Action Banner ─────────────────────────── */}
      <View style={styles.bannerSection}>
        <SkeletonBox width="100%" height={50} borderRadius={14} />
      </View>

      {/* ── 4. "EXERCISES" Section Header ───────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <SkeletonBox width={85} height={13} borderRadius={3} />
      </View>

      {/* ── 5. Exercise Rows with Checkbox Circles & Action Buttons ─────────── */}
      <View style={styles.exercisesList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.exerciseRow} borderRadius={14}>
            {/* Left Checkbox Circle */}
            <SkeletonCircle size={22} />

            {/* Middle Title & Sets/Reps Subtitle */}
            <View style={styles.exerciseTextCol}>
              <View style={styles.exerciseTitleRow}>
                <SkeletonBox width={i === 0 ? "75%" : (i === 1 ? "60%" : (i === 2 ? "85%" : "70%"))} height={16} borderRadius={4} />
                {i === 1 && <SkeletonPill width={58} height={18} />}
              </View>
              <SkeletonBox width="50%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
            </View>

            {/* Right Action Icons (History Clock + 3-Dot Menu) */}
            <View style={styles.exerciseActions}>
              <SkeletonCircle size={22} />
              <SkeletonCircle size={22} />
            </View>
          </SkeletonCard>
        ))}
      </View>

      {/* ── 6. "CARDIO" Section Header ───────────────────────────────────────── */}
      <View style={[styles.sectionHeader, { marginTop: 22 }]}>
        <SkeletonBox width={65} height={13} borderRadius={3} />
      </View>

      {/* ── 7. Cardio Activity Row ──────────────────────────────────────────── */}
      <SkeletonCard style={styles.exerciseRow} borderRadius={14}>
        <SkeletonCircle size={22} />
        <View style={styles.exerciseTextCol}>
          <SkeletonBox width="50%" height={16} borderRadius={4} />
          <SkeletonBox width="40%" height={12} borderRadius={3} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.exerciseActions}>
          <SkeletonCircle size={22} />
        </View>
      </SkeletonCard>
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
    marginBottom: 14,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 14,
  },
  weekDaysRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
    marginHorizontal: 6,
  },
  dayCol: {
    alignItems: 'center',
  },
  dayPillPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  dayPillActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.3)',
  },
  bannerSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  exercisesList: {
    gap: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  exerciseTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

