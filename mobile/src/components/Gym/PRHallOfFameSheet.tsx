/**
 * PRHallOfFameSheet — ZenTrack Mobile
 *
 * Shows all personal records sorted by date achieved (newest first).
 * Each row: exercise name, best estimated 1RM, heaviest set (weight x reps), date.
 */

import React, { useEffect, useState } from "react";
import { formatDateShort } from '../../utils/dateUtils';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { getAllPRs, PRRecord } from "../../services/progressiveOverload";
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from "../../theme/tokens";
import { useTheme } from "../../contexts/ThemeContext";
import BottomSheet from "../ui/BottomSheet";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PRHallOfFameSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [prs, setPRs] = useState<PRRecord>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      getAllPRs().then(data => { setPRs(data); setLoading(false); });
    }
  }, [visible]);

  const entries = Object.entries(prs)
    .map(([name, pr]) => ({ name, ...pr }))
    .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));

  const s = makeStyles(colors);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={s.title}>🏆 PR Hall of Fame</Text>
      <Text style={s.subtitle}>Your all-time personal records</Text>

      {loading ? (
        <ActivityIndicator color="#a599ff" style={{ marginTop: SPACE.xl }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
          <Text style={s.emptyText}>No PRs yet</Text>
          <Text style={s.emptyHint}>Complete sets to start tracking personal records</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.name}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACE.sm, paddingBottom: 32 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 30).duration(200)}>
              <View style={[s.row, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={s.rankBadge}>
                  <Text style={s.rankText}>{index + 1}</Text>
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.exerciseName, { color: colors.textPrimary }]}>
                    {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
                  </Text>
                  <View style={s.rowDetails}>
                    <View style={s.chip}>
                      <Ionicons name="trophy-outline" size={11} color="#f59e0b" />
                      <Text style={s.chip1RM}>{item.best1RM} kg 1RM</Text>
                    </View>
                    <Text style={[s.detail, { color: colors.textMuted }]}>
                      {item.heaviestWeight} kg × {item.bestReps}
                    </Text>
                  </View>
                </View>
                <Text style={[s.date, { color: colors.textMuted }]}>
                  {item.achievedAt ? formatDateShort(item.achievedAt) : "—"}
                </Text>
              </View>
            </Animated.View>
          )}
        />
      )}
    </BottomSheet>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  title: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, color: colors.textPrimary, marginBottom: 2 },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginBottom: SPACE.lg },
  empty: { alignItems: "center", paddingVertical: SPACE.xxl, gap: SPACE.sm },
  emptyText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textSecondary },
  emptyHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
  },
  rankBadge: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: "#f59e0b22",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: "#f59e0b" },
  rowBody: { flex: 1, gap: 4 },
  exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm },
  rowDetails: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#f59e0b18", paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  chip1RM: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: "#f59e0b" },
  detail: { fontFamily: FONT_FAMILY.body, fontSize: 11 },
  date: { fontFamily: FONT_FAMILY.body, fontSize: 11 },
});
