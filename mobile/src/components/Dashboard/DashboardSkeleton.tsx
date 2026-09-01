/**
 * DashboardSkeleton.tsx — ZenTrack Mobile
 *
 * 1:1 Pixel-Matched Skeleton Screen for DashboardScreen.
 * Perfectly mirrors the widgets structure underneath the persistent greeting bar:
 * - Quote / Active Recall banner placeholder
 * - Life Matrix 4-Ring Widget Card
 * - Today's Agenda Focus Card with checklist rows
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
      {/* ── 1. Quote / Active Recall Banner Placeholder ─────────────────────── */}
      <View style={{ marginTop: 2, marginBottom: 12 }}>
        <SkeletonBox width="85%" height={15} borderRadius={4} />
        <SkeletonBox width="40%" height={12} borderRadius={3} style={{ marginTop: 5 }} />
      </View>

      {/* ── 2. Life Matrix 4-Ring Widget Card ───────────────────────────────── */}
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

      {/* ── 3. Agenda / Today's Focus Card ──────────────────────────────────── */}
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
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 40,
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
