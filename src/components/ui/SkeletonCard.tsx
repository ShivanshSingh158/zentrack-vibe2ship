import type React from 'react';

interface SkeletonCardProps {
  height?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ height }) => {
  return (
    <div
      className="skeleton"
      style={height ? { height, borderRadius: 'var(--radius-lg)' } : undefined}
    >
      {!height && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="skeleton-line medium"></div>
            <div className="skeleton-line short"></div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
            <div className="skeleton-line short"></div>
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <div className="skeleton-line" style={{ width: '30%' }}></div>
          </div>
        </>
      )}
    </div>
  );
};
