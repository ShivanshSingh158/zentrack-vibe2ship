/**
 * DashboardSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Layout-matched Skeleton Screen for DashboardScreen.
 * Renders instant pulsating placeholder cards on cold boot and tab switches.
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

export default function DashboardSkeleton() {
  return (
    <ShimmerHost style={styles.container}>
      {/* ── Top Header Row (User Avatar, Greeting, XP Pill, Settings) ──────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <SkeletonCircle size={44} />
          <View style={{ marginLeft: 12 }}>
            <SkeletonBox width={100} height={13} borderRadius={3} />
            <SkeletonBox width={140} height={20} borderRadius={5} style={{ marginTop: 5 }} />
          </View>
        </View>
        <View style={styles.headerRight}>
          <SkeletonPill width={70} height={28} />
          <SkeletonCircle size={36} />
        </View>
      </View>

      {/* ── SARA HUD Daily Briefing Card ────────────────────────────────────── */}
      <SkeletonCard style={styles.saraCard} borderRadius={20}>
        <View style={styles.saraTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SkeletonCircle size={28} />
            <SkeletonBox width={120} height={16} borderRadius={4} />
          </View>
          <SkeletonPill width={55} height={22} />
        </View>
        <SkeletonBox width="100%" height={14} borderRadius={4} style={{ marginTop: 14 }} />
        <SkeletonBox width="85%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
      </SkeletonCard>

      {/* ── Life Matrix Rings Card ─────────────────────────────────────────── */}
      <SkeletonCard style={styles.lifeWidgetCard} borderRadius={22}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={110} height={16} borderRadius={4} />
          <SkeletonBox width={50} height={13} borderRadius={3} />
        </View>

        <View style={styles.matrixRingsRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.matrixCol}>
              <SkeletonCircle size={58} />
              <SkeletonBox width={45} height={11} borderRadius={3} style={{ marginTop: 8 }} />
              <SkeletonBox width={32} height={13} borderRadius={3} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ── Agenda / Today's Focus Card ────────────────────────────────────── */}
      <SkeletonCard style={styles.agendaCard} borderRadius={20}>
        <View style={styles.cardHeaderRow}>
          <SkeletonBox width={140} height={16} borderRadius={4} />
          <SkeletonBox width={65} height={13} borderRadius={3} />
        </View>

        <View style={{ marginTop: 16, gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={styles.agendaItemRow}>
              <SkeletonBox width={20} height={20} borderRadius={6} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <SkeletonBox width={160} height={15} borderRadius={4} />
                <SkeletonBox width={85} height={11} borderRadius={3} style={{ marginTop: 4 }} />
              </View>
              <SkeletonPill width={50} height={22} />
            </View>
          ))}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saraCard: {
    padding: 16,
    marginBottom: 16,
  },
  saraTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lifeWidgetCard: {
    padding: 18,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matrixRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
  },
  matrixCol: {
    alignItems: 'center',
  },
  agendaCard: {
    padding: 18,
    marginBottom: 20,
  },
  agendaItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
});
