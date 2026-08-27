import React from 'react';
import { BookOpen, Calendar as CalendarIcon, Dumbbell, CheckSquare } from 'lucide-react';

export interface CalendarLayersState {
  showClasses: boolean;
  showGCal: boolean;
  showGym: boolean;
  showTasks: boolean;
}

interface CalendarLayerTogglesProps {
  layers: CalendarLayersState;
  onToggleLayer: (key: keyof CalendarLayersState) => void;
  eventCounts: {
    classes: number;
    gcal: number;
    gym: number;
    tasks: number;
  };
}

export const CalendarLayerToggles: React.FC<CalendarLayerTogglesProps> = ({
  layers,
  onToggleLayer,
  eventCounts,
}) => {
  return (
    <div className="calendar-layers-card">
      <div className="layers-card-header">
        <span className="layers-title">CALENDARS & LAYERS</span>
      </div>

      <div className="layers-list">
        {/* 1. Academic Classes */}
        <label className={`layer-toggle-row ${layers.showClasses ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={layers.showClasses}
            onChange={() => onToggleLayer('showClasses')}
            className="layer-native-checkbox"
          />
          <div className="layer-custom-indicator classes">
            <BookOpen size={12} />
          </div>
          <span className="layer-label">Classes & Labs</span>
          <span className="layer-count-pill classes">{eventCounts.classes}</span>
        </label>

        {/* 2. Google Calendar */}
        <label className={`layer-toggle-row ${layers.showGCal ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={layers.showGCal}
            onChange={() => onToggleLayer('showGCal')}
            className="layer-native-checkbox"
          />
          <div className="layer-custom-indicator gcal">
            <CalendarIcon size={12} />
          </div>
          <span className="layer-label">Google Calendar</span>
          <span className="layer-count-pill gcal">{eventCounts.gcal}</span>
        </label>

        {/* 3. Gym & Workouts */}
        <label className={`layer-toggle-row ${layers.showGym ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={layers.showGym}
            onChange={() => onToggleLayer('showGym')}
            className="layer-native-checkbox"
          />
          <div className="layer-custom-indicator gym">
            <Dumbbell size={12} />
          </div>
          <span className="layer-label">Gym & Workouts</span>
          <span className="layer-count-pill gym">{eventCounts.gym}</span>
        </label>

        {/* 4. Priority Tasks */}
        <label className={`layer-toggle-row ${layers.showTasks ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={layers.showTasks}
            onChange={() => onToggleLayer('showTasks')}
            className="layer-native-checkbox"
          />
          <div className="layer-custom-indicator tasks">
            <CheckSquare size={12} />
          </div>
          <span className="layer-label">Priority Tasks</span>
          <span className="layer-count-pill tasks">{eventCounts.tasks}</span>
        </label>
      </div>
    </div>
  );
};
