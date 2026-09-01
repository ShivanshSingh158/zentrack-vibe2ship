/**
 * TodayAgendaWidget.tsx — ZenTrack Android Home Screen Widget (Obsidian Cosmos Theme)
 * Rendered natively via react-native-android-widget RemoteViews
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { TodayAgendaWidgetData } from '../types/widget.types';

interface TodayAgendaWidgetProps {
  data?: TodayAgendaWidgetData | null;
}

export function TodayAgendaWidget({ data }: TodayAgendaWidgetProps) {
  const displayDate = data?.displayDate || 'Today';
  const zenScore = data?.zenScore ?? 85;
  const classes = data?.classes || [];
  const tasks = data?.tasks || [];

  const pendingClasses = classes.filter((c) => c.status === 'pending');
  const nextClass = pendingClasses[0] || classes[0];
  const pendingTasks = tasks.filter((t) => t.status === 'pending').slice(0, 3);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#060509',
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      clickAction="open_app"
      clickActionData={{ action: 'open_app' }}
    >
      {/* ── Top Header: ZenTrack Logo / Date & Zen Score ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginBottom: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text="ZEN"
            style={{
              fontSize: 13,
              fontWeight: 'bold',
              color: '#a599ff',
            }}
          />
          <TextWidget
            text="TRACK"
            style={{
              fontSize: 13,
              fontWeight: 'bold',
              color: '#FFFFFF',
              marginRight: 6,
            }}
          />
          <TextWidget
            text={`•  ${displayDate}`}
            style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.65)',
            }}
          />
        </FlexWidget>

        {/* Zen Score Capsule */}
        <FlexWidget
          style={{
            backgroundColor: 'rgba(165, 153, 255, 0.15)',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 3,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`⚡ ${zenScore}%`}
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#a599ff',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* ── Middle: Next Class or Highlights ── */}
      {nextClass ? (
        <FlexWidget
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 14,
            padding: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <TextWidget
                text={nextClass.time || 'Next Class'}
                style={{
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: '#a599ff',
                  marginRight: 6,
                }}
              />
              {nextClass.room ? (
                <TextWidget
                  text={`[${nextClass.room}]`}
                  style={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.5)',
                  }}
                />
              ) : null}
            </FlexWidget>
            <TextWidget
              text={nextClass.subjectName}
              style={{
                fontSize: 13,
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
                backgroundColor: nextClass.status === 'attended' ? '#34C759' : 'rgba(52, 199, 89, 0.2)',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 5,
                marginRight: 6,
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
                  fontSize: 11,
                  fontWeight: 'bold',
                  color: nextClass.status === 'attended' ? '#FFFFFF' : '#34C759',
                }}
              />
            </FlexWidget>

            <FlexWidget
              style={{
                backgroundColor: nextClass.status === 'missed' ? '#FF453A' : 'rgba(255, 69, 58, 0.2)',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 5,
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
                  fontSize: 11,
                  fontWeight: 'bold',
                  color: nextClass.status === 'missed' ? '#FFFFFF' : '#FF453A',
                }}
              />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      ) : null}

      {/* ── Bottom Section: Top 3 High-Priority Tasks ── */}
      <FlexWidget
        style={{
          flexDirection: 'column',
          width: 'match_parent',
          flex: 1,
          justifyContent: 'flex-start',
        }}
      >
        <TextWidget
          text={`Tasks (${tasks.filter((t) => t.status === 'completed').length}/${tasks.length})`}
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: 'rgba(255, 255, 255, 0.45)',
            marginBottom: 4,
          }}
        />

        {pendingTasks.length > 0 ? (
          pendingTasks.map((t) => (
            <FlexWidget
              key={t.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 4,
                borderBottomWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <FlexWidget
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: '#a599ff',
                    marginRight: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
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
                    fontSize: 12,
                    color: '#FFFFFF',
                  }}
                  maxLines={1}
                />
              </FlexWidget>

              {t.timeSlot ? (
                <TextWidget
                  text={t.timeSlot}
                  style={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.4)',
                  }}
                />
              ) : null}
            </FlexWidget>
          ))
        ) : (
          <FlexWidget
            style={{
              paddingVertical: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TextWidget
              text="✨ All daily targets crushed!"
              style={{
                fontSize: 11,
                color: '#34C759',
                fontWeight: 'bold',
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
