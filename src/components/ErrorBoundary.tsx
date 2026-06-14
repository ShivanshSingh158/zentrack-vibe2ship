import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error UI — e.g. "Goals Module" */
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[ErrorBoundary] ${this.props.name || 'Module'} crashed:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '3rem 2rem', minHeight: '300px',
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(239, 68, 68, 0.2)', margin: '1rem',
        gap: '1rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {this.props.name ? `${this.props.name} crashed` : 'Something went wrong'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px' }}>
          An unexpected error occurred. Your data is safe — this is just a display issue.
        </p>
        {this.state.error && (
          <code style={{
            fontSize: '0.75rem', color: '#f87171', background: 'rgba(239,68,68,0.08)',
            padding: '0.5rem 1rem', borderRadius: '6px', maxWidth: '500px',
            overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error.message}
          </code>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.6rem 1.4rem', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-gradient)', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.4rem', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
