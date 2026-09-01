/**
 * TodayAgendaWidget.tsx — ZenTrack Android Home Screen Widget (Obsidian Cosmos Theme)
 * Adaptive, space-efficient, and dynamically resizable across small, medium, and expanded cells.
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { TodayAgendaWidgetData } from '../types/widget.types';

interface TodayAgendaWidgetProps {
  data?: TodayAgendaWidgetData | null;
  width?: number;
  height?: number;
}

export function TodayAgendaWidget({ data, width = 320, height = 180 }: TodayAgendaWidgetProps) {
  const displayDate = data?.displayDate || 'Today';
  const zenScore = data?.zenScore ?? 85;
  const classes = data?.classes || [];
  const tasks = data?.tasks || [];

  const pendingClasses = classes.filter((c) => c.status === 'pending');
  const nextClass = pendingClasses[0] || classes[0];
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;

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
        borderColor: 'rgba(165, 153, 255, 0.20)',
      }}
      clickAction="open_app"
      clickActionData={{ action: 'open_app' }}
    >
      {/* ── Top Header: Brand, Date & Zen Score Pill ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginBottom: isCompact ? 4 : 6,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text="ZEN"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#a599ff',
            }}
          />
          <TextWidget
            text="TRACK"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#FFFFFF',
              marginRight: 6,
            }}
          />
          <TextWidget
            text={`• ${displayDate}`}
            style={{
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.60)',
            }}
          />
        </FlexWidget>

        {/* Zen Score Glassmorphic Capsule */}
        <FlexWidget
          style={{
            backgroundColor: 'rgba(165, 153, 255, 0.14)',
            borderRadius: 10,
            paddingHorizontal: 7,
            paddingVertical: 2.5,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(165, 153, 255, 0.28)',
          }}
        >
          <TextWidget
            text={`⚡ ${zenScore}%`}
            style={{
              fontSize: 10.5,
              fontWeight: 'bold',
              color: '#cba6f7',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* ── Middle: Active Class Schedule Card ── */}
      {nextClass ? (
        <FlexWidget
          style={{
            backgroundColor: '#161522',
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: isCompact ? 6 : 8,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isCompact ? 0 : 6,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.07)',
          }}
        >
          <FlexWidget style={{ flexDirection: 'column', flex: 1, marginRight: 8 }}>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
              <TextWidget
                text={nextClass.time || 'Class'}
                style={{
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: '#a599ff',
                  marginRight: 5,
                }}
              />
              {nextClass.room ? (
                <TextWidget
                  text={`[${nextClass.room}]`}
                  style={{
                    fontSize: 9.5,
                    color: 'rgba(255, 255, 255, 0.45)',
                  }}
                />
              ) : null}
            </FlexWidget>
            <TextWidget
              text={nextClass.subjectName}
              style={{
                fontSize: isCompact ? 11.5 : 12.5,
                fontWeight: 'bold',
                color: '#FFFFFF',
              }}
              maxLines={1}
            />
          </FlexWidget>

          {/* Present / Absent Buttons */}
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FlexWidget
              style={{
                backgroundColor: nextClass.status === 'attended' ? '#30D158' : 'rgba(48, 209, 88, 0.16)',
                borderRadius: 7,
                paddingHorizontal: 7,
                paddingVertical: 4,
                marginRight: 5,
                borderWidth: 1,
                borderColor: nextClass.status === 'attended' ? '#30D158' : 'rgba(48, 209, 88, 0.35)',
              }}
              clickAction="mark_class_present"
              clickActionData={{
                action: 'mark_class_present',
                subjectId: nextClass.subjectId,
                subjectName: nextClass.subjectName,
                sessionIdx: nextClass.idx,
                type: nextClass.type,
              }}
            >
              <TextWidget
                text="✓ P"
                style={{
                  fontSize: 10.5,
                  fontWeight: 'bold',
                  color: nextClass.status === 'attended' ? '#FFFFFF' : '#30D158',
                }}
              />
            </FlexWidget>

            <FlexWidget
              style={{
                backgroundColor: nextClass.status === 'missed' ? '#FF453A' : 'rgba(255, 69, 58, 0.16)',
                borderRadius: 7,
                paddingHorizontal: 7,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: nextClass.status === 'missed' ? '#FF453A' : 'rgba(255, 69, 58, 0.35)',
              }}
              clickAction="mark_class_absent"
              clickActionData={{
                action: 'mark_class_absent',
                subjectId: nextClass.subjectId,
                subjectName: nextClass.subjectName,
                sessionIdx: nextClass.idx,
                type: nextClass.type,
              }}
            >
              <TextWidget
                text="✕ A"
                style={{
                  fontSize: 10.5,
                  fontWeight: 'bold',
                  color: nextClass.status === 'missed' ? '#FFFFFF' : '#FF453A',
                }}
              />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      ) : null}

      {/* ── Bottom Section: Priority Tasks (Hidden on ultra-compact height) ── */}
      {!isCompact && (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            flex: 1,
            justifyContent: 'flex-start',
          }}
        >
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 3,
            }}
          >
            <TextWidget
              text="UPCOMING TARGETS"
              style={{
                fontSize: 9.5,
                fontWeight: 'bold',
                color: 'rgba(255, 255, 255, 0.40)',
                letterSpacing: 0.5,
              }}
            />
            <TextWidget
              text={`${completedTasksCount}/${tasks.length} Done`}
              style={{
                fontSize: 9.5,
                color: '#a599ff',
                fontWeight: 'bold',
              }}
            />
          </FlexWidget>

          {pendingTasks.length > 0 ? (
            pendingTasks.slice(0, isExpanded ? 4 : 2).map((t) => (
              <FlexWidget
                key={t.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 3,
                  borderBottomWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.04)',
                }}
              >
                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6 }}>
                  {/* Interactive Checkbox Circle */}
                  <FlexWidget
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      borderWidth: 1.5,
                      borderColor: '#a599ff',
                      marginRight: 7,
                      backgroundColor: 'rgba(165, 153, 255, 0.08)',
                    }}
                    clickAction="mark_task_done"
                    clickActionData={{
                      action: 'mark_task_done',
                      taskId: t.id,
                    }}
                  />
                  <TextWidget
                    text={t.title}
                    style={{
                      fontSize: 11.5,
                      color: '#FFFFFF',
                    }}
                    maxLines={1}
                  />
                </FlexWidget>

                {t.timeSlot ? (
                  <TextWidget
                    text={t.timeSlot}
                    style={{
                      fontSize: 9.5,
                      color: 'rgba(255, 255, 255, 0.45)',
                    }}
                  />
                ) : null}
              </FlexWidget>
            ))
          ) : (
            <FlexWidget
              style={{
                paddingVertical: 4,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <TextWidget
                text="✨ All daily targets crushed!"
                style={{
                  fontSize: 11,
                  color: '#30D158',
                  fontWeight: 'bold',
                }}
              />
            </FlexWidget>
          )}
        </FlexWidget>
      )}

      {/* ── Expanded Launcher Row (Only shown when widget is tall 4x4 / 5x3) ── */}
      {isExpanded && (
        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
            paddingTop: 4,
            borderTopWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.06)',
          }}
        >
          <FlexWidget
            style={{
              backgroundColor: '#1c1a2c',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              marginRight: 4,
            }}
            clickAction="open_app"
            clickActionData={{ action: 'open_app', target: 'Sara' }}
          >
            <TextWidget
              text="🎙️ SARA AI"
              style={{ fontSize: 10, fontWeight: 'bold', color: '#a599ff' }}
            />
          </FlexWidget>

          <FlexWidget
            style={{
              backgroundColor: '#1c1a2c',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              marginRight: 4,
            }}
            clickAction="open_app"
            clickActionData={{ action: 'open_app', target: 'Gym' }}
          >
            <TextWidget
              text="🏋️ Gym Log"
              style={{ fontSize: 10, fontWeight: 'bold', color: '#ff9f4d' }}
            />
          </FlexWidget>

          <FlexWidget
            style={{
              backgroundColor: '#1c1a2c',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
            }}
            clickAction="open_app"
            clickActionData={{ action: 'open_app', target: 'Tasks' }}
          >
            <TextWidget
              text="📝 + Task"
              style={{ fontSize: 10, fontWeight: 'bold', color: '#30D158' }}
            />
          </FlexWidget>
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
