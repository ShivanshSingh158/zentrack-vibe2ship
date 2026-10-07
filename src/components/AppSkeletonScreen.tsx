import React from 'react';
import '../styles/skeleton-screen.css';

interface AppSkeletonScreenProps {
  isPlainTheme?: boolean;
  pathname?: string;
}

// ── 1. Dashboard Skeleton (/home, /, /sara) ──
export const DashboardSkeleton: React.FC<{ isLight?: boolean }> = ({ isLight }) => (
  <div className="sk-module-standalone">
    {/* Header Bar */}
    <div className="sk-header">
      <div className="sk-header-left">
        <div className="sk-block" style={{ width: 260, height: 32, borderRadius: 8 }} />
        <div className="sk-block" style={{ width: 160, height: 14, borderRadius: 6 }} />
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 92, height: 34, borderRadius: 17 }} />
        <div className="sk-block" style={{ width: 36, height: 36, borderRadius: '50%' }} />
      </div>
    </div>

    {/* 3-Column Bento Grid */}
    <div className="sk-bento-grid">
      {/* Column 1: Life Matrix & Hydration */}
      <div className="sk-column">
        <div className="sk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 95, height: 16 }} />
            <div className="sk-block" style={{ width: 65, height: 12 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div className="sk-block" style={{ width: 96, height: 96, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <div className="sk-block" style={{ width: '100%', height: 38, borderRadius: 10 }} />
              <div className="sk-block" style={{ width: '100%', height: 38, borderRadius: 10 }} />
            </div>
          </div>
        </div>

        <div className="sk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 110, height: 16 }} />
            <div className="sk-block" style={{ width: 50, height: 14 }} />
          </div>
          <div className="sk-block" style={{ width: '100%', height: 6, borderRadius: 999 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="sk-block" style={{ flex: 1, height: 28, borderRadius: 8 }} />
            <div className="sk-block" style={{ flex: 1, height: 28, borderRadius: 8 }} />
            <div className="sk-block" style={{ flex: 1, height: 28, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      {/* Column 2: Today's Master Flow */}
      <div className="sk-column">
        <div className="sk-card" style={{ flex: 1, minHeight: 460 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 160, height: 18 }} />
            <div className="sk-block" style={{ width: 50, height: 14 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {[
              { w: '70%', tag: 55 },
              { w: '55%', tag: 70 },
              { w: '80%', tag: 45 },
              { w: '60%', tag: 60 },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0.65rem 0.85rem',
                  borderRadius: 12,
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)',
                  border: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div className="sk-block" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} />
                <div className="sk-block" style={{ width: item.w, height: 14 }} />
                <div className="sk-block" style={{ width: item.tag, height: 18, borderRadius: 6, marginLeft: 'auto' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 10 }}>
            <div className="sk-block" style={{ width: '100%', height: 38, borderRadius: 10 }} />
          </div>
        </div>
      </div>

      {/* Column 3: Attendance Watch & Daily Habits */}
      <div className="sk-column">
        <div className="sk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 125, height: 16 }} />
            <div className="sk-block" style={{ width: 50, height: 12 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['58%', '50%', '62%', '54%'].map((w, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 10,
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)',
                  border: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div className="sk-block" style={{ width: w, height: 13 }} />
                <div className="sk-block" style={{ width: 60, height: 20, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </div>

        <div className="sk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 95, height: 16 }} />
            <div className="sk-block" style={{ width: 55, height: 12 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['65%', '52%'].map((w, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 10,
                  background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)',
                  border: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <div className="sk-block" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                  <div className="sk-block" style={{ width: w, height: 13 }} />
                </div>
                <div className="sk-block" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── 2. Analytics & Telemetry Skeleton (/analytics) ──
export const AnalyticsSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    {/* Header */}
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sk-block" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <div className="sk-block" style={{ width: 230, height: 30, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 90, height: 26, borderRadius: 999 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 230, height: 36, borderRadius: 12 }} />
        <div className="sk-block" style={{ width: 100, height: 36, borderRadius: 12 }} />
        <div className="sk-block" style={{ width: 135, height: 36, borderRadius: 12 }} />
        <div className="sk-block" style={{ width: 115, height: 36, borderRadius: 12 }} />
      </div>
    </div>

    {/* Hero Card: 330px left + 3x2 vitality tiles right */}
    <div className="sk-card" style={{ padding: '1.4rem' }}>
      <div className="sk-analytics-hero">
        {/* ZenScore Ring Box */}
        <div className="sk-card" style={{ padding: '1.25rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="sk-block" style={{ width: 170, height: 170, borderRadius: '50%', margin: '0.5rem 0' }} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: '0.75rem' }}>
            <div className="sk-block" style={{ width: '100%', height: 7, borderRadius: 999 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <div className="sk-block" style={{ width: '100%', height: 16, borderRadius: 4 }} />
              <div className="sk-block" style={{ width: '100%', height: 16, borderRadius: 4 }} />
              <div className="sk-block" style={{ width: '100%', height: 16, borderRadius: 4 }} />
              <div className="sk-block" style={{ width: '100%', height: 16, borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* 6 Vitality KPI Tiles */}
        <div className="sk-vitality-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="sk-card" style={{ padding: '1.15rem', minHeight: 136, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="sk-block" style={{ width: 36, height: 36, borderRadius: 11 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="sk-block" style={{ width: 60, height: 10 }} />
                    <div className="sk-block" style={{ width: 85, height: 14 }} />
                  </div>
                </div>
                <div className="sk-block" style={{ width: 45, height: 20, borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0.4rem 0' }}>
                <div className="sk-block" style={{ width: 50, height: 30 }} />
                <div className="sk-block" style={{ width: 70, height: 18, borderRadius: 6 }} />
              </div>
              <div className="sk-block" style={{ width: '100%', height: 6, borderRadius: 999 }} />
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* 2x3 Telemetry Charts Grid */}
    <div className="sk-charts-grid">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="sk-card" style={{ minHeight: 330, padding: '1.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="sk-block" style={{ width: 180, height: 18 }} />
              <div className="sk-block" style={{ width: 140, height: 12 }} />
            </div>
            <div className="sk-block" style={{ width: 80, height: 14 }} />
          </div>
          <div className="sk-block" style={{ width: '100%', height: 210, borderRadius: 12, marginTop: '1rem' }} />
        </div>
      ))}
    </div>
  </div>
);

// ── 3. Calendar Skeleton (/calendar) ──
export const CalendarSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 150, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 70, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 64, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 140, height: 24, borderRadius: 6 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 220, height: 34, borderRadius: 10 }} />
        <div className="sk-block" style={{ width: 110, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    {/* Calendar Month View Grid */}
    <div className="sk-card" style={{ padding: '1.25rem', gap: '0.75rem' }}>
      <div className="sk-calendar-weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="sk-block" style={{ height: 24, borderRadius: 6 }} />
        ))}
      </div>
      <div className="sk-calendar-grid">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="sk-card" style={{ height: 95, padding: '0.6rem', gap: 6 }}>
            <div className="sk-block" style={{ width: 22, height: 14, borderRadius: 4 }} />
            {i % 3 === 0 && <div className="sk-block" style={{ width: '100%', height: 16, borderRadius: 4 }} />}
            {i % 5 === 0 && <div className="sk-block" style={{ width: '80%', height: 16, borderRadius: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── 4. Habits Architect Skeleton (/habits) ──
export const HabitsSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sk-block" style={{ width: 180, height: 30, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 85, height: 26, borderRadius: 999 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 160, height: 34, borderRadius: 10 }} />
        <div className="sk-block" style={{ width: 115, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    {/* Top 4 KPI Metrics */}
    <div className="sk-4col-grid">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.1rem' }}>
          <div className="sk-block" style={{ width: 80, height: 12 }} />
          <div className="sk-block" style={{ width: 65, height: 28, margin: '0.35rem 0' }} />
          <div className="sk-block" style={{ width: '100%', height: 5, borderRadius: 999 }} />
        </div>
      ))}
    </div>

    {/* Habit Rows */}
    <div className="sk-card" style={{ padding: '1.25rem', gap: '0.85rem' }}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1rem',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <div className="sk-block" style={{ width: 36, height: 36, borderRadius: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="sk-block" style={{ width: 160, height: 16 }} />
              <div className="sk-block" style={{ width: 90, height: 11 }} />
            </div>
          </div>
          {/* 7-day checks bubbles */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <div key={d} className="sk-block" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── 5. Tasks / TodoList Skeleton (/tasks, /todo) ──
export const TasksSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 140, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 260, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 180, height: 34, borderRadius: 10 }} />
        <div className="sk-block" style={{ width: 115, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    {/* Task List Card */}
    <div className="sk-card" style={{ padding: '1.35rem', gap: '0.85rem', minHeight: 560 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem' }}>
        <div className="sk-block" style={{ width: 100, height: 18 }} />
        <div className="sk-block" style={{ width: 60, height: 14 }} />
      </div>
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0.75rem 1rem',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="sk-block" style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }} />
          <div className="sk-block" style={{ width: `${45 + (i * 7) % 35}%`, height: 15 }} />
          <div className="sk-block" style={{ width: 75, height: 20, borderRadius: 6, marginLeft: 'auto' }} />
          <div className="sk-block" style={{ width: 55, height: 20, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  </div>
);

// ── 6. Gym Module Skeleton (/gym) ──
export const GymSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 160, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 140, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 130, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-4col-grid">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.1rem' }}>
          <div className="sk-block" style={{ width: 90, height: 12 }} />
          <div className="sk-block" style={{ width: 70, height: 28, margin: '0.35rem 0' }} />
          <div className="sk-block" style={{ width: '100%', height: 5, borderRadius: 999 }} />
        </div>
      ))}
    </div>

    <div className="sk-3col-grid">
      {[1, 2, 3].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.25rem', minHeight: 320, gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 130, height: 18 }} />
            <div className="sk-block" style={{ width: 60, height: 18, borderRadius: 999 }} />
          </div>
          <div className="sk-block" style={{ width: '100%', height: 180, borderRadius: 10 }} />
          <div className="sk-block" style={{ width: '100%', height: 36, borderRadius: 8, marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  </div>
);

// ── 7. Notes & Knowledge Skeleton (/notes) ──
export const NotesSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 140, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 220, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 110, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-split-layout">
      {/* Notes List Sidebar */}
      <div className="sk-card" style={{ padding: '1rem', gap: '0.75rem' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="sk-card" style={{ padding: '0.85rem', gap: 6 }}>
            <div className="sk-block" style={{ width: '75%', height: 16 }} />
            <div className="sk-block" style={{ width: '90%', height: 12 }} />
            <div className="sk-block" style={{ width: 60, height: 10, marginTop: 4 }} />
          </div>
        ))}
      </div>

      {/* Note Editor Area */}
      <div className="sk-card" style={{ padding: '1.5rem', gap: '1rem' }}>
        <div className="sk-block" style={{ width: '60%', height: 28 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="sk-block" style={{ width: 70, height: 22, borderRadius: 6 }} />
          <div className="sk-block" style={{ width: 60, height: 22, borderRadius: 6 }} />
        </div>
        <div className="sk-block" style={{ width: '100%', height: 1, margin: '0.5rem 0' }} />
        <div className="sk-block" style={{ width: '95%', height: 16 }} />
        <div className="sk-block" style={{ width: '85%', height: 16 }} />
        <div className="sk-block" style={{ width: '90%', height: 16 }} />
        <div className="sk-block" style={{ width: '70%', height: 16 }} />
        <div className="sk-block" style={{ width: '100%', height: 180, borderRadius: 12, marginTop: '1rem' }} />
      </div>
    </div>
  </div>
);

// ── 8. Goals & Objectives Skeleton (/goals) ──
export const GoalsSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 170, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 160, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 110, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-3col-grid">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.35rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 140, height: 18 }} />
            <div className="sk-block" style={{ width: 50, height: 20, borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '0.5rem 0' }}>
            <div className="sk-block" style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div className="sk-block" style={{ width: '80%', height: 14 }} />
              <div className="sk-block" style={{ width: '60%', height: 12 }} />
            </div>
          </div>
          <div className="sk-block" style={{ width: '100%', height: 6, borderRadius: 999 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div className="sk-block" style={{ width: 70, height: 12 }} />
            <div className="sk-block" style={{ width: 80, height: 12 }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── 9. Learning Pathways Skeleton (/learning) ──
export const LearningSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 190, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 180, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 120, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-split-layout">
      {/* Course Tree */}
      <div className="sk-card" style={{ padding: '1.25rem', gap: '0.85rem' }}>
        <div className="sk-block" style={{ width: 130, height: 16 }} />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="sk-card" style={{ padding: '0.85rem', gap: 6 }}>
            <div className="sk-block" style={{ width: '80%', height: 15 }} />
            <div className="sk-block" style={{ width: '50%', height: 12 }} />
          </div>
        ))}
      </div>

      {/* Video & Notes Theater */}
      <div className="sk-card" style={{ padding: '1.35rem', gap: '1rem' }}>
        <div className="sk-block" style={{ width: '100%', height: 320, borderRadius: 14 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sk-block" style={{ width: 220, height: 22 }} />
          <div className="sk-block" style={{ width: 90, height: 26, borderRadius: 999 }} />
        </div>
        <div className="sk-block" style={{ width: '90%', height: 14 }} />
        <div className="sk-block" style={{ width: '75%', height: 14 }} />
      </div>
    </div>
  </div>
);

// ── 10. Academic Attendance Skeleton (/attendance) ──
export const AttendanceSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 200, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 95, height: 26, borderRadius: 999 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 125, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    {/* Top 3 Summary Metrics */}
    <div className="sk-3col-grid">
      {[1, 2, 3].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.25rem' }}>
          <div className="sk-block" style={{ width: 110, height: 14 }} />
          <div className="sk-block" style={{ width: 70, height: 32, margin: '0.4rem 0' }} />
          <div className="sk-block" style={{ width: '100%', height: 6, borderRadius: 999 }} />
        </div>
      ))}
    </div>

    {/* Subjects Grid */}
    <div className="sk-3col-grid">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.35rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 140, height: 18 }} />
            <div className="sk-block" style={{ width: 55, height: 20, borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="sk-block" style={{ width: 70, height: 70, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div className="sk-block" style={{ width: '90%', height: 14 }} />
              <div className="sk-block" style={{ width: '60%', height: 12 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <div className="sk-block" style={{ flex: 1, height: 34, borderRadius: 8 }} />
            <div className="sk-block" style={{ flex: 1, height: 34, borderRadius: 8 }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── 11. Grade Calculator Skeleton (/grades) ──
export const GradesSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div className="sk-block" style={{ width: 220, height: 32, borderRadius: 8 }} />
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 120, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-card" style={{ padding: '1.5rem', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="sk-block" style={{ width: 160, height: 22 }} />
        <div className="sk-block" style={{ width: 80, height: 32, borderRadius: 8 }} />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="sk-block" style={{ flex: 2, height: 38, borderRadius: 8 }} />
          <div className="sk-block" style={{ flex: 1, height: 38, borderRadius: 8 }} />
          <div className="sk-block" style={{ flex: 1, height: 38, borderRadius: 8 }} />
        </div>
      ))}
    </div>
  </div>
);

// ── 12. Job Tracker Skeleton (/jobs) ──
export const JobsSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sk-block" style={{ width: 180, height: 32, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 200, height: 32, borderRadius: 10 }} />
        </div>
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 130, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-kanban-grid">
      {['Wishlist', 'Applied', 'Interviewing', 'Offers'].map(col => (
        <div key={col} className="sk-card" style={{ padding: '1.1rem', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sk-block" style={{ width: 80, height: 16 }} />
            <div className="sk-block" style={{ width: 24, height: 18, borderRadius: 999 }} />
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="sk-card" style={{ padding: '0.9rem', gap: 8 }}>
              <div className="sk-block" style={{ width: '85%', height: 16 }} />
              <div className="sk-block" style={{ width: '60%', height: 12 }} />
              <div className="sk-block" style={{ width: 70, height: 18, borderRadius: 6, marginTop: 4 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ── 13. Weekly Review Skeleton (/review) ──
export const WeeklyReviewSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div className="sk-block" style={{ width: 240, height: 32, borderRadius: 8 }} />
      </div>
      <div className="sk-header-right">
        <div className="sk-block" style={{ width: 140, height: 34, borderRadius: 10 }} />
      </div>
    </div>

    <div className="sk-charts-grid">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.4rem', gap: '1rem', minHeight: 220 }}>
          <div className="sk-block" style={{ width: 160, height: 18 }} />
          <div className="sk-block" style={{ width: '100%', height: 80, borderRadius: 10 }} />
        </div>
      ))}
    </div>
  </div>
);

// ── 14. Integrations Skeleton (/integrations) ──
export const IntegrationsSkeleton: React.FC = () => (
  <div className="sk-module-standalone">
    <div className="sk-header">
      <div className="sk-header-left">
        <div className="sk-block" style={{ width: 200, height: 32, borderRadius: 8 }} />
      </div>
    </div>

    <div className="sk-3col-grid">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="sk-card" style={{ padding: '1.35rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="sk-block" style={{ width: 38, height: 38, borderRadius: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="sk-block" style={{ width: 90, height: 16 }} />
                <div className="sk-block" style={{ width: 60, height: 11 }} />
              </div>
            </div>
            <div className="sk-block" style={{ width: 36, height: 20, borderRadius: 999 }} />
          </div>
          <div className="sk-block" style={{ width: '100%', height: 14 }} />
        </div>
      ))}
    </div>
  </div>
);

// ── Route Matcher Function ──
export const getModuleSkeletonForRoute = (route: string, isLight?: boolean) => {
  const path = (route || '').split('?')[0].split('#')[0].toLowerCase();

  switch (path) {
    case '/analytics':
      return <AnalyticsSkeleton />;
    case '/calendar':
      return <CalendarSkeleton />;
    case '/habits':
      return <HabitsSkeleton />;
    case '/tasks':
    case '/todo':
      return <TasksSkeleton />;
    case '/gym':
      return <GymSkeleton />;
    case '/notes':
      return <NotesSkeleton />;
    case '/goals':
      return <GoalsSkeleton />;
    case '/learning':
      return <LearningSkeleton />;
    case '/attendance':
      return <AttendanceSkeleton />;
    case '/grades':
      return <GradesSkeleton />;
    case '/jobs':
      return <JobsSkeleton />;
    case '/review':
      return <WeeklyReviewSkeleton />;
    case '/integrations':
      return <IntegrationsSkeleton />;
    case '/home':
    case '/':
    case '/sara':
    default:
      return <DashboardSkeleton isLight={isLight} />;
  }
};

// ── Standalone Module Skeleton for Suspense Fallbacks ──
export const ModuleSkeleton: React.FC<{ route?: string; isPlainTheme?: boolean }> = ({ route, isPlainTheme }) => {
  const activeRoute = route || (typeof window !== 'undefined' ? window.location.pathname : '/home');
  const isLight = isPlainTheme ?? (
    typeof document !== 'undefined' &&
    (document.documentElement?.classList.contains('theme-light') ||
     document.documentElement?.classList.contains('theme-plain') ||
     document.body?.classList.contains('theme-light') ||
     document.body?.classList.contains('theme-plain'))
  );

  return getModuleSkeletonForRoute(activeRoute, isLight);
};

// ── Root App Skeleton Screen (Sidebar + Dynamic Route Content) ──
export const AppSkeletonScreen: React.FC<AppSkeletonScreenProps> = ({ isPlainTheme, pathname }) => {
  const isLight = isPlainTheme ?? (
    typeof document !== 'undefined' &&
    (document.documentElement?.classList.contains('theme-light') ||
     document.documentElement?.classList.contains('theme-plain') ||
     document.body?.classList.contains('theme-light') ||
     document.body?.classList.contains('theme-plain') ||
     localStorage.getItem('zen_theme') === 'light' ||
     localStorage.getItem('zen_theme') === 'plain' ||
     localStorage.getItem('zen_theme') === null)
  );

  const activePath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/home');

  return (
    <div className={`app-skeleton-root ${isLight ? 'theme-light' : 'theme-dark'}`}>
      {/* ── Left Sidebar Skeleton ── */}
      <aside className="sk-sidebar">
        {/* User Profile */}
        <div className="sk-sidebar-user">
          <div className="sk-block" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div className="sk-block" style={{ width: '65%', height: 12 }} />
            <div className="sk-block" style={{ width: '45%', height: 9 }} />
          </div>
        </div>

        {/* Quick Add / Search */}
        <div className="sk-block" style={{ width: '100%', height: 32, borderRadius: 8 }} />

        {/* Navigation Items */}
        <div className="sk-sidebar-nav">
          <div className="sk-sidebar-nav-item" style={{ background: isLight ? 'rgba(124, 58, 237, 0.08)' : 'rgba(165, 153, 255, 0.12)' }}>
            <div className="sk-block" style={{ width: 16, height: 16, borderRadius: 4 }} />
            <div className="sk-block" style={{ width: '50%', height: 13 }} />
            <div className="sk-block" style={{ width: 20, height: 14, borderRadius: 10, marginLeft: 'auto' }} />
          </div>
          {[
            { w: '40%' },
            { w: '55%' },
            { w: '48%' },
            { w: '52%' },
            { w: '42%' },
            { w: '60%' },
            { w: '45%' },
            { w: '50%' },
          ].map((item, idx) => (
            <div key={idx} className="sk-sidebar-nav-item">
              <div className="sk-block" style={{ width: 16, height: 16, borderRadius: 4 }} />
              <div className="sk-block" style={{ width: item.w, height: 12 }} />
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.06)' }}>
          <div className="sk-block" style={{ width: 30, height: 30, borderRadius: 8 }} />
          <div className="sk-block" style={{ width: 30, height: 30, borderRadius: 8 }} />
        </div>
      </aside>

      {/* ── Main Content Skeleton (Tailored Exact Module Layout) ── */}
      <main className="sk-main">
        {getModuleSkeletonForRoute(activePath, isLight)}
      </main>
    </div>
  );
};

