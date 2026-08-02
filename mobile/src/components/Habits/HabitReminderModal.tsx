/**
 * HabitReminderModal.tsx — ZenTrack Mobile
 *
 * Per-habit notification reminder settings, modelled after GymNotificationModal.
 * Each habit gets its own toggle + time picker. Settings are persisted to
 * AsyncStorage under:
 *   @habit_notif_enabled_{habitId}  → "true" | "false"
 *   @habit_notif_time_{habitId}     → "HH:MM" (24h)
 *
 * scheduleAllNotifications() reads these keys at reschedule time and fires
 * a "Log your habit" notification with the "habit_reminder" actionable category
 * (already wired in App.tsx: Log It → Firestore write, View Habits → navigate).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Switch, Platform, ScrollView, Alert, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from "../../theme/tokens";
import { hapticMedium, hapticSelection, hapticLight } from "../../utils/haptics";
import { useTheme } from "../../contexts/ThemeContext";
import { Habit } from "../../contexts/MobileDataContext";

// ── AsyncStorage key helpers ──────────────────────────────────────────────────
export const HABIT_NOTIF_ENABLED_KEY = (id: string) => `@habit_notif_enabled_${id}`;
export const HABIT_NOTIF_TIME_KEY    = (id: string) => `@habit_notif_time_${id}`;

const DEFAULT_TIME = { hours: 20, minutes: 0 }; // 8:00 PM default

function formatTime(h: number, m: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ── Per-habit row state ───────────────────────────────────────────────────────
interface HabitRowState {
  enabled: boolean;
  hours: number;
  minutes: number;
  showPicker: boolean;
}

function HabitReminderRow({
  habit, state, onChange,
}: {
  habit: Habit;
  state: HabitRowState;
  onChange: (update: Partial<HabitRowState>) => void;
}) {
  const { colors } = useTheme();
  const s = rowStyles(colors);

  const pickerDate = new Date();
  pickerDate.setHours(state.hours, state.minutes, 0, 0);

  return (
    <View style={s.container}>
      <View style={s.row}>
        <View style={s.label}>
          <Text style={s.emoji}>{habit.emoji || "⭐"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{habit.name}</Text>
            {(habit.streak ?? 0) > 0 && (
              <Text style={s.streak}>🔥 {habit.streak ?? 0} day streak</Text>
            )}
          </View>
        </View>
        <Switch
          value={state.enabled}
          onValueChange={(val) => { hapticSelection(); onChange({ enabled: val }); }}
          trackColor={{ false: colors.border, true: colors.accentPrimary }}
          thumbColor={Platform.OS === "android" ? (state.enabled ? "#fff" : colors.textMuted) : undefined}
        />
      </View>

      {state.enabled && (
        <View style={s.timeRow}>
          <Text style={s.timeLabel}>Remind me at</Text>
          <TouchableOpacity
            style={s.timeBtn}
            onPress={() => { hapticLight(); onChange({ showPicker: true }); }}
          >
            <Ionicons name="time-outline" size={14} color={colors.accentPrimary} style={{ marginRight: 6 }} />
            <Text style={s.timeBtnText}>{formatTime(state.hours, state.minutes)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.showPicker && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          display="default"
          onChange={(event, selected) => {
            if (Platform.OS !== "ios") onChange({ showPicker: false });
            if (selected && event.type !== "dismissed") {
              onChange({ hours: selected.getHours(), minutes: selected.getMinutes(), showPicker: false });
            }
          }}
        />
      )}
    </View>
  );
}

const rowStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: "#1c1c1e",
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: SPACE.md,
    gap: SPACE.sm,
  },
  emoji: { fontSize: 22, width: 30, textAlign: "center" },
  name: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  streak: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  timeLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  timeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.md,
  },
  timeBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.accentPrimary,
  },
});

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  habits: Habit[];
}

export function HabitReminderModal({ visible, onClose, habits }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [rows, setRows] = useState<Record<string, HabitRowState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || habits.length === 0) return;
    (async () => {
      setLoading(true);
      const keys = habits.flatMap(h => [
        HABIT_NOTIF_ENABLED_KEY(h.id),
        HABIT_NOTIF_TIME_KEY(h.id),
      ]);
      const pairs = await AsyncStorage.multiGet(keys);
      const kv: Record<string, string | null> = {};
      pairs.forEach(([k, v]) => { kv[k] = v; });

      const newRows: Record<string, HabitRowState> = {};
      for (const habit of habits) {
        const enabledVal = kv[HABIT_NOTIF_ENABLED_KEY(habit.id)];
        const timeVal    = kv[HABIT_NOTIF_TIME_KEY(habit.id)];
        let hours = DEFAULT_TIME.hours, minutes = DEFAULT_TIME.minutes;
        if (timeVal) {
          const [h, m] = timeVal.split(":").map(Number);
          if (!isNaN(h) && !isNaN(m)) { hours = h; minutes = m; }
        }
        newRows[habit.id] = { enabled: enabledVal === "true", hours, minutes, showPicker: false };
      }
      setRows(newRows);
      setLoading(false);
    })();
  }, [visible, habits]);

  const updateRow = useCallback((habitId: string, update: Partial<HabitRowState>) => {
    setRows(prev => ({ ...prev, [habitId]: { ...prev[habitId], ...update } }));
  }, []);

  const handleSave = async () => {
    hapticMedium();
    setSaving(true);
    try {
      const pairs: [string, string][] = [];
      for (const [habitId, state] of Object.entries(rows)) {
        pairs.push([HABIT_NOTIF_ENABLED_KEY(habitId), state.enabled.toString()]);
        pairs.push([HABIT_NOTIF_TIME_KEY(habitId), `${state.hours}:${state.minutes}`]);
      }
      await AsyncStorage.multiSet(pairs);
      Alert.alert(
        "Saved ✅",
        "Habit reminders updated. You can log any habit directly from the notification — no need to open the app."
      );
      onClose();
    } catch {
      Alert.alert("Error", "Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = Object.values(rows).filter(r => r.enabled).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>

          <View style={s.header}>
            <View style={{ flex: 1, marginRight: SPACE.md }}>
              <Text style={s.title}>Habit Reminders</Text>
              <Text style={s.subtitle}>
                {enabledCount > 0
                  ? `${enabledCount} habit${enabledCount !== 1 ? "s" : ""} with reminders active`
                  : "Enable reminders for individual habits"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={s.infoBanner}>
            <Ionicons name="flash-outline" size={14} color="#5eda9e" style={{ marginTop: 2 }} />
            <Text style={s.infoText}>
              Tap{" "}
              <Text style={{ color: "#5eda9e", fontFamily: FONT_FAMILY.bold }}>🔥 Log It</Text>
              {" "}on the notification to mark a habit done without opening the app.
              Your streak updates in real-time.
            </Text>
          </View>

          {loading ? (
            <View style={s.loader}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          ) : habits.length === 0 ? (
            <View style={s.loader}>
              <Text style={s.emptyText}>No habits yet — create one first!</Text>
            </View>
          ) : (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
              {habits.map(habit => (
                <HabitReminderRow
                  key={habit.id}
                  habit={habit}
                  state={rows[habit.id] ?? { enabled: false, hours: DEFAULT_TIME.hours, minutes: DEFAULT_TIME.minutes, showPicker: false }}
                  onChange={(update) => updateRow(habit.id, update)}
                />
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving || loading}
          >
            {saving
              ? <ActivityIndicator color={colors.background} size="small" />
              : <Text style={s.saveBtnText}>Save Reminders</Text>
            }
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#141416",
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: SPACE.md,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textMuted,
  },
  closeBtn: { padding: SPACE.xs },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.xs,
    backgroundColor: "rgba(94,218,158,0.08)",
    borderWidth: 1,
    borderColor: "rgba(94,218,158,0.18)",
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.lg,
  },
  infoText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  scroll: { maxHeight: 380 },
  loader: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: SPACE.lg,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    marginTop: SPACE.lg,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.background,
  },
});
