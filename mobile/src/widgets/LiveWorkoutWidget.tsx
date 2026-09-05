/**
 * LiveWorkoutWidget.tsx — ZenTrack Android Live Gym Workout HUD Widget
 *
 * Obsidian Cosmos Glassmorphism aesthetic:
 *   - Outer hairline border matching TodayAgendaWidget
 *   - Deep frosted translucent card backdrop
 *   - High-contrast visible button typography (no transparent text bugs)
 *   - Adaptive layout across Compact (<150dp), Standard (150–229dp), and Large (>=230dp)
 *
 * Three functional modes:
 *   1. IDLE      — Shows today's split name, day name, muscle focus, exercise count,
 *                  rest day status, and an interactive "Start Workout" button.
 *   2. LIVE      — Active workout HUD with current exercise, set counter, weight & reps chips,
 *                  [-2.5] / [+2.5] micro-adjusters, [Done Set] with finish detection, and [Skip].
 *   3. COMPLETED — Session Complete celebration card with elapsed duration, completed sets,
 *                  total exercises, and "View Summary" shortcut.
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

// ─── Design Tokens (Obsidian Cosmos Glassmorphism) ───────────────────────────
const C = {
  bg:            '#00000000' as HexColor, // 100% transparent root background
  outerCard:     '#2410101E' as HexColor, // Deep frosted obsidian cosmos card
  outerBorder:   '#35A599FF' as HexColor, // Signature purple neon hairline outer border (matches TodayAgendaWidget)
  headerGlass:   '#181628' as HexColor,   // Frosted header pill
  headerBorder:  '#2C2842' as HexColor,
  cardSurface:   '#151420' as HexColor,   // Frosted content card
  cardBorder:    '#262238' as HexColor,
  surface2:      '#201D30' as HexColor,
  divider:       '#221F33' as HexColor,

  textPrimary:   '#FFFFFF' as HexColor,
  textSecondary: '#AEAEB2' as HexColor,
  textTertiary:  '#7C7C88' as HexColor,

  accent:        '#A599FF' as HexColor,   // ZenTrack purple
  accentSoft:    '#251F3D' as HexColor,
  accentBorder:  '#4A3D7A' as HexColor,

  green:         '#30D158' as HexColor,   // iOS system green
  greenSoft:     '#16281C' as HexColor,
  greenBorder:   '#285E37' as HexColor,
  greenText:     '#000000' as HexColor,   // High-contrast black on green

  orange:        '#FF9F0A' as HexColor,   // iOS system orange — active gym
  orangeSoft:    '#2E1E12' as HexColor,
  orangeBorder:  '#6E441D' as HexColor,
  orangeText:    '#000000' as HexColor,   // High-contrast black on orange

  red:           '#FF453A' as HexColor,
  redSoft:       '#2E1416' as HexColor,

  // Dedicated Semantic Metric Pills (High Contrast & Legibility)
  durationPillBg:     '#132517' as HexColor, // Deep dark emerald obsidian
  durationPillBorder: '#245E35' as HexColor,
  durationPillText:   '#30D158' as HexColor, // Vivid Apple/iOS emerald green

  setsPillBg:         '#1C1630' as HexColor, // Deep dark violet obsidian
  setsPillBorder:     '#48387D' as HexColor,
  setsPillText:       '#B8AEFF' as HexColor, // Signature ZenTrack bright lavender

  exercisesPillBg:     '#281810' as HexColor, // Deep dark warm amber obsidian
  exercisesPillBorder: '#693F18' as HexColor,
  exercisesPillText:   '#FFA733' as HexColor, // Bright vivid warm gym orange

  pillSurface:        '#1B192A' as HexColor, // General neutral dark chip
  pillBorder:         '#312C4A' as HexColor,
};

export function LiveWorkoutWidget({ data, width = 330, height = 280 }: LiveWorkoutWidgetProps) {
  const isActive       = data?.isActive ?? false;
  const isCompleted    = data?.isCompleted ?? false;
  const isRestDay      = data?.isRestDay ?? false;
  const splitTitle     = data?.splitTitle || (isRestDay ? 'Rest & Recovery' : "Today's Split");
  const splitSubtitle  = data?.splitSubtitle || (isRestDay ? 'Muscles grow while resting' : 'Target: Progressive Overload');
  const dayName        = data?.dayName || 'Today';
  const displayDate    = data?.displayDate || 'Today';

  const currentEx      = data?.currentExercise;
  const currentSetIdx  = currentEx?.currentSetIndex ?? 0;
  const currentSet     = currentEx?.sets?.[currentSetIdx];
  const targetWeight   = currentSet?.weight ?? currentEx?.targetWeight ?? 0;
  const targetReps     = currentSet?.reps ?? currentEx?.targetReps ?? 0;
  const totalExSets    = currentEx?.targetSets ?? 3;
  const setNumber      = Math.min(totalExSets, currentSetIdx + 1);

  const currentExIdx   = data?.currentExerciseIndex ?? 0;
  const totalExercises = data?.totalExercises ?? (data?.allExercises?.length || 1);
  const nextExName     = data?.nextExerciseName;
  const doneSets       = data?.completedSetsCount ?? 0;
  const totalSets      = data?.totalSetsCount ?? (totalExercises * 3);
  const duration       = data?.workoutDurationMinutes;

  const isCompact      = height < 150;
  const isLarge        = height >= 230;

  // Determine if logging this set will finish the entire workout
  const isLastSetOfCurEx = currentSetIdx + 1 >= totalExSets;
  const isLastExercise   = currentExIdx + 1 >= totalExercises;
  const isFinishingSet   = isLastSetOfCurEx && isLastExercise;

  // Set mini-progress dots for large mode (up to 5 sets)
  const setsToShow = Math.min(totalExSets, 5);
  const setDots = Array.from({ length: setsToShow }, (_, i) => i < currentSetIdx);

  // Preview exercises list
  const previewText = (data?.plannedExercisesPreview || []).slice(0, 3).join(' • ');

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bg,
        padding: 2,
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'zentrack://gym' }}
    >
      {/* ───── OBSIDIAN COSMOS OUTER GLASS CONTAINER ───── */}
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: C.outerCard,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: C.outerBorder,
          paddingHorizontal: isCompact ? 10 : 12,
          paddingVertical: isCompact ? 8 : 10,
          flexDirection: 'column',
        }}
      >
        {/* ───── TOP SECTION (flex: 1 pushes action row to bottom) ───── */}
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flex: 1 }}>

          {/* ── HEADER ── */}
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: 'match_parent',
              backgroundColor: C.headerGlass,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.headerBorder,
              paddingHorizontal: 10,
              paddingVertical: isCompact ? 5 : 6,
              marginBottom: isCompact ? 4 : 6,
            }}
          >
            {/* Header Title + Dot */}
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FlexWidget
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isCompleted ? C.green : isActive ? C.orange : C.accent,
                  marginRight: 6,
                }}
              />
              <FlexWidget style={{ flexDirection: 'column' }}>
                <TextWidget
                  text={
                    isCompleted
                      ? 'SESSION COMPLETE'
                      : isActive
                      ? 'LIVE WORKOUT'
                      : `TODAY · ${dayName.toUpperCase()}`
                  }
                  style={{
                    fontSize: isCompact ? 8 : 9,
                    fontWeight: 'bold',
                    color: isCompleted ? C.green : isActive ? C.orange : C.accent,
                    letterSpacing: 1.0,
                  }}
                />
                {!isCompact ? (
                  <TextWidget
                    text="ZENTRACK GYM"
                    style={{ fontSize: 7, fontWeight: 'bold', color: C.textTertiary, letterSpacing: 0.8 }}
                  />
                ) : null}
              </FlexWidget>
            </FlexWidget>

            {/* Header Right Status Pill */}
            <FlexWidget
              style={{
                backgroundColor: isCompleted ? C.greenSoft : isActive ? C.orangeSoft : C.accentSoft,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isCompleted ? C.greenBorder : isActive ? C.orangeBorder : C.accentBorder,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <TextWidget
                text={
                  isCompleted
                    ? '✓ Done'
                    : isActive
                    ? `${duration ? `${duration}m · ` : ''}${doneSets}/${totalSets}`
                    : isRestDay
                    ? 'Rest Day'
                    : `${totalSets} Sets`
                }
                style={{
                  fontSize: isCompact ? 9 : 10,
                  fontWeight: 'bold',
                  color: isCompleted ? C.green : isActive ? C.orange : C.accent,
                }}
              />
            </FlexWidget>
          </FlexWidget>

          {/* ── BODY CONTENT CARD ── */}
          {isActive && currentEx ? (
            /* ─────────────────────────────────────────────────────────────
               STATE 1: LIVE WORKOUT HUD (In Progress)
            ───────────────────────────────────────────────────────────── */
            <FlexWidget
              style={{
                flexDirection: 'column',
                width: 'match_parent',
                backgroundColor: C.cardSurface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.cardBorder,
                paddingHorizontal: 10,
                paddingVertical: isCompact ? 6 : 8,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {/* Exercise meta line */}
              <TextWidget
                text={`EXERCISE ${currentExIdx + 1} OF ${totalExercises}   •   SET ${setNumber} OF ${totalExSets}`}
                style={{ fontSize: 8, fontWeight: 'bold', color: C.textTertiary, letterSpacing: 0.8 }}
              />

              {/* Current exercise name */}
              <TextWidget
                text={currentEx.name}
                style={{
                  fontSize: isCompact ? 13 : 16,
                  fontWeight: 'bold',
                  color: C.textPrimary,
                  marginTop: 2,
                }}
                maxLines={1}
              />

              {/* Weight & Reps Stats Chips Row */}
              <FlexWidget
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: isCompact ? 4 : 6,
                }}
              >
                {targetWeight > 0 ? (
                  <FlexWidget
                    style={{
                      backgroundColor: C.setsPillBg,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: C.setsPillBorder,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      marginRight: 6,
                    }}
                  >
                    <TextWidget
                      text={`${targetWeight} kg`}
                      style={{ fontSize: 12, fontWeight: 'bold', color: C.setsPillText }}
                    />
                  </FlexWidget>
                ) : null}

                <FlexWidget
                  style={{
                    backgroundColor: C.exercisesPillBg,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.exercisesPillBorder,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginRight: 8,
                  }}
                >
                  <TextWidget
                    text={`${targetReps} reps`}
                    style={{ fontSize: 12, fontWeight: 'bold', color: C.exercisesPillText }}
                  />
                </FlexWidget>

                {/* Set Mini-Progress Dots (Standard & Large) */}
                {!isCompact && setsToShow > 0 ? (
                  <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {setDots.map((done, i) => (
                      <FlexWidget
                        key={`d-${i}`}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: done ? C.green : C.surface2,
                          marginRight: 4,
                        }}
                      />
                    ))}
                    {/* Active Set indicator */}
                    <FlexWidget
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: C.orange,
                        marginRight: 4,
                      }}
                    />
                  </FlexWidget>
                ) : null}
              </FlexWidget>

              {/* Next Exercise Hint */}
              {!isCompact && nextExName ? (
                <TextWidget
                  text={`Next: ${nextExName}`}
                  style={{ fontSize: 9, color: C.textTertiary, marginTop: 4 }}
                  maxLines={1}
                />
              ) : null}
            </FlexWidget>

          ) : isCompleted ? (
            /* ─────────────────────────────────────────────────────────────
               STATE 2: SESSION COMPLETED (Celebration Summary)
            ───────────────────────────────────────────────────────────── */
            <FlexWidget
              style={{
                flexDirection: 'column',
                width: 'match_parent',
                backgroundColor: C.cardSurface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.greenBorder,
                paddingHorizontal: 10,
                paddingVertical: isCompact ? 6 : 8,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <TextWidget
                text={`${splitTitle} Completed! 💪`}
                style={{ fontSize: isCompact ? 13 : 16, fontWeight: 'bold', color: C.textPrimary }}
                maxLines={1}
              />

              {!isCompact ? (
                <TextWidget
                  text="Great consistency! Session recorded in your workout history."
                  style={{ fontSize: 10, color: C.textSecondary, marginTop: 2 }}
                  maxLines={1}
                />
              ) : null}

              {/* Metrics Row */}
              <FlexWidget
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: isCompact ? 4 : 6,
                }}
              >
                <FlexWidget
                  style={{
                    backgroundColor: C.durationPillBg,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.durationPillBorder,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginRight: 6,
                  }}
                >
                  <TextWidget
                    text={`⏱ ${duration || 45}m`}
                    style={{ fontSize: 11, fontWeight: 'bold', color: C.durationPillText }}
                  />
                </FlexWidget>

                <FlexWidget
                  style={{
                    backgroundColor: C.setsPillBg,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.setsPillBorder,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginRight: 6,
                  }}
                >
                  <TextWidget
                    text={`🏋 ${doneSets || totalSets} Sets`}
                    style={{ fontSize: 11, fontWeight: 'bold', color: C.setsPillText }}
                  />
                </FlexWidget>

                <FlexWidget
                  style={{
                    backgroundColor: C.exercisesPillBg,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: C.exercisesPillBorder,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <TextWidget
                    text={`💪 ${totalExercises} Exercises`}
                    style={{ fontSize: 11, fontWeight: 'bold', color: C.exercisesPillText }}
                  />
                </FlexWidget>
              </FlexWidget>
            </FlexWidget>

          ) : (
            /* ─────────────────────────────────────────────────────────────
               STATE 3: IDLE / NOT STARTED (Today's Plan Overview)
            ───────────────────────────────────────────────────────────── */
            <FlexWidget
              style={{
                flexDirection: 'column',
                width: 'match_parent',
                backgroundColor: C.cardSurface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.cardBorder,
                paddingHorizontal: 10,
                paddingVertical: isCompact ? 6 : 8,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <TextWidget
                text={splitTitle}
                style={{ fontSize: isCompact ? 13 : 16, fontWeight: 'bold', color: C.textPrimary }}
                maxLines={1}
              />

              <TextWidget
                text={splitSubtitle}
                style={{ fontSize: 10, color: isRestDay ? C.textSecondary : C.accent, marginTop: 2 }}
                maxLines={1}
              />

              {/* Workout Details Pill Row */}
              <FlexWidget
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: isCompact ? 4 : 6,
                }}
              >
                {!isRestDay ? (
                  <FlexWidget
                    style={{
                      backgroundColor: C.exercisesPillBg,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: C.exercisesPillBorder,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      marginRight: 6,
                    }}
                  >
                    <TextWidget
                      text={`💪 ${totalExercises} Exercises`}
                      style={{ fontSize: 11, fontWeight: 'bold', color: C.exercisesPillText }}
                    />
                  </FlexWidget>
                ) : null}

                {!isRestDay ? (
                  <FlexWidget
                    style={{
                      backgroundColor: C.setsPillBg,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: C.setsPillBorder,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <TextWidget
                      text={`🏋 ${totalSets} Sets`}
                      style={{ fontSize: 11, fontWeight: 'bold', color: C.setsPillText }}
                    />
                  </FlexWidget>
                ) : null}

                {isRestDay ? (
                  <FlexWidget
                    style={{
                      backgroundColor: C.pillSurface,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: C.pillBorder,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <TextWidget
                      text="🛌 Recovery & Growth Day"
                      style={{ fontSize: 11, fontWeight: 'bold', color: C.textSecondary }}
                    />
                  </FlexWidget>
                ) : null}
              </FlexWidget>

              {/* Large mode preview of planned exercises */}
              {isLarge && previewText ? (
                <TextWidget
                  text={`Plan: ${previewText}`}
                  style={{ fontSize: 9, color: C.textTertiary, marginTop: 5 }}
                  maxLines={1}
                />
              ) : null}
            </FlexWidget>
          )}
        </FlexWidget>

        {/* ───── BOTTOM ACTION BAR ───── */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: 'match_parent',
            marginTop: isCompact ? 4 : 6,
          }}
        >
          {isActive && currentEx ? (
            /* Active Mode Action Buttons */
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
              {/* -2.5 kg button */}
              <FlexWidget
                style={{
                  backgroundColor: C.cardSurface,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: C.cardBorder,
                  paddingHorizontal: 9,
                  paddingVertical: isCompact ? 5 : 6,
                  marginRight: 5,
                }}
                clickAction="adjust_workout_weight"
                clickActionData={{
                  action: 'adjust_workout_weight',
                  exerciseId: currentEx.id,
                  setIndex: currentSetIdx,
                  weightDelta: -2.5,
                }}
              >
                <TextWidget text="-2.5" style={{ fontSize: 11, fontWeight: 'bold', color: C.textPrimary }} />
              </FlexWidget>

              {/* +2.5 kg button */}
              <FlexWidget
                style={{
                  backgroundColor: C.cardSurface,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: C.cardBorder,
                  paddingHorizontal: 9,
                  paddingVertical: isCompact ? 5 : 6,
                  marginRight: 7,
                }}
                clickAction="adjust_workout_weight"
                clickActionData={{
                  action: 'adjust_workout_weight',
                  exerciseId: currentEx.id,
                  setIndex: currentSetIdx,
                  weightDelta: 2.5,
                }}
              >
                <TextWidget text="+2.5" style={{ fontSize: 11, fontWeight: 'bold', color: C.textPrimary }} />
              </FlexWidget>

              {/* Done Set button (or Finish Workout on final set) */}
              <FlexWidget
                style={{
                  flex: 1,
                  backgroundColor: C.green,
                  borderRadius: 10,
                  paddingVertical: isCompact ? 6 : 7,
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
                  text={isFinishingSet ? 'Finish Workout ✓' : 'Done Set ✓'}
                  style={{
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: 'bold',
                    color: C.greenText, // High-contrast black on green!
                  }}
                />
              </FlexWidget>

              {/* Skip button */}
              {!isCompact ? (
                <FlexWidget
                  style={{
                    backgroundColor: C.cardSurface,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: C.cardBorder,
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                    marginLeft: 6,
                  }}
                  clickAction="next_workout_exercise"
                  clickActionData={{ action: 'next_workout_exercise', exerciseId: currentEx.id }}
                >
                  <TextWidget text="Skip" style={{ fontSize: 11, fontWeight: 'bold', color: C.textSecondary }} />
                </FlexWidget>
              ) : null}
            </FlexWidget>

          ) : isCompleted ? (
            /* Completed Mode: View Summary */
            <FlexWidget
              style={{
                flex: 1,
                backgroundColor: C.cardSurface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.greenBorder,
                paddingVertical: isCompact ? 6 : 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              clickAction="OPEN_URI"
              clickActionData={{ uri: 'zentrack://gym' }}
            >
              <TextWidget
                text="View Summary & PRs  →"
                style={{ fontSize: 12, fontWeight: 'bold', color: C.green }}
              />
            </FlexWidget>

          ) : (
            /* Idle Mode: Start Workout or Open Gym */
            <FlexWidget
              style={{
                flex: 1,
                backgroundColor: isRestDay ? C.cardSurface : C.orange,
                borderRadius: 10,
                borderWidth: isRestDay ? 1 : 0,
                borderColor: C.cardBorder,
                paddingVertical: isCompact ? 6 : 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              clickAction={isRestDay ? 'OPEN_URI' : 'start_workout_session'}
              clickActionData={
                isRestDay
                  ? { uri: 'zentrack://gym' }
                  : { action: 'start_workout_session', dateStr: data?.dateStr }
              }
            >
              <TextWidget
                text={isRestDay ? 'Open Gym Hub  →' : '▶   Start Workout'}
                style={{
                  fontSize: isCompact ? 12 : 13,
                  fontWeight: 'bold',
                  color: isRestDay ? C.textPrimary : C.orangeText, // High-contrast black on orange!
                }}
              />
            </FlexWidget>
          )}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
