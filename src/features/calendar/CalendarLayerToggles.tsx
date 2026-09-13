import React, { useMemo } from 'react';
import { BookOpen, Calendar as CalendarIcon, Dumbbell, CheckSquare, Layers, Eye, EyeOff } from 'lucide-react';

export interface CalendarLayersState {
  showClasses: boolean;
  showGCal: boolean;
  showGym: boolean;
  showTasks: boolean;
}

interface CalendarLayerTogglesProps {
  layers: CalendarLayersState;
  onToggleLayer: (key: keyof CalendarLayersState) => void;
  onToggleAll?: (show: boolean) => void;
  eventCounts: {
    classes: number;
    gcal: number;
    gym: number;
    tasks: number;
  };
}

interface LayerItemDef {
  key: keyof CalendarLayersState;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  colorClass: 'classes' | 'gcal' | 'gym' | 'tasks';
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
      key: 'showGym',
      label: 'Gym & Workouts',
      subtitle: 'PPL Splits & Training',
      icon: <Dumbbell size={14} strokeWidth={2.2} />,
      colorClass: 'gym',
      count: eventCounts.gym,
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
    if (layers.showGym) count++;
    if (layers.showTasks) count++;
    return count;
  }, [layers]);

  const totalEventsCount = useMemo(() => {
    let total = 0;
    if (layers.showClasses) total += eventCounts.classes;
    if (layers.showGCal) total += eventCounts.gcal;
    if (layers.showGym) total += eventCounts.gym;
    if (layers.showTasks) total += eventCounts.tasks;
    return total;
  }, [layers, eventCounts]);

  const handleAllToggle = (e: React.MouseEvent, showAll: boolean) => {
    e.stopPropagation();
    if (onToggleAll) {
      onToggleAll(showAll);
    } else {
      (['showClasses', 'showGCal', 'showGym', 'showTasks'] as (keyof CalendarLayersState)[]).forEach(k => {
        if (layers[k] !== showAll) onToggleLayer(k);
      });
    }
  };

  return (
    <div className="calendar-layers-card">
      {/* Top Header */}
      <div className="layers-card-header">
        <div className="layers-header-title-wrap">
          <Layers size={13} className="layers-header-icon" />
          <span className="layers-title">Calendars</span>
        </div>
        <span className="layers-active-badge">
          {activeCount}/4 Active
        </span>
      </div>

      {/* Layer Bars List */}
      <div className="layers-list">
        {layerItems.map(item => {
          const isActive = layers[item.key];
          return (
            <div
              key={item.key}
              className={`layer-toggle-row ${isActive ? 'active' : 'inactive'} ${item.colorClass}`}
              onClick={() => onToggleLayer(item.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  onToggleLayer(item.key);
                }
              }}
              title={`Toggle ${item.label}`}
            >
              <div className={`layer-custom-indicator ${item.colorClass}`}>
                {item.icon}
              </div>

              <div className="layer-text-wrap">
                <span className="layer-label">{item.label}</span>
                <span className="layer-sublabel">{item.subtitle}</span>
              </div>

              <div className="layer-meta-right">
                <span className={`layer-count-pill ${item.colorClass} ${item.count === 0 ? 'zero' : ''}`}>
                  {item.count}
                </span>
                <div className={`layer-ios-switch ${isActive ? 'active' : ''} ${item.colorClass}`}>
                  <div className="layer-ios-switch-knob" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lower Summary & Quick Actions Footer */}
      <div className="layers-footer-card">
        <div className="layers-footer-meta">
          <div className="layers-footer-stat">
            <span className="footer-stat-number">{totalEventsCount}</span>
            <span className="footer-stat-label">Events Visible</span>
          </div>
          <div className="layers-footer-actions">
            <button
              type="button"
              className={`layer-quick-action-btn ${activeCount === 4 ? 'active' : ''}`}
              onClick={(e) => handleAllToggle(e, true)}
              title="Show all calendars"
            >
              <Eye size={11} />
              <span>All</span>
            </button>
            <button
              type="button"
              className={`layer-quick-action-btn ${activeCount === 0 ? 'active' : ''}`}
              onClick={(e) => handleAllToggle(e, false)}
              title="Hide all calendars"
            >
              <EyeOff size={11} />
              <span>None</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
