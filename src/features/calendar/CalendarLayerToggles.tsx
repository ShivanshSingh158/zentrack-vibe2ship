import React, { useMemo } from 'react';
import { BookOpen, Calendar as CalendarIcon, CheckSquare, Layers, Eye, EyeOff } from 'lucide-react';
import type { CalendarLayersState } from './CalendarLayerToggles';

export interface CalendarLayersState {
  showClasses: boolean;
  showGCal: boolean;
  showTasks: boolean;
}

interface CalendarLayerTogglesProps {
  layers: CalendarLayersState;
  onToggleLayer: (key: keyof CalendarLayersState) => void;
  onToggleAll?: (show: boolean) => void;
  eventCounts: {
    classes: number;
    gcal: number;
    tasks: number;
  };
}

interface LayerItemDef {
  key: keyof CalendarLayersState;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: 'classes' | 'gcal' | 'tasks';
  count: number;
}

export const CalendarLayerToggles: React.FC<CalendarLayerTogglesProps> = ({
  layers,
  onToggleLayer,
  onToggleAll,
  eventCounts,
}) => {
  const layerItems: LayerItemDef[] = useMemo(() => [
    {
      key: 'showClasses',
      label: 'Classes & Labs',
      subtitle: 'Timetable & Semesters',
      icon: <BookOpen size={14} strokeWidth={2.2} />,
      colorClass: 'classes',
      count: eventCounts.classes,
    },
    {
      key: 'showGCal',
      label: 'Google Calendar',
      subtitle: 'Synced External Events',
      icon: <CalendarIcon size={14} strokeWidth={2.2} />,
      colorClass: 'gcal',
      count: eventCounts.gcal,
    },
    {
      key: 'showTasks',
      label: 'Priority Tasks',
      subtitle: 'Deadlines & Due Dates',
      icon: <CheckSquare size={14} strokeWidth={2.2} />,
      colorClass: 'tasks',
      count: eventCounts.tasks,
    },
  ], [eventCounts]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (layers.showClasses) count++;
    if (layers.showGCal) count++;
    if (layers.showTasks) count++;
    return count;
  }, [layers]);

  const totalEventsCount = useMemo(() => {
    let total = 0;
    if (layers.showClasses) total += eventCounts.classes;
    if (layers.showGCal) total += eventCounts.gcal;
    if (layers.showTasks) total += eventCounts.tasks;
    return total;
  }, [layers, eventCounts]);

  const handleAllToggle = (e: React.MouseEvent, showAll: boolean) => {
    e.stopPropagation();
    if (onToggleAll) {
      onToggleAll(showAll);
    } else {
      (['showClasses', 'showGCal', 'showTasks'] as (keyof CalendarLayersState)[]).forEach(k => {
        if (layers[k] !== showAll) onToggleLayer(k);
      });
    }
  };

  return (
    <div className="calendar-layers-card cal-layers-card">
      <div className="layers-card-header cal-layers-header">
        <div className="layers-header-title-wrap cal-layers-title-row">
          <Layers size={13} className="layers-header-icon" strokeWidth={2.4} />
          <span className="layers-title cal-layers-title">Layers & Feeds</span>
        </div>
        <span className="layers-active-badge">
          {activeCount}/3 Active
        </span>
      </div>

      <div className="layers-list cal-layers-list">
        {layerItems.map((item) => {
          const isActive = layers[item.key];
          return (
            <div
              key={item.key}
              className={`layer-toggle-row cal-layer-item ${item.colorClass} ${isActive ? 'active' : 'inactive'}`}
              onClick={() => onToggleLayer(item.key)}
              title={`${isActive ? 'Hide' : 'Show'} ${item.label}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleLayer(item.key);
                }
              }}
            >
              <div className={`layer-custom-indicator cal-layer-icon-box ${item.colorClass}`}>
                {item.icon}
              </div>

              <div className="layer-text-wrap cal-layer-meta">
                <span className="layer-label cal-layer-name">{item.label}</span>
                <span className="layer-sublabel cal-layer-sub">{item.subtitle}</span>
              </div>

              <div className="layer-meta-right cal-layer-right">
                {item.count > 0 && (
                  <span className={`layer-count-pill cal-layer-count-badge ${item.colorClass}`}>
                    {item.count}
                  </span>
                )}
                <div className={`layer-ios-switch cal-layer-switch ${isActive ? 'active' : ''} ${item.colorClass}`}>
                  <div className="layer-ios-switch-knob cal-layer-switch-thumb" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="layers-footer-card cal-layers-footer">
        <div className="layers-footer-meta">
          <div className="layers-footer-stat">
            <span className="footer-stat-number">{totalEventsCount}</span>
            <span className="footer-stat-label">Events Visible</span>
          </div>

          <div className="layers-footer-actions">
            <button
              type="button"
              className={`layer-quick-action-btn ${activeCount === 3 ? 'active' : ''}`}
              onClick={(e) => handleAllToggle(e, true)}
              title="Show All Layers"
            >
              <Eye size={11} strokeWidth={2.4} />
              <span>All</span>
            </button>
            <button
              type="button"
              className={`layer-quick-action-btn ${activeCount === 0 ? 'active' : ''}`}
              onClick={(e) => handleAllToggle(e, false)}
              title="Hide All Layers"
            >
              <EyeOff size={11} strokeWidth={2.4} />
              <span>None</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
