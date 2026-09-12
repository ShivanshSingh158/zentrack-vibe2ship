import React from 'react';
import '../styles/skeleton-screen.css';

interface AppSkeletonScreenProps {
  isPlainTheme?: boolean;
}

export const AppSkeletonScreen: React.FC<AppSkeletonScreenProps> = ({ isPlainTheme }) => {
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

      {/* ── Main Content Skeleton ── */}
      <main className="sk-main">
        {/* Header Bar */}
        <div className="sk-header">
          <div className="sk-header-left">
            <div className="sk-block" style={{ width: 260, height: 30, borderRadius: 8 }} />
            <div className="sk-block" style={{ width: 150, height: 14, borderRadius: 6 }} />
          </div>
          <div className="sk-header-right">
            <div className="sk-block" style={{ width: 88, height: 32, borderRadius: 16 }} />
            <div className="sk-block" style={{ width: 34, height: 34, borderRadius: '50%' }} />
          </div>
        </div>

        {/* 3-Column Bento Grid */}
        <div className="sk-bento-grid">
          {/* Column 1: Life Matrix & Hydration */}
          <div className="sk-column">
            {/* Life Matrix Card */}
            <div className="sk-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sk-block" style={{ width: 90, height: 16 }} />
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

            {/* Hydration Card */}
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

              {/* Task rows */}
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

              {/* Add task inline bar */}
              <div style={{ marginTop: 'auto', paddingTop: 10 }}>
                <div className="sk-block" style={{ width: '100%', height: 38, borderRadius: 10 }} />
              </div>
            </div>
          </div>

          {/* Column 3: Attendance Watch & Daily Habits */}
          <div className="sk-column">
            {/* Attendance Watch */}
            <div className="sk-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sk-block" style={{ width: 125, height: 16 }} />
                <div className="sk-block" style={{ width: 50, height: 12 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { w: '58%', pct: 62 },
                  { w: '50%', pct: 62 },
                  { w: '62%', pct: 62 },
                  { w: '54%', pct: 62 },
                ].map((s, idx) => (
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
                    <div className="sk-block" style={{ width: s.w, height: 13 }} />
                    <div className="sk-block" style={{ width: s.pct, height: 20, borderRadius: 6 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Daily Habits */}
            <div className="sk-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sk-block" style={{ width: 95, height: 16 }} />
                <div className="sk-block" style={{ width: 55, height: 12 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { w: '65%' },
                  { w: '52%' },
                ].map((h, idx) => (
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
                      <div className="sk-block" style={{ width: h.w, height: 13 }} />
                    </div>
                    <div className="sk-block" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
