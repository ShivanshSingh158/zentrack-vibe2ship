import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Lightbulb, Plus, Loader2, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { generateAnalyticsInsights } from '../../services/gemini';
import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { toast } from 'sonner';

interface AIInsightsPanelProps {
  userData: any;
}

const CACHE_KEY = 'zen_ai_insights_cache';

const loadCache = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Cache valid for 30 minutes
    if (Date.now() - ts < 30 * 60 * 1000) return data;
    sessionStorage.removeItem(CACHE_KEY);
    return null;
  } catch { return null; }
};

const saveCache = (data: any) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
};

export const AIInsightsPanel: React.FC<AIInsightsPanelProps> = ({ userData }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ insights: string[]; recommendations: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set());

  // Load cached insights on mount
  useEffect(() => {
    const cached = loadCache();
    if (cached) setData(cached);
  }, []);

  const generate = async (force = false) => {
    if (!force) {
      const cached = loadCache();
      if (cached) { setData(cached); return; }
    }

    setLoading(true);
    setError(null);
    try {
      const result = await generateAnalyticsInsights(userData);

      // Validate response structure
      if (!result || !Array.isArray(result.insights) || !Array.isArray(result.recommendations)) {
        throw new Error('AI returned an unexpected format. Please try again.');
      }

      setData(result);
      saveCache(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to generate insights';
      setError(msg);
      toast.error(msg.includes('quota') ? 'AI quota reached. Try again in a few minutes.' : `AI Error: ${msg}`);
    }
    setLoading(false);
  };

  const addRecommendedTask = async (task: any, index: number) => {
    const user = auth.currentUser;
    if (!user) return toast.error('You must be logged in.');
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title: task.title,
        priority: task.priority || 'medium',
        estimatedMinutes: task.estimatedMinutes || 25,
        status: 'pending',
        date: todayStr,
        createdAt: Date.now(),
      });
      setAddedTasks(prev => new Set(prev).add(`${task.title}-${index}`));
      toast.success(`Task "${task.title}" added to today!`);
    } catch {
      toast.error('Failed to add task. Please try again.');
    }
  };

  return (
    <div style={{
      background: 'var(--att-bg-card, #141416)',
      border: '1px solid var(--att-border, #1c1c20)',
      borderRadius: '20px',
      padding: '1.35rem',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 12px 36px rgba(0,0,0,0.45)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #ffffff)', margin: 0 }}>
            <Sparkles size={18} color="#a599ff" />
            S.A.R.A Deep Behavioral Analysis
          </h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8e8e93)', marginTop: '0.2rem' }}>
            Non-obvious productivity correlations & actionable recommendations
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {data && (
            <button
              className="analytics-tab-btn"
              onClick={() => generate(true)}
              disabled={loading}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.76rem' }}
              title="Regenerate insights"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => generate(!data)}
            disabled={loading}
            style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            <span>{data ? 'Analyze Again' : 'Run S.A.R.A Diagnostic'}</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <div style={{
          color: '#ff6961',
          fontSize: '0.82rem',
          padding: '0.85rem 1rem',
          background: 'rgba(255, 105, 97, 0.08)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 105, 97, 0.22)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div>
            <span>{error}</span>
            <button
              onClick={() => generate(true)}
              style={{ marginLeft: '0.75rem', color: '#a599ff', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '2.8rem 1rem',
          color: 'var(--text-muted, #8e8e93)',
          background: 'var(--att-bg-elevated, #18181c)',
          borderRadius: '14px',
          border: '1px dashed var(--att-border, #1c1c20)'
        }}>
          <Sparkles size={36} style={{ margin: '0 auto 0.75rem', color: '#a599ff', opacity: 0.6 }} />
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary, #d1d1d6)', fontWeight: 600 }}>
            Ready to synthesize your multi-agent telemetry footprint.
          </p>
          <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted, #8e8e93)' }}>
            S.A.R.A analyzes cross-domain signals across tasks, gym volume, focus sessions, and attendance.
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1rem',
          color: 'var(--text-muted, #8e8e93)',
          background: 'var(--att-bg-elevated, #18181c)',
          borderRadius: '14px',
          border: '1px solid var(--att-border, #1c1c20)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#a599ff' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #d1d1d6)', fontWeight: 600 }}>
            Synthesizing multi-agent telemetry & cross-variable correlations...
          </span>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Key Patterns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--text-secondary, #d1d1d6)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <TrendingUp size={15} color="#5eda9e" />
              Observed Behavioral Patterns
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {(data.insights || []).filter(Boolean).map((insight, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--att-bg-elevated, #18181c)',
                    padding: '0.9rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--att-border, #1c1c20)',
                    fontSize: '0.82rem',
                    lineHeight: 1.55,
                    color: 'var(--text-secondary, #d1d1d6)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem'
                  }}
                >
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#a599ff',
                    marginTop: '0.45rem',
                    flexShrink: 0
                  }} />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--text-secondary, #d1d1d6)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <Lightbulb size={15} color="#fbbf24" />
              S.A.R.A Calibrated Actions
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {(data.recommendations || []).filter(Boolean).map((rec, i) => {
                const isAdded = addedTasks.has(`${rec.title}-${i}`);
                return (
                  <div
                    key={i}
                    style={{
                      background: 'var(--att-bg-elevated, #18181c)',
                      padding: '0.9rem 1rem',
                      borderRadius: '12px',
                      border: '1px solid var(--att-border, #1c1c20)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                        {rec.title}
                      </span>
                      {rec.estimatedMinutes && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          background: 'rgba(165, 153, 255, 0.12)',
                          color: '#a599ff',
                          border: '1px solid rgba(165, 153, 255, 0.25)',
                          flexShrink: 0
                        }}>
                          {rec.estimatedMinutes}m
                        </span>
                      )}
                    </div>
                    {rec.description && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8e8e93)', margin: 0, lineHeight: 1.45 }}>
                        {rec.description}
                      </p>
                    )}
                    <div style={{ marginTop: '0.2rem' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => addRecommendedTask(rec, i)}
                        disabled={isAdded}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          borderRadius: '8px',
                          background: isAdded ? 'rgba(94, 218, 158, 0.12)' : undefined,
                          borderColor: isAdded ? 'rgba(94, 218, 158, 0.3)' : undefined,
                          color: isAdded ? '#5eda9e' : undefined
                        }}
                      >
                        {isAdded ? <Check size={13} /> : <Plus size={13} />}
                        {isAdded ? 'Added to Today' : 'Add to Today'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
