/**
 * LiveWorkoutWidget.tsx — ZenTrack Android Live Gym Workout HUD Widget
 * Supports live set logging, next exercise preview, weight adjustments, and routine tracking.
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { LiveWorkoutWidgetData } from '../types/widget.types';

interface LiveWorkoutWidgetProps {
  data?: LiveWorkoutWidgetData | null;
  width?: number;
  height?: number;
}

export function LiveWorkoutWidget({ data, width = 320, height = 180 }: LiveWorkoutWidgetProps) {
  const isActive = data?.isActive ?? false;
  const splitTitle = data?.splitTitle || "Today's Gym Split";
  const duration = data?.workoutDurationMinutes ? `${data.workoutDurationMinutes}m` : 'Live';
  const currentEx = data?.currentExercise;
  const currentSetIdx = currentEx?.currentSetIndex ?? 0;
  const currentSet = currentEx?.sets?.[currentSetIdx];
  const targetWeight = currentSet?.weight ?? currentEx?.targetWeight ?? 25;
  const targetReps = currentSet?.reps ?? currentEx?.targetReps ?? 10;
  const totalSets = currentEx?.targetSets ?? 4;
  const currentSetNumber = Math.min(totalSets, currentSetIdx + 1);
  const nextExName = data?.nextExerciseName;
  const completedSetsCount = data?.completedSetsCount ?? 0;
  const totalSetsCount = data?.totalSetsCount ?? 20;

  const isCompact = height < 135 || width < 220;
  const isExpanded = height >= 230;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0c0b13',
        borderRadius: 22,
        padding: isCompact ? 10 : 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: isActive ? 'rgba(255, 159, 77, 0.35)' : 'rgba(165, 153, 255, 0.20)',
      }}
      clickAction="open_app"
      clickActionData={{ action: 'open_app', target: 'Gym' }}
    >
      {/* ── Top Header ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginBottom: isCompact ? 3 : 5,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text={isActive ? "⚡ LIVE" : "ZEN"}
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: isActive ? '#ff9f4d' : '#a599ff',
            }}
          />
          <TextWidget
            text={isActive ? " WORKOUT" : " GYM"}
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#FFFFFF',
              marginRight: 6,
            }}
          />
          <TextWidget
            text={`• ${splitTitle}`}
            style={{
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.60)',
            }}
            maxLines={1}
          />
        </FlexWidget>

        {/* Live Timer or Sets Capsule */}
        <FlexWidget
          style={{
            backgroundColor: isActive ? 'rgba(255, 159, 77, 0.16)' : 'rgba(165, 153, 255, 0.14)',
            borderRadius: 10,
            paddingHorizontal: 7,
            paddingVertical: 2.5,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: isActive ? 'rgba(255, 159, 77, 0.35)' : 'rgba(165, 153, 255, 0.28)',
          }}
        >
          <TextWidget
            text={isActive ? `⏱️ ${duration}` : `🔥 ${completedSetsCount}/${totalSetsCount} Sets`}
            style={{
              fontSize: 10.5,
              fontWeight: 'bold',
              color: isActive ? '#ff9f4d' : '#cba6f7',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* ── Active Workout Mode ── */}
      {isActive && currentEx ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            flex: 1,
            justifyContent: 'space-between',
          }}
        >
          {/* Current Exercise Box */}
          <FlexWidget
            style={{
              backgroundColor: '#171524',
              borderRadius: 13,
              padding: isCompact ? 8 : 10,
              flexDirection: 'column',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.08)',
              marginBottom: 4,
            }}
          >
            {/* Exercise Title + Set Index */}
            <FlexWidget
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <TextWidget
                text={currentEx.name}
                style={{
                  fontSize: isCompact ? 12 : 13.5,
                  fontWeight: 'bold',
                  color: '#FFFFFF',
                }}
                maxLines={1}
              />
              <TextWidget
                text={`Set ${currentSetNumber}/${totalSets}`}
                style={{
                  fontSize: 11,
                  fontWeight: 'bold',
                  color: '#ff9f4d',
                }}
              />
            </FlexWidget>

            {/* Interactive Weight / Reps Controls & DONE SET Button */}
            <FlexWidget
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {/* Weight Adjuster */}
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FlexWidget
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    marginRight: 4,
                  }}
                  clickAction="adjust_workout_weight"
                  clickActionData={{
                    action: 'adjust_workout_weight',
                    exerciseId: currentEx.id,
                    setIndex: currentSetIdx,
                    weightDelta: -2.5,
                  }}
                >
                  <TextWidget
                    text="-2.5"
                    style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.8)' }}
                  />
                </FlexWidget>

                {/* Target Metric Pill */}
                <FlexWidget
                  style={{
                    backgroundColor: 'rgba(165, 153, 255, 0.12)',
                    borderRadius: 7,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    marginRight: 4,
                    borderWidth: 1,
                    borderColor: 'rgba(165, 153, 255, 0.25)',
                  }}
                >
                  <TextWidget
                    text={`${targetWeight} kg × ${targetReps}`}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 'bold',
                      color: '#FFFFFF',
                    }}
                  />
                </FlexWidget>

                <FlexWidget
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                  }}
                  clickAction="adjust_workout_weight"
                  clickActionData={{
                    action: 'adjust_workout_weight',
                    exerciseId: currentEx.id,
                    setIndex: currentSetIdx,
                    weightDelta: 2.5,
                  }}
                >
                  <TextWidget
                    text="+2.5"
                    style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.8)' }}
                  />
                </FlexWidget>
              </FlexWidget>

              {/* DONE SET Action Button */}
              <FlexWidget
                style={{
                  backgroundColor: '#30D158',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
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
                  text="✓ DONE SET"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 'bold',
                    color: '#000000',
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>

          {/* Next Exercise Preview Footer */}
          {!isCompact && (
            <FlexWidget
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 4,
              }}
            >
              <TextWidget
                text={nextExName ? `⏭️ Next: ${nextExName}` : '🏁 Final Exercise of Routine!'}
                style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.50)',
                }}
                maxLines={1}
              />

              <FlexWidget
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
                clickAction="next_workout_exercise"
                clickActionData={{
                  action: 'next_workout_exercise',
                  exerciseId: currentEx.id,
                }}
              >
                <TextWidget
                  text="Skip Ex ❯"
                  style={{ fontSize: 9.5, fontWeight: 'bold', color: '#a599ff' }}
                />
              </FlexWidget>
            </FlexWidget>
          )}
        </FlexWidget>
      ) : (
        /* ── Idle Mode: Start Workout / Today's Routine ── */
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            flex: 1,
            justifyContent: 'space-between',
          }}
        >
          <FlexWidget
            style={{
              backgroundColor: '#151422',
              borderRadius: 13,
              padding: isCompact ? 8 : 10,
              flexDirection: 'column',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.07)',
            }}
          >
            <TextWidget
              text={splitTitle}
              style={{
                fontSize: isCompact ? 12 : 13,
                fontWeight: 'bold',
                color: '#FFFFFF',
                marginBottom: 2,
              }}
            />
            <TextWidget
              text="Target: Hypertrophy & Strength Progressive Overload"
              style={{
                fontSize: 10,
                color: 'rgba(255, 255, 255, 0.50)',
              }}
              maxLines={1}
            />
          </FlexWidget>

          {/* Big START WORKOUT Button */}
          <FlexWidget
            style={{
              backgroundColor: '#ff9f4d',
              borderRadius: 11,
              paddingVertical: isCompact ? 7 : 9,
              alignItems: 'center',
              justifyContent: 'center',
              width: 'match_parent',
              marginTop: 4,
            }}
            clickAction="open_app"
            clickActionData={{ action: 'open_app', target: 'Gym' }}
          >
            <TextWidget
              text="🏋️ START WORKOUT SESSION"
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: '#000000',
                letterSpacing: 0.3,
              }}
            />
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
