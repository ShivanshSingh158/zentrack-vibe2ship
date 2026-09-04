/**
 * widgetTaskHandler.tsx — Headless JS Task Handler for Android Home Screen Widget
 * Invoked by the native Android OS for widget placement, resize, and background tap actions.
 */

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { TodayAgendaWidget } from './TodayAgendaWidget';
import { LiveWorkoutWidget } from './LiveWorkoutWidget';
import { 
  getCachedWidgetData, 
  getCachedLiveWorkoutData,
  handleWidgetClickAction,
  buildTodayAgendaData,
  saveCachedWidgetData,
} from '../services/widgetSyncService';
import { formatLocalDateStr } from '../utils/dateUtils';
import { readCoreCacheMulti } from '../utils/coreCache';
import { readAcademicCache } from '../utils/domainCache';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      if (widgetInfo.widgetName === 'LiveWorkout') {
        const workoutData = await getCachedLiveWorkoutData();
        props.renderWidget(
          React.createElement(LiveWorkoutWidget, {
            data: workoutData,
            width: widgetInfo.width,
            height: widgetInfo.height,
          })
        );
      } else {
        const todayStr = formatLocalDateStr(new Date());
        let data = await getCachedWidgetData();

        // Stale or missing data check: if the cached agenda is from yesterday or not initialized,
        // automatically reconstruct today's agenda from the offline-first L1 domain caches!
        if (!data || data.dateStr !== todayStr) {
          try {
            const coreCache = await readCoreCacheMulti();
            const academicCache = await readAcademicCache();
            data = buildTodayAgendaData({
              tasks: coreCache.tasks || [],
              subjects: academicCache.attendance || [],
              attendanceLogs: academicCache.attendanceLogs || [],
              holidays: academicCache.holidays || [],
              zenScore: data?.zenScore ?? 85,
            });
            await saveCachedWidgetData(data);
          } catch {}
        }

        props.renderWidget(
          React.createElement(TodayAgendaWidget, { 
            data, 
            width: widgetInfo.width, 
            height: widgetInfo.height 
          })
        );
      }
      break;
    }

    case 'WIDGET_CLICK': {
      if (props.clickActionData) {
        await handleWidgetClickAction(props.clickActionData as any);
      }
      break;
    }

    default:
      break;
  }
}
