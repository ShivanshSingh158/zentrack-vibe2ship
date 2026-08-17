/**
 * KanbanView  ZenTrack Mobile
 *
 * Todoist/Trello-style Kanban board for tasks.
 * 4 columns: Backlog (no date) | Today | This Week | Done
 *
 * - Horizontal snap-scroll between columns
 * - Tap card ? opens edit modal
 * - Long-press card ? slide to another column (updates Firestore)
 */

import React, { useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { Task } from "../../contexts/MobileDataContext";
import { COLLECTION } from "../../config/constants";
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from "../../theme/tokens";
import { handleSyncError } from '../../utils/errorUtils';
import { formatLocalDateStr } from "../../utils/dateUtils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMN_WIDTH = SCREEN_WIDTH * 0.78;

function getTodayStr(): string {
  return formatLocalDateStr(new Date());
}

function getWeekEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return formatLocalDateStr(d);
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ff6961", P1: "#ff6961",
  medium: "#ff9f4d", P2: "#ff9f4d",
  low: "#5eda9e", P3: "#5eda9e",
};

interface Column {
  id: "backlog" | "today" | "week" | "done";
  label: string;
  icon: string;
  accent: string;
  tasks: Task[];
}

interface Props {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  colors: any;
}

const KanbanView = React.memo(function KanbanView({ tasks, onTaskPress, colors }: Props) {
  const weekEnd = getWeekEnd();

  const columns: Column[] = useMemo(() => {
    const todayStr = getTodayStr();
    const backlog: Task[] = [];
    const today: Task[] = [];
    const week: Task[] = [];
    const done: Task[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.status === "completed") {
        done.push(t);
      } else if (!t.date || t.date < todayStr) {
        backlog.push(t);
      } else if (t.date === todayStr) {
        today.push(t);
      } else if (t.date <= weekEnd) {
        week.push(t);
      }
    }

    return [
      { id: "backlog", label: "Backlog",   icon: "layers-outline",        accent: "#6b7280", tasks: backlog },
      { id: "today",   label: "Today",     icon: "today-outline",         accent: "#a599ff", tasks: today  },
      { id: "week",    label: "This Week", icon: "calendar-outline",      accent: "#60a5fa", tasks: week   },
      { id: "done",    label: "Done",      icon: "checkmark-circle-outline", accent: "#34d399", tasks: done },
    ];
  }, [tasks, weekEnd]);

  const moveTask = useCallback(async (task: Task, targetColumnId: Column["id"]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const todayStr = getTodayStr();
    let updates: Partial<Task> = {};
    if (targetColumnId === "today")   updates = { date: todayStr, status: "pending" };
    else if (targetColumnId === "done")  updates = { status: "completed" };
    else if (targetColumnId === "backlog") updates = { date: undefined, status: "pending" } as any;
    else if (targetColumnId === "week") {
      // move to tomorrow
      const d = new Date(); d.setDate(d.getDate() + 1);
      updates = { date: formatLocalDateStr(d), status: "pending" };
    }
    if (task.id) {
      await updateDoc(doc(db, COLLECTION.TASKS, task.id), updates as any).catch(handleSyncError);
    }
  }, []);

  return (
    <ScrollView
      horizontal
      pagingEnabled={false}
      decelerationRate="fast"
      snapToInterval={COLUMN_WIDTH + SPACE.md}
      snapToAlignment="start"
      contentContainerStyle={styles.board}
      showsHorizontalScrollIndicator={false}
    >
      {columns.map((col, ci) => (
        <View key={col.id} style={[styles.column, { width: COLUMN_WIDTH }]}>
          {/* Column Header */}
          <View style={[styles.colHeader, { borderColor: col.accent + "40" }]}>
            <View style={styles.colHeaderLeft}>
              <View style={[styles.colDot, { backgroundColor: col.accent }]} />
              <Text style={[styles.colTitle, { color: colors.textPrimary }]}>{col.label}</Text>
            </View>
            <View style={[styles.colCount, { backgroundColor: col.accent + "22" }]}>
              <Text style={[styles.colCountText, { color: col.accent }]}>{col.tasks.length}</Text>
            </View>
          </View>

          {/* Cards */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {col.tasks.length === 0 && (
              <View style={styles.emptyCol}>
                <Ionicons name={col.icon as any} size={28} color={col.accent + "44"} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Empty</Text>
              </View>
            )}
            {col.tasks.map((task, ti) => (
              <Animated.View
                key={task.id}
                entering={FadeInDown.delay(ti * 30).duration(200).springify()}
              >
                <KanbanCard
                  task={task}
                  colors={colors}
                  onPress={() => onTaskPress(task)}
                  onMove={(targetId) => moveTask(task, targetId)}
                  columns={columns}
                  currentColId={col.id}
                />
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
});

export default KanbanView;

// --- KanbanCard ---------------------------------------------------------------

interface CardProps {
  task: Task;
  colors: any;
  onPress: () => void;
  onMove: (colId: Column["id"]) => void;
  columns: Column[];
  currentColId: Column["id"];
}

function KanbanCard({ task, colors, onPress, onMove, columns, currentColId }: CardProps) {
  const [showMoveMenu, setShowMoveMenu] = React.useState(false);
  const priorityColor = PRIORITY_COLORS[task.priority ?? "low"] ?? "#6b7280";
  const subtaskCount = task.subtasks?.length ?? 0;
  const doneSubtasks = task.subtasks?.filter(s => s.completed).length ?? 0;

  return (
    <View style={{ marginBottom: SPACE.sm }}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        onPress={onPress}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMoveMenu(v => !v); }}
        activeOpacity={0.85}
      >
        {/* Priority bar */}
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

        <View style={styles.cardBody}>
          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <View style={styles.tagRow}>
              {task.tags.slice(0, 3).map(tag => (
                <View key={tag} style={[styles.tagPill, { backgroundColor: tagColor(tag) + "28" }]}>
                  <Text style={[styles.tagText, { color: tagColor(tag) }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.cardTitle, { color: colors.textPrimary }, task.status === "completed" && styles.completedText]} numberOfLines={2}>
            {task.title}
          </Text>

          <View style={styles.cardFooter}>
            {task.timeSlot && (
              <View style={styles.footerChip}>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                <Text style={[styles.footerChipText, { color: colors.textMuted }]}>{task.timeSlot}</Text>
              </View>
            )}
            {subtaskCount > 0 && (
              <View style={styles.footerChip}>
                <Ionicons name="list-outline" size={11} color={colors.textMuted} />
                <Text style={[styles.footerChipText, { color: colors.textMuted }]}>{doneSubtasks}/{subtaskCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Move to column menu */}
      {showMoveMenu && (
        <View style={[styles.moveMenu, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={[styles.moveMenuTitle, { color: colors.textMuted }]}>Move to</Text>
          {columns.filter(c => c.id !== currentColId).map(c => (
            <TouchableOpacity key={c.id} style={styles.moveMenuItem} onPress={() => { setShowMoveMenu(false); onMove(c.id); }}>
              <View style={[styles.colDot, { backgroundColor: c.accent, width: 8, height: 8 }]} />
              <Text style={[styles.moveMenuLabel, { color: colors.textPrimary }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.moveMenuItem} onPress={() => setShowMoveMenu(false)}>
            <Text style={[styles.moveMenuLabel, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// --- Tag color (deterministic hash) ------------------------------------------
const TAG_PALETTE = ["#a599ff","#60a5fa","#34d399","#f87171","#fb923c","#e879f9","#facc15","#38bdf8"];
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

// --- Styles -------------------------------------------------------------------
const styles = StyleSheet.create({
  board: {
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    gap: SPACE.md,
    alignItems: "flex-start",
  },
  column: {
    maxHeight: "100%",
    flex: 1,
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    marginBottom: SPACE.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginRight: SPACE.md,
  },
  colHeaderLeft: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm },
  colCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  colCountText: { fontFamily: FONT_FAMILY.bold, fontSize: 11 },
  emptyCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACE.xxl,
    gap: SPACE.xs,
    marginRight: SPACE.md,
  },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    marginRight: SPACE.md,
  },
  priorityBar: { width: 3, minHeight: 60 },
  cardBody: { flex: 1, padding: SPACE.md, gap: SPACE.xs },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 2 },
  tagPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  tagText: { fontFamily: FONT_FAMILY.medium, fontSize: 10 },
  cardTitle: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, lineHeight: 18 },
  completedText: { textDecorationLine: "line-through", opacity: 0.5 },
  cardFooter: { flexDirection: "row", gap: SPACE.sm, marginTop: 2 },
  footerChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  footerChipText: { fontFamily: FONT_FAMILY.body, fontSize: 10 },
  moveMenu: {
    marginRight: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.sm,
    marginTop: -SPACE.xs,
    marginBottom: SPACE.xs,
    zIndex: 100,
  },
  moveMenuTitle: { fontFamily: FONT_FAMILY.medium, fontSize: 11, marginBottom: 4, paddingHorizontal: SPACE.xs },
  moveMenuItem: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, paddingVertical: 6, paddingHorizontal: SPACE.xs },
  moveMenuLabel: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm },
});
