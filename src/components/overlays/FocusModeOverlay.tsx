import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { Play, Pause, RotateCcw, X, Zap, CloudRain, CloudDrizzle, Trees, Waves, VolumeX, Check } from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { LearningSubTask } from '../../types/index';
import { playPopSound } from '../../utils/sound';

export const FocusModeOverlay = () => {
  const { state, focusMode, toggleFocusMode, pauseTimer, resumeTimer, resetTimer, dismissTimer, formatTime, setAmbientSound, setDuration } = usePomodoroContext();
  const [subTasks, setSubTasks] = useState<LearningSubTask[]>([]);
  const [sessionType, setSessionType] = useState<string>('Focus');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioSources = {
    'none': '',
    'rain': 'https://assets.mixkit.co/active_storage/sfx/2391/2391-preview.mp3',
    'soft-rain': 'youtube:Jvgx5HHJ0qw',
    'forest': 'youtube:xNN7iTA57jM',
    'waves': 'https://www.soundjay.com/nature/sounds/ocean-wave-1.mp3'
  };

  const isYoutube = state.ambientSound !== 'none' && audioSources[state.ambientSound]?.startsWith('youtube:');

  useEffect(() => {
    if (audioRef.current) {
      if (state.ambientSound !== 'none' && !isYoutube) {
        audioRef.current.src = audioSources[state.ambientSound];
        if (state.ambientSound === 'soft-rain') {
          audioRef.current.volume = 0.3;
        } else {
          audioRef.current.volume = 1.0;
        }
        audioRef.current.loop = true;
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [state.ambientSound, focusMode]);

  useEffect(() => {
    if (!focusMode && audioRef.current) {
      audioRef.current.pause();
    } else if (focusMode && audioRef.current && state.ambientSound !== 'none' && !isYoutube) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  }, [focusMode, state.ambientSound, isYoutube]);

  useEffect(() => {
    if (!focusMode || !state.learningTopicId) {
      setSubTasks([]);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'learning_topics', state.learningTopicId), (docSnap) => {
      if (docSnap.exists()) {
        setSubTasks(docSnap.data().subTasks || []);
      }
    });
    return () => unsubscribe();
  }, [focusMode, state.learningTopicId]);

  const toggleSubTask = async (subTaskId: string) => {
    if (!state.learningTopicId) return;
    let newStatus = false;
    const updated = subTasks.map(st => {
      if (st.id === subTaskId) {
        newStatus = st.status !== 'completed';
        return { ...st, isCompleted: newStatus };
      }
      return st;
    });
    if (newStatus) playPopSound();
    try {
      await updateDoc(doc(db, 'learning_topics', state.learningTopicId), { subTasks: updated });
    } catch (error) {
      console.error('Failed to update subtask', error);
    }
  };

  // Track the initial timeLeft when a session starts — so progress is always
  // relative to the actual session duration (not DEFAULT_DURATION of 25min).
  const sessionDurationRef = useRef<number>(25 * 60);
  const prevTaskIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    // When a new task starts (taskId changes from null or changes), snapshot the current timeLeft
    if (state.taskId && state.taskId !== prevTaskIdRef.current) {
      sessionDurationRef.current = state.timeLeft;
      prevTaskIdRef.current = state.taskId;
    }
    if (!state.taskId) prevTaskIdRef.current = null;
  });

  if (!focusMode) return null;

  let bgGradient = 'radial-gradient(ellipse at center, rgba(10, 10, 14, 0.97) 0%, rgba(5, 5, 8, 1) 100%)';
  if (state.ambientSound === 'rain') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)';
  if (state.ambientSound === 'soft-rain') bgGradient = 'radial-gradient(ellipse at center, rgba(16, 25, 36, 0.95) 0%, rgba(3, 8, 16, 1) 100%)';
  if (state.ambientSound === 'forest') bgGradient = 'radial-gradient(ellipse at center, rgba(20, 35, 20, 0.95) 0%, rgba(5, 15, 5, 1) 100%)';
  if (state.ambientSound === 'waves') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 35, 45, 0.95) 0%, rgba(5, 15, 25, 1) 100%)';

  return (
    <div className="focus-overlay hide-on-mobile" style={{ background: bgGradient, transition: 'background 1s ease' }}>
      <audio ref={audioRef} />
      {isYoutube && focusMode && (
        <iframe
          width="0"
          height="0"
          src={`https://www.youtube.com/embed/${audioSources[state.ambientSound].split(':')[1]}?autoplay=1&loop=1&playlist=${audioSources[state.ambientSound].split(':')[1]}`}
          frameBorder="0"
          allow="autoplay"
          style={{ display: 'none' }}
        ></iframe>
      )}
      
      <div className="focus-content" style={{ width: '100%', maxWidth: '800px', height: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Top Header */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div className="focus-brand">
            <Zap size={24} />
            <span style={{ fontSize: '0.9rem' }}>Deep Focus</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Ambient Sound Controls */}
            <div className="ambient-controls" style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.4rem', borderRadius: '99px', marginRight: '1rem' }}>
              <button className={`ambient-btn ${state.ambientSound === 'none' ? 'active' : ''}`} onClick={() => setAmbientSound('none')} title="No Sound"><VolumeX size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'rain' ? 'active' : ''}`} onClick={() => setAmbientSound('rain')} title="Heavy Rain"><CloudRain size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'soft-rain' ? 'active' : ''}`} onClick={() => setAmbientSound('soft-rain')} title="Soft Rain"><CloudDrizzle size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'forest' ? 'active' : ''}`} onClick={() => setAmbientSound('forest')} title="Forest"><Trees size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'waves' ? 'active' : ''}`} onClick={() => setAmbientSound('waves')} title="Waves"><Waves size={16} /></button>
            </div>

            <button className="focus-close" onClick={toggleFocusMode} title="Exit Focus Mode" style={{ position: 'static' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {state.taskId ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem', flex: 1, justifyContent: 'center', width: '100%' }}>
            
            {/* Session Type Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.3rem', background: 'rgba(255,255,255,0.03)', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
              {(['Focus', 'Short Break', 'Long Break']).map(tab => {
                const isActive = (sessionType === tab);
                return (
                  <button
                    key={tab}
                    onClick={() => { setSessionType(tab); if(tab === 'Focus') setDuration(25); else if(tab === 'Short Break') setDuration(5); else setDuration(15); }}
                    style={{
                      padding: '0.3rem 0.875rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                      background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                      color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                      border: isActive ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab}
                  </button>
                )
              })}
            </div>

            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)' }}>
              {sessionType} MODE
            </div>

            {/* Timer Ring */}
            <div className="focus-timer-ring" style={{
              position: 'relative',
              width: '280px',
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
              boxShadow: state.isRunning ? '0 0 40px rgba(167,139,250,0.1)' : 'none',
              transition: 'all 0.5s ease'
            }}>
              <svg width="280" height="280" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                <circle cx="140" cy="140" r="136" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                <circle 
                  cx="140" cy="140" r="136" 
                  fill="none" 
                  stroke="#a78bfa" 
                  strokeWidth="4" 
                  strokeLinecap="round"
                  strokeDasharray="150 60"
                  style={{
                    transformOrigin: 'center',
                    animation: state.isRunning ? 'spin 10s linear infinite' : 'none',
                    opacity: state.isRunning ? 1 : 0.3,
                    transition: 'opacity 0.5s ease',
                    filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.5))'
                  }}
                />
              </svg>
              <div className="focus-timer-text" style={{ fontSize: '5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative', zIndex: 10 }}>
                {!state.isRunning && (
                  <button className="btn-icon" onClick={() => setDuration(Math.max(1, Math.floor(state.timeLeft / 60) - 5))} style={{ fontSize: '1.5rem', fontWeight: 700, opacity: 0.5, color: 'white', padding: '0.5rem' }}>-5</button>
                )}
                <span style={{
                  fontFamily: "'Instrument Serif', serif", 
                  fontWeight: 400, 
                  fontSize: '4rem',
                  color: 'white',
                  letterSpacing: '-0.04em',
                  transition: 'all 0.5s ease'
                }}>{formatTime(state.timeLeft)}</span>
                {!state.isRunning && (
                  <button className="btn-icon" onClick={() => setDuration(Math.floor(state.timeLeft / 60) + 5)} style={{ fontSize: '1.5rem', fontWeight: 700, opacity: 0.5, color: 'white', padding: '0.5rem' }}>+5</button>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="focus-controls" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={resetTimer} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', color: 'rgba(255,255,255,0.6)', padding: '0.75rem 2rem', fontSize: '0.9rem', cursor: 'pointer' }} title="Reset Timer">
                Reset
              </button>
              <button
                onClick={() => state.isRunning ? pauseTimer() : resumeTimer()}
                style={{ background: 'linear-gradient(135deg, #a78bfa, #60a5fa)', borderRadius: '999px', border: 'none', color: 'white', padding: '0.75rem 2rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}
              >
                {state.isRunning ? 'Pause' : 'Start'}
              </button>
              <button onClick={() => { dismissTimer(); toggleFocusMode(); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', color: 'rgba(255,255,255,0.6)', padding: '0.75rem 2rem', fontSize: '0.9rem', cursor: 'pointer' }} title="Dismiss & Exit">
                Skip
              </button>
            </div>

            {/* Task Info & Subtasks */}
            <div style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginTop: '2rem' }}>
              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>CURRENTLY FOCUSING ON</div>
              <div className="focus-task-name" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '2rem', fontWeight: 400, color: 'white', letterSpacing: '-0.02em', textAlign: 'center' }}>{state.taskText}</div>
              
              {subTasks.length > 0 && (
                <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {subTasks.map(st => (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', opacity: st.status === 'completed' ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                      <button 
                        className={`todo-checkbox ${st.status === 'completed' ? 'checked' : ''}`}
                        onClick={() => toggleSubTask(st.id)}
                        style={{ width: '20px', height: '20px' }}
                      >
                        {st.status === 'completed' && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span style={{ fontSize: '1rem', color: st.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: st.status === 'completed' ? 'line-through' : 'none' }}>
                        {st.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="focus-empty" style={{ margin: 'auto' }}>
            <p style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Ready to focus?</p>
            <p style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Start a Pomodoro from your To-Do list or Learning path.</p>
            <button className="btn-secondary" onClick={toggleFocusMode} style={{ marginTop: '2rem', margin: '2rem auto 0 auto' }}>Return to App</button>
          </div>
        )}
      </div>
    </div>
  );
};
