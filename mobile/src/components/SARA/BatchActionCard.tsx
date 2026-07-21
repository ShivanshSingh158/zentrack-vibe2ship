/**
 * BatchActionCard.tsx - ZenTrack Mobile
 *
 * Multi-action confirmation card for Sara batch operations.
 * Parses [[BATCH_ACTIONS:[{...},{...}]]] from Sara response.
 * Each action is individually checkable before confirming all.
 */
import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from "../../theme/tokens";
import { useTheme } from "../../contexts/ThemeContext";

export interface BatchAction {
  type: string;
  label: string;       // human-readable e.g. "Create task: Study Math"
  icon?: string;       // ionicon name
  data: Record<string, any>;
}

interface BatchActionCardProps {
  actions: BatchAction[];
  onConfirmAll: (selected: BatchAction[]) => void;
  onDismiss: () => void;
}

function ActionRow({ action, checked, onToggle }: {
  action: BatchAction;
  checked: boolean;
  onToggle: () => void;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const typeColorMap: Record<string, string> = {
    createTask: colors.accentPrimary,
    createNote: colors.accentBlue,
    addCalendarEvent: colors.accentAmber,
    logHabit: colors.accentGreen,
    markAttendance: colors.accentGreen,
  };
  const color = typeColorMap[action.type] || colors.textMuted;

  return (
    <TouchableOpacity style={styles.actionRow} onPress={onToggle} activeOpacity={0.8}>
      <View style={[styles.checkbox, checked && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }]}>
        {checked && <Ionicons name="checkmark" size={12} color="#000" />}
      </View>
      <View style={[styles.actionIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={(action.icon || "flash-outline") as any} size={14} color={color} />
      </View>
      <Text style={[styles.actionLabel, !checked && { opacity: 0.5 }]} numberOfLines={2}>{action.label}</Text>
    </TouchableOpacity>
  );
}

export default function BatchActionCard({ actions, onConfirmAll, onDismiss }: BatchActionCardProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [checked, setChecked] = useState<boolean[]>(actions.map(() => true));
  const [confirmed, setConfirmed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const toggleItem = (i: number) => {
    Haptics.selectionAsync();
    setChecked(prev => prev.map((v, idx) => idx === i ? !v : v));
  };

  const selectedCount = checked.filter(Boolean).length;

  const handleConfirm = () => {
    if (selectedCount === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setConfirmed(true);
      onConfirmAll(actions.filter((_, i) => checked[i]));
    });
  };

  if (confirmed) {
    return (
      <View style={styles.confirmedPill}>
        <Ionicons name="checkmark-circle" size={16} color={colors.accentGreen} />
        <Text style={styles.confirmedText}>{selectedCount} action{selectedCount > 1 ? "s" : ""} queued</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }], opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={styles.headerOrb}>
            <Ionicons name="flash" size={13} color={colors.accentPrimary} />
          </View>
          <Text style={styles.headerTitle}>Batch Actions ({actions.length})</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Action list */}
      <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
        {actions.map((action, i) => (
          <ActionRow key={i} action={action} checked={checked[i]} onToggle={() => toggleItem(i)} />
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
          <Text style={styles.dismissText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, selectedCount === 0 && { opacity: 0.4 }]}
          onPress={handleConfirm}
          activeOpacity={0.8}
          disabled={selectedCount === 0}
        >
          <Text style={styles.confirmText}>Confirm {selectedCount > 0 ? selectedCount : ""}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function parseBatchActions(text: string): { cleanText: string; batchActions: BatchAction[] | null } {
  const match = text.match(/\[\[BATCH_ACTIONS:([\s\S]*?)\]\]/);
  if (!match) return { cleanText: text.trim(), batchActions: null };
  try {
    const arr = JSON.parse(match[1].trim());
    if (!Array.isArray(arr) || arr.length === 0) return { cleanText: text.replace(match[0], "").trim(), batchActions: null };
    const actions: BatchAction[] = arr.map((a: any) => ({
      type: a.type || "unknown",
      label: a.label || a.title || JSON.stringify(a),
      icon: a.icon || iconForType(a.type),
      data: a,
    }));
    return { cleanText: text.replace(match[0], "").trim(), batchActions: actions };
  } catch {
    return { cleanText: text.replace(match[0], "").trim(), batchActions: null };
  }
}

function iconForType(type: string): string {
  const map: Record<string, string> = {
    createTask: "checkmark-circle-outline",
    addCalendarEvent: "calendar-outline",
    createNote: "document-text-outline",
    logHabit: "flame-outline",
    markAttendance: "school-outline",
  };
  return map[type] || "flash-outline";
}

const makeStyles = (colors: any) => StyleSheet.create({
      container: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: "rgba(165,153,255,0.25)",
        marginVertical: SPACE.sm,
        overflow: "hidden",
      },
      header: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
        borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
      },
      headerOrb: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: "rgba(165,153,255,0.18)",
        alignItems: "center", justifyContent: "center",
      },
      headerTitle: {
        fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textPrimary,
      },
      actionRow: {
        flexDirection: "row", alignItems: "center", gap: SPACE.sm,
        paddingHorizontal: SPACE.lg, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
      },
      checkbox: {
        width: 18, height: 18, borderRadius: 5,
        borderWidth: 1.5, borderColor: colors.textTertiary,
        alignItems: "center", justifyContent: "center",
      },
      actionIcon: {
        width: 26, height: 26, borderRadius: 7,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      },
      actionLabel: {
        flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textSecondary,
      },
      footer: {
        flexDirection: "row", gap: SPACE.sm,
        paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
        borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
      },
      dismissBtn: {
        flex: 1, paddingVertical: SPACE.sm, borderRadius: RADIUS.full,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
        alignItems: "center",
      },
      dismissText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      confirmBtn: {
        flex: 1.5, paddingVertical: SPACE.sm, borderRadius: RADIUS.full,
        backgroundColor: colors.accentPrimary, alignItems: "center",
      },
      confirmText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: "#000" },
      confirmedPill: {
        flexDirection: "row", alignItems: "center", gap: SPACE.sm,
        backgroundColor: "rgba(94,218,158,0.1)",
        paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm,
        borderRadius: RADIUS.full, alignSelf: "flex-start",
        borderWidth: 1, borderColor: "rgba(94,218,158,0.2)",
        marginVertical: SPACE.sm,
      },
      confirmedText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.accentGreen },
    });
