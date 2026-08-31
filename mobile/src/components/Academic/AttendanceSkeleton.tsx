/**
 * AttendanceSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for AttendanceScreen.
 * Exactly mirrors the real Attendance screen structure:
 * - Top header with title & 3 action buttons
 * - Semester Overview card with percentage & horizontal progress bar
 * - 7-Day Week Strip with day letters & date pills
 * - "TODAY'S CLASSES" header + "Extra class +" button
 * - Session cards with subject name, time, CLASS/LAB badge, and segmented [Present | Absent | ✕] toggle
 * - "BY SUBJECT" section with decoupled Class/Lab progress bars and Bunk math badge
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
      {/* ── 1. Top Header Row (Title + 3 Action Icons) ───────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <SkeletonBox width={140} height={26} borderRadius={6} />
          <SkeletonBox width={100} height={13} borderRadius={4} style={{ marginTop: 5 }} />
        </View>
        <View style={styles.headerActions}>
          <SkeletonCircle size={36} />
          <SkeletonCircle size={36} />
          <SkeletonCircle size={36} />
        </View>
      </View>

      {/* ── 2. Semester Overview Card (Horizontal Progress Bar Layout) ──────── */}
      <SkeletonCard style={styles.overviewCard} borderRadius={20}>
        <View style={styles.overviewHeader}>
          <SkeletonBox width={130} height={15} borderRadius={4} />
          <SkeletonBox width={85} height={14} borderRadius={4} />
        </View>
        <View style={styles.overviewProgressRow}>
          <SkeletonBox width={55} height={30} borderRadius={6} />
          <View style={styles.progressBarContainer}>
            <SkeletonBox width="100%" height={12} borderRadius={6} />
          </View>
        </View>
      </SkeletonCard>

      {/* ── 3. Swipeable 7-Day Horizontal Week Strip ───────────────────────── */}
      <View style={styles.weekStripCard}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.dayColumn}>
            <SkeletonBox width={14} height={11} borderRadius={3} />
            <SkeletonCircle size={32} style={{ marginTop: 6 }} />
            <SkeletonCircle size={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* ── 4. "TODAY'S CLASSES" Section Header ─────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <SkeletonBox width={110} height={13} borderRadius={3} />
        <SkeletonBox width={75} height={13} borderRadius={3} />
      </View>

      {/* ── 5. Session Cards with Segmented [Present | Absent | ✕] Toggles ──── */}
      <View style={styles.sessionsList}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.sessionCard} borderRadius={16}>
            {/* Left: Subject name + Time + Inline CLASS/LAB badge */}
            <View style={styles.sessionLeft}>
              <SkeletonBox width={i === 0 ? "85%" : (i === 1 ? "70%" : "80%")} height={16} borderRadius={4} />
              <View style={styles.sessionMetaRow}>
                <SkeletonBox width={80} height={12} borderRadius={3} />
                <SkeletonPill width={46} height={18} />
              </View>
            </View>

            {/* Right: Segmented 3-Button Toggle [Present | Absent | Cancel] */}
            <View style={styles.segmentedToggle}>
              <SkeletonBox width={52} height={28} borderRadius={14} />
              <SkeletonBox width={52} height={28} borderRadius={14} style={{ marginLeft: 3 }} />
              <SkeletonCircle size={28} style={{ marginLeft: 3 }} />
            </View>
          </SkeletonCard>
        ))}
      </View>

      {/* ── 6. "BY SUBJECT" Section Header ─────────────────────────────────── */}
      <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
        <SkeletonBox width={90} height={13} borderRadius={3} />
        <SkeletonBox width={45} height={13} borderRadius={3} />
      </View>

      {/* ── 7. By-Subject Summary Cards (Decoupled Class/Lab + Bunk Badge) ──── */}
      <View style={styles.bySubjectList}>
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} style={styles.bySubjectCard} borderRadius={16}>
            {/* Top row: Subject name & Overall percentage */}
            <View style={styles.bySubjectTop}>
              <SkeletonBox width={i === 0 ? "65%" : "55%"} height={16} borderRadius={4} />
              <SkeletonBox width={40} height={16} borderRadius={4} />
            </View>

            {/* Class progress bar */}
            <View style={styles.trackRow}>
              <SkeletonBox width={36} height={12} borderRadius={3} />
              <View style={{ flex: 1 }}>
                <SkeletonBox width="100%" height={8} borderRadius={4} />
              </View>
            </View>

            {/* Lab progress bar */}
            <View style={styles.trackRow}>
              <SkeletonBox width={36} height={12} borderRadius={3} />
              <View style={{ flex: 1 }}>
                <SkeletonBox width="100%" height={8} borderRadius={4} />
              </View>
            </View>

            {/* Bunk Math Recommendation Pill Badge */}
            <View style={styles.bunkBadgeRow}>
              <SkeletonPill width={170} height={22} />
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
    marginBottom: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewCard: {
    padding: 16,
    marginBottom: 12,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  overviewProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  progressBarContainer: {
    flex: 1,
  },
  weekStripCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 14,
  },
  dayColumn: {
    alignItems: 'center',
    width: 36,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  sessionsList: {
    gap: 10,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  sessionLeft: {
    flex: 1,
    marginRight: 10,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  segmentedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  bySubjectList: {
    gap: 12,
  },
  bySubjectCard: {
    padding: 14,
  },
  bySubjectTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bunkBadgeRow: {
    marginTop: 4,
  },
});

