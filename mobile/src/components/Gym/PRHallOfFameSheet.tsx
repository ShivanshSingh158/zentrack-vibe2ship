/**
 * PRHallOfFameSheet — ZenTrack Mobile
 *
 * Shows all personal records sorted by date achieved (newest first).
 * Each row: exercise name, best estimated 1RM, heaviest set (weight x reps), date.
 */
import React, { useEffect, useState, useMemo } from "react";
import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAllPRs, PRRecord } from "../../services/progressiveOverload";
import { SPACE } from "../../theme/tokens";
import { useTheme } from "../../contexts/ThemeContext";
import BottomSheet from "../ui/BottomSheet";

// Extracted Subcomponents & Styles
import { makePRHallOfFameStyles } from "./prHallOfFameStyles";
import PRExerciseRow, { PREntry } from "./PRExerciseRow";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PRHallOfFameSheet({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makePRHallOfFameStyles(colors, isDark), [colors, isDark]);
  const [prs, setPRs] = useState<PRRecord>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      getAllPRs().then(data => {
        setPRs(data);
        setLoading(false);
      });
    }
  }, [visible]);

  const entries: PREntry[] = useMemo(() => {
    return Object.entries(prs)
      .map(([name, pr]) => ({ name, ...pr }))
      .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));
  }, [prs]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={s.title}>🏆 PR Hall of Fame</Text>
      <Text style={s.subtitle}>Your all-time personal records</Text>

      {loading ? (
        <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: SPACE.xl }} />
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
            <PRExerciseRow item={item} index={index} styles={s} colors={colors} />
          )}
        />
      )}
    </BottomSheet>
  );
}
