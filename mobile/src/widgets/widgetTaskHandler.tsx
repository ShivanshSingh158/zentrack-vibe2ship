/**
 * widgetTaskHandler.tsx — Headless JS Task Handler for Android Home Screen Widget
 * Invoked by the native Android OS for widget placement, resize, and background tap actions.
 */

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { TodayAgendaWidget } from './TodayAgendaWidget';
import { 
  getCachedWidgetData, 
  handleWidgetClickAction 
} from '../services/widgetSyncService';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getCachedWidgetData();
      props.renderWidget(
        React.createElement(TodayAgendaWidget, { 
          data, 
          width: widgetInfo.width, 
          height: widgetInfo.height 
        })
      );
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
