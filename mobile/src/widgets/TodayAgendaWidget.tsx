/**
 * TodayAgendaWidget.tsx -- ZenTrack Android Home Screen Widget
 *
 * Design: Obsidian Cosmos Glassmorphism
 *   - Frosted accent-tinted header strip
 *   - ZenScore pill with semantic green/amber/red
 *   - Next Class spotlight card with Present/Absent
 *   - Per-row P/A buttons for every pending class/lab
 *   - Attended/Missed status chips for resolved rows
 *   - Task rows keep time chip + mark-done tap
 *   - Compact / Standard / Large adaptive breakpoints
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { HexColor } from 'react-native-android-widget/src/widgets/utils/style.props';
import { TodayAgendaWidgetData } from '../types/widget.types';

interface TodayAgendaWidgetProps {
  data?: TodayAgendaWidgetData | null;
  width?: number;
  height?: number;
}

const C = {
  bg:           '#00000000' as HexColor, // 100% transparent widget background
  headerGlass:  '#35131024' as HexColor, // floating frosted header pill
  surface:      '#35141424' as HexColor, // floating frosted spotlight card
  surface2:     '#25FFFFFF' as HexColor,
  glassCard:    '#3210101E' as HexColor, // floating schedule container
  glassBorder:  '#25FFFFFF' as HexColor, // subtle translucent hairline border
  glassPill:    '#3018182A' as HexColor, // floating action pill
  glassPillBorder: '#35FFFFFF' as HexColor,
  borderAccent: '#35A599FF' as HexColor,
  divider:      '#15FFFFFF' as HexColor,
  textPrimary:  '#FFFFFF' as HexColor,
  textSecondary:'#AEAEB2' as HexColor,
  textTertiary: '#6E6E78' as HexColor,
  accent:       '#A599FF' as HexColor,
  accentDim:    '#7B70CC' as HexColor,
  accentSoft:   '#352A2450' as HexColor,
  green:        '#32D74B' as HexColor,
  greenSoft:    '#2532D74B' as HexColor,
  amber:        '#FFD60A' as HexColor,
  amberSoft:    '#25FFD60A' as HexColor,
  red:          '#FF453A' as HexColor,
  redSoft:      '#25FF453A' as HexColor,
  capsuleBg:    '#1A172B' as HexColor,
  capsuleBorder:'#352C52' as HexColor,
} as const;

function getDotColor(isDone: boolean, isMissed: boolean, isCancelled: boolean, isOverdue: boolean, isClass: boolean): HexColor {
  if (isDone) return C.green;
  if (isMissed || isOverdue) return C.red;
  if (isCancelled) return C.textTertiary;
  if (isClass) return C.accent;
  return C.accentDim;
}
function getChipFg(isDone: boolean, isOverdue: boolean, isTmrw: boolean): HexColor {
  if (isDone) return C.green;
  if (isOverdue) return C.red;
  if (isTmrw) return C.textTertiary;
  return C.accent;
}
function getChipBg(isDone: boolean, isOverdue: boolean, isTmrw: boolean): HexColor {
  if (isDone) return C.greenSoft;
  if (isOverdue) return C.redSoft;
  if (isTmrw) return C.surface2;
  return C.accentSoft;
}

export function TodayAgendaWidget({ data, width = 330, height = 280 }: TodayAgendaWidgetProps) {
  const isHoliday   = data?.isHoliday || false;
  const displayDate = data?.displayDate || 'Today';
  const zenScore    = data?.zenScore ?? 85;
  const streak      = data?.streak ?? 0;
  const items       = data?.items || [];
  const classes     = data?.classes || [];
  const tasks       = data?.tasks || [];

  const pendingClasses = classes.filter((c) => c.status === 'pending');
  const nextClass      = isHoliday ? null : (pendingClasses[0] || null);

  const doneCount  = tasks.filter((t) => t.status === 'completed').length
                   + classes.filter((c) => c.status === 'attended').length;
  const totalCount = tasks.length + classes.filter((c) => c.status !== 'cancelled').length;
  const isAllDone  = doneCount === totalCount && totalCount > 0;

  const isCompact = height < 140;
  const isLarge   = height >= 230;

  // Calculate dynamic capacity so schedule rows fit naturally without overflowing widget canvas
  const fixedOverhead = isCompact ? 64 : (nextClass && !isHoliday ? 154 : 106);
  const availableRowHeight = Math.max(0, height - fixedOverhead);
  const dynamicCapacity = Math.max(1, Math.min(8, Math.floor(availableRowHeight / 34)));

  // User Requirement: This schedule card is DEDICATED TO TASKS ONLY!
  // Attendance is handled exclusively by the upper Spotlight section ("FLOATING NEXT CLASS SPOTLIGHT").
  const taskItems = items.filter((i) => i.type === 'task');
  const displayItems = taskItems.slice(0, dynamicCapacity);

  const doneTasksCount  = tasks.filter((t) => t.status === 'completed').length;
  const totalTasksCount = tasks.length;
  const isAllTasksDone  = doneTasksCount === totalTasksCount && totalTasksCount > 0;

  const hasOverdue  = taskItems.some((i) => i.timeStr?.includes('Overdue'));
  const hasTmrw     = taskItems.some((i) => i.timeStr?.includes('Tomorrow'));

  const sectionLabel = isHoliday
    ? (totalTasksCount > 0 ? "TODAY'S TASKS · HOLIDAY" : 'HOLIDAY')
    : totalTasksCount === 0
    ? hasOverdue ? 'OVERDUE TASKS' : hasTmrw ? 'UPCOMING TASKS' : "TODAY'S TASKS"
    : "TODAY'S TASKS";

  const counterLabel = isHoliday && totalTasksCount === 0
    ? 'Holiday'
    : totalTasksCount > 0
    ? isAllTasksDone ? 'All done ✓' : `${doneTasksCount}/${totalTasksCount}`
    : '';

  // ── SMART HYBRID HEADER BADGE ──────────────────────────────────────────
  // 1. In-progress during the day: Shows live completion "3/5 Done" (or "3/5" compact)
  // 2. When all daily items are done: Switches to consistency streak "🔥 7d" (or "✓ All Done")
  let badgeText = '';
  let badgeFg: HexColor = C.accent;
  let badgeBg: HexColor = C.accentSoft;
  let badgeBorder: HexColor = C.borderAccent;

  if (isAllDone) {
    badgeText = streak > 0 ? `🔥 ${streak}d` : '✓ Done';
    badgeFg = C.green;
    badgeBg = C.greenSoft;
    badgeBorder = C.green;
  } else if (totalCount === 0) {
    if (streak > 0) {
      badgeText = `🔥 ${streak}d`;
      badgeFg = C.amber;
      badgeBg = C.amberSoft;
      badgeBorder = C.amber;
    } else {
      badgeText = isHoliday ? 'Holiday' : 'Free Day';
      badgeFg = C.accent;
      badgeBg = C.accentSoft;
      badgeBorder = C.borderAccent;
    }
  } else {
    // In-progress with pending items
    badgeText = isCompact ? `${doneCount}/${totalCount}` : `${doneCount}/${totalCount} Done`;
    if (doneCount > 0) {
      badgeFg = C.accent;
      badgeBg = C.accentSoft;
      badgeBorder = C.borderAccent;
    } else {
      badgeFg = C.textSecondary;
      badgeBg = C.surface2;
      badgeBorder = C.glassBorder;
    }
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bg,
        flexDirection: 'column',
        justifyContent: 'flex-start',
        padding: 2,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'zentrack://dashboard' }}
    >
      {/* FLOATING HEADER */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: 'match_parent',
            backgroundColor: C.headerGlass,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: C.borderAccent,
            paddingHorizontal: 14,
            paddingTop: isCompact ? 8 : 10,
            paddingBottom: isCompact ? 7 : 8,
            marginBottom: isCompact ? 0 : 4,
          }}
        >
          <FlexWidget style={{ flexDirection: 'column' }}>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextWidget text={displayDate} style={{ fontSize: isCompact ? 13 : 15, fontWeight: 'bold', color: C.textPrimary }} />
              {isHoliday ? (
                <FlexWidget style={{ backgroundColor: C.accentSoft, borderRadius: 8, borderWidth: 1, borderColor: C.borderAccent, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                  <TextWidget text="HOLIDAY" style={{ fontSize: 7, fontWeight: 'bold', color: C.accent }} />
                </FlexWidget>
              ) : null}
            </FlexWidget>
            {!isCompact ? (
              <TextWidget text="ZENTRACK" style={{ fontSize: 7, fontWeight: 'bold', color: C.accent, letterSpacing: 1.8 }} />
            ) : null}
          </FlexWidget>
          <FlexWidget style={{ backgroundColor: badgeBg, borderRadius: 10, borderWidth: 1, borderColor: badgeBorder, paddingHorizontal: 9, paddingVertical: 3 }}>
            <TextWidget text={badgeText} style={{ fontSize: isCompact ? 10 : 12, fontWeight: 'bold', color: badgeFg }} />
          </FlexWidget>
        </FlexWidget>

        {/* FLOATING NEXT CLASS SPOTLIGHT */}
        {!isCompact && !isHoliday && nextClass ? (
          <FlexWidget style={{ width: 'match_parent', marginBottom: 4 }}>
            <FlexWidget
              style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.borderAccent,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
              }}
            >
              <FlexWidget style={{ width: 3, height: 30, borderRadius: 2, backgroundColor: C.accent, marginRight: 10 }} />
              <FlexWidget style={{ flexDirection: 'column', flex: 1, marginRight: 8 }}>
                <TextWidget
                  text={`${nextClass.type === 'lab' ? 'NEXT LAB' : 'NEXT CLASS'}${nextClass.time ? `  •  ${nextClass.time}` : ''}`}
                  style={{ fontSize: 7, fontWeight: 'bold', color: C.accent, letterSpacing: 0.8 }}
                />
                <TextWidget text={nextClass.subjectName} style={{ fontSize: 12, fontWeight: 'bold', color: C.textPrimary }} maxLines={1} />
                {nextClass.room ? (
                  <TextWidget text={nextClass.room} style={{ fontSize: 10, color: C.textSecondary }} />
                ) : null}
              </FlexWidget>
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FlexWidget
                  style={{
                    backgroundColor: C.greenSoft,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.green,
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                    marginRight: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  clickAction="mark_class_present"
                  clickActionData={{ action: 'mark_class_present', subjectId: nextClass.subjectId, subjectName: nextClass.subjectName, sessionIdx: nextClass.idx, type: nextClass.type, dateStr: data?.dateStr || '' }}
                >
                  <TextWidget text="✓ Present" style={{ fontSize: 10, fontWeight: 'bold', color: C.green }} />
                </FlexWidget>
                <FlexWidget
                  style={{
                    backgroundColor: C.redSoft,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.red,
                    paddingHorizontal: 11,
                    paddingVertical: 5,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  clickAction="mark_class_absent"
                  clickActionData={{ action: 'mark_class_absent', subjectId: nextClass.subjectId, subjectName: nextClass.subjectName, sessionIdx: nextClass.idx, type: nextClass.type, dateStr: data?.dateStr || '' }}
                >
                  <TextWidget text="✕ Absent" style={{ fontSize: 10, fontWeight: 'bold', color: C.red }} />
                </FlexWidget>
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>
        ) : null}

        {/* FLOATING SCHEDULE CARD (BOX 2) — WRAPS EXACT NUMBER OF TASKS */}
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            backgroundColor: C.glassCard,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: C.glassBorder,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginBottom: isCompact ? 0 : 4,
          }}
        >
          {/* SECTION HEADER */}
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent', paddingHorizontal: 4, paddingBottom: 4 }}>
            <TextWidget text={sectionLabel} style={{ fontSize: 8, fontWeight: 'bold', color: C.textSecondary, letterSpacing: 1.4 }} />
            {counterLabel ? (
              <TextWidget text={counterLabel} style={{ fontSize: 8, fontWeight: 'bold', color: isAllDone ? C.green : C.textSecondary }} />
            ) : null}
          </FlexWidget>
          <FlexWidget style={{ height: 1, backgroundColor: C.divider, marginHorizontal: 2, marginBottom: 2 }} />

          {/* SCHEDULE ROWS */}
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
            {displayItems.length > 0 ? (
              displayItems.map((item, idx) => {
                const isDone      = item.status === 'attended' || item.status === 'completed';
                const isMissed    = item.status === 'missed';
                const isCancelled = item.status === 'cancelled';
                const isOverdue   = !!item.timeStr?.includes('Overdue');
                const isTmrw      = !!item.timeStr?.includes('Tomorrow');
                const isClass     = item.type === 'class' || item.type === 'lab';
                const isLast      = idx === displayItems.length - 1;
                const dot         = getDotColor(isDone, isMissed, isCancelled, isOverdue, isClass);
                const isMuted     = isDone || isCancelled;

                // Dedicated Subtitle Formatting (Pure WHITE for maximum readability)
                let subtitleText: string | null = null;
                let subtitleColor: HexColor = C.textPrimary;

                if (isClass) {
                  if (item.timeStr) {
                    subtitleText = item.timeStr;
                    subtitleColor = C.textPrimary;
                  }
                } else {
                  if (item.timeStr && item.timeStr !== 'Today') {
                    subtitleText = item.timeStr;
                    subtitleColor = isOverdue ? C.red : (isTmrw ? C.amber : C.textPrimary);
                  } else if (item.timeStr === 'Today') {
                    subtitleText = 'Due Today';
                    subtitleColor = C.accent;
                  }
                }

                return (
                  <FlexWidget key={item.id} style={{ flexDirection: 'column', width: 'match_parent' }}>
                    <FlexWidget
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 3.5,
                        paddingHorizontal: 2,
                        width: 'match_parent',
                      }}
                      clickAction="OPEN_URI"
                      clickActionData={{ uri: isClass ? 'zentrack://attendance' : 'zentrack://tasks' }}
                    >
                      {/* Status Indicator Dot */}
                      <FlexWidget
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: dot,
                          marginRight: 8,
                        }}
                      />

                      {/* Title & Subtitle Info (Full remaining width, never truncated by right chips) */}
                      <FlexWidget
                        style={{
                          flex: 1,
                          flexDirection: 'column',
                          justifyContent: 'center',
                          marginRight: 8,
                        }}
                      >
                        <TextWidget
                          text={item.title}
                          style={{
                            fontSize: isCompact ? 11 : 12,
                            fontWeight: isMuted ? 'normal' : '600',
                            color: isMuted ? C.textTertiary : C.textPrimary,
                          }}
                          maxLines={1}
                        />
                        {subtitleText ? (
                          <TextWidget
                            text={subtitleText}
                            style={{
                              fontSize: 9.5,
                              fontWeight: isOverdue ? 'bold' : '600',
                              color: subtitleColor,
                              marginTop: 1,
                            }}
                            maxLines={1}
                          />
                        ) : null}
                      </FlexWidget>

                      {/* Interactive Action Control */}
                      {isClass ? (
                        isDone ? (
                          /* Tappable Attended Pill — 1-Tap Undo directly from widget! */
                          <FlexWidget
                            style={{
                              backgroundColor: C.greenSoft,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: C.green,
                              paddingHorizontal: 8,
                              paddingVertical: 3.5,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            clickAction="mark_class_undo"
                            clickActionData={{
                              action: 'mark_class_undo',
                              subjectId: item.subjectId,
                              subjectName: item.subjectName,
                              sessionIdx: item.sessionIdx,
                              type: item.type,
                              dateStr: data?.dateStr || '',
                            }}
                          >
                            <TextWidget text="✓ Attended" style={{ fontSize: 9, fontWeight: 'bold', color: C.green }} />
                          </FlexWidget>
                        ) : isMissed ? (
                          /* Tappable Missed Pill — 1-Tap Undo directly from widget! */
                          <FlexWidget
                            style={{
                              backgroundColor: C.redSoft,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: C.red,
                              paddingHorizontal: 8,
                              paddingVertical: 3.5,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            clickAction="mark_class_undo"
                            clickActionData={{
                              action: 'mark_class_undo',
                              subjectId: item.subjectId,
                              subjectName: item.subjectName,
                              sessionIdx: item.sessionIdx,
                              type: item.type,
                              dateStr: data?.dateStr || '',
                            }}
                          >
                            <TextWidget text="✕ Missed" style={{ fontSize: 9, fontWeight: 'bold', color: C.red }} />
                          </FlexWidget>
                        ) : isCancelled ? (
                          <FlexWidget
                            style={{
                              backgroundColor: C.surface2,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: C.glassBorder,
                              paddingHorizontal: 8,
                              paddingVertical: 3.5,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <TextWidget text="Cancelled" style={{ fontSize: 9, fontWeight: 'bold', color: C.textTertiary }} />
                          </FlexWidget>
                        ) : (
                          /* High-Tactile Dual-Action Segmented Controller [✓ P | ✕ A] */
                          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {/* Present Button */}
                            <FlexWidget
                              style={{
                                backgroundColor: C.greenSoft,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: C.green,
                                paddingHorizontal: 8,
                                paddingVertical: 3.5,
                                marginRight: 5,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              clickAction="mark_class_present"
                              clickActionData={{
                                action: 'mark_class_present',
                                subjectId: item.subjectId,
                                subjectName: item.subjectName,
                                sessionIdx: item.sessionIdx,
                                type: item.type,
                                dateStr: data?.dateStr || '',
                              }}
                            >
                              <TextWidget text="✓ P" style={{ fontSize: 10, fontWeight: 'bold', color: C.green }} />
                            </FlexWidget>

                            {/* Absent Button */}
                            <FlexWidget
                              style={{
                                backgroundColor: C.redSoft,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: C.red,
                                paddingHorizontal: 8,
                                paddingVertical: 3.5,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              clickAction="mark_class_absent"
                              clickActionData={{
                                action: 'mark_class_absent',
                                subjectId: item.subjectId,
                                subjectName: item.subjectName,
                                sessionIdx: item.sessionIdx,
                                type: item.type,
                                dateStr: data?.dateStr || '',
                              }}
                            >
                              <TextWidget text="✕ A" style={{ fontSize: 10, fontWeight: 'bold', color: C.red }} />
                            </FlexWidget>
                          </FlexWidget>
                        )
                      ) : (
                        /* Task Action Button */
                        isDone ? (
                          <FlexWidget
                            style={{
                              backgroundColor: C.greenSoft,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: C.green,
                              paddingHorizontal: 9,
                              paddingVertical: 3.5,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            clickAction="mark_task_undone"
                            clickActionData={{ action: 'mark_task_undone', taskId: item.taskId || item.id }}
                          >
                            <TextWidget text="✓ Done" style={{ fontSize: 9, fontWeight: 'bold', color: C.green }} />
                          </FlexWidget>
                        ) : (
                          <FlexWidget
                            style={{
                              backgroundColor: C.accentSoft,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: C.borderAccent,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            clickAction="mark_task_done"
                            clickActionData={{ action: 'mark_task_done', taskId: item.taskId || item.id }}
                          >
                            <TextWidget text="Done ✓" style={{ fontSize: 10, fontWeight: 'bold', color: C.accent }} />
                          </FlexWidget>
                        )
                      )}
                    </FlexWidget>

                    {!isLast ? (
                      <FlexWidget style={{ height: 1, backgroundColor: C.divider, marginLeft: 14, marginRight: 2, marginVertical: 1 }} />
                    ) : null}
                  </FlexWidget>
                );
              })
            ) : (
              <FlexWidget style={{ paddingVertical: 14, alignItems: 'center', width: 'match_parent' }}>
                <TextWidget text={isHoliday ? (tasks.length === 0 ? "Holiday · No tasks today" : "All today's tasks completed") : (tasks.length === 0 ? "No tasks for today · Tap + Task below" : "All today's tasks completed! 🔥")} style={{ fontSize: 11, color: C.textPrimary }} />
              </FlexWidget>
            )}
          </FlexWidget>
        </FlexWidget>

      {/* QUICK ACTIONS — DIRECTLY FOLLOWING BOX 2 */}
      {!isCompact ? (
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: 'match_parent',
            paddingTop: 2,
            paddingBottom: 2,
            justifyContent: 'space-between',
          }}
        >
          {/* + Task Floating Pill */}
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: C.accentSoft,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.borderAccent,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 4,
            }}
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'zentrack://tasks' }}
          >
            <TextWidget text="+ Task" style={{ fontSize: 11, fontWeight: 'bold', color: C.accent }} />
          </FlexWidget>

          {/* Attendance Floating Pill */}
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: C.glassPill,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.glassPillBorder,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              marginHorizontal: 3,
            }}
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'zentrack://attendance' }}
          >
            <TextWidget text="Attendance" style={{ fontSize: 11, fontWeight: 'bold', color: C.textPrimary }} />
          </FlexWidget>

          {/* Habits Floating Pill */}
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: C.glassPill,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.glassPillBorder,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
            }}
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'zentrack://habits' }}
          >
            <TextWidget text="Habits" style={{ fontSize: 11, fontWeight: 'bold', color: C.textPrimary }} />
          </FlexWidget>
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}