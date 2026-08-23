/**
 * HabitsWebWidget.tsx — Web twin of mobile Habits section
 * Shows today's habits list with completion toggles and streak info
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';

interface HabitsWebWidgetProps {
  habits: any[];
  habitLogs: any[];
  todayStr: string;
  onToggleHabit?: (habitId: string, done: boolean) => void;
}

export function HabitsWebWidget({
  habits,
  habitLogs,
  todayStr,
  onToggleHabit,
}: HabitsWebWidgetProps) {
  const navigate = useNavigate();

  const todayLogMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of habitLogs) {
      if (log.date === todayStr) {
        map.set(log.habitId, (map.get(log.habitId) || 0) + (log.count ?? 1));
      }
    }
    return map;
  }, [habitLogs, todayStr]);

  const activeHabits = useMemo(
    () => habits.filter((h: any) => !h.archived).slice(0, 6),
    [habits]
  );

  return (
    <div className="habits-card">
      {/* Header */}
      <div className="habits-header">
        <div className="habits-header-left">
          <Zap size={13} color="#f59e0b" />
          <span className="habits-section-label">Daily Habits</span>
        </div>
        <button className="habits-view-link" onClick={() => navigate('/habits')}>
          View All →
        </button>
      </div>

      {/* Habit rows */}
      <div className="habits-list">
        {activeHabits.length === 0 && (
          <div className="habits-empty">No habits set up yet</div>
        )}
        {activeHabits.map((habit: any, i: number) => {
          const count = todayLogMap.get(habit.id) || 0;
          const target = habit.targetCount || 1;
          const done = count >= target;

          return (
            <motion.div
              key={habit.id}
              className={`habit-row${done ? ' habit-row--done' : ''}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
            >
              {/* Emoji + name */}
              <div className="habit-row-left">
                <span className="habit-emoji">{habit.emoji || '⚡'}</span>
                <span
                  className="habit-name"
                  style={{
                    color: done ? '#636366' : '#f2f2f7',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {habit.name}
                </span>
              </div>

              {/* Toggle button */}
              <motion.button
                className={`habit-toggle-btn${done ? ' habit-toggle-btn--done' : ''}`}
                onClick={() => onToggleHabit?.(habit.id, done)}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.08 }}
                aria-label={done ? 'Mark incomplete' : 'Mark complete'}
              >
                {done ? '✓' : '+'}
              </motion.button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
