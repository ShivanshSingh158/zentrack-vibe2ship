import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, CheckCircle2, ChevronRight, Code, Brain, Target, AlertTriangle, Search, Loader2, Clock, X } from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { MockInterviewProblem } from '../../types/index';
import { gradeLeetCodeSolution } from '../../services/gemini';
import { toast } from 'sonner';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const InterviewPrepModule: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [problems, setProblems] = useState<MockInterviewProblem[]>([]);
  const [activeProblem, setActiveProblem] = useState<MockInterviewProblem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Interaction State
  const [revealedHints, setRevealedHints] = useState<number>(0);
  const [code, setCode] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }
    const q = query(collection(db, 'mock_interviews'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MockInterviewProblem));
      p.sort((a, b) => b.createdAt - a.createdAt);
      setProblems(p);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = window.setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      toast.error("Time's up! Submit what you have.");
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timeLeft]);

  const selectProblem = (p: MockInterviewProblem) => {
    setActiveProblem(p);
    setTimeLeft(30 * 60);
    setIsTimerRunning(false);
    setRevealedHints(0);
    setCode('');
    setFeedback(null);
  };

  const handleGradeCode = async () => {
    if (!activeProblem) return;
    if (!code.trim()) return toast.error('Please paste your code first.');
    if (code.trim().length < 20) return toast.error('Code is too short. Please paste your full solution.');

    setIsGrading(true);
    setFeedback(null);

    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await gradeLeetCodeSolution(
          activeProblem.title,
          code,
          activeProblem.optimalTimeComplexity,
          activeProblem.optimalSpaceComplexity
        );

        // Crash-safe field normalization — AI may return wrong types
        const safeFeedback = {
          timeComplexity:  typeof result.timeComplexity === 'string' ? result.timeComplexity : 'Unknown',
          spaceComplexity: typeof result.spaceComplexity === 'string' ? result.spaceComplexity : 'Unknown',
          isOptimal:       result.isOptimal === true,
          bugsFound:       Array.isArray(result.bugsFound) ? result.bugsFound.filter(Boolean) : [],
          feedback:        typeof result.feedback === 'string' ? result.feedback : 'Solution submitted.',
          optimalCode:     typeof result.optimalCode === 'string' ? result.optimalCode : '',
        };

        setFeedback(safeFeedback);

        if (safeFeedback.isOptimal && activeProblem.id) {
          await updateDoc(doc(db, 'mock_interviews', activeProblem.id), { status: 'mastered' });
          toast.success('🎉 Optimal solution! Problem marked as Mastered.');
        } else if (activeProblem.id) {
          await updateDoc(doc(db, 'mock_interviews', activeProblem.id), { status: 'attempted' });
        }
        setIsGrading(false);
        return;
      } catch (e: any) {
        lastErr = e;
        const msg = (e.message || '').toLowerCase();
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('overload');
        if (isRetryable && attempt === 0) {
          toast.info('AI is busy, retrying...');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        break;
      }
    }

    setIsGrading(false);
    toast.error(lastErr?.message || 'Failed to grade. Please try again.');
  };


  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Mock Interviews...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px', overflow: 'hidden' }}>
      {onClose && (
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <X size={16} /> Close Simulator
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0, padding: '1.5rem' }}>
        {/* Left Sidebar: Problem List */}
        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {problems.length === 0 ? (
            <div style={{ padding: '1rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No problems imported. Go to Power Tools to import a LeetCode URL.
            </div>
          ) : (
            problems.map(p => (
              <div 
                key={p.id} 
                onClick={() => selectProblem(p)}
                style={{ 
                  padding: '1rem', 
                  background: activeProblem?.id === p.id ? 'var(--bg-surface)' : 'var(--bg-base)', 
                  border: `1px solid ${activeProblem?.id === p.id ? 'var(--accent-color)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)', 
                  cursor: 'pointer' 
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{p.title}</div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: p.difficulty === 'Hard' ? '#fef2f2' : p.difficulty === 'Medium' ? '#fffbeb' : '#f0fdf4', color: p.difficulty === 'Hard' ? '#ef4444' : p.difficulty === 'Medium' ? '#f59e0b' : '#22c55e' }}>
                    {p.difficulty}
                  </span>
                  {p.status === 'mastered' && <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>Mastered</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Main Area: Simulator */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', background: 'var(--bg-base)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          {!activeProblem ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Brain size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <h2>Select a problem to start</h2>
            </div>
          ) : (
            <>
              {/* Problem Header & Timer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {activeProblem.title}
                  </h2>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Target size={14} /> Pattern: {activeProblem.pattern}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={14} /> Target: {activeProblem.optimalTimeComplexity}</span>
                  </div>
                </div>
                
                {/* Timer Box */}
                <div style={{ background: 'var(--bg-surface)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-lg)', border: `2px solid ${timeLeft < 300 ? '#ef4444' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700, color: timeLeft < 300 ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(timeLeft)}
                  </span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="btn-icon" style={{ background: isTimerRunning ? '#fef2f2' : '#f0fdf4', color: isTimerRunning ? '#ef4444' : '#22c55e' }}>
                      {isTimerRunning ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button onClick={() => { setTimeLeft(30 * 60); setIsTimerRunning(false); }} className="btn-icon">
                      <RotateCcw size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── AI Disclaimer ─────────────────────────────────────────────── */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.65rem 0.9rem',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 'var(--radius-md)',
                marginTop: '0.5rem',
              }}>
                <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '0.73rem', color: 'rgba(245,158,11,0.9)', lineHeight: 1.5, margin: 0 }}>
                  <strong>AI-generated content.</strong> Problem descriptions, hints, and difficulty ratings are generated by Gemini from training data — not fetched live from LeetCode. They may be inaccurate, outdated, or describe a different variant of the problem. Always verify against the official LeetCode problem page before submitting.
                </p>
              </div>

              {/* Hints Section */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {(activeProblem.hints || []).map((hint, idx) => (
                  <div key={idx} style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                      Hint {idx + 1}
                      {revealedHints <= idx && (
                        <button onClick={() => setRevealedHints(idx + 1)} className="btn-secondary" style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>Reveal</button>
                      )}
                    </div>
                    {revealedHints > idx ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{hint}</div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', filter: 'blur(4px)', userSelect: 'none' }}>Hidden text to prevent spoiling the solution for you...</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Code Input */}
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '250px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Your Solution</span>
                  <button onClick={handleGradeCode} disabled={isGrading} className="btn-primary" style={{ padding: '0.4rem 1rem' }}>
                    {isGrading ? <Loader2 size={16} className="animate-spin" /> : <Code size={16} />} 
                    {isGrading ? ' Grading...' : ' Grade My Code'}
                  </button>
                </div>
                <textarea 
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Paste your implementation here (any language)..."
                  style={{ flex: 1, width: '100%', fontFamily: 'monospace', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-primary)', resize: 'none', outline: 'none' }}
                />
              </div>

              {/* AI Feedback */}
              {feedback && (
                <div style={{ marginTop: '1rem', padding: '1.5rem', background: feedback.isOptimal ? '#f0fdf4' : '#fffbeb', borderRadius: 'var(--radius-lg)', border: `1px solid ${feedback.isOptimal ? '#86efac' : '#fde047'}` }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: feedback.isOptimal ? '#166534' : '#854d0e', marginBottom: '1rem' }}>
                    {feedback.isOptimal ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    {feedback.isOptimal ? 'Optimal Solution!' : 'Needs Improvement'}
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.5)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                      <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Time Complexity</strong>
                      <span style={{ color: 'var(--text-primary)' }}>{feedback.timeComplexity}</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.5)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                      <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Space Complexity</strong>
                      <span style={{ color: 'var(--text-primary)' }}>{feedback.spaceComplexity}</span>
                    </div>
                  </div>

                  {feedback.bugsFound && feedback.bugsFound.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <strong style={{ color: '#ef4444', fontSize: '0.9rem' }}>Bugs / Edge Cases Missed:</strong>
                      <ul style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {feedback.bugsFound.map((bug: string, i: number) => <li key={i}>{bug}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                    <strong>Feedback:</strong> {feedback.feedback}
                  </div>

                  {!feedback.isOptimal && (
                    <details style={{ background: 'rgba(255,255,255,0.5)', padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                      <summary style={{ fontWeight: 600, color: '#3b82f6' }}>View Optimal Code</summary>
                      <pre style={{ marginTop: '1rem', padding: '1rem', background: '#1e293b', color: '#e2e8f0', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '0.85rem' }}>
                        {feedback.optimalCode}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
