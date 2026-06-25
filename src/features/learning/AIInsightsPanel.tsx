import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Lightbulb, Plus, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
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

  const addRecommendedTask = async (task: any) => {
    const user = auth.currentUser;
    if (!user) return toast.error('You must be logged in.');
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      await addDoc(collection(db, 'todos'), {
        userId: user.uid,
        title: task.title,
        priority: task.priority || 'medium',
        estimatedMinutes: task.estimatedMinutes || 25,
        status: 'pending',
        date: todayStr,
        createdAt: Date.now(),
      });
      toast.success(`Task "${task.title}" added to today!`);
    } catch {
      toast.error('Failed to add task. Please try again.');
    }
  };

  return (
    <div className="topic-card" style={{ padding: '1.5rem', gridColumn: '1 / -1', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent', borderRadius: 'inherit', background: 'linear-gradient(45deg, rgba(168,85,247,0.3), rgba(16,185,129,0.3)) border-box', WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          <Sparkles size={20} style={{ color: '#a855f7' }} /> Zen AI Insights
          {data && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>Cached · updates every 30 min</span>}
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {data && (
            <button
              className="btn-secondary"
              onClick={() => generate(true)}
              disabled={loading}
              style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
              title="Regenerate insights"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => generate(false)}
            disabled={loading}
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {data ? 'View Latest' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && !loading && (
        <div style={{ color: '#ef4444', fontSize: '0.9rem', padding: '1rem', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div>
            <span>{error}</span>
            <button
              onClick={() => generate(true)}
              style={{ marginLeft: '0.75rem', color: '#a855f7', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          <Sparkles size={32} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <p>Click <strong>Generate Insights</strong> to analyse your last 30 days and receive personalized AI coaching.</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#a855f7' }} />
          <span>Analyzing your productivity footprint...</span>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Insights */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <TrendingUp size={16} /> Key Patterns
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(data.insights || []).filter(Boolean).map((insight, i) => (
                <div key={i} style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  {insight}
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lightbulb size={16} /> Recommended Actions
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(data.recommendations || []).filter(Boolean).map((rec, i) => (
                <div key={i} style={{ background: 'var(--bg-base)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{rec.title}</span>
                    {rec.estimatedMinutes && (
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(168,85,247,0.1)', color: '#a855f7', flexShrink: 0 }}>
                        {rec.estimatedMinutes}m
                      </span>
                    )}
                  </div>
                  {rec.description && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{rec.description}</p>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => addRecommendedTask(rec)}
                    style={{ marginTop: '0.25rem', alignSelf: 'flex-start', padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Plus size={14} /> Add to Today
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
