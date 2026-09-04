/**
 * LiveWorkoutWidget.tsx — ZenTrack Android Live Gym Workout HUD Widget
 * iOS-native aesthetic: clean typography, hairline dividers, adaptive layout.
 * Matches the design language of TodayAgendaWidget exactly.
 *
 * Two modes:
 *   IDLE  — Shows today's gym split name + "Start Workout" action
 *   LIVE  — Shows current exercise name, set counter, weight × reps, Done Set button
 *
 * Layout strategy:
 *   - Root: `justifyContent: 'space-between'` pins actions to bottom
 *   - Compact (<150dp): header + core info only, no extras
 *   - Standard (150–229dp): header + exercise card + next row + action
 *   - Large (≥230dp): header + exercise card + set progress + next row + action
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { HexColor } from 'react-native-android-widget/src/widgets/utils/style.props';
import { LiveWorkoutWidgetData } from '../types/widget.types';

interface LiveWorkoutWidgetProps {
  data?: LiveWorkoutWidgetData | null;
  width?: number;
  height?: number;
}

// ─── Design Tokens (identical to TodayAgendaWidget) ─────────────────────────
const C = {
  bg:           '#00000000' as HexColor, // 100% transparent widget background
  glassCard:    '#3210101E' as HexColor, // floating glass card
  glassBorder:  '#25FFFFFF' as HexColor, // subtle translucent hairline border
  surface:      '#35141424' as HexColor,
  divider:      '#15FFFFFF' as HexColor,
  textPrimary:  '#FFFFFF' as HexColor,
  textSecondary:'#AEAEB2' as HexColor,
  textTertiary: '#6E6E78' as HexColor,
  accent:       '#A599FF' as HexColor,   // ZenTrack purple
  accentSoft:   '#352A2450' as HexColor,
  green:        '#30D158' as HexColor,   // iOS system green
  greenSoft:    '#2530D158' as HexColor,
  orange:       '#FF9F0A' as HexColor,   // iOS system orange — gym accent
  orangeSoft:   '#25FF9F0A' as HexColor,
  red:          '#FF453A' as HexColor,
  redSoft:      '#25FF453A' as HexColor,
};

export function LiveWorkoutWidget({ data, width = 330, height = 280 }: LiveWorkoutWidgetProps) {
  const isActive      = data?.isActive ?? false;
  const splitTitle    = data?.splitTitle || "Today's Gym Split";
  const currentEx     = data?.currentExercise;
  const currentSetIdx = currentEx?.currentSetIndex ?? 0;
  const currentSet    = currentEx?.sets?.[currentSetIdx];
  const targetWeight  = currentSet?.weight ?? currentEx?.targetWeight ?? 0;
  const targetReps    = currentSet?.reps ?? currentEx?.targetReps ?? 0;
  const totalSets     = currentEx?.targetSets ?? 4;
  const setNumber     = Math.min(totalSets, currentSetIdx + 1);
  const nextExName    = data?.nextExerciseName;
  const doneSets      = data?.completedSetsCount ?? 0;
  const totalSets2    = data?.totalSetsCount ?? 0;
  const duration      = data?.workoutDurationMinutes;

  const isCompact  = height < 150;
  const isLarge    = height >= 230;

  // ── Set mini-progress dots for large mode (max 6 shown) ──
  const setsToShow = Math.min(totalSets, 6);
  const setDots = Array.from({ length: setsToShow }, (_, i) => i < currentSetIdx);

  // ── Idle mode: figure out a subtitle from the split name ──
  const splitSubtitle = splitTitle.toLowerCase().includes('push')
    ? 'Chest · Shoulders · Triceps'
    : splitTitle.toLowerCase().includes('pull')
    ? 'Back · Biceps · Rear Delts'
    : splitTitle.toLowerCase().includes('leg') || splitTitle.toLowerCase().includes('lower')
    ? 'Quads · Hamstrings · Glutes'
    : splitTitle.toLowerCase().includes('upper')
    ? 'Chest · Back · Arms'
    : 'Target: Progressive Overload';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bg,
        borderRadius: 22,
        flexDirection: 'column',
        // flex:1 on top block handles layout; don't rely on space-between
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'zentrack://gym' }}
    >
      {/* ───── TOP CONTENT (flex:1 pushes actions to bottom) ───── */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flex: 1 }}>

        {/* Header */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: 'match_parent',
            paddingHorizontal: 14,
            paddingTop: isCompact ? 10 : 13,
            paddingBottom: isCompact ? 6 : 4,
          }}
        >
          <FlexWidget style={{ flexDirection: 'column' }}>
            <TextWidget
              text={isActive ? 'LIVE SESSION' : 'GYM'}
              style={{
                fontSize: 8,
                fontWeight: 'bold',
                color: isActive ? C.orange : C.accent,
                letterSpacing: 1.2,
              }}
            />
            {!isCompact ? (
              <TextWidget
                text="ZENTRACK"
                style={{ fontSize: 8, fontWeight: 'bold', color: C.textTertiary, letterSpacing: 0.8 }}
              />
            ) : null}
          </FlexWidget>

          {/* Right badge: duration if live, sets progress if idle */}
          <FlexWidget
            style={{
              backgroundColor: isActive ? C.orangeSoft : C.accentSoft,
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text={isActive && duration ? `${duration}m` : `${doneSets}/${totalSets2}`}
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: isActive ? C.orange : C.accent,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        {/* Hairline divider */}
        <FlexWidget style={{ height: 1, backgroundColor: C.divider, marginHorizontal: 14, marginBottom: 8 }} />

        {/* ── LIVE MODE: Current Exercise ── */}
        {isActive && currentEx ? (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', paddingHorizontal: 14 }}>

            {/* Set label */}
            <TextWidget
              text={`SET ${setNumber} OF ${totalSets}`}
              style={{ fontSize: 9, fontWeight: 'bold', color: C.textTertiary, letterSpacing: 1.0 }}
            />

            {/* Exercise name */}
            <TextWidget
              text={currentEx.name}
              style={{ fontSize: isCompact ? 14 : 17, fontWeight: 'bold', color: C.textPrimary }}
              maxLines={1}
            />

            {/* Weight × Reps row */}
            <FlexWidget
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 6,
                marginBottom: isLarge ? 8 : 0,
              }}
            >
              {targetWeight > 0 ? (
                <FlexWidget
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    marginRight: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <TextWidget
                    text={`${targetWeight} kg`}
                    style={{ fontSize: 13, fontWeight: 'bold', color: C.textPrimary }}
                  />
                </FlexWidget>
              ) : null}

              <FlexWidget
                style={{
                  backgroundColor: C.surface,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <TextWidget
                  text={`${targetReps} reps`}
                  style={{ fontSize: 13, fontWeight: 'bold', color: C.textPrimary }}
                />
              </FlexWidget>
            </FlexWidget>

            {/* Set progress dots — large mode only */}
            {isLarge && setsToShow > 0 ? (
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                {setDots.map((done, i) => (
                  <FlexWidget
                    key={`dot-${i}`}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: done ? C.green : C.surface,
                      marginRight: 5,
                    }}
                  />
                ))}
                {/* Current set indicator */}
                <FlexWidget
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: C.orange,
                    marginRight: 5,
                  }}
                />
                {/* Remaining dots */}
                {Array.from({ length: setsToShow - currentSetIdx - 1 }, (_, i) => (
                  <FlexWidget
                    key={`rem-${i}`}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: C.divider,
                      marginRight: 5,
                    }}
                  />
                ))}
              </FlexWidget>
            ) : null}

            {/* Next exercise hint */}
            {!isCompact && nextExName ? (
              <FlexWidget style={{ marginTop: 6 }}>
                <TextWidget
                  text={`Next: ${nextExName}`}
                  style={{ fontSize: 10, color: C.textTertiary }}
                  maxLines={1}
                />
              </FlexWidget>
            ) : null}
          </FlexWidget>
        ) : (
          /* ── IDLE MODE: Today's Split Info ── */
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', paddingHorizontal: 14 }}>
            <TextWidget
              text="TODAY'S SPLIT"
              style={{ fontSize: 9, fontWeight: 'bold', color: C.textTertiary, letterSpacing: 1.0 }}
            />
            <TextWidget
              text={splitTitle}
              style={{ fontSize: isCompact ? 14 : 17, fontWeight: 'bold', color: C.textPrimary }}
              maxLines={1}
            />
            {!isCompact ? (
              <TextWidget
                text={splitSubtitle}
                style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}
                maxLines={1}
              />
            ) : null}
          </FlexWidget>
        )}
      </FlexWidget>

      {/* ───── BOTTOM ACTIONS (pinned by space-between) ───── */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget style={{ height: 1, backgroundColor: C.divider, marginHorizontal: 14, marginBottom: 6 }} />

        {isActive && currentEx ? (
          /* Live mode: weight adjuster + done set */
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingBottom: 10,
            }}
          >
            {/* -2.5 */}
            <FlexWidget
              style={{
                backgroundColor: C.surface,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginRight: 6,
              }}
              clickAction="adjust_workout_weight"
              clickActionData={{
                action: 'adjust_workout_weight',
                exerciseId: currentEx.id,
                setIndex: currentSetIdx,
                weightDelta: -2.5,
              }}
            >
              <TextWidget text="-2.5" style={{ fontSize: 11, fontWeight: 'bold', color: C.textSecondary }} />
            </FlexWidget>

            {/* +2.5 */}
            <FlexWidget
              style={{
                backgroundColor: C.surface,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginRight: 10,
              }}
              clickAction="adjust_workout_weight"
              clickActionData={{
                action: 'adjust_workout_weight',
                exerciseId: currentEx.id,
                setIndex: currentSetIdx,
                weightDelta: 2.5,
              }}
            >
              <TextWidget text="+2.5" style={{ fontSize: 11, fontWeight: 'bold', color: C.textSecondary }} />
            </FlexWidget>

            {/* Done Set — grows to fill remaining space */}
            <FlexWidget
              style={{
                flex: 1,
                backgroundColor: C.green,
                borderRadius: 10,
                paddingVertical: 7,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              clickAction="log_workout_set"
              clickActionData={{
                action: 'log_workout_set',
                exerciseId: currentEx.id,
                setIndex: currentSetIdx,
                weight: targetWeight,
                reps: targetReps,
              }}
            >
              <TextWidget
                text="Done Set"
                style={{ fontSize: 12, fontWeight: 'bold', color: C.bg }}
              />
            </FlexWidget>

            {/* Skip exercise */}
            {!isCompact ? (
              <FlexWidget
                style={{
                  backgroundColor: C.surface,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  marginLeft: 6,
                }}
                clickAction="next_workout_exercise"
                clickActionData={{ action: 'next_workout_exercise', exerciseId: currentEx.id }}
              >
                <TextWidget text="Skip" style={{ fontSize: 11, fontWeight: 'bold', color: C.accent }} />
              </FlexWidget>
            ) : null}
          </FlexWidget>
        ) : (
          /* Idle mode: single Start Workout button */
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingBottom: 10,
            }}
          >
            <FlexWidget
              style={{
                flex: 1,
                backgroundColor: C.orange,
                borderRadius: 10,
                paddingVertical: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              clickAction="OPEN_URI"
              clickActionData={{ uri: 'zentrack://gym' }}
            >
              <TextWidget
                text="Start Workout"
                style={{ fontSize: 13, fontWeight: 'bold', color: C.bg }}
              />
            </FlexWidget>
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
