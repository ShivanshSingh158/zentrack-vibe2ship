import React from 'react';
import { Wrench } from 'lucide-react';
import { GradeCalculatorModule } from '../academic/GradeCalculatorModule';

export const ToolsHubModule: React.FC = () => {
  return (
    <div className="learning-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="learning-header" style={{ flexShrink: 0, marginBottom: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wrench size={24} className="logo-icon" /> Power Tools
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Focused utilities that still belong in the current product surface.
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '6rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
        <div style={{ padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <GradeCalculatorModule />
        </div>
      </div>
    </div>
  );
};
