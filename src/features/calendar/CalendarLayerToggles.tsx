import React, { useMemo } from 'react';
import { BookOpen, Calendar as CalendarIcon, CheckSquare, Layers, Eye, EyeOff } from 'lucide-react';

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
    <div className="cal-layers-card">
      <div className="cal-layers-header">
        <div className="cal-layers-title-row">
          <div className="cal-layers-title-icon">
            <Layers size={13} strokeWidth={2.4} />
          </div>
          <span className="cal-layers-title">Layers & Feeds</span>
        </div>
        <div className="cal-layers-quick-toggles">
          <button
            type="button"
            className="cal-layers-quick-btn"
            onClick={(e) => handleAllToggle(e, true)}
            title="Turn on all layers"
          >
            <Eye size={11} strokeWidth={2.4} />
            <span>All</span>
          </button>
          <button
            type="button"
            className="cal-layers-quick-btn"
            onClick={(e) => handleAllToggle(e, false)}
            title="Turn off all layers"
          >
            <EyeOff size={11} strokeWidth={2.4} />
            <span>None</span>
          </button>
        </div>
      </div>

      <div className="cal-layers-list">
        {layerItems.map((item) => {
          const isActive = layers[item.key];
          return (
            <button
              key={item.key}
              type="button"
              className={`cal-layer-item ${item.colorClass} ${isActive ? 'active' : 'inactive'}`}
              onClick={() => onToggleLayer(item.key)}
              title={`${isActive ? 'Hide' : 'Show'} ${item.label}`}
              aria-pressed={isActive}
            >
              <div className="cal-layer-left">
                <span className={`cal-layer-icon-box ${item.colorClass}`}>
                  {item.icon}
                </span>
                <div className="cal-layer-meta">
                  <span className="cal-layer-name">{item.label}</span>
                  <span className="cal-layer-sub">{item.subtitle}</span>
                </div>
              </div>

              <div className="cal-layer-right">
                {item.count > 0 && (
                  <span className="cal-layer-count-badge">
                    {item.count}
                  </span>
                )}
                <div className={`cal-layer-switch ${isActive ? 'on' : 'off'}`}>
                  <div className="cal-layer-switch-thumb" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="cal-layers-footer">
        <span className="cal-layers-footer-stat">
          <strong>{activeCount}</strong>/3 Active
        </span>
        <span className="cal-layers-footer-bullet">•</span>
        <span className="cal-layers-footer-stat">
          <strong>{totalEventsCount}</strong> Visible Items
        </span>
      </div>
    </div>
  );
};
